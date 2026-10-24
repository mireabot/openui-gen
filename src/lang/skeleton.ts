import type { PNode, Placement, Value } from "./nodes.js";
import { LABEL_GAP, SCREEN_INSET } from "../primitives/tokens.js";

/**
 * Skeleton frames: a coarse layout of what is about to stream, so the app can draw a
 * shimmer that has the real content's shape before the first statement arrives.
 *
 * Built from the evaluated program's primitive tree (`programTree`). Containers keep
 * their look: a Card frame is a box on the card's own surface and radius, with shimmer
 * bars inside; text becomes lines at its role's height; deep subtrees collapse into one
 * shimmer box of about the right height. It is a frame, not a node-by-node copy.
 *
 * `blocks` are the children of the top container (a single vertical Stack under the root
 * is unwrapped), so block i is the placeholder for the tree's i-th top block.
 */

export type SkeletonFrame =
  | { readonly kind: "stack"; readonly axis: "v" | "h"; readonly gap: number; readonly align?: string; readonly justify?: string; readonly children: readonly SkeletonFrame[] }
  | { readonly kind: "grid"; readonly columns: number; readonly gap: number; readonly children: readonly SkeletonFrame[] }
  | { readonly kind: "rail"; readonly gap: number; readonly width?: number; readonly children: readonly SkeletonFrame[] }
  | { readonly kind: "repeat"; readonly layout: "stack" | "rail" | "grid" | "wrap"; readonly count: number; readonly gap: number; readonly columns?: number; readonly width?: number; readonly divided?: boolean; readonly item: SkeletonFrame }
  /** A shape. With `surface` it is a container drawn on that surface (card, filled, grouped, outlined); without, a shimmer fill. */
  | { readonly kind: "box"; readonly height?: number; readonly width?: number; readonly aspect?: number; readonly radius: number | "pill"; readonly surface?: string; readonly padding?: number; readonly children?: readonly SkeletonFrame[] }
  /** One text line: `height` is the role's line height, `width` a fraction of the available width. */
  | { readonly kind: "line"; readonly height: number; readonly width: number }
  | { readonly kind: "circle"; readonly size: number }
  | { readonly kind: "divider" }
  | { readonly kind: "spacer"; readonly size: number };

export interface Skeleton {
  /** Gap between blocks, from the top container. */
  readonly gap: number;
  readonly inset: number;
  readonly blocks: readonly SkeletonFrame[];
}

interface Tree {
  readonly placement: Placement | null;
  readonly nodes: readonly PNode[];
}

/** Frames below this depth (from a block) collapse into one shimmer box. */
const MAX_DEPTH = 4;
const REPEAT_COUNT = 3;
const LINE: Record<string, number> = { footnote: 18, body: 20, headline: 22, title3: 25, title2: 28, display: 28, title1: 34 };
/** Line widths by role: titles are short, body copy runs long. */
const WIDTH: Record<string, number> = { footnote: 0.4, body: 0.7, headline: 0.55, title3: 0.5, title2: 0.45, display: 0.4, title1: 0.5 };

export function skeletonOf(tree: Tree): Skeleton {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const top = topBlocks(tree, byId);
  return { gap: top.gap, inset: SCREEN_INSET, blocks: top.ids.flatMap((id) => (byId.has(id) ? [frame(byId.get(id)!, byId, 0)] : [])) };
}

/** Several trees (one per writer section) as one skeleton; sections are 28 apart. */
export function skeletonOfSections(trees: readonly Tree[]): Skeleton {
  const parts = trees.map(skeletonOf);
  if (parts.length === 1) return parts[0]!;
  return { gap: 28, inset: SCREEN_INSET, blocks: parts.map((p) => (p.blocks.length === 1 ? p.blocks[0]! : { kind: "stack", axis: "v", gap: p.gap, children: p.blocks })) };
}

/** The top container's children: root children, through any single vertical Stack. Mirrors the app's block split. */
export function topBlocks(tree: Tree, byId = new Map(tree.nodes.map((n) => [n.id, n]))): { gap: number; ids: readonly string[] } {
  let ids = tree.placement?.children ?? [];
  let gap = 28;
  for (;;) {
    const only = ids.length === 1 ? byId.get(ids[0]!) : undefined;
    if (!only || only.primitive !== "Stack" || only.props.axis !== "v") return { gap, ids };
    gap = num(only.props.gap) ?? 0;
    ids = only.children.children ?? [];
  }
}

const num = (v: Value | undefined): number | undefined => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
const str = (v: Value | undefined): string | undefined => (typeof v === "string" ? v : undefined);
const kids = (n: PNode, arg: string, byId: Map<string, PNode>) => (n.children[arg] ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));

function line(role: string | undefined, scale = 1): SkeletonFrame {
  const r = role && LINE[role] ? role : "body";
  return { kind: "line", height: LINE[r]!, width: Math.min(1, WIDTH[r]! * scale) };
}

function frame(n: PNode, byId: Map<string, PNode>, depth: number): SkeletonFrame {
  if (depth > MAX_DEPTH) return { kind: "box", height: estimate(n, byId), radius: 8 };
  const p = n.props;
  const sub = (x: PNode) => frame(x, byId, depth + 1);
  const all = (arg = "children") => kids(n, arg, byId).map(sub);

  switch (n.primitive) {
    case "Calculation": return { kind: "stack", axis: "v", gap: 24, children: kids(n, "children", byId).map(child => frame(child, byId, depth + 1)) };
    case "Slider": return { kind: "stack", axis: "v", gap: 8, children: [line("body", 0.5), { kind: "box", height: 44, radius: "pill" }] };
    case "ChoiceTags": return { kind: "stack", axis: "v", gap: 8, children: [line("footnote", 0.5), { kind: "stack", axis: "h", gap: 8, children: Array.from({ length: 3 }, () => ({ kind: "box" as const, height: 44, width: 96, radius: "pill" as const })) }] };
    case "Stack":
      // A wrapping stack draws as wrapping items of its first child's shape (tags, chips).
      if (p.axis === "wrap") {
        const first = kids(n, "children", byId)[0];
        return { kind: "repeat", layout: "wrap", count: n.children.children?.length ?? 1, gap: num(p.gap) ?? 0, item: first ? sub(first) : { kind: "box", height: 32, width: 72, radius: "pill" } };
      }
      return { kind: "stack", axis: p.axis === "h" ? "h" : "v", gap: num(p.gap) ?? 0, ...(str(p.align) ? { align: str(p.align)! } : {}), ...(str(p.justify) ? { justify: str(p.justify)! } : {}), children: all() };
    case "Grid":
      return { kind: "grid", columns: num(p.columns) ?? 2, gap: num(p.gap) ?? 0, children: all() };
    case "Rail":
      return { kind: "rail", gap: num(p.gap) ?? 12, ...(num(p.width) ? { width: num(p.width)! } : {}), children: all() };
    case "Card": {
      const surface = str(p.surface) ?? "card";
      return { kind: "box", radius: p.radius === "control" ? 12 : 24, surface, padding: num(p.padding) ?? 16, children: [{ kind: "stack", axis: "v", gap: 16, children: all() }] };
    }
    case "Section": {
      const head: SkeletonFrame[] = [line("headline")];
      if (p.subtitle != null) head.push(line("footnote", 1.5));
      return { kind: "stack", axis: "v", gap: LABEL_GAP, children: [{ kind: "stack", axis: "v", gap: 4, children: head }, ...all()] };
    }
    case "Repeat": {
      const template = kids(n, "template", byId)[0];
      const layout = (["stack", "rail", "grid", "wrap"] as const).find((l) => l === p.layout) ?? "stack";
      const columns = num(p.columns);
      return {
        kind: "repeat", layout, count: layout === "grid" ? (columns ?? 2) * 2 : layout === "wrap" ? 5 : REPEAT_COUNT, gap: num(p.gap) ?? 0,
        ...(columns ? { columns } : {}), ...(layout === "rail" && num(p.width) ? { width: num(p.width)! } : {}), ...(p.divided === true ? { divided: true } : {}),
        item: template ? sub(template) : { kind: "box", height: 44, radius: 8 },
      };
    }
    case "ZStack":
    case "Show": {
      const first = kids(n, n.primitive === "Show" ? "child" : "children", byId)[0];
      return first ? sub(first) : { kind: "spacer", size: 0 };
    }
    case "Disclosure": {
      const header: SkeletonFrame = { kind: "stack", axis: "h", gap: 12, align: "center", justify: "between", children: [line("body", 0.8), { kind: "box", width: 16, height: 16, radius: 4 }] };
      return p.open === true ? { kind: "stack", axis: "v", gap: LABEL_GAP, children: [header, ...all()] } : header;
    }
    case "Spacer":
      return { kind: "spacer", size: num(p.size) ?? 0 };
    case "Divider":
      return { kind: "divider" };
    case "Text":
      return line(str(p.role), num(p.lines) && num(p.lines)! > 1 ? 1.4 : 1);
    case "Number":
      return line(str(p.role), 0.6);
    case "Icon":
      return { kind: "box", width: num(p.size) ?? 24, height: num(p.size) ?? 24, radius: 4 };
    case "Avatar":
    case "AvatarStack":
      return p.shape === "rounded" ? { kind: "box", width: num(p.size) ?? 40, height: num(p.size) ?? 40, radius: 8 } : { kind: "circle", size: num(p.size) ?? 40 };
    case "IconTile":
      return { kind: "box", width: num(p.size) ?? 40, height: num(p.size) ?? 40, radius: 12 };
    case "Image": {
      const [w, h] = (str(p.aspect) ?? "4-3").split("-").map(Number);
      return { kind: "box", aspect: (w ?? 4) / (h ?? 3), radius: p.rounded === true ? 24 : 0, ...(num(p.width) ? { width: num(p.width)! } : {}) };
    }
    case "Button":
    case "Dock":
      return { kind: "box", height: 44, radius: 8, ...(p.wide === true || n.primitive === "Dock" ? {} : { width: 128 }) };
    case "IconButton":
      return { kind: "circle", size: 44 };
    case "Badge":
    case "Pill":
    case "Chip":
      return { kind: "box", height: n.primitive === "Badge" ? 22 : 32, width: 72, radius: "pill" };
    case "SegmentedControl": {
      const panel = kids(n, "panels", byId)[0];
      const selected = panel?.primitive === "Repeat" ? kids(panel, "template", byId)[0] : panel;
      const track: SkeletonFrame = { kind: "box", height: 44, radius: "pill" };
      const content = selected ? frame(selected, byId, depth + 1) : undefined;
      return content ? { kind: "stack", axis: "v", gap: 16, children: p.contentFirst === true ? [content, track] : [track, content] } : track;
    }
    case "Toggle":
      return { kind: "stack", axis: "h", gap: 12, justify: "between", children: [line("body", 0.6), { kind: "box", width: 51, height: 31, radius: "pill" }] };
    case "Stepper":
      return { kind: "box", height: 44, width: 128, radius: "pill" };
    case "Progress":
      return p.style === "ring" ? { kind: "circle", size: 80 } : { kind: "box", height: 8, radius: "pill" };
    case "Bars":
      return { kind: "box", height: 128, radius: 12 };
    case "Sparkline":
      return { kind: "box", height: 40, radius: 4 };
    case "PriceChart":
      return { kind: "stack", axis: "v", gap: 8, children: [{ kind: "box", height: p.height === "compact" ? 120 : 200, radius: 12 }, { kind: "stack", axis: "h", gap: 12, justify: "between", children: [line("footnote", 0.5), line("footnote", 0.5)] }] };
    case "Change":
      return { kind: "box", height: 22, width: p.style === "percent" ? 64 : 96, radius: "pill" };
    case "SplitBar":
      return { kind: "box", height: p.size === "micro" ? 4 : p.size === "thin" ? 6 : 8, ...(p.size === "micro" ? { width: 40 } : {}), radius: "pill" };
    case "ShareBar":
      return { kind: "box", height: 12, radius: "pill" };
    case "Rating":
      return { kind: "line", height: 16, width: 0.3 };
    case "Note":
      return { kind: "box", height: 72, radius: 12 };
    case "Row": {
      const leading = kids(n, "leading", byId)[0];
      const trailing = kids(n, "trailing", byId)[0];
      const text: SkeletonFrame = { kind: "stack", axis: "v", gap: 4, children: [line("body", 0.9), ...(p.subtitle != null ? [line("footnote", 1.2)] : [])] };
      return {
        kind: "stack", axis: "h", gap: 12, align: "center", justify: "between",
        children: [{ kind: "stack", axis: "h", gap: 12, align: "center", children: [...(leading ? [sub(leading)] : []), text] }, ...(trailing ? [sub(trailing)] : [])],
      };
    }
    case "KeyValue":
      return { kind: "stack", axis: "h", gap: 12, justify: "between", children: [line("body", 0.5), line("body", 0.35)] };
    case "NavBar":
      return { kind: "stack", axis: "h", gap: 12, align: "center", justify: "between", children: [{ kind: "circle", size: 44 }, line("headline", 0.6), { kind: "circle", size: 44 }] };
    default:
      return { kind: "box", height: estimate(n, byId), radius: 8 };
  }
}

/** Rough height in points, for collapsed subtrees. */
function estimate(n: PNode, byId: Map<string, PNode>): number {
  const p = n.props;
  const sum = (arg: string, gap: number) => {
    const c = kids(n, arg, byId).map((x) => estimate(x, byId));
    return c.reduce((a, b) => a + b, 0) + Math.max(0, c.length - 1) * gap;
  };
  const max = (arg: string) => Math.max(0, ...kids(n, arg, byId).map((x) => estimate(x, byId)));
  switch (n.primitive) {
    case "Calculation": return sum("children", 24);
    case "Slider": return 90;
    case "ChoiceTags": return 70;
    case "Stack": return p.axis === "v" ? sum("children", num(p.gap) ?? 0) : max("children");
    case "Disclosure": return p.open === true ? 44 + LABEL_GAP + sum("children", 0) : 44;
    case "Card": return 2 * (num(p.padding) ?? 16) + sum("children", 16);
    case "Section": return 22 + LABEL_GAP + sum("children", 0);
    case "Repeat": {
      const t = kids(n, "template", byId)[0];
      const h = t ? estimate(t, byId) : 44;
      return p.layout === "stack" ? REPEAT_COUNT * h + (REPEAT_COUNT - 1) * (num(p.gap) ?? 0) : h;
    }
    case "SegmentedControl": {
      const panel = kids(n, "panels", byId)[0];
      const selected = panel?.primitive === "Repeat" ? kids(panel, "template", byId)[0] : panel;
      return 44 + (selected ? 16 + estimate(selected, byId) : 0);
    }
    case "Text": case "Number": return LINE[str(p.role) ?? "body"] ?? 20;
    case "Image": return num(p.width) ?? 200;
    case "Avatar": case "IconTile": return num(p.size) ?? 40;
    case "Row": return 64;
    case "Bars": return 128;
    case "Sparkline": return 40;
    case "PriceChart": return (p.height === "compact" ? 120 : 200) + 26;
    case "Change": return 22;
    case "SplitBar": return p.legend === true ? 30 : 8;
    case "Note": return 72;
    case "Progress": return p.style === "ring" ? 80 : 8;
    case "Spacer": return num(p.size) ?? 0;
    case "Divider": return 1;
    case "Badge": return 22;
    case "Chip": case "Pill": return 32;
    default: return 44;
  }
}
