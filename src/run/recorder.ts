import { config, type Config } from "../config.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WebSource } from "../research/web-research.js";
import { log } from "../log.js";

/**
 * One generation's record: progress steps, model usage with cost, inspectable artifacts and the
 * outcome. Written as a JSON trace when TRACE_ENABLED.
 */

/** Public, factual generation milestones. Never expose partial JSON or model reasoning. */
export interface ScreenProgress {
  readonly stage: "summarize" | "decide" | "compose" | "validate" | "judge";
  readonly status: "started" | "completed" | "retrying" | "working";
  readonly detail: string;
  readonly attempt?: number;
  readonly characters?: number;
}

export type Stage = ScreenProgress["stage"] | "search" | "data" | "retrieve";
export type Engine = "llm" | "jev";
export interface RunProgress extends Omit<ScreenProgress, "stage"> {
  readonly stage: Stage;
  readonly sources?: readonly WebSource[];
  /** The search step: Parallel web searches and ESPN lookups in this run, and every source they read. */
  readonly searches?: number;
  readonly lookups?: number;
  readonly sourceCount?: number;
}

export interface RunStarted {
  readonly type: "run.started";
  readonly runId: string;
  readonly prompt: string;
  readonly model: string;
  readonly startedAt: string;
  /** Where the Claude stages ran. A debug run's $0 is plan usage, not a free run. */
  readonly mode: Config["GENERATION_MODE"];
  readonly reasoningEffort?: Config["CODEX_EFFORT"];
  readonly dataSource: "mixed" | "fotmob";
  readonly stages?: readonly Stage[];
  readonly summaryModel?: string;
  /** A domain pack's run (`sports`): its own steps and data sources. Absent for the general generator. */
  readonly pack?: string;
  readonly generation?: "current" | "openui";
  /** A follow-up edit of a saved OpenUI document: which one, and the revision it starts from. */
  readonly followUp?: { readonly document: string; readonly baseRevision: number };
}

export interface RunStep extends RunProgress {
  readonly type: "step";
  readonly runId: string;
  readonly elapsedMs: number;
}

export interface ReferenceMapping {
  readonly section: number;
  readonly content: string;
  readonly referenceId: string;
  readonly name: string;
  readonly recipe?: string;
}

/** Inspectable stage artifacts for the local observer; never part of iOS SSE. */
export interface ContentReport {
  readonly stage: Stage;
  readonly id: string;
  readonly label: string;
  readonly format: "json" | "text";
  readonly data: unknown;
  readonly attempt?: number;
  readonly references?: readonly ReferenceMapping[];
  readonly sources?: readonly WebSource[];
}

export interface RunContent extends ContentReport {
  readonly type: "content";
  readonly runId: string;
  readonly elapsedMs: number;
}

export interface RunUsage {
  readonly type: "usage";
  readonly runId: string;
  readonly stage: Stage;
  readonly engine: Engine;
  readonly model: string;
  readonly attempt?: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens?: number;
  readonly costUSD: number;
  readonly ms: number;
}

export interface RunCost {
  readonly llm: number;
  readonly jev: number;
  readonly total: number;
}

export interface RunFinished {
  readonly type: "run.finished";
  readonly runId: string;
  /** "partial": it finished, but the writer's part was dropped and a default stands in for it. */
  readonly status: "ok" | "partial" | "failed";
  readonly totalMs: number;
  readonly costUSD: RunCost;
  readonly retries: number;
  readonly nodes?: number;
  readonly reason?: string;
  readonly tracePath?: string;
}

export type RunEvent = RunStarted | RunStep | RunContent | RunUsage | RunFinished;

/** The usage a generation reports, before the recorder stamps it with a run id. */
export type UsageReport = Omit<RunUsage, "type" | "runId">;

export function addCost(usages: readonly Pick<RunUsage, "engine" | "costUSD">[]): RunCost {
  const llm = usages.filter((u) => u.engine === "llm").reduce((n, u) => n + u.costUSD, 0);
  const jev = usages.filter((u) => u.engine === "jev").reduce((n, u) => n + u.costUSD, 0);
  return { llm, jev, total: llm + jev };
}

/**
 * One run's handle: stamps events with its id and elapsed time, and keeps the usage it
 * saw so the finished event's cost is the sum of exactly what was reported live.
 */
export class RunRecorder {
  readonly runId = randomUUID();
  private readonly t0 = performance.now();
  private readonly usages: RunUsage[] = [];
  private readonly events: RunEvent[] = [];

  constructor(prompt: string, model: string, metadata: Pick<RunStarted, "stages" | "summaryModel" | "pack" | "generation" | "followUp"> = {}) {
    const cfg = config();
    this.events.push({ type: "run.started", runId: this.runId, prompt, model, startedAt: new Date().toISOString(), mode: cfg.GENERATION_MODE, dataSource: cfg.DATA_SOURCE,
      ...(cfg.GENERATION_MODE === "codex" ? { reasoningEffort: cfg.CODEX_EFFORT } : {}), ...metadata });
  }

  recorded(): readonly RunEvent[] {
    return [...this.events];
  }

  elapsed(): number {
    return Math.round(performance.now() - this.t0);
  }

  step(progress: RunProgress): void {
    this.events.push({ type: "step", runId: this.runId, elapsedMs: this.elapsed(), ...progress });
  }

  usage(report: UsageReport): void {
    const event: RunUsage = { type: "usage", runId: this.runId, ...report };
    this.usages.push(event);
    this.events.push(event);
  }

  content(report: ContentReport): void {
    // Snapshot the artifact: later parser/calculation mutations must not alter history.
    this.events.push({ type: "content", runId: this.runId, elapsedMs: this.elapsed(), ...structuredClone(report) });
  }

  finish(fields: Omit<RunFinished, "type" | "runId" | "totalMs" | "costUSD">): void {
    this.events.push({ type: "run.finished", runId: this.runId, totalMs: this.elapsed(),
      costUSD: addCost(this.usages), ...fields });
  }
}

/** A run's events as one trace file. */
export async function writeRunEvents(dir: string, events: readonly RunEvent[]): Promise<void> {
  const start = events.find((event) => event.type === "run.started");
  if (!start) return;
  const stamp = start.startedAt.replace(/[:.]/g, "-").replace("Z", "");
  const file = `${stamp}-${start.runId}.json`;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, file), `${JSON.stringify({ events }, null, 2)}\n`, "utf8");
  } catch (error) {
    log.warn("trace not written", { file, message: error instanceof Error ? error.message : String(error) });
  }
}
