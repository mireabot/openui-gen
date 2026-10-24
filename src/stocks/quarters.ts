import { z } from "zod";
import { citationKey } from "../research/web-research.js";
import type { MockValue } from "../research/dataset-schema.js";
import type { MassiveSource, WebLookup } from "./data.js";

/**
 * Reported quarters from cited research: one search for the quarters and measures asked, extracted
 * into a row per quarter. The stock's move after each announcement is the only market data here,
 * computed from daily closes around the cited announcement date.
 */

export const MEASURES = {
  revenue: { label: "Revenue", ask: "revenue as reported" },
  revenueEstimate: { label: "Revenue est.", ask: "consensus revenue estimate before the report" },
  revenueSurprise: { label: "Revenue vs est.", ask: "revenue beat or miss against the consensus, as published" },
  eps: { label: "EPS", ask: "diluted EPS as reported" },
  epsEstimate: { label: "EPS est.", ask: "consensus EPS estimate before the report" },
  epsSurprise: { label: "EPS vs est.", ask: "EPS beat or miss against the consensus (e.g. \"Beat by $0.05\")" },
  grossMargin: { label: "Gross margin", ask: "gross margin percent" },
  operatingMargin: { label: "Operating margin", ask: "operating margin percent" },
  netIncome: { label: "Net income", ask: "net income" },
  guidance: { label: "Guidance", ask: "the guidance management gave with the report, against what analysts expected, in a few words" },
  move1d: { label: "Next-day move", ask: "" },
  move5d: { label: "5-day move", ask: "" },
} as const;
export type Measure = keyof typeof MEASURES;
export const MEASURE_NAMES = Object.keys(MEASURES) as [Measure, ...Measure[]];
export interface QuartersArgs { readonly periods: number; readonly measures: readonly Measure[] }

const MOVES: readonly Measure[] = ["move1d", "move5d"];
type Tone = "good" | "bad" | "neutral";
interface Cell { readonly display: string; readonly value: number | null; readonly tone: Tone }
const DAY = 86_400_000;
const DASH: Cell = { display: "—", value: null, tone: "neutral" };

/** A published figure as a cell: the text as published, its number when it has one, and beat/miss tone. */
function cellOf(text: string | null): Cell {
  if (!text?.trim()) return DASH;
  const display = text.trim();
  const match = /[-−+]?\$?\d[\d,]*(?:\.\d+)?/.exec(display);
  const number = match ? Number(match[0].replace(/[$,+]/g, "").replace("−", "-")) : NaN;
  const negative = /\bmiss|below|lower|cut|−|^-/i.test(display);
  const value = Number.isFinite(number) ? (negative && number > 0 && /\bmiss|below|lower|cut/i.test(display) ? -number : number) : null;
  return { display, value, tone: /\bbeat|above|raise/i.test(display) ? "good" : /\bmiss|below|cut|lower/i.test(display) ? "bad" : "neutral" };
}
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;

export async function quartersAnswer(ticker: string, name: string, args: QuartersArgs, ctx: { web: WebLookup; market: MassiveSource; now: Date; prompt: string; progress?: (detail: string) => void }): Promise<{ body: Record<string, MockValue>; status: "complete" | "partial"; note: string } | null> {
  const count = Math.min(Math.max(args.periods, 1), 12);
  const researched = args.measures.filter(m => !MOVES.includes(m));
  const today = ctx.now.toISOString().slice(0, 10);
  ctx.progress?.(`Researching ${ticker}'s last ${count} quarters`);
  const research = await ctx.web.research(`${name} (${ticker}): the last ${count} REPORTED fiscal quarters as of ${today}, newest first. For each quarter: the fiscal quarter as the company names it, the date results were announced, ${researched.map(m => MEASURES[m].ask).join("; ") || "headline results"}. Cite company releases, SEC filings or reputable financial press with dates.\nThe user's full request, for context: "${ctx.prompt}"`,
    { searchQueries: [`${ticker} quarterly results last ${count} quarters revenue EPS`, `${name} earnings history EPS estimate surprise`, `${ticker} quarterly earnings report ${today.slice(0, 4)}`] });
  const Values = z.object(Object.fromEntries(researched.map(m => [m, z.string().nullable()]))).strict();
  const Extract = z.object({ periods: z.array(z.object({ label: z.string(), announced: z.string().nullable(), values: Values }).strict()), sourceUrls: z.array(z.string()) }).strict();
  const facts = Extract.parse(await ctx.web.extract(`Turn the research findings into one row per reported fiscal quarter, newest first, at most ${count}. Use only figures the findings state with a cited URL; never compute or estimate. label: the fiscal quarter as the company names it ("Q1 FY27"). announced: the results announcement date as YYYY-MM-DD, or null. values: each figure exactly as published ("$11.21B", "$0.48", "42.8%", "Beat by $0.05"), or null when the findings do not state it. sourceUrls: the cited URLs the rows rely on.`, z.toJSONSchema(Extract), research));
  const cited = facts.sourceUrls.flatMap(url => research.sources.filter(s => citationKey(s.url) === citationKey(url)).slice(0, 1));
  if (!cited.length || !facts.periods.length) return null;
  const quarters = facts.periods.slice(0, count).reverse();

  const wantsMoves = args.measures.some(m => MOVES.includes(m));
  const dates = quarters.map(q => q.announced).filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  let closes: readonly { t: number; c: number }[] = [];
  if (wantsMoves && dates.length && ctx.market.daily) {
    const from = new Date(Date.parse(dates[0]!) - 7 * DAY).toISOString().slice(0, 10);
    const to = new Date(Math.min(Date.parse(dates.at(-1)!) + 12 * DAY, ctx.now.getTime())).toISOString().slice(0, 10);
    try { closes = await ctx.market.daily(ticker, from, to); }
    catch (error) { ctx.progress?.(`Daily closes for ${ticker} unavailable: ${(error as Error).message.slice(0, 160)}`); }
  }
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  /** From the close on the announcement day to the close `sessions` later (results usually come after the close). */
  const move = (date: string | null, sessions: number): Cell => {
    if (!date) return DASH;
    const at = closes.findIndex(c => day(c.t) >= date);
    const base = closes[at]?.c, after = closes[at + sessions]?.c;
    if (at < 0 || base === undefined || after === undefined) return DASH;
    const value = (after / base - 1) * 100;
    return { display: signed(value), value, tone: value > 0 ? "good" : value < 0 ? "bad" : "neutral" };
  };
  const source = `Source: ${[...new Set(cited.map(s => new URL(s.url).hostname.replace(/^www\./, "")))].slice(0, 3).join(", ")}`;
  const rows = quarters.map(q => {
    const cells = Object.fromEntries(args.measures.map(m => [m, m === "move1d" ? move(q.announced, 1) : m === "move5d" ? move(q.announced, 5) : cellOf((q.values as Record<string, string | null>)[m] ?? null)])) as Record<Measure, Cell>;
    const headline = args.measures.filter(m => cells[m].display !== "—").slice(0, 2).map(m => `${MEASURES[m].label} ${cells[m].display}`).join(" · ");
    return {
      // EarningsCard's fields, so the registered card can show each quarter.
      ticker, name, context: `Reported · ${q.label}`, when: [ticker, q.announced ? `reported ${q.announced}` : null].filter(Boolean).join(" · "),
      summary: headline || q.label, watch: "", hasWatch: false, source,
      stats: args.measures.map(m => ({ label: MEASURES[m].label, value: cells[m].display })),
      label: q.label, reportedOn: q.announced ?? "", measures: cells as unknown as MockValue,
    };
  });
  const missing = args.measures.filter(m => rows.some(r => (r.measures as unknown as Record<string, Cell>)[m]!.display === "—"));
  const series = Object.fromEntries(args.measures.flatMap(m => {
    const points = rows.flatMap(r => { const c = (r.measures as unknown as Record<string, Cell>)[m]!; return c.value === null ? [] : [{ label: r.label, value: Math.round(c.value * 100) / 100 }]; });
    return points.length >= 2 ? [[m, points]] : [];
  }));
  const note = [
    rows.length < count ? `${rows.length} of ${count} quarters were found in cited sources.` : "",
    missing.length ? `${missing.map(m => MEASURES[m].label).join(", ")} ${missing.length === 1 ? "is" : "are"} not stated for every quarter in the cited sources.` : "",
  ].filter(Boolean).join(" ");
  return {
    body: { title: `${name}: last ${rows.length} quarters`, columns: args.measures.map(m => ({ key: m, label: MEASURES[m].label })), periods: rows, series, source },
    status: note ? "partial" : "complete", note,
  };
}
