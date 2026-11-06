"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { BODY, FOOTNOTE, LABEL, Mark, Plot, TITLE2, TITLE3, playerLines, useScrub, valueAt, type LineKind, type Person, type Values } from "./metric-chart";

const ROW = 48;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (change: () => void) => {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const useReducedMotion = () => useSyncExternalStore(subscribe, () => window.matchMedia(MOTION_QUERY).matches, () => false);

export type PlayersMetricProps = {
  /** "Passing touchdowns". */
  readonly title: string;
  /** Under the title: "Season total". */
  readonly subtitle?: string;
  /** Up to four players. */
  readonly people: readonly Person[];
  /** One value list per player, in the same order, one value per period. */
  readonly values: readonly Values[];
  /** One label per period: "Week 12". */
  readonly periods: readonly string[];
  /** First and last period labels under the plot. */
  readonly ends: readonly [string, string];
  /** Running totals carry through a gap; per-period values show nothing there. Default cumulative. */
  readonly kind?: LineKind;
  readonly footnote?: string;
};

/**
 * Several players on one metric over a season, as a race: one row per player, starting with the
 * photo ringed in its line colour, sorted by the value at the scrub. Scrubbing re-sorts the rows;
 * a missed period keeps the last total and says "did not play". Lines take the club colour; a second
 * player from a club takes white, a third secondary, then the club colour at 0.6. No card.
 */
export function PlayersMetric({ title, subtitle, people, values, periods, ends, kind = "cumulative", footnote }: PlayersMetricProps) {
  const [scrub, setScrub] = useScrub();
  const reduce = useReducedMotion();
  const lines = playerLines(people, values);
  const last = periods.length - 1;
  const index = scrub ?? last;
  const at = lines.map((line) => valueAt(line.values, index, kind));
  const order = lines.map((_, i) => i).sort((a, b) => (at[b]!.value ?? -1) - (at[a]!.value ?? -1));

  return (
    <section data-node-id="players-metric" className="flex flex-col gap-4">
      <header data-node-id="header" className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className={cn(TITLE2, "font-semibold")}>{title}</h2>
          {subtitle && <p className={cn(FOOTNOTE, "text-kino-ink-secondary")}>{subtitle}</p>}
        </div>
        <span data-node-id="period" className={cn(LABEL, "shrink-0 font-medium tabular-nums", scrub === null ? "text-kino-ink-secondary" : "text-kino-ink-primary")}>
          {scrub === null ? `After ${periods[last]!.toLowerCase()}` : `After ${periods[index]!.toLowerCase()}`}
        </span>
      </header>

      <ol data-node-id="standings" className="relative" style={{ height: ROW * lines.length }}>
        {lines.map((line, i) => {
          const note = at[i]!.present || at[i]!.value === null ? line.person!.club : `${line.person!.club} · did not play`;
          return (
            <li
              key={line.id}
              data-node-id="standing"
              className="absolute inset-x-0 flex items-center gap-3"
              style={{ height: ROW, transform: `translateY(${order.indexOf(i) * ROW}px)`, transition: reduce ? undefined : `transform 200ms ${EASE_OUT}` }}
            >
              <Mark person={line.person!} size={32} />
              <div className="min-w-0 flex-1">
                <p className={cn(BODY, "truncate font-medium")}>{line.person!.name}</p>
                <p className={cn(LABEL, "truncate text-kino-ink-secondary")}>{note}</p>
              </div>
              <span className={cn(TITLE3, "shrink-0 font-semibold tabular-nums")}>{at[i]!.value ?? "–"}</span>
            </li>
          );
        })}
      </ol>

      <Plot lines={lines} kind={kind} height={200} scrub={scrub} onScrub={setScrub} ends={[ends[0], ends[1]]} />
      {footnote && <p className={cn(LABEL, "text-kino-ink-tertiary")}>{footnote}</p>}
    </section>
  );
}
