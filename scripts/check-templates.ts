/**
 * Sports components travel as templates, called by name on the wire:
 * 1. Parity: every catalog sample called by name draws exactly what its expanded program draws.
 * 2. Hygiene: a call inside an @Each whose item name the template also uses is not captured.
 * 3. Params: a copy param replaces its default; absent or null keeps the record's.
 * 4. Bad calls are refused with a message: a literal record, too many arguments, a number as copy.
 * 5. The compiler keeps the writer's calls, and a result names the definitions it uses.
 */
import assert from "node:assert/strict";
import { parseExpression, split, tokenize } from "@openuidev/lang-core";
import type { Expr } from "../src/lang/program.js";
import { compileScreen, type ScreenSource } from "../src/lang/compiler.js";
import { programTree } from "../src/lang/tree.js";
import { definitionsFor, expandCall, expandProgram } from "../src/lang/templates.js";
import { SPORTS_TEMPLATES, SPORTS_TEMPLATE_DEFS } from "../src/sports/components.js";
import { SPORTS_SCREEN } from "../src/sports/screen.js";
import { fixtureSuite } from "./openui-fixtures.js";

const fixtures = fixtureSuite().fixtures;
const head = (run: string) => `root = Screen([pick1])\nd = Query("sports_dataset", {run: "${run}"}, {})\n`;
const recordOf = (key: string) => (fixtures.find(f => f.key === key)!.dataset.result as { answers: { q1: { record: unknown } } }).answers.q1.record;
const texts = (program: string, values: unknown) => programTree(program, values, SPORTS_TEMPLATES).nodes.filter(n => n.primitive === "Text").map(n => n.props.content);

// 1. Parity.
let compared = 0;
for (const def of SPORTS_TEMPLATE_DEFS) for (const fixture of fixtures.filter(f => f.key.startsWith(`${def.name}/`))) {
  const called = `${head(fixture.key)}pick1 = ${def.name}(d.answers.q1.record)\n`;
  assert.deepEqual(programTree(called, fixture.dataset.result, SPORTS_TEMPLATES), programTree(fixture.program, fixture.dataset.result), `${fixture.key}: the call draws what the expansion draws`);
  compared++;
}

// 2. Hygiene: Leaderboard's own @Each item is "e".
{
  const board = recordOf("Leaderboard/full");
  const values = { answers: { q1: { boards: [board, board] } } };
  const program = `${head("hygiene")}pick1 = Stack("v", 12, @Each(d.answers.q1.boards, "e", Leaderboard(e)))\n`;
  const expanded = expandProgram(program, SPORTS_TEMPLATES);
  assert.match(expanded, /"eLeaderboard"/, "the template's own item is renamed");
  const entries = (board as { entries: unknown[] }).entries.length;
  assert.equal(programTree(program, values, SPORTS_TEMPLATES).nodes.filter(n => n.primitive === "Row").length, 2 * entries, "each board draws its own entries");
}

// 3. Params.
{
  const record = recordOf("MetricBars/full") as { heading: string };
  const values = { answers: { q1: { record } } };
  const call = (args: string) => `${head("params")}pick1 = MetricBars(d.answers.q1.record${args})\n`;
  assert.ok(texts(call(""), values).includes(record.heading), "no heading keeps the record's");
  assert.ok(texts(call(", null"), values).includes(record.heading), "null keeps the record's");
  const own = texts(call(`, "Points per game · this vs last season"`), values);
  assert.ok(own.includes("Points per game · this vs last season") && !own.includes(record.heading), "a heading replaces the record's");
}

// 4. Bad calls: refused with the reason; the line expander leaves such a line as written.
{
  const exprOf = (text: string) => parseExpression(split(tokenize(`x = ${text}`))[0]!.tokens) as Extract<Expr, { k: "Comp" }>;
  for (const [text, problem] of [[`MatchCard("Chelsea")`, /data reference/], [`MatchCard(d.a, d.b)`, /takes record/], [`MetricBars(d.a, 7)`, /is text/]] as const) {
    assert.throws(() => expandCall(exprOf(text), SPORTS_TEMPLATES), problem, text);
    assert.equal(expandProgram(`x = ${text}`, SPORTS_TEMPLATES), `x = ${text}`);
  }
}

// 5. The compiler keeps calls.
{
  const match = recordOf("MatchCard/full");
  const values = { answers: { q1: { status: "complete", question: "Latest game", title: "Latest game", match } } };
  const source: ScreenSource = { run: "templates", request: "Chelsea's latest game", values, required: [{ id: "q1", text: "Latest game" }], base: [], editable: new Set(), explicitLayout: null };
  const screen = await compileScreen(source, SPORTS_SCREEN, async (_messages, emit) => {
    const text = `game = MatchCard(d.answers.q1.match)\n`;
    emit(text);
    return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } };
  });
  assert.match(screen.program, /^pick1 = MatchCard\(d\.answers\.q1\.match\)$/m, "the program calls MatchCard by name");
  assert.equal(screen.stats.fallbacks, 0);
  assert.deepEqual(definitionsFor(screen.program, SPORTS_TEMPLATES).map(t => t.name), ["MatchCard"]);
  assert.ok(programTree(screen.program, values, SPORTS_TEMPLATES).nodes.some(n => n.primitive === "Card"));
}

console.log(`Templates: ${SPORTS_TEMPLATE_DEFS.length} definitions, ${compared} samples drawn by name, hygiene, params, bad calls, compiler ok`);
