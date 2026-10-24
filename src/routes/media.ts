import { Hono } from "hono";
import { cors } from "hono/cors";
import { allowedOrigin } from "../config.js";
import { log } from "../log.js";
import { companyLogo, type StockLogo } from "../stocks/data.js";

/**
 * GET /media/logos/:ticker — a company logo for generated UI (Avatar's image).
 *
 * Datasets carry `/media/logos/<TICKER>` and the app resolves it against the server it streamed
 * from. Source: Financial Modeling Prep's public ticker logos only; Massive's branding icon would
 * spend its 5-a-minute budget on images. Cached on disk; the response is cacheable for a week.
 * 404 when FMP has no logo — the app keeps its monogram.
 */

/** An upper-case ticker such as BRK.B, or null when the input is not one. */
export function normalizeTicker(input: string): string | null {
  const ticker = input.trim().replace(/^\$/, "").toUpperCase();
  return /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)*$/.test(ticker) && ticker.length <= 15 ? ticker : null;
}

export type LogoLookup = (ticker: string) => Promise<StockLogo | null>;
const lookupLogo: LogoLookup = ticker => companyLogo(ticker);
const pending = new Map<string, Promise<StockLogo | null>>();
const sharedLogo: LogoLookup = async ticker => {
  if (!pending.has(ticker)) pending.set(ticker, lookupLogo(ticker));
  try { return await pending.get(ticker)!; } finally { pending.delete(ticker); }
};

/** One cached server asset path for every stock component, plus explicit asset discovery. */
export function createMediaRoutes(load: LogoLookup = sharedLogo) {
  const routes = new Hono();
  routes.use("/media/*", cors({ origin: allowedOrigin }));
  routes.use("/stocks/*", cors({ origin: allowedOrigin }));
  routes.get("/stocks/:ticker/assets", async c => {
    const ticker = normalizeTicker(c.req.param("ticker"));
    if (!ticker) return c.json({ error: "bad_ticker" }, 400);
    try {
      const logo = await load(ticker);
      c.header("Cache-Control", logo ? "public, max-age=3600" : "no-store");
      return c.json({ ticker, logo: { status: logo ? "available" : "unavailable", url: logo ? `/media/logos/${encodeURIComponent(ticker)}` : null,
        contentType: logo?.type ?? null } });
    } catch {
      return c.json({ error: "assets_unavailable" }, 502);
    }
  });
  routes.get("/media/logos/:ticker", async c => {
    const ticker = normalizeTicker(c.req.param("ticker"));
    if (!ticker) return c.json({ error: "bad_ticker" }, 400);
    try {
      const image = await load(ticker);
      if (!image) { c.header("Cache-Control", "no-store"); return c.json({ error: "no_logo" }, 404); }
      return c.body(new Uint8Array(image.body), 200, { "Content-Type": image.type, "Cache-Control": "public, max-age=604800",
        "X-Content-Type-Options": "nosniff" });
    } catch (error) {
      log.warn("logo failed", { ticker, error: error instanceof Error ? error.name : "unknown" });
      c.header("Cache-Control", "no-store");
      return c.json({ error: "logo_failed" }, 502);
    }
  });
  return routes;
}
export const mediaRoutes = createMediaRoutes();
