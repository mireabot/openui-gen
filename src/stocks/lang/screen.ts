import type { DataPath, DatasetValues, ListContainer, QuestionId, ScreenPack, ScreenSource } from "../../lang/compiler.js";
import { each, nodeOf, printExpr, refAt, ui, type Expr, type Node } from "../../lang/program.js";
import type { Answer, LookupKind } from "../answers.js";
import { collectionLayoutReason } from "./layout.js";
import { BasketBenchmark, BasketCard, BasketConcentration, BasketHoldings, BasketPerformance, BasketSet } from "./basket.js";
import { ConsensusMomentum, ConsensusQuote, ConsensusSet, ConsensusShift, ConsensusTarget } from "./consensus.js";
import { InvestmentExpectation } from "./investment.js";
import { ConsensusCard, PeerCards, StockQuote } from "./quotes.js";
import { EarningsCard, KeyStats, StockBenchmark, StockCard, StockHeader, StockStory } from "./stock.js";

/**
 * The stocks screen pack: registered cards as template macros the writer may call or copy, the
 * coverage rule per lookup, the count-driven list rule, and a default part per question.
 */

/** Template data is checked when the expansion is admitted, against the real values, not by these types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRef = any;
interface Template {
  /** Parameters after the data reference: an enum lists its allowed values, a string is free copy. */
  readonly params: readonly (readonly string[] | "copy" | "copy?")[];
  readonly fits: readonly LookupKind[] | "subject" | "period";
  readonly build: (data: AnyRef, args: readonly (string | null)[]) => Node;
}
const t = (fits: Template["fits"], params: Template["params"], build: Template["build"]): Template => ({ fits, params, build });
const LIST = ["list", "rail", "grid", "text"] as const;
const v = <T extends string>(arg: string | null | undefined) => arg as T;

/** Copy-free building blocks of the defaults, written once. */
const note = (text: AnyRef, tone: "neutral" | "warn" = "neutral", title?: AnyRef) => ui.Note({ text, tone, ...(title ? { title } : {}) });
const footnote = (content: AnyRef) => ui.Text({ content, role: "footnote", ink: "tertiary" });

export const TEMPLATES: Readonly<Record<string, Template>> = {
  StockHeader: t("subject", [], d => StockHeader(d)),
  StockCard: t("subject", [], d => StockCard(d)),
  StockStory: t("subject", [], d => StockStory(d)),
  StockQuote: t("subject", [["row", "tile", "widget", "chip"]], (d, [variant]) => StockQuote(d, v<"row" | "tile" | "widget" | "chip">(variant ?? "row"))),
  EarningsCard: t(["earnings"], [], d => EarningsCard(d)),
  KeyStats: t(["stats"], [["list", "grid", "text"], "copy"], (d, [variant, title]) => KeyStats(d, v(variant), title ?? "Key statistics")),
  StockBenchmark: t(["benchmark"], [], d => StockBenchmark(d)),
  PeerCards: t(["peers"], [LIST, "copy", "copy?"], (d, [variant, title, subtitle]) => PeerCards({ data: d, variant: v(variant), copy: { title: title ?? "Competitors", subtitle: subtitle ?? null } })),
  ConsensusCard: t(["consensus"], [["score", "verdict"]], (d, [variant]) => ConsensusCard({ data: d, variant: v(variant ?? "score") })),
  ConsensusShift: t(["consensus"], [], d => ConsensusShift(d)),
  ConsensusMomentum: t(["consensus"], [], d => ConsensusMomentum(d)),
  ConsensusTarget: t(["consensus"], [], d => ConsensusTarget(d)),
  ConsensusQuote: t(["consensus"], [["row", "tile", "chip"]], (d, [variant]) => ConsensusQuote(d, v(variant))),
  ConsensusSet: t(["consensus"], [["list", "grid", "text"], "copy", "copy?"], (d, [variant, title, subtitle]) => ConsensusSet(d, v(variant), { title: title ?? "Analysts", subtitle: subtitle ?? null })),
  BasketCard: t(["basket"], [["card", "rail", "grid", "row", "chip"]], (d, [variant]) => BasketCard(d, v(variant ?? "card"))),
  BasketSet: t(["basket"], [LIST, "copy", "copy?"], (d, [variant, title, subtitle]) => BasketSet(d, v(variant), { title: title ?? "Grouped assets", subtitle: subtitle ?? null })),
  BasketHoldings: t(["basket"], [["top", "disclosure"]], (d, [variant]) => BasketHoldings(d, v(variant ?? "top"))),
  BasketConcentration: t(["basket"], [], d => BasketConcentration(d)),
  BasketPerformance: t(["basket"], [], d => BasketPerformance(d)),
  BasketBenchmark: t(["basket"], [], d => BasketBenchmark(d)),
  InvestmentExpectation: t(["expectation"], [["ending", "narrative", "scenarios", "position", "comparison", "context"]], (d, [variant]) => InvestmentExpectation(d, v(variant ?? "ending"))),
  /** A cited web answer: summary, a table (rows with their column pairs), facts, quotes, source. */
  FindingCard: t(["web"], [], f => ui.Card({ children: [
    ui.Text({ content: f.title, role: "headline", weight: "semibold" }), ui.Text({ content: f.summary, role: "body" }),
    ui.Show({ when: f.hasTable, child: ui.Stack({ axis: "v", gap: 12, divided: true, children: each(f.rows, "r", (r: AnyRef) => ui.Stack({ axis: "v", gap: 8, children: [
      ui.Text({ content: r.label, role: "body", weight: "semibold" }), ui.Stack({ axis: "v", gap: 4, children: each(r.pairs, "c", (c: AnyRef) => ui.KeyValue({ label: c.label, value: c.value })) }),
    ] })) }) }),
    ui.Show({ when: f.hasFacts, child: ui.Stack({ axis: "v", gap: 0, divided: true, children: each(f.facts, "x", (x: AnyRef) => ui.KeyValue({ label: x.label, value: x.value })) }) }),
    ui.Show({ when: f.hasQuotes, child: ui.Stack({ axis: "v", gap: 8, children: each(f.quotes, "q", (q: AnyRef) => note(q.text, "neutral", q.by)) }) }),
    footnote(f.source),
  ] })),
  /** Reported quarters: each period with its requested figures as pills. */
  PeriodTable: t(["quarters"], [], a => ui.Card({ children: [
    ui.Text({ content: a.title, role: "headline", weight: "semibold" }),
    ui.Stack({ axis: "v", gap: 12, divided: true, children: each(a.periods, "p", (p: AnyRef) => ui.Stack({ axis: "v", gap: 8, children: [
      ui.Stack({ axis: "h", gap: 8, align: "center", justify: "between", children: [ui.Text({ content: p.label, role: "body", weight: "semibold" }), ui.Text({ content: p.when, role: "footnote", ink: "secondary", lines: 1 })] }),
      ui.Stack({ axis: "wrap", gap: 8, children: each(p.stats, "s", (s: AnyRef) => ui.Pill({ label: s.label, value: s.value })) }),
    ] })) }),
    footnote(a.source),
  ] })),
  /** ETF or 13F holders with their weight. */
  Holders: t(["etfHolders", "fundHolders"], [["list", "rail"], "copy"], (items, [variant, title]) => ui.Section({ title: title ?? "Holders", children: [variant === "rail"
    ? ui.Rail({ gap: 12, width: 170, children: each(items, "h", (h: AnyRef) => ui.Card({ children: [ui.Text({ content: h.name, role: "headline", weight: "semibold", lines: 2 }), ui.Text({ content: h.weight, role: "body" }), ui.Text({ content: h.detail, role: "footnote", ink: "tertiary", lines: 1 })] })) })
    : ui.Card({ children: [ui.Stack({ axis: "v", gap: 12, divided: true, children: each(items, "h", (h: AnyRef) => ui.Stack({ axis: "h", gap: 12, align: "start", justify: "between", children: [
      ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: h.name, role: "headline", weight: "semibold", lines: 2 }), ui.Text({ content: h.detail, role: "footnote", ink: "tertiary", lines: 1 })] }),
      ui.Text({ content: h.weight, role: "body", weight: "medium", align: "end" }),
    ] })) })] })] })),
  /** An honest gap: the question and why it has no answer. */
  UnavailableNote: t([], [], a => note(a.note, "neutral", a.question)),
};

const SIGNATURES = Object.entries(TEMPLATES).map(([name, template]) => `${name}(${[template.fits === "subject" ? "d.subject" : template.fits === "period" ? "period" : "answer", ...template.params.map(p => p === "copy" ? '"title"' : p === "copy?" ? '"subtitle"?' : p.map(x => `"${x}"`).join("|"))].join(", ")})${template.fits === "subject" || template.fits === "period" ? "" : template.fits.length ? ` · fits ${template.fits.join(", ")}` : ""}`).join("\n");

function expand(call: Extract<Expr, { k: "Comp" }>): Expr | null {
  const template = TEMPLATES[call.name];
  if (!template) return null;
  const [data, ...rest] = call.args;
  if (!data || !["Ref", "RuntimeRef", "Member", "Index"].includes(data.k)) throw new Error(`${call.name} takes a data reference first (d.<path> or an @Each item)`);
  if (rest.length > template.params.length) throw new Error(`${call.name} takes at most ${template.params.length + 1} arguments`);
  const args = template.params.map((param, i) => {
    const arg = rest[i];
    const value = !arg || arg.k === "Null" ? null : arg.k === "Str" ? arg.v : undefined;
    if (value === undefined) throw new Error(`${call.name} argument ${i + 2} must be a quoted string`);
    if (Array.isArray(param) && (value === null ? false : !param.includes(value))) throw new Error(`${call.name} variant must be one of ${param.join(", ")}`);
    if (Array.isArray(param) && value === null) return param[0]!;
    return value;
  });
  return template.build(refAt(data), args).expr;
}

// ------------------------------------------------------------------ coverage

const answerOf = (values: DatasetValues, q: QuestionId) => (values.answers as Record<string, Answer> | undefined)?.[q];
const startsWith = (path: DataPath, prefix: DataPath) => prefix.every((segment, i) => path[i] === segment);
/** Some read at or under `prefix`. */
const under = (reads: readonly DataPath[], ...prefix: DataPath) => reads.some(r => startsWith(r, prefix));
/** Every item of `list` has a read under `field`: through @Each (null) or a literal index per item. */
const everyItem = (reads: readonly DataPath[], answer: Answer, list: string, ...field: DataPath) => {
  const items = answer[list];
  if (!Array.isArray(items) || !items.length) return false;
  return under(reads, list, null, ...field) || items.every((_, i) => under(reads, list, i, ...field));
};
const anyOf = (...checks: boolean[]) => checks.some(Boolean);

function shows(q: QuestionId, reads: readonly DataPath[], values: DatasetValues): boolean {
  const answer = answerOf(values, q);
  if (!answer) return true;
  if (answer.status !== "complete" && !under(reads, "note")) return false;
  if (answer.status === "unavailable") return true;
  switch (answer.lookup) {
    case "web": return under(reads, "summary") || everyItem(reads, answer, "rows", "label") || everyItem(reads, answer, "facts", "value");
    case "quarters": {
      const columns = (answer.columns as { key: string }[] | undefined) ?? [];
      const labelled = anyOf(everyItem(reads, answer, "periods", "label"), everyItem(reads, answer, "periods", "context"), everyItem(reads, answer, "periods", "when"));
      const figures = everyItem(reads, answer, "periods", "stats") || columns.every(c => everyItem(reads, answer, "periods", "measures", c.key)) || everyItem(reads, answer, "periods", "summary");
      const charted = columns.every(c => under(reads, "series", c.key) || everyItem(reads, answer, "periods", "measures", c.key) || everyItem(reads, answer, "periods", "stats"));
      return labelled && figures || charted && columns.length > 0 && labelled;
    }
    case "peers": case "etfHolders": return everyItem(reads, answer, "items", "ticker") || everyItem(reads, answer, "items", "name");
    case "fundHolders": return everyItem(reads, answer, "items", "name");
    case "stats": return everyItem(reads, answer, "items", "value");
    case "earnings": return anyOf(under(reads, "summary"), under(reads, "stats"));
    case "consensus": return anyOf(under(reads, "verdict"), under(reads, "score"), under(reads, "sides"), under(reads, "target"), under(reads, "shift"), under(reads, "momentum"), under(reads, "items"));
    case "benchmark": return anyOf(under(reads, "comparison"), under(reads, "chart"));
    case "basket": return reads.length > 0;
    case "expectation": return reads.length > 0;
  }
}

/** Card collections follow the count rule: a list holds 1–5 items, a rail 6 or more. */
function listProblem(path: DataPath, count: number, container: ListContainer, explicit: ListContainer | null): string | null {
  return path.length === 3 && path[0] === "answers" && path[2] === "items" ? collectionLayoutReason(container, count, explicit) : null;
}

// ------------------------------------------------------------------ defaults

const call = (name: string, data: Expr, ...args: string[]): Extract<Expr, { k: "Comp" }> => ({ k: "Comp", name, args: [data, ...args.map(v => ({ k: "Str", v }) as Expr)] });
const at = (q: QuestionId, ...keys: string[]): Expr => [ "answers", q, ...keys].reduce<Expr>((obj, field) => ({ k: "Member", obj, field }), { k: "Ref", n: "d" });

/** The default part for a question: its lookup's template, with the note under it when the answer is partial. */
function fallback(q: QuestionId, values: DatasetValues): Expr {
  const answer = answerOf(values, q);
  if (!answer || answer.status === "unavailable") return expand(call("UnavailableNote", at(q)))!;
  const count = Array.isArray(answer.items) ? answer.items.length : 0;
  const listing = count >= 6 ? "rail" : "list";
  const subject = (values.subject as { ticker?: string } | undefined)?.ticker ?? "the company";
  const body: Extract<Expr, { k: "Comp" }> = (() => {
    switch (answer.lookup) {
      case "web": return call("FindingCard", at(q));
      case "quarters": return call("PeriodTable", at(q));
      case "peers": return call("PeerCards", at(q, "items"), listing, "Competitors");
      case "stats": return call("KeyStats", at(q, "items"), count >= 6 ? "grid" : "list", "Key statistics");
      case "earnings": return call("EarningsCard", at(q));
      case "consensus": return call("ConsensusCard", at(q), "score");
      case "benchmark": return call("StockBenchmark", at(q));
      case "etfHolders": return call("Holders", at(q, "items"), listing, `ETFs holding ${subject}`);
      case "fundHolders": return call("Holders", at(q, "items"), listing, `Funds holding ${subject}`);
      case "basket": return call("BasketCard", at(q), "card");
      case "expectation": return call("InvestmentExpectation", at(q), "ending");
    }
  })();
  const part = expand(body)!;
  return answer.status === "partial" ? ui.Stack({ axis: "v", gap: 16, children: [nodeOf(part), note(refAt(at(q, "note")), "warn")] }).expr : part;
}

// ------------------------------------------------------------------ the writer's briefing

/** Long lists and series trimmed for the prompt; the writer reads paths, not every value. */
function preview(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.length > 6 ? { items: value.length, first: value.slice(0, 2).map(v => preview(v, depth + 1)), last: preview(value.at(-1), depth + 1) } : value.map(v => preview(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, preview(v, depth + 1)]));
  return typeof value === "string" && value.length > 160 ? `${value.slice(0, 157)}…` : value;
}

function briefing(source: ScreenSource): string {
  const answers = (source.values.answers ?? {}) as Record<string, Answer>;
  const required = new Set(source.required.map(q => q.id));
  const lines = Object.entries(answers).map(([id, a]) => {
    const fits = Object.entries(TEMPLATES).filter(([, t]) => Array.isArray(t.fits) && t.fits.includes(a.lookup)).map(([name]) => name);
    const example = a.status === "unavailable" ? `UnavailableNote(d.answers.${id})` : printExpr(fallbackCall(id as QuestionId, a));
    return `## d.answers.${id}${required.has(id as QuestionId) ? " (must be shown)" : " (already on screen)"}
question: ${a.question}
lookup: ${a.lookup} · status: ${a.status}${a.note ? ` · note (show it): ${a.note}` : ""}
templates that fit: ${fits.join(", ") || "none"}${a.lookup === "quarters" ? " · each d.answers." + id + ".periods item also fits EarningsCard(p)" : ""} · default: ${example}
data: ${JSON.stringify(preview(a))}`;
  });
  return `# d.subject (identity and price; StockHeader(d.subject) / StockCard(d.subject) / StockQuote(d.subject, "row") fit it)
${JSON.stringify(preview(source.values.subject))}

# Answers
${lines.join("\n\n")}`;
}

function fallbackCall(q: QuestionId, a: Answer): Expr {
  const names: Record<LookupKind, string> = { web: "FindingCard", quarters: "PeriodTable", peers: "PeerCards", stats: "KeyStats", earnings: "EarningsCard", consensus: "ConsensusCard", benchmark: "StockBenchmark", etfHolders: "Holders", fundHolders: "Holders", basket: "BasketCard", expectation: "InvestmentExpectation" };
  return call(names[a.lookup], ["peers", "stats", "etfHolders", "fundHolders"].includes(a.lookup) ? at(q, "items") : at(q));
}

export const STOCKS_SCREEN: ScreenPack = {
  expand,
  evidenceOf: path => path[0] === "answers" && typeof path[1] === "string" && /^q\d+$/.test(path[1]) ? { question: path[1] as QuestionId, rest: path.slice(2) } : null,
  shows, listProblem, fallback, briefing,
  templates: SIGNATURES,
};
