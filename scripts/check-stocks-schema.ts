import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { DataFieldSchema, dataShape, validateValues, type DataField, type MockValue } from "../src/research/dataset-schema.js";
import { basketRecord } from "../src/stocks/records/basket.js";
import { expectationRecord } from "../src/stocks/records/investment-expectation.js";
import { stocksDataset, type MassiveSource } from "../src/stocks/data.js";
import { Basket, Consensus, EtfExposure, Expectation, StocksData, fieldsOf } from "../src/stocks/schema.js";

const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const recorded = z.object({ values: z.record(z.string(), z.json()), fields: z.array(DataFieldSchema) }).parse(read("eval/fixtures/stocks-dataset.json"));
const canonical = (fields: readonly DataField[]) => [...fields].sort((a, b) => a.path.localeCompare(b.path));
assert.deepEqual(canonical(fieldsOf(recorded.values)), canonical(recorded.fields), "recorded dataset field parity");
assert.ok(StocksData.safeParse(recorded.values).success, "recorded dataset matches StocksData");

const etf = { ticker: "SMH", name: "VanEck Semiconductor ETF", weight: "20%", asOf: "2026-10-09", source: "Issuer", sourceUrl: "https://issuer.example/holdings", detail: "Holds NVDA", move: "+2%", vsBenchmark: "+1 pts ahead of SPY", window: "Past week", vsTone: "good" };
const samples: Record<string, Record<string, MockValue>> = {
  stock: { subject: recorded.values.subject!, peers: recorded.values.peers!, stats: recorded.values.stats! },
  etfExposure: { etfExposure: [etf] },
};
for (const root of ["earnings", "benchmark", "consensus", "consensusSet", "basket", "baskets", "expectation"]) {
  assert.ok(recorded.values[root], `recorded ${root} exists`);
  samples[root] = { [root]: recorded.values[root] };
}
const baseline = z.object({ cases: z.record(z.string(), z.object({ count: z.number(), sha256: z.string() })) }).parse(read("eval/fixtures/stocks-fields.json"));
assert.deepEqual(Object.keys(samples).sort(), Object.keys(baseline.cases).sort(), "every captured legacy contract has a sample");
for (const [name, values] of Object.entries(samples)) {
  const fields = canonical(fieldsOf(values));
  const expected = baseline.cases[name];
  assert.ok(expected);
  assert.equal(fields.length, expected.count, `${name} preserves its field count`);
  assert.equal(createHash("sha256").update(JSON.stringify(fields)).digest("hex"), expected.sha256, `${name} preserves legacy paths, kinds and formats`);
  validateValues(dataShape(fields), values, "root", true, 400);
}

const fx = z.object({
  _meta: z.object({ now: z.string() }), related: z.record(z.string(), z.array(z.string())),
  info: z.record(z.string(), z.object({ ticker: z.string(), name: z.string(), marketCap: z.number().nullable(), cik: z.string().nullable() })),
  grouped: z.record(z.string(), z.record(z.string(), z.object({ o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number() }))),
  intraday: z.record(z.string(), z.record(z.string(), z.array(z.object({ t: z.number(), c: z.number() })))),
}).parse(read("eval/fixtures/stocks-nvda.json"));
const source: MassiveSource = {
  info: async (ticker) => fx.info[ticker] ?? null,
  related: async (ticker) => fx.related[ticker] ?? [],
  grouped: async (day) => new Map(Object.entries(fx.grouped[day] ?? {})),
  intraday: async (ticker, day) => fx.intraday[ticker]?.[day] ?? [],
};
for (const peers of [true, false]) {
  const dataset = await stocksDataset("NVDA", source, new Date(fx._meta.now), undefined, { peers });
  assert.ok(StocksData.safeParse(dataset.values).success, "recorded source builds a valid dataset");
  assert.deepEqual(dataset.fields, fieldsOf(dataset.values), "live producer uses schema fields");
  assert.ok(!dataset.fields.some((f) => /^(consensus|earnings|benchmark|etfExposure)/.test(f.path)), "absent topics add no fields");
}

const empty = basketRecord({ name: "Bond fund", ticker: "BND", kind: "Bond fund", holdings: [], periods: [] });
const grouped = { subject: { ticker: "BND", name: "Bond fund" }, basket: empty, baskets: [empty] };
assert.ok(StocksData.safeParse(grouped).success, "grouped subject needs identity, not stock prices");
validateValues(dataShape(fieldsOf(grouped)), grouped, "root", true, 400);
assert.deepEqual(fieldsOf(grouped).filter((f) => f.path.startsWith("subject.")).map((f) => f.path).sort(), ["subject.name", "subject.ticker"]);
const emptyFields = fieldsOf({ baskets: [] });
assert.ok(emptyFields.some((f) => f.path === "baskets[].holdings[].logo"), "empty lists retain nested item contracts");
assert.equal(emptyFields.length, fieldsOf({ baskets: [empty] }).length);
assert.ok(Basket.safeParse(empty).success);

for (const initialPrice of [125, null]) {
  const expectation = expectationRecord({ name: "Nvidia", ticker: "NVDA", initialPrice, volume: initialPrice === null ? null : 20 });
  assert.ok(Expectation.safeParse(expectation).success, "unavailable estimates keep nullable inputs and outputs");
  assert.deepEqual(fieldsOf({ expectation }), fieldsOf(samples.expectation!), "nulls preserve numeric field contracts");
}
const consensus = Consensus.parse(recorded.values.consensus);
const { shift, momentum, target, ...core } = consensus;
assert.ok(shift && momentum && target, "the recorded consensus covers every optional extension");
for (let mask = 0; mask < 8; mask++) {
  const value: Record<string, MockValue> = { ...core, ...(mask & 1 ? { shift } : {}), ...(mask & 2 ? { momentum } : {}), ...(mask & 4 ? { target } : {}) };
  for (const [key, bit] of [["shift", 1], ["momentum", 2], ["target", 4]] as const) {
    assert.equal(fieldsOf({ consensus: value }).some((f) => f.path.startsWith(`consensus.${key}.`)), !!(mask & bit), `${key} is advertised only when present`);
  }
}
const { move, vsBenchmark, window, vsTone, ...uncompared } = etf;
assert.equal(fieldsOf({ etfExposure: [uncompared] }).length, 7);
assert.ok(EtfExposure.array().safeParse([uncompared, etf]).success, "the new schema accepts mixed optional item fields");
assert.equal(fieldsOf({ etfExposure: [uncompared, etf] }).length, 11, "optional item fields appear when any item has them");
assert.equal(fieldsOf({ etfExposure: [] }).length, 7, "an empty list has only required item fields");
const notes = { requestNotes: [{ topic: "Earnings", message: "Unavailable", state: "Data unavailable", source: "" }] };
assert.deepEqual(fieldsOf(notes), ["topic", "message", "state", "source"].map((key) => ({ path: `requestNotes[].${key}`, kind: "text", format: "none" })));
assert.ok(!StocksData.safeParse({ subject: { ticker: "NVDA", name: "Nvidia", price: "invented" } }).success, "a malformed stock cannot fall through to identity-only data");
const malformed = { stats: [{ label: "P/E", value: "30" }] };
assert.throws(() => validateValues(dataShape(fieldsOf(malformed)), malformed), /stats\[\].source/, "derivation keeps missing required fields visible to validation");
console.log("stocks schema: legacy field parity, recorded producers, grouped identity, empty lists, nullable estimates and optional roots/items passed");
