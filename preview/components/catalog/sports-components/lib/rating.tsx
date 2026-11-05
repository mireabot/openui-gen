import { cn } from "@/lib/utils";

export type RatingBracket = "high" | "mid" | "low";

/** The one bracket rule: 7.0 and up is green, 6.0–6.99 orange, under 6.0 red. */
export function ratingBracket(rating: number): RatingBracket {
  return rating >= 7 ? "high" : rating >= 6 ? "mid" : "low";
}

const PILL: Record<RatingBracket, string> = {
  high: "bg-kino-tone-good-fg text-kino-surface-screen",
  mid: "bg-kino-ink-brand text-kino-surface-screen",
  low: "bg-kino-surface-brand text-kino-ink-on-brand",
};

/** A rating in its bracket colour. `large` is the hero size; null (no rating yet) is a dash. */
export function RatingPill({ value, large = false, className }: { value: number | null; large?: boolean; className?: string }) {
  if (value === null) {
    return <span className={cn("font-semibold text-kino-ink-secondary", large ? "text-[28px] leading-[34px]" : "text-[17px] leading-[22px]", className)}>—</span>;
  }
  return (
    <span
      data-node-id="rating"
      className={cn(
        "inline-flex items-center rounded-[8px] font-semibold tabular-nums",
        large ? "px-3 py-1 text-[28px] leading-[34px]" : "px-2 text-[17px] leading-[22px]",
        PILL[ratingBracket(value)],
        className,
      )}
    >
      {value.toFixed(2)}
    </span>
  );
}
