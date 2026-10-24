import type { z } from "zod";
import { each, ui, type Node, type Ref, type HoleRef } from "../../lang/program.js";
import { Basket } from "../schema.js";

const Holding = Basket.shape.holdings.element;
export const BasketData = Basket;
type BasketRef = Ref<z.infer<typeof BasketData>>;
type HoldingRef = Ref<z.infer<typeof Holding>>;
const title = (b: BasketRef) => ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: b.name, role: "headline", weight: "semibold", lines: 2, reserve: true }), ui.Text({ content: b.identity, role: "footnote", ink: "secondary", lines: 1 })] });
const returns = (b: BasketRef) => ui.Text({ content: b.performance, role: "title2", weight: "semibold", lines: 1, tone: b.performanceTone });
const assetMarks = (b: BasketRef, compact = false) => ui.Stack({ axis: "wrap", gap: 0, children: each(compact ? b.compactTop : b.top, "holding", h => ui.Avatar({ name: h.mark, size: 20, image: h.logo, tint: h.ink })) });
const marks = (b: BasketRef) => ui.Stack({ axis: "h", gap: 8, align: "center", children: [assetMarks(b), ui.Show({ when: b.hasRemaining, child: ui.Pill({ label: b.remainingLabel }) })] });
const line = (b: BasketRef) => ui.Show({ when: b.hasPeriods, child: ui.Sparkline({ points: b.chart, reference: b.reference, fill: true }) });
const holdingRow = (h: HoldingRef) => ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
  ui.Avatar({ name: h.mark, size: 40, image: h.logo, tint: h.ink }),
  ui.Stack({ axis: "v", gap: 0, children: [ui.Text({ content: h.name, role: "body", weight: "medium", lines: 1 }), ui.Text({ content: h.ticker, role: "footnote", ink: "secondary", lines: 1 })] }),
  ui.Stack({ axis: "v", gap: 4, align: "end", children: [ui.Text({ content: h.weight, role: "body", weight: "medium" }), ui.Text({ content: h.move, role: "footnote", lines: 1, tone: h.moveTone })] }),
] });

export function BasketCard(b: BasketRef, variant: "card" | "rail" | "grid" | "row" | "chip"): Node {
  switch (variant) {
    case "card": return ui.Card({ children: [title(b), returns(b), ui.Text({ content: b.caption, role: "footnote", ink: "secondary" }), line(b), marks(b), ui.Text({ content: b.summary, role: "body", ink: "secondary", lines: 3 })] });
    case "rail": return ui.Card({ children: [ui.Text({ content: b.name, role: "body", weight: "semibold", lines: 2, reserve: true }), returns(b), ui.Text({ content: b.caption, role: "footnote", ink: "secondary", lines: 1 }), line(b), marks(b), ui.Text({ content: b.summary, role: "footnote", ink: "secondary", lines: 3 })] });
    case "grid": return ui.Card({ padding: 12, children: [marks(b), ui.Text({ content: b.kind, role: "footnote", ink: "secondary", lines: 1 }), ui.Text({ content: b.short, role: "body", weight: "semibold", lines: 2, reserve: true }), line(b), ui.Text({ content: b.performance, role: "body", weight: "medium", lines: 1, tone: b.performanceTone })] });
    case "row": return ui.Card({ padding: 12, children: [ui.Stack({ axis: "h", gap: 8, align: "center", justify: "between", children: [ui.Text({ content: b.name, role: "body", weight: "semibold", lines: 1 }), marks(b), ui.Text({ content: b.performance, role: "body", weight: "medium", lines: 1, tone: b.performanceTone })] }), ui.Text({ content: b.caption, role: "footnote", ink: "secondary", lines: 1 }), ui.Text({ content: b.summary, role: "footnote", ink: "secondary", lines: 2 })] });
    case "chip": return ui.Card({ surface: "filled", radius: "control", padding: 8, children: [ui.Stack({ axis: "h", gap: 4, align: "center", children: [assetMarks(b, true), ui.Text({ content: b.short, role: "footnote", weight: "semibold", lines: 1 }), ui.Text({ content: b.performance, role: "footnote", weight: "medium", lines: 1, tone: b.performanceTone })] })] });
  }
}

export function BasketSet(items: Ref<z.infer<typeof BasketData>[]>, variant: "list" | "rail" | "grid" | "text", copy: Readonly<Record<string, HoleRef<"copy"> | string | null>>): Node {
  const rows = each(items, "basket", (b) => BasketCard(b, variant === "list" ? "row" : variant === "text" ? "chip" : variant));
  const child = variant === "rail" ? ui.Rail({ gap: 12, width: 170, children: rows }) : variant === "grid" ? ui.Grid({ columns: "2", gap: 12, children: rows }) : ui.Stack({ axis: variant === "text" ? "wrap" : "v", gap: 8, children: rows });
  return ui.Section({ title: copy.title!, subtitle: copy.subtitle ?? null, children: [child] });
}

export function BasketHoldings(b: BasketRef, variant: "top" | "disclosure"): Node {
  return variant === "disclosure" ? ui.Card({ children: [title(b), returns(b), line(b), ui.Text({ content: b.summary, role: "body", ink: "secondary", lines: 2 }), marks(b),
    ui.Disclosure({ label: b.countLabel, open: false, subtitle: b.note, children: [ui.Stack({ axis: "v", gap: 12, divided: true, children: each(b.holdings, "holding", holdingRow) })] }), ui.Text({ content: b.source, role: "footnote", ink: "tertiary" }),
  ] }) : ui.Card({ children: [title(b), returns(b), ui.Text({ content: b.caption, role: "footnote", ink: "secondary" }), ui.Text({ content: "Top holdings · weight / period move", role: "footnote", ink: "secondary" }),
    ui.Stack({ axis: "v", gap: 12, divided: true, children: each(b.top, "holding", holdingRow) }), ui.Show({ when: b.hasMore, child: ui.Text({ content: b.moreLabel, role: "footnote", ink: "secondary" }) }),
    ui.Text({ content: b.countLabel, role: "footnote", ink: "secondary" }), ui.Text({ content: b.summary, role: "body", ink: "secondary", lines: 3 }), ui.Text({ content: b.source, role: "footnote", ink: "tertiary" }), ui.Text({ content: b.note, role: "footnote", ink: "tertiary" }),
  ] });
}

export function BasketConcentration(b: BasketRef): Node {
  return ui.Card({ children: [title(b), returns(b), ui.Text({ content: b.concentration, role: "body", weight: "medium" }), ui.Show({ when: b.hasAllocation, child: ui.ShareBar({ parts: b.allocation, legend: true, selectable: true }) }), ui.Text({ content: b.summary, role: "body", ink: "secondary", lines: 3 }), ui.Text({ content: b.source, role: "footnote", ink: "tertiary" }), ui.Text({ content: b.note, role: "footnote", ink: "tertiary" })] });
}

export function BasketPerformance(b: BasketRef): Node {
  return ui.Card({ children: [title(b), ui.Show({ when: b.hasPeriods, child: ui.SegmentedControl({ options: b.options, selected: b.selected, contentFirst: true, panels: each(b.periods, "period", p => ui.Stack({ axis: "v", gap: 12, children: [
    ui.Text({ content: p.performance, role: "title1", weight: "semibold", lines: 1, tone: p.performanceTone }), ui.Text({ content: p.caption, role: "footnote", ink: "secondary" }), ui.PriceChart({ points: p.chart, height: "regular", reference: p.reference, referenceLabel: p.referenceLabel, tone: "threshold" }),
  ] })) }) }), ui.Show({ when: b.hasPeriods, child: marks(b) }), ui.Show({ when: b.hasNoPeriods, child: ui.Text({ content: b.performance, role: "body", ink: "secondary" }) }), ui.Text({ content: b.summary, role: "body", ink: "secondary", lines: 2 })] });
}

export function BasketBenchmark(b: BasketRef): Node {
  return ui.Card({ children: [title(b), marks(b), ui.Show({ when: b.hasPeriods, child: ui.SegmentedControl({ options: b.options, selected: b.selected, contentFirst: true, panels: each(b.periods, "period", p => ui.Stack({ axis: "v", gap: 12, children: [
    ui.Text({ content: p.comparison, role: "headline", weight: "semibold", tone: p.comparisonTone }), ui.Show({ when: p.hasBenchmark, child: ui.PriceChart({ points: p.indexedChart, height: "regular", reference: p.indexedReference, referenceLabel: "0%", tone: "direction", annotate: false, measure: false, comparison: p.benchmarkChart, comparisonLabel: p.benchmarkName, unit: "percent" }) }), ui.Text({ content: p.caption, role: "footnote", ink: "secondary" }), ui.Stack({ axis: "h", gap: 12, align: "center", children: [ui.Text({ content: p.performance, role: "body", weight: "medium", lines: 1, tone: p.performanceTone }), ui.Text({ content: p.benchmarkName, role: "footnote", ink: "secondary" }), ui.Text({ content: p.benchmarkReturn, role: "body", weight: "medium" })] }),
  ] })) }) }), ui.Show({ when: b.hasNoPeriods, child: ui.Text({ content: b.performance, role: "body", ink: "secondary" }) }), ui.Text({ content: b.source, role: "footnote", ink: "tertiary" })] });
}
