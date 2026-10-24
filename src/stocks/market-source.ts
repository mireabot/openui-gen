import { config } from "../config.js";
import { massiveSource, type MassiveSource, type DataProgress, type MarketFallback, type MarketProvider } from "./data.js";
import { fmpRequest, fmpSource } from "./fmp.js";

function failure(error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status :
    error instanceof Error ? /\b(?:Massive|FMP) (\d{3})\b/.exec(error.message)?.[1] : null;
  return status ? `HTTP ${status}` : "request unavailable";
}
const LABEL: Record<MarketProvider, string> = { massive: "Massive", fmp: "FMP" };
const easternDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
type Family = "info" | "related" | "grouped" | "daily" | "intraday";

/**
 * Which provider each operation asks first. FMP's profile covers every ticker with no per-minute
 * cap, so company lookups start there. Peers start on Massive: one call, and its related companies
 * are US listings with prices, where FMP's are often foreign OTC tickers neither plan prices. Market-
 * wide sessions start on Massive, whose free plan covers every ticker's past sessions but none of
 * today's, so today never asks Massive unless the plan allows it. One ticker's daily history starts
 * on FMP (large caps, no cap), and its 402 for an unlisted symbol leaves FMP on for the next ticker.
 */
export interface MarketPlan {
  /** The Massive plan serves the current session (paid plans). Free: false. */
  readonly massiveCurrentDay: boolean;
  /** The FMP plan serves 5-minute bars. Free: false. */
  readonly fmpIntraday: boolean;
}
export const marketPlan = (): MarketPlan => ({ massiveCurrentDay: config().MASSIVE_CURRENT_DAY, fmpIntraday: config().FMP_INTRADAY });

/** Per-run routing: retry only the failed operation, never the whole dataset or generation. */
export function marketSource(options: { primary?: MassiveSource; fallback?: MassiveSource; now?: Date; progress?: DataProgress; plan?: MarketPlan } = {}): MassiveSource {
  const tickers = new Set<string>();
  const sources: Record<MarketProvider, MassiveSource> = {
    massive: options.primary ?? massiveSource(),
    fmp: options.fallback ?? fmpSource(() => [...tickers], options.now, fmpRequest, options.progress),
  };
  const plan = options.plan ?? marketPlan();
  const today = easternDay(options.now ?? new Date());
  const used = new Set<MarketProvider>();
  const fallbacks: MarketFallback[] = [];
  // A provider that rejected an endpoint (plan, auth, rate, outage) skips it for the rest of the run.
  const rejected = new Set<string>();
  const memo = new Map<string, Promise<unknown>>();

  const execute = <T>(operation: string, family: Family, order: readonly MarketProvider[], call: (source: MassiveSource) => Promise<T> | undefined, empty: (value: T) => boolean, perTicker: readonly MarketProvider[] = []): Promise<T> => {
    const attempt = async () => {
      const reasons: string[] = [];
      let last: T | undefined;
      for (const [index, provider] of order.entries()) {
        const label = LABEL[provider];
        if (index > 0) options.progress?.(`${operation}: ${reasons.at(-1)}; trying ${label}`);
        if (rejected.has(`${provider}:${family}`)) { reasons.push(`${label} endpoint rejected earlier in this run`); continue; }
        try {
          const pending = call(sources[provider]);
          if (!pending) { reasons.push(`${label} does not offer this`); continue; }
          const value = await pending;
          last = value;
          if (!empty(value)) {
            used.add(provider);
            if (index > 0) { fallbacks.push({ operation, reason: reasons.join("; "), provider, status: "succeeded" }); options.progress?.(`${operation}: ${label} succeeded`); }
            return value;
          }
          reasons.push(`${label} returned no record`);
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") throw error;
          const status = failure(error);
          // Massive's end-of-day restriction applies to one date, not its historical endpoint.
          const currentDayOnly = status === "HTTP 403" && error instanceof Error && /today.?s data|before end of day/i.test(error.message);
          reasons.push(`${label} ${status}${currentDayOnly ? " (current-day data is not available on this plan)" : ""}`);
          // A per-ticker entitlement (FMP's 402 for a symbol outside the plan) says nothing about the next ticker.
          const tickerOnly = perTicker.includes(provider) && status === "HTTP 402";
          if (!currentDayOnly && !tickerOnly && /HTTP (401|402|403|429|5\d\d)/.test(status)) rejected.add(`${provider}:${family}`);
          if (index === order.length - 1) {
            if (order.length > 1) { fallbacks.push({ operation, reason: reasons.slice(0, -1).join("; "), provider, status: "failed", error: reasons.at(-1)! }); options.progress?.(`${operation}: ${reasons.at(-1)}`); }
            throw new Error(`Market data unavailable for ${operation}: ${reasons.join("; ")}`, { cause: error });
          }
        }
      }
      if (order.length > 1) {
        fallbacks.push({ operation, reason: reasons.slice(0, -1).join("; "), provider: order.at(-1)!, status: "unavailable" });
        options.progress?.(`${operation}: ${LABEL[order.at(-1)!]} returned no data`);
      }
      if (last === undefined) throw new Error(`Market data unavailable for ${operation}: ${reasons.join("; ")}`);
      return last;
    };
    if (!memo.has(operation)) memo.set(operation, attempt());
    return memo.get(operation)! as Promise<T>;
  };
  const history = (date: string): MarketProvider[] => date >= today && !plan.massiveCurrentDay ? ["fmp"] : ["massive", "fmp"];
  return {
    track: list => list.forEach(ticker => tickers.add(ticker)),
    providers: () => [...used],
    fallbacks: () => [...fallbacks],
    async info(ticker) {
      const value = await execute(`Company ${ticker}`, "info", ["fmp", "massive"], source => source.info(ticker), value => value === null);
      if (value) tickers.add(ticker);
      return value ? { ...value, cik: value.cik?.replace(/^0+/, "") || null } : null;
    },
    related: ticker => execute(`Peers ${ticker}`, "related", ["massive", "fmp"], source => source.related(ticker), value => !value.length),
    // A session can legitimately be empty (a holiday): an empty map is an answer, not a miss.
    grouped: date => execute(`Prices ${date}`, "grouped", history(date), source => source.grouped(date), () => false),
    daily: (ticker, from, to) => execute(`Daily ${ticker} ${from}–${to}`, "daily", ["fmp", "massive"], source => source.daily?.(ticker, from, to), value => !value.length, ["fmp"]),
    async intraday(ticker, date) {
      const order: MarketProvider[] = [...(date < today || plan.massiveCurrentDay ? ["massive" as const] : []), ...(plan.fmpIntraday ? ["fmp" as const] : [])];
      // Neither plan serves today's 5-minute bars: no request, the chart falls back to daily closes.
      if (!order.length) return [];
      return execute(`Intraday ${ticker} ${date}`, "intraday", order, source => source.intraday?.(ticker, date), value => !value.length);
    },
  };
}
