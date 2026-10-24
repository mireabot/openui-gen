import type { z } from "zod";
import { each, ui, type Node, type PropsIn, type Ref } from "../../lang/program.js";
import type { PropsOf } from "../../lang/primitives.js";
import type { ConsensusCore, Stock } from "../schema.js";

export type PeerLayout = "list" | "rail" | "grid" | "text";
export type QuoteVariant = "row" | "tile" | "widget" | "chip";
export type ConsensusVariant = "score" | "verdict";

type StockRef = Ref<z.infer<typeof Stock>>;
type SectionCopy = Pick<PropsIn<PropsOf<"Section">>, "title" | "subtitle">;

export function StockQuote(stock: StockRef, variant: QuoteVariant = "row"): Node {
  switch (variant) {
    case "row": return ui.Card({ padding: 12, children: [ui.Stack({ axis: "h", gap: 12, align: "center", children: [
      ui.Avatar({ name: stock.name, size: 40, image: stock.logo }),
      ui.Stack({ axis: "v", gap: 0, children: [
        ui.Text({ content: stock.ticker, role: "body", weight: "semibold", lines: 1 }),
        ui.Text({ content: stock.name, role: "footnote", ink: "secondary", lines: 1 }),
      ] }),
      ui.Sparkline({ points: stock.chart, reference: stock.reference, fill: true }),
      ui.Stack({ axis: "v", gap: 4, align: "end", children: [
        ui.Number({ value: stock.price, format: "currency", role: "body", weight: "semibold" }),
        ui.Change({ value: stock.change, percent: stock.changePct, style: "percent" }),
      ] }),
    ] })] });
    case "tile": return ui.Card({ children: [
      ui.Stack({ axis: "h", gap: 8, align: "center", children: [
        ui.Avatar({ name: stock.name, size: 20, image: stock.logo }),
        ui.Text({ content: stock.ticker, role: "body", weight: "semibold", lines: 1 }),
      ] }),
      ui.Stack({ axis: "v", gap: 0, children: [
        ui.Number({ value: stock.price, format: "currency", role: "title2", weight: "semibold" }),
        ui.Change({ value: stock.change, percent: stock.changePct, style: "text" }),
      ] }),
      ui.Sparkline({ points: stock.chart, baseline: true }),
      ui.Text({ content: stock.chartCaption, role: "footnote", ink: "secondary", lines: 1 }),
    ] });
    case "widget": return ui.Card({ children: [
      ui.Text({ content: stock.ticker, role: "body", weight: "semibold" }),
      ui.Change({ value: stock.change, percent: stock.changePct, style: "percent", role: "title1" }),
      ui.Number({ value: stock.price, format: "currency", role: "footnote", ink: "secondary" }),
      ui.Sparkline({ points: stock.chart }),
    ] });
    case "chip": return ui.Card({ surface: "filled", radius: "control", padding: 8, children: [
      ui.Stack({ axis: "h", gap: 8, align: "center", children: [
        ui.Avatar({ name: stock.name, size: 20, image: stock.logo }),
        ui.Text({ content: stock.ticker, role: "footnote", weight: "semibold" }),
        ui.Change({ value: stock.change, percent: stock.changePct, style: "percent" }),
      ] }),
    ] });
  }
}

export function PeerCards({ data, variant = "list", copy }: {
  readonly data: Ref<z.infer<typeof Stock>[]>;
  readonly variant?: PeerLayout;
  readonly copy: SectionCopy;
}): Node {
  const rows = each(data, "p", (stock) => StockQuote(stock, variant === "list" ? "row" : variant === "text" ? "chip" : "tile"));
  const layout = variant === "grid" ? ui.Grid({ columns: "2", gap: 12, children: rows })
    : variant === "rail" ? ui.Rail({ gap: 12, width: 170, children: rows })
    : ui.Stack({ axis: variant === "text" ? "wrap" : "v", gap: 8, children: rows });
  return ui.Section({ ...copy, children: [layout] });
}

export function ConsensusCard({ data: c, variant = "score" }: {
  readonly data: Ref<z.infer<typeof ConsensusCore>>;
  readonly variant?: ConsensusVariant;
}): Node {
  const hero = variant === "verdict" ? [
    ui.Text({ content: c.title, role: "footnote", ink: "secondary", align: "center" }),
    ui.Text({ content: c.verdictWord, role: "display", weight: "semibold", align: "center", tone: c.tone }),
    ui.Text({ content: c.shareText, role: "headline", align: "center" }),
    ui.SplitBar({ sides: c.sides, dim: true }),
  ] : [
    ui.Stack({ axis: "v", gap: 4, children: [
      ui.Text({ content: c.title, role: "headline", weight: "semibold", align: "center" }),
      ui.Text({ content: c.source, role: "body", ink: "secondary", align: "center" }),
    ] }),
    ui.Text({ content: c.score, role: "display", weight: "semibold", align: "center" }),
    ui.Text({ content: c.verdict, role: "headline", align: "center" }),
    ui.SplitBar({ sides: c.sides, dim: false, legend: true }),
  ];
  return ui.Card({ children: [
    ui.Stack({ axis: "v", gap: 16, align: "center", children: [ui.AvatarStack({ people: c.voters, size: 40, max: 4 }), ...hero] }),
    ui.Show({ when: c.hasNote, child: ui.Note({ text: c.note, tone: "neutral", icon: "info.circle" }) }),
  ] });
}
