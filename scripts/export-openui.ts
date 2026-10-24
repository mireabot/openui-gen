import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluateRoot, type ElementNode } from "@openuidev/lang-core";
import { compileScreen, type QuestionId } from "../src/lang/compiler.js";
import { LIBRARY, LIBRARY_SCHEMA, PARSER } from "../src/lang/library.js";
import { PRIMITIVES, PRIMITIVE_BY_NAME } from "../src/lang/primitives.js";
import type { MockValue } from "../src/research/dataset-schema.js";
import { answerFor, type Answer, type Lookup, type LookupKind, type Subject } from "../src/stocks/answers.js";
import type { MassiveSource, StocksDataset } from "../src/stocks/data.js";
import { STOCKS_SCREEN, TEMPLATES } from "../src/stocks/lang/screen.js";

/**
 * `npm run openui:export`: the component schema index for native clients.
 *
 * - catalog/openui/primitives.json: every primitive with its positional props and roles, and a
 *   digest of the lang-core schema. A renderer registers one view per primitive name.
 * - catalog/openui/fixtures.json: one program per template variant, compiled by the real screen
 *   compiler over recorded datasets, with the element tree a renderer must produce.
 *
 * `--check` fails when the committed files are stale; `--ios <dir>` also writes them into the
 * native Resources directory.
 */

const check = process.argv.includes("--check");
const iosIndex = process.argv.indexOf("--ios");
const ios = iosIndex < 0 ? null : process.argv[iosIndex + 1];
if (iosIndex >= 0 && (!ios || ios.startsWith("--"))) throw new Error("--ios requires the native Resources directory");
const definitions = PRIMITIVES.map(p => ({ name: p.name, args: Object.entries(p.props).map(([name, spec]) => ({ name, optional: spec.optional, ...spec.meta })) }));
const digest = createHash("sha256").update(JSON.stringify({ definitions, schema: LIBRARY_SCHEMA })).digest("hex");
const contract = { version: 1, langCore: "1.0.0", digest, primitives: definitions };

const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

// A recorded stock dataset (flat records) answered the way a live run answers each lookup.
const recorded = read<StocksDataset>("eval/fixtures/stocks-dataset.json");
const flat = recorded.values as Record<string, MockValue>;
const subjectRecord = flat.subject as { ticker: string; name: string };
const subject: Subject = { ticker: subjectRecord.ticker, name: subjectRecord.name, kind: null, tickers: [], range: null };
const market = { providers: () => ["massive"] } as unknown as MassiveSource;
const LOOKUPS: readonly Lookup[] = [
  { kind: "peers", limit: null }, { kind: "stats", metrics: ["P/E ratio"] }, { kind: "earnings", period: "latest" }, { kind: "consensus" } as Lookup,
  { kind: "benchmark", ticker: "SPY" }, { kind: "basket" } as Lookup, { kind: "expectation", volume: 10, initialPrice: null, months: null, annualRate: null },
];
const stockAnswers = Object.fromEntries(LOOKUPS.map((lookup, i) => {
  const id = `q${i + 1}` as QuestionId;
  return [id, answerFor({ id, text: lookup.kind, lookup }, subject, flat, null, null, recorded, market)];
})) as Record<QuestionId, Answer>;

// A recorded live run for the researched lookups (web findings, reported quarters).
const nke = read<{ result: { subject: Record<string, MockValue>; answers: Record<QuestionId, Answer> } }>("eval/fixtures/ask-nke.json");

const datasets = [
  { run: "stocks", values: { subject: flat.subject, answers: stockAnswers } },
  { run: "ask-nke", values: nke.result },
] as const;

const isElement = (v: unknown): v is ElementNode => typeof v === "object" && v !== null && "type" in v && v.type === "element" && "typeName" in v;
const children = (value: unknown): ElementNode[] => Array.isArray(value) ? value.flatMap(children) : isElement(value) ? [value] : [];
interface Shape { kind: string; properties: Record<string, unknown>; slots: Record<string, Shape[]> }
function shape(element: ElementNode): Shape {
  const definition = PRIMITIVE_BY_NAME.get(element.typeName);
  if (!definition) throw new Error(`Unknown fixture primitive ${element.typeName}`);
  const properties: Record<string, unknown> = {}, slots: Record<string, Shape[]> = {};
  for (const [key, spec] of Object.entries(definition.props)) {
    const value = element.props[key];
    if (spec.meta.role === "node" || spec.meta.role === "nodes") slots[key] = children(value).map(shape);
    else if (value !== undefined && value !== null) properties[key] = value;
  }
  return { kind: element.typeName, properties, slots };
}
function expected(program: string, values: unknown): Shape {
  const parsed = PARSER.parse(program);
  if (parsed.meta.errors.length || parsed.meta.unresolved.length || parsed.meta.incomplete) throw new Error(`Invalid fixture: ${JSON.stringify(parsed.meta)}`);
  const root = evaluateRoot(parsed, { ctx: { getState: () => undefined, resolveRef: name => name === "d" ? values : undefined }, library: LIBRARY, store: null });
  if (!isElement(root)) throw new Error("Fixture has no root element");
  return shape(root);
}

/** The writer's call for one template variant: the data, the variant, then copy. */
function calls(name: string): { variant: string; args: string[] }[] {
  const template = TEMPLATES[name]!;
  const enumAt = template.params.findIndex(p => Array.isArray(p));
  const variants = enumAt < 0 ? ["default"] : template.params[enumAt] as readonly string[];
  return variants.map(variant => ({ variant, args: template.params.flatMap((p, i) => i === enumAt ? [JSON.stringify(variant)] : p === "copy" ? ['"Title"'] : p === "copy?" ? ['"Subtitle"'] : ['"default"']) }));
}

/** Lookups whose answer is a list under `items`; their templates take the list. */
const LIST_LOOKUPS = new Set<LookupKind>(["peers", "stats", "etfHolders", "fundHolders"]);
const usage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cost: 0 };
const fixtures: { key: string; program: string; expected: Shape }[] = [];
const skipped: string[] = [];
for (const [name, template] of Object.entries(TEMPLATES)) {
  if (template.fits === "period") continue;
  for (const { variant, args } of calls(name)) {
    const key = `${name}/${variant}`;
    const found = datasets.flatMap(({ run, values }) => {
      // A subject card shows no question; the screen still needs one, which gets its default part.
      if (template.fits === "subject") return [{ run, values, data: "d.subject", question: "q1" as QuestionId }];
      const fits = template.fits as readonly LookupKind[];
      const hit = Object.entries(values.answers).find(([, answer]) => fits.includes(answer.lookup) && answer.status !== "unavailable");
      if (!hit) return [];
      const items = LIST_LOOKUPS.has(hit[1].lookup) || name.endsWith("Set");
      return [{ run, values, data: `d.answers.${hit[0]}${items ? ".items" : ""}`, question: hit[0] as QuestionId }];
    })[0];
    if (!found) { skipped.push(`${key} (no recorded answer)`); continue; }
    const text = `card = ${name}(${[found.data, ...args].join(", ")})\n`;
    const required = [{ id: found.question, text: found.question }];
    const screen = await compileScreen({ run: found.run, request: key, values: found.values, required, base: [], editable: new Set(), explicitLayout: null },
      STOCKS_SCREEN, async (_messages, emit) => { emit(text); return { text, usage }; });
    if (!screen.parts.some(part => part.origin.kind === "writer")) { skipped.push(`${key} (${[...new Set(screen.issues.filter(i => i.source !== "coverage").map(i => i.message))].join("; ") || "not admitted"})`); continue; }
    fixtures.push({ key, program: screen.program, expected: expected(screen.program, found.values) });
  }
}

const suite = { version: 2, contract: digest, datasets: datasets.map(({ run, values }) => ({ tool: "stocks_dataset", args: { run }, result: values })), fixtures };
for (const [name, value] of [["primitives", contract], ["fixtures", suite]] as const) {
  const text = JSON.stringify(value, null, 2) + "\n";
  const files = [path.join("catalog", "openui", `${name}.json`), ...(ios ? [path.join(ios, `openui-${name}.json`)] : [])];
  for (const file of files) {
    if (check) {
      if (readFileSync(file, "utf8") !== text) throw new Error(`Stale OpenUI export: ${file}. Run npm run openui:export.`);
    } else {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  }
}
if (skipped.length) console.log(`skipped: ${skipped.join(", ")}`);
console.log(`OpenUI ${check ? "freshness" : "export"}: ${definitions.length} definitions, ${fixtures.length} template variants, ${digest.slice(0, 12)}`);
