import type { CSSProperties } from "react";

/**
 * The only way a colour from the data (a club's colour, a logo tint, a chart series) reaches a
 * Kino screen: one flat fill on a crest, avatar, logo disc, placeholder or chart mark. Everything
 * else uses Kino tokens (bg-kino-*, text-kino-*). See prompts/kino.md; `npm run canvas -- lint`
 * rejects any other colour.
 */
export function dataFill(color: string): CSSProperties {
  return { backgroundColor: color };
}

/** `dataFill` for SVG `fill` (a crest shape or a chart mark). */
export function dataPaint(color: string): string {
  return color;
}
