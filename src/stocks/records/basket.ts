import type { MockValue } from "../../research/dataset-schema.js";
import { assetLogoPath } from "./asset-logo.js";

export const BASKET_KINDS = ["ETF", "Fund", "Bond fund", "Index", "Theme"] as const;
export type BasketKind = (typeof BASKET_KINDS)[number];
export interface BasketHolding { name: string; ticker?: string; weight: number | null; move: number | null }
export interface BasketPeriod { label: string; base: number; points: readonly { label: string; value: number }[]; caption: string; benchmark?: { name: string; base: number; points: readonly { label: string; value: number }[] } }
export interface BasketInput { name: string; short?: string; ticker: string; kind: BasketKind; issuer?: string; summary?: string; source?: string; holdingsAsOf?: string; count?: number | null; holdings: readonly BasketHolding[]; periods: readonly BasketPeriod[] }
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}%`;
const tone = (n: number) => n > 0 ? "good" : n < 0 ? "bad" : "neutral";
const PALETTE = ["green", "blue", "purple", "orange", "cyan", "secondary"];

/** Financial groups carry assets, not only company tickers (bond names need no ticker). */
export function basketRecord(b: BasketInput): Record<string, MockValue> {
  const holdings = b.holdings.map((h, i) => ({ name: h.name, ticker: h.ticker ?? "", mark: h.ticker ?? h.name, logo: assetLogoPath(h.ticker),
    weight: h.weight === null ? "Weight unavailable" : `${h.weight.toFixed(1)}%`, move: h.move === null ? "Move unavailable" : pct(h.move), moveTone: h.move === null ? "neutral" : tone(h.move), ink: PALETTE[i % 5]!,
  }));
  const knownCount = b.count != null && Number.isInteger(b.count) && b.count >= holdings.length ? b.count : null;
  const rest = knownCount === null ? 0 : Math.max(0, knownCount - Math.min(3, holdings.length));
  const periods = b.periods.filter(p => p.base > 0 && Number.isFinite(p.base) && p.points.length >= 2 && p.points.every(x => Number.isFinite(x.value))).map(p => {
    const delta = 100 * (p.points.at(-1)!.value / p.base - 1);
    const indexed = p.points.map(x => ({ label: x.label, value: 100 * (x.value / p.base - 1) }));
    const benchmark = p.benchmark;
    const aligned = benchmark && benchmark.base > 0 && benchmark.points.length === p.points.length && benchmark.points.every((x, i) => x.label === p.points[i]!.label && Number.isFinite(x.value));
    const benchPct = aligned ? 100 * (benchmark.points.at(-1)!.value / benchmark.base - 1) : 0;
    const gap = delta - benchPct;
    return { label: p.label, performance: pct(delta), performanceTone: tone(delta), caption: p.caption,
      chart: p.points.map(x => ({ ...x })), reference: p.base, indexedReference: 0, referenceLabel: "Period start", indexedChart: indexed,
      hasBenchmark: !!aligned, benchmarkChart: aligned ? benchmark.points.map(x => ({ label: x.label, value: 100 * (x.value / benchmark.base - 1) })) : [],
      benchmarkName: aligned ? benchmark.name : "", benchmarkReturn: aligned ? pct(benchPct) : "",
      comparison: aligned ? `${pct(gap).replace("%", " pts")} ${gap >= 0 ? "ahead of" : "behind"} ${benchmark.name}` : "Benchmark unavailable for this period", comparisonTone: aligned ? tone(gap) : "neutral" };
  });
  const selected = Math.max(0, periods.findIndex(p => p.label === "1M"));
  const current = periods[selected];
  const weighted = b.holdings.length > 0 && b.holdings.every(h => h.weight !== null && Number.isFinite(h.weight) && h.weight >= 0 && h.weight <= 100);
  const sum = b.holdings.reduce((n, h) => n + (h.weight ?? 0), 0);
  const allocation = weighted && sum <= 100.05 ? b.holdings.slice(0, 5).map((h, i) => ({ label: h.name, value: h.weight!, ink: PALETTE[i]!, detail: holdings[i]!.move })) : [];
  if (allocation.length) {
    const restWeight = Math.max(0, 100 - allocation.reduce((n, h) => n + h.value, 0));
    if (restWeight > 0) allocation.push({ label: "Other holdings", value: restWeight, ink: "secondary", detail: "" });
  }
  return { name: b.name, short: b.short ?? b.name, ticker: b.ticker, kind: b.kind,
    identity: [b.issuer, b.ticker, b.kind].filter(Boolean).join(" · "), summary: b.summary ?? "Description unavailable",
    source: b.source ?? "Holdings source unavailable", note: b.holdingsAsOf ? `Holdings as of ${b.holdingsAsOf}` : "",
    marks: holdings.slice(0, 3).map(h => h.mark), holdings, top: holdings.slice(0, 3), compactTop: holdings.slice(0, 2), hasHoldings: holdings.length > 0,
    countLabel: knownCount === null ? (holdings.length ? `${holdings.length} reported holdings` : "Holdings unavailable") : `${knownCount} holdings`,
    hasRemaining: rest > 0, remainingLabel: rest ? `+${rest}` : "", hasMore: holdings.length > 3 || rest > 0,
    moreLabel: knownCount !== null ? `${Math.max(0, knownCount - Math.min(3, holdings.length))} more holdings` : "More reported holdings",
    concentration: allocation.length ? `Top ${Math.min(3, b.holdings.length)} are ${b.holdings.slice(0, 3).reduce((n, h) => n + h.weight!, 0).toFixed(1)}% of the group` : "Allocation weights unavailable",
    hasAllocation: allocation.length >= 2, allocation, hasPeriods: !!current, hasNoPeriods: !current, periods, options: periods.map(p => p.label), selected,
    performance: current?.performance ?? "Performance unavailable", performanceTone: current?.performanceTone ?? "neutral",
    caption: current?.caption ?? "No price history", chart: current?.chart ?? [], reference: current?.reference ?? 0,
  };
}

