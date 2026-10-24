import type { MockValue } from "../research/dataset-schema.js";

/** A closing price on one session; both series share the labels. */
export interface ClosePoint { readonly label: string; readonly value: number }

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}%`;

/**
 * One company against a benchmark (SPY by default) over the same sessions: both series indexed to %
 * change since the same base close, each one's return, and the gap in percentage points. Only aligned
 * data: the same labels in the same order, finite closes and positive bases, else null (the request's
 * coverage note then says the comparison is unavailable). Nothing is estimated.
 */
export function benchmarkRecord(input: {
  readonly subject: { readonly ticker: string; readonly base: number; readonly points: readonly ClosePoint[] };
  readonly benchmark: { readonly ticker: string; readonly name: string; readonly base: number; readonly points: readonly ClosePoint[] };
  readonly caption: string;
}): Record<string, MockValue> | null {
  const { subject, benchmark } = input;
  const aligned = subject.points.length >= 2 && subject.points.length === benchmark.points.length
    && subject.points.every((p, i) => p.label === benchmark.points[i]!.label && Number.isFinite(p.value) && Number.isFinite(benchmark.points[i]!.value))
    && subject.base > 0 && benchmark.base > 0;
  if (!aligned) return null;
  const indexed = (base: number, points: readonly ClosePoint[]) => points.map(p => ({ label: p.label, value: Math.round(10_000 * (p.value / base - 1)) / 100 }));
  const chart = indexed(subject.base, subject.points);
  const benchmarkChart = indexed(benchmark.base, benchmark.points);
  const subjectPct = chart.at(-1)!.value;
  const benchmarkPct = benchmarkChart.at(-1)!.value;
  const gap = Math.round(100 * (subjectPct - benchmarkPct)) / 100;
  return {
    ticker: subject.ticker, benchmarkTicker: benchmark.ticker, benchmarkName: benchmark.ticker,
    title: `${subject.ticker} vs ${benchmark.ticker}`,
    subjectReturn: pct(subjectPct), benchmarkReturn: pct(benchmarkPct),
    comparison: `${pct(gap).replace("%", " pts")} ${gap >= 0 ? "ahead of" : "behind"} ${benchmark.ticker}`,
    comparisonTone: gap > 0 ? "good" : gap < 0 ? "bad" : "neutral",
    chart, benchmarkChart, reference: 0, referenceLabel: "0%",
    caption: input.caption, benchmarkDetail: benchmark.name,
  };
}

/**
 * One fund's move against the benchmark over the sessions where both have a close (a fallback
 * provider may only price the tickers it was asked for, so the newest session can be missing).
 * Needs at least three shared sessions; otherwise the row says so instead of estimating.
 */
export function relativeMove(input: {
  readonly benchmark: string;
  /** The fund's own ticker: the benchmark itself (SPY holds most large caps) is labelled, not compared. */
  readonly ticker?: string;
  readonly sessions: readonly { readonly label: string; readonly fund: number | undefined; readonly benchmark: number | undefined }[];
}): { move: string; vsBenchmark: string; vsTone: string; window: string } {
  const shared = input.sessions.filter(s => Number.isFinite(s.fund) && Number.isFinite(s.benchmark) && s.fund! > 0 && s.benchmark! > 0);
  if (shared.length < 3) return { move: "Price history unavailable", vsBenchmark: `No ${input.benchmark} comparison`, vsTone: "neutral", window: "" };
  const first = shared[0]!, last = shared.at(-1)!;
  const fundPct = 100 * (last.fund! / first.fund! - 1);
  const benchPct = 100 * (last.benchmark! / first.benchmark! - 1);
  const gap = Math.round(100 * (fundPct - benchPct)) / 100;
  const versus = input.ticker === input.benchmark ? "The benchmark"
    : gap === 0 ? `In line with ${input.benchmark}`
    : `${pct(gap).replace("%", " pts")} ${gap > 0 ? "ahead of" : "behind"} ${input.benchmark}`;
  return {
    move: `${pct(fundPct)} ${first.label}–${last.label}`,
    vsBenchmark: versus,
    vsTone: input.ticker === input.benchmark || gap === 0 ? "neutral" : gap > 0 ? "good" : "bad",
    window: `${first.label} close to ${last.label} close`,
  };
}
