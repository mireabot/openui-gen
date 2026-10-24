import type { MockValue } from "../research/dataset-schema.js";

/** A price period the user named. Without one the chart is today's session or the past five days. */
export const CHART_RANGES = ["1W", "1M", "3M", "6M", "1Y", "YTD"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
type Close = { readonly t: number; readonly c: number };

const DAYS: Record<Exclude<ChartRange, "YTD">, number> = { "1W": 7, "1M": 31, "3M": 92, "6M": 183, "1Y": 366 };
const LABEL: Record<ChartRange, string> = { "1W": "Past week", "1M": "Past month", "3M": "Past 3 months", "6M": "Past 6 months", "1Y": "Past year", YTD: "Year to date" };
const DAY = 86_400_000;
const easternDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const short = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const round = (x: number) => Math.round(x * 100) / 100;
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The first day inside the range, and a fetch start a week earlier so the close before it is known. */
export function rangeWindow(range: ChartRange, lastDay: string): { start: string; from: string } {
  const end = Date.parse(`${lastDay}T12:00:00Z`);
  const start = range === "YTD" ? Date.parse(`${lastDay.slice(0, 4)}-01-01T12:00:00Z`) : end - DAYS[range] * DAY;
  return { start: new Date(start).toISOString().slice(0, 10), from: new Date(start - 7 * DAY).toISOString().slice(0, 10) };
}

/** The close before the range (the change baseline) and the closes inside it. Null under two points. */
export function rangeCloses(bars: readonly Close[], start: string): { base: Close; points: Close[] } | null {
  const before = bars.filter(bar => easternDay(bar.t) < start);
  const points = bars.filter(bar => easternDay(bar.t) >= start);
  return before.length && points.length >= 2 ? { base: before.at(-1)!, points } : null;
}

/** A company record redrawn over the range: chart, baseline and change all describe the same period. */
export function withRange(record: Record<string, MockValue>, range: ChartRange, closes: { base: Close; points: Close[] }): Record<string, MockValue> {
  const { base, points } = closes;
  const last = points.at(-1)!;
  const change = last.c - base.c;
  const { story: _story, ...rest } = record;
  return { ...rest,
    price: round(last.c), change: round(change), changePct: round((100 * change) / base.c),
    chart: points.map(bar => ({ label: short(bar.t), value: round(bar.c), session: "regular" })),
    reference: round(base.c), referenceLabel: `${short(base.t)} close ${usd(base.c)}`,
    chartCaption: `${LABEL[range]} · daily closes`,
  };
}

/** Both tickers' closes on the sessions they share, as labelled points for the benchmark record. */
export function sharedCloses(subject: { base: Close; points: Close[] }, benchmark: readonly Close[]) {
  const theirs = new Map(benchmark.map(bar => [easternDay(bar.t), bar.c]));
  const baseOther = theirs.get(easternDay(subject.base.t));
  const shared = subject.points.filter(bar => theirs.has(easternDay(bar.t)));
  if (baseOther === undefined || shared.length < 2) return null;
  return {
    subject: { base: subject.base.c, points: shared.map(bar => ({ label: short(bar.t), value: bar.c })) },
    benchmark: { base: baseOther, points: shared.map(bar => ({ label: short(bar.t), value: theirs.get(easternDay(bar.t))! })) },
  };
}

export const rangeLabel = (range: ChartRange) => LABEL[range];

/** The period named in the request's own words, for when the intent model leaves it out. */
export function rangeIn(prompt: string): ChartRange | null {
  if (/\bytd\b|year[- ]to[- ]date|since january|this year/i.test(prompt)) return "YTD";
  if (/(past|last|over the|recent)\s+(12 months|year)|\b1\s*y(ea)?r?\b|\byearly\b/i.test(prompt)) return "1Y";
  if (/\b(6|six)\s+months?\b|half[- ]a[- ]year/i.test(prompt)) return "6M";
  if (/\b(recent|past|last|few|couple of|several|3|three)\s+months\b|\b(last|past)\s+quarter\b/i.test(prompt)) return "3M";
  if (/\b(past|last|this)\s+month\b|\b30 days\b/i.test(prompt)) return "1M";
  if (/\b(past|last|this)\s+week\b|\b5 days\b/i.test(prompt)) return "1W";
  return null;
}
