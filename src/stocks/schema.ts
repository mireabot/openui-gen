import { z } from "zod";
import type { DataField, MockValue } from "../research/dataset-schema.js";
import type { NumberFormat } from "../lang/props.js";
import { TONE, INK, ACCENT } from "../primitives/tokens.js";

/** Dataset schemas own the field kinds and formats. */

interface FieldMeta { readonly kind: DataField["kind"]; readonly format: NumberFormat | "none"; readonly bindingKind?: "image" }
const FIELD = z.registry<FieldMeta>();
const leaf = <Z extends z.ZodType>(schema: Z, kind: DataField["kind"], format: NumberFormat | "none" = "none", bindingKind?: "image"): Z => (FIELD.add(schema, { kind, format, ...(bindingKind ? { bindingKind } : {}) }), schema);

const text = () => leaf(z.string(), "text");
const asset = () => leaf(z.string(), "text", "none", "image");
const num = (format: NumberFormat) => leaf(z.number(), "number", format);
const bool = () => leaf(z.boolean(), "boolean");
const status = () => leaf(z.enum(TONE), "status");
/** A colour role; record builders may use ink roles ("secondary") as well as accents. */
const color = () => leaf(z.enum([...INK, ...ACCENT]), "color");
const inkText = () => leaf(z.enum([...INK, ...ACCENT]), "text");
const icon = () => leaf(z.string(), "icon");
const texts = <const K extends string>(...keys: K[]) => Object.fromEntries(keys.map((k) => [k, text()])) as { [P in K]: z.ZodString };

export const Point = z.object({ label: text(), value: num("decimal") });

/**
 * One company. `chart` + `reference` are generic: the asked company carries today's 5-minute line
 * against the previous close, peers carry the week against the close before it; `chartCaption`
 * says which. `logo` is a server path the app resolves against the server it streamed from.
 */
export const Stock = z.object({
  ...texts("ticker", "name"), logo: asset(),
  price: num("currency"), change: num("decimal"), changePct: num("decimal"),
  marketCap: num("currency").nullable(), volume: num("count"),
  open: num("currency"), dayHigh: num("currency"), dayLow: num("currency"), weekHigh: num("currency"), weekLow: num("currency"),
  week: z.array(Point),
  chart: z.array(Point.extend({ session: leaf(z.enum(["pre", "regular", "after"]), "text") })),
  reference: num("decimal"), ...texts("referenceLabel", "chartCaption"),
});
export const Subject = Stock.extend({ story: z.object(texts("headline", "detail")).optional() });

export const Stat = z.object(texts("label", "value", "source"));

export const Earnings = z.object({
  ...texts("ticker", "name", "context", "when", "summary", "watch"),
  stats: z.array(z.object(texts("label", "value"))), source: text(), hasWatch: bool(),
});

const Sides = z.array(z.object({ label: text(), count: num("count"), tone: status() })).min(2).max(3);
export const ConsensusCore = z.object({
  ...texts("title", "subject", "source"), voters: z.array(text()), showVoters: bool(), sides: Sides,
  ...texts("score", "verdict", "verdictWord", "verdictLabel", "verdictShare", "shareText"), tone: status(), hasNote: bool(), note: text(),
});
export const Consensus = ConsensusCore.extend({
  shift: z.object({ label: text(), sides: Sides, ...texts("share", "now", "delta"), deltaTone: status() }).optional(),
  momentum: z.object(texts("up", "down", "window")).optional(),
  target: z.object({ ...texts("avg", "upside"), tone: status(), summary: text() }).optional(),
});

const Holding = z.object({ ...texts("name", "ticker", "mark", "weight", "move"), logo: asset(), moveTone: status(), ink: color() });
const Period = z.object({
  ...texts("label", "performance", "caption", "referenceLabel", "benchmarkName", "benchmarkReturn", "comparison"),
  performanceTone: status(), comparisonTone: status(),
  chart: z.array(Point), indexedChart: z.array(Point), benchmarkChart: z.array(Point),
  reference: num("decimal"), indexedReference: num("decimal"), hasBenchmark: bool(),
});
/** Uniform, including empty lists, so mixed groups share one @Each template. */
export const Basket = z.object({
  ...texts("name", "short", "ticker", "kind", "identity", "summary", "source", "note", "countLabel", "remainingLabel", "moreLabel", "concentration", "performance", "caption"),
  hasHoldings: bool(), hasRemaining: bool(), hasMore: bool(), hasAllocation: bool(), hasPeriods: bool(), hasNoPeriods: bool(),
  marks: z.array(text()), holdings: z.array(Holding), top: z.array(Holding), compactTop: z.array(Holding),
  allocation: z.array(z.object({ label: text(), value: num("decimal"), ink: color(), detail: text() })),
  periods: z.array(Period), options: z.array(text()), selected: num("integer"), performanceTone: status(),
  chart: z.array(Point), reference: num("decimal"),
});

const Option = z.object({ label: text(), value: num("decimal"), icon: icon(), detail: text(), trailing: text() });
const growth = { startingValue: num("decimal").nullable(), endingValue: num("decimal").nullable(), change: num("decimal").nullable(), periodRate: num("decimal").nullable(), endUnitPrice: num("decimal").nullable() };
export const Expectation = z.object({
  unitPrice: num("decimal").nullable(), months: num("decimal"), annualRate: num("decimal"), ...growth,
  quantity: num("integer").nullable(), maxQuantity: num("integer"),
  ...texts("name", "ticker", "priceCaption", "note", "basis", "dcfLabel", "dcfValue", "dcfNote", "strengthLabel", "strengthValue", "strengthNote"), logo: asset(), changeInk: inkText(),
  horizons: z.array(Option),
  alternatives: z.array(Option.extend({ ...growth, valid: bool(), changeInk: inkText() })),
  valid: bool(),
});

export const Benchmark = z.object({
  ...texts("ticker", "benchmarkTicker", "benchmarkName", "title", "subjectReturn", "benchmarkReturn", "comparison", "referenceLabel", "caption", "benchmarkDetail"),
  comparisonTone: status(), reference: num("decimal"), chart: z.array(Point), benchmarkChart: z.array(Point),
});

/** A fund holding the asked company; the move fields exist when a benchmark was compared. */
export const EtfExposure = z.object({
  ...texts("ticker", "name", "weight", "asOf", "source", "sourceUrl", "detail"),
  move: text().optional(), vsBenchmark: text().optional(), window: text().optional(), vsTone: status().optional(),
});

/** An honest empty state for a requested topic with no data (coverage.ts). */
export const RequestNote = z.object(texts("topic", "message", "state", "source"));
/** One institution holding the company (13F): its name, the stock's share of its portfolio, the filing. */
export const FundHolder = z.object(texts("name", "weight", "asOf", "source", "sourceUrl", "detail"));
/** The cited answer to an open ask (findings.ts): any of a period table, a series, facts and quotes. */
export const Finding = z.object({
  ...texts("question", "title", "summary", "seriesLabel", "source"),
  columns: z.array(text()), rows: z.array(z.object({ label: text(), cells: z.array(text()), pairs: z.array(z.object(texts("label", "value"))) })), series: z.array(Point),
  facts: z.array(z.object(texts("label", "value", "detail"))), quotes: z.array(z.object(texts("text", "by"))),
  hasTable: bool(), hasSeries: bool(), hasFacts: bool(), hasQuotes: bool(),
});

/**
 * Every root a stocks dataset may carry. A company dataset has subject/peers/stats plus what the
 * request asked for; a grouped-asset dataset has basket/baskets and a subject of ticker and name.
 */
export const StocksData = z.object({
  subject: z.union([Subject, z.object(texts("ticker", "name")).strict()]), peers: z.array(Stock).optional(), stats: z.array(Stat).optional(),
  benchmark: Benchmark.optional(), etfExposure: z.array(EtfExposure).optional(), fundHolders: z.array(FundHolder).optional(), earnings: Earnings.optional(),
  consensus: Consensus.optional(), consensusSet: z.array(ConsensusCore).optional(),
  basket: Basket.optional(), baskets: z.array(Basket).optional(),
  expectation: Expectation.optional(), requestNotes: z.array(RequestNote).optional(), findings: z.array(Finding).optional(),
});
export type StocksData = z.infer<typeof StocksData>;

/**
 * The flat field list for these values: every leaf of the schema the values carry. A record lists
 * the keys it has; list items list their required keys plus optional keys any item has, so an
 * empty list still describes its item shape.
 */
export function fieldsOf(values: Readonly<Record<string, MockValue>>): DataField[] {
  const fields: DataField[] = [];
  const walk = (schema: z.core.$ZodType, samples: readonly unknown[], path: string): void => {
    const inner = unwrap(schema);
    const meta = FIELD.get(inner);
    if (meta) { fields.push({ path, kind: meta.kind, format: meta.format }); return; }
    if (inner instanceof z.ZodUnion) {
      const option = inner.options.find((s) => samples.every((v) => z.safeParse(s, v).success));
      if (!option) throw new Error(`fieldsOf: ${path} matches no dataset shape`);
      walk(option, samples, path);
      return;
    }
    if (inner instanceof z.ZodArray) {
      walk(inner.element, samples.flatMap((s) => (Array.isArray(s) ? s : [])), `${path}[]`);
      return;
    }
    if (!(inner instanceof z.ZodObject)) throw new Error(`fieldsOf: ${path} has no field kind`);
    const records = samples.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null && !Array.isArray(s));
    for (const [key, child] of Object.entries(inner.shape)) {
      const present = path === "" || child instanceof z.ZodOptional
        ? records.some((r) => r[key] !== undefined)
        : true;
      if (present) walk(child, records.map((r) => r[key]).filter((v) => v !== undefined), path ? `${path}.${key}` : key);
    }
  };
  walk(StocksData, [values], "");
  return fields;
}

function unwrap(schema: z.core.$ZodType): z.ZodType {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap());
  if (schema instanceof z.ZodType) return schema;
  throw new Error("expected a zod schema");
}

