"use client";

import { useRef, useState } from "react";
import { dataFill } from "@/components/catalog/kino";
import { cn } from "@/lib/utils";
import { Crest, type CrestSize } from "./team-detail";

/** One column: a player, a season or a club, with its single value. */
export type BarSubject = {
  readonly id: string;
  readonly name: string;
  /** Under the name: a season, a club. */
  readonly caption?: string;
  readonly value: number;
  /** The value as printed, when it differs from the raw number: "67%". */
  readonly display?: string;
  /** A second line under the value: "2.1 pts". */
  readonly secondary?: string;
  /** The subject's club colour, from the data. */
  readonly color: string;
  /** A player's or coach's photo on the club colour disc. Wins over the logo. */
  readonly photo?: string;
  /** A club crest, shown with nothing behind it. */
  readonly logo?: string;
  /** Letters on the disc when there is no photo or logo. */
  readonly monogram?: string;
};

export type BarSet = {
  /** "Bayern · points per game". */
  readonly title: string;
  /** The one metric every value is: "Goals", "Pts/game". */
  readonly metric: string;
  readonly subjects: readonly BarSubject[];
};

/**
 * Columns per page of the horizontal scroller.
 * - 5 or fewer: all on one page, no scrolling.
 * - More: the largest of 5, 4, 3 that splits the total evenly (16 → 4, 15 → 5, 12 → 4, 9 → 3).
 * - No even split: the one of 5, 4, 3 leaving the fewest empty slots on the last page, the larger on a tie (7 → 4, 13 → 5).
 * The web scroll snap and SwiftUI's `containerRelativeFrame(.horizontal, count: n)` use the same n.
 */
export function chunkSize(total: number): number {
  if (total <= 5) return Math.max(total, 1);
  const options = [5, 4, 3];
  const even = options.find((n) => total % n === 0);
  if (even) return even;
  const empty = (n: number) => (n - (total % n)) % n;
  return options.reduce((best, n) => (empty(n) < empty(best) ? n : best));
}

const topValue = (subjects: readonly BarSubject[]) => Math.max(0, ...subjects.map((subject) => subject.value));
/** Every subject that reaches the top value leads, so ties share the emphasis. */
const isLeader = (subject: BarSubject, subjects: readonly BarSubject[]) => subject.value > 0 && subject.value === topValue(subjects);
const valueText = (subject: BarSubject) => subject.display ?? String(subject.value);

/** Light club colours (Man City sky blue, Real Madrid gold) get the dark screen ink; the rest the light on-brand ink. WCAG luminance. */
function inkOn(color: string) {
  const hex = color.replace("#", "");
  const channel = (start: number) => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.35 ? "text-kino-surface-screen" : "text-kino-ink-on-brand";
}

/** Photo on the club disc, else the crest, else first and last initials on the club colour. */
function Mark({ subject, size = 40 }: { subject: BarSubject; size?: CrestSize }) {
  const words = subject.name.split(/\s+/);
  const initials = words.length > 1 ? `${words[0]!.charAt(0)}${words.at(-1)!.charAt(0)}` : subject.name.charAt(0);
  return <Crest team={{ name: subject.name, color: subject.color, photo: subject.photo, logo: subject.logo, monogram: subject.monogram ?? initials.toUpperCase() }} size={size} />;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A horizontal pager: CSS scroll snap with `chunkSize(count)` items per page, the web twin of a
 * SwiftUI ScrollView with `.scrollTargetLayout()` and `.containerRelativeFrame(.horizontal, count: n, spacing:)`.
 * Only the first item of each page snaps, so one swipe moves one page. Opens on the first page.
 */
function usePager(count: number, gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const perPage = chunkSize(count);
  const pages = Math.ceil(count / perPage);
  const [page, setPage] = useState(0);


  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setPage(atEnd ? pages - 1 : Math.round(el.scrollLeft / (el.clientWidth + gap)));
  };
  const goTo = (target: number) => ref.current?.scrollTo({ left: target * (ref.current.clientWidth + gap), behavior: reducedMotion() ? "auto" : "smooth" });
  const itemStyle = { width: `calc((100% - ${(perPage - 1) * gap}px) / ${perPage})`, flexShrink: 0 };
  const snapClass = (index: number) => (index % perPage === 0 ? "snap-start snap-always" : "");
  return { ref, pages, page, onScroll, goTo, itemStyle, snapClass };
}

const PLOT = 152;
const PILL = 52;
const GAP = 8;

/**
 * One metric across any number of subjects: a plot band with a guide line per column and a value
 * pill floating at the value's height (club colour on top, the optional secondary line below),
 * then the mark, the name and the caption. No card: it sits on the screen like PlayerValue.
 * Many subjects page sideways, `chunkSize` per page, from the first page.
 */
export function MetricBars({ set }: { set: BarSet }) {
  const { subjects } = set;
  const top = topValue(subjects) || 1;
  const { ref, onScroll, itemStyle, snapClass } = usePager(subjects.length, GAP);
  const hasSecondary = subjects.some((subject) => subject.secondary);
  const pill = hasSecondary ? PILL : 28;

  return (
    <section data-node-id="metric-bars" className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3 text-[13px] leading-[16px] font-medium text-kino-ink-secondary">
        <span className="line-clamp-2 min-w-0">{set.title}</span>
        <span data-node-id="metric" className="shrink-0">{set.metric}</span>
      </header>
      <div className="relative">
        <span data-node-id="plot-band" className="absolute inset-x-0 top-0 rounded-[12px] bg-kino-surface-filled" style={{ height: PLOT }} />
        <div ref={ref} onScroll={onScroll} className="relative flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ gap: GAP }}>
          {subjects.map((subject, index) => {
            const lift = (subject.value / top) * (PLOT - pill - 16);
            const leader = isLeader(subject, subjects);
            return (
              <div key={subject.id} data-node-id="column" className={cn("flex flex-col items-center", snapClass(index))} style={itemStyle}>
                <div className="relative w-full" style={{ height: PLOT }}>
                  <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-kino-outline-subtle" />
                  <div data-node-id="value-pill" className="absolute left-1/2 flex w-max min-w-[64px] max-w-[min(76px,100%)] -translate-x-1/2 flex-col overflow-hidden rounded-[8px]" style={{ bottom: 8 + lift }}>
                    <span className={cn("line-clamp-2 px-2 py-0.5 text-center text-[15px] leading-[22px] font-semibold tabular-nums", inkOn(subject.color))} style={dataFill(subject.color)}>
                      {valueText(subject)}
                    </span>
                    {hasSecondary && (
                      <span className="line-clamp-2 bg-kino-ink-primary px-2 py-0.5 text-center text-[13px] leading-[16px] font-medium text-kino-surface-screen tabular-nums">
                        {subject.secondary ?? "–"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex w-full flex-col items-center gap-1">
                  <Mark subject={subject} size={40} />
                  <span className={cn("line-clamp-2 w-full text-center text-[15px] leading-[22px]", leader ? "font-semibold" : "font-normal")}>{subject.name}</span>
                  {subject.caption && <span className="line-clamp-2 w-full text-center text-[13px] leading-[16px] font-semibold text-kino-ink-secondary tabular-nums">{subject.caption}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
