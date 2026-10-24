import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stocksDataset, type Bar, type MassiveSource, type TickerInfo } from "../src/stocks/data.js";

/** A dataset fetch calls only what it was asked for: no peers, intraday bars or default statistics. */
const plan = { peers: false, intraday: false, stats: [] as string[] };
const fx = JSON.parse(readFileSync("eval/fixtures/stocks-nvda.json", "utf8")) as { _meta: { now: string }; info: Record<string, TickerInfo>; grouped: Record<string, Record<string, Bar>> };
const calls: string[] = [];
const source: MassiveSource = {
  info: async ticker => { calls.push(`info:${ticker}`); assert.equal(ticker, "NVDA"); return fx.info[ticker] ?? null; },
  grouped: async day => new Map(Object.entries(fx.grouped[day] ?? {})),
  related: async () => { calls.push("related"); throw new Error("Unrequested peers lookup"); },
  intraday: async () => { calls.push("intraday"); throw new Error("Unrequested intraday lookup"); },
};
const web = { research: async () => { calls.push("research"); throw new Error("Unrequested statistics lookup"); }, extract: async () => null };
const data = await stocksDataset("NVDA", source, new Date(fx._meta.now), undefined, { ...plan, web });
assert.deepEqual(data.values.peers, []);
assert.deepEqual(data.values.stats, []);
assert.deepEqual(calls, ["info:NVDA"]);
console.log("stocks fetch scope: no peer, intraday or default-stat lookups passed");
