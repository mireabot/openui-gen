"use client";

import { useState, type PointerEvent } from "react";
import { dataFill, dataPaint } from "@/components/catalog/kino";
import { Crest } from "./team-detail";

/** One unbroken spell at a club. `lineColor` draws the line and the club's name; `tagColor` sits behind the white value. */
export type ClubStretch = {
  name: string;
  lineColor: string;
  tagColor: string;
  logo?: string;
  points: { date: string; value: number }[];
};

export type PlayerValueProps = {
  caption: string;
  stretches: ClubStretch[];
};

const WIDTH = 300;
const HEIGHT = 200;
const HEADROOM = 28;
const CREST = 20;

const month = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dateText = (date: string) => month.format(new Date(date));

/** The y axis: zero and round steps up to the top value, at most four labels. */
function valueTicks(top: number) {
  const size = 10 ** Math.floor(Math.log10(Math.max(top, 1)));
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5].map((factor) => factor * size).find((candidate) => top / candidate < 4) ?? size * 10;
  return Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => index * step);
}

/** Thousands under a million, "€900k", and millions from there, "€97.7M". */
export function valueText(value: number) {
  const short = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (value >= 1e9) return `€${short(value / 1e9)}B`;
  if (value >= 999_500) return `€${short(value / 1e6)}M`;
  return value >= 1e3 ? `€${Math.round(value / 1e3)}k` : `€${Math.round(value)}`;
}

/**
 * A player's market value over time: a Kalshi-style stepped line coloured by club, with each club's
 * crest above its stretch and prices on the y axis, with no card. The current value leads the header. Scrubbing fills the header's right
 * side with the club, the date and the value, in a space kept open so nothing jumps.
 */
export function PlayerValue({ caption, stretches }: PlayerValueProps) {
  const [hover, setHover] = useState<{ stretch: number; point: number } | null>(null);
  const all = stretches.flatMap((stretch) => stretch.points);
  const time = (date: string) => Date.parse(date);
  const start = time(all[0]!.date);
  const end = time(all.at(-1)!.date);
  const top = Math.max(...all.map((point) => point.value)) || 1;
  const fx = (date: string) => (time(date) - start) / (end - start || 1);
  const fy = (value: number) => HEADROOM + (1 - value / top) * (HEIGHT - HEADROOM - 2);

  const lines = stretches.map((stretch, index) => {
    const before = stretches[index - 1]?.points.at(-1);
    const after = stretches[index + 1]?.points[0];
    const first = stretch.points[0]!;
    let path = `M${fx(first.date) * WIDTH},${fy(before?.value ?? first.value)}V${fy(first.value)}`;
    for (const point of stretch.points.slice(1)) path += `H${fx(point.date) * WIDTH}V${fy(point.value)}`;
    return after ? `${path}H${fx(after.date) * WIDTH}` : path;
  });

  const crests = stretches.map((stretch, index) => {
    const from = fx(stretch.points[0]!.date);
    const to = fx(stretches[index + 1]?.points[0]?.date ?? stretch.points.at(-1)!.date);
    return { width: to - from, left: (from + to) / 2, top: Math.max(0, fy(Math.max(...stretch.points.map((point) => point.value))) - CREST - 4) };
  });

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = start + Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (end - start);
    let best = { stretch: 0, point: 0 };
    let gap = Infinity;
    stretches.forEach((stretch, s) => stretch.points.forEach((point, p) => {
      const distance = Math.abs(time(point.date) - at);
      if (distance < gap) { gap = distance; best = { stretch: s, point: p }; }
    }));
    setHover(best);
  };

  const shown = hover ?? { stretch: stretches.length - 1, point: stretches.at(-1)!.points.length - 1 };
  const stretch = stretches[shown.stretch]!;
  const point = stretch.points[shown.point]!;

  return (
    <section data-node-id="player-value" className="flex flex-col gap-3">
      <header className="flex min-h-[68px] items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span data-node-id="current-value" className="text-[28px] leading-[34px] font-semibold tabular-nums">{valueText(all.at(-1)!.value)}</span>
          <span className="text-[13px] leading-[16px] text-kino-ink-secondary">{caption}</span>
        </div>
        {hover && (
          <div data-node-id="selection" className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-[13px] leading-[16px] font-semibold" style={{ color: dataPaint(stretch.lineColor) }}>{stretch.name}</span>
            <span className="text-[13px] leading-[16px] text-kino-ink-secondary">{dateText(point.date)}</span>
            <span data-node-id="value-tag" className="inline-flex h-5 items-center rounded-[4px] px-2 text-[13px] leading-[16px] font-semibold text-white tabular-nums" style={dataFill(stretch.tagColor)}>
              {valueText(point.value)}
            </span>
          </div>
        )}
      </header>
      <div className="flex gap-2">
      <div data-node-id="plot" className="relative min-w-0 flex-1 touch-none" style={{ height: HEIGHT }} onPointerDown={pick} onPointerMove={pick} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {lines.map((path, index) => (
            <path key={index} d={path} fill="none" stroke={dataPaint(stretches[index]!.lineColor)} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {hover && <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-kino-outline-control" style={{ left: `${fx(point.date) * 100}%` }} />}
        <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${fx(point.date) * 100}%`, top: fy(point.value), ...dataFill(stretch.lineColor) }} />
        {crests.map((crest, index) => stretches[index]!.logo && crest.width * 300 >= CREST && (
          <span key={index} className="pointer-events-none absolute -translate-x-1/2" style={{ left: `${crest.left * 100}%`, top: crest.top }}>
            <Crest team={{ name: stretches[index]!.name, color: stretches[index]!.lineColor, logo: stretches[index]!.logo }} size={20} />
          </span>
        ))}
      </div>
      <div data-node-id="y-axis" className="relative w-11 shrink-0 text-[13px] leading-[16px] text-kino-ink-tertiary tabular-nums" style={{ height: HEIGHT }}>
        {valueTicks(top).map((tick) => (
          <span key={tick} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: fy(tick) }}>{valueText(tick)}</span>
        ))}
      </div>
      </div>
    </section>
  );
}
