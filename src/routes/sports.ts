import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { allowedOrigin, config } from "../config.js";
import { log } from "../log.js";
import { SnapshotArgs, SnapshotStore } from "../lang/snapshots.js";
import { PROJECT_ROOT } from "../paths.js";
import { RunRecorder, writeRunEvents } from "../run/recorder.js";
import { askSports } from "../sports/ask.js";

const Request = z.object({ prompt: z.string().min(1).max(500) });
const STAGES = ["summarize", "search", "data", "compose", "validate"] as const;

/**
 * POST /lang/sports/stream — a new sports screen as SSE: `activity`, `data` (the dataset
 * snapshot), `skeleton`, `openui` (program text), `issue`, then `done` or `failure`.
 * POST /tools/sports_dataset — a run's snapshot, for the program's `Query("sports_dataset", …)`.
 * No follow-ups yet: `done` carries no document, so clients start a new screen for each prompt.
 */
export function sportsRoutes(options: { store?: SnapshotStore; ask?: typeof askSports } = {}) {
  const cfg = config();
  const store = options.store ?? new SnapshotStore(path.resolve(fileURLToPath(PROJECT_ROOT), cfg.DATA_DIR, "openui-snapshots"));
  const ask = options.ask ?? askSports;
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
    const { prompt } = parsed.data;
    log.info("sports openui started", { prompt, origin: c.req.header("origin") ?? null });
    return streamSSE(c, async stream => {
      let chain = Promise.resolve();
      const send = (event: string, data: unknown) => { chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })); };
      const observer = new RunRecorder(prompt, cfg.SPORTS_MODEL, { stages: [...STAGES], summaryModel: cfg.SPORTS_PLAN_MODEL, pack: "sports", generation: "openui" });
      try {
        const result = await ask({ prompt }, store, {
          progress: progress => { observer.step(progress); send("activity", progress); },
          usage: usage => observer.usage(usage), content: report => observer.content(report),
          data: snapshot => send("data", snapshot), skeleton: skeleton => send("skeleton", skeleton),
          program: text => send("openui", { text }), issue: issue => send("issue", { issue }),
        }, observer.runId);
        send("done", { generation: "openui", run: result.run, program: result.program, issues: result.issues, holes: result.holes, timings: result.timings, model: result.model });
        observer.finish({ status: "ok", retries: result.holes.repairRounds, nodes: result.nodes });
        log.info("sports openui streamed", { run: result.run, subject: result.plan.subject.name, questions: result.plan.questions.length, nodes: result.nodes, issues: result.issues.length, holes: result.holes, ms: result.timings.validate });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        observer.finish({ status: "failed", retries: 0, reason: message });
        log.error("sports openui failed", { message });
        send("failure", { error: "generation_failed", message });
      }
      try { await chain; }
      finally { if (cfg.TRACE_ENABLED) await writeRunEvents(cfg.TRACE_DIR, observer.recorded()); }
    });
  });
  return app;
}
