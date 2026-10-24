import type { z } from "zod";
import { each, ui, type Node, type Ref, type HoleRef } from "../../lang/program.js";
import { Consensus, ConsensusCore } from "../schema.js";

type CoreRef = Ref<z.infer<typeof ConsensusCore>>;
const note = (c: CoreRef) => ui.Show({ when: c.hasNote, child: ui.Note({ text: c.note, tone: "neutral", icon: "info.circle" }) });
export const ShiftData = ConsensusCore.extend({ shift: Consensus.shape.shift.unwrap() });
export const MomentumData = ConsensusCore.extend({ momentum: Consensus.shape.momentum.unwrap() });
export const TargetData = ConsensusCore.extend({ target: Consensus.shape.target.unwrap() });

export function ConsensusShift(c: Ref<z.infer<typeof ShiftData>>): Node {
  return ui.Card({ children: [
    ui.Stack({ axis: "v", gap: 12, align: "center", children: [ui.AvatarStack({ people: c.voters, size: 40, max: 4 }), ui.Text({ content: c.title, role: "headline", weight: "semibold", align: "center" }), ui.Text({ content: c.score, role: "display", weight: "semibold", align: "center" }), ui.Text({ content: c.shift.delta, role: "body", align: "center", tone: c.shift.deltaTone })] }),
    ui.Stack({ axis: "v", gap: 12, children: [
      ui.Stack({ axis: "v", gap: 8, children: [ui.Stack({ axis: "h", gap: 8, align: "center", justify: "between", children: [ui.Text({ content: c.shift.label, role: "footnote", ink: "secondary" }), ui.Text({ content: c.shift.share, role: "footnote" })] }), ui.SplitBar({ sides: c.shift.sides, size: "thin" })] }),
      ui.Stack({ axis: "v", gap: 8, children: [ui.Stack({ axis: "h", gap: 8, align: "center", justify: "between", children: [ui.Text({ content: "Now", role: "footnote", ink: "secondary" }), ui.Text({ content: c.shift.now, role: "footnote" })] }), ui.SplitBar({ sides: c.sides, size: "thin" })] }),
    ] }), note(c),
  ] });
}

export function ConsensusMomentum(c: Ref<z.infer<typeof MomentumData>>): Node {
  return ui.Card({ children: [ui.Stack({ axis: "v", gap: 16, align: "center", children: [
    ui.AvatarStack({ people: c.voters, size: 40, max: 4 }), ui.Text({ content: c.title, role: "headline", weight: "semibold", align: "center" }), ui.Text({ content: c.score, role: "display", weight: "semibold", align: "center" }), ui.Text({ content: c.verdict, role: "headline", align: "center" }),
    ui.Stack({ axis: "h", gap: 8, align: "center", justify: "center", children: [ui.Badge({ label: c.momentum.up, tone: "good", icon: "arrow.up.right" }), ui.Badge({ label: c.momentum.down, tone: "bad", icon: "arrow.down.right" }), ui.Badge({ label: c.momentum.window, tone: "neutral" })] }), ui.SplitBar({ sides: c.sides, dim: false, legend: true }),
  ] }), note(c)] });
}

export function ConsensusTarget(c: Ref<z.infer<typeof TargetData>>): Node {
  return ui.Card({ children: [
    ui.Stack({ axis: "h", gap: 12, align: "center", children: [ui.AvatarStack({ people: c.voters, size: 20, max: 3 }), ui.Text({ content: c.title, role: "headline", weight: "semibold", lines: 1 })] }),
    ui.Grid({ columns: "2", gap: 12, children: [
      ui.Card({ surface: "filled", radius: "control", padding: 12, children: [ui.Text({ content: "Consensus", role: "footnote", ink: "secondary" }), ui.Text({ content: c.verdictShare, role: "title2", weight: "semibold", lines: 1, tone: c.tone }), ui.SplitBar({ sides: c.sides, size: "thin" })] }),
      ui.Card({ surface: "filled", radius: "control", padding: 12, children: [ui.Text({ content: "Avg target", role: "footnote", ink: "secondary" }), ui.Text({ content: c.target.avg, role: "title2", weight: "semibold", lines: 1 }), ui.Text({ content: c.target.upside, role: "footnote", lines: 1, tone: c.target.tone })] }),
    ] }), ui.Text({ content: c.target.summary, role: "footnote", ink: "secondary" }), note(c),
  ] });
}

export function ConsensusQuote(c: CoreRef, variant: "row" | "tile" | "chip"): Node {
  switch (variant) {
    case "row": return ui.Card({ surface: "none", radius: "control", padding: 8, children: [ui.Stack({ axis: "h", gap: 12, align: "center", children: [ui.Text({ content: c.subject, role: "body", weight: "semibold", lines: 1 }), ui.SplitBar({ sides: c.sides, size: "thin" }), ui.Text({ content: c.verdictShare, role: "body", weight: "semibold", lines: 1, align: "end", tone: c.tone })] })] });
    case "tile": return ui.Card({ children: [ui.Show({ when: c.showVoters, child: ui.AvatarStack({ people: c.voters, size: 20, max: 2 }) }), ui.Text({ content: c.subject, role: "footnote", ink: "secondary", lines: 1 }), ui.Text({ content: c.score, role: "title1", weight: "semibold" }), ui.Text({ content: c.verdictLabel, role: "body", weight: "semibold", lines: 1, tone: c.tone }), ui.SplitBar({ sides: c.sides, size: "thin" })] });
    case "chip": return ui.Card({ surface: "filled", radius: "control", padding: 8, children: [ui.Stack({ axis: "h", gap: 8, align: "center", children: [ui.Text({ content: c.subject, role: "footnote", weight: "semibold" }), ui.Text({ content: c.verdictShare, role: "footnote", weight: "semibold", lines: 1, tone: c.tone }), ui.SplitBar({ sides: c.sides, size: "micro" })] })] });
  }
}

export function ConsensusSet(items: Ref<z.infer<typeof ConsensusCore>[]>, variant: "list" | "grid" | "text", copy: Readonly<Record<string, HoleRef<"copy"> | string | null>>): Node {
  const rows = each(items, "c", (c) => ConsensusQuote(c, variant === "list" ? "row" : variant === "grid" ? "tile" : "chip"));
  const child = variant === "grid" ? ui.Grid({ columns: "2", gap: 12, children: rows }) : variant === "text" ? ui.Stack({ axis: "wrap", gap: 8, children: rows }) : ui.Card({ children: [ui.Stack({ axis: "v", gap: 0, divided: true, children: rows })] });
  return ui.Section({ title: copy.title!, subtitle: copy.subtitle ?? null, children: [child] });
}
