import assert from "node:assert/strict";
import { PARSER } from "../src/lang/library.js";
import { basePart, compileScreen, StatementStream, WRITER_PRIMITIVES, type CompileHooks, type DataPath, type ProgramWriter, type QuestionId, type ScreenPack, type ScreenSource } from "../src/lang/compiler.js";
import { printExpr, printStatement, type Expr } from "../src/lang/program.js";
import { programTree } from "../src/lang/tree.js";
import { expandProgram, templateSet } from "../src/lang/templates.js";

/** The screen compiler against a fake two-question pack and scripted writers; no network. */

const periods = Array.from({ length: 8 }, (_, i) => ({ label: `Round ${i + 1}`, goals: `${i}` }));
const values = {
  subject: { code: "ARS", name: "Arsenal" },
  answers: {
    q1: { question: "Last 8 rounds of goals", periods },
    q2: { question: "Manager comments", summary: "Injuries cost points in October.", quotes: [{ text: "We need to recover.", by: "Manager" }] },
    q3: { question: "Clean sheets", summary: "Four clean sheets this season." },
  },
};
const T = (content: Expr, role = "body"): Expr => ({ k: "Comp", name: "Text", args: [content, { k: "Str", v: role }] });
const path = (...keys: (string | number)[]): Expr => keys.reduce<Expr>((obj, key) => typeof key === "number" ? { k: "Index", obj, index: { k: "Num", v: key } } : { k: "Member", obj, field: key }, { k: "Ref", n: "d" });
const card = (...children: Expr[]): Expr => ({ k: "Comp", name: "Card", args: [{ k: "Arr", els: children }] });

const has = (reads: readonly DataPath[], ...wanted: DataPath[]) => wanted.every(w => reads.some(r => JSON.stringify(r) === JSON.stringify(w)));
const definitions = templateSet([{ name: "MatchRow", params: [{ name: "record", role: "data" }], body: `Card([Text(record.label, "footnote"), Text(record.goals, "headline")])` }]);
const pack: ScreenPack = {
  definitions,
  evidenceOf: p => p[0] === "answers" && typeof p[1] === "string" && /^q\d+$/.test(p[1]) ? { question: p[1] as QuestionId, rest: p.slice(2) } : null,
  shows: (q, reads) => q === "q1" ? has(reads, ["periods", null, "goals"]) : has(reads, ["summary"]),
  listProblem: () => null,
  fallback: q => q === "q1"
    ? card({ k: "Comp", name: "Stack", args: [{ k: "Str", v: "v" }, { k: "Num", v: 12 }, { k: "Comp", name: "Each", args: [path("answers", "q1", "periods"), { k: "Str", v: "p" }, T({ k: "Member", obj: { k: "Ref", n: "p" }, field: "goals" })] }] })
    : card(T(path("answers", q, "summary"))),
  briefing: source => JSON.stringify(source.values),
  templates: "MatchRow(period)",
};
const source = (over: Partial<ScreenSource> = {}): ScreenSource => ({
  run: "run1", request: "Arsenal's last 8 rounds and comments", values,
  required: [{ id: "q1", text: "Last 8 rounds of goals" }, { id: "q2", text: "Manager comments" }],
  base: [], editable: new Set(), explicitLayout: null, ...over,
});
const usage = { promptTokens: 1, completionTokens: 1, cost: 0 };
/** Each call takes the next script; a script of null throws (transport failure) after emitting `partial`. */
const scripted = (...scripts: (string | { partial: string })[]): ProgramWriter => {
  let call = 0;
  return async (_messages, emit) => {
    const script = scripts[call++] ?? "";
    const text = typeof script === "string" ? script : script.partial;
    for (const char of text) emit(char);
    if (typeof script !== "string") throw new Error("socket hang up");
    return { text, usage };
  };
};
/** Every appended chunk leaves a program that parses with no unresolved refs. */
const wire = () => {
  let text = "";
  const hooks: CompileHooks = { program: chunk => {
    text += chunk;
    const parsed = PARSER.parse(expandProgram(text, definitions));
    assert.deepEqual([parsed.meta.errors, parsed.meta.unresolved, parsed.meta.incomplete], [[], [], false], `invalid wire after:\n${chunk}`);
  } };
  return { hooks, text: () => text };
};

// 1. The writer's layout: a part with a template inside @Each and a sub-statement, then a second part.
{
  const live = wire();
  const screen = await compileScreen(source(), pack, scripted(`rounds = Section("Eight rounds", [rounds_list])
rounds_list = Stack("v", 12, @Each(d.answers.q1.periods, "p", MatchRow(p)))
calls = Card([Text(d.answers.q2.summary, "body")])
`), live.hooks);
  assert.deepEqual(screen.parts.map(p => [p.id, [...p.statements.keys()], p.origin.kind]), [["pick1", ["pick1", "pick1_list"], "writer"], ["pick2", ["pick2"], "writer"]]);
  assert.deepEqual([...screen.coverage], [["q1", ["pick1"]], ["q2", ["pick2"]]]);
  assert.equal(screen.stats.fallbacks, 0);
  assert.equal(screen.stats.repairRounds, 0);
  assert.match(screen.program, /^root = Screen\(\[pick1, pick2\]\)\nd = Query/);
  assert.match(screen.program, /@Each\(d\.answers\.q1\.periods, "p", MatchRow\(p\)\)/, "the program keeps the template call");
  assert.equal(programTree(screen.program, values, definitions).nodes.filter(n => n.primitive === "Card").length, 9);
  assert.doesNotMatch(live.text(), /Show\(false/, "no placeholders on the wire");
  assert.ok(live.text().indexOf("pick1_list =") < live.text().indexOf("root = Screen([pick1])"), "a part reaches the root only once all of it is there");
}

// 1b. A part still being written is not on the wire, so a client shows its skeleton instead.
{
  const seen: string[] = [];
  await compileScreen(source(), pack, scripted(`rounds = Section("Eight rounds", [rounds_list])\ncalls = Card([Text(d.answers.q2.summary, "body")])\n`, `rounds_list = Stack("v", 12, @Each(d.answers.q1.periods, "p", MatchRow(p)))\n`), { program: chunk => seen.push(chunk) });
  const roots = seen.flatMap(chunk => chunk.match(/root = Screen\(\[.*\]\)/g) ?? []);
  assert.deepEqual(roots, ["root = Screen([])", "root = Screen([pick2])", "root = Screen([pick1, pick2])"]);
}

// 1c. The system prompt is the cached prefix: a new screen and an edit of a saved one must send the same bytes, or every follow-up misses the cache.
{
  const systems: string[] = [];
  const capture = { request: (messages: readonly { role: string; content: string }[]) => { systems.push(messages[0]!.content); } };
  const first = await compileScreen(source(), pack, scripted(`calls = Card([Text(d.answers.q2.summary, "body")])\nrounds = Stack("v", 12, @Each(d.answers.q1.periods, "p", MatchRow(p)))\n`), capture);
  const stored = first.parts.map(p => basePart(p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))));
  await compileScreen(source({ base: stored, editable: new Set([stored[0]!.id]), required: [{ id: "q2", text: "Manager comments" }] }), pack, scripted(`${stored[0]!.id} = Card([Text(d.answers.q2.summary, "headline")])\n`), capture);
  assert.equal(systems.length, 2);
  assert.equal(systems[1], systems[0], "follow-ups share the system prompt");
}

// 2. A question the writer leaves out gets the pack's fallback part, after one repair attempt.
{
  const screen = await compileScreen(source(), pack, scripted(`calls = Card([Text(d.answers.q2.summary, "body")])\n`, ""));
  assert.equal(screen.stats.repairRounds, 1);
  assert.deepEqual(screen.parts.map(p => [p.id, p.origin]), [["pick1", { kind: "writer" }], ["pick2", { kind: "fallback", question: "q1" }]]);
}

// 3. Reading one quarter of eight does not show the question; the repair can fix it.
{
  const screen = await compileScreen(source({ required: [{ id: "q1", text: "Last 8 rounds of goals" }] }), pack, scripted(
    `latest = Card([Text(d.answers.q1.periods[0].goals, "title1")])\n`,
    `history = Stack("v", 12, @Each(d.answers.q1.periods, "p", Text(p.goals, "body")))\n`));
  assert.equal(screen.stats.repairRounds, 1);
  assert.deepEqual(screen.parts.map(p => p.origin.kind), ["writer", "writer"]);
  assert.equal(screen.stats.fallbacks, 0);
}

// 4. Rejections: reserved names, literal data, chrome, input controls, actions, foreign refs, missing paths, unknown names.
{
  const issues: string[] = [];
  const screen = await compileScreen(source(), pack, scripted([
    `root = Screen([x])`,
    `bad1 = Card([Progress(50)])`,
    `bad2 = NavBar("Arsenal")`,
    `bad3 = Card([Dock([Text("x", "body")])])`,
    `bad4 = Card([Button("Open", @OpenUrl("https://x.com"), "primary")])`,
    `bad5 = Card([calls])`,
    `bad6 = Card([Text(d.answers.q9.summary, "body")])`,
    `bad7 = Card([Fancy(d.subject)])`,
    `pick1 = Card([Text(d.subject.name, "body")])`,
    `bad8 = Card([Text(d.subject.name, "huge")])`,
  ].join("\n") + "\n", ""), { issue: issue => issues.push(`${issue.statementId}:${issue.code}`) });
  for (const expected of ["root:reserved-name", "bad1:type-mismatch", "bad2:template", "bad3:template", "bad4:template", "bad5:foreign-ref", "bad6:type-mismatch", "bad7:template", "pick1:locked-part", "bad8:type-mismatch"])
    assert.ok(issues.includes(expected), `expected ${expected} in ${issues.join(", ")}`);
  assert.equal(screen.stats.fallbacks, 2);
  assert.ok(!WRITER_PRIMITIVES.some(name => ["Screen", "NavBar", "Dock", "Button", "IconButton", "Toggle", "Stepper"].includes(name)));
}

// 5. Transport failure keeps finished parts; an unfinished part is dropped from the root.
{
  const screen = await compileScreen(source(), pack, scripted({ partial: `calls = Card([Text(d.answers.q2.summary, "body")])\nrounds = Section("Q", [rounds_list])\n` }));
  assert.deepEqual(screen.parts.map(p => [p.id, p.origin.kind]), [["pick1", "writer"], ["pick3", "fallback"]]);
  assert.equal(screen.stats.repairRounds, 0);
  assert.doesNotMatch(screen.program, /pick2/);
}

// 7. Follow-up: kept parts stay byte for byte, an editable part is rewritten under its id, new parts continue the ids.
{
  const first = await compileScreen(source(), pack, scripted(`rounds = Stack("v", 12, @Each(d.answers.q1.periods, "p", MatchRow(p)))\ncalls = Card([Text(d.answers.q2.summary, "body")])\n`));
  const stored = Object.fromEntries(first.parts.map(p => [p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))]));
  const base = Object.entries(stored).map(([id, statements]) => basePart(id as `pick${number}`, statements));
  const edit = await compileScreen(source({ base, editable: new Set(["pick2"]), required: [{ id: "q2", text: "Manager comments" }] }), pack,
    scripted(`pick2 = Card([Text(d.answers.q2.summary, "headline"), pick2_quotes])\npick2_quotes = Stack("v", 8, @Each(d.answers.q2.quotes, "c", Note(c.text)))\nextra = Card([Text(d.subject.name, "body")])\n`));
  // Every question is already shown, so the writer may rewrite pick2 but not add parts.
  assert.deepEqual(edit.parts.map(p => [p.id, p.origin.kind]), [["pick1", "kept"], ["pick2", "writer"]]);
  assert.ok(edit.stats.admitted === 2);
  assert.equal(printed(edit.parts[0]!.statements.get("pick1")!), printed(first.parts[0]!.statements.get("pick1")!));
  assert.match(edit.program, /pick2_quotes = Stack/);
}

// 7b. An editable part the writer leaves alone still shows its question; repeated required questions count once.
{
  const first = await compileScreen(source(), pack, scripted(`rounds = Stack("v", 12, @Each(d.answers.q1.periods, "p", MatchRow(p)))\ncalls = Card([Text(d.answers.q2.summary, "body")])\n`));
  const base = first.parts.map(p => basePart(p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))));
  const edit = await compileScreen(source({ base, editable: new Set(["pick1", "pick2"]), required: [{ id: "q1", text: "q1" }, { id: "q1", text: "q1" }, { id: "q2", text: "q2" }] }), pack,
    scripted(`pick2 = Card([Text(d.answers.q2.summary, "headline")])\n`));
  assert.deepEqual(edit.parts.map(p => [p.id, p.origin.kind]), [["pick1", "kept"], ["pick2", "writer"]]);
  assert.equal(edit.stats.fallbacks, 0);
}

// 7c. Nothing to show and nothing editable: no writer call; a new question opens new parts.
{
  const first = await compileScreen(source(), pack, scripted(`calls = Card([Text(d.answers.q2.summary, "body")])\nrounds = Stack("v", 12, @Each(d.answers.q1.periods, "p", MatchRow(p)))\n`));
  const base = first.parts.map(p => basePart(p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))));
  const idle = await compileScreen(source({ base, required: [] }), pack, async () => { throw new Error("the writer must not be called"); });
  assert.equal(idle.writerCalled, false);
  const added = await compileScreen(source({ base, required: [{ id: "q3", text: "Clean sheets" }] }), pack, scripted(`sheets = Card([Text(d.answers.q3.summary, "body")])\n`));
  assert.deepEqual(added.parts.map(p => [p.id, p.origin.kind]), [["pick1", "kept"], ["pick2", "kept"], ["pick3", "writer"]]);
}

// 7d. A revised answer reshaped under the same id: its old part reads data that is gone. The writer's rewrite keeps the
// part's place; with no rewrite the stale part is dropped and its question falls back, never shipped reading missing data.
{
  const first = await compileScreen(source(), pack, scripted(`rounds = Stack("v", 12, @Each(d.answers.q1.periods, "p", MatchRow(p)))\ncalls = Card([Text(d.answers.q2.summary, "body")])\n`));
  const base = first.parts.map(p => basePart(p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))));
  const reshaped = { ...values, answers: { ...values.answers, q1: { question: "Last 2 seasons of goals", periods: values.answers.q1.periods.map(p => ({ year: p.label, goals: p.goals })) } } };
  const revision = source({ values: reshaped, base, editable: new Set(["pick1"]), required: [{ id: "q1", text: "Last 2 seasons of goals" }] });
  const rewritten = await compileScreen(revision, pack, scripted(`pick1 = Stack("v", 12, @Each(d.answers.q1.periods, "p", Text(p.goals, "body")))\n`));
  assert.deepEqual(rewritten.parts.map(p => [p.id, p.origin.kind]), [["pick1", "writer"], ["pick2", "kept"]]);
  const left = await compileScreen(revision, pack, scripted(""));
  assert.deepEqual(left.parts.map(p => [p.id, p.origin.kind]), [["pick2", "kept"], ["pick3", "fallback"]]);
  assert.doesNotMatch(left.program, /pick1/);
}

// 7e. Adding a question to a saved screen: a new part that only shows an answer the kept parts already show is dropped.
{
  const first = await compileScreen(source(), pack, scripted(`rounds = Stack("v", 12, @Each(d.answers.q1.periods, "p", MatchRow(p)))\ncalls = Card([Text(d.answers.q2.summary, "body")])\n`));
  const base = first.parts.map(p => basePart(p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))));
  const added = await compileScreen(source({ base, required: [{ id: "q3", text: "Clean sheets" }] }), pack, scripted(`again = Card([Text(d.answers.q2.summary, "headline")])\nsheets = Card([Text(d.answers.q3.summary, "body")])\n`));
  assert.deepEqual(added.parts.map(p => [p.id, p.origin.kind]), [["pick1", "kept"], ["pick2", "kept"], ["pick4", "writer"]]);
}

// 8. Statement splitting survives brackets and quoted newlines.
{
  const stream = new StatementStream();
  assert.deepEqual([...stream.push('a = Card([Text("x\\ny",\n"body")])\nb = Card(['), ...stream.push("Divider()])\n"), ...stream.end()], ['a = Card([Text("x\\ny",\n"body")])', "b = Card([Divider()])"]);
}

function printed(expr: Expr): string { return printExpr(expr); }
console.log("check:compiler ok");
