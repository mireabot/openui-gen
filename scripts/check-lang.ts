import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { evaluateRoot, type ElementNode } from "@openuidev/lang-core";
import { LIBRARY, PARSER, slotLibrary } from "../src/lang/library.js";
import { PRIMITIVES } from "../src/lang/primitives.js";
import { each, printStatement, primitivesOf, queryRoot, ui, holeRef, type Node, type Ref } from "../src/lang/program.js";
import { skeletonOf } from "../src/lang/skeleton.js";
import { programTree } from "../src/lang/tree.js";
import { ConsensusCore, Stock, StocksData, Subject } from "../src/stocks/schema.js";
import { ConsensusCard, PeerCards, StockQuote } from "../src/stocks/lang/quotes.js";

/**
 * The OpenUI Lang primitive library: it builds, prompt signatures are exact, tokens and data
 * are enforced, and what the server prints parses back with zero errors over a recorded dataset.
 */

for (const p of PRIMITIVES) {
  const keys = Object.entries(p.props);
  const firstOptional = keys.findIndex(([, spec]) => spec.optional);
  assert.ok(firstOptional < 0 || keys.slice(firstOptional).every(([, spec]) => spec.optional), `${p.name}: required props come before optional ones`);
}
assert.equal(new Set(PRIMITIVES.map((p) => p.name)).size, PRIMITIVES.length, "primitive names are unique");

const prompt = LIBRARY.prompt();
const signatures = prompt.split("\n").filter((l) => /^[A-Z][A-Za-z]*\(/.test(l));
assert.equal(signatures.length, PRIMITIVES.length, "one signature per primitive");
for (const s of signatures) assert.ok(!/\bany\b/.test(s.replace(/action\?*: any/g, "")), `untyped signature: ${s}`);
assert.match(prompt, /Stack\(axis: "v" \| "h" \| "wrap", gap: Space, children: \(/);

const fixtureSchema = StocksData.extend({ subject: Subject, peers: z.array(Stock), consensus: ConsensusCore });
const dataset = z.object({ values: fixtureSchema }).parse(JSON.parse(readFileSync("eval/fixtures/stocks-dataset.json", "utf8")));
const d = queryRoot<z.infer<typeof fixtureSchema>>();

const row = (s: Ref<z.infer<typeof Stock>>): Node => StockQuote(s);
const peers = ui.Section({ title: holeRef("pick1_title", "copy"), subtitle: holeRef("pick1_subtitle", "copy"), children: [ui.Stack({ axis: "v", gap: 8, divided: true, children: each(d.peers, "p", row) })] });
const header = ui.Stack({ axis: "v", gap: 8, children: [ui.Text({ content: d.subject.name, role: "title1" }), row(d.subject)] });

// @ts-expect-error a literal in a data prop does not compile
ui.Number({ value: 12, format: "currency", role: "body" });
// @ts-expect-error a gap off the spacing scale does not compile
ui.Spacer({ size: 5 });
// @ts-expect-error unknown dataset field
void d.subject.prcie;

const program = [
  printStatement("root", ui.Screen({ children: [holeRef("pick1", "node"), holeRef("pick2", "node")] }).expr),
  `d = Query("stocks_dataset", {run: "check"}, {})`,
  printStatement("pick1", header.expr),
  printStatement("pick2", peers.expr),
  `pick1_title = ""`, `pick1_subtitle = ""`,
  `pick1_title = "Nvidia's competitors"`, `pick1_subtitle = null`,
].join("\n");

const parsed = PARSER.parse(program);
assert.deepEqual(parsed.meta.errors, [], "server program parses without errors");
assert.deepEqual(parsed.meta.unresolved, []);
assert.equal(parsed.queryStatements.length, 1);

const evaluated = evaluateRoot(parsed, {
  ctx: { getState: () => undefined, resolveRef: (n) => (n === "d" ? dataset.values : undefined) },
  library: LIBRARY, store: null,
});
assert.ok(evaluated, "root evaluates");
const isElement = (value: unknown): value is ElementNode => typeof value === "object" && value !== null && "type" in value && value.type === "element" && "typeName" in value && typeof value.typeName === "string" && "props" in value && typeof value.props === "object" && value.props !== null;
const names: string[] = [];
const walk = (v: unknown): void => {
  if (Array.isArray(v)) return v.forEach(walk);
  if (typeof v !== "object" || v === null) return;
  if (isElement(v)) {
    names.push(v.typeName);
    if (v.typeName === "Number") assert.equal(typeof v.props.value, "number", "data refs resolve to values");
    Object.values(v.props).forEach(walk);
  }
};
walk(evaluated);
const peerCount = dataset.values.peers.length;
assert.equal(names.filter((n) => n === "Sparkline").length, peerCount + 1, "@Each renders one row per peer");
assert.deepEqual(primitivesOf(peers.expr), ["Section", "Stack", "Card", "Avatar", "Text", "Sparkline", "Number", "Change"]);

const cases: { label: string; node: Node; prices: readonly number[] }[] = [
  ...(["list", "rail", "grid", "text"] as const).map((variant) => ({
    label: `PeerCards/${variant}`,
    node: PeerCards({ data: d.peers, variant, copy: { title: holeRef("title", "copy"), subtitle: holeRef("subtitle", "copy") } }),
    prices: variant === "text" ? [] : dataset.values.peers.map((stock) => stock.price),
  })),
  ...(["score", "verdict"] as const).map((variant) => ({
    label: `ConsensusCard/${variant}`, node: ConsensusCard({ data: d.consensus, variant }), prices: [],
  })),
  ...(["row", "tile", "widget", "chip"] as const).map((variant) => ({
    label: `StockQuote/${variant}`, node: StockQuote(d.subject, variant),
    prices: variant === "chip" ? [] : [dataset.values.subject.price],
  })),
];
for (const sample of cases) {
  const source = [
    "root = Screen([pick])", 'd = Query("stocks_dataset", {run: "check"}, {})',
    printStatement("pick", sample.node.expr), 'title = "Nvidia\'s competitors"', 'subtitle = "How they moved this week"',
  ].join("\n");
  const result = PARSER.parse(source);
  assert.deepEqual(result.meta.errors, [], `${sample.label} print/parse`);
  assert.deepEqual(result.meta.unresolved, [], `${sample.label} resolves references`);
  assert.equal(result.queryStatements.length, 1, `${sample.label} retains Query`);
  const root = evaluateRoot(result, {
    ctx: { getState: () => undefined, resolveRef: (name) => name === "d" ? dataset.values : undefined },
    library: LIBRARY, store: null,
  });
  assert.ok(isElement(root), `${sample.label} evaluates to an element`);
  const tree = programTree(source, dataset.values);
  const prices = tree.nodes.filter((node) => node.primitive === "Number").map((node) => node.props.value);
  assert.deepEqual(prices, sample.prices, `${sample.label} resolves numeric data`);
  assert.equal(skeletonOf(tree).blocks.length, 1, `${sample.label} has one skeleton block`);
}

const errorsOf = (src: string) => PARSER.parse(`root = Screen([s])\n${src}`).meta.errors.map((e) => `${e.code} ${e.component}${e.path}`);
assert.deepEqual(errorsOf(`s = Spacer(5)`), ["type-mismatch Spacer/size"], "tokens are closed");
assert.deepEqual(errorsOf(`s = Text("x", "huge")`), ["type-mismatch Text/role"]);
assert.deepEqual(errorsOf(`s = Row("x", null, null, Image("y", "1-1"))`), [], "lang-core ignores accepts: the gate must check them");

const slot = slotLibrary(["Stack", "Text", "Note", "KeyValue"]);
const fragment = slot.parser.parse(`root = Slot([a])\na = Stack("v", 8, [Text("Why it moved", "headline"), KeyValue("P/E", "31")])`);
assert.deepEqual(fragment.meta.errors, []);
assert.ok(slot.parser.parse(`root = Slot([a])\na = Card([Text("x", "body")])`).meta.errors.some((e) => e.code === "unknown-component"), "slot libraries reject other primitives");

console.log(`lang: ${PRIMITIVES.length} primitives, ${cases.length} template variants that parse, evaluate and skeleton, prompt ${prompt.length} chars, program ${program.length} chars, ${names.length} elements, ok`);
