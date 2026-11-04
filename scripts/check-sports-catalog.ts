import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PRIMITIVE_BY_NAME } from "../src/lang/primitives.js";
import { SPORTS_COMPONENTS } from "../src/sports/components.js";
import { fixtureSuite, type Fixture } from "./openui-fixtures.js";

type Shape = Fixture["expected"];
const flatten = (node: Shape): Shape[] => [node, ...Object.values(node.slots).flatMap(nodes => nodes.flatMap(flatten))];
const suite = fixtureSuite();
const web = readFileSync("preview/components/primitives/render.tsx", "utf8");
const native = readFileSync("ios/OpenUIGen/GenUI/Renderer/Node/PrimitiveNodeView.swift", "utf8");
const used = new Set<string>();
for (const component of SPORTS_COMPONENTS) {
  for (const variant of ["full", "sparse"]) {
    const fixture = suite.fixtures.find(item => item.key === `${component.name}/${variant}`);
    assert.ok(fixture, `${component.name}/${variant} needs a compiler fixture`);
    for (const node of flatten(fixture.expected)) {
      assert.ok(PRIMITIVE_BY_NAME.has(node.kind), `${component.name} leaks ${node.kind} into the client`);
      used.add(node.kind);
      if (node.kind === "Screen") continue;
      assert.ok(web.includes(`case "${node.kind}":`), `${node.kind} has no web renderer`);
      assert.ok(native.includes(`case "${node.kind}":`), `${node.kind} has no SwiftUI renderer`);
    }
  }
}

const heatmap = suite.fixtures.find(item => item.key === "FixturesHeatmap/full");
assert.ok(heatmap);
const nodes = flatten(heatmap.expected);
const grid = nodes.find(node => node.kind === "Grid");
assert.ok(grid, "FixturesHeatmap needs an equal-column grid");
assert.equal(grid.properties.columns, "10");
assert.equal(grid.properties.gap, 4);
const cells = (grid.slots.children ?? []).filter(node => node.kind === "ColorCell");
assert.ok(cells.length > 10, "The heatmap fixture must exercise a second row");
assert.ok(!nodes.some(node => node.kind === "Badge"), "FixturesHeatmap must draw blank cells, not text badges");
assert.deepEqual(new Set(cells.map(cell => cell.properties.fill)), new Set([
  "tone.good.fg", "tone.bad.fg", "outline.control", "surface.filled",
]), "Wins, losses, draws and upcoming fixtures need four distinct fills");
assert.ok(cells.every(cell => typeof cell.properties.label === "string" && cell.properties.label.length > 0), "Every cell needs a spoken label");

const stats = suite.fixtures.find(item => item.key === "StatsCard/full");
assert.ok(stats);
const statsNodes = flatten(stats.expected);
const card = statsNodes.find(node => node.kind === "Card");
assert.ok(card);
assert.equal(card.properties.padding, 0);
assert.equal(card.properties.gap, 0);
assert.equal(statsNodes.filter(node => node.kind === "Divider").length, 1);
const rating = statsNodes.find(node => node.kind === "Badge");
assert.ok(rating);
assert.equal(rating.properties.size, "large");
assert.equal(rating.properties.fill, "tone.good.fg");
assert.equal(rating.properties.ink, "surface.screen");
assert.ok(statsNodes.some(node => node.kind === "Text" && node.properties.content === "Cole Palmer" && node.properties.role === "headline" && node.properties.weight === "semibold"));
const statsRail = statsNodes.find(node => node.kind === "Rail");
assert.ok(statsRail);
assert.equal(statsRail.properties.gap, 12);

const sourceIndex = process.argv.indexOf("--source");
if (sourceIndex >= 0) {
  const directory = process.argv[sourceIndex + 1];
  assert.ok(directory && !directory.startsWith("--"), "--source requires the source sports-components/lib directory");
  const designs = readdirSync(directory).filter(file => file.endsWith(".tsx") && file !== "rating.tsx").map(file => path.basename(file, ".tsx")).sort();
  const indexed = SPORTS_COMPONENTS.map(component => component.name.replace(/[A-Z]/g, (letter, index) => `${index ? "-" : ""}${letter.toLowerCase()}`)).sort();
  assert.deepEqual(indexed, designs, "Every reusable sports design must have a server template. rating.tsx is a shared helper");
  console.log(`sports source coverage: ${designs.length}/${designs.length} reusable designs indexed`);
}

console.log(`sports catalog: ${SPORTS_COMPONENTS.length} components, ${SPORTS_COMPONENTS.length * 2} compiler fixtures, ${used.size} supported primitive kinds`);
console.log("heatmap: 10 columns, multiple rows, blank accessible cells, four distinct fills");
console.log("stats card: large solid rating, semibold header, divided sections, independent grid row spacing");
console.log("Visual equivalence with the source design requires separate renderer inspection.");
