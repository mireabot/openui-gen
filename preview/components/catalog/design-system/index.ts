import type { CSSProperties } from "react";

/**
 * The only way a colour from the data (a club's colour, a logo tint, a chart series) reaches a
 * design system screen: one flat fill on a crest, avatar, logo disc, placeholder or chart mark. Everything
 * else uses design system tokens (bg-ds-*, text-ds-*).
 */
export function dataFill(color: string): CSSProperties {
  return { backgroundColor: color };
}

/** `dataFill` for SVG `fill` (a crest shape or a chart mark). */
export function dataPaint(color: string): string {
  return color;
}
