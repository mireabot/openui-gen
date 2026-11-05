import { dataFill } from "@/components/catalog/kino";
import { cn } from "@/lib/utils";
import type { Team } from "./team-detail";

export type StatBarProps = {
  /** Which stat this is, shown small between the two numbers: "Possession", "Shots on target". */
  label: string;
  home: Team;
  away: Team;
  /** The raw values; the bar splits in their proportion. */
  values: { home: number; away: number };
  /** What to print at each edge when it differs from the raw value: "58%", "1.8 xG". */
  display?: { home?: string; away?: string };
  className?: string;
};

/**
 * One stat between two teams, from consensus-card's dual bar (component-references/c24): a header
 * with each team's number at its edge and the stat's name between them, then a bar split in
 * proportion, each side in its team's colour. No card: StatBars stack on the screen.
 */
export function StatBar({ label, home, away, values, display = {}, className }: StatBarProps) {
  const total = Math.max(values.home, 0) + Math.max(values.away, 0);
  return (
    <div data-node-id="stat-bar" className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-3">
        <span className="min-w-12 text-[15px] leading-[22px] font-semibold tabular-nums">{display.home ?? values.home}</span>
        <span className="line-clamp-2 min-w-0 flex-1 text-center text-[13px] leading-[18px] text-kino-ink-secondary">{label}</span>
        <span className="min-w-12 text-right text-[15px] leading-[22px] font-semibold tabular-nums">{display.away ?? values.away}</span>
      </div>
      <div className="flex h-2 w-full gap-1 overflow-hidden rounded-full">
        {total === 0 ? (
          <span className="h-full flex-1 bg-kino-surface-filled" />
        ) : (
          (["home", "away"] as const).filter((side) => values[side] > 0).map((side) => (
            <span
              key={side}
              data-node-id={`${side}-share`}
              className="h-full transition-[flex-grow] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
              style={{ ...dataFill((side === "home" ? home : away).color), flexGrow: values[side], flexBasis: 0 }}
            />
          ))
        )}
      </div>
    </div>
  );
}
