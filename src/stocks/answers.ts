import { z } from "zod";
import type { QuestionId } from "../lang/compiler.js";
import type { MockValue } from "../research/dataset-schema.js";
import { BASKET_KINDS, type BasketKind } from "./records/basket.js";
import { expectationRecord } from "./records/investment-expectation.js";
import { basketDataset } from "./baskets.js";
import { marketLabel, stocksDataset, type MassiveSource, type StocksDataset, type WebLookup } from "./data.js";
import { lookupFindings } from "./findings.js";
import { MEASURE_NAMES, quartersAnswer } from "./quarters.js";
import { CHART_RANGES, type ChartRange } from "./range.js";
import type { ResearchQuery, ResearchTopic } from "./research.js";
import { fieldsOf } from "./schema.js";

/**
 * Answers keyed by question. The dataset a screen reads is `{ subject, answers: { q1, q2, … } }`, so
 * a data path names the question it is evidence for (`answers.q3.periods[].…` → q3) and two questions
 * of the same kind never collide. Each answer is written once, by its lookup.
 */

export type AnswerStatus = "complete" | "partial" | "unavailable";
/** An answer: its question, how it was looked up, whether it is complete, the note to show when it is not, and its data. */
export type Answer = { readonly question: string; readonly lookup: LookupKind; readonly status: AnswerStatus; readonly note: string; readonly source: string } & Readonly<Record<string, MockValue>>;
export interface StocksValues { readonly subject: Record<string, MockValue>; readonly answers: Readonly<Record<QuestionId, Answer>> }

/** The subject the request is about: one company, or grouped assets (ETFs, funds, indices, themes). */
export const SubjectSchema = z.object({
  ticker: z.string().regex(/^[A-Z]{1,5}(\.[A-Z])?$/), name: z.string().min(1).max(120),
  kind: z.enum(BASKET_KINDS).nullable(), tickers: z.array(z.string().regex(/^[A-Z]{1,5}(\.[A-Z])?$/)).max(6),
  range: z.enum(CHART_RANGES).nullable(),
}).strict();
export type Subject = z.infer<typeof SubjectSchema>;

/** How each kind of question is answered. The planner's schema is derived from this list. */
export const LOOKUPS = {
  web: { describe: "Anything not fully answered by a structured lookup: commentary, guidance narrative, events, arguments, explanations, history, comparisons across companies.",
    args: z.object({ searchQueries: z.array(z.string().min(2).max(120)).max(3) }).strict() },
  quarters: { describe: "Reported results per fiscal quarter, from cited research: revenue, EPS, estimates and surprises, margins, net income, guidance, the stock's move after each report. For several quarters or a history of results.",
    args: z.object({ periods: z.number().int().min(1).max(12), measures: z.array(z.enum(MEASURE_NAMES)).min(1).max(12) }).strict() },
  peers: { describe: "Competitor companies with their live price and change.", args: z.object({ limit: z.number().int().min(1).max(10).nullable() }).strict() },
  stats: { describe: "Current single-value statistics (P/E, market cap, dividend yield, 52-week high).", args: z.object({ metrics: z.array(z.string().min(1).max(60)).min(1).max(16) }).strict() },
  earnings: { describe: "ONE earnings report, the next scheduled or the latest reported, with a few headline figures.", args: z.object({ period: z.enum(["latest", "upcoming"]) }).strict() },
  consensus: { describe: "The current analyst buy/hold/sell split, average price target, and recent shift.", args: z.object({}).strict() },
  etfHolders: { describe: "ETFs that hold the company and its weight in each; named ETFs are checked for membership.", args: z.object({ etfTickers: z.array(z.string().regex(/^[A-Z]{1,5}$/)).max(10) }).strict() },
  fundHolders: { describe: "Hedge funds, institutions or 13F filers holding the company and its share of their portfolios.", args: z.object({}).strict() },
  benchmark: { describe: "The subject's price performance against one benchmark ticker over the range.", args: z.object({ ticker: z.string().regex(/^[A-Z]{1,5}(\.[A-Z])?$/) }).strict() },
  basket: { describe: "A grouped asset's (ETF, fund, index, theme) holdings, allocation, performance and alternatives.", args: z.object({}).strict() },
  expectation: { describe: "What a position could be worth over a holding period under assumed returns.",
    args: z.object({ volume: z.number().nullable(), initialPrice: z.number().nullable(), months: z.number().nullable(), annualRate: z.number().nullable() }).strict() },
} as const;
export type LookupKind = keyof typeof LOOKUPS;
export const LOOKUP_KINDS = Object.keys(LOOKUPS) as [LookupKind, ...LookupKind[]];
export type Lookup = { [K in LookupKind]: { readonly kind: K } & z.infer<(typeof LOOKUPS)[K]["args"]> }[LookupKind];
export interface Question { readonly id: QuestionId; readonly text: string; readonly lookup: Lookup }

/** Typed lookups that the dataset fetcher already researches by topic; the question is their focus. */
const TOPIC: Partial<Record<LookupKind, ResearchTopic>> = { peers: "peers", stats: "stats", earnings: "earnings", consensus: "consensus", etfHolders: "etfExposure", fundHolders: "fundHolders", basket: "funds" };
const DEADLINE = { web: 60_000, quarters: 60_000 } as const;

export interface AnswerContext {
  readonly prompt: string;
  readonly now: Date;
  readonly web: WebLookup;
  readonly market: MassiveSource;
  readonly progress: (detail: string) => void;
}

/**
 * Every question at once, with the subject's quote. A lookup that fails, times out or comes back
 * uncited becomes an unavailable answer whose note the screen must show; nothing here throws for a
 * provider failure except the subject's own prices.
 */
export async function answerQuestions(subject: Subject, questions: readonly Question[], ctx: AnswerContext): Promise<StocksDataset> {
  const of = <K extends LookupKind>(kind: K) => questions.filter((q): q is Question & { lookup: Extract<Lookup, { kind: K }> } => q.lookup.kind === kind);
  const research: ResearchQuery[] = questions.flatMap(q => TOPIC[q.lookup.kind] ? [{ topic: TOPIC[q.lookup.kind]!, focus: q.text, searchQueries: [] }] : []);
  const benchmark = of("benchmark")[0]?.lookup.ticker;
  const earnings = of("earnings")[0];
  const stats = of("stats").flatMap(q => q.lookup.metrics);
  const etfTickers = of("etfHolders").flatMap(q => q.lookup.etfTickers);
  const baseTask: Promise<StocksDataset> = subject.kind
    ? basketDataset(subject.tickers.length ? subject.tickers : [subject.ticker], ctx.market, ctx.now, ctx.web, subject.kind as BasketKind, ctx.progress, benchmark, { marketInfo: false, research })
    : stocksDataset(subject.ticker, ctx.market, ctx.now, ctx.progress, {
      identity: { ticker: subject.ticker, name: subject.name, marketCap: null, cik: null }, webFirst: true, research, web: ctx.web,
      peers: of("peers").length > 0, stats: [...new Set(stats)], earnings: !!earnings, earningsPeriod: earnings?.lookup.period ?? "latest",
      consensus: of("consensus").length > 0, etfExposure: of("etfHolders").length > 0, etfTickers, fundHolders: of("fundHolders").length > 0,
      ...(benchmark ? { benchmark } : {}), ...(subject.range ? { range: subject.range as ChartRange } : {}),
    });
  const today = ctx.now.toISOString().slice(0, 10);
  const findingsTask = Promise.all(of("web").map(q => deadline(lookupFindings([{ question: q.text, searchQueries: q.lookup.searchQueries, template: null }], { ticker: subject.ticker, name: subject.name, marketCap: null, cik: null }, ctx.web, today, ctx.prompt, ctx.progress).then(r => r[0] ?? null), DEADLINE.web, null)));
  const quartersTask = Promise.all(of("quarters").map(q => deadline(quartersAnswer(subject.ticker, subject.name, q.lookup, { web: ctx.web, market: ctx.market, now: ctx.now, prompt: ctx.prompt, progress: ctx.progress }).catch(error => { ctx.progress(`Quarterly results unavailable: ${(error as Error).message.slice(0, 160)}`); return null; }), DEADLINE.quarters, null)));
  const [base, findings, quarters] = await Promise.all([baseTask, findingsTask, quartersTask]);
  const v = base.values as Record<string, MockValue>;
  const webAt = new Map(of("web").map((q, i) => [q.id, findings[i] ?? null]));
  const quartersAt = new Map(of("quarters").map((q, i) => [q.id, quarters[i] ?? null]));
  const answers: Record<QuestionId, Answer> = {};
  for (const q of questions) answers[q.id] = answerFor(q, subject, v, webAt.get(q.id) ?? null, quartersAt.get(q.id) ?? null, base, ctx.market);
  const values = { subject: v.subject as Record<string, MockValue>, answers } as unknown as Record<string, MockValue>;
  return { ...base, values, fields: fieldsOf({ subject: v.subject as MockValue }) };
}

/** One question's answer from a fetched dataset. Exported for the fixture export. */
export function answerFor(q: Question, subject: Subject, v: Record<string, MockValue>, finding: Record<string, MockValue> | null, quarters: Awaited<ReturnType<typeof quartersAnswer>>, base: StocksDataset, market: MassiveSource): Answer {
  const answer = (status: AnswerStatus, note: string, body: Record<string, MockValue>, source = ""): Answer => ({ ...body, question: q.text, lookup: q.lookup.kind, status, note, source: typeof body.source === "string" ? body.source : source });
  const missing = (message: string) => answer("unavailable", message, {});
  const list = (items: MockValue | undefined, limit?: number | null) => Array.isArray(items) && items.length ? { items: limit ? items.slice(0, limit) : items } : null;
  switch (q.lookup.kind) {
    case "web": return finding ? answer("complete", "", finding) : missing(`No cited sources answered this: ${q.text}`);
    case "quarters": return quarters ? answer(quarters.status, quarters.note, quarters.body) : missing(`Quarterly results for ${subject.ticker} are not available.`);
    case "peers": { const body = list(v.peers, q.lookup.limit); return body ? answer("complete", "", body) : missing(`No verified competitors were found for ${subject.ticker}.`); }
    case "stats": {
      // The fetcher already returns exactly the requested rows, in order, "Not available" where no source had one.
      const items = Array.isArray(v.stats) ? v.stats as Record<string, MockValue>[] : [];
      const absent = items.filter(s => s.value === "Not available").length;
      return items.length ? answer(absent ? "partial" : "complete", absent ? `${absent} of ${items.length} statistics are not available from the checked sources.` : "", { items }) : missing(`The requested statistics are not available for ${subject.ticker}.`);
    }
    case "earnings": return v.earnings ? answer("complete", "", v.earnings as Record<string, MockValue>) : missing(`Earnings details for ${subject.ticker} could not be verified from cited sources.`);
    case "consensus": return v.consensus ? answer("complete", "", { ...(v.consensus as Record<string, MockValue>), ...(Array.isArray(v.consensusSet) && v.consensusSet.length ? { items: v.consensusSet } : {}) }) : missing(`Analyst consensus for ${subject.ticker} could not be verified.`);
    case "etfHolders": {
      const body = list(v.etfExposure);
      return body ? answer("complete", "", body) : missing(base.etfSearchStatus === "not_found" ? `No verified ETF holdings containing ${subject.ticker} were found in the checked sources.` : `Could not verify which ETFs hold ${subject.ticker}.`);
    }
    case "fundHolders": { const body = list(v.fundHolders); return body ? answer("complete", "", body) : missing(`13F holder data for ${subject.ticker} is not available from the checked sources.`); }
    case "benchmark": return v.benchmark ? answer("complete", "", v.benchmark as Record<string, MockValue>) : missing(`${q.lookup.ticker} closes were not available for the same sessions as ${subject.ticker}.`);
    case "basket": return v.basket ? answer("complete", "", { ...(v.basket as Record<string, MockValue>), items: (v.baskets ?? []) as MockValue }) : missing(`Holdings for ${subject.ticker} are not available.`);
    case "expectation": {
      const s = v.subject as { name: string; ticker: string; price?: number | null };
      const group = v.basket as { chart?: { value: number }[] } | undefined;
      const price = q.lookup.initialPrice ?? s.price ?? group?.chart?.at(-1)?.value ?? null;
      return answer("complete", "", expectationRecord({ name: s.name, ticker: s.ticker, initialPrice: price, volume: q.lookup.volume,
        ...(q.lookup.months !== null ? { months: q.lookup.months } : {}), ...(q.lookup.annualRate !== null ? { annualRate: q.lookup.annualRate } : {}),
        priceCaption: q.lookup.initialPrice !== null ? "Initial price supplied in your request" : `Recorded ${base.asOf} close · ${marketLabel(market)}` }));
    }
  }
}

function deadline<T>(task: Promise<T>, ms: number, timedOut: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([task.finally(() => clearTimeout(timer)), new Promise<T>(resolve => { timer = setTimeout(() => resolve(timedOut), ms); })]);
}
