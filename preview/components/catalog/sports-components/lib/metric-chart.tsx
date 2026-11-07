"use client";

/**
 * Shared parts for PlayerMetrics and PlayersMetric: line paints, the stepped plot with its scrub,
 * and the player mark. A line is one value per period; a missing period is a gap, never zero.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { dataFill, dataPaint } from "@/components/catalog/design-system";
import { cn } from "@/lib/utils";

/** How a line is painted: a data colour or a design system ink var, and its opacity. */
export type Paint = { color: string; opacity: number };

/** One value per period. `null` is a missing point (bye, injury, did not play): skipped, never zero. */
export type Values = (number | null)[];

export type Person = { readonly name: string; readonly short: string; readonly club: string; readonly clubColor: string; readonly photo?: string };

export type Line = { id: string; label: string; paint: Paint; values: Values; person?: Person };

/** Cumulative lines carry the last total through a gap; period lines show nothing there. */
export type LineKind = "cumulative" | "period";

const INK_PRIMARY = "var(--color-ds-ink-primary)";
const INK_SECONDARY = "var(--color-ds-ink-secondary)";

/** Both MetricsComparison line modes stop at four lines. */
export const MAX_LINES = 4;

/**
 * Several players, one metric. The first player of each club keeps the club colour. Later players
 * from a club already on the chart take the next free fallback: white (primary ink), then
 * secondary ink, then the club colour at 0.6.
 */
export function playerPaints(people: readonly Person[]): Paint[] {
  if (people.length > MAX_LINES) throw new Error(`MetricsComparison draws at most ${MAX_LINES} players`);
  const clubs = new Set<string>();
  const fallbacks = [INK_PRIMARY, INK_SECONDARY];
  return people.map((person) => {
    if (!clubs.has(person.club)) { clubs.add(person.club); return { color: person.clubColor, opacity: 1 }; }
    const next = fallbacks.shift();
    return next ? { color: next, opacity: 1 } : { color: person.clubColor, opacity: 0.6 };
  });
}

/** One player, several metrics: club colour, club colour at 0.6, white, secondary. A hard limit of four. */
export function metricPaints(clubColor: string, count: number): Paint[] {
  if (count > MAX_LINES) throw new Error(`MetricsComparison draws at most ${MAX_LINES} metrics`);
  const order: Paint[] = [
    { color: clubColor, opacity: 1 },
    { color: clubColor, opacity: 0.6 },
    { color: INK_PRIMARY, opacity: 1 },
    { color: INK_SECONDARY, opacity: 1 },
  ];
  return order.slice(0, count);
}

export const playerLines = (people: readonly Person[], values: readonly Values[], label = (p: Person) => p.name): Line[] => {
  const paints = playerPaints(people);
  return people.map((person, index) => ({ id: person.short, label: label(person), paint: paints[index]!, values: values[index]!, person }));
};

export const metricLines = (person: Person, metrics: readonly { id: string; label: string; values: Values }[]): Line[] => {
  const paints = metricPaints(person.clubColor, metrics.length);
  return metrics.map((metric, index) => ({ ...metric, paint: paints[index]!, person }));
};

/** The value a line shows at period `index`, and whether that period has its own point. */
export function valueAt(values: Values, index: number, kind: LineKind): { value: number | null; present: boolean } {
  const own = values[index] ?? null;
  if (own !== null || kind === "period") return { value: own, present: own !== null };
  for (let i = index - 1; i >= 0; i--) if (values[i] != null) return { value: values[i]!, present: false };
  return { value: null, present: false };
}

/** Running totals that skip missing points: a gap stays a gap. */
export function cumulative(values: Values): Values {
  let total = 0;
  return values.map((value) => (value === null ? null : (total = Math.round((total + value) * 100) / 100)));
}

export const LABEL = "text-[13px] leading-[16px]";
export const FOOTNOTE = "text-[13px] leading-[18px]";
export const BODY = "text-[15px] leading-[22px]";
export const TITLE3 = "text-[17px] leading-[20px]";
export const TITLE2 = "text-[22px] leading-[28px]";
export const TITLE1 = "text-[28px] leading-[34px]";

const STROKE = 2;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

/** Whole numbers, or one decimal for values like xG. */
export const numberText = (value: number | null, decimals = 0) => (value === null ? "–" : value.toFixed(decimals));

/** Zero and round steps up to just above the top value, at most five labels. */
export function niceTicks(max: number) {
  const size = 10 ** Math.floor(Math.log10(Math.max(max, 1)));
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5].map((f) => f * size).find((c) => max / c <= 4) ?? size * 10;
  const count = Math.max(1, Math.ceil(max / step - 1e-9));
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

/** The highest value across lines, for a shared scale. */
export const highest = (lines: Line[]) => Math.max(1, ...lines.flatMap((line) => line.values.filter((v): v is number => v !== null)));

/** Last period with its own point, for the idle dot at a line's end. */
export const lastIndex = (values: Line["values"]) => values.reduce<number>((last, v, i) => (v === null ? last : i), -1);

/** A paint as an SVG fill, with its opacity. */
const svgPaint = (paint: Paint) => ({ fill: dataPaint(paint.color), fillOpacity: paint.opacity });

/** A paint as a CSS fill: a swatch, a dot, an avatar ring. */
export const cssPaint = (paint: Paint): CSSProperties => ({ ...dataFill(paint.color), opacity: paint.opacity });

/**
 * A stepped line drawn as filled 2pt segments, one run per stretch of present points: the value
 * holds until the next point, then steps. A missing point ends the run, so a gap stays empty.
 * Sparse lines: one value draws flat across the whole plot, so it is never a lone dot. Fewer than
 * 5 values, while another line has more (`others`), carry the last value to the end as 2-on-3
 * dashes, which no readout counts.
 */
function stepPath(values: Line["values"], x: (i: number) => number, y: (v: number) => number, others = 0) {
  const h = STROKE / 2;
  const rect = (x0: number, y0: number, x1: number, y1: number) =>
    `M${Math.min(x0, x1) - h},${Math.min(y0, y1) - h}H${Math.max(x0, x1) + h}V${Math.max(y0, y1) + h}H${Math.min(x0, x1) - h}Z`;
  const present = values.flatMap((value, i) => (value === null ? [] : [[value, i] as const]));
  const end = values.length - 1;
  if (present.length === 1) return rect(x(0), y(present[0]![0]), x(end), y(present[0]![0]));
  let d = "";
  values.forEach((value, i) => {
    if (value === null) return;
    const next = values[i + 1];
    if (next == null) {
      // An isolated point still shows as a short tick.
      if (values[i - 1] == null) d += rect(x(i) - 2, y(value), x(i) + 2, y(value));
      return;
    }
    d += rect(x(i), y(value), x(i + 1), y(value));
    d += rect(x(i + 1), y(value), x(i + 1), y(next));
  });
  const last = present.at(-1);
  if (last && present.length < 5 && others >= 5 && last[1] < end) {
    for (let from = x(last[1]) + 3; from < x(end); from += 5) d += rect(from, y(last[0]), Math.min(from + 2, x(end)), y(last[0]));
  }
  return d;
}

/** The plot width, read from layout so the 2pt segments stay 2pt. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Draw-in on appear: a left-to-right reveal, or a short fade with reduced motion. */
function useDrawIn() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== "function") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = reduce
      ? element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" })
      : element.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: 600, easing: EASE_OUT });
    return () => animation.cancel();
  }, []);
  return ref;
}

export type PlotProps = {
  lines: Line[];
  kind: LineKind;
  height: number;
  scrub: number | null;
  onScrub: (index: number | null) => void;
  /** Shared top for several plots; defaults to the lines' highest value. */
  max?: number;
  /** Y axis labels on the right, or none when the values are printed elsewhere. */
  axis?: "right" | "none";
  decimals?: number;
  /** First and last period labels under the plot. */
  ends?: [string, string];
  /** A line id to keep bright; the others dim. */
  focus?: string | null;
  /** Hides the idle end dots, when the composition marks line ends itself. */
  endDots?: boolean;
  /** Room above the top tick for a dot or label. */
  headroom?: number;
};

/** Geometry shared by the plot and anything placed over it (end labels). */
export function geometry(count: number, width: number, height: number, top: number, headroom: number) {
  const x = (i: number) => (count <= 1 ? 0 : (i / (count - 1)) * width);
  const y = (v: number) => headroom + (1 - v / top) * (height - headroom - STROKE);
  return { x, y };
}

/**
 * Stepped lines with a scrub: drag or hover to read a period. The dotted line marks the finger,
 * lines to its right dim, a dot sits on each line at the scrub. Lifting returns to the latest values.
 */
export function Plot({ lines: given, kind, height, scrub, onScrub, max, axis = "right", decimals = 0, ends, focus = null, endDots = true, headroom = 8 }: PlotProps) {
  const [box, width] = useWidth();
  // The focused line draws last, on top.
  const lines = focus ? [...given.filter((l) => l.id !== focus), ...given.filter((l) => l.id === focus)] : given;
  const draw = useDrawIn();
  const count = Math.max(...lines.map((line) => line.values.length));
  const ticks = niceTicks(max ?? highest(lines));
  const top = ticks.at(-1)!;
  const { x, y } = geometry(count, width, height, top, headroom);

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onScrub(Math.round(fraction * (count - 1)));
  };
  const release = (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType !== "mouse") onScrub(null); };

  const scrubX = scrub === null ? null : x(scrub);
  const dim = (line: Line) => (focus && focus !== line.id ? 0.2 : 1);
  const layer = (clip?: string) => (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 overflow-visible" style={clip ? { clipPath: clip } : undefined}>
      {width > 0 && lines.map((line) => (
        <path key={line.id} d={stepPath(line.values, x, y, Math.max(0, ...lines.filter((other) => other.id !== line.id).map((other) => other.values.filter((v) => v !== null).length)))} {...svgPaint(line.paint)} opacity={dim(line)} />
      ))}
    </svg>
  );

  const dots = lines.flatMap((line) => {
    const index = scrub ?? lastIndex(line.values);
    if (index < 0 || (scrub === null && !endDots)) return [];
    const { value, present } = valueAt(line.values, index, kind);
    if (value === null) return [];
    return [{ id: line.id, left: x(index), top: y(value), paint: line.paint, opacity: dim(line), present }];
  });
  // Tied dots sit side by side, 8pt apart, so none hides another.
  dots.forEach((dot) => {
    const level = dots.filter((other) => Math.abs(other.top - dot.top) < 1);
    if (level.length > 1) dot.left += (level.indexOf(dot) - (level.length - 1) / 2) * 8;
  });

  return (
    <div data-node-id="plot-area" className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div
          ref={box}
          data-node-id="plot"
          className="relative min-w-0 flex-1 touch-none select-none"
          style={{ height }}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
          onPointerMove={pick}
          onPointerUp={release}
          onPointerCancel={() => onScrub(null)}
          onPointerLeave={() => onScrub(null)}
        >
          {scrubX !== null && (
            <span data-node-id="scrub-line" className="pointer-events-none absolute inset-y-0 border-l border-dotted border-ds-ink-secondary" style={{ left: scrubX }} />
          )}
          <div ref={draw} className="pointer-events-none absolute inset-0">
            {/* Dim copy under the bright one; the bright copy is cut at the finger. */}
            <div className="absolute inset-0 opacity-30">{layer()}</div>
            {layer(scrubX === null ? undefined : `inset(-8px ${Math.max(0, width - scrubX)}px -8px -8px)`)}
            {dots.map((dot) => (
              <span
                key={dot.id}
                data-node-id="scrub-dot"
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ds-surface-screen"
                style={{ left: dot.left, top: dot.top, ...cssPaint(dot.paint), opacity: dot.paint.opacity * dot.opacity }}
              >
                {/* Hollow when the total is carried through a missing point. */}
                {!dot.present && <span className="absolute inset-[2px] rounded-full bg-ds-surface-screen" />}
              </span>
            ))}
          </div>
        </div>
        {axis === "right" && (
          <div data-node-id="y-axis" className={cn(LABEL, "relative w-8 shrink-0 text-ds-ink-tertiary tabular-nums")} style={{ height }}>
            {ticks.map((tick) => (
              <span key={tick} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: y(tick) }}>{numberText(tick, tick % 1 ? 1 : 0)}</span>
            ))}
          </div>
        )}
      </div>
      {ends && (
        <div data-node-id="x-axis" className={cn(LABEL, "flex justify-between text-ds-ink-tertiary", axis === "right" && "pr-10")}>
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}

/** One scrub index for a whole composition, null when idle. */
export function useScrub() {
  return useState<number | null>(null);
}

const initials = (name: string) => name.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();

/**
 * A player's photo on the club colour, inside a 2pt ring in the line's paint, so two players from
 * one club are still told apart by their line.
 */
export function Mark({ person, paint, size = 32 }: { person: Person; paint?: Paint; size?: 24 | 32 | 40 }) {
  const photo = (
    <span className="flex size-full items-center justify-center overflow-hidden rounded-full" style={dataFill(person.clubColor)}>
      {person.photo
        ? <img src={person.photo} alt="" className="size-full object-cover object-top" />
        : <span className={cn(LABEL, "font-semibold text-ds-ink-on-brand")}>{initials(person.name)}</span>}
    </span>
  );
  if (!paint) return <span data-node-id="avatar" className="block shrink-0" style={{ width: size, height: size }}>{photo}</span>;
  return (
    <span data-node-id="avatar" className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full" style={cssPaint(paint)} />
      <span className="absolute inset-[2px] rounded-full bg-ds-surface-screen p-[1px]">{photo}</span>
    </span>
  );
}

/** A short line sample in a line's paint, for legends. */
export function Swatch({ paint, className }: { paint: Paint; className?: string }) {
  return <span data-node-id="swatch" className={cn("block h-[3px] w-3 shrink-0 rounded-full", className)} style={cssPaint(paint)} />;
}
