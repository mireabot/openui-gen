/**
 * Haiku's plan for the web: the request broken into logical lookups, one per topic, each run as its
 * own Parallel search at the same time. A lookup keeps its own template (the guarantees it needs,
 * such as "latest reported" earnings); the plan adds what the user actually asked, in their terms,
 * and the keyword searches to run. Prices and charts are never lookups: one history API draws them.
 */
export const RESEARCH_TOPICS = ["peers", "earnings", "consensus", "etfExposure", "fundHolders", "stats", "funds"] as const;
export type ResearchTopic = (typeof RESEARCH_TOPICS)[number];
export interface ResearchFocus { readonly focus: string; readonly searchQueries: readonly string[] }
export interface ResearchQuery extends ResearchFocus { readonly topic: ResearchTopic }

/** The planned lookup for a topic, if Haiku planned one. */
export const plannedFor = (plan: readonly ResearchQuery[] | undefined, topic: ResearchTopic): ResearchFocus | undefined =>
  plan?.find(query => query.topic === topic);

/** A template objective with the user's angle added, and the plan's keywords when it has them. */
export function withFocus(objective: string, templateQueries: readonly string[], planned?: ResearchFocus): { objective: string; searchQueries: readonly string[] } {
  return { objective: planned?.focus ? `${objective}\nThe user's angle: ${planned.focus}` : objective,
    searchQueries: planned?.searchQueries.length ? planned.searchQueries : templateQueries };
}
