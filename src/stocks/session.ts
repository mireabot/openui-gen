/** US equity trading sessions, in New York time. Massive's intraday aggregates run 4:00–20:00 ET. */
export type TradingSession = "pre" | "regular" | "after";

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" });

/**
 * The session a bar starting at `t` (epoch ms) belongs to: before 9:30 ET is pre-market, from
 * 16:00 is after hours. A bar's timestamp is its start, so the 9:30 bar is the first regular one.
 * Daily bars have no session of their own; callers tag them "regular".
 */
export function sessionOf(t: number): TradingSession {
  const parts = clock.formatToParts(new Date(t));
  const minutes = Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  return minutes < OPEN ? "pre" : minutes < CLOSE ? "regular" : "after";
}
