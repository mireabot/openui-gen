import assert from "node:assert/strict";
import { evaluateRoot, type ElementNode } from "@openuidev/lang-core";
import { LIBRARY, PARSER, slotLibrary } from "../src/lang/library.js";
import { PRIMITIVES } from "../src/lang/primitives.js";
import { each, printStatement, primitivesOf, queryRoot, ui, holeRef, type Node, type Ref } from "../src/lang/program.js";
import { skeletonOf } from "../src/lang/skeleton.js";
import { programTree } from "../src/lang/tree.js";
/**
 * The OpenUI Lang primitive library: it builds, prompt signatures are exact, tokens and data
 * are enforced, and what the server prints parses back with zero errors over a small dataset.
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

/** A leaderboard answer: the shape a sports screen reads (d.answers.<id>). */
interface Values { answers: { q1: { title: string; items: { name: string; club: string; goals: number }[] } } }
const values: Values = { answers: { q1: { title: "Top scorers", items: [
  { name: "Mateo Ruiz", club: "Harbor City", goals: 21 }, { name: "Ilan Okafor", club: "Lakeshore", goals: 18 }, { name: "Sven Albrecht", club: "Northgate", goals: 17 },
] } } };
const d = queryRoot<Values>();
const scorers = ui.Section({ title: holeRef("pick1_title", "copy"), subtitle: holeRef("pick1_subtitle", "copy"), children: [ui.Stack({ axis: "v", gap: 8, divided: true, children:
  each(d.answers.q1.items, "p", (p: Ref<Values["answers"]["q1"]["items"][number]>) => ui.Row({ title: p.name, subtitle: p.club, trailing: ui.Number({ value: p.goals, format: "count", role: "body" }) })) })] });
const header = ui.Text({ content: d.answers.q1.title, role: "title1" });

// @ts-expect-error a literal in a data prop does not compile
ui.Number({ value: 12, format: "currency", role: "body" });
// @ts-expect-error a gap off the spacing scale does not compile
ui.Spacer({ size: 5 });
// @ts-expect-error unknown dataset field
void d.answers.q1.titel;

const program = [
  printStatement("root", ui.Screen({ children: [holeRef("pick1", "node"), holeRef("pick2", "node")] }).expr),
  `d = Query("sports_dataset", {run: "check"}, {})`,
  printStatement("pick1", header.expr),
  printStatement("pick2", scorers.expr),
  `pick1_title = ""`, `pick1_subtitle = ""`,
  `pick1_title = "Premier Division"`, `pick1_subtitle = null`,
].join("\n");

const parsed = PARSER.parse(program);
assert.deepEqual(parsed.meta.errors, [], "server program parses without errors");
assert.deepEqual(parsed.meta.unresolved, []);
assert.equal(parsed.queryStatements.length, 1);

const evaluated = evaluateRoot(parsed, {
  ctx: { getState: () => undefined, resolveRef: (n) => (n === "d" ? values : undefined) },
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
assert.equal(names.filter((n) => n === "Number").length, values.answers.q1.items.length, "@Each renders one row per item");
assert.deepEqual(primitivesOf(scorers.expr), ["Section", "Stack", "Row", "Number"]);
const tree = programTree(program, values);
assert.deepEqual(tree.nodes.filter((node) => node.primitive === "Number").map((node) => node.props.value), [21, 18, 17], "numeric data resolves through the tree");
assert.ok(skeletonOf(tree).blocks.length >= 1, "the program has a skeleton");

const paddedSkeleton = skeletonOf(programTree(`root = Screen([Stack("v", 0, [Grid("2", 16, [Text("A", "body"), Text("B", "body"), Text("C", "body")], 24)], null, null, null, null, 16, 12)])`, {}));
const paddedFrame = paddedSkeleton.blocks[0];
assert.ok(paddedFrame?.kind === "stack", "a padded top stack remains a container");
assert.equal(paddedFrame.paddingX, 16);
assert.equal(paddedFrame.paddingY, 12);
const paddedGrid = paddedFrame.children[0];
assert.ok(paddedGrid?.kind === "grid");
assert.equal(paddedGrid.gap, 16);
assert.equal(paddedGrid.rowGap, 24);
assert.deepEqual(JSON.parse(JSON.stringify(paddedSkeleton)), paddedSkeleton, "layout survives the skeleton wire format");

const errorsOf = (src: string) => PARSER.parse(`root = Screen([s])\n${src}`).meta.errors.map((e) => `${e.code} ${e.component}${e.path}`);
assert.deepEqual(errorsOf(`s = Spacer(5)`), ["type-mismatch Spacer/size"], "tokens are closed");
assert.deepEqual(errorsOf(`s = Text("x", "huge")`), ["type-mismatch Text/role"]);
assert.deepEqual(errorsOf(`s = Row("x", null, null, Image("y", "1-1"))`), [], "lang-core ignores accepts: the gate must check them");

const slot = slotLibrary(["Stack", "Text", "Note", "KeyValue"]);
const fragment = slot.parser.parse(`root = Slot([a])\na = Stack("v", 8, [Text("Why it moved", "headline"), KeyValue("P/E", "31")])`);
assert.deepEqual(fragment.meta.errors, []);
assert.ok(slot.parser.parse(`root = Slot([a])\na = Card([Text("x", "body")])`).meta.errors.some((e) => e.code === "unknown-component"), "slot libraries reject other primitives");

console.log(`lang: ${PRIMITIVES.length} primitives, prompt ${prompt.length} chars, program ${program.length} chars, ${names.length} elements, ok`);
