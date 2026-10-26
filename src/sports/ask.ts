import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { compileScreen, type CompiledScreen, type ProgramIssue, type ProgramWriter } from "../lang/compiler.js";
import type { DatasetSnapshot, SnapshotStore } from "../lang/snapshots.js";
import { programTree, type programSkeleton } from "../lang/tree.js";
import { anthropicWriter } from "../llm/anthropic.js";
import type { CompletionSender } from "../llm/structured-completion.js";
import type { ContentReport, RunProgress, UsageReport } from "../run/recorder.js";
import { designDataset } from "./dataset.js";
import { clubDirectory, clubRecord, isTeam } from "./espn.js";
import { planSports, type SportsPlan } from "./plan.js";
import { answerSports, type ResearchDeps } from "./research.js";
import { SPORTS_SCREEN } from "./screen.js";

/**
 * The sports pipeline: Haiku understands the request and plans the questions; every question is
 * answered at once (ESPN feeds, or parallel searches Sonnet reads); Opus designs the dataset and
 * writes the screen, which the compiler admits, covers and falls back on.
 */

export interface SportsRequest { readonly prompt: string }
export interface SportsHooks {
  readonly progress?: (value: RunProgress) => void;
  readonly usage?: (value: UsageReport) => void;
  readonly content?: (value: ContentReport) => void;
  readonly data?: (value: DatasetSnapshot) => void;
  readonly skeleton?: (value: ReturnType<typeof programSkeleton>) => void;
  readonly program?: (text: string) => void;
  readonly issue?: (value: ProgramIssue) => void;
}
/** Injectable stages for offline checks. */
export interface SportsDeps extends ResearchDeps {
  readonly plan?: (prompt: string) => Promise<SportsPlan>;
  readonly schema?: CompletionSender;
  readonly write?: ProgramWriter;
  readonly now?: Date;
}
export interface SportsResult {
  readonly run: string;
  readonly model: string;
  readonly plan: SportsPlan;
  readonly snapshot: DatasetSnapshot;
  readonly screen: CompiledScreen;
  readonly program: string;
  readonly issues: readonly ProgramIssue[];
  readonly holes: { readonly total: number; readonly filled: number; readonly fallback: number; readonly repairRounds: number };
  readonly timings: Readonly<Record<string, number>>;
  readonly nodes: number;
}

export async function askSports(request: SportsRequest, store: SnapshotStore, hooks: SportsHooks = {}, run: string = randomUUID(), deps: SportsDeps = {}): Promise<SportsResult> {
  const cfg = config();
  const now = deps.now ?? new Date();
  const clock = timer();
  const usage = (stage: UsageReport["stage"]) => ({ model, usage: u, attempt, ms }: { model: string; usage: { promptTokens: number; completionTokens: number; costUSD: number | undefined }; attempt: number; ms: number }) =>
    hooks.usage?.({ stage, engine: "llm", model, attempt, inputTokens: u.promptTokens, outputTokens: u.completionTokens, costUSD: u.costUSD ?? 0, ms });

  hooks.progress?.({ stage: "summarize", status: "started", detail: "Understanding the request" });
  const plan = await (deps.plan ?? (prompt => planSports(prompt, now, { usage: usage("summarize") }, deps.espn)))(request.prompt);
  clock.mark("plan");
  hooks.content?.({ stage: "summarize", id: "plan", label: `Plan (${cfg.SPORTS_PLAN_MODEL})`, format: "json", data: plan });
  hooks.progress?.({ stage: "summarize", status: "completed", detail: `${plan.subject.name} · ${plan.questions.map(q => `${q.id} ${q.source === "espn" ? `ESPN ${q.feed}` : "web"}`).join(" · ")}` });

  // The clubs the request is about, from ESPN by id (colours, logo), before any research: every
  // club a question names, and any directory club named in the subject ("Chelsea vs Manchester City").
  const directory = await clubDirectory(deps.espn).catch(() => []);
  const named = new Set(plan.questions.flatMap(q => (q.source === "espn" ? [q.team, q.opponent] : [])).filter((n): n is string => !!n));
  const seen = new Set<string>();
  const clubs = directory.filter(c => named.has(c.name) || plan.subject.name.split(/\s+(?:vs?\.?|and|&)\s+/i).some(part => isTeam({ name: c.name, short: c.short, abbreviation: c.abbreviation }, part)))
    .filter(c => !seen.has(c.id) && !!seen.add(c.id)).map(clubRecord);
  hooks.content?.({ stage: "summarize", id: "clubs", label: "Clubs (ESPN)", format: "json", data: clubs });

  hooks.progress?.({ stage: "search", status: "started", detail: `Answering ${plan.questions.length} questions in parallel` });
  const answered = await answerSports(plan, request.prompt, now, {
    progress: detail => hooks.progress?.({ stage: "search", status: "working", detail }),
    // Parallel search is reported like stocks did: engine llm, model parallel/search.
    usage: entry => hooks.usage?.({ ...entry, engine: "llm" }),
    finding: (id, value) => hooks.content?.({ stage: "search", id: `finding-${id}`, label: `Answer ${id}`, format: "json", data: value }),
  }, deps);
  clock.mark("search");
  const statuses = Object.entries(answered.answers).map(([id, a]) => `${id} ${String(a.status)}`).join(" · ");
  hooks.progress?.({ stage: "search", status: "completed", detail: statuses, ...(answered.sources.length ? { sources: answered.sources.slice(0, 12) } : {}) });

  hooks.progress?.({ stage: "data", status: "started", detail: "Designing the dataset" });
  const source = answered.espn && answered.web ? "mixed" : answered.espn ? "espn" : "web";
  const dataset = await designDataset(plan, answered.answers, source, now, {
    usage: usage("data"),
    rejected: (id, problem) => hooks.content?.({ stage: "data", id: `rejected-${id}`, label: `Design rejected for ${id}; raw answer kept`, format: "text", data: problem }),
  }, deps.schema, clubs);
  clock.mark("data");
  hooks.content?.({ stage: "data", id: "dataset", label: `Dataset (${cfg.SPORTS_MODEL})`, format: "json", data: { fields: dataset.fields, values: dataset.values } });
  hooks.progress?.({ stage: "data", status: "completed", detail: `${dataset.fields.length} fields · designed ${dataset.designed.join(", ") || "none"}` });
  const snapshot = await store.put(run, dataset, "sports_dataset");
  hooks.data?.(snapshot);

  const model = cfg.SPORTS_MODEL;
  const write: ProgramWriter = deps.write ?? ((messages, emit) => anthropicWriter(messages, model, emit, 12_000, { effort: "high", fallbacks: true }));
  const issues: ProgramIssue[] = [];
  hooks.progress?.({ stage: "compose", status: "started", detail: "Writing the screen" });
  const required = plan.questions.map(q => ({ id: q.id, text: q.text }));
  const screen = await compileScreen({ run, request: request.prompt, values: dataset.values, required, base: [], editable: new Set(), explicitLayout: null }, SPORTS_SCREEN, write, {
    ...(hooks.program ? { program: hooks.program } : {}),
    ...(hooks.skeleton ? { skeleton: hooks.skeleton } : {}),
    issue: issue => { issues.push(issue); hooks.issue?.(issue); },
    request: (messages, attempt) => hooks.content?.({ stage: "compose", id: `writer-request-${attempt}`, label: attempt ? "Writer repair" : "Writer request", format: "json", data: messages, attempt }),
  });
  const composeStart = clock.timings.data ?? 0;
  clock.mark("compose");
  if (screen.writerCalled) hooks.usage?.({ stage: "compose", engine: "llm", model, inputTokens: screen.usage.promptTokens, outputTokens: screen.usage.completionTokens, costUSD: screen.usage.cost ?? 0, ms: clock.timings.compose! - composeStart });
  hooks.content?.({ stage: "compose", id: "openui", label: "OpenUI Lang program", format: "text", data: screen.program });
  hooks.progress?.({ stage: "compose", status: "completed", detail: `${screen.stats.parts} parts · ${screen.stats.fallbacks} defaults added · ${screen.stats.admitted}/${screen.stats.written} statements admitted` });

  hooks.progress?.({ stage: "validate", status: "started", detail: "Checking the program" });
  const tree = programTree(screen.program, dataset.values);
  clock.mark("validate");
  hooks.content?.({ stage: "validate", id: "coverage", label: "Questions → parts", format: "json", data: Object.fromEntries(screen.coverage) });
  hooks.progress?.({ stage: "validate", status: "completed", detail: `${tree.nodes.length} primitives · every question shown` });
  return {
    run, model, plan, snapshot, screen, program: screen.program, issues,
    holes: { total: screen.stats.parts, filled: screen.parts.filter(p => p.origin.kind === "writer").length, fallback: screen.stats.fallbacks, repairRounds: screen.stats.repairRounds },
    timings: clock.timings, nodes: tree.nodes.length,
  };
}

function timer() {
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  return { timings, mark: (stage: string) => { timings[stage] = Math.round(performance.now() - startedAt); } };
}
