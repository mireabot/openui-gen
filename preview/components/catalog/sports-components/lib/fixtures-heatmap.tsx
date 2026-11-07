import { cn } from "@/lib/utils";

export type FixtureResult = "win" | "draw" | "loss" | "upcoming";

const SQUARE: Record<FixtureResult, string> = {
  win: "bg-ds-tone-good-fg",
  loss: "bg-ds-tone-bad-fg",
  draw: "bg-ds-outline-control",
  upcoming: "bg-ds-surface-filled",
};

const OVERVIEW: { result: Exclude<FixtureResult, "upcoming">; label: string }[] = [
  { result: "win", label: "Won" },
  { result: "draw", label: "Drawn" },
  { result: "loss", label: "Lost" },
];

/** Up to 20 results sit 10 to a row. Past that the columns grow, keeping two rows, so a whole season fits one card. */
export const heatmapColumns = (results: number) => Math.min(24, Math.max(10, Math.ceil(results / 2)));

export type FixturesHeatmapProps = {
  /** The headline number, e.g. points per game ("1.9") or a win ratio ("62%"). */
  value: string | number;
  /** What the number is, under it: "Points per game · last 15 matches". */
  caption: string;
  /** One square per fixture, oldest first. `upcoming` is a fixture not played yet. */
  results: FixtureResult[];
  /** Squares per row. By default it follows the count, so every result fits and the squares shrink. */
  columns?: number;
  /** The won · drawn · lost counts under the grid. */
  overview?: boolean;
  /** The word for a draw in the counts, or null for a league where draws are not a result. */
  drawLabel?: string | null;
  className?: string;
};

/**
 * A team's run of fixtures, laid out like consensus-card's c24 (component-references/c24): no
 * title, the number first, a caption saying what it is, then the content. Here the content is a
 * grid of squares, green for a win, red for a loss, gray for a draw and empty for one to come,
 * and the counts under it.
 */
export function FixturesHeatmap({ value, caption, results, columns = heatmapColumns(results.length), overview = true, drawLabel = "Drawn", className }: FixturesHeatmapProps) {
  return (
    <section data-node-id="fixtures-heatmap" className={cn("flex flex-col items-center gap-4 rounded-[24px] bg-ds-surface-card p-4 text-center", className)}>
      <div className="flex flex-col items-center">
        <span data-node-id="value" className="text-[56px] leading-[56px] font-semibold tabular-nums">{value}</span>
        <span data-node-id="caption" className="mt-2 text-[15px] leading-[22px] text-ds-ink-secondary">{caption}</span>
      </div>
      <div data-node-id="heatmap" className="grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {results.map((result, index) => (
          <span key={index} data-node-id={result} className={cn("aspect-square rounded-[4px]", SQUARE[result])} />
        ))}
      </div>
      {overview && (
        <div data-node-id="overview" className="flex items-center justify-center gap-4 text-[13px] leading-[18px] text-ds-ink-secondary tabular-nums">
          {OVERVIEW.filter(({ result }) => result !== "draw" || drawLabel !== null).map(({ result, label }) => (
            <span key={result} className="flex items-center gap-2">
              <span className={cn("size-3 rounded-[4px]", SQUARE[result])} />
              <span><span className="font-semibold text-ds-ink-primary">{results.filter((r) => r === result).length}</span> {result === "draw" ? drawLabel : label}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
