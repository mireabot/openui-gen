"use client";

import { Collapse } from "./collapse";
import NumberFlow from "@number-flow/react";
import * as Icons from "@phosphor-icons/react";
import { createContext, Fragment, useContext, useId, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { dummy, type PNode, type Value } from "@/lib/primitives/data";
import { phosphorFor } from "@/lib/primitives/icons";
import { Bar, Frame, Shimmer, type SkeletonFrame } from "./skeleton";
import { BE_URL } from "@/lib/be-url";
import { cn } from "@/lib/utils";
import { ClubTimeline } from "@/components/catalog/club-timeline/lib/club-timeline";
import { YearTimelineItemsSchema } from "../../../src/primitives/year-timeline";

/**
 * Web preview renderer for the primitive format, bound to the design language
 * (design/atomize/design.json): colours, surfaces, outlines and effects come from the brand
 * theme's CSS variables (`--ds-*`, set by the page) and from each primitive's spec; sizes,
 * spacing and type are the ground rules, baked in here as they will be in SwiftUI.
 * OpenUI programs render through `KinoPrimitive`; `$data` values resolve
 * against the dataset, or to dummies while it loads.
 */

type Spec = Record<string, unknown>;

const TYPE: Record<string, [number, number]> = {
  footnote: [14, 18], body: [16, 20], headline: [18, 22], title3: [20, 25], title2: [22, 28], display: [24, 28], title1: [28, 34],
};
const WEIGHT: Record<string, number> = { regular: 400, medium: 500, semibold: 600 };

/** `surface.brand` → `var(--ds-surface-brand)`; null/undefined stays undefined. */
const tv = (ref: unknown) => (typeof ref === "string" ? (ref.startsWith("#") ? ref : `var(--ds-${ref.replace(/\./g, "-")})`) : undefined);
/** A colour value from a program or sample data: #hex, an iOS colour name, or a theme token. */
const color = (v: unknown) => (typeof v !== "string" ? undefined : v.startsWith("#") ? v : v.includes(".") ? tv(v) : `var(--ios-${v})`);
const effect = (name: unknown) => (typeof name === "string" ? `var(--ds-effect-${name})` : undefined);

/** Text ink: role names map to theme ink; accent colours stay iOS system colours. */
const INK: Record<string, string> = { primary: "ink.primary", secondary: "ink.secondary", tertiary: "ink.tertiary", inverse: "ink.onBrand" };
const ink = (v: unknown) => (typeof v !== "string" ? undefined : INK[v] ? tv(INK[v]) : `var(--ios-${v})`);

interface Ctx {
  byId: ReadonlyMap<string, PNode>; item: { path: string; index: number } | null; specs: Record<string, Spec>; data: unknown;
  /** Skeleton state: leaves draw their catalog shape with a shimmer; containers keep their surface and layout. */
  skeleton: boolean;
  strictData?: boolean;
  overrides?: Readonly<Record<string, unknown>>;
  edit?: (path: string, value: number) => void;
  animateNumbers?: boolean;
}
const TreeCtx = createContext<Ctx>({ byId: new Map(), item: null, specs: {}, data: undefined, skeleton: false });
/** The enclosing Stack's axis, so a Spacer adds space along it (width in a row), like SwiftUI. */
const AxisCtx = createContext<"v" | "h">("v");

/** Value at a dotted path (`card.name`, `buckets[1].label`) in sample data, or undefined. */
function at(data: unknown, path: string): unknown {
  return path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), data);
}

/** A primitive's spec value by path (`styles.primary.fill`), from design.json. */
function useSpec(primitive: string) {
  const { specs } = useContext(TreeCtx);
  return (path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Spec)[k] : undefined), specs[primitive]);
}

/** Resolve a prop value: literals pass through; `@path` reads the sample data, else a dummy (item-scoped for `@.`). */
function useResolve() {
  const { item, data, overrides, strictData } = useContext(TreeCtx);
  return (v: Value | undefined): unknown => {
    if (v && typeof v === "object" && "$data" in v) {
      const path = (v as { $data: string }).$data;
      const absolute = path.startsWith(".") && item ? `${item.path}[${item.index}]${path}` : path;
      const prefix = Object.keys(overrides ?? {}).filter(key => absolute === key || absolute.startsWith(`${key}.`)).sort((a, b) => b.length - a.length)[0];
      const resolved = prefix ? at(overrides![prefix], absolute.slice(prefix.length).replace(/^\./, "")) : at(data, absolute);
      return resolved !== undefined || strictData ? resolved : dummy(absolute, item?.index);
    }
    return v;
  };
}

const ROLL = { duration: 200, easing: "cubic-bezier(0.77, 0, 0.175, 1)" };
/**
 * Horizontal scroll: the scroller runs edge to edge with no padding of its own; the items carry the
 * inset (first item's leading margin, last item's trailing margin) and snap to it. `--inset` is the
 * surrounding container's padding: 24 on the screen, a Card's own padding inside a card.
 */
const H_SCROLL = "-mx-[var(--inset,24px)] flex snap-x overflow-x-auto overscroll-x-contain scroll-px-[var(--inset,24px)] py-1 [scrollbar-width:none] [&>*]:shrink-0 [&>*]:snap-start [&>*:first-child]:ml-[var(--inset,24px)] [&>*:last-child]:mr-[var(--inset,24px)]";

const FADE = { duration: 125, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
function textStyle(role: unknown, weight: unknown, color: string | undefined): CSSProperties {
  const key = TYPE[String(role)] ? String(role) : "body";
  const [size, leading] = TYPE[key]!;
  return { fontSize: `var(--ds-type-${key}-size, ${size}px)`, lineHeight: `var(--ds-type-${key}-line, ${leading}px)`, fontWeight: WEIGHT[String(weight)] ?? 400, color };
}

/** A chart primitive's `style` object (catalog BAR_STYLE / SHARE_STYLE); unknown or missing fields are defaults. */
type ChartLook = { orientation?: string; corners?: string; highlight?: string; shape?: string; grid?: boolean; ink?: string; domain?: string; axis?: string };
const lookOf = (v: unknown): ChartLook => (v && typeof v === "object" && !Array.isArray(v) ? (v as ChartLook) : {});

/** SF Symbols name → a Phosphor stand-in (SF glyphs are Apple-platforms only; see lib/primitives/icons.ts). */
function Icon({ name, size = 24, color }: { name: unknown; size?: number; color?: string }) {
  const { name: key, weight } = phosphorFor(String(name ?? "circle"));
  const Glyph = (Icons as unknown as Record<string, Icons.Icon | undefined>)[key] ?? Icons.Circle;
  return <Glyph size={size} color={color ?? "currentColor"} weight={weight} />;
}

/** A node, or while its line is still streaming: the server's frame for this slot, else a generic shimmer. */
/**
 * Image sources from data: a server path (/media/logos/ARS) resolves against the backend the
 * tree streamed from; https URLs pass through; anything else (a colour placeholder) is no image.
 */
function imageUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  if (v.startsWith("/")) return `${BE_URL}${v}`;
  return /^https:\/\//.test(v) ? v : null;
}

/** Loads async over whatever is under it: invisible until loaded, then a 150ms ease-out fade; on error it stays hidden. */
/** Shimmer until it loads, then only the image, so a transparent logo has nothing behind it. A failed load keeps the flat placeholder. */
function ImageFill({ src }: { src: string }) {
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  return <>{state === "loading" && <Shimmer className="absolute inset-0 size-full" />}{state === "fail" && <span className="absolute inset-0" style={{ background: tv("surface.filled") }} />}<FadeImage src={src} onState={setState} /></>;
}

type TimelineStretch = { name: string; lineColor: string; tagColor: string; logo: string; points: { x: number; label: string; value: number; display: string }[] };

/** A stepped value line in club colours, crest above each stretch. The header's right side follows the scrub and keeps its space, so nothing jumps. */
function StepTimeline({ value, caption, segments, ticks }: { value: string; caption?: string; segments: TimelineStretch[]; ticks: { value: number; display: string }[] }) {
  const [hover, setHover] = useState<{ segment: number; point: number } | null>(null);
  const W = 300, H = 200, HEADROOM = 28, CREST = 20;
  const stretches = segments.filter(s => s.points.length);
  const all = stretches.flatMap(s => s.points);
  if (all.length < 2) return <span style={textStyle("title1", "semibold", tv("ink.primary"))}>{value}</span>;
  const [start, end] = [all[0]!.x, all.at(-1)!.x];
  const top = Math.max(...all.map(p => p.value)) || 1;
  const fx = (x: number) => (x - start) / (end - start || 1);
  const fy = (v: number) => HEADROOM + (1 - v / top) * (H - HEADROOM - 2);
  const color = (hex: string, fallback: string) => hex || tv(fallback)!;
  const paths = stretches.map((s, i) => {
    const before = stretches[i - 1]?.points.at(-1);
    const after = stretches[i + 1]?.points[0];
    let d = before ? `M${fx(s.points[0]!.x) * W},${fy(before.value)}V${fy(s.points[0]!.value)}` : `M${fx(s.points[0]!.x) * W},${fy(s.points[0]!.value)}`;
    s.points.slice(1).forEach(p => { d += `H${fx(p.x) * W}V${fy(p.value)}`; });
    if (after) d += `H${fx(after.x) * W}`;
    return d;
  });
  const crests = stretches.map((s, i) => {
    const from = s.points[0]!.x;
    const to = stretches[i + 1]?.points[0]?.x ?? s.points.at(-1)!.x;
    const mid = (from + to) / 2;
    return { logo: s.logo, width: fx(to) - fx(from), left: fx(mid), top: Math.max(0, fy(Math.max(...s.points.map(p => p.value))) - CREST - 4) };
  });
  const pick = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const at = start + Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * (end - start);
    let best = { segment: 0, point: 0 }, gap = Infinity;
    stretches.forEach((s, segment) => s.points.forEach((p, point) => { if (Math.abs(p.x - at) < gap) { gap = Math.abs(p.x - at); best = { segment, point }; } }));
    setHover(best);
  };
  const shown = hover ?? { segment: stretches.length - 1, point: stretches.at(-1)!.points.length - 1 };
  const stretch = stretches[shown.segment]!;
  const point = stretch.points[shown.point]!;
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3" style={{ minHeight: 68 }}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="tabular-nums" style={textStyle("title1", "semibold", tv("ink.primary"))}>{value}</span>
          {caption && <span style={textStyle("footnote", "regular", tv("ink.secondary"))}>{caption}</span>}
        </div>
        {hover && (
          <div className="flex shrink-0 flex-col items-end" style={{ gap: 6 }}>
            <span style={textStyle("footnote", "semibold", color(stretch.lineColor, "ink.primary"))}>{stretch.name}</span>
            <span style={textStyle("footnote", "regular", tv("ink.secondary"))}>{point.label}</span>
            <span className="inline-flex items-center rounded-[4px] px-2 tabular-nums" style={{ ...textStyle("footnote", "semibold", "#ffffff"), height: 20, background: color(stretch.tagColor, "surface.brand") }}>{point.display}</span>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1 touch-none" style={{ height: H }} onPointerDown={pick} onPointerMove={pick} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={color(stretches[i]!.lineColor, "ink.primary")} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
        </svg>
        {hover && <span className="absolute bottom-0 w-px -translate-x-1/2" style={{ left: `${fx(point.x) * 100}%`, top: 0, background: tv("outline.control") }} />}
        <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${fx(point.x) * 100}%`, top: fy(point.value), background: color(stretch.lineColor, "ink.primary") }} />
        {crests.map((c, i) => c.logo && c.width * 326 >= CREST && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={c.logo} alt="" draggable={false} className="pointer-events-none absolute -translate-x-1/2 object-contain" style={{ left: `${c.left * 100}%`, top: c.top, width: CREST, height: CREST }} />
        ))}
      </div>
        <div className="relative shrink-0 tabular-nums" style={{ width: 44, height: H }}>
          {ticks.map(tick => <span key={tick.value} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: fy(tick.value), ...textStyle("footnote", "regular", tv("ink.tertiary")) }}>{tick.display}</span>)}
        </div>
      </div>
    </div>
  );
}

/** The monogram on its disc until the image loads. A photo then sits on the disc colour and a crest on nothing, unclipped; both fit the whole frame, so a head is never cut off. */
function AvatarFace({ name, size, rounded, disc, photoFill, image, player }: { name: string; size: number; rounded: boolean; disc: CSSProperties; photoFill: string; image: string | null | undefined; player: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center font-medium", !(loaded && !player) && "overflow-hidden", rounded ? "rounded-[8px]" : "rounded-full")}
      style={{ width: size, height: size, fontSize: size >= 40 ? 16 : 12, ...disc, ...(loaded ? { background: "transparent" } : {}) }}
    >
      {!loaded && name.slice(0, 1)}
      {image && <FadeImage src={image} style={player ? { background: photoFill } : undefined} onState={state => setLoaded(state === "ok")} />}
    </span>
  );
}

function FadeImage({ src, className, style, onState }: { src: string; className?: string; style?: CSSProperties; onState?: (s: "ok" | "fail") => void }) {
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  if (state === "fail") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" draggable={false} decoding="async"
      onLoad={() => { setState("ok"); onState?.("ok"); }} onError={() => { setState("fail"); onState?.("fail"); }}
      className={cn("absolute inset-0 size-full object-contain transition-opacity duration-150 motion-reduce:transition-none", state === "ok" ? "opacity-100" : "opacity-0", className)}
      style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)", ...style }} />
  );
}

const NativeSlotsCtx = createContext<ReadonlyMap<string, ReactNode> | null>(null);

function Child({ id, frame }: { id: string; frame?: SkeletonFrame }) {
  const { byId } = useContext(TreeCtx);
  const native = useContext(NativeSlotsCtx);
  if (native?.has(id)) return native.get(id);
  const node = byId.get(id);
  if (!node) return frame ? <div title={`waiting for ${id}`}><Frame f={frame} /></div> : <Shimmer className="h-11 rounded-[12px]" />;
  return <Primitive node={node} />;
}
const kids = (n: PNode, arg: string) => (n.children[arg] ?? []).map((id) => <Child key={id} id={id} />);

function SelectedPanel({ ids, selected }: { ids: readonly string[]; selected: number }) {
  return ids[selected] ? <Child key={selected} id={ids[selected]!} /> : null;
}

/** Fill, ink, border and effect of one spec entry as inline style. */
function look(s: (path: string) => unknown, at: string): CSSProperties {
  const fill = s(`${at}.fill`);
  const border = s(`${at}.border`);
  const fx = s(`${at}.effect`);
  return {
    background: fill === "surface.brandGradient" ? tv(fill) : tv(fill),
    color: tv(s(`${at}.ink`)),
    border: typeof border === "string" ? `1px solid ${tv(border)}` : undefined,
    boxShadow: effect(fx),
  };
}

/** Renders a node and tells its children which way they flow (for axis-aware Spacers). */
function Primitive({ node: n }: { node: PNode }) {
  const axis = useContext(AxisCtx);
  const flows = (n.primitive === "Stack" && (n.props.axis === "h" || n.props.axis === "wrap")) || n.primitive === "Rail";
  return <AxisCtx.Provider value={flows ? "h" : "v"}><PrimitiveBody node={n} axis={axis} /></AxisCtx.Provider>;
}

const LINE_OF = (role: unknown) => (TYPE[String(role)] ?? TYPE.body!)[1];
const WIDTH_OF: Record<string, string> = { title1: "50%", title2: "50%", title3: "50%", display: "45%", headline: "55%", body: "70%", footnote: "40%" };

/**
 * The skeleton shape of a leaf (primitive catalog SKELETON), or undefined for containers,
 * which render as usual and let their children draw their own shapes.
 */
function skeletonOf(n: PNode, p: (k: string) => unknown, axis: "v" | "h"): ReactNode | undefined {
  const size = (fallback: number) => Number(p("size") ?? fallback);
  switch (n.primitive) {
    case "Text": {
      const lines = Math.max(1, Math.min(4, Number(p("lines") ?? 1)));
      const w = WIDTH_OF[String(p("role"))] ?? "70%";
      return <span className="flex w-full flex-col">{Array.from({ length: lines }, (_, i) => <Bar key={i} line={LINE_OF(p("role"))} width={i === lines - 1 && lines > 1 ? "60%" : w} />)}</span>;
    }
    case "Number":
      return <Bar line={LINE_OF(p("role"))} width={axis === "h" ? "72px" : "40%"} />;
    case "Icon":
      return <Shimmer className="rounded-[4px]" style={{ width: size(24), height: size(24) }} />;
    case "ColorCell":
      return <Shimmer className="shrink-0 rounded-[4px]" style={{ aspectRatio: "1", width: p("size") && p("size") !== "fill" ? Number(p("size")) : "100%" }} />;
    case "Image": {
      const [w, h] = String(p("aspect") ?? "4-3").split("-").map(Number);
      return <Shimmer className={cn(p("rounded") ? "rounded-[24px]" : "")} style={{ aspectRatio: `${w ?? 4} / ${h ?? 3}`, width: p("width") ? Number(p("width")) : "100%" }} />;
    }
    case "Avatar":
    case "AvatarStack":
      return <Shimmer className={p("shape") === "rounded" ? "rounded-[8px]" : "rounded-full"} style={{ width: size(40), height: size(40) }} />;
    case "IconTile":
      return <Shimmer className="rounded-[12px]" style={{ width: size(40), height: size(40) }} />;
    case "Button":
      return <Shimmer className="h-11 rounded-[8px]" style={{ width: p("wide") ? "100%" : 128 }} />;
    case "IconButton":
      return <Shimmer className="size-11 rounded-full" />;
    case "Pill":
    case "Chip":
      return <Shimmer className="h-8 w-[72px] rounded-full" />;
    case "Badge":
      return <Shimmer className={p("size") === "small" ? "w-7" : "w-[72px]"} style={{ height: p("size") === "small" ? 16 : p("size") === "large" ? p("fill") === "none" ? 34 : 42 : 24, borderRadius: p("size") === "large" ? 8 : 4 }} />;
    case "SegmentedControl":
      return <Shimmer className="h-11 w-full rounded-full" />;
    case "Toggle":
      return <span className="flex min-h-11 items-center justify-between gap-3"><Bar line={20} width="50%" /><Shimmer className="h-[31px] w-[51px] rounded-full" /></span>;
    case "Stepper":
      return <Shimmer className="h-11 w-32 rounded-full" />;
    case "Progress":
      return p("style") === "ring" ? <Shimmer className="size-20 rounded-full" /> : <Shimmer className="h-2 w-full rounded-full" />;
    case "Bars":
      return <Shimmer className="h-32 w-full rounded-[12px]" />;
    case "ShareBar":
      return <Shimmer className="h-3 w-full rounded-full" />;
    case "Rating":
      return <Bar line={16} width="30%" />;
    case "YearTimeline":
      return <span className="flex w-full flex-col gap-4"><Shimmer className="h-10 w-full rounded-full" /><Shimmer className="h-[220px] w-full rounded-[24px]" /></span>;
    case "StepTimeline":
      return (
        <span className="flex w-full flex-col gap-3">
          <Shimmer className="w-full rounded-[12px]" style={{ height: 68 }} />
          <Shimmer className="w-full rounded-[12px]" style={{ height: 200 }} />
        </span>
      );
    case "SplitBar":
      return <Shimmer className={cn("rounded-full", p("size") === "micro" ? "w-10" : "w-full", axis === "h" && p("size") !== "micro" && "flex-1")} style={{ height: p("size") === "micro" ? 4 : p("size") === "thin" ? 6 : 8 }} />;
    case "Note":
      return <Shimmer className="h-[72px] w-full rounded-[12px]" />;
    case "Section":
      return (
        <section className="flex flex-col gap-3">
          <span className="flex flex-col gap-1"><Bar line={22} width="55%" />{p("subtitle") != null && <Bar line={18} width="40%" />}</span>
          {kids(n, "children")}
        </section>
      );
    case "Row":
      return (
        <div className="flex min-h-11 items-center gap-3 py-3">
          {kids(n, "leading")}
          <span className="flex min-w-0 flex-1 flex-col gap-1"><Bar line={20} width="60%" />{p("subtitle") != null && <Bar line={18} width="40%" />}</span>
          {kids(n, "trailing")}
        </div>
      );
    case "KeyValue":
      return <div className="flex min-h-11 items-center justify-between gap-3 py-3"><Bar line={20} width="40%" /><Bar line={20} width="25%" /></div>;
    case "Disclosure":
      return <div className="flex min-h-11 items-center justify-between gap-3"><Bar line={20} width="50%" /><Shimmer className="size-4 rounded-[4px]" /></div>;
    default:
      return undefined;
  }
}

function PrimitiveBody({ node: n, axis }: { node: PNode; axis: "v" | "h" }) {
  const r = useResolve();
  const p = (k: string) => r(n.props[k]);
  const ctx = useContext(TreeCtx);
  const s = useSpec(n.primitive);
  const [on, setOn] = useState(Boolean(p("on")));
  const [selected, setSelected] = useState(Number(p("selected") ?? (["Bars", "ShareBar"].includes(n.primitive) ? -1 : 0)));
  const [instantDisclosure, setInstantDisclosure] = useState(false);
  const disclosureId = useId();
  const [open, setOpen] = useState(n.primitive === "Disclosure" ? Boolean(p("open")) : true);

  if (ctx.skeleton && !(n.primitive === "SegmentedControl" && n.children.panels?.length)) {
    const shape = skeletonOf(n, p, axis);
    if (shape !== undefined) return shape;
  }

  switch (n.primitive) {
    case "Stack": {
      if (p("axis") === "wrap") {
        // Flow layout: children keep their own width and wrap into rows, one gap both ways.
        return <div className="flex min-w-0 flex-row flex-wrap items-center" style={{ gap: Number(p("gap") ?? 0), paddingInline: Number(p("paddingX") ?? 0), paddingBlock: Number(p("paddingY") ?? 0) }}>{kids(n, "children")}</div>;
      }
      const h = p("axis") === "h";
      return (
        <div
          // A column inside a row takes the remaining width (and lets one-line text truncate), like an identity next to a mark;
          // an end-aligned column is a trailing column (a date over a status) and keeps its own width.
          className={cn("flex min-w-0", h ? "flex-row" : "flex-col", !h && axis === "h" && (p("align") === "end" ? "shrink-0" : "flex-1"))}
          style={{
            gap: Number(p("gap") ?? 0), paddingInline: Number(p("paddingX") ?? 0), paddingBlock: Number(p("paddingY") ?? 0),
            alignItems: ({ start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as Record<string, string>)[String(p("align"))] ?? (h ? "center" : "stretch"),
            justifyContent: ({ start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as Record<string, string>)[String(p("justify"))],
          }}
        >
          {p("overlap") != null
            ? (n.children.children ?? []).map((id, i) => (
                <div key={id} className="relative" style={i > 0 ? { [h ? "marginLeft" : "marginTop"]: -Number(p("overlap")) - Number(p("gap") ?? 0) } : undefined}>
                  <Child id={id} />
                </div>
              ))
            : p("divided") ? (n.children.children ?? []).map((id, i) => <Fragment key={id}>{i > 0 && <div className={h ? "w-px self-stretch" : "h-px"} style={{ background: tv("outline.subtle") }} />}<Child id={id} /></Fragment>) : kids(n, "children")}
        </div>
      );
    }
    case "Grid":
      return <div className="grid" style={{ gridTemplateColumns: `repeat(${p("columns")}, minmax(0, 1fr))`, columnGap: Number(p("gap") ?? 0), rowGap: Number(p("rowGap") ?? p("gap") ?? 0) }}>{kids(n, "children")}</div>;
    case "Rail": {
      const width = Number(p("width") ?? 0);
      return (
        <div className={cn(H_SCROLL, "snap-mandatory")} style={{ gap: Number(p("gap") ?? 12) }}>
          {width ? (n.children.children ?? []).map((id) => <div key={id} className="shrink-0" style={{ width }}><Child id={id} /></div>) : kids(n, "children")}
        </div>
      );
    }
    case "Card": {
      const surface = String(p("surface") ?? "card");
      const selected = Boolean(p("selected"));
      return (
        <div
          className={cn("flex flex-col gap-4 backdrop-blur-xl", p("radius") === "control" ? "rounded-[12px]" : "rounded-[24px]")}
          style={{
            padding: Number(p("padding") ?? 16), gap: Number(p("gap") ?? 16),
            ["--inset" as string]: `${Number(p("padding") ?? 16)}px`,
            ...look(s, `surfaces.${surface}`),
            ...(selected ? { border: `1px solid ${tv(s("selected.border") ?? "surface.brand")}`, boxShadow: effect(s("selected.effect")) } : {}),
          }}
        >
          {kids(n, "children")}
        </div>
      );
    }
    case "Section":
      return (
        <section className="flex flex-col gap-3">
          <div className={cn("flex items-center justify-between gap-3", Boolean(p("sticky")) && "sticky top-0 z-10 -mx-6 px-6 py-2")} style={p("sticky") ? { background: tv("surface.screen") } : undefined}>
            <button type="button" className="flex min-w-0 flex-col text-left" onClick={() => p("collapsible") && setOpen(!open)}>
              <span style={textStyle("headline", "semibold", tv("ink.primary"))}>{String(p("title"))}</span>
              {p("subtitle") != null && <span style={textStyle("footnote", "regular", tv("ink.tertiary"))}>{String(p("subtitle"))}</span>}
            </button>
            {kids(n, "trailing")}
          </div>
          {open && kids(n, "children")}
          {p("footnote") != null && <span style={textStyle("footnote", "regular", tv("ink.tertiary"))}>{String(p("footnote"))}</span>}
        </section>
      );
    case "Disclosure":
      return (
        <div className="flex flex-col">
          <button type="button" aria-expanded={open} aria-controls={disclosureId} className="flex min-h-11 items-center gap-3 text-left" onClick={(e) => { setInstantDisclosure(e.detail === 0); setOpen(!open); }}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span style={textStyle("body", "medium", tv("ink.primary"))}>{String(p("label"))}</span>
              {p("subtitle") != null && <span style={textStyle("footnote", "regular", tv("ink.secondary"))}>{String(p("subtitle"))}</span>}
            </span>
            {kids(n, "trailing")}
            <span className="primitive-disclosure-chevron" style={{ transform: `rotate(${open ? 0 : -90}deg)`, color: tv("ink.tertiary"), ...(instantDisclosure ? { transition: "none" } : {}) }}><Icon name="chevron.down" size={16} /></span>
          </button>
          <Collapse open={open} instant={instantDisclosure} id={disclosureId}><div className="flex flex-col gap-3 pt-3">{kids(n, "children")}</div></Collapse>
        </div>
      );
    case "Divider":
      return <div className={cn("h-px", Boolean(p("inset")) && "ml-14", Boolean(p("bleed")) && "-mx-6")} style={{ background: tv("outline.subtle") }} />;
    case "Spacer":
      return <div className="shrink-0" style={axis === "h" ? { width: Number(p("size") ?? 0) } : { height: Number(p("size") ?? 0) }} />;
    case "ZStack": {
      // SwiftUI ZStack: the first child is the base and sizes the stack; the rest layer over it.
      const [base, ...over] = n.children.children ?? [];
      const a = String(p("alignment") ?? "center");
      const v = a.startsWith("top") ? "flex-start" : a.startsWith("bottom") ? "flex-end" : "center";
      const h = a.endsWith("leading") ? "flex-start" : a.endsWith("trailing") ? "flex-end" : "center";
      const inset = Number(p("inset") ?? 0);
      return (
        <div className="relative">
          {base && <Child id={base} />}
          {Boolean(p("scrim")) && <div className="pointer-events-none absolute inset-0 rounded-[24px]" style={{ background: "linear-gradient(180deg, transparent 35%, #0000008c 100%)" }} />}
          {over.map((id) => (
            <div key={id} className="pointer-events-none absolute inset-0 flex" style={{ alignItems: v, justifyContent: h, padding: inset }}>
              <div className="pointer-events-auto" style={p("scrim") ? { color: "#ffffff" } : undefined}><Child id={id} /></div>
            </div>
          ))}
        </div>
      );
    }
    case "Show":
      return p("when") ? <>{kids(n, "child")}</> : null;
    case "Text": {
      // No data, no line: an empty detail or caption takes no space.
      if (p("content") === "") return null;
      const lines = Number(p("lines") ?? 0);
      const dataColor = typeof p("color") === "string" && /^#[0-9a-f]{6}$/i.test(p("color") as string) ? p("color") as string : null;
      const style = textStyle(p("role"), p("weight"), dataColor ?? (typeof p("tone") === "string" ? tv(`tone.${p("tone")}.fg`) : ink(p("ink") ?? "primary")));
      return (
        <span
          className={cn(lines === 1 && "truncate", p("align") === "center" && "text-center", p("align") === "end" && "text-right")}
          style={{ ...style, ...(lines > 1 ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}),
            // reserve: always `lines` lines tall, so short and long titles keep cards the same height.
            ...(lines > 0 && p("reserve") === true ? { minHeight: `calc(${style.lineHeight} * ${lines})` } : {}) }}
        >
          {p("content") == null ? "—" : String(p("content"))}
        </span>
      );
    }
    case "Number": {
      // An unpublished fact (null in web data) reads as a dash, never as $0.
      if (p("value") === null) return <span className="tabular-nums" style={textStyle(p("role"), p("weight"), ink("tertiary"))}>—</span>;
      const raw = Number(p("value") ?? 0);
      // A dummy may come back as text for an unknown path; show a sample figure, never NaN.
      const value = Number.isFinite(raw) ? raw : 128.5;
      const format = String(p("format"));
      const whole = Number.isInteger(value);
      const compact = Boolean(p("compact"));
      const opts: Record<string, Intl.NumberFormatOptions> = {
        currency: compact ? { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 } : { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }, percent: { style: "percent", maximumFractionDigits: 2 },
        integer: compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }, count: { notation: "compact", maximumFractionDigits: 1 }, decimal: compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 2 },
      };
      const v = format === "percent" ? value / 100 : value;
      // signed: show the sign (− for negatives, + for positives); otherwise drop it.
      const sign = p("signed") ? (v < 0 ? "−" : v > 0 ? "+" : "") : v < 0 ? "−" : "";
      const abs = Math.abs(v);
      return (
        <span className="tabular-nums" style={textStyle(p("role"), p("weight"), ink(p("ink") ?? "primary"))}>
          {sign}
          {p("roll") ? <NumberFlow value={abs} animated={ctx.animateNumbers ?? true} respectMotionPreference transformTiming={ROLL} spinTiming={ROLL} opacityTiming={FADE} format={(opts[format] ?? {}) as Parameters<typeof NumberFlow>[0]["format"]} /> : new Intl.NumberFormat("en-US", opts[format] ?? {}).format(abs)}
          {p("suffix") != null ? String(p("suffix")) : format === "duration" ? " min" : format === "distance" ? " km" : format === "energy" ? " kcal" : format === "mass" ? " g" : ""}
        </span>
      );
    }
    case "Icon":
      return <Icon name={p("name")} size={Number(p("size") ?? 24)} color={ink(p("ink") ?? "primary")} />;
    case "Image":
      // Placeholder: one flat colour; a sample value that is a colour (#hex or an iOS name) tints it.
      const src = p("src");
      const tint = typeof src === "string" && /^#[0-9a-f]{3,8}$/i.test(src) ? src : typeof src === "string" && /^[a-z]+$/.test(src) ? `var(--ios-${src})` : tv("surface.filled");
      const width = p("width") != null ? Number(p("width")) : null;
      const url = imageUrl(src);
      return (
        <div className={cn("relative overflow-hidden", width ? "shrink-0" : "w-full", p("rounded") !== false && (width && width < 56 ? "rounded-[8px]" : "rounded-[24px]"))}
          style={{ aspectRatio: String(p("aspect") ?? "1-1").replace("-", "/"), background: url ? undefined : tint, ...(width ? { width } : {}), ...(p("ring") ? { boxShadow: `0 0 0 4px ${tv("surface.screen")}` } : {}) }}>
          {url && <ImageFill key={url} src={url} />}
        </div>
      );
    case "Avatar": {
      const size = Number(p("size") ?? 40);
      const disc: CSSProperties = { ...look(s, "monogram"), ...(typeof p("color") === "string" && /^#[0-9a-f]{6}$/i.test(p("color") as string) ? { background: p("color") as string } : p("tint") ? { background: color(p("tint")) } : {}) };
      const image = imageUrl(p("image"));
      // A photo sits on its club's colour. With no club known it sits on a neutral fill, not a colour that reads as a club's.
      const photoFill = (typeof p("color") === "string" && /^#[0-9a-f]{6}$/i.test(p("color") as string)) || p("tint") ? String(disc.background) : String(tv("surface.filled"));
      return <AvatarFace key={String(image)} name={String(p("name") ?? "?")} size={size} rounded={p("shape") === "rounded"} disc={disc} photoFill={photoFill} image={image} player={p("kind") === "player"} />;
    }
    case "AvatarStack": {
      // Initials on soft tints, overlapping by 8, then a +N disc (Kino taste-match / consensus voters).
      const size = Number(p("size") ?? 20);
      const raw = p("people");
      const people = (Array.isArray(raw) ? raw : ["A", "B", "C"]).map((x) => String(x ?? ""));
      const max = Number(p("max") ?? 3);
      const shown = people.slice(0, max);
      const rest = people.length - shown.length;
      const TINTS = ["#f29bc8", "#9bbcff", "#b6e3a1", "#ffd28a", "#c9b3ff", "#8fe0d6"];
      const initials = (name: string) => name.split(/[\s.&-]+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).slice(0, 2).join("") || "?";
      const disc = (key: string, i: number, body: ReactNode, bg: string, fg: string) => (
        <span key={key} className={cn("grid shrink-0 place-items-center rounded-full font-semibold", i > 0 && "-ml-2")}
          style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.max(9, Math.round(size * 0.36)), boxShadow: `0 0 0 2px ${tv("surface.card")}` }}>{body}</span>
      );
      if (!people.length) return null;
      return (
        <span className="flex items-center">
          {shown.map((name, i) => disc(name + i, i, size >= 28 ? initials(name) : null, TINTS[i % TINTS.length]!, "#121110"))}
          {rest > 0 && disc("rest", shown.length, size >= 28 ? `+${rest}` : null, tv("surface.filled")!, tv("ink.secondary")!)}
        </span>
      );
    }
    case "IconTile": {
      const size = Number(p("size") ?? 40);
      const style = String(p("style") ?? "soft");
      return (
        <span className="flex shrink-0 items-center justify-center rounded-[12px]" style={{ width: size, height: size, ...look(s, `styles.${style}`) }}>
          <Icon name={p("icon")} size={24} />
        </span>
      );
    }
    case "Button": {
      const style = String(p("style") ?? "primary");
      return (
        <button
          type="button"
          disabled={Boolean(p("disabled"))}
          className={cn("flex h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[12px] px-4 transition-transform active:scale-[0.97] disabled:opacity-40", Boolean(p("wide")) && "w-full flex-1", style === "text" && "px-1", Boolean(p("iconTrailing")) && "flex-row-reverse")}
          style={{ ...textStyle("body", "medium", undefined), ...look(s, `styles.${style}`) }}
        >
          {p("icon") != null && <Icon name={p("icon")} size={16} />}
          <span className="px-1">{String(p("label"))}</span>
        </button>
      );
    }
    case "IconButton": {
      const style = String(p("style") ?? "plain");
      return (
        <button type="button" aria-label={String(p("label"))} disabled={Boolean(p("disabled"))} className="flex size-11 shrink-0 items-center justify-center rounded-full active:scale-[0.95] disabled:opacity-40" style={look(s, `styles.${style}`)}>
          <Icon name={p("icon")} size={24} />
        </button>
      );
    }
    case "Pill":
      return (
        <span className="inline-flex h-7 w-fit items-center gap-2 rounded-full px-3" style={{ ...textStyle("footnote", "regular", undefined), ...look(s, "style"), ...(p("dot") != null ? { paddingLeft: 8 } : {}) }}>
          {p("dot") != null && <span className="size-3 shrink-0 rounded-full" style={{ background: color(p("dot")) }} />}
          <span style={{ color: tv(s("label.ink")) }}>{String(p("label"))}</span>
          {p("value") != null && <span className="tabular-nums" style={{ color: tv(s("value.ink")), fontWeight: 500 }}>{String(p("value"))}</span>}
        </span>
      );
    case "Badge": {
      const tone = String(p("tone") ?? "neutral");
      const large = p("size") === "large";
      const small = p("size") === "small";
      const plain = p("fill") === "none";
      return (
        <span className="inline-flex w-fit shrink-0 items-center gap-1 tabular-nums" style={{
          ...textStyle(large ? "title1" : "footnote", large ? "semibold" : "medium", undefined), ...look(s, `tones.${tone}`),
          ...(small ? { fontSize: 11, lineHeight: "16px", fontWeight: 600 } : {}),
          borderRadius: large ? 8 : 4, paddingInline: plain ? 0 : large ? 12 : small ? 4 : 8, paddingBlock: plain ? 0 : large ? 4 : 0,
          ...(large ? {} : { height: small ? 16 : 24 }),
          ...(p("fill") ? { background: plain ? "transparent" : tv(p("fill")) } : {}),
          ...(p("ink") ? { color: tv(p("ink")) } : {}),
        }}>
          {p("icon") != null && <Icon name={p("icon")} size={16} />}
          {String(p("label"))}
        </span>
      );
    }
    case "Chip": {
      const sel = Boolean(p("selected"));
      return (
        <button type="button" className="inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-3" style={{ ...textStyle("footnote", "medium", undefined), ...look(s, `styles.${sel ? "selected" : "unselected"}`) }}>
          {p("icon") != null && <Icon name={p("icon")} size={16} />}
          {String(p("label"))}
        </button>
      );
    }
    case "SegmentedControl": {
      const options = (p("options") as unknown[]) ?? [];
      const current = Math.min(Math.max(0, selected), Math.max(0, options.length - 1));
      const panels = n.children.panels ?? [];
      const controls = <div role="group" aria-label="View selection" className="grid h-11 rounded-full p-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0,1fr))`, background: tv(s("track.fill")) }}>
        {options.map((o, i) => <button key={i} type="button" aria-pressed={i === current} onClick={() => setSelected(i)} className="rounded-full transition-colors" style={{ ...textStyle("body", "medium", undefined), ...look(s, `item.${i === current ? "selected" : "unselected"}`) }}>{String(o)}</button>)}
      </div>;
      const panel = <SelectedPanel ids={panels} selected={current} />;
      return <div className="flex min-w-0 flex-col gap-4">{Boolean(p("contentFirst")) ? <>{panel}{controls}</> : <>{controls}{panel}</>}</div>;
    }
    case "Toggle":
      return (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span style={textStyle("body", "regular", tv("ink.primary"))}>{String(p("label"))}</span>
            {p("caption") != null && <span style={textStyle("footnote", "regular", tv("ink.secondary"))}>{String(p("caption"))}</span>}
          </span>
          <button type="button" role="switch" aria-checked={on} disabled={Boolean(p("disabled"))} onClick={() => setOn(!on)} className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-40" style={{ background: tv(s(`${on ? "on" : "off"}.fill`)) }}>
            <span className={cn("absolute top-0.5 left-0.5 size-7 rounded-full bg-white transition-transform", on && "translate-x-5")} style={{ boxShadow: effect(s("knob.effect")) }} />
          </button>
        </div>
      );
    case "Stepper":
      return (
        <div className="flex items-center gap-3">
          <button type="button" className="flex size-11 items-center justify-center rounded-full" style={{ background: tv("surface.control"), color: tv("ink.primary") }}><Icon name="minus" size={16} /></button>
          <span className="tabular-nums" style={textStyle("headline", "medium", tv("ink.primary"))}>{String(p("value"))}{p("unit") != null ? ` ${String(p("unit"))}` : ""}</span>
          <button type="button" className="flex size-11 items-center justify-center rounded-full" style={{ background: tv("surface.control"), color: tv("ink.primary") }}><Icon name="plus" size={16} /></button>
        </div>
      );
    case "ColorCell": {
      const override = p("color");
      const label = String(p("label") ?? "");
      const size = p("size");
      return <span role="img" aria-label={label} title={label} className="block shrink-0 rounded-[4px]" style={{ aspectRatio: "1", width: size && size !== "fill" ? Number(size) : "100%", background: typeof override === "string" && /^#[0-9a-f]{6}$/i.test(override) ? override : tv(p("fill")) }} />;
    }
    case "Progress": {
      const v = Math.max(0, Math.min(100, Number(p("value") ?? 0)));
      const color = p("tone") ? tv(`tone.${p("tone")}.fg`) : tv(s("bar.fill") ?? "surface.brand");
      if (p("style") === "ring") {
        const rad = 26, c = 2 * Math.PI * rad;
        return (
          <div className="flex flex-col items-center gap-1">
            <svg width={64} height={64} viewBox="0 0 64 64"><circle cx={32} cy={32} r={rad} fill="none" stroke={tv("surface.control")} strokeWidth={6} /><circle cx={32} cy={32} r={rad} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 32 32)" /></svg>
            {p("label") != null && <span style={textStyle("footnote", "regular", tv("ink.secondary"))}>{String(p("label"))}</span>}
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-1">
          {p("label") != null && <span style={textStyle("footnote", "medium", tv("ink.primary"))}>{String(p("label"))}</span>}
          <div className="h-2 overflow-hidden rounded-full" style={{ background: tv("surface.control") }}><div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} /></div>
          {p("caption") != null && <span style={textStyle("footnote", "regular", tv("ink.tertiary"))}>{String(p("caption"))}</span>}
        </div>
      );
    }
    case "Bars": {
      const raw = p("series");
      const series = (Array.isArray(raw) && raw.length && typeof raw[0] === "object" ? raw : [62, 80, 45, 90, 70, 55, 85].map((v, i) => ({ label: "MTWTFSS"[i], value: v }))) as { label?: string; value?: number }[];
      const max = Math.max(1, ...series.map((x) => Number(x.value ?? 0)));
      const look = lookOf(p("style"));
      // Which bar takes the brand fill: the selected one (default), the largest, the latest, or none.
      const lit = look.highlight === "none" ? -1 : look.highlight === "max" ? series.findIndex((x) => Number(x.value ?? 0) === max)
        : look.highlight === "last" ? series.length - 1 : selected;
      const radius = look.corners === "square" ? 0 : look.corners === "soft" ? 4 : 9999;
      const rest = look.ink ? ink(look.ink) : tv("surface.control");
      const labels = look.axis !== "none" && look.axis !== "y";
      const amount = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
      if (look.orientation === "horizontal") {
        return (
          <div className="grid items-center gap-x-3 gap-y-2" style={{ gridTemplateColumns: labels ? "auto 1fr auto" : "1fr auto" }}>
            {series.map((x, i) => (
              <Fragment key={i}>
                {labels && <span style={textStyle("footnote", "regular", tv("ink.tertiary"))}>{String(x.label ?? "")}</span>}
                <button type="button" onClick={() => setSelected(i)} className="h-3 transition-[width]" aria-label={String(x.label ?? "")}
                  style={{ width: `${Math.max(2, (100 * Number(x.value ?? 0)) / max)}%`, borderRadius: radius, background: i === lit ? tv("surface.brand") : rest }} />
                <span className="tabular-nums" style={textStyle("footnote", i === lit ? "medium" : "regular", tv(i === lit ? "ink.primary" : "ink.tertiary"))}>{Boolean(p("values")) ? amount(Number(x.value ?? 0)) : ""}</span>
              </Fragment>
            ))}
          </div>
        );
      }
      return (
        <div className="relative">
          {look.grid && <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[22px] flex flex-col justify-between">{[0, 1, 2].map((k) => <span key={k} className="h-px" style={{ background: tv("outline.subtle") }} />)}</div>}
          <div className="relative flex h-32 items-end gap-2">
            {series.map((x, i) => (
              <button key={i} type="button" onClick={() => setSelected(i)} className="flex h-full flex-col items-center justify-end gap-1 transition-[flex-grow]" style={{ flexGrow: i === lit ? 1.5 : 1, flexBasis: 0 }}>
                {Boolean(p("values")) && (
                  <span className="tabular-nums" style={textStyle("footnote", i === lit ? "medium" : "regular", tv(i === lit ? "ink.primary" : "ink.tertiary"))}>{amount(Number(x.value ?? 0))}</span>
                )}
                <div className="w-full transition-colors" style={{ height: `${Math.max(4, (100 * Number(x.value ?? 0)) / max)}%`, borderRadius: radius, background: i === lit ? tv("surface.brand") : rest }} />
                {labels && <span style={textStyle("footnote", "regular", tv("ink.tertiary"))}>{String(x.label ?? "")}</span>}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "YearTimeline": {
      const parsed = YearTimelineItemsSchema.safeParse(p("items"));
      if (!parsed.success || !parsed.data.length) return null;
      const clubs = parsed.data.map(item => ({ ...item, loan: item.marker === "currency" }));
      const value = Number(p("initial") ?? 0);
      const initial = Number.isFinite(value) ? Math.min(clubs.length - 1, Math.max(0, Math.trunc(value))) : 0;
      return <ClubTimeline key={JSON.stringify([clubs, initial])} clubs={clubs} initial={initial} />;
    }
    case "StepTimeline":
      return <StepTimeline value={String(p("value") ?? "")} caption={p("caption") ? String(p("caption")) : undefined} segments={Array.isArray(p("segments")) ? p("segments") as unknown as TimelineStretch[] : []} ticks={Array.isArray(p("ticks")) ? p("ticks") as unknown as { value: number; display: string }[] : []} />;
    case "ShareBar": {
      const raw = p("parts");
      const fallback = [{ label: "Protein", value: 45, ink: "blue" }, { label: "Carbs", value: 30, ink: "orange" }, { label: "Fat", value: 25, ink: "green" }];
      const list = (Array.isArray(raw) && raw.length && typeof raw[0] === "object" ? raw : fallback) as { label?: string; value?: number; share?: number; ink?: string; detail?: string }[];
      const parts = list.map((x) => ({ label: x.label ?? "", v: Number(x.value ?? x.share ?? 0), detail: x.detail, color: ink(x.ink) ?? tv("surface.brand") }));
      const total = parts.reduce((a, x) => a + x.v, 0) || 1;
      const dim = (i: number) => (Boolean(p("selectable")) && selected >= 0 && selected !== i ? 0.3 : 1);
      const shape = lookOf(p("style")).shape;
      // Donut / pie: SectorMark with 1.5° gaps (angularInset) and inner radius 0.62 for the donut.
      const sectors = () => {
        const R = 80, r = shape === "donut" ? R * 0.62 : 0, gap = parts.length > 1 ? (1.5 * Math.PI) / 180 : 0;
        const at = (a: number, rad: number) => [80 + rad * Math.sin(a), 80 - rad * Math.cos(a)].map((n) => n.toFixed(2)).join(",");
        let start = 0;
        return parts.map((x, i) => {
          const sweep = (2 * Math.PI * x.v) / total, a0 = start + gap / 2, a1 = start + sweep - gap / 2, large = a1 - a0 > Math.PI ? 1 : 0;
          start += sweep;
          if (a1 <= a0) return null;
          const d = r ? `M${at(a0, R)}A${R},${R} 0 ${large} 1 ${at(a1, R)}L${at(a1, r)}A${r},${r} 0 ${large} 0 ${at(a0, r)}Z` : `M80,80L${at(a0, R)}A${R},${R} 0 ${large} 1 ${at(a1, R)}Z`;
          return <path key={i} d={d} fill={x.color} opacity={dim(i)} onClick={() => setSelected(selected === i ? -1 : i)} />;
        });
      };
      return (
        <div className="flex flex-col gap-3">
          {shape === "donut" || shape === "pie"
            ? <svg viewBox="0 0 160 160" className="size-40 self-center" role="img" aria-label={parts.map((x) => `${x.label} ${Math.round((100 * x.v) / total)}%`).join(", ")}>{sectors()}</svg>
            : <div className="flex h-4 overflow-hidden rounded-full" style={{ background: tv("surface.control") }}>{parts.map((x, i) => <div key={i} style={{ width: `${(100 * x.v) / total}%`, background: x.color, opacity: dim(i) }} />)}</div>}
          {p("legend") !== false && (
            Boolean(p("selectable")) ? <div className="flex flex-col gap-1">{parts.map((x, i) => <button key={i} type="button" aria-pressed={selected === i} onClick={() => setSelected(selected === i ? -1 : i)} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left" style={{ background: selected === i ? tv("surface.control") : undefined, ...textStyle("footnote", "regular", tv("ink.primary")) }}><span className="size-2 shrink-0 rounded-full" style={{ background: x.color }} /><span className="min-w-0 flex-1">{x.label}</span><span className="tabular-nums" style={{ color: tv("ink.secondary") }}>{x.detail}</span><span className="shrink-0 tabular-nums">{((100 * x.v) / total).toFixed(1)}%</span></button>)}</div> : <div className="flex flex-wrap gap-2">{parts.map((x, i) => <span key={i} className="flex items-center gap-1.5" style={textStyle("footnote", "regular", tv("ink.secondary"))}><span className="size-2 rounded-full" style={{ background: x.color }} />{x.label} {Math.round((100 * x.v) / total)}%</span>)}</div>
          )}
        </div>
      );
    }
    case "Rating": {
      const v = Number(p("value") ?? 4.2) % 5;
      return (
        <span className="flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => <Icon key={i} name={i < Math.round(v) ? "star.fill" : "star"} size={16} color={tv("ink.brand")} />)}
          {p("count") != null && <span style={textStyle("footnote", "regular", tv("ink.tertiary"))}>({String(p("count"))})</span>}
        </span>
      );
    }
    case "SplitBar": {
      const raw = p("sides");
      const sides = (Array.isArray(raw) && raw.length ? raw : [{ label: "Home", count: 9, tone: "good" }, { label: "Away", count: 3, tone: "bad" }]) as { label?: string; count?: number; tone?: string; color?: string }[];
      // A team's #hex wins over the tone.
      const sideColor = (x: { tone?: string; color?: string }) => (x.color && /^#[0-9a-f]{3,8}$/i.test(x.color) ? x.color : tv(`tone.${x.tone ?? "neutral"}.fg`));
      const top = Math.max(...sides.map((x) => Number(x.count ?? 0)));
      const winners = sides.filter((x) => Number(x.count ?? 0) === top).length;
      const height = p("size") === "micro" ? 4 : p("size") === "thin" ? 6 : 8;
      const shown = sides.filter((x) => Number(x.count ?? 0) > 0);
      const bar = (
        <span role="img" aria-label={sides.map((x) => `${x.label} ${x.count}`).join(", ")} className={cn("flex gap-0.5 overflow-hidden rounded-full", p("size") === "micro" ? "w-10 shrink-0" : "w-full min-w-0", axis === "h" && p("size") !== "micro" && "flex-1")} style={{ height }}>
          {shown.map((x, i) => (
            <span key={i} className="h-full" style={{ flexGrow: Number(x.count), flexBasis: 0, background: sideColor(x),
              opacity: p("dim") && winners === 1 && Number(x.count) !== top ? 0.35 : 1 }} />
          ))}
        </span>
      );
      if (!p("legend")) return bar;
      return (
        <span className="flex w-full flex-col gap-2">
          {bar}
          <span className="flex justify-between tabular-nums" style={textStyle("footnote", "regular", undefined)}>
            {shown.map((x, i) => <span key={i} style={{ color: sideColor(x) }}>{x.label} {x.count}</span>)}
          </span>
        </span>
      );
    }
    case "Note": {
      const tone = String(p("tone") ?? "neutral");
      return (
        <div className="flex items-center gap-3 rounded-[12px] p-3" style={look(s, `tones.${tone}`)}>
          {p("icon") != null && <Icon name={p("icon")} size={24} />}
          <div className="flex min-w-0 flex-col">
            {p("title") != null && <span style={textStyle("footnote", "semibold", undefined)}>{String(p("title"))}</span>}
            <span className="text-left" style={textStyle("footnote", "medium", undefined)}>{String(p("text"))}</span>
          </div>
        </div>
      );
    }
    case "Row":
      return (
        <div className="flex min-h-11 items-center gap-3 py-3">
          {kids(n, "leading")}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="line-clamp-2" style={textStyle("body", s("title.weight") ?? "medium", tv(s("title.ink") ?? "ink.primary"))}>{String(p("title"))}</span>
            {p("subtitle") != null && <span className="line-clamp-2" style={textStyle("footnote", "regular", tv(s("subtitle.ink") ?? "ink.tertiary"))}>{String(p("subtitle"))}</span>}
          </div>
          <span className="min-w-0 max-w-[45%] shrink-0 text-right" style={{ color: tv("ink.secondary") }}>{kids(n, "trailing")}</span>
        </div>
      );
    case "KeyValue":
      return (
        <div className="flex min-h-11 items-center justify-between gap-3 py-3">
          <span style={textStyle("body", "regular", tv("ink.secondary"))}>{String(p("label"))}</span>
          <span style={textStyle("body", "medium", tv(p("action") != null ? "ink.brand" : "ink.primary"))}>{String(p("value"))}</span>
        </div>
      );
    case "NavBar":
      return (
        <div className="relative -mx-6 flex h-11 items-center justify-between px-6" style={{ color: tv("ink.primary") }}>
          {p("leading") !== "none" ? (
            <span className="flex size-11 items-center justify-center rounded-full" style={p("style") === "filled" ? look(s, "styles.filled") : undefined}>
              <Icon name={p("leading") === "close" ? "xmark" : "chevron.left"} size={24} />
            </span>
          ) : <span />}
          {p("title") != null && <span className="absolute inset-x-0 text-center" style={textStyle("headline", "semibold", tv("ink.primary"))}>{String(p("title"))}</span>}
          <span className="flex">{kids(n, "trailing")}</span>
        </div>
      );
    case "Dock":
      // No shadow: a hairline separates the dock from content scrolling under it. A row wider
      // than the screen scrolls sideways (full bleed, the 24 inset as inner padding) instead of
      // squeezing its buttons until their labels break.
      return (
        <div className="sticky bottom-0 -mx-6 flex flex-col gap-3 pt-3 pb-(--safe-bottom) backdrop-blur-xl" style={{ background: tv("surface.screen"), borderTop: `1px solid ${tv("outline.subtle")}`, boxShadow: effect(s("effect")) }}>
          {(n.children.children ?? []).map((id) => (
            <div key={id} className="overflow-x-auto px-6 [scrollbar-width:none] [&>*]:min-w-full [&>*]:w-max"><Child id={id} /></div>
          ))}
        </div>
      );
    default:
      return <div className="rounded-[8px] border border-dashed p-2 text-[14px]" style={{ borderColor: tv("tone.bad.fg"), color: tv("tone.bad.fg") }}>Unknown primitive {n.primitive}</div>;
  }
}

/**
 * Renders a tree: the placement's children (or the fragment's top node) on the theme's screen
 * surface, with the 24 screen inset and 28 between blocks. `theme` is the brand's CSS
 * variables (lib/primitives/design.ts themeVars); `specs` the primitive specs of design.json.
 */
/** Resolved OpenUI values use the same Kino presentation and native React child slots. */
export function KinoProvider({ children, specs = {}, skeleton = false }: { children: ReactNode; specs?: Record<string, Spec>; skeleton?: boolean }) {
  return <TreeCtx value={{ byId: new Map(), item: null, specs, data: undefined, skeleton, strictData: true }}>{children}</TreeCtx>;
}

export function KinoPrimitive({ name, props, slots }: { name: string; props: Readonly<Record<string, Value>>; slots: Readonly<Record<string, readonly ReactNode[]>> }) {
  const children: Record<string, string[]> = {};
  const rendered = new Map<string, ReactNode>();
  for (const [slot, values] of Object.entries(slots)) children[slot] = values.map((value, index) => {
    const id = `${slot}:${index}`;
    rendered.set(id, value);
    return id;
  });
  const node: PNode = { id: name, primitive: name, props, children, line: 0, itemOf: null };
  return <NativeSlotsCtx value={rendered}><Primitive node={node} /></NativeSlotsCtx>;
}
