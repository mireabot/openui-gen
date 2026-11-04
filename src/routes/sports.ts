import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { z } from "zod";
import { allowedOrigin, config } from "../config.js";
import { log } from "../log.js";
import { SnapshotArgs, SnapshotStore } from "../lang/snapshots.js";
import { PROJECT_ROOT } from "../paths.js";
import { RunRecorder, writeRunEvents } from "../run/recorder.js";
import { askSports, editSports } from "../sports/ask.js";
import { DocumentConflict, DocumentStore, nextRevision, saveGeneration, type SportsDocument } from "../sports/documents.js";

const TimeZone = z.string().max(100).refine(zone => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } });
const Request = z.object({ prompt: z.string().min(1).max(500), timeZone: TimeZone.optional() });
const FollowUpRequest = Request.extend({ baseRevision: z.number().int().positive(), targets: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_/-]*$/)).max(30).optional() });
const SaveRequest = z.object({ revision: z.number().int().positive() });
const STAGES = ["summarize", "search", "data", "compose", "validate"] as const;

/**
 * POST /lang/sports/stream — a new sports screen as SSE: `activity`, `data` (the dataset
 * snapshot), `skeleton`, `openui` (program text), `issue`, then `done` with `document {id, revision: 1}`
 * once the screen is saved, or `failure`.
 * POST /lang/sports/:documentId/follow-up — `{prompt, baseRevision, targets?}` edits a saved screen:
 * `activity` while it works, then `data`, `openui {text, replace: true}` (the whole program) and
 * `done` with the next revision, all after the revision is committed. 404 for an unknown document,
 * 409 when `baseRevision` is not the current one. A failed follow-up commits nothing.
 * Both also send `usage` per model or search call: its stage, model, tokens, cost and time.
 * POST /lang/sports/:documentId/save — `{revision}` keeps a copy of that revision under
 * DATA_DIR/saved-generations: the program, dataset, plan and prompts. 404 unknown, 409 not current.
 * GET /lang/sports/runs, /lang/sports/runs/:documentId — saved screens to replay with no model call; off in production.
 * POST /tools/sports_dataset — a run's snapshot, for the program's `Query("sports_dataset", …)`.
 */
const finishedStatus = (issues: readonly { readonly code: string }[]) => issues.some(issue => issue.code === "part-incomplete") ? "partial" as const : "ok" as const;

export function sportsRoutes(options: { store?: SnapshotStore; documents?: DocumentStore; savedDirectory?: string; ask?: typeof askSports; edit?: typeof editSports } = {}) {
  const cfg = config();
  const dataDir = path.resolve(fileURLToPath(PROJECT_ROOT), cfg.DATA_DIR);
  const store = options.store ?? new SnapshotStore(path.join(dataDir, "openui-snapshots"));
  const documents = options.documents ?? new DocumentStore(path.join(dataDir, "openui-documents"));
  const savedDirectory = options.savedDirectory ?? path.join(dataDir, "saved-generations");
  const ask = options.ask ?? askSports;
  const edit = options.edit ?? editSports;
  /** Commits a revision. In debug mode each one also gets its own file, which a later follow-up can't overwrite. */
  const commit = async (document: SportsDocument, baseRevision: number, signal: AbortSignal) => {
    await documents.put(document, baseRevision, signal);
    if (cfg.GENERATION_MODE !== "debug") return;
    await saveGeneration(savedDirectory, document).catch(error => log.warn("debug run not saved", { document: document.id, detail: (error as Error).message }));
  };
  const app = new Hono();
  app.use("/lang/*", cors({ origin: allowedOrigin }));
  app.use("/tools/*", cors({ origin: allowedOrigin }));

  app.post("/tools/:name", async c => {
    if (c.req.param("name") !== "sports_dataset") return c.json({ error: "unknown_tool" }, 404);
    const parsed = SnapshotArgs.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    try {
      const snapshot = await store.get(parsed.data);
      if (!snapshot) return c.json({ error: "snapshot_not_found", message: "The dataset snapshot is unavailable. Generate a new screen." }, 404);
      return c.body(JSON.stringify(snapshot.result), 200, { "Content-Type": "application/json" });
    } catch {
      return c.json({ error: "snapshot_unavailable" }, 500);
    }
  });

  app.post("/lang/sports/stream", async c => {
    const parsed = Request.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request", issues: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, 400);
    const { prompt, timeZone } = parsed.data;
    log.info("sports openui started", { prompt, timeZone: timeZone ?? null, origin: c.req.header("origin") ?? null });
    return streamSSE(c, async stream => {
      const { send, abort, flush } = channel(stream);
      const observer = new RunRecorder(prompt, cfg.SPORTS_MODEL, { stages: [...STAGES], summaryModel: cfg.SPORTS_PLAN_MODEL, pack: "sports", generation: "openui" });
      try {
        const result = await ask({ prompt, timeZone }, store, {
          progress: progress => { observer.step(progress); send("activity", progress); },
          usage: usage => { observer.usage(usage); send("usage", usage); }, content: report => observer.content(report),
          data: snapshot => send("data", snapshot), skeleton: skeleton => send("skeleton", skeleton),
          program: text => send("openui", { text }), issue: issue => send("issue", { issue }),
        }, observer.runId);
        await commit(nextRevision(null, result.run, prompt, result), 0, abort.signal);
        send("done", { generation: "openui", run: result.run, program: result.program, issues: result.issues, holes: result.holes, timings: result.timings, model: result.model, document: { id: result.run, revision: 1 } });
        observer.finish({ status: finishedStatus(result.issues), retries: result.holes.repairRounds, nodes: result.nodes });
        log.info("sports openui streamed", { run: result.run, subject: result.plan.subject.name, questions: result.plan.questions.length, nodes: result.nodes, issues: result.issues.length, holes: result.holes, ms: result.timings.validate });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        observer.finish({ status: "failed", retries: 0, reason: message });
        log.error("sports openui failed", { message });
        send("failure", { error: "generation_failed", message });
      }
      try { await flush(); }
      finally { if (cfg.TRACE_ENABLED) await writeRunEvents(cfg.TRACE_DIR, observer.recorded()); }
    });
  });

  // Replay for the preview: a saved screen with no model call. Prompts and data are private, so never in production.
  const replayable = process.env.NODE_ENV !== "production";
  app.get("/lang/sports/runs", async c => replayable ? c.json({ runs: await documents.list() }) : c.json({ error: "not_found" }, 404));
  app.get("/lang/sports/runs/:documentId", async c => {
    const identity = SnapshotArgs.safeParse({ run: c.req.param("documentId") });
    if (!replayable || !identity.success) return c.json({ error: "not_found" }, 404);
    const document = await documents.get(identity.data.run);
    if (!document) return c.json({ error: "document_not_found" }, 404);
    return c.json({ prompt: document.turns.find(turn => turn.role === "user")?.content ?? "", program: document.program, snapshot: document.snapshot });
  });

  app.post("/lang/sports/:documentId/save", async c => {
    const parsed = SaveRequest.safeParse(await c.req.json().catch(() => null));
    const identity = SnapshotArgs.safeParse({ run: c.req.param("documentId") });
    if (!parsed.success || !identity.success) return c.json({ error: "bad_request" }, 400);
    const document = await documents.get(identity.data.run);
    if (!document) return c.json({ error: "document_not_found" }, 404);
    if (document.revision !== parsed.data.revision) return c.json({ error: "revision_conflict", document: { id: document.id, revision: document.revision } }, 409);
    const file = await saveGeneration(savedDirectory, document);
    log.info("sports generation saved", { document: document.id, revision: document.revision, file });
    return c.json({ saved: { id: document.id, revision: document.revision, file } });
  });

  app.post("/lang/sports/:documentId/follow-up", async c => {
    const parsed = FollowUpRequest.safeParse(await c.req.json().catch(() => null));
    const identity = SnapshotArgs.safeParse({ run: c.req.param("documentId") });
    if (!parsed.success || !identity.success) return c.json({ error: "bad_request" }, 400);
    const id = identity.data.run;
    const { prompt, baseRevision, targets, timeZone } = parsed.data;
    // Held until this follow-up commits or fails, so a concurrent one sees the new revision and gets 409.
    const release = await documents.lock(id);
    let previous;
    try { previous = await documents.get(id); }
    catch (error) { release(); throw error; }
    if (!previous) { release(); return c.json({ error: "document_not_found" }, 404); }
    if (previous.revision !== baseRevision) { release(); return c.json({ error: "revision_conflict", document: { id, revision: previous.revision } }, 409); }
    const parts = previous.parts;
    if (targets?.some(target => !parts.some(part => target === part.id || target.startsWith(`${part.id}_`) || target.startsWith(`${part.id}/`)))) { release(); return c.json({ error: "unknown_target" }, 400); }
    const saved = previous;
    log.info("sports follow-up started", { document: id, baseRevision, prompt });
    return streamSSE(c, async stream => {
      const { send, abort, flush } = channel(stream);
      // A follow-up is recorded as its own run, tagged with the document and base revision.
      const observer = new RunRecorder(prompt, cfg.SPORTS_MODEL, { stages: [...STAGES], summaryModel: cfg.SPORTS_PLAN_MODEL, pack: "sports", generation: "openui", followUp: { document: id, baseRevision } });
      try {
        // Content stays staged: the client keeps its screen until the revision is committed.
        const result = await edit(saved, { prompt, targets, timeZone }, store, {
          progress: progress => { observer.step(progress); send("activity", progress); },
          usage: usage => { observer.usage(usage); send("usage", usage); }, content: report => observer.content(report),
        }, observer.runId);
        abort.signal.throwIfAborted();
        const revision = saved.revision + 1;
        await commit(nextRevision(saved, id, prompt, result), saved.revision, abort.signal);
        send("data", result.snapshot);
        send("openui", { text: result.program, replace: true });
        send("done", { generation: "openui", run: result.run, program: result.program, issues: result.issues, holes: result.holes, timings: result.timings, model: result.model, document: { id, revision } });
        observer.content({ stage: "validate", id: "follow-up", label: "Follow-up merge", format: "json", data: { questions: result.followUp.questions.map(q => `${q.id} ${q.change}`), removed: result.followUp.removed, parts: result.screen.parts.map(p => `${p.id} ${p.origin.kind}`), revision } });
        observer.finish({ status: finishedStatus(result.issues), retries: result.holes.repairRounds, nodes: result.nodes });
        log.info("sports follow-up committed", { document: id, revision, run: result.run, questions: result.followUp.questions.map(q => `${q.id} ${q.change}`), removed: result.followUp.removed, parts: result.screen.parts.map(p => `${p.id} ${p.origin.kind}`) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        observer.finish({ status: "failed", retries: 0, reason: message });
        log.error("sports follow-up failed", { document: id, message });
        send("failure", { error: error instanceof DocumentConflict ? "revision_conflict" : "generation_failed", message });
      } finally {
        release();
        try { await flush(); }
        finally { if (cfg.TRACE_ENABLED) await writeRunEvents(cfg.TRACE_DIR, observer.recorded()); }
      }
    });
  });
  return app;
}

/** Ordered SSE writes, and an abort signal for a client that went away before the commit. */
function channel(stream: SSEStreamingApi) {
  const abort = new AbortController();
  stream.onAbort(() => abort.abort());
  let chain = Promise.resolve();
  const send = (event: string, data: unknown) => { chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })); };
  return { send, abort, flush: () => chain };
}
