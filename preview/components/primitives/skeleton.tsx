"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton shapes for the primitive renderer, and the server's skeleton frames
 * (`src/dsl/skeleton.ts`, sent as the `skeleton` SSE event before the first DSL line).
 * Both draw the high-level shapes of the primitive catalog's SKELETON spec with one shimmer.
 */

export function Shimmer({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn("skeleton-shimmer block shrink-0", className)} style={style} />;
}

/** A text-like bar: height = the role's line height, inset so it reads as a line, not a block. */
export function Bar({ line, width }: { line: number; width: string }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center" style={{ height: line, width }}>
      <Shimmer className="w-full rounded-[4px]" style={{ height: Math.max(8, Math.round(line * 0.6)) }} />
    </span>
  );
}

// ---------------------------------------------------------------- server frames

export type SkeletonFrame =
  | { readonly kind: "stack"; readonly axis: "v" | "h"; readonly gap: number; readonly align?: string; readonly justify?: string; readonly paddingX?: number; readonly paddingY?: number; readonly children: readonly SkeletonFrame[] }
  | { readonly kind: "grid"; readonly columns: number; readonly gap: number; readonly rowGap?: number; readonly children: readonly SkeletonFrame[] }
  | { readonly kind: "rail"; readonly gap: number; readonly children: readonly SkeletonFrame[] }
  | { readonly kind: "repeat"; readonly layout: "stack" | "rail" | "grid" | "wrap"; readonly count: number; readonly gap: number; readonly columns?: number; readonly divided?: boolean; readonly item: SkeletonFrame }
  | { readonly kind: "box"; readonly height?: number; readonly width?: number; readonly aspect?: number; readonly radius: number | "pill"; readonly surface?: string; readonly padding?: number; readonly children?: readonly SkeletonFrame[] }
  | { readonly kind: "line"; readonly height: number; readonly width: number }
  | { readonly kind: "circle"; readonly size: number }
  | { readonly kind: "divider" }
  | { readonly kind: "spacer"; readonly size: number };

export interface Skeleton { readonly gap: number; readonly inset: number; readonly blocks: readonly SkeletonFrame[] }

const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
const JUSTIFY: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };
const radius = (r: number | "pill") => (r === "pill" ? 999 : r);

/**
 * The frames still to fill: one finished part replaces one frame, and the last frame stays until the
 * stream ends, because the writer may have more parts than the plan had questions.
 */
export function pendingFrames(skeleton: Skeleton, program: string): readonly SkeletonFrame[] {
  const root = [...program.matchAll(/^root = Screen\(\[(.*)\]\)$/gm)].at(-1)?.[1] ?? "";
  const shown = root ? root.split(",").length : 0;
  const rest = skeleton.blocks.slice(shown);
  return rest.length ? rest : skeleton.blocks.slice(-1);
}

/** One server frame. Containers with a surface draw on it (cards keep their look); shapes shimmer. */
export function Frame({ f, inRow = false }: { f: SkeletonFrame; inRow?: boolean }): ReactNode {
  switch (f.kind) {
    case "stack":
      return (
        <div className={cn("flex min-w-0", f.axis === "h" ? "flex-row" : "flex-col", f.axis === "v" && inRow && "flex-1")}
          style={{ gap: f.gap, paddingInline: f.paddingX ?? 0, paddingBlock: f.paddingY ?? 0, alignItems: ALIGN[f.align ?? ""] ?? (f.axis === "h" ? "center" : "stretch"), justifyContent: JUSTIFY[f.justify ?? ""] }}>
          {f.children.map((c, i) => <Frame key={i} f={c} inRow={f.axis === "h"} />)}
        </div>
      );
    case "grid":
      return <div className="grid" style={{ gridTemplateColumns: `repeat(${f.columns}, minmax(0, 1fr))`, columnGap: f.gap, rowGap: f.rowGap ?? f.gap }}>{f.children.map((c, i) => <Frame key={i} f={c} />)}</div>;
    case "rail":
      return <div className="-mx-6 flex overflow-hidden px-6 py-1" style={{ gap: f.gap }}>{f.children.map((c, i) => <div key={i} className="w-[60%] shrink-0"><Frame f={c} /></div>)}</div>;
    case "repeat": {
      const items = Array.from({ length: f.count }, (_, i) => <Frame key={i} f={f.item} />);
      if (f.layout === "grid") return <div className="grid" style={{ gridTemplateColumns: `repeat(${f.columns ?? 2}, minmax(0, 1fr))`, gap: f.gap }}>{items}</div>;
      if (f.layout === "rail") return <div className="-mx-6 flex overflow-hidden px-6 py-1" style={{ gap: f.gap }}>{items.map((x, i) => <div key={i} className="shrink-0" style={{ width: `calc((100% - ${f.gap * (f.columns ?? 2)}px) / ${(f.columns ?? 2) + 0.3})` }}>{x}</div>)}</div>;
      if (f.layout === "wrap") return <div className="flex flex-wrap" style={{ gap: f.gap }}>{items}</div>;
      return <div className="flex flex-col" style={{ gap: f.gap }}>{items}</div>;
    }
    case "box": {
      const style: CSSProperties = { height: f.height, width: f.width, aspectRatio: f.aspect, borderRadius: radius(f.radius) };
      if (f.surface && f.surface !== "none") {
        return (
          <div className="flex flex-col" style={{ ...style, height: undefined, padding: f.padding ?? 16, background: `var(--ds-surface-${f.surface}, var(--ds-surface-card))` }}>
            {f.children?.map((c, i) => <Frame key={i} f={c} />)}
          </div>
        );
      }
      return <Shimmer style={{ ...style, width: f.width ?? (f.aspect ? "100%" : inRow ? 64 : "100%") }} />;
    }
    case "line":
      return <Bar line={f.height} width={`${Math.round(f.width * 100)}%`} />;
    case "circle":
      return <Shimmer className="rounded-full" style={{ width: f.size, height: f.size }} />;
    case "divider":
      return <div className="h-px" style={{ background: "var(--ds-outline-subtle)" }} />;
    case "spacer":
      return <div style={{ height: f.size }} />;
  }
}
