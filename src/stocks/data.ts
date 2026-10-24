import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, requireKey } from "../config.js";
import { dataShape, validateValues, type DataField, type MockDataset, type MockValue } from "../research/dataset-schema.js";
import { log } from "../log.js";
import { PROJECT_ROOT } from "../paths.js";
import type { WebResearch } from "../research/web-research.js";
import { fieldsOf } from "./schema.js";
import { sessionOf } from "./session.js";
import { benchmarkRecord, relativeMove } from "./benchmark.js";
import { rangeCloses, rangeLabel, rangeWindow, sharedCloses, withRange, type ChartRange } from "./range.js";
import { EARNINGS_JSON_SCHEMA, EARNINGS_SYSTEM, EarningsSchema, earningsQuery, earningsRecord } from "./earnings.js";
import { uniformVoters } from "./records/consensus.js";
import { CONSENSUS_JSON_SCHEMA, CONSENSUS_SYSTEM, ConsensusFactsSchema, consensusQuery, consensusRecords } from "./consensus.js";
import { lookupETFExposure, type ETFExposureCheck } from "./etf-exposure.js";
import { fmpFundHolders, fmpOrSearch } from "./fmp.js";
import { lookupFundHolders } from "./fund-holders.js";
import { lookupPeers } from "./peers.js";
import { plannedFor, withFocus, type ResearchQuery } from "./research.js";
import { lookupFindings, type OpenAsk } from "./findings.js";
export interface StocksCoverage {
  readonly topic: string;
  readonly status: "available" | "unavailable" | "not_found";
  readonly blocks: readonly string[];
  readonly paths: readonly string[];
}
import { acceptWebStats, DEFAULT_STATS, MAX_STATS, mergeStats, resolveMassive, WEB_STATS_JSON_SCHEMA, WEB_STATS_SYSTEM, WebStatsSchema, webStatsQuery } from "./metrics.js";

/**
 * The stocks pack's data: real prices from Massive, shaped as one typed dataset the writer
 * binds to by @path. The server computes every figure (price, change, percent, the week's
 * points), so the model never types a number.
 *
 *   @subject   the asked ticker
 *   @peers[]   its related companies (Massive's news and returns analysis), up to 6
 *
 * Calls (free plan: 5 a minute, so everything is cached on disk and queued under MASSIVE_RPM):
 *   /v2/aggs/grouped/locale/us/market/stocks/{date}  every US ticker's bar for one day; past days cached for good
 *   /v1/related-companies/{ticker}                    cached a day
 *   /v3/reference/tickers/{ticker}                    name, market cap, CIK; cached 30 days
 */

export interface Bar { readonly o: number; readonly h: number; readonly l: number; readonly c: number; readonly v: number }
export interface TickerInfo {
  readonly ticker: string; readonly name: string; readonly marketCap: number | null; readonly cik: string | null;
  /** Reference facts for KeyStats (all optional; Massive omits some per company). */
  readonly exchange?: string | null; readonly industry?: string | null; readonly employees?: number | null; readonly listed?: string | null; readonly shares?: number | null; readonly homepage?: string | null;
  /** Massive branding icon (needs the API key): the logo fallback behind GET /media/logos/:ticker. */
  readonly icon?: string | null;
  readonly type?: string | null;
}

/** Trading days in a stock's week: five points, plus the close before them as the change baseline. */
export const WEEK_DAYS = 5;
export const MAX_PEERS = 6;

const DAY = 86_400_000;

/** The transport, injectable for offline checks. */
export interface MassiveSource {
  providers?(): readonly MarketProvider[];
  fallbacks?(): readonly MarketFallback[];
  grouped(date: string): Promise<ReadonlyMap<string, Bar>>;
  related(ticker: string): Promise<readonly string[]>;
  info(ticker: string): Promise<TickerInfo | null>;
  /** 5-minute closes for one day, 4:00–20:00 ET (extended hours included); optional, the asked company only. */
  intraday?(ticker: string, date: string): Promise<readonly { t: number; c: number }[]>;
  daily?(ticker: string, from: string, to: string): Promise<readonly { t: number; c: number }[]>;
  /** Tickers the run will price, for a provider that fetches history per ticker (FMP). */
  track?(tickers: readonly string[]): void;
}

export type MarketProvider = "massive" | "fmp";
export interface MarketFallback {
  readonly operation: string;
  readonly reason: string;
  readonly provider: MarketProvider;
  readonly status: "succeeded" | "unavailable" | "failed";
  readonly error?: string;
}
export const marketLabel = (source: MassiveSource): string => (source.providers?.() ?? ["massive"]).map(p => p === "fmp" ? "FMP" : "Massive").join(" + ") || "Market APIs";
export const marketOrigin = (source: MassiveSource): "massive" | "fmp" | "mixed" => {
  const providers = source.providers?.() ?? ["massive"];
  return providers.length > 1 ? "mixed" : providers[0] ?? "massive";
};

export type DataProgress = (detail: string) => void;

// ------------------------------------------------------------------ HTTP: queue + disk cache

const stamps: number[] = [];
let queue: Promise<unknown> = Promise.resolve();

/** Waits for a slot in the last minute's MASSIVE_RPM budget. Calls are serialized. */
async function slot(): Promise<void> {
  const rpm = config().MASSIVE_RPM;
  for (;;) {
    const now = Date.now();
    while (stamps.length && now - stamps[0]! >= 60_000) stamps.shift();
    if (stamps.length < rpm) {
      stamps.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (now - stamps[0]!) + 50));
  }
}

const cacheDir = () => fileURLToPath(new URL(`${config().MASSIVE_CACHE_DIR.replace(/\/?$/, "/")}`, PROJECT_ROOT));
const cacheFile = (key: string) => path.join(cacheDir(), `${createHash("sha1").update(key).digest("hex").slice(0, 20)}.json`);

async function cached(key: string): Promise<{ at: number; body: unknown } | null> {
  try {
    return JSON.parse(await readFile(cacheFile(key), "utf8")) as { at: number; body: unknown };
  } catch {
    return null;
  }
}

/** GET a Massive path. `ttl` in ms (Infinity: never refetch); `store` false skips the cache write (today's partial data). */
export async function cachedMassiveRequest(route: string, ttl: number, onCall?: () => void, store: (body: unknown) => boolean = () => true,
  request?: (route: string) => Promise<unknown>): Promise<unknown> {
  const key = request ? `mcp:${route}` : route;
  const hit = await cached(key);
  if (hit && Date.now() - hit.at < ttl) return hit.body;
  const run = async (): Promise<unknown> => {
    for (let attempt = 1; ; attempt++) {
      await slot();
      onCall?.();
      if (request) return request(route);
      const res = await fetch(`${config().MASSIVE_BASE_URL}${route}`, { headers: { Authorization: `Bearer ${requireKey("MASSIVE_API_KEY")}` }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 429 && attempt < 3) {
        log.warn("massive rate limited", { route, attempt });
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Massive ${res.status} for ${route.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
      return res.json();
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  const body = await next;
  if (body !== null && store(body)) {
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(cacheFile(key), JSON.stringify({ at: Date.now(), route, body }));
  }
  return body;
}

const get = cachedMassiveRequest;


export type StockLogo = { body: Buffer; type: string };
type Image = StockLogo;

/** One image URL through the disk cache: hits for 30 days, misses remembered for a day. */
async function cachedImage(url: string, fetchIt: () => Promise<Image | null>): Promise<Image | null> {
  const file = path.join(cacheDir(), "images", createHash("sha1").update(url).digest("hex").slice(0, 20));
  try {
    const meta = JSON.parse(await readFile(`${file}.json`, "utf8")) as { at: number; type: string | null };
    if (meta.type === null && Date.now() - meta.at < DAY) return null;
    if (meta.type !== null && Date.now() - meta.at < 30 * DAY) return { body: await readFile(file), type: meta.type };
  } catch {
    // not cached yet
  }
  const image = await fetchIt();
  await mkdir(path.dirname(file), { recursive: true });
  if (image) await writeFile(file, image.body);
  await writeFile(`${file}.json`, JSON.stringify({ at: Date.now(), url, type: image?.type ?? null }));
  return image;
}

/**
 * A company logo by ticker. Financial Modeling Prep's public ticker logos first (250×250 PNG,
 * no key, no Massive budget — fine for the demo; check FMP's terms before shipping), then
 * Massive's branding icon (needs the key and one request from the per-minute budget).
 */
export async function companyLogo(ticker: string, massiveIcon: () => Promise<string | null> = async () => null): Promise<Image | null> {
  const symbol = encodeURIComponent(ticker);
  for (const url of [`https://images.financialmodelingprep.com/symbol/${symbol}.png`, `https://financialmodelingprep.com/image-stock/${symbol}.png`]) {
    try {
      const image = await cachedImage(url, async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok && res.status !== 404) throw new Error("Logo provider unavailable");
        return res.ok && res.headers.get("content-type")?.startsWith("image/") ? { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type")!.split(";")[0]! } : null;
      });
      if (image) return image;
    } catch { /* Try the next source; temporary outages are never cached as misses. */ }
  }
  try {
    const icon = await massiveIcon();
    return icon ? await massiveImage(icon) : null;
  } catch { return null; } // Logos are optional; avatars retain their monogram.
}

/** Only Massive's own branding images are fetched with the key (never an arbitrary URL). */
const BRANDING = /^https:\/\/api\.massive\.com\/v1\/reference\/company-branding\/[A-Za-z0-9_=-]+\/images\/[A-Za-z0-9_.-]+\.(png|jpe?g|svg)$/;

/** A Massive branding image, fetched under the same request budget as the data. */
export async function massiveImage(url: string): Promise<Image | null> {
  if (!BRANDING.test(url)) return null;
  return cachedImage(url, async () => {
    const run = async () => {
      await slot();
      const res = await fetch(url, { headers: { Authorization: `Bearer ${requireKey("MASSIVE_API_KEY")}` } });
      if (!res.ok) return null;
      return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type")?.split(";")[0] ?? "image/png" };
    };
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  });
}

export function massiveSource(onCall?: () => void): MassiveSource {
  return {
    async grouped(date) {
      const today = isoDay(new Date());
      const body = await get(`/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true`, date < today ? Infinity : 15 * 60_000, onCall,
        // An empty past day is a holiday and stays empty; today's bars may not be published yet.
        () => date < today) as { results?: { T: string; o: number; h: number; l: number; c: number; v: number }[] } | null;
      return new Map((body?.results ?? []).map((r) => [r.T, { o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }]));
    },
    async related(ticker) {
      const body = await get(`/v1/related-companies/${encodeURIComponent(ticker)}`, DAY, onCall) as { results?: { ticker: string }[] } | null;
      return (body?.results ?? []).map((r) => r.ticker);
    },
    async info(ticker) {
      const body = await get(`/v3/reference/tickers/${encodeURIComponent(ticker)}`, 30 * DAY, onCall) as { results?: {
        ticker: string; name: string; type?: string; market_cap?: number; cik?: string; primary_exchange?: string; sic_description?: string; total_employees?: number; list_date?: string;
        share_class_shares_outstanding?: number; weighted_shares_outstanding?: number; homepage_url?: string; branding?: { icon_url?: string; logo_url?: string };
      } } | null;
      const r = body?.results;
      return r ? {
        // Massive appends the share class wording ("… Class A Common Stock"); the card wants the company.
        ticker: r.ticker, name: r.name.replace(/\s+Common Stock$/i, ""), marketCap: r.market_cap ?? null, cik: r.cik ?? null, exchange: r.primary_exchange ?? null, industry: r.sic_description ?? null,
        employees: r.total_employees ?? null, listed: r.list_date ?? null, shares: r.weighted_shares_outstanding ?? r.share_class_shares_outstanding ?? null, homepage: r.homepage_url ?? null,
        icon: r.branding?.icon_url ?? null, type: r.type ?? null,
      } : null;
    },
    async daily(ticker, from, to) {
      const body = await get(`/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000`, DAY, onCall) as { results?: { t: number; c: number }[] } | null;
      return (body?.results ?? []).map(r => ({ t: r.t, c: r.c }));
    },
    async intraday(ticker, date) {
      const today = isoDay(new Date());
      const body = await get(`/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/5/minute/${date}/${date}?adjusted=true&sort=asc&limit=50000`, date < today ? Infinity : 15 * 60_000, onCall,
        () => date < today) as { results?: { t: number; c: number }[] } | null;
      return (body?.results ?? []).map((r) => ({ t: r.t, c: r.c }));
    },
  };
}

// ------------------------------------------------------------------ dataset

const isoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

/** Weekdays from `from` backward (ET), newest first. Holidays come back empty and are skipped by the caller. */
export function weekdaysBack(from: Date, count: number): string[] {
  const out: string[] = [];
  for (let t = new Date(`${isoDay(from)}T12:00:00Z`).getTime(); out.length < count; t -= DAY) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

type Session = { date: string; bars: ReadonlyMap<string, Bar> };
/**
 * The last WEEK_DAYS + 1 sessions that price every one of `tickers`, oldest first. A partial
 * session (today on a free plan prices only a few tickers) then counts for those it has, and each
 * other company ends on its own latest priced session instead of being dropped.
 */
export const sessionsFor = (days: readonly Session[], ...tickers: string[]): Session[] =>
  days.filter(day => tickers.every(ticker => day.bars.has(ticker))).slice(-(WEEK_DAYS + 1));

/**
 * Recent sessions with bars, oldest first: enough complete ones for a week, plus any newer partial
 * session (a provider that priced only some tickers, as FMP's free plan does for today).
 */
export async function recentDays(source: MassiveSource, now: Date, progress?: DataProgress): Promise<{ date: string; bars: ReadonlyMap<string, Bar> }[]> {
  const days: { date: string; bars: ReadonlyMap<string, Bar> }[] = [];
  let lastError: unknown;
  for (const date of weekdaysBack(now, 14)) {
    progress?.(`Prices for ${date}`);
    let bars: ReadonlyMap<string, Bar>;
    try {
      bars = await source.grouped(date);
    } catch (error) {
      // One unpriced day (today on an end-of-day plan, a provider refusing a ticker) is not the
      // dataset: the week ends at the latest priced session instead, and the run goes on.
      lastError = error;
      progress?.(`Prices for ${date} unavailable; using earlier sessions`);
      continue;
    }
    if (bars.size) days.unshift({ date, bars });
    // Market-wide sessions differ by a few listings day to day; a partial one prices only a handful.
    const widest = Math.max(...days.map(day => day.bars.size));
    if (days.filter(day => day.bars.size * 2 > widest).length >= WEEK_DAYS + 1) return days;
  }
  if (days.length >= WEEK_DAYS + 1) return days;
  throw new Error(`Market APIs returned fewer than ${WEEK_DAYS + 1} trading days in the last two weeks${lastError instanceof Error ? ` (${lastError.message.slice(0, 200)})` : ""}`);
}

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One company's record. `chart` + `reference` are generic so every block can draw any record:
 * with intraday bars it is the last day's 5-minute line against the previous close (change is
 * the day's); otherwise the week's closes against the close before them (change is the week's).
 */
export function stockRecord(info: TickerInfo, sessions: readonly Session[], intraday: readonly { t: number; c: number }[] = []): Record<string, MockValue> | null {
  const days = sessionsFor(sessions, info.ticker);
  if (days.length < WEEK_DAYS + 1) return null;
  const bars = days.map((d) => d.bars.get(info.ticker));
  const [base, ...week] = bars as Bar[];
  const last = week[week.length - 1]!;
  const prev = week[week.length - 2] ?? base!;
  const day = intraday.length >= 2;
  const reference = day ? prev.c : base!.c;
  const change = last.c - reference;
  const lastDate = days[days.length - 1]!.date;
  return {
    ticker: info.ticker, name: info.name,
    // A server path the app resolves against the server it streamed from (FMP, then Massive; a 404 keeps the monogram).
    logo: `/media/logos/${encodeURIComponent(info.ticker)}`,
    price: round(last.c, 2), change: round(change, 2), changePct: round((100 * change) / reference, 2),
    marketCap: info.marketCap === null ? null : Math.round(info.marketCap),
    volume: Math.round(week.reduce((a, b) => a + b.v, 0)),
    open: round(last.o, 2), dayHigh: round(last.h, 2), dayLow: round(last.l, 2),
    weekHigh: round(Math.max(...week.map((b) => b.h)), 2), weekLow: round(Math.min(...week.map((b) => b.l)), 2),
    week: week.map((b, i) => ({ label: weekday(days[i + 1]!.date), value: round(b.c, 2) })),
    // Intraday points carry their session (Massive's bars run 4:00–20:00 ET), so PriceChart shades
    // pre-market and after hours; daily closes are all "regular".
    chart: day ? intraday.map((p) => ({ label: clock(p.t), value: round(p.c, 2), session: sessionOf(p.t) })) : week.map((b, i) => ({ label: weekday(days[i + 1]!.date), value: round(b.c, 2), session: "regular" })),
    reference: round(reference, 2),
    referenceLabel: day ? `Prev close ${usd(reference)}` : `${weekday(days[0]!.date)} close ${usd(reference)}`,
    chartCaption: day ? `${longDay(lastDate)} · ${clock(intraday[0]!.t)}–${clock(intraday[intraday.length - 1]!.t)} ET` : "Past 5 days",
  };
}

/** Two computed sentences for StockStory: every figure comes from the bars, the writer adds none. */
export function storyOf(record: Record<string, MockValue>): { headline: string; detail: string } | null {
  const chart = record.chart as { label: string; value: number }[];
  if (!chart || record.chartCaption === "Past 5 days") return null;
  const price = record.price as number;
  const ref = record.reference as number;
  const open = record.open as number;
  const hi = chart.reduce((a, p) => (p.value > a.value ? p : a));
  const lo = chart.reduce((a, p) => (p.value < a.value ? p : a));
  const headline = price < ref ? `Down to ${usd(price)} after a high of ${usd(hi.value)} at ${hi.label}.` : `Up to ${usd(price)} from a low of ${usd(lo.value)} at ${lo.label}.`;
  const how = open >= ref ? (price >= ref ? "and stayed above" : "then fell through and closed below") : (price >= ref ? "then climbed through and closed above" : "and stayed below");
  return { headline, detail: `It opened at ${usd(open)}, ${open >= ref ? "above" : "below"} the ${usd(ref)} previous close, ${how} it.` };
}

export interface StocksDataset extends MockDataset {
  readonly source: "massive" | "fmp" | "mixed";
  readonly market?: { readonly providers: readonly MarketProvider[]; readonly fallbacks: readonly MarketFallback[] };
  readonly asOf: string;
  readonly coverage?: readonly StocksCoverage[];
  readonly etfChecks?: readonly ETFExposureCheck[];
  readonly etfSearchStatus?: "available" | "not_found" | "unavailable";
}

/** Cited web research for what Massive doesn't carry (fundamentals, earnings); injectable for offline checks. */
export interface WebLookup {
  /** Cited research for a question. `searchQueries` (2–3 keyword queries) steers Parallel Search; without them Haiku writes them. */
  research(query: string, hints?: { readonly searchQueries?: readonly string[] }): Promise<WebResearch>;
  /** A strict-JSON extraction from research findings. */
  extract(system: string, schema: object, research: WebResearch): Promise<unknown>;
}

export interface DatasetExtras {
  /**
   * Everything but prices from cited web research: the subject is `identity` (from the intent),
   * peers come from a competitor lookup, holders skip FMP. Off: the market APIs answer (fixtures).
   */
  readonly webFirst?: boolean;
  readonly identity?: TickerInfo;
  /** Haiku's per-topic focus and keyword searches; each lookup keeps its own template. */
  readonly research?: readonly ResearchQuery[];
  /** A period the user named ("recent months" → 3M): the subject's chart and the benchmark cover it in daily closes. */
  readonly range?: ChartRange | null;
  /** Related companies only when the request needs peers; defaults on for gallery callers. */
  readonly peers?: boolean;
  /** A current-session chart is unnecessary for a holding-period estimator. */
  readonly intraday?: boolean;
  /** Metrics the user named (any wording, up to 16); empty → DEFAULT_STATS. */
  readonly stats?: readonly string[];
  /** Add the company's next (or latest) earnings report. */
  readonly earnings?: boolean;
  readonly earningsPeriod?: "latest" | "upcoming";
  readonly etfExposure?: boolean;
  readonly etfTickers?: readonly string[];
  /** Hedge funds and other 13F filers holding the company: FMP first, web research when FMP refuses. */
  readonly fundHolders?: boolean;
  /** Add analyst consensus for the company (and its peers, for ConsensusSet). */
  readonly consensus?: boolean;
  /** Compare the company with this benchmark (e.g. SPY) over the same sessions. */
  readonly benchmark?: string;
  readonly web?: WebLookup;
  /** Parts of the request no typed lookup answers: each is its own cited search (findings.ts). */
  readonly openAsks?: readonly OpenAsk[];
  /** The whole request, so every open search carries its context. */
  readonly prompt?: string;
}

/** The dataset for `ticker` and its competitors. Unknown ticker → an error the client shows. */
export async function stocksDataset(ticker: string, source: MassiveSource, now = new Date(), progress?: DataProgress, extras: DatasetExtras = {}): Promise<StocksDataset> {
  const symbol = ticker.trim().toUpperCase();
  let subject = extras.identity ?? null;
  if (!subject) {
    progress?.(`Looking up ${symbol}`);
    subject = await source.info(symbol);
  }
  if (!subject) throw new Error(`Market APIs have no ticker ${symbol}`);
  const info = subject;

  // Competitors: a cited lookup on the web path, the related-companies API otherwise. Started now,
  // so the research runs while the prices load; their prices wait for its tickers.
  const peersTask = (async (): Promise<TickerInfo[]> => {
    if (extras.peers === false) return [];
    progress?.(`Finding ${symbol}'s competitors`);
    if (extras.webFirst) {
      if (!extras.web) return [];
      try { return await lookupPeers(info, extras.web, plannedFor(extras.research, "peers"), MAX_PEERS); }
      catch (error) { progress?.(`Competitor research failed: ${(error as Error).message.slice(0, 200)}`); return []; }
    }
    let related: readonly string[] = [];
    try { related = (await source.related(symbol)).filter((t) => t !== symbol); }
    catch { progress?.(`${symbol}'s peers unavailable from market APIs; continuing with the stock`); }
    // Share classes (GOOG / GOOGL) are one company: keep the first by CIK.
    const found: TickerInfo[] = [];
    const ciks = new Set([info.cik ?? info.ticker]);
    for (const t of related) {
      if (found.length === MAX_PEERS) break;
      progress?.(`Reading ${t}`);
      let peer: TickerInfo | null;
      try { peer = await source.info(t); }
      catch { progress?.(`${t}'s company data unavailable; skipping this peer`); continue; }
      if (!peer || ciks.has(peer.cik ?? peer.ticker)) continue;
      ciks.add(peer.cik ?? peer.ticker);
      found.push(peer);
    }
    return found;
  })();

  // The benchmark needs only its ticker on the web path; the market path confirms it exists first.
  let benchmarkInfo: TickerInfo | null = null;
  if (extras.benchmark && extras.benchmark !== symbol) {
    if (extras.webFirst) benchmarkInfo = { ticker: extras.benchmark, name: extras.benchmark, marketCap: null, cik: null };
    else {
      progress?.(`Looking up benchmark ${extras.benchmark}`);
      try { benchmarkInfo = await source.info(extras.benchmark); }
      catch (error) { progress?.(`Benchmark ${extras.benchmark} unavailable: ${(error as Error).message.slice(0, 160)}`); }
    }
  }
  source.track?.([symbol, ...(benchmarkInfo ? [benchmarkInfo.ticker] : [])]);
  const earningsLookup = async () => {
    if (!extras.earnings || !extras.web) return null;
    const period = extras.earningsPeriod ?? "upcoming";
    progress?.(`Finding ${symbol}'s ${period} earnings report`);
    try {
      const planned = withFocus(earningsQuery(info, isoDay(now), period), period === "latest" ? [`${symbol} latest reported quarterly earnings results investor relations`, `${info.name} most recent earnings actual EPS revenue`] : [`${symbol} next earnings date`, `${info.name} earnings report date`, `${symbol} earnings call`], plannedFor(extras.research, "earnings"));
      const research = await extras.web.research(planned.objective, { searchQueries: planned.searchQueries });
      const facts = EarningsSchema.parse(await extras.web.extract(`${EARNINGS_SYSTEM}\nRequested period: ${period}. ${period === "latest" ? "status must be reported; select the most recent completed report, never an upcoming date." : "Select the next announced report when available."}`, EARNINGS_JSON_SCHEMA, research));
      if (period === "latest" && facts.status !== "reported") throw new Error("Latest-report research returned an upcoming report");
      const record = earningsRecord(facts, subject, research);
      if (!record) progress?.("Earnings unavailable: the extracted source URL was not among the research citations");
      return record;
    } catch (error) {
      log.warn("stocks earnings research failed", { ticker: symbol, message: (error as Error).message });
      progress?.(`Earnings lookup failed: ${(error as Error).message.slice(0, 240)}`);
      return null;
    }
  };
  const etfsLookup = async () => {
    if (!extras.etfExposure || !extras.web) return { funds: [], checks: [], status: "unavailable" as const };
    progress?.(`Finding ETFs that hold ${symbol}`);
    try { return await lookupETFExposure(info, extras.web, extras.etfTickers, 10, plannedFor(extras.research, "etfExposure")); }
    catch (error) { progress?.(`ETF holdings lookup failed: ${(error as Error).message.slice(0, 240)}`); return { funds: [], checks: [], status: "unavailable" as const }; }
  };
  const holdersLookup = async () => {
    if (!extras.fundHolders) return [];
    progress?.(`Finding funds that hold ${symbol}`);
    try {
      const search = () => extras.web ? lookupFundHolders(info, extras.web, 10, plannedFor(extras.research, "fundHolders")) : Promise.resolve(null);
      // The web path is research only; the market path asks FMP's 13F endpoint first.
      return (extras.webFirst ? await search() : await fmpOrSearch(`Fund holders of ${symbol}`, () => fmpFundHolders(symbol, now), search, progress)) ?? [];
    } catch (error) { progress?.(`Fund holders lookup failed: ${(error as Error).message.slice(0, 240)}`); return []; }
  };
  // Independent of prices and peers: these searches start now and run alongside the price fetch.
  const earningsTask = earningsLookup(), etfsTask = etfsLookup(), holdersTask = holdersLookup();
  const findingsTask = extras.openAsks?.length && extras.web ? lookupFindings(extras.openAsks, info, extras.web, isoDay(now), extras.prompt ?? "", progress) : Promise.resolve([]);
  const days = await recentDays(source, now, progress);
  const lastDay = days[days.length - 1]!.date;
  let intraday: readonly { t: number; c: number }[] = [];
  if (source.intraday && extras.intraday !== false) {
    progress?.(`${symbol} through ${lastDay}`);
    try {
      intraday = await source.intraday(symbol, lastDay);
    } catch (error) {
      log.warn("stocks intraday failed", { ticker: symbol, message: (error as Error).message });
    }
  }
  let subjectRecord = stockRecord(subject, days, intraday);
  const story = subjectRecord ? storyOf(subjectRecord) : null;
  if (subjectRecord && story) subjectRecord.story = story;
  if (!subjectRecord) throw new Error(`No prices for ${symbol} in the last week`);
  // A named period redraws the subject over daily closes; without one it keeps the day or the week.
  const window = extras.range ? rangeWindow(extras.range, lastDay) : null;
  let ranged: ReturnType<typeof rangeCloses> = null;
  if (extras.range && window && source.daily) {
    progress?.(`${symbol} daily closes · ${rangeLabel(extras.range)}`);
    try { ranged = rangeCloses(await source.daily(symbol, window.from, lastDay), window.start); }
    catch (error) { progress?.(`${symbol} daily history unavailable: ${(error as Error).message.slice(0, 160)}`); }
    if (ranged) subjectRecord = withRange(subjectRecord, extras.range, ranged);
    else progress?.(`${symbol}: not enough daily closes for ${rangeLabel(extras.range).toLowerCase()}; showing recent sessions`);
  }
  const peers = await peersTask;
  let peerRecords = peers.flatMap((p) => { const record = stockRecord(p, days); return record ? [record] : []; });
  // Peers over the same named period, so "peers over the past month" compares like with like.
  if (extras.range && window && ranged && source.daily && peerRecords.length) {
    progress?.(`Peers' daily closes · ${rangeLabel(extras.range)}`);
    peerRecords = await Promise.all(peerRecords.map(async (record) => {
      try {
        const closes = rangeCloses(await source.daily!(String(record.ticker), window.from, lastDay), window.start);
        return closes ? withRange(record, extras.range!, closes) : record;
      } catch { return record; } // Its five-day chart stays; the caption says which period it shows.
    }));
  }
  const values: Record<string, MockValue> = { subject: subjectRecord, peers: peerRecords };

  // KeyStats rows: Massive first, cited web research for the rest, "Not available" otherwise.
  const names = extras.stats === undefined ? DEFAULT_STATS : extras.stats.slice(0, MAX_STATS);
  const { stats: massive, missing } = resolveMassive(names, { info: subject, days: sessionsFor(days, symbol) }, marketLabel(source));
  // The two web lookups are independent: run them together (each is a cited search, ~15 s).
  const statsLookup = async () => {
    if (!missing.length || !extras.web) return new Map<number, ReturnType<typeof mergeStats>[number]>();
    progress?.(`Searching for ${missing.map((m) => m.name).join(", ")}`);
    try {
      const query = withFocus(webStatsQuery(info, missing.map((m) => m.name)), [`${symbol} ${missing.slice(0, 3).map((m) => m.name).join(" ")}`, `${info.name} key statistics`], plannedFor(extras.research, "stats"));
      const research = await extras.web.research(query.objective, { searchQueries: query.searchQueries });
      return acceptWebStats(WebStatsSchema.parse(await extras.web.extract(WEB_STATS_SYSTEM, WEB_STATS_JSON_SCHEMA, research)), research, missing);
    } catch (error) {
      log.warn("stocks web stats failed", { ticker: symbol, message: (error as Error).message });
      return new Map<number, ReturnType<typeof mergeStats>[number]>();
    }
  };
  const consensusLookup = async () => {
    if (!extras.consensus || !extras.web) return null;
    const records = values.peers as Record<string, MockValue>[];
    const tickers = [symbol, ...records.map((p) => p.ticker as string)].slice(0, 5);
    progress?.(`Analyst ratings for ${tickers.join(", ")}`);
    try {
      const query = withFocus(consensusQuery(tickers), [`${tickers.join(" ")} analyst consensus`, ...tickers.slice(0, 3).map((t) => `${t} analyst rating price target`)].slice(0, 4), plannedFor(extras.research, "consensus"));
      const research = await extras.web.research(query.objective, { searchQueries: query.searchQueries });
      const facts = ConsensusFactsSchema.parse(await extras.web.extract(CONSENSUS_SYSTEM, CONSENSUS_JSON_SCHEMA, research));
      const prices = new Map([[symbol, subjectRecord.price as number], ...records.map((p) => [p.ticker as string, p.price as number] as const)]);
      const byTicker = consensusRecords(facts, research, prices);
      return { subject: byTicker.get(symbol) ?? null, set: tickers.map((t) => byTicker.get(t)).filter((x): x is Record<string, MockValue> => !!x) };
    } catch (error) {
      log.warn("stocks consensus research failed", { ticker: symbol, message: (error as Error).message });
      return null;
    }
  };
  // Stats need the sessions (what the bars already answer) and consensus needs the peers: both start here.
  const [web, earnings, consensus, etfs, holders, findings] = await Promise.all([statsLookup(), earningsTask, consensusLookup(), etfsTask, holdersTask, findingsTask]);
  const found = findings.filter((finding): finding is Record<string, MockValue> => !!finding);
  if (found.length) values.findings = found;
  if (extras.fundHolders) values.fundHolders = holders;
  values.stats = mergeStats(names, massive, web).map((s) => ({ ...s }));

  if (benchmarkInfo && extras.range && ranged && source.daily) {
    // The named period: both tickers' daily closes over the sessions they share.
    progress?.(`${benchmarkInfo.ticker} daily closes · ${rangeLabel(extras.range)}`);
    let shared: ReturnType<typeof sharedCloses> = null;
    try { shared = sharedCloses(ranged, await source.daily(benchmarkInfo.ticker, window!.from, lastDay)); }
    catch (error) { progress?.(`${benchmarkInfo.ticker} daily history unavailable: ${(error as Error).message.slice(0, 160)}`); }
    const record = shared ? benchmarkRecord({ subject: { ticker: symbol, ...shared.subject }, benchmark: { ticker: benchmarkInfo.ticker, name: benchmarkInfo.name, ...shared.benchmark },
      caption: `${rangeLabel(extras.range)} · % change in daily closes · ${marketLabel(source)}` }) : null;
    if (record) values.benchmark = record;
    else progress?.(`Benchmark ${benchmarkInfo.ticker}: no shared daily closes over ${rangeLabel(extras.range).toLowerCase()}`);
  } else if (benchmarkInfo) {
    // The same sessions as the subject's week: grouped daily closes already include the benchmark.
    const shared = sessionsFor(days, symbol, benchmarkInfo.ticker);
    const closes = (ticker: string) => shared.map((d) => d.bars.get(ticker)!.c);
    const own = closes(symbol), bench = closes(benchmarkInfo.ticker);
    const record = shared.length === WEEK_DAYS + 1 ? benchmarkRecord({
      subject: { ticker: symbol, base: own[0]!, points: shared.slice(1).map((d, i) => ({ label: weekday(d.date), value: own[i + 1]! })) },
      benchmark: { ticker: benchmarkInfo.ticker, name: benchmarkInfo.name, base: bench[0]!, points: shared.slice(1).map((d, i) => ({ label: weekday(d.date), value: bench[i + 1]! })) },
      caption: `Past 5 days · % change since ${weekday(shared[0]!.date)}'s close · ${marketLabel(source)}`,
    }) : null;
    if (record) {
      values.benchmark = record;
    } else progress?.(`Benchmark ${benchmarkInfo.ticker}: closes not available for every session`);
  }
  if (extras.etfExposure) {
    values.etfExposure = etfs.funds;
    // "ETFs holding X and how they moved against SPY": each fund against the benchmark, from the
    // same daily closes, over the sessions both are priced on.
    if (benchmarkInfo && etfs.funds.length) {
      values.etfExposure = etfs.funds.map((fund) => ({ ...fund, ...relativeMove({
        benchmark: benchmarkInfo!.ticker, ticker: String(fund.ticker),
        sessions: days.map((d) => ({ label: weekday(d.date), fund: d.bars.get(String(fund.ticker))?.c, benchmark: d.bars.get(benchmarkInfo!.ticker)?.c })),
      }) }));
    }
  }
  if (earnings) {
    values.earnings = earnings;
  }
  if (consensus?.subject) {
    values.consensus = consensus.subject;
  }
  if (consensus && consensus.set.length) {
    // Set items carry the core fields only (the optional shift / momentum / target belong to @consensus).
    // Avatars on every item or on none, so a grid of tiles keeps one height.
    const core = uniformVoters(consensus.set.map(({ shift: _s, momentum: _m, target: _t, ...rest }) => rest));
    values.consensusSet = core;
  }
  const fields = fieldsOf(values);
  validateValues(dataShape(fields), values, "root", true, 400);
  return { source: marketOrigin(source), fields, values, asOf: days[days.length - 1]!.date,
    ...(extras.etfExposure ? { etfChecks: etfs.checks, etfSearchStatus: etfs.status } : {}) };
}
