import { z } from "zod";
import { requireKey } from "../config.js";
import { publicSourceURL, type WebResearch, type WebSource } from "./web-research.js";

/**
 * Cited web research on Parallel (docs.parallel.ai): the Search API finds and ranks pages, the
 * Extract API reads the best ones in full, and the result is a `WebResearch` whose findings cite
 * each page's URL for the extraction downstream to check.
 *
 * Search needs 2–3 short keyword queries besides the objective; the caller passes them.
 */

const BASE = "https://api.parallel.ai/v1";
/** Per request, from parallel.ai/pricing: Search basic/advanced $5 per 1K, Extract $1 per 1K URLs. */
const SEARCH_COST = 0.005;
const EXTRACT_COST_PER_URL = 0.001;

const Result = z.object({ url: z.string(), title: z.string().nullable().optional(), publish_date: z.string().nullable().optional(), excerpts: z.array(z.string()).default([]) });
const SearchResponse = z.object({ search_id: z.string(), results: z.array(Result) });
const ExtractResponse = z.object({
  extract_id: z.string(),
  results: z.array(Result.extend({ full_content: z.string().nullable().optional() })),
  errors: z.array(z.object({ url: z.string(), error_type: z.string(), http_status_code: z.number().nullable().optional() })).default([]),
});
type Page = z.infer<typeof Result>;

export interface ParallelResearchOptions {
  /** 2–3 keyword queries of 3–6 words. */
  readonly searchQueries: readonly string[];
  /** Search mode: "fast" ~0.7 s, "advanced" ~3 s and the most thorough (default). */
  readonly mode?: "turbo" | "fast" | "basic" | "advanced";
  readonly maxResults?: number;
  /** How many top pages Extract reads in full, per group (preferred, open), for tables and lists. */
  readonly readTop?: number;
  readonly includeDomains?: readonly string[];
  /**
   * Trusted domains to look at first (e.g. finance.yahoo.com). A second search limited to them runs
   * alongside the open one; their pages lead the findings, are read first and are marked preferred.
   */
  readonly preferDomains?: readonly string[];
  readonly afterDate?: string;
  /** Reports Parallel's per-request cost, in the monitor's usage shape. */
  readonly usage?: (entry: { model: string; costUSD: number; ms: number; requests: number }) => void;
  readonly send?: ParallelTransport;
}

export type ParallelTransport = (path: "search" | "extract", body: object) => Promise<unknown>;

async function sendParallel(path: "search" | "extract", body: object): Promise<unknown> {
  const response = await fetch(`${BASE}/${path}`, {
    // Extract past its fetch budget falls back to the search excerpts (see researchWithParallel).
    method: "POST", signal: AbortSignal.timeout(path === "search" ? 30_000 : 20_000),
    headers: { "x-api-key": requireKey("PARALLEL_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = z.object({ error: z.object({ message: z.string() }) }).safeParse(json);
    throw new Error(`Parallel ${path} HTTP ${response.status}: ${(detail.success ? detail.data.error.message : "request failed").slice(0, 600)}`);
  }
  return json;
}

export async function researchWithParallel(query: string, options: ParallelResearchOptions): Promise<WebResearch> {
  const send = options.send ?? sendParallel;
  const searchedAt = new Date().toISOString();
  const queries = options.searchQueries.map(q => q.trim()).filter(Boolean).slice(0, 4);
  if (!queries.length) throw new Error("search: no keyword queries for Parallel Search");

  const started = performance.now();
  const searchFor = (domains: readonly string[] | undefined, maxResults: number) => send("search", {
    objective: query, search_queries: queries, mode: options.mode ?? "advanced",
    advanced_settings: {
      max_results: maxResults,
      excerpt_settings: { max_chars_per_result: 2500 },
      ...(domains?.length || options.afterDate ? { source_policy: {
        ...(domains?.length ? { include_domains: domains } : {}),
        ...(options.afterDate ? { after_date: options.afterDate } : {}),
      } } : {}),
    },
  }).then(r => SearchResponse.parse(r).results);
  const prefer = options.includeDomains?.length ? [] : options.preferDomains ?? [];
  // A preferred-only search that fails or finds nothing must not sink the open one.
  const [preferred, open] = await Promise.all([
    prefer.length ? searchFor(prefer, 5).catch(() => []) : Promise.resolve([]),
    searchFor(options.includeDomains, options.maxResults ?? 8),
  ]);
  const isPreferred = (url: string) => prefer.some(d => { const host = new URL(url).hostname; return host === d || host.endsWith(`.${d}`); });
  const seen = new Set<string>();
  const pages = [...preferred, ...open.filter(p => isPreferred(p.url)), ...open.filter(p => !isPreferred(p.url))]
    .filter(p => publicSourceURL(p.url) && !seen.has(p.url) && seen.add(p.url));
  const searches = (prefer.length ? 2 : 1);

  // Search excerpts are often just a page's header; read the top pages in full for the objective:
  // the leading preferred ones and the leading open ones, so a trusted page without the table
  // (rendered client-side, say) can't crowd out the page that has it.
  const perGroup = options.readTop ?? 3;
  const toRead = [...pages.filter(p => isPreferred(p.url)).slice(0, perGroup), ...pages.filter(p => !isPreferred(p.url)).slice(0, perGroup)];
  const readTop = toRead.length;
  let extracted = new Map<string, Page>();
  if (readTop > 0) {
    try {
      const read = ExtractResponse.parse(await send("extract", {
        urls: toRead.map(p => p.url), objective: query, search_queries: queries,
        // A live fetch can take 60–90 s; cap it (cached pages return in 1–3 s) and keep the excerpts otherwise.
        advanced_settings: { excerpt_settings: { max_chars_per_result: 6000 }, fetch_policy: { timeout_seconds: 12 } },
      }));
      extracted = new Map(read.results.map(r => [r.url, r]));
    } catch {
      // Extract is an upgrade over the search excerpts, not a requirement.
    }
  }
  const costUSD = searches * SEARCH_COST + readTop * EXTRACT_COST_PER_URL;
  options.usage?.({ model: "parallel/search", costUSD, ms: Math.round(performance.now() - started), requests: searches + (readTop ? 1 : 0) });

  const sources: WebSource[] = [];
  const sections: string[] = [];
  for (const page of pages) {
    const url = publicSourceURL(page.url)!;
    const full = extracted.get(page.url);
    const excerpts = (full?.excerpts.length ? full.excerpts : page.excerpts).join("\n\n").trim();
    if (!excerpts) continue;
    const title = (full?.title ?? page.title ?? new URL(url).hostname).slice(0, 300);
    const date = full?.publish_date ?? page.publish_date;
    sources.push({ url, title });
    sections.push(`### [${sources.length}] ${title}${isPreferred(url) ? " (preferred source)" : ""}\nURL: ${url}${date ? `\nPublished: ${date}` : ""}\n\n${excerpts}`);
  }
  // No pages, no web data.
  if (!sources.length) throw new Error("search: Parallel returned no readable pages; refusing to present invented data as web results");
  return {
    query, searchedAt, sources: sources.slice(0, 20), model: "parallel/search",
    findings: `Search results for: ${query}\nQueries: ${queries.join(" · ")}\nRetrieved ${searchedAt}. Each section is one page; cite its URL exactly.${prefer.length ? " Pages marked (preferred source) are the trusted ones: when pages disagree, use theirs." : ""}\n\n${sections.join("\n\n---\n\n")}`,
    usage: { promptTokens: 0, completionTokens: 0, costUSD },
  };
}
