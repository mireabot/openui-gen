"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FOOTNOTE, LABEL, MAX_LINES, Mark, Plot, Swatch, TITLE1, TITLE3, metricLines, numberText, useScrub, valueAt, type LineKind, type Person, type Values } from "./metric-chart";

/** One metric line: "Goals", one value per period, and how many decimals it prints with (xG: 1). */
export type PlayerMetric = { readonly id: string; readonly label: string; readonly values: Values; readonly decimals?: number };

export type PlayerMetricsProps = {
  /** Whose numbers these are. The club colour paints the lines even when the header is hidden. */
  readonly person: Person;
  /** One to four metrics, a hard limit. One metric gets the Kalshi header; several get a legend grid. */
  readonly metrics: readonly PlayerMetric[];
  /** One label per period: "Game 12", "Matchweek 38". */
  readonly periods: readonly string[];
  /** First and last period labels under the plot: ["G1", "G82"]. */
  readonly ends: readonly [string, string];
  /** Running totals carry through a gap; per-period values show nothing there. Default cumulative. */
  readonly kind?: LineKind;
  /** The player row (photo, name, caption). Off when the screen already names the player. */
  readonly header?: boolean;
  /** Under the name in the header: "Nuggets · 71 of 82 games". */
  readonly caption?: string;
  /** Under the big total with one metric: "this season". */
  readonly subtitle?: string;
  /** With one metric, a line for the scrubbed period: "31 pts · 12 reb · 11 ast". Undefined when it has none. */
  readonly detailAt?: (index: number) => string | undefined;
  readonly footnote?: string;
};

/**
 * One player over a season. One metric: the total leads, Kalshi style, and scrubbing shows that
 * period beside it. Two to four metrics: a grid of legend chips, each with its value at the scrub;
 * tapping one brings its line forward. Lines: club colour, club colour at 0.6, white, secondary.
 * No card: it sits on the screen like PlayerValue.
 */
export function PlayerMetrics({ person, metrics, periods, ends, kind = "cumulative", header = true, caption, subtitle, detailAt, footnote }: PlayerMetricsProps) {
  const [scrub, setScrub] = useScrub();
  const [focus, setFocus] = useState<string | null>(null);
  const shown = metrics.slice(0, MAX_LINES);
  const lines = metricLines(person, shown);
  const last = periods.length - 1;
  const index = scrub ?? last;
  const single = shown.length === 1;

  return (
    <section data-node-id="player-metrics" className="flex flex-col gap-4">
      {header && (
        <div data-node-id="player" className="flex items-center gap-3">
          <Mark person={person} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] leading-[22px] font-medium">{person.name}</p>
            {caption && <p className={cn(LABEL, "truncate text-kino-ink-secondary")}>{caption}</p>}
          </div>
        </div>
      )}

      {single ? (
        <header data-node-id="total" className="flex min-h-[72px] items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span data-node-id="current-value" className={cn(TITLE1, "font-semibold tabular-nums")}>
              {numberText(valueAt(lines[0]!.values, last, kind).value, shown[0]!.decimals)}
            </span>
            <span className={cn(LABEL, "text-kino-ink-secondary")}>{subtitle ? `${shown[0]!.label} ${subtitle}` : shown[0]!.label}</span>
          </div>
          {scrub !== null && (
            <div data-node-id="selection" className="flex shrink-0 flex-col items-end gap-1">
              <span className={cn(LABEL, "font-semibold")}>{periods[index]}</span>
              {detailAt && <span className={cn(LABEL, "text-kino-ink-secondary tabular-nums")}>{detailAt(index) ?? "Did not play"}</span>}
              <span data-node-id="value-tag" className={cn(LABEL, "inline-flex h-5 items-center rounded-[4px] bg-kino-surface-filled px-2 font-semibold text-kino-ink-secondary tabular-nums")}>
                {kind === "cumulative" ? `${numberText(valueAt(lines[0]!.values, index, kind).value, shown[0]!.decimals)} so far` : numberText(valueAt(lines[0]!.values, index, kind).value, shown[0]!.decimals)}
              </span>
            </div>
          )}
        </header>
      ) : (
        <div data-node-id="legend" className="flex flex-col gap-2">
          <p className={cn(LABEL, "text-kino-ink-secondary tabular-nums")}>
            {kind === "cumulative" ? "Running totals" : "Per period"} · {scrub === null ? `after ${periods[last]!.toLowerCase()}` : periods[index]!.toLowerCase()}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {lines.map((line, i) => {
              const on = focus === line.id;
              return (
                <button
                  key={line.id}
                  type="button"
                  data-node-id="chip"
                  onClick={() => setFocus(on ? null : line.id)}
                  className={cn(
                    "flex min-h-14 flex-col items-start justify-center gap-1 rounded-[12px] border px-3 py-2 text-left transition-[opacity,border-color] duration-150 ease-out",
                    on ? "border-kino-outline-control bg-kino-surface-filled" : "border-kino-outline-subtle bg-kino-surface-card",
                    focus && !on && "opacity-50",
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <Swatch paint={line.paint} />
                    <span className={cn(LABEL, "truncate text-kino-ink-secondary")}>{line.label}</span>
                  </span>
                  <span className={cn(TITLE3, "font-semibold tabular-nums")}>{numberText(valueAt(line.values, index, kind).value, shown[i]!.decimals)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Plot lines={lines} kind={kind} height={220} scrub={scrub} onScrub={setScrub} focus={focus} ends={[ends[0], ends[1]]} />
      {footnote && <p className={cn(FOOTNOTE, "text-kino-ink-tertiary")}>{footnote}</p>}
    </section>
  );
}
