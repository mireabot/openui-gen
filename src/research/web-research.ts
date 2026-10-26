import type { CompletionUsage } from "../llm/structured-completion.js";

export interface WebSource { readonly title: string; readonly url: string }
export interface WebResearch {
  readonly query: string;
  readonly findings: string;
  readonly sources: readonly WebSource[];
  readonly searchedAt: string;
  readonly model: string;
  readonly usage: CompletionUsage;
}

export function publicSourceURL(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
    if (url.hostname === "localhost" || url.hostname.endsWith(".local") || !url.hostname.includes(".")) return;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) return;
    return url.href;
  } catch { return; }
}

/** A cited page's identity: host without www, path without a trailing slash, no fragment or tracking params. */
export function citationKey(value: string): string | undefined {
  const href = publicSourceURL(value);
  if (!href) return;
  const url = new URL(href);
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$|ref_src$)/i.test(key)) url.searchParams.delete(key);
  const query = url.searchParams.toString();
  return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${query ? `?${query}` : ""}`;
}
