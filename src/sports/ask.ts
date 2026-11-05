import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { basePart, compileScreen, type CompiledScreen, type ProgramIssue, type ProgramWriter, type QuestionId, type ScreenSource } from "../lang/compiler.js";
import { printStatement } from "../lang/program.js";
import type { DatasetSnapshot, SnapshotDataset, SnapshotStore } from "../lang/snapshots.js";
import { programTree, type programSkeleton } from "../lang/tree.js";
import { claudeWriter } from "../llm/claude.js";
import type { CompletionSender } from "../llm/structured-completion.js";
import type { DataField, MockValue } from "../research/dataset-schema.js";
import type { ContentReport, RunProgress, UsageReport } from "../run/recorder.js";
import { designDataset, inferFields } from "./dataset.js";
import type { DocumentPart, SportsDocument } from "./documents.js";
import { clubRecord, isTeam } from "./espn.js";
import { clubsForMarks, clubsWithColours, footballClubs, footballSourceName } from "./football.js";
import { planFollowUp, planSports, type FollowUpContext, type FollowUpPlan, type SportsPlan } from "./plan.js";
import { fitHeatmaps, lockFacts, settleMissing, settleVenues } from "./components.js";
import { pickPlayer } from "./player-pick.js";
import { answerSports, type ResearchDeps } from "./research.js";
import { SPORTS_SCREEN } from "./screen.js";
import { lookupPlayer, type PlayerLookup, type PlayerPicker, type PlayerProfile } from "./fotmob.js";
import { componentPlayerQueries, createPlayerResolver, fillClubMarks, populatePlayerImages, rawPlayerQueries, savedPlayerProfiles } from "./player-images.js";

/**
 * The sports pipeline: Haiku understands the request and plans the questions; every question is
 * answered at once (ESPN feeds, or parallel searches Sonnet reads); Opus designs the dataset and
 * writes the screen, which the compiler admits, covers and falls back on. A follow-up plans against
 * the saved questions, answers only the revised and added ones, and rewrites only their parts.
 */

/** `timeZone` (IANA, e.g. "America/New_York") sets the clock kickoff times are shown in. */
export interface SportsRequest { readonly prompt: string; readonly timeZone?: string | undefined }
export interface FollowUpRequest extends SportsRequest { readonly targets?: readonly string[] | undefined }
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
  readonly planFollowUp?: (context: FollowUpContext) => Promise<FollowUpPlan>;
  readonly schema?: CompletionSender;
  readonly write?: ProgramWriter;
  readonly now?: Date;
  readonly player?: PlayerLookup;
  readonly pickPlayer?: PlayerPicker;
}
export interface SportsResult {
  readonly run: string;
  readonly model: string;
  readonly plan: SportsPlan;
  readonly snapshot: DatasetSnapshot;
  readonly screen: CompiledScreen;
  readonly program: string;
  /** The parts as a document saves them. */
  readonly parts: readonly DocumentPart[];
  readonly issues: readonly ProgramIssue[];
  readonly holes: { readonly total: number; readonly filled: number; readonly fallback: number; readonly repairRounds: number };
  readonly timings: Readonly<Record<string, number>>;
  readonly nodes: number;
}
export interface FollowUpResult extends SportsResult { readonly followUp: FollowUpPlan }

type Answers = Record<string, Record<string, MockValue>>;
type Clock = ReturnType<typeof timer>;

export async function askSports(request: SportsRequest, store: SnapshotStore, hooks: SportsHooks = {}, run: string = randomUUID(), deps: SportsDeps = {}): Promise<SportsResult> {
  const cfg = config();
  const now = deps.now ?? new Date();
  const clock = timer();
  hooks.progress?.({ stage: "summarize", status: "started", detail: "Understanding the request" });
  const plan = await (deps.plan ?? (prompt => planSports(prompt, now, { usage: llmUsage(hooks, "summarize") }, deps.espn)))(request.prompt);
  clock.mark("plan");
  hooks.content?.({ stage: "summarize", id: "plan", label: `Plan (${cfg.SPORTS_PLAN_MODEL})`, format: "json", data: plan });
  hooks.progress?.({ stage: "summarize", status: "completed", detail: `${plan.subject.name} · ${plan.questions.map(q => `${q.id} ${q.source === "espn" ? `${footballSourceName()} ${q.feed}` : q.source}`).join(" · ")}` });

  const clubs = await clubsOf(plan, deps);
  hooks.content?.({ stage: "summarize", id: "clubs", label: `Clubs (${footballSourceName()})`, format: "json", data: clubs });
  const dataset = await answer(plan, plan.questions, request, clubs, now, hooks, deps, clock);
  const snapshot = await store.put(run, dataset, "sports_dataset");
  hooks.data?.(snapshot);
  return compose({ run, request: request.prompt, values: dataset.values, required: plan.questions.map(q => ({ id: q.id, text: q.text })), base: [], editable: new Set(), explicitLayout: null },
    plan, snapshot, hooks, deps, clock);
}

/**
 * A follow-up on a saved screen. Kept questions reuse their saved answers; revised and added ones are
 * answered again. Parts showing only kept questions stay byte for byte; parts showing a revised or
 * removed question may be rewritten under their id; parts showing only removed questions leave.
 */
export async function editSports(saved: SportsDocument, request: FollowUpRequest, store: SnapshotStore, hooks: SportsHooks = {}, run: string = randomUUID(), deps: SportsDeps = {}): Promise<FollowUpResult> {
  const cfg = config();
  const now = deps.now ?? new Date();
  const clock = timer();
  hooks.progress?.({ stage: "summarize", status: "started", detail: "Reading the follow-up against the screen" });
  const context: FollowUpContext = { prompt: request.prompt, subject: saved.subject, questions: saved.questions, parts: saved.parts.map(p => ({ id: p.id, questions: p.questions })), turns: saved.turns, targets: request.targets };
  const followUp = await (deps.planFollowUp ?? (input => planFollowUp(input, now, { usage: llmUsage(hooks, "summarize") }, deps.espn)))(context);
  clock.mark("plan");
  hooks.content?.({ stage: "summarize", id: "follow-up-plan", label: `Follow-up plan (${cfg.SPORTS_PLAN_MODEL})`, format: "json", data: followUp });
  const changed = followUp.questions.filter(q => q.change !== "kept");
  const kept = new Set<string>(followUp.questions.filter(q => q.change === "kept").map(q => q.id));
  hooks.progress?.({ stage: "summarize", status: "completed", detail: [...followUp.questions.map(q => `${q.id} ${q.change}`), ...followUp.removed.map(id => `${id} removed`)].join(" · ") });

  const plan: SportsPlan = { subject: followUp.subject, questions: followUp.questions.map(({ change: _change, ...q }) => q) };
  const previous = saved.snapshot.result as { answers: Answers; clubs?: Record<string, MockValue>[]; players?: unknown };
  // Saved clubs keep their order, so kept parts reading d.clubs[i] still read the same club.
  const savedClubs = previous.clubs ?? [];
  const clubs = [...savedClubs, ...(await clubsOf(plan, deps)).filter(c => !savedClubs.some(s => s.id === c.id))];
  hooks.content?.({ stage: "summarize", id: "clubs", label: `Clubs (${footballSourceName()})`, format: "json", data: clubs });
  const savedPlayers = savedPlayerProfiles(previous.players);
  const fresh = changed.length ? await answer(plan, changed, request, clubs, now, hooks, deps, clock, savedPlayers) : null;
  const players = fresh ? savedPlayerProfiles(fresh.values.players) : savedPlayers;
  const freshAnswers = (fresh?.values.answers ?? {}) as Answers;
  const answers: Answers = Object.fromEntries(plan.questions.map(q => [q.id, kept.has(q.id) ? previous.answers[q.id]! : freshAnswers[q.id]!]));
  const answerFields = (fields: readonly DataField[], keep: (id: string) => boolean) => fields.filter(f => f.path.startsWith("answers.") && keep(f.path.split(".")[1]!));
  const dataset: SnapshotDataset = {
    values: { answers, ...(clubs.length ? { clubs } : {}), ...(players.length ? { players } : {}) },
    fields: [...answerFields(saved.snapshot.fields, id => kept.has(id)), ...answerFields(fresh?.fields ?? [], id => !kept.has(id)), ...(clubs.length ? inferFields(clubs, "clubs") : []), ...(players.length ? inferFields(players.map(player => ({ ...player })), "players") : [])],
    asOf: now.toISOString(), source: sourceOf(plan, answers),
  };
  const snapshot = await store.put(run, dataset, "sports_dataset");
  hooks.data?.(snapshot);

  const removed = new Set<string>(followUp.removed);
  const touched = new Set<string>([...changed.map(q => q.id), ...removed]);
  const base = saved.parts.filter(part => !part.questions.length || part.questions.some(q => !removed.has(q)));
  const editable = base.filter(part => part.questions.some(q => touched.has(q)));
  // A rewritten part must still show the kept questions it showed; a stale one dropped falls back to them.
  const required = plan.questions.filter(q => !kept.has(q.id) || editable.some(part => part.questions.includes(q.id)));
  const conversation = [...saved.turns.filter(t => t.role === "user").map(t => t.content), request.prompt].join("\nThen: ");
  const result = await compose({
    run, request: conversation, values: dataset.values, required: required.map(q => ({ id: q.id, text: q.text })),
    base: base.map(part => basePart(part.id, part.statements)), editable: new Set(editable.map(part => part.id)), explicitLayout: null,
  }, plan, snapshot, hooks, deps, clock);
  return { ...result, followUp };
}

/** The clubs the request is about, from ESPN by id (colours, logo): every club a question names, and any directory club named in the subject ("Chelsea vs Manchester City"). */
async function clubsOf(plan: SportsPlan, deps: SportsDeps): Promise<Record<string, MockValue>[]> {
  const directory = await footballClubs(deps.espn).catch(() => []);
  const named = new Set(plan.questions.flatMap(q => (q.source === "espn" ? [q.team, q.opponent] : [])).filter((n): n is string => !!n));
  const seen = new Set<string>();
  const clubs = directory.filter(c => named.has(c.name) || plan.subject.name.split(/\s+(?:vs?\.?|and|&)\s+/i).some(part => isTeam({ name: c.name, short: c.short, abbreviation: c.abbreviation }, part)))
    .filter(c => !seen.has(c.id) && !!seen.add(c.id));
  return (await clubsWithColours(clubs, deps.espn)).map(clubRecord);
}

const sourceOf = (plan: SportsPlan, answers: Answers): SnapshotDataset["source"] => {
  const answered = (web: boolean) => plan.questions.some(q => (q.source === "web") === web && answers[q.id]?.status === "complete");
  return answered(false) && answered(true) ? "mixed" : answered(false) ? "espn" : "web";
};

/** Research and dataset design for `questions`, all at once. */
async function answer(plan: SportsPlan, questions: SportsPlan["questions"], request: SportsRequest, clubs: readonly Record<string, MockValue>[], now: Date, hooks: SportsHooks, deps: SportsDeps, clock: Clock, savedPlayers: readonly PlayerProfile[] = []) {
  const cfg = config();
  const subset: SportsPlan = { subject: plan.subject, questions };
  const counts = { searches: questions.flatMap(q => q.source === "web" ? q.searchQueries : []).length, lookups: questions.filter(q => q.source !== "web").length };
  hooks.progress?.({ stage: "search", status: "started", detail: `Answering ${questions.length} questions in parallel`, ...counts });
  const pick: PlayerPicker = (query, candidates) => pickPlayer(query, candidates, request.prompt, { usage: llmUsage(hooks, "data") });
  const answered = await answerSports(subset, request.prompt, now, {
    progress: detail => hooks.progress?.({ stage: "search", status: "working", detail, ...counts }),
    // Parallel search is reported with engine llm and model parallel/search.
    usage: entry => hooks.usage?.({ ...entry, engine: "llm" }),
    finding: (id, value) => hooks.content?.({ stage: "search", id: `finding-${id}`, label: `Answer ${id}`, format: "json", data: value }),
  }, { ...deps, pickPlayer: deps.pickPlayer ?? pick }, request.timeZone);
  clock.mark("search");
  const statuses = Object.entries(answered.answers).map(([id, a]) => `${id} ${String(a.status)}`).join(" · ");
  hooks.progress?.({ stage: "search", status: "completed", detail: statuses, ...counts, sourceCount: answered.sources.length, ...(answered.sources.length ? { sources: answered.sources.slice(0, 12) } : {}) });

  hooks.progress?.({ stage: "data", status: "started", detail: "Designing the dataset" });
  const resolvePlayers = createPlayerResolver(query => (deps.player ?? lookupPlayer)(query, deps.pickPlayer ?? pick), savedPlayers);
  const rawQueries = rawPlayerQueries(subset, answered.answers);
  const initialPlayers = await resolvePlayers(rawQueries);
  const dataset = await designDataset(subset, answered.answers, sourceOf(subset, answered.answers), now, {
    usage: llmUsage(hooks, "data"),
    rejected: (id, problem) => hooks.content?.({ stage: "data", id: `rejected-${id}`, label: `Design rejected for ${id}; raw answer kept`, format: "text", data: problem }),
  }, deps.schema, clubs, initialPlayers);
  const componentQueries = componentPlayerQueries(dataset.values.answers, clubs);
  const players = await resolvePlayers(componentQueries);
  const directory = await clubsForMarks((dataset.values as { answers?: unknown }).answers, deps.espn);
  const locked = lockFacts(settleMissing(fitHeatmaps(settleVenues(fillClubMarks(populatePlayerImages(dataset, players, rawQueries), directory)))));
  const enriched = locked.dataset;
  if (locked.removed.length) hooks.content?.({ stage: "data", id: "fact-lock", label: "Repeated facts removed", format: "json", data: locked.removed });
  clock.mark("data");
  hooks.content?.({ stage: "data", id: "dataset", label: `Dataset (${cfg.SPORTS_MODEL})`, format: "json", data: { fields: enriched.fields, values: enriched.values } });
  hooks.progress?.({ stage: "data", status: "completed", detail: `${enriched.fields.length} fields · designed ${dataset.designed.join(", ") || "none"}` });
  return enriched;
}

/** The writer composes; the compiler admits, covers and falls back. */
async function compose(source: ScreenSource, plan: SportsPlan, snapshot: DatasetSnapshot, hooks: SportsHooks, deps: SportsDeps, clock: Clock): Promise<SportsResult> {
  const model = config().SPORTS_MODEL;
  const writer: ProgramWriter = deps.write ?? ((messages, emit) => claudeWriter(messages, model, emit, 12_000, { effort: "medium", fallbacks: true }));
  // The writer's own text, before templates expand: the trace shows whether it called components by name.
  const write: ProgramWriter = async (messages, emit) => {
    const result = await writer(messages, emit);
    hooks.content?.({ stage: "compose", id: "writer-output", label: "Writer output", format: "text", data: result.text });
    return result;
  };
  const issues: ProgramIssue[] = [];
  hooks.progress?.({ stage: "compose", status: "started", detail: source.base.length ? `Editing ${source.editable.size} of ${source.base.length} parts` : "Writing the screen" });
  const screen = await compileScreen(source, SPORTS_SCREEN, write, {
    ...(hooks.program ? { program: hooks.program } : {}),
    ...(hooks.skeleton ? { skeleton: hooks.skeleton } : {}),
    issue: issue => { issues.push(issue); hooks.issue?.(issue); },
    request: (messages, attempt) => hooks.content?.({ stage: "compose", id: `writer-request-${attempt}`, label: attempt ? "Writer repair" : "Writer request", format: "json", data: messages, attempt }),
  });
  const composeStart = clock.timings.data ?? clock.timings.plan ?? 0;
  clock.mark("compose");
  if (screen.writerCalled) hooks.usage?.({ stage: "compose", engine: "llm", model, inputTokens: screen.usage.promptTokens, outputTokens: screen.usage.completionTokens, costUSD: screen.usage.cost ?? 0, ms: clock.timings.compose! - composeStart });
  hooks.content?.({ stage: "compose", id: "openui", label: "OpenUI Lang program", format: "text", data: screen.program });
  hooks.progress?.({ stage: "compose", status: "completed", detail: `${screen.stats.parts} parts · ${screen.stats.fallbacks} defaults added · ${screen.stats.admitted}/${screen.stats.written} statements admitted` });

  hooks.progress?.({ stage: "validate", status: "started", detail: "Checking the program" });
  const tree = programTree(screen.program, source.values);
  clock.mark("validate");
  hooks.content?.({ stage: "validate", id: "coverage", label: "Questions → parts", format: "json", data: Object.fromEntries(screen.coverage) });
  hooks.progress?.({ stage: "validate", status: "completed", detail: `${tree.nodes.length} primitives · every question shown${screen.stats.fallbacks ? `, ${screen.stats.fallbacks} by default parts` : ""}` });
  const parts: DocumentPart[] = screen.parts.map(part => ({
    id: part.id,
    statements: Object.fromEntries([...part.statements].map(([name, expr]) => [name, printStatement(name, expr)])),
    questions: [...part.evidence.keys()].filter((q): q is QuestionId => plan.questions.some(p => p.id === q)),
  }));
  return {
    run: source.run, model, plan, snapshot, screen, program: screen.program, parts, issues,
    holes: { total: screen.stats.parts, filled: screen.parts.filter(p => p.origin.kind === "writer").length, fallback: screen.stats.fallbacks, repairRounds: screen.stats.repairRounds },
    timings: clock.timings, nodes: tree.nodes.length,
  };
}

const llmUsage = (hooks: SportsHooks, stage: UsageReport["stage"]) => ({ model, usage: u, attempt, ms }: { model: string; usage: { promptTokens: number; completionTokens: number; costUSD: number | undefined }; attempt: number; ms: number }) =>
  hooks.usage?.({ stage, engine: "llm", model, attempt, inputTokens: u.promptTokens, outputTokens: u.completionTokens, costUSD: u.costUSD ?? 0, ms });

function timer() {
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  return { timings, mark: (stage: string) => { timings[stage] = Math.round(performance.now() - startedAt); } };
}
