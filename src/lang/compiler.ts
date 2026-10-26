import { autoClose, generateSystemPrompt, parseExpression, split, tokenize } from "@openuidev/lang-core";
import { iconProblem } from "../primitives/icons.js";
import { z } from "zod";
import { slotLibrary } from "./library.js";
import { TOKEN_IDS, TOKEN_SCHEMA } from "./props.js";
import { PRIMITIVES, PRIMITIVE_BY_NAME, type PrimitiveDef, type PrimitiveName } from "./primitives.js";
import { printExpr, printStatement, type Expr } from "./program.js";
import { programSkeleton, programTree } from "./tree.js";

/**
 * The screen compiler. The writer authors the whole screen body as named statements: a part is a
 * lowercase label (`quarters = Section(...)`) and its sub-statements are `label_x`. The compiler admits
 * each statement as it streams, expands template macros to primitives, links a part once every
 * sibling it references is admitted, renames it to `pickN`, and derives what the part answers from
 * the data it reads. Coverage is checked after admission; questions no part shows get the pack's
 * fallback part. Generic: everything about a domain comes through `ScreenPack`.
 */

export type PartId = `pick${number}`;
export type QuestionId = `q${number}`;

/** A path into the dataset after `d`: a key, a literal index, or null for "each item" of an @Each. */
export type Segment = string | number | null;
export type DataPath = readonly Segment[];

/** What parts read, grouped by the question each read is evidence for, as paths relative to that answer. */
export type Evidence = ReadonlyMap<QuestionId, readonly DataPath[]>;
export type ListContainer = "list" | "grid" | "rail" | "text";
export type DatasetValues = Readonly<Record<string, unknown>>;

/** Domain knowledge the compiler consults; all pure. */
export interface ScreenPack {
  /** A template call as primitives, or null when `call` is not a template. Throws a message the writer sees for a bad call. */
  expand(call: Extract<Expr, { k: "Comp" }>): Expr | null;
  /** The question a dataset path is evidence for, and the path relative to its answer. */
  evidenceOf(path: DataPath): { readonly question: QuestionId; readonly rest: DataPath } | null;
  /** Whether these reads (relative to the answer) show the question. */
  shows(question: QuestionId, reads: readonly DataPath[], values: DatasetValues): boolean;
  /** The count-driven list rule for an @Each over `path`; null when allowed. */
  listProblem(path: DataPath, count: number, container: ListContainer, explicit: ListContainer | null): string | null;
  /** A part that shows the question from primitives and templates only (no writer). */
  fallback(question: QuestionId, values: DatasetValues): Expr;
  /** The writer's view of the data: questions, data paths, a preview, and templates printed against real data. */
  briefing(source: ScreenSource): string;
  /** Template signatures for the writer's system prompt. */
  readonly templates: string;
  /** The tool the program's `d = Query(...)` reads its snapshot from. Defaults to "sports_dataset". */
  readonly tool?: string;
}

export interface RequiredQuestion { readonly id: QuestionId; readonly text: string }
/** A part already on screen (follow-ups). */
export interface BasePart { readonly id: PartId; readonly statements: ReadonlyMap<string, Expr> }

export interface ScreenSource {
  readonly run: string;
  readonly request: string;
  readonly values: DatasetValues;
  /** Questions that must be visible after this compile: every question first run, the revised and added ones on a follow-up. */
  readonly required: readonly RequiredQuestion[];
  /** Existing parts in screen order; those not editable are kept byte for byte. */
  readonly base: readonly BasePart[];
  /** Base parts the writer may rewrite by their own id. */
  readonly editable: ReadonlySet<PartId>;
  readonly explicitLayout: ListContainer | null;
}

export type PartOrigin = { readonly kind: "writer" } | { readonly kind: "fallback"; readonly question: QuestionId } | { readonly kind: "kept" };
export interface CompiledPart {
  readonly id: PartId;
  /** Global statement id → expression, part statement first. */
  readonly statements: ReadonlyMap<string, Expr>;
  readonly evidence: Evidence;
  readonly origin: PartOrigin;
}
export interface ProgramIssue {
  readonly source: "parser" | "runtime" | "writer" | "coverage";
  readonly code: string;
  readonly message: string;
  /** The writer's own statement name, so repair speaks its language. */
  readonly statementId?: string;
  readonly component?: string;
  readonly path?: string;
}
export interface CompiledScreen {
  /** root, d, then each part's statements. Always passes programTree. */
  readonly program: string;
  readonly parts: readonly CompiledPart[];
  /** question → parts whose reads are evidence for it. */
  readonly coverage: ReadonlyMap<QuestionId, readonly PartId[]>;
  readonly issues: readonly ProgramIssue[];
  readonly stats: { readonly written: number; readonly admitted: number; readonly parts: number; readonly fallbacks: number; readonly repairRounds: number };
  readonly usage: WriterUsage;
  readonly writerCalled: boolean;
}

type Message = { role: "system" | "user"; content: string };
export interface WriterUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cost: number | undefined;
}
export type ProgramWriter = (messages: readonly Message[], onText: (delta: string) => void) => Promise<{ text: string; usage: WriterUsage }>;
export interface CompileHooks {
  /** Program text to append on the wire; always a valid program once appended. */
  readonly program?: (text: string) => void;
  readonly issue?: (issue: ProgramIssue) => void;
  readonly skeleton?: (value: ReturnType<typeof programSkeleton>) => void;
  readonly request?: (messages: readonly Message[], attempt: number) => void;
}

/** Caps after @Each expansion. */
export const LIMITS = { parts: 12, nodesPerPart: 600, nodesPerScreen: 2400, statementsPerPart: 16 } as const;

/**
 * Primitives the writer may use, derived from the library: no root or chrome, nothing that needs an
 * action, no input controls that edit bound data or hold their own state, and no Calculation scope
 * (only server templates build one, as its own statement).
 */
export const WRITER_PRIMITIVES: readonly PrimitiveName[] = (PRIMITIVES as readonly PrimitiveDef[]).filter(def => {
  if (def.category === "root" || def.category === "chrome") return false;
  const props = Object.values(def.props);
  if (props.some(prop => prop.meta.role === "copy" && prop.meta.kind === "action" && !prop.optional)) return false;
  if (props.some(prop => prop.meta.role === "data" && prop.meta.kind === "record")) return false;
  return !(def.category === "control" && (def.behaviors.includes("toggle") || props.some(prop => prop.meta.role === "data")));
}).map(def => def.name as PrimitiveName);

const WRITER_SET = new Set<string>(WRITER_PRIMITIVES);
/** Primitives a template may expand to beyond the writer's own: Calculation and the controls it scopes. */
const TEMPLATE_ONLY = new Set(["Calculation", "Slider", "ChoiceTags", "Stepper"]);
const PLACEHOLDER: Expr = { k: "Comp", name: "Show", args: [{ k: "Bool", v: false }, { k: "Comp", name: "Divider", args: [] }] };
const LABEL = /^[a-z][A-Za-z0-9]*$/;
/** `label_x` and deeper names (`label_rev_title`) all belong to the part `label`. */
const SUB = /^([a-z][A-Za-z0-9]*)_([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)$/;
const PICK = /^pick\d+$/;

// ------------------------------------------------------------------ the entry point

/**
 * Never throws for writer behaviour: bad statements are rejected, unfinished parts dropped, and every
 * required question no part shows gets a fallback part. Throws only for a programmer error (a
 * fallback that does not compile).
 */
export async function compileScreen(source: ScreenSource, pack: ScreenPack, writer: ProgramWriter, hooks: CompileHooks = {}): Promise<CompiledScreen> {
  const issues: ProgramIssue[] = [];
  const report = (issue: ProgramIssue) => { issues.push(issue); hooks.issue?.(issue); };
  const usage = { promptTokens: 0, completionTokens: 0, cost: 0 as number | undefined };
  source = { ...source, required: source.required.filter((q, i) => source.required.findIndex(other => other.id === q.id) === i) };
  const screen = new Screen(source, pack, report, hooks);
  hooks.skeleton?.(programSkeleton(screen.preview(source.required.map(q => q.id)), source.values));
  hooks.program?.(screen.opening());

  let written = 0, repairRounds = 0, writerFailed = false;
  const run = async (messages: readonly Message[], attempt: number) => {
    hooks.request?.(messages, attempt);
    const stream = new StatementStream();
    const take = (raw: string) => { written++; screen.admit(raw); };
    try {
      const response = await writer(messages, delta => stream.push(delta).forEach(take));
      stream.end().forEach(take);
      usage.promptTokens += response.usage.promptTokens;
      usage.completionTokens += response.usage.completionTokens;
      usage.cost = (usage.cost ?? 0) + (response.usage.cost ?? 0);
    } catch (error) {
      writerFailed = true;
      report({ source: "writer", code: "writer-failed", message: error instanceof Error ? error.message : String(error) });
    }
  };
  // New parts are for questions the saved parts do not show; with none and nothing to rewrite, there is nothing to write.
  const opening = screen.gaps();
  screen.allowNew = opening.length > 0;
  if (!opening.length && !source.editable.size) return screen.finish(usage, { written: 0, repairRounds: 0, writerCalled: false });
  const messages = writerMessages(source, pack, screen.allowNew);
  await run(messages, 0);
  const gaps = () => screen.gaps();
  if (!writerFailed && (screen.open().length || gaps().length)) {
    repairRounds = 1;
    const open = screen.open().map(part => `${part.name}: missing ${part.missing.join(", ") || "its part statement"}`);
    const uncovered = gaps().map(q => `${q.id}: ${q.text}`);
    await run([...messages, { role: "user", content: `Repair. Write only the statements that finish these parts or show these questions; do not repeat admitted statements.\n${open.length ? `Unfinished parts:\n${open.join("\n")}\n` : ""}${uncovered.length ? `Questions not yet shown (read their answer data):\n${uncovered.join("\n")}\n` : ""}Rejected so far: ${JSON.stringify(issues.filter(i => i.source !== "coverage").slice(-12))}` }], 1);
  }
  return screen.finish(usage, { written, repairRounds, writerCalled: true });
}

/** A stored part statement map (document) as a BasePart. */
export function basePart(id: PartId, statements: Readonly<Record<string, string>>): BasePart {
  return { id, statements: new Map(Object.entries(statements).map(([name, text]) => [name, parseStatement(text).expr])) };
}

/** Evidence of a stored or compiled part, recomputed from its statements, never trusted from storage. */
export function evidenceOf(statements: Iterable<Expr>, values: DatasetValues, pack: ScreenPack): Evidence {
  const reads: DataPath[] = [];
  for (const expr of statements) reads.push(...readsOf(expr));
  return groupEvidence(reads, pack);
}

// ------------------------------------------------------------------ the screen under construction

interface Admitted { readonly expr: Expr; readonly siblings: ReadonlySet<string>; readonly nodes: number; readonly reads: readonly DataPath[] }
interface Draft {
  /** The writer's name for the part: a label, or pickN when editing. */
  readonly name: string;
  readonly id: PartId;
  readonly statements: Map<string | null, Admitted>;
  /** Placeholders already on the wire for siblings referenced but not yet admitted. */
  readonly placed: Set<string>;
  closed: boolean;
}

class Screen {
  private readonly drafts = new Map<string, Draft>();
  private readonly order: string[] = [];
  /** Sub-statements that arrived before their part statement. */
  private readonly early = new Map<string, Map<string, Admitted>>();
  private readonly fallbacks: CompiledPart[] = [];
  private nextId: number;
  /** Whether the writer may start parts under new labels this turn (false when it may only rewrite editable parts). */
  allowNew = true;
  private admitted = 0;
  private screenNodes = 0;

  constructor(private readonly source: ScreenSource, private readonly pack: ScreenPack, private readonly report: (issue: ProgramIssue) => void, private readonly hooks: CompileHooks) {
    this.nextId = Math.max(0, ...source.base.map(part => Number(part.id.slice(4)))) + 1;
  }

  /** The first text on the wire: kept base parts and the root over them. */
  opening(): string {
    return [printStatement("d", query(this.source.run, this.pack.tool)), ...this.source.base.flatMap(part => [...part.statements].map(([name, expr]) => printStatement(name, expr))), this.root()].join("\n") + "\n";
  }

  /** The deterministic screen the fallbacks would make: the skeleton before the writer starts. */
  preview(questions: readonly QuestionId[]): string {
    const parts = questions.map((q, i) => [`preview${i}`, this.pack.fallback(q, this.source.values)] as const);
    return [`root = Screen([${parts.map(([id]) => id).join(", ")}])`, printStatement("d", query(this.source.run, this.pack.tool)), ...parts.map(([id, expr]) => printStatement(id, expr))].join("\n") + "\n";
  }

  admit(raw: string): void {
    const parsed = parseName(raw, this.source);
    if ("code" in parsed) { this.report(parsed); return; }
    const { owner, sub, text } = parsed;
    let expr: Expr;
    try { expr = parseStatement(text).expr; }
    catch (error) { this.report(fail("invalid-statement", error instanceof Error ? error.message : String(error), owner + (sub ? `_${sub}` : ""))); return; }
    const name = owner + (sub ? `_${sub}` : "");
    const result = validate(expr, owner, this.source, this.pack, name);
    if ("issues" in result) { result.issues.forEach(this.report); return; }
    if (this.screenNodes + result.nodes > LIMITS.nodesPerScreen) { this.report(fail("screen-budget", `The screen exceeds ${LIMITS.nodesPerScreen} nodes`, name)); return; }
    let draft = this.drafts.get(owner);
    if (!draft && sub !== null) {
      const waiting = this.early.get(owner) ?? new Map<string, Admitted>();
      waiting.set(sub, result);
      this.early.set(owner, waiting);
      return;
    }
    if (!draft) {
      if (!PICK.test(owner) && !this.allowNew) { this.report(fail("no-new-parts", "This turn only rewrites the editable parts; every question is already shown", name)); return; }
      if (this.order.length - this.source.base.filter(p => !this.source.editable.has(p.id)).length >= LIMITS.parts) { this.report(fail("part-budget", `At most ${LIMITS.parts} parts`, name)); return; }
      const id = PICK.test(owner) ? owner as PartId : `pick${this.nextId++}` as PartId;
      draft = { name: owner, id, statements: new Map(), placed: new Set(), closed: false };
      this.drafts.set(owner, draft);
      if (!this.order.includes(owner)) this.order.push(owner);
      for (const [key, early] of this.early.get(owner) ?? []) draft.statements.set(key, early);
      this.early.delete(owner);
    }
    if (draft.closed && draft.statements.has(sub)) { this.report(fail("duplicate-statement", "This statement was already admitted", name)); return; }
    if (draft.statements.size >= LIMITS.statementsPerPart) { this.report(fail("part-budget", `At most ${LIMITS.statementsPerPart} statements per part`, name)); return; }
    if ([...draft.statements.values(), result].reduce((n, s) => n + s.nodes, 0) > LIMITS.nodesPerPart) { this.report(fail("part-budget", `A part may expand to at most ${LIMITS.nodesPerPart} nodes`, name)); return; }
    draft.statements.set(sub, result);
    this.admitted++;
    this.screenNodes += result.nodes;
    this.emit(draft);
  }

  /** Parts the writer started but did not finish. */
  open(): { name: string; missing: string[] }[] {
    return [...this.drafts.values()].filter(d => !this.complete(d)).map(d => ({ name: d.name, missing: this.missing(d) }));
  }

  /** Required questions no finished part shows yet. */
  gaps(): readonly RequiredQuestion[] {
    const evidence = this.evidence(this.finished().map(p => p.evidence));
    return this.source.required.filter(q => !this.pack.shows(q.id, evidence.get(q.id) ?? [], this.source.values));
  }

  finish(usage: WriterUsage, run: { written: number; repairRounds: number; writerCalled: boolean }): CompiledScreen {
    for (const part of this.open()) this.report(fail("part-incomplete", `Dropped: missing ${part.missing.join(", ") || "its part statement"}`, part.name));
    for (const q of this.gaps()) {
      this.report({ source: "coverage", code: "question-fallback", message: `${q.id} was not shown by the writer; the server added its default part`, statementId: q.id });
      const expr = this.pack.fallback(q.id, this.source.values);
      const id = `pick${this.nextId++}` as PartId;
      const statements = hoist(id, new Map([[id, expr]]));
      this.fallbacks.push({ id, statements, evidence: evidenceOf(statements.values(), this.source.values, this.pack), origin: { kind: "fallback", question: q.id } });
    }
    const parts = this.parts();
    const program = [this.root(parts), printStatement("d", query(this.source.run, this.pack.tool)), ...parts.flatMap(p => [...p.statements].map(([name, expr]) => printStatement(name, expr)))].join("\n") + "\n";
    programTree(program, this.source.values);
    const coverage = new Map<QuestionId, PartId[]>();
    for (const q of this.source.required) coverage.set(q.id, parts.filter(p => p.evidence.has(q.id)).map(p => p.id));
    return { program, parts, coverage, issues: [], stats: { written: run.written, admitted: this.admitted, parts: parts.length, fallbacks: this.fallbacks.length, repairRounds: run.repairRounds }, usage, writerCalled: run.writerCalled };
  }

  // -------------------------------------------------------------- internals

  private complete(draft: Draft): boolean { return draft.statements.has(null) && !this.missing(draft).length; }

  /** Siblings reachable from the part statement that are not admitted; a cycle counts as missing. */
  private missing(draft: Draft): string[] {
    if (!draft.statements.has(null)) return [];
    const missing: string[] = [];
    const seen = new Set<string>();
    const walk = (sub: string | null, path: readonly string[]) => {
      for (const sibling of draft.statements.get(sub)?.siblings ?? []) {
        if (path.includes(sibling)) { missing.push(`${draft.name}_${sibling} (cycle)`); continue; }
        if (!draft.statements.has(sibling)) { if (!seen.has(sibling)) missing.push(`${draft.name}_${sibling}`); seen.add(sibling); continue; }
        if (!seen.has(sibling)) { seen.add(sibling); walk(sibling, [...path, sibling]); }
      }
    };
    walk(null, []);
    return missing;
  }

  /** Append this part's newest statement (and placeholders for siblings it names) plus a root that includes it. */
  private emit(draft: Draft): void {
    if (!draft.statements.has(null)) return;
    const lines: string[] = [];
    const reachable = this.reachable(draft);
    for (const sub of reachable) {
      const statement = draft.statements.get(sub);
      const global = sub === null ? draft.id : `${draft.id}_${sub}`;
      if (statement) {
        if (!draft.placed.has(`=${sub}`)) { lines.push(printStatement(global, rename(statement.expr, draft))); draft.placed.add(`=${sub}`); }
      } else if (!draft.placed.has(sub ?? "")) { lines.push(printStatement(global, PLACEHOLDER)); draft.placed.add(sub ?? ""); }
    }
    draft.closed = this.complete(draft);
    if (lines.length) this.hooks.program?.(lines.join("\n") + "\n" + this.root() + "\n");
  }

  /** The part statement and every sibling reachable from it, in first-reference order. */
  private reachable(draft: Draft): (string | null)[] {
    const out: (string | null)[] = [null];
    for (let i = 0; i < out.length; i++) for (const sibling of draft.statements.get(out[i]!)?.siblings ?? []) if (!out.includes(sibling)) out.push(sibling);
    return out;
  }

  private finished(): CompiledPart[] {
    return this.order.flatMap(name => {
      const draft = this.drafts.get(name);
      if (draft && this.complete(draft)) {
        const statements = hoist(draft.id, new Map(this.reachable(draft).map(sub => [sub === null ? draft.id : `${draft.id}_${sub}`, rename(draft.statements.get(sub)!.expr, draft)])));
        return [{ id: draft.id, statements, evidence: evidenceOf(statements.values(), this.source.values, this.pack), origin: { kind: "writer" } as const }];
      }
      return [];
    });
  }

  private parts(): CompiledPart[] {
    const written = new Map(this.finished().map(p => [p.id, p]));
    const kept = this.source.base.map(base => written.get(base.id) ?? { id: base.id, statements: base.statements, evidence: evidenceOf(base.statements.values(), this.source.values, this.pack), origin: { kind: "kept" } as const });
    const keptIds = new Set(kept.map(p => p.id));
    return [...kept, ...[...written.values()].filter(p => !keptIds.has(p.id)), ...this.fallbacks];
  }

  private evidence(parts: readonly Evidence[]): Map<QuestionId, DataPath[]> {
    const union = new Map<QuestionId, DataPath[]>();
    // Base parts count until the writer replaces them; an editable part left alone still shows what it showed.
    const replaced = new Set(this.finished().map(p => p.id));
    for (const evidence of [...this.source.base.filter(b => !replaced.has(b.id)).map(b => evidenceOf(b.statements.values(), this.source.values, this.pack)), ...parts])
      for (const [q, reads] of evidence) union.set(q, [...(union.get(q) ?? []), ...reads]);
    return union;
  }

  /** The root over kept base parts and every writer part whose part statement is on the wire. */
  private root(parts?: readonly CompiledPart[]): string {
    const ids = parts ? parts.map(p => p.id) : [
      ...this.source.base.map(b => b.id),
      ...this.order.map(name => this.drafts.get(name)).filter((d): d is Draft => !!d && d.statements.has(null) && !this.source.base.some(b => b.id === d.id)).map(d => d.id),
    ];
    return `root = Screen([${ids.join(", ")}])`;
  }
}

// ------------------------------------------------------------------ names and statements

function parseName(raw: string, source: ScreenSource): { owner: string; sub: string | null; text: string } | ProgramIssue {
  const match = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=/.exec(raw);
  const name = match?.[1];
  if (!name) return fail("bad-name", "Each statement must be `name = Expression`", "unknown");
  if (name === "root" || name === "d") return fail("reserved-name", `${name} is written by the server`, name);
  const sub = SUB.exec(name);
  const owner = sub ? sub[1]! : name;
  if (PICK.test(owner) && !source.editable.has(owner as PartId)) return fail("locked-part", `${owner} is not editable in this turn; name new parts with a lowercase label`, name);
  if (!sub && !LABEL.test(name)) return fail("bad-name", "Part names are lowerCamel labels; sub-statements are label_name", name);
  return { owner, sub: sub ? sub[2]! : null, text: raw };
}

function parseStatement(raw: string): { id: string; expr: Expr } {
  if (autoClose(raw).wasIncomplete) throw new Error("Incomplete statement");
  const statements = split(tokenize(raw));
  const statement = statements[0];
  if (statements.length !== 1 || !statement) throw new Error("Expected one statement");
  return { id: statement.id, expr: parseExpression(statement.tokens) };
}

/** Global names: label → pickN, label_x → pickN_x. */
function rename(expr: Expr, draft: Pick<Draft, "name" | "id">): Expr {
  return mapExpr(expr, e => e.k === "Ref" && e.n.startsWith(`${draft.name}_`) ? { k: "Ref", n: `${draft.id}_${e.n.slice(draft.name.length + 1)}` } : e);
}

/** A Calculation nested inside a statement moves to its own `pickN_calcK` statement, so it always has a statementId. */
function hoist(id: PartId, statements: ReadonlyMap<string, Expr>): ReadonlyMap<string, Expr> {
  const out = new Map<string, Expr>();
  let next = 0;
  const lift = (expr: Expr, top: boolean): Expr => {
    if (expr.k === "Comp" && expr.name === "Calculation" && !top) {
      const name = `${id}_calc${++next}`;
      out.set(name, { ...expr, args: expr.args.map(arg => lift(arg, false)) });
      return { k: "Ref", n: name };
    }
    if (expr.k === "Comp") return { ...expr, args: expr.args.map(arg => lift(arg, false)) };
    if (expr.k === "Arr") return { ...expr, els: expr.els.map(el => lift(el, false)) };
    return expr;
  };
  for (const [name, expr] of statements) out.set(name, lift(expr, true));
  return new Map([...statements.keys()].map(name => [name, out.get(name)!] as const).concat([...out].filter(([name]) => !statements.has(name))));
}

function mapExpr(expr: Expr, f: (e: Expr) => Expr): Expr {
  const e = f(expr);
  switch (e.k) {
    case "Comp": return { ...e, args: e.args.map(arg => mapExpr(arg, f)) };
    case "Arr": return { ...e, els: e.els.map(el => mapExpr(el, f)) };
    case "Obj": return { ...e, entries: e.entries.map(([k, v]) => [k, mapExpr(v, f)] as [string, Expr]) };
    default: return e;
  }
}

function query(run: string, tool = "sports_dataset"): Expr {
  return { k: "Comp", name: "Query", args: [{ k: "Str", v: tool }, { k: "Obj", entries: [["run", { k: "Str", v: run }]] }, { k: "Obj", entries: [] }] };
}

// ------------------------------------------------------------------ admission

const fail = (code: string, message: string, statementId: string, component?: string, path?: string): ProgramIssue => ({ source: "parser", code, message, statementId, ...(component ? { component } : {}), ...(path ? { path } : {}) });
const isReference = (e: Expr): boolean => e.k === "Ref" || e.k === "RuntimeRef" || e.k === "Member" || e.k === "Index";

interface Bound { readonly value: unknown; readonly path: DataPath }

/** A data reference's value and its dataset path; item variables carry the path of their list with a null segment. */
function resolve(e: Expr, scope: ReadonlyMap<string, Bound>): Bound {
  if (e.k === "Ref" || e.k === "RuntimeRef") {
    const bound = scope.get(e.n);
    if (!bound) throw new Error(`Reference ${e.n} is not data in this statement`);
    return bound;
  }
  if (e.k !== "Member" && e.k !== "Index") throw new Error("Only direct dataset references are allowed");
  const parent = resolve(e.obj, scope);
  const key = e.k === "Member" ? e.field : e.index.k === "Num" && Number.isSafeInteger(e.index.v) && e.index.v >= 0 ? e.index.v : null;
  if (key === null || ["__proto__", "prototype", "constructor"].includes(String(key)) || parent.value === null || typeof parent.value !== "object" || !Object.hasOwn(parent.value, key)) throw new Error(`Missing data path ${printExpr(e)}`);
  return { value: Reflect.get(parent.value, key), path: [...parent.path, key] };
}

function literal(e: Expr): unknown {
  switch (e.k) {
    case "Str": case "Num": case "Bool": return e.v;
    case "Null": return null;
    case "Arr": return e.els.map(literal);
    case "Obj": return Object.fromEntries(e.entries.map(([key, value]) => [key, literal(value)]));
    default: throw new Error("Expected a literal or a direct data reference");
  }
}

/**
 * Template macros as primitives. The writer's own components must be writer primitives; a template's
 * output is trusted to use the template-only ones (Calculation and the controls it scopes).
 */
function expandTemplates(e: Expr, pack: ScreenPack): Expr {
  switch (e.k) {
    case "Comp":
      if (e.name === "Each" && !e.fn) return { ...e, args: e.args.map(arg => expandTemplates(arg, pack)) };
      if (!e.fn && PRIMITIVE_BY_NAME.has(e.name)) {
        if (!WRITER_SET.has(e.name)) throw new Error(`${e.name} is not available to the writer`);
        return { ...e, args: e.args.map(arg => expandTemplates(arg, pack)) };
      }
      if (e.fn) throw new Error(`@${e.name} is not available to the writer`);
      {
        const expanded = pack.expand(e);
        if (!expanded) throw new Error(`${e.name} is neither a primitive nor a template`);
        return expanded;
      }
    case "Arr": return { ...e, els: e.els.map(el => expandTemplates(el, pack)) };
    case "Obj": return { ...e, entries: e.entries.map(([k, v]) => [k, expandTemplates(v, pack)] as [string, Expr]) };
    default: return e;
  }
}

/**
 * One writer statement: templates expanded, then every node checked against the primitive library
 * per @Each item. Data props are dataset references; a bare Ref in a node position names a sibling
 * of the same part.
 */
function validate(raw: Expr, owner: string, source: ScreenSource, pack: ScreenPack, name: string): Admitted | { issues: ProgramIssue[] } {
  const issues: ProgramIssue[] = [];
  const report = (code: string, message: string, component?: string, path?: string) => issues.push(fail(code, message, name, component, path));
  let expr: Expr;
  try { expr = expandTemplates(raw, pack); }
  catch (error) { return { issues: [fail("template", error instanceof Error ? error.message : String(error), name)] }; }
  const siblings = new Set<string>();
  const reads = new Map<string, DataPath>();
  let visited = 0;
  const read = (path: DataPath) => reads.set(JSON.stringify(path), path);
  const visit = (e: Expr, scope: ReadonlyMap<string, Bound>, accepts: readonly string[] | "any", container: Extract<Expr, { k: "Comp" }> | null): void => {
    if (++visited > LIMITS.nodesPerPart) { if (visited === LIMITS.nodesPerPart + 1) report("part-budget", `The statement expands past ${LIMITS.nodesPerPart} nodes`); return; }
    if (e.k === "Arr") { e.els.forEach(child => visit(child, scope, accepts, container)); return; }
    if (e.k === "Ref" && !scope.has(e.n)) {
      const sibling = SUB.exec(e.n);
      if (!sibling || sibling[1] !== owner) { report("foreign-ref", `${e.n} is not a sub-statement of ${owner}; parts cannot contain other parts`); return; }
      siblings.add(sibling[2]!);
      return;
    }
    if (e.k !== "Comp") { report("type-mismatch", "Children must be components or this part's sub-statements"); return; }
    if (e.name === "Each") {
      const [list, variable, template] = e.args;
      try {
        if (!list || !isReference(list) || variable?.k !== "Str" || !/^[a-z][A-Za-z0-9]*$/.test(variable.v) || scope.has(variable.v) || !template || e.args.length !== 3) throw new Error("Invalid or shadowed @Each binding");
        const bound = resolve(list, scope);
        if (!Array.isArray(bound.value)) throw new Error("@Each source must be a data list");
        read(bound.path);
        const layout: ListContainer = container?.name === "Grid" ? "grid" : container?.name === "Rail" ? "rail" : container?.name === "Stack" && container.args[0]?.k === "Str" && container.args[0].v === "wrap" ? "text" : "list";
        const problem = pack.listProblem(bound.path, bound.value.length, layout, source.explicitLayout);
        if (problem) throw new Error(`Collection layout: ${problem}`);
        // An empty list renders nothing; its template has no item to check against.
        for (const item of bound.value) {
          if (visited > LIMITS.nodesPerPart) break;
          visit(template, new Map(scope).set(variable.v, { value: item, path: [...bound.path, null] }), accepts, container);
        }
      } catch (error) { report("invalid-binding", error instanceof Error ? error.message : String(error)); }
      return;
    }
    if (e.fn || !WRITER_SET.has(e.name) && !TEMPLATE_ONLY.has(e.name)) { report("unknown-component", `${e.name} is not available`); return; }
    if (accepts !== "any" && !accepts.includes(e.name)) { report("slot-accepts", `${e.name} is not accepted here`); return; }
    const def = PRIMITIVE_BY_NAME.get(e.name)!;
    const props = Object.entries(def.props);
    if (e.args.length > props.length) report("excess-args", `Too many arguments to ${e.name}`, e.name);
    props.forEach(([prop, spec], index) => {
      const value = e.args[index];
      if (!value || value.k === "Null") {
        if (!spec.optional) report("missing-required", `${e.name}.${prop} is required`, e.name, prop);
        return;
      }
      const meta = spec.meta;
      if (meta.role === "node" || meta.role === "nodes") {
        if (meta.role === "node" && value.k === "Arr") report("type-mismatch", `${prop} accepts one child`, e.name, prop);
        // An @Each counts as the items it renders.
        const width = (el: Expr) => { if (el.k !== "Comp" || el.name !== "Each" || !el.args[0]) return 1; try { const list = resolve(el.args[0], scope).value; return Array.isArray(list) ? list.length : 1; } catch { return 1; } };
        const count = value.k === "Arr" ? value.els.reduce((n, el) => n + width(el), 0) : width(value);
        if (meta.role === "nodes" && ((meta.min !== undefined && count < meta.min) || (meta.max !== undefined && count > meta.max))) report("slot-count", `Invalid child count for ${e.name}.${prop}`, e.name, prop);
        visit(value, scope, meta.accepts, e);
        return;
      }
      try {
        if (meta.role === "data" && !isReference(value)) throw new Error(`${e.name}.${prop} must reference data (d.<path> or an @Each item)`);
        let resolved: unknown;
        if (isReference(value)) { const bound = resolve(value, scope); resolved = bound.value; read(bound.path); }
        else resolved = literal(value);
        if (typeof spec.schema === "function") throw new Error("Unexpected child schema");
        const checked = spec.schema.safeParse(resolved);
        if (!checked.success) throw new Error(`${e.name}.${prop}: ${checked.error.issues.map(issue => issue.message).join("; ")}`);
        if (meta.role === "copy" && meta.kind === "action") throw new Error("Actions are not permitted in generated content");
        if ((meta.role === "copy" || meta.role === "data") && meta.kind === "icon" && typeof resolved === "string") {
          const problem = iconProblem(resolved);
          if (problem) throw new Error(problem);
        }
      } catch (error) { report("type-mismatch", error instanceof Error ? error.message : String(error), e.name, prop); }
    });
  };
  // The statement's own value: a component, or a list of components for a list-valued sub-statement.
  const top = expr;
  if (top.k !== "Comp" && top.k !== "Arr") return { issues: [fail("type-mismatch", "A statement must be a component or a list of components", name)] };
  const parsed = slotLibrary([...WRITER_PRIMITIVES, ...TEMPLATE_ONLY] as PrimitiveName[]).parser.parse(`root = Slot(${printExpr(top.k === "Arr" ? top : { k: "Arr", els: [top] })})`);
  if (parsed.queryStatements.length || parsed.mutationStatements.length || Object.keys(parsed.stateDeclarations).length) report("forbidden-runtime", "Generated content cannot declare queries, mutations, or state");
  visit(top, new Map([["d", { value: source.values, path: [] }]]), "any", null);
  if (issues.length) return { issues };
  return { expr, siblings, nodes: visited, reads: [...reads.values()] };
}

/** Every data read in an expression, as dataset paths (null for each item of an @Each). */
function readsOf(expr: Expr): DataPath[] {
  const reads: DataPath[] = [];
  const pathOf = (e: Expr, scope: ReadonlyMap<string, DataPath>): DataPath | null => {
    if (e.k === "Ref" || e.k === "RuntimeRef") return scope.get(e.n) ?? null;
    if (e.k === "Member") { const parent = pathOf(e.obj, scope); return parent ? [...parent, e.field] : null; }
    if (e.k === "Index" && e.index.k === "Num") { const parent = pathOf(e.obj, scope); return parent ? [...parent, e.index.v] : null; }
    return null;
  };
  const walk = (e: Expr, scope: ReadonlyMap<string, DataPath>): void => {
    const path = pathOf(e, scope);
    if (path) { reads.push(path); return; }
    if (e.k === "Comp") {
      if (e.name === "Each") {
        const [list, variable, template] = e.args;
        const source = list ? pathOf(list, scope) : null;
        if (source && variable?.k === "Str" && template) { reads.push(source); walk(template, new Map(scope).set(variable.v, [...source, null])); }
        return;
      }
      e.args.forEach(arg => walk(arg, scope));
    } else if (e.k === "Arr") e.els.forEach(el => walk(el, scope));
    else if (e.k === "Obj") e.entries.forEach(([, v]) => walk(v, scope));
  };
  walk(expr, new Map([["d", []]]));
  return reads;
}

function groupEvidence(reads: readonly DataPath[], pack: ScreenPack): Evidence {
  const evidence = new Map<QuestionId, DataPath[]>();
  for (const path of reads) {
    const hit = pack.evidenceOf(path);
    if (hit) evidence.set(hit.question, [...(evidence.get(hit.question) ?? []), hit.rest]);
  }
  return evidence;
}

// ------------------------------------------------------------------ the writer's briefing

function writerMessages(source: ScreenSource, pack: ScreenPack, allowNew: boolean): Message[] {
  const signatures = generateSystemPrompt(slotLibrary(WRITER_PRIMITIVES).library.toSpec());
  // The signatures name token types; these are their only values (the closed ground rules).
  const tokens = (Object.keys(TOKEN_SCHEMA) as (keyof typeof TOKEN_SCHEMA)[]).map(key => `${TOKEN_IDS[key]} = ${((z.toJSONSchema(TOKEN_SCHEMA[key]) as { enum?: unknown[] }).enum ?? []).map(v => JSON.stringify(v)).join(" | ")}`).join("\n");
  const editing = source.editable.size ? `\nThis turn edits a saved screen. You may rewrite these existing parts by writing their own names (${[...source.editable].join(", ")}, with sub-statements ${[...source.editable].map(id => `${id}_x`).join(", ")}); a rewritten part replaces the old one completely. Every other existing part stays as it is; new parts use new labels and go after them.` : "";
  const current = source.base.filter(part => source.editable.has(part.id)).map(part => [...part.statements].map(([name, expr]) => printStatement(name, expr)).join("\n")).join("\n\n");
  return [{ role: "system", content: `You compose a mobile screen in OpenUI Lang that answers the user's request from the supplied data.
Write one statement per line. Each part of the screen is a statement named with a lowerCamel label (\`quarters = Section(...)\`); split a large part into sub-statements named label_name (\`quarters_table = Card(...)\`) and reference them by name from the part. Write the part statement first, then its sub-statements top-down. Parts appear in the order you write them. Never write root, d, Screen, queries, mutations, state or actions; never reference another part.
Data props must reference the data: d.<path> or an @Each item (\`@Each(d.answers.q1.periods, "p", EarningsCard(p))\`); never type figures as literals in data props. Copy (titles, labels) is plain text; do not invent figures in it.
Answer every question in the briefing: each must be shown by reading its answer data (d.answers.<id>). An answer marked partial or unavailable must show its note.
Templates are optional: call one by name with data that fits it, or copy its structure and change it. Use only token values the signatures allow.
At most ${LIMITS.parts} parts, ${LIMITS.statementsPerPart} statements per part, ${LIMITS.nodesPerPart} nodes per part after @Each expansion.${editing}

Primitives:
${signatures}

Token values (use only these):
${tokens}

Templates:
${pack.templates}` },
  { role: "user", content: `Request: ${source.request}\n\n${pack.briefing(source)}${current ? `\n\n# Parts you may rewrite (current statements)\n${current}` : ""}` }];
}

// ------------------------------------------------------------------ streaming statements

/** Splits streamed text into statements at newlines outside brackets and strings. */
export class StatementStream {
  private pending = "";
  private depth = 0;
  private quoted = false;
  private escaped = false;
  push(delta: string): string[] {
    const completed: string[] = [];
    for (const char of delta) {
      this.pending += char;
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (char === "\\") this.escaped = true;
        else if (char === '"') this.quoted = false;
      } else if (char === '"') this.quoted = true;
      else if ("([{".includes(char)) this.depth++;
      else if (")]}".includes(char)) this.depth = Math.max(0, this.depth - 1);
      if (char === "\n" && this.depth === 0 && !this.quoted) {
        if (this.pending.trim()) completed.push(this.pending.trim());
        this.pending = "";
      }
    }
    return completed;
  }
  end(): string[] { const rest = this.pending.trim(); this.pending = ""; return rest ? [rest] : []; }
}

