import { randomUUID } from "node:crypto";
import { config } from "../../config.js";
import { basePart, compileScreen, type CompiledScreen, type PartId, type ProgramIssue, type ProgramWriter, type QuestionId, type ScreenSource } from "../../lang/compiler.js";
import type { DocumentPart, LangDocument } from "../../lang/documents.js";
import type { MockValue } from "../../research/dataset-schema.js";
import { printStatement } from "../../lang/program.js";
import type { DatasetSnapshot, SnapshotStore } from "../../lang/snapshots.js";
import { programTree, type programSkeleton } from "../../lang/tree.js";
import { anthropicWriter, usesAnthropic } from "../../llm/anthropic.js";
import { streamWriter } from "../../llm/openrouter-writer.js";
import type { ContentReport, RunProgress, UsageReport } from "../../run/recorder.js";
import { answerQuestions, type Question, type Subject } from "../answers.js";
import type { MassiveSource, StocksDataset, WebLookup } from "../data.js";
import { marketSource } from "../market-source.js";
import { planFollowUp, planQuestions, type FollowUpPlan, type Plan } from "../questions.js";
import { fieldsOf } from "../schema.js";
import { liveWeb } from "../live-web.js";
import { STOCKS_SCREEN } from "./screen.js";

/**
 * The Ask pipeline: Haiku plans the questions, every question is answered at once, and the writer
 * composes the screen from primitives and templates while the compiler admits it. First runs only;
 * follow-ups reuse the same stages with the saved questions and parts.
 */

export interface AskRequest { readonly prompt: string; readonly model?: string | undefined; readonly timeZone?: string | undefined }
export interface AskHooks {
  readonly progress?: (value: RunProgress) => void;
  readonly usage?: (value: UsageReport) => void;
  readonly content?: (value: ContentReport) => void;
  readonly data?: (value: DatasetSnapshot) => void;
  readonly skeleton?: (value: ReturnType<typeof programSkeleton>) => void;
  readonly program?: (text: string) => void;
  readonly issue?: (value: ProgramIssue) => void;
}
/** Injectable stages for offline checks. */
export interface AskDeps {
  readonly plan?: (prompt: string) => Promise<Plan>;
  readonly market?: MassiveSource;
  readonly web?: WebLookup;
  readonly write?: ProgramWriter;
  readonly now?: Date;
}
export interface AskResult {
  readonly run: string;
  readonly ticker: string;
  readonly model: string;
  readonly subject: Subject;
  readonly questions: readonly Question[];
  readonly dataset: StocksDataset;
  readonly snapshot: DatasetSnapshot;
  readonly screen: CompiledScreen;
  /** The program as stored and sent in `done`. */
  readonly program: string;
  readonly parts: readonly DocumentPart[];
  readonly issues: readonly ProgramIssue[];
  /** `done.holes`, kept for clients: total = parts, filled = writer parts, fallback = fallback parts. */
  readonly holes: { readonly total: number; readonly filled: number; readonly fallback: number; readonly repairRounds: number };
  readonly timings: Readonly<Record<string, number>>;
  readonly nodes: number;
  readonly writerCalled: boolean;
}

export async function askStocks(request: AskRequest, store: SnapshotStore, hooks: AskHooks = {}, run = randomUUID(), deps: AskDeps = {}): Promise<AskResult> {
  const clock = timer();
  hooks.progress?.({ stage: "summarize", status: "started", detail: "Breaking the request into questions" });
  const plan = await (deps.plan ?? (prompt => planQuestions(prompt, hooks.usage)))(request.prompt);
  clock.mark("plan");
  hooks.content?.({ stage: "summarize", id: "questions", label: "Planned questions (Haiku)", format: "json", data: plan });
  hooks.progress?.({ stage: "summarize", status: "completed", detail: `${plan.subject.ticker} · ${plan.questions.length} questions` });
  const dataset = await answer(plan.subject, plan.questions, request.prompt, hooks, deps, clock);
  const snapshot = await store.put(run, dataset);
  hooks.data?.(snapshot);
  return compose({ run, request: request.prompt, values: dataset.values, required: plan.questions.map(q => ({ id: q.id, text: q.text })), base: [], editable: new Set(), explicitLayout: null },
    { request, plan, dataset, snapshot }, hooks, deps, clock);
}

export interface EditRequest { readonly prompt: string; readonly model?: string | undefined; readonly timeZone?: string | undefined; readonly targets?: readonly string[] | undefined }
export interface EditResult extends AskResult { readonly request: string; readonly removed: readonly string[]; readonly plan: FollowUpPlan }

/**
 * A follow-up on a saved screen: only the revised and added questions are answered again, saved
 * answers stay as they were, parts reading a revised question (or restyled by request) may be
 * rewritten, and every other part is kept byte for byte.
 */
export async function editStocks(saved: LangDocument, request: EditRequest, store: SnapshotStore, hooks: AskHooks = {}, run = randomUUID(), deps: AskDeps & { readonly planFollowUp?: typeof planFollowUp } = {}): Promise<EditResult> {
  if (!saved.subject || !saved.questions) throw new Error("This document predates questions; it is edited by the previous follow-up path");
  const subject = saved.subject as unknown as Subject;
  const savedQuestions = saved.questions as unknown as Question[];
  const clock = timer();
  hooks.progress?.({ stage: "summarize", status: "started", detail: "Reading the follow-up against the saved questions" });
  const plan = await (deps.planFollowUp ?? planFollowUp)({ prompt: request.prompt, subject, questions: savedQuestions, parts: saved.parts, targets: request.targets, turns: saved.turns }, hooks.usage);
  clock.mark("plan");
  hooks.content?.({ stage: "summarize", id: "follow-up-plan", label: "Follow-up plan (Haiku)", format: "json", data: plan });
  hooks.progress?.({ stage: "summarize", status: "completed", detail: [plan.questions.length && `${plan.questions.length} questions to answer`, plan.restyle.length && `restyle ${plan.restyle.join(", ")}`, plan.removeParts.length && `remove ${plan.removeParts.join(", ")}`].filter(Boolean).join(" · ") || "Nothing to change" });
  const old = saved.snapshot.result as { subject: Record<string, MockValue>; answers: Record<string, MockValue> };
  const fresh = plan.questions.length ? await answer(subject, plan.questions, plan.request, hooks, deps, clock) : null;
  const freshValues = fresh?.values as { subject: Record<string, MockValue>; answers: Record<string, MockValue> } | undefined;
  // Answers are write-once: a revision has a new id, so merging is a union and saved parts keep their data.
  const values = { subject: freshValues?.subject ?? old.subject, answers: { ...old.answers, ...freshValues?.answers } } as Record<string, MockValue>;
  const dataset: StocksDataset = { source: fresh?.source ?? saved.snapshot.source, asOf: fresh?.asOf ?? saved.snapshot.asOf, values, fields: fieldsOf({ subject: values.subject! }) };
  const snapshot = await store.put(run, dataset);
  hooks.data?.(snapshot);
  const replaced = new Set(plan.questions.flatMap(q => q.replaces ? [q.replaces] : []));
  const kept = saved.parts.filter(part => !plan.removeParts.includes(part.id));
  const editable = new Set(kept.filter(part => plan.restyle.includes(part.id) || part.questions?.some(q => replaced.has(q as QuestionId))).map(part => part.id as PartId));
  const restyled = kept.filter(part => plan.restyle.includes(part.id)).flatMap(part => part.questions ?? []).map(id => savedQuestions.find(q => q.id === id)).filter((q): q is Question => !!q);
  const result = await compose({
    run, request: plan.request, values,
    // New questions must be shown; a restyled part must still show what it showed.
    required: [...plan.questions, ...restyled].map(q => ({ id: q.id, text: q.text })),
    base: kept.map(part => basePart(part.id as PartId, part.statements)), editable, explicitLayout: null,
  }, { request, plan: { subject, questions: [...savedQuestions, ...plan.questions] }, dataset, snapshot }, hooks, deps, clock);
  return { ...result, request: plan.request, removed: plan.removeParts, plan };
}

/** Every question answered at once; the dataset the screen reads. */
async function answer(subject: Subject, questions: readonly Question[], prompt: string, hooks: AskHooks, deps: AskDeps, clock: ReturnType<typeof timer>): Promise<StocksDataset> {
  const fetches: { atMs: number; detail: string }[] = [];
  const progress = (detail: string) => {
    fetches.push({ atMs: clock.ms(), detail });
    hooks.progress?.({ stage: "data", status: "started", detail });
    hooks.content?.({ stage: "data", id: "fetches", label: "Data fetched and provider routing", format: "json", data: [...fetches] });
  };
  hooks.progress?.({ stage: "data", status: "started", detail: `Answering ${questions.length} questions in parallel` });
  const now = deps.now ?? new Date();
  const market = deps.market ?? marketSource({ now, progress });
  const web = deps.web ?? liveWeb({ ...(hooks.usage ? { usage: hooks.usage } : {}), ...(hooks.content ? { content: hooks.content } : {}) });
  const dataset = await answerQuestions(subject, questions, { prompt, now, web, market, progress });
  clock.mark("data");
  const answers = dataset.values.answers as Record<string, { status: string; lookup: string }>;
  hooks.content?.({ stage: "data", id: "answers", label: "Answers by question", format: "json", data: dataset.values.answers });
  hooks.progress?.({ stage: "data", status: "completed", detail: Object.entries(answers).filter(([id]) => questions.some(q => q.id === id)).map(([id, a]) => `${id} ${a.lookup} ${a.status}`).join(" · ") });
  return dataset;
}

/** The writer composes; the compiler admits, covers and falls back; the result is what the route stores and sends. */
async function compose(source: ScreenSource, context: { request: AskRequest; plan: Plan; dataset: StocksDataset; snapshot: DatasetSnapshot }, hooks: AskHooks, deps: AskDeps, clock: ReturnType<typeof timer>): Promise<AskResult> {
  const issues: ProgramIssue[] = [];
  const anthropic = !deps.write && usesAnthropic();
  const model = anthropic ? config().ANTHROPIC_MODEL : context.request.model ?? config().OPENROUTER_MODEL;
  const write: ProgramWriter = deps.write ?? (anthropic ? (messages, emit) => anthropicWriter(messages, model, emit, 12_000) : (messages, emit) => streamWriter(messages, model, emit));
  hooks.progress?.({ stage: "compose", status: "started", detail: source.base.length ? `Editing ${source.editable.size} of ${source.base.length} parts` : "Writing the screen" });
  const screen = await compileScreen(source, STOCKS_SCREEN, write, {
    ...(hooks.program ? { program: hooks.program } : {}),
    ...(hooks.skeleton ? { skeleton: hooks.skeleton } : {}),
    issue: issue => { issues.push(issue); hooks.issue?.(issue); },
    request: (messages, attempt) => hooks.content?.({ stage: "compose", id: `writer-request-${attempt}`, label: attempt ? "Writer repair" : "Writer request", format: "json", data: messages, attempt }),
  });
  const before = clock.ms();
  clock.mark("compose");
  if (screen.writerCalled) hooks.usage?.({ stage: "compose", engine: "llm", model, inputTokens: screen.usage.promptTokens, outputTokens: screen.usage.completionTokens, costUSD: screen.usage.cost ?? 0, ms: before - (clock.timings.data ?? clock.timings.plan ?? 0) });
  hooks.content?.({ stage: "compose", id: "openui", label: "OpenUI Lang program", format: "text", data: screen.program });
  hooks.progress?.({ stage: "compose", status: "completed", detail: `${screen.stats.parts} parts · ${screen.stats.fallbacks} defaults added · ${screen.stats.admitted}/${screen.stats.written} statements admitted` });

  hooks.progress?.({ stage: "validate", status: "started", detail: "Checking the program and what each part shows" });
  const tree = programTree(screen.program, source.values);
  clock.mark("validate");
  hooks.content?.({ stage: "validate", id: "coverage", label: "Questions → parts", format: "json", data: Object.fromEntries(screen.coverage) });
  hooks.progress?.({ stage: "validate", status: "completed", detail: `${tree.nodes.length} primitives · every question shown` });
  const parts: DocumentPart[] = screen.parts.map(part => ({
    id: part.id, block: part.origin.kind === "fallback" ? "fallback" : "composed", binding: null, variant: part.origin.kind,
    statements: Object.fromEntries([...part.statements].map(([name, expr]) => [name, printStatement(name, expr)])),
    questions: [...part.evidence.keys()],
  }));
  return {
    run: source.run, ticker: context.plan.subject.ticker, model, subject: context.plan.subject, questions: context.plan.questions, dataset: context.dataset, snapshot: context.snapshot,
    screen, program: screen.program, parts, issues,
    holes: { total: screen.stats.parts, filled: screen.parts.filter(p => p.origin.kind === "writer").length, fallback: screen.stats.fallbacks, repairRounds: screen.stats.repairRounds },
    timings: clock.timings, nodes: tree.nodes.length, writerCalled: screen.writerCalled,
  };
}

function timer() {
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  const ms = () => Math.round(performance.now() - startedAt);
  return { timings, ms, mark: (stage: string) => { timings[stage] = ms(); } };
}
