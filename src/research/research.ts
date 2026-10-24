import { config } from "../config.js";
import { researchWithParallel } from "./parallel-research.js";
import { planSearchQueries } from "./search-plan.js";
import { researchWeb, type ResearchTransport, type SearchEngine, type WebResearch } from "./web-research.js";
import type { CompletionUsage } from "../llm/structured-completion.js";

export interface CitedResearchHints {
  /** 2–3 keyword queries; without them Haiku writes them (Parallel only). */
  readonly searchQueries?: readonly string[];
  /** Trusted domains searched first (Parallel only). */
  readonly preferDomains?: readonly string[];
}

/**
 * Cited web research, on whichever provider is configured (WEB_RESEARCH_PROVIDER): Parallel's Search
 * and Extract APIs with Haiku planning the queries, or OpenRouter's web_search tool run by `model`.
 * Same signature as `researchWeb`, so it drops into `services.research`; a supplied `send` (tests)
 * always means the OpenRouter path it was written for.
 */
export async function citedResearch(query: string, model: string,
  usageHook?: (usage: CompletionUsage, model: string) => void, send?: ResearchTransport, engine?: SearchEngine,
  hints: CitedResearchHints = {}): Promise<WebResearch> {
  const cfg = config();
  if (send || cfg.WEB_RESEARCH_PROVIDER !== "parallel" || !cfg.PARALLEL_API_KEY) return researchWeb(query, model, usageHook, send, engine);
  return researchWithParallel(query, {
    mode: cfg.PARALLEL_SEARCH_MODE,
    ...(hints.searchQueries ? { searchQueries: hints.searchQueries } : {}),
    ...(hints.preferDomains ? { preferDomains: hints.preferDomains } : {}),
    plan: objective => planSearchQueries(objective, ({ model: planModel, usage }) => usageHook?.(usage, planModel)),
    usage: ({ model: provider, costUSD }) => usageHook?.({ promptTokens: 0, completionTokens: 0, costUSD }, provider),
  });
}
