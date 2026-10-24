import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { allowedOrigin, config } from "../config.js";
import { log } from "../log.js";
import { SnapshotArgs, SnapshotStore } from "../lang/snapshots.js";
import { DocumentConflict, DocumentStore } from "../lang/documents.js";
import { assistantTurn, sourceSummary } from "../lang/follow-up.js";
import { RunRecorder, writeRunEvents } from "../run/recorder.js";

import { askStocks, editStocks } from "../stocks/lang/ask.js";
import { PROJECT_ROOT } from "../paths.js";

const Request = z.object({ prompt: z.string().min(1).max(500), model: z.string().optional(), timeZone: z.string().max(100).refine(zone => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } }).optional() });
const FollowUpRequest = Request.extend({ baseRevision: z.number().int().positive(), targets: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_/-]*$/)).max(30).optional() });

export function stocksLangRoutes(options: { store?: SnapshotStore; documents?: DocumentStore; ask?: typeof askStocks; edit?: typeof editStocks } = {}) {
  const cfg = config();
  const store = options.store ?? new SnapshotStore(path.resolve(fileURLToPath(PROJECT_ROOT), cfg.DATA_DIR, "openui-snapshots"));
  const documents = options.documents ?? new DocumentStore(path.resolve(fileURLToPath(PROJECT_ROOT), cfg.DATA_DIR, "openui-documents"));
  const ask = options.ask ?? askStocks;
  const edit = options.edit ?? editStocks;
  const STAGES = ["summarize", "search", "data", "compose", "validate"] as const;
  const app = new Hono();
  app.use("/lang/*", cors({ origin: allowedOrigin }));
  app.use("/tools/*", cors({ origin: allowedOrigin }));
  app.post("/tools/:name", async c => {
    if (c.req.param("name") !== "stocks_dataset") return c.json({ error: "unknown_tool" }, 404);
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
  app.post("/lang/stocks/stream", async c => {
    const parsed = Request.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request", issues: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, 400);
    const { prompt, model, timeZone } = parsed.data;
    return streamSSE(c, async stream => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      let chain = Promise.resolve();
      const send = (event: string, data: unknown) => { chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })); };
      const observer = new RunRecorder(prompt, model ?? cfg.OPENROUTER_MODEL, { stages: [...STAGES], summaryModel: cfg.OPENROUTER_SUMMARY_MODEL, pack: "stocks", generation: "openui" });
      try {
        const result = await ask({ prompt, ...(model ? { model } : {}), ...(timeZone ? { timeZone } : {}) }, store, {
          progress: progress => { observer.step(progress); send("activity", progress); },
          usage: usage => observer.usage(usage), content: report => observer.content(report),
          data: snapshot => send("data", snapshot), skeleton: skeleton => send("skeleton", skeleton),
          program: text => send("openui", { text }), issue: issue => send("issue", { issue }),
        }, observer.runId);
        const sources = sourceSummary(result.dataset.values);
        await documents.put({ id: result.run, revision: 1, program: result.program, snapshot: result.snapshot, ticker: result.ticker, resolvedRequest: prompt, model: result.model,
          parts: [...result.parts], subject: { ...result.subject }, questions: result.questions.map(q => ({ id: q.id, text: q.text, lookup: { ...q.lookup } })),
          turns: [{ role: "user", content: prompt }, assistantTurn(result.ticker, prompt, [...result.parts], sources)], sourceSummary: sources, updatedAt: new Date().toISOString() }, 0, abort.signal);
        send("done", { generation: "openui", run: result.run, program: result.program, issues: result.issues, holes: result.holes, timings: result.timings, model: result.model, ticker: result.ticker, document: { id: result.run, revision: 1 } });
        observer.finish({ status: "ok", retries: result.holes.repairRounds, nodes: result.nodes });
        log.info("stocks openui streamed", { run: result.run, ticker: result.ticker, model: result.model, nodes: result.nodes, issues: result.issues.length, holes: result.holes, writerCalled: result.writerCalled, ms: result.timings.validate });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        observer.finish({ status: "failed", retries: 0, reason: message });
        log.error("stocks openui failed", { message });
        send("failure", { error: "generation_failed", message });
      }
      try { await chain; }
      finally { if (cfg.TRACE_ENABLED) await writeRunEvents(cfg.TRACE_DIR, observer.recorded()); }
    });
  });
  app.post("/lang/stocks/:documentId/follow-up", async c => {
    const parsed = FollowUpRequest.safeParse(await c.req.json().catch(() => null));
    const identity = SnapshotArgs.safeParse({ run: c.req.param("documentId") });
    if (!parsed.success || !identity.success) return c.json({ error: "bad_request" }, 400);
    const id = identity.data.run;
    const release = await documents.lock(id);
    let document;
    try { document = await documents.get(id); }
    catch (error) { release(); throw error; }
    if (!document) { release(); return c.json({ error: "document_not_found" }, 404); }
    if (!document.questions) { release(); return c.json({ error: "legacy_document", message: "This screen was generated before question planning. Generate a new screen." }, 410); }
    if (document.revision !== parsed.data.baseRevision) { release(); return c.json({ error: "revision_conflict", document: { id, revision: document.revision } }, 409); }
    if (parsed.data.targets?.some(target => !document.parts.some(part => target === part.id || target.startsWith(`${part.id}_`) || target.startsWith(`${part.id}/`)))) { release(); return c.json({ error: "unknown_target" }, 400); }
    const previous = document;
    return streamSSE(c, async stream => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      let chain = Promise.resolve();
      // A follow-up is recorded as its own run, tagged with the document and base revision.
      const observer = new RunRecorder(parsed.data.prompt, parsed.data.model ?? cfg.OPENROUTER_MODEL, { stages: [...STAGES], summaryModel: cfg.OPENROUTER_SUMMARY_MODEL, pack: "stocks", generation: "openui", followUp: { document: id, baseRevision: previous.revision } });
      const send = (event: string, data: unknown) => {
        if (event === "activity") observer.step(data as Parameters<RunRecorder["step"]>[0]);
        chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }));
      };
      try {
        const result = await edit(previous, parsed.data, store, { progress: progress => send("activity", progress), usage: usage => observer.usage(usage), content: report => observer.content(report) }, undefined);
        abort.signal.throwIfAborted();
        const revision = previous.revision + 1;
        const sources = sourceSummary(result.dataset.values);
        await documents.put({ ...previous, revision, program: result.program, snapshot: result.snapshot, parts: [...result.parts], ticker: result.ticker, model: result.model,
          resolvedRequest: result.request, sourceSummary: sources, updatedAt: new Date().toISOString(), questions: result.questions.map(q => ({ id: q.id, text: q.text, lookup: { ...q.lookup } })),
          turns: [...previous.turns, { role: "user", content: parsed.data.prompt }, assistantTurn(result.ticker, result.request, [...result.parts], sources)] }, previous.revision, abort.signal);
        send("data", result.snapshot);
        send("openui", { text: result.program, replace: true });
        send("done", { generation: "openui", run: result.run, program: result.program, issues: result.issues, holes: result.holes, timings: result.timings, model: result.model, ticker: result.ticker, document: { id, revision } });
        observer.content({ stage: "validate", id: "follow-up", label: "Follow-up merge", format: "json", data: { questions: result.plan.questions, restyle: result.plan.restyle, removed: result.removed, revision } });
        observer.finish({ status: "ok", retries: result.holes.repairRounds, nodes: result.nodes });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        observer.finish({ status: "failed", retries: 0, reason: message });
        send("failure", { error: error instanceof DocumentConflict ? "revision_conflict" : "generation_failed", message });
      } finally {
        release();
        try { await chain; }
        finally { if (cfg.TRACE_ENABLED) await writeRunEvents(cfg.TRACE_DIR, observer.recorded()); }
      }
    });
  });
  return app;
}
