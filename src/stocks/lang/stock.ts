import type { z } from "zod";
import { each, ui, type Node, type Ref, type HoleRef } from "../../lang/program.js";
import { Stock, Subject, Stat, Earnings, Benchmark } from "../schema.js";

type StockRef = Ref<z.infer<typeof Stock>>;
export function StockCard(s: StockRef): Node {
  return ui.Card({ children: [
    ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
      ui.Avatar({ name: s.name, size: 40, image: s.logo }),
      ui.Stack({ axis: "v", gap: 0, children: [ui.Text({ content: s.ticker, role: "headline", weight: "semibold", lines: 1 }), ui.Text({ content: s.name, role: "footnote", ink: "secondary", lines: 1 })] }),
      ui.Stack({ axis: "v", gap: 0, align: "end", children: [ui.Number({ value: s.price, format: "currency", role: "headline", weight: "semibold" }), ui.Change({ value: s.change, percent: s.changePct, style: "text" })] }),
    ] }),
    ui.PriceChart({ points: s.chart, height: "compact", reference: s.reference, referenceLabel: s.referenceLabel, tone: "threshold" }),
    ui.Text({ content: s.chartCaption, role: "footnote", ink: "secondary" }),
  ] });
}

export function StockHeader(s: StockRef): Node {
  return ui.Stack({ axis: "v", gap: 16, children: [
    ui.Stack({ axis: "h", gap: 12, align: "center", children: [ui.Avatar({ name: s.name, size: 40, image: s.logo }), ui.Stack({ axis: "v", gap: 0, children: [ui.Text({ content: s.name, role: "body", weight: "semibold", lines: 1 }), ui.Text({ content: s.ticker, role: "footnote", ink: "secondary" })] })] }),
    ui.Stack({ axis: "v", gap: 8, align: "start", children: [ui.Number({ value: s.price, format: "currency", role: "title1", weight: "semibold" }), ui.Change({ value: s.change, percent: s.changePct, style: "pill" })] }),
    ui.PriceChart({ points: s.chart, height: "regular", reference: s.reference, referenceLabel: s.referenceLabel, tone: "direction", annotate: false, measure: true }),
    ui.Text({ content: s.chartCaption, role: "footnote", ink: "tertiary" }),
  ] });
}

export const StoryData = Subject.extend({ story: Subject.shape.story.unwrap() });
export function StockStory(s: Ref<z.infer<typeof StoryData>>): Node {
  return ui.Card({ children: [
    ui.Stack({ axis: "h", gap: 8, align: "center", children: [ui.Avatar({ name: s.name, size: 20, image: s.logo }), ui.Text({ content: s.ticker, role: "body", weight: "semibold" }), ui.Text({ content: s.name, role: "footnote", ink: "secondary", lines: 1 })] }),
    ui.Text({ content: s.story.headline, role: "title2", weight: "medium" }), ui.Text({ content: s.story.detail, role: "body", ink: "secondary" }),
    ui.PriceChart({ points: s.chart, height: "compact", reference: s.reference, referenceLabel: s.referenceLabel, tone: "direction", annotate: true }),
    ui.Text({ content: s.chartCaption, role: "footnote", ink: "tertiary" }),
  ] });
}

export function KeyStats(s: Ref<z.infer<typeof Stat>[]>, variant: "list" | "grid" | "text", title: HoleRef<"copy"> | string): Node {
  const children = variant === "text"
    ? ui.Stack({ axis: "wrap", gap: 12, children: each(s, "stat", (r) => ui.Stack({ axis: "h", gap: 4, children: [ui.Text({ content: r.label, role: "footnote", ink: "secondary" }), ui.Text({ content: r.value, role: "footnote", weight: "medium" })] })) })
    : ui.Card({ children: [variant === "grid"
      ? ui.Grid({ columns: "3", gap: 16, children: each(s, "stat", (r) => ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: r.label, role: "footnote", ink: "secondary", lines: 1 }), ui.Text({ content: r.value, role: "body", weight: "medium", lines: 1 })] })) })
      : ui.Stack({ axis: "v", gap: 0, divided: true, children: each(s, "stat", (r) => ui.KeyValue({ label: r.label, value: r.value })) })] });
  return ui.Section({ title, children: [children] });
}

export function EarningsCard(e: Ref<z.infer<typeof Earnings>>): Node {
  return ui.Card({ children: [
    ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: e.context, role: "footnote", ink: "secondary" }), ui.Text({ content: e.name, role: "title2", weight: "medium" }), ui.Text({ content: e.when, role: "footnote", ink: "secondary" })] }),
    ui.Text({ content: e.summary, role: "headline" }),
    ui.Grid({ columns: "2", gap: 16, children: each(e.stats, "stat", (s) => ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: s.label, role: "footnote", ink: "secondary" }), ui.Text({ content: s.value, role: "title3", weight: "semibold" })] })) }),
    ui.Show({ when: e.hasWatch, child: ui.Stack({ axis: "v", gap: 16, children: [ui.Divider({}), ui.Stack({ axis: "v", gap: 8, children: [ui.Text({ content: "What to watch", role: "body", weight: "medium" }), ui.Text({ content: e.watch, role: "body", ink: "secondary", lines: 3 })] })] }) }),
    ui.Text({ content: e.source, role: "footnote", ink: "tertiary" }),
  ] });
}

export function StockBenchmark(b: Ref<z.infer<typeof Benchmark>>): Node {
  return ui.Card({ children: [
    ui.Text({ content: b.title, role: "footnote", weight: "semibold", ink: "secondary" }), ui.Text({ content: b.comparison, role: "title2", weight: "semibold", tone: b.comparisonTone }),
    ui.PriceChart({ points: b.chart, height: "regular", reference: b.reference, referenceLabel: b.referenceLabel, tone: "direction", annotate: false, measure: false, comparison: b.benchmarkChart, comparisonLabel: b.benchmarkName, unit: "percent" }),
    ui.Stack({ axis: "h", gap: 16, children: [ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: b.ticker, role: "footnote", ink: "secondary" }), ui.Text({ content: b.subjectReturn, role: "body", weight: "medium" })] }), ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: b.benchmarkName, role: "footnote", ink: "secondary" }), ui.Text({ content: b.benchmarkReturn, role: "body", weight: "medium" })] })] }),
    ui.Text({ content: b.caption, role: "footnote", ink: "tertiary" }),
  ] });
}
