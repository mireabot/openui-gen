/** How a collection of items is laid out on screen. */
export type CollectionLayout = "list" | "grid" | "text" | "rail";

/** Collection counts constrain layouts, never individual card variants or internal details. */
export function collectionLayoutReason(layout: string, count: number, explicit: CollectionLayout | null): string | null {
  if (explicit) return layout === explicit ? null : `explicit ${explicit} layout`;
  if (layout === "list" && (count < 1 || count > 5)) return "list requires 1–5 displayed items";
  if (layout === "rail" && count < 6) return "rail requires 6+ displayed items";
  return null;
}
