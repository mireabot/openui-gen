import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { config, requireKey } from "../config.js";
import { PROJECT_ROOT } from "../paths.js";
import type { Bar, DataProgress, MassiveSource, TickerInfo } from "./data.js";

const DAY = 86_400_000;
const easternDay = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const symbol = z.string().regex(/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)*$/);
const number = z.number().finite();
const Price = z.object({ symbol: symbol.optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/), open: number.positive(), high: number.positive(),
  low: number.positive(), close: number.positive(), volume: number.nonnegative() });
const Profile = z.object({ symbol, companyName: z.string().min(1), currency: z.string(), marketCap: number.nullish(),
  cik: z.string().nullish(), exchange: z.string().nullish(), industry: z.string().nullish(),
  fullTimeEmployees: z.union([number, z.string()]).nullish(), ipoDate: z.string().nullish(), website: z.string().nullish(),
  isEtf: z.boolean().optional(), isFund: z.boolean().optional() });
const Peers = z.array(z.object({ symbol: z.string().min(1) }));

export class FMPError extends Error {
  constructor(readonly status: number | null, route: string) {
    // The query URL carries credentials. Never include it or the provider response body.
    super(`FMP ${status ?? "invalid response"} for ${route.split("?")[0]}`);
  }
}
export type FMPRequest = (route: string, ttl: number) => Promise<unknown>;
const pending = new Map<string, Promise<unknown>>();

/** Separate namespace from Massive; current-day data always expires and errors are never cached. */
export const fmpRequest: FMPRequest = async (route, ttl) => {
  const key = createHash("sha1").update(route).digest("hex");
  const file = path.join(fileURLToPath(new URL(`${config().MASSIVE_CACHE_DIR.replace(/\/?$/, "/")}`, PROJECT_ROOT)), "fmp", `${key}.json`);
  try {
    const cached = JSON.parse(await readFile(file, "utf8")) as { at: number; body: unknown };
    if (Date.now() - cached.at < ttl) return cached.body;
  } catch { /* A missing or damaged cache is a miss. */ }
  if (pending.has(route)) return pending.get(route)!;
  const request = (async () => {
    const url = new URL(`https://financialmodelingprep.com/stable${route}`);
    url.searchParams.set("apikey", requireKey("FMP_API_KEY"));
    let response: Response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(20_000) }); }
    catch { throw new FMPError(null, route); }
    if (!response.ok) throw new FMPError(response.status, route);
    let body: unknown;
    try { body = await response.json(); } catch { throw new FMPError(null, route); }
    // FMP can return an error object with HTTP 200. None of these endpoints returns an object.
    const schema = route.startsWith("/profile?") ? z.array(Profile) : route.startsWith("/stock-peers?") ? Peers : z.array(Price);
    if (!schema.safeParse(body).success) throw new FMPError(null, route);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), body }));
    return body;
  })();
  pending.set(route, request);
  try { return await request; } finally { pending.delete(route); }
};

/** FMP timestamps have no zone; interpret them as exchange-local ET, including DST. */
export function fmpTimestamp(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(date)) throw new FMPError(null, "date");
  const wall = Date.parse(`${date.replace(" ", "T")}${date.length === 10 ? "T16:00:00" : ""}Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== date.slice(0, 10)) throw new FMPError(null, "date");
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" });
  const offset = zone.formatToParts(new Date(wall)).find(p => p.type === "timeZoneName")!.value;
  return Date.parse(`${date.replace(" ", "T")}${date.length === 10 ? "T16:00:00" : ""}${offset.replace("GMT", "")}`);
}

export function fmpSource(tickers: () => readonly string[], now = new Date(), request: FMPRequest = fmpRequest, progress?: DataProgress): MassiveSource {
  // One history request per selected ticker supplies all six grouped days. This avoids a
  // bulk-plan requirement and never replaces an unavailable day with a live quote.
  const to = easternDay(now);
  const from = easternDay(new Date(now.getTime() - 35 * DAY));
  const history = new Map<string, Promise<z.infer<typeof Price>[]>>();
  const prices = async (ticker: string, start: string, end: string) => {
    const route = `/historical-price-eod/full?symbol=${encodeURIComponent(ticker)}&from=${start}&to=${end}`;
    const rows = z.array(Price).parse(await request(route, end < to ? DAY : 5 * 60_000));
    if (rows.some(row => row.symbol && row.symbol !== ticker)) throw new FMPError(null, "/historical-price-eod/full");
    return rows.filter(row => row.date >= start && row.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  };
  return {
    async info(ticker): Promise<TickerInfo | null> {
      const rows = z.array(Profile).parse(await request(`/profile?symbol=${encodeURIComponent(ticker)}`, DAY));
      const row = rows.find(row => row.symbol === ticker);
      // The stocks pack formats USD. Foreign peers must not silently acquire dollar prices.
      if (!row || row.currency !== "USD") return null;
      const employees = row.fullTimeEmployees == null ? null : Number(row.fullTimeEmployees);
      return { ticker, name: row.companyName, marketCap: row.marketCap ?? null, cik: row.cik?.replace(/^0+/, "") || null,
        exchange: row.exchange ?? null, industry: row.industry ?? null, employees: employees !== null && Number.isFinite(employees) ? employees : null,
        listed: row.ipoDate ?? null, homepage: row.website ?? null, type: row.isEtf ? "ETF" : row.isFund ? "FUND" : "CS" };
    },
    async related(ticker) {
      const rows = Peers.parse(await request(`/stock-peers?symbol=${encodeURIComponent(ticker)}`, DAY));
      return [...new Set(rows.map(row => row.symbol).filter(peer => peer !== ticker && symbol.safeParse(peer).success))];
    },
    async grouped(date) {
      const bars = new Map<string, Bar>();
      const selected = tickers();
      for (const ticker of selected) {
        if (!history.has(ticker)) history.set(ticker, prices(ticker, from, to));
        let rows: z.infer<typeof Price>[];
        try { rows = await history.get(ticker)!; }
        catch (error) {
          if (ticker === selected[0]) throw error; // The requested stock needs real prices.
          progress?.(`FMP history unavailable for peer ${ticker}; omitting its prices`);
          continue;
        }
        const row = rows.find(row => row.date === date);
        if (row) bars.set(ticker, { o: row.open, h: row.high, l: row.low, c: row.close, v: row.volume });
      }
      return bars;
    },
    async daily(ticker, from, to) {
      return (await prices(ticker, from, to)).map(row => ({ t: fmpTimestamp(row.date), c: row.close }));
    },
    async intraday(ticker, date) {
      const rows = z.array(Price).parse(await request(`/historical-chart/5min?symbol=${encodeURIComponent(ticker)}&from=${date}&to=${date}`, 5 * 60_000));
      return rows.filter(row => row.date.slice(0, 10) === date).map(row => ({ t: fmpTimestamp(row.date), c: row.close })).sort((a, b) => a.t - b.t);
    },
  };
}

/**
 * The rule for data FMP may not serve on this plan: ask FMP first, and when it refuses (402, an
 * unexpected response) or has nothing, answer the same request with cited web research instead.
 * The fallback is named in the run's progress so the monitor shows which path answered.
 */
export async function fmpOrSearch<T>(label: string, fmp: () => Promise<T | null>, search: () => Promise<T | null>, progress?: DataProgress): Promise<T | null> {
  let reason: string;
  try {
    const value = await fmp();
    if (value !== null && (!Array.isArray(value) || value.length)) return value;
    reason = "FMP returned no data";
  } catch (error) {
    reason = error instanceof FMPError ? error.message.replace(/ for .*/, "") : error instanceof z.ZodError ? "FMP response not recognized" : "FMP request unavailable";
  }
  progress?.(`${label}: ${reason}; searching the web`);
  return search();
}

/**
 * 13F holders of `ticker` for the last quarter whose filings are due (45 days after quarter end).
 * Field names follow FMP's extract-analytics endpoint; a response that does not match is treated
 * as FMP not serving it, so the web search answers instead.
 */
const HolderRow = z.object({ investorName: z.string().min(1), weight: number.nullish(), marketValue: number.nullish(), date: z.string().nullish() });
export async function fmpFundHolders(ticker: string, now = new Date(), request: FMPRequest = fmpRequest): Promise<Record<string, string>[]> {
  const filed = new Date(now.getTime() - 45 * DAY);
  const quarter = Math.floor(filed.getUTCMonth() / 3);
  const [year, q] = quarter === 0 ? [filed.getUTCFullYear() - 1, 4] : [filed.getUTCFullYear(), quarter];
  const rows = z.array(HolderRow).parse(await request(`/institutional-ownership/extract-analytics/holder?symbol=${encodeURIComponent(ticker)}&year=${year}&quarter=${q}&page=0&limit=10`, DAY));
  const compactUsd = (value: number) => `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
  return rows.slice(0, 10).map(row => ({
    name: row.investorName,
    weight: row.weight == null ? "Portfolio share not published" : `${row.weight.toFixed(2)}% of portfolio`,
    asOf: row.date ?? `Q${q} ${year}`, source: "Source: SEC 13F via FMP", sourceUrl: "https://financialmodelingprep.com",
    detail: [row.marketValue == null ? "" : compactUsd(row.marketValue), `Q${q} ${year} 13F`, "FMP"].filter(Boolean).join(" · "),
  }));
}
