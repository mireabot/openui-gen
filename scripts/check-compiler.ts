import assert from "node:assert/strict";
import { PARSER } from "../src/lang/library.js";
import { basePart, compileScreen, StatementStream, WRITER_PRIMITIVES, type CompileHooks, type DataPath, type ProgramWriter, type QuestionId, type ScreenPack, type ScreenSource } from "../src/lang/compiler.js";
import { printExpr, printStatement, type Expr } from "../src/lang/program.js";
import { programTree } from "../src/lang/tree.js";

/** The screen compiler against a fake two-question pack and scripted writers; no network. */

const periods = Array.from({ length: 8 }, (_, i) => ({ label: `Q${(i % 4) + 1} FY${25 + Math.floor(i / 4)}`, eps: `$0.${50 + i}` }));
const values = {
  subject: { ticker: "NKE", name: "NIKE, Inc." },
  answers: {
    q1: { question: "Last 8 quarters of EPS", periods },
    q2: { question: "Management commentary", summary: "Guidance cut on China weakness.", quotes: [{ text: "We are resetting the business.", by: "CEO" }] },
    q3: { question: "Holding estimate", values: { unitPrice: 70, quantity: 10, months: 12, annualRate: 8 } },
  },
};
const T = (content: Expr, role = "body"): Expr => ({ k: "Comp", name: "Text", args: [content, { k: "Str", v: role }] });
const path = (...keys: (string | number)[]): Expr => keys.reduce<Expr>((obj, key) => typeof key === "number" ? { k: "Index", obj, index: { k: "Num", v: key } } : { k: "Member", obj, field: key }, { k: "Ref", n: "d" });
const card = (...children: Expr[]): Expr => ({ k: "Comp", name: "Card", args: [{ k: "Arr", els: children }] });

const has = (reads: readonly DataPath[], ...wanted: DataPath[]) => wanted.every(w => reads.some(r => JSON.stringify(r) === JSON.stringify(w)));
const pack: ScreenPack = {
  expand(call) {
    if (call.name === "Quarter") {
      const [item] = call.args;
      if (!item) throw new Error("Quarter(item) needs a period");
      return card(T({ k: "Member", obj: item, field: "label" }, "footnote"), T({ k: "Member", obj: item, field: "eps" }, "headline"));
    }
    if (call.name === "Estimate") return { k: "Comp", name: "Stack", args: [{ k: "Str", v: "v" }, { k: "Num", v: 16 }, { k: "Arr", els: [{ k: "Comp", name: "Calculation", args: [path("answers", "q3", "values"), { k: "Arr", els: [T({ k: "Str", v: "Estimate" })] }] }] }] };
    return null;
  },
  evidenceOf: p => p[0] === "answers" && typeof p[1] === "string" && /^q\d+$/.test(p[1]) ? { question: p[1] as QuestionId, rest: p.slice(2) } : null,
  shows: (q, reads) => q === "q1" ? has(reads, ["periods", null, "eps"]) : q === "q2" ? has(reads, ["summary"]) : has(reads, ["values"]),
  listProblem: () => null,
  fallback: q => q === "q1"
    ? card({ k: "Comp", name: "Stack", args: [{ k: "Str", v: "v" }, { k: "Num", v: 12 }, { k: "Comp", name: "Each", args: [path("answers", "q1", "periods"), { k: "Str", v: "p" }, T({ k: "Member", obj: { k: "Ref", n: "p" }, field: "eps" })] }] })
    : q === "q2" ? card(T(path("answers", "q2", "summary"))) : card(T({ k: "Str", v: "Estimate unavailable" })),
  briefing: source => JSON.stringify(source.values),
  templates: "Quarter(period) · Estimate()",
};
const source = (over: Partial<ScreenSource> = {}): ScreenSource => ({
  run: "run1", request: "Nike's last 8 quarters and commentary", values,
  required: [{ id: "q1", text: "Last 8 quarters of EPS" }, { id: "q2", text: "Management commentary" }],
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
    const parsed = PARSER.parse(text);
    assert.deepEqual([parsed.meta.errors, parsed.meta.unresolved, parsed.meta.incomplete], [[], [], false], `invalid wire after:\n${chunk}`);
  } };
  return { hooks, text: () => text };
};

// 1. The writer's layout: a part with a template inside @Each and a sub-statement, then a second part.
{
  const live = wire();
  const screen = await compileScreen(source(), pack, scripted(`quarters = Section("Eight quarters", [quarters_list])
quarters_list = Stack("v", 12, @Each(d.answers.q1.periods, "p", Quarter(p)))
calls = Card([Text(d.answers.q2.summary, "body")])
`), live.hooks);
  assert.deepEqual(screen.parts.map(p => [p.id, [...p.statements.keys()], p.origin.kind]), [["pick1", ["pick1", "pick1_list"], "writer"], ["pick2", ["pick2"], "writer"]]);
  assert.deepEqual([...screen.coverage], [["q1", ["pick1"]], ["q2", ["pick2"]]]);
  assert.equal(screen.stats.fallbacks, 0);
  assert.equal(screen.stats.repairRounds, 0);
  assert.match(screen.program, /^root = Screen\(\[pick1, pick2\]\)\nd = Query/);
  assert.doesNotMatch(screen.program, /Quarter\(/, "templates expand to primitives");
  assert.equal(programTree(screen.program, values).nodes.filter(n => n.primitive === "Card").length, 9);
  assert.match(live.text(), /pick1_list = Show\(false, Divider\(\)\)/, "a sibling named before it is written streams as a placeholder");
}

// 2. A question the writer leaves out gets the pack's fallback part, after one repair attempt.
{
  const screen = await compileScreen(source(), pack, scripted(`calls = Card([Text(d.answers.q2.summary, "body")])\n`, ""));
  assert.equal(screen.stats.repairRounds, 1);
  assert.deepEqual(screen.parts.map(p => [p.id, p.origin]), [["pick1", { kind: "writer" }], ["pick2", { kind: "fallback", question: "q1" }]]);
}

// 3. Reading one quarter of eight does not show the question; the repair can fix it.
{
  const screen = await compileScreen(source({ required: [{ id: "q1", text: "Last 8 quarters of EPS" }] }), pack, scripted(
    `latest = Card([Text(d.answers.q1.periods[0].eps, "title1")])\n`,
    `history = Stack("v", 12, @Each(d.answers.q1.periods, "p", Text(p.eps, "body")))\n`));
  assert.equal(screen.stats.repairRounds, 1);
  assert.deepEqual(screen.parts.map(p => p.origin.kind), ["writer", "writer"]);
  assert.equal(screen.stats.fallbacks, 0);
}

// 4. Rejections: reserved names, literal data, chrome, input controls, actions, foreign refs, missing paths, unknown names.
{
  const issues: string[] = [];
  const screen = await compileScreen(source(), pack, scripted([
    `root = Screen([x])`,
    `bad1 = Card([Sparkline([1, 2, 3])])`,
    `bad2 = NavBar("Nike")`,
    `bad3 = Card([Calculation(d.answers.q3.values, [Text("x", "body")])])`,
    `bad4 = Card([Button("Buy", @OpenUrl("https://x.com"), "primary")])`,
    `bad5 = Card([calls])`,
    `bad6 = Card([Text(d.answers.q9.summary, "body")])`,
    `bad7 = Card([Fancy(d.subject)])`,
    `pick1 = Card([Text(d.subject.name, "body")])`,
    `bad8 = Card([Text(d.subject.name, "huge")])`,
  ].join("\n") + "\n", ""), { issue: issue => issues.push(`${issue.statementId}:${issue.code}`) });
  for (const expected of ["root:reserved-name", "bad1:type-mismatch", "bad2:template", "bad3:template", "bad4:template", "bad5:foreign-ref", "bad6:type-mismatch", "bad7:template", "pick1:locked-part", "bad8:type-mismatch"])
    assert.ok(issues.includes(expected), `expected ${expected} in ${issues.join(", ")}`);
  assert.equal(screen.stats.fallbacks, 2);
  assert.ok(!WRITER_PRIMITIVES.some(name => ["Screen", "NavBar", "Dock", "Calculation", "Slider", "Button", "IconButton", "Toggle", "Stepper", "ChoiceTags"].includes(name)));
}

// 5. Transport failure keeps finished parts; an unfinished part is dropped from the root.
{
  const screen = await compileScreen(source(), pack, scripted({ partial: `calls = Card([Text(d.answers.q2.summary, "body")])\nquarters = Section("Q", [quarters_list])\n` }));
  assert.deepEqual(screen.parts.map(p => [p.id, p.origin.kind]), [["pick1", "writer"], ["pick3", "fallback"]]);
  assert.equal(screen.stats.repairRounds, 0);
  assert.doesNotMatch(screen.program, /pick2/);
}

// 6. A template that builds a Calculation keeps it as its own named statement.
{
  const screen = await compileScreen(source({ required: [{ id: "q3", text: "Holding estimate" }] }), pack, scripted(`estimate = Estimate()\n`));
  assert.deepEqual([...screen.parts[0]!.statements.keys()], ["pick1", "pick1_calc1"]);
  assert.match(screen.program, /pick1 = Stack\("v", 16, \[pick1_calc1\]\)/);
}

// 7. Follow-up: kept parts stay byte for byte, an editable part is rewritten under its id, new parts continue the ids.
{
  const first = await compileScreen(source(), pack, scripted(`quarters = Stack("v", 12, @Each(d.answers.q1.periods, "p", Quarter(p)))\ncalls = Card([Text(d.answers.q2.summary, "body")])\n`));
  const stored = Object.fromEntries(first.parts.map(p => [p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))]));
  const base = Object.entries(stored).map(([id, statements]) => basePart(id as `pick${number}`, statements));
  const edit = await compileScreen(source({ base, editable: new Set(["pick2"]), required: [{ id: "q2", text: "Management commentary" }] }), pack,
    scripted(`pick2 = Card([Text(d.answers.q2.summary, "headline"), pick2_quotes])\npick2_quotes = Stack("v", 8, @Each(d.answers.q2.quotes, "c", Note(c.text)))\nextra = Card([Text(d.subject.name, "body")])\n`));
  // Every question is already shown, so the writer may rewrite pick2 but not add parts.
  assert.deepEqual(edit.parts.map(p => [p.id, p.origin.kind]), [["pick1", "kept"], ["pick2", "writer"]]);
  assert.ok(edit.stats.admitted === 2);
  assert.equal(printed(edit.parts[0]!.statements.get("pick1")!), printed(first.parts[0]!.statements.get("pick1")!));
  assert.match(edit.program, /pick2_quotes = Stack/);
}

// 7b. An editable part the writer leaves alone still shows its question; repeated required questions count once.
{
  const first = await compileScreen(source(), pack, scripted(`quarters = Stack("v", 12, @Each(d.answers.q1.periods, "p", Quarter(p)))\ncalls = Card([Text(d.answers.q2.summary, "body")])\n`));
  const base = first.parts.map(p => basePart(p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))));
  const edit = await compileScreen(source({ base, editable: new Set(["pick1", "pick2"]), required: [{ id: "q1", text: "q1" }, { id: "q1", text: "q1" }, { id: "q2", text: "q2" }] }), pack,
    scripted(`pick2 = Card([Text(d.answers.q2.summary, "headline")])\n`));
  assert.deepEqual(edit.parts.map(p => [p.id, p.origin.kind]), [["pick1", "kept"], ["pick2", "writer"]]);
  assert.equal(edit.stats.fallbacks, 0);
}

// 7c. Nothing to show and nothing editable: no writer call; a new question opens new parts.
{
  const first = await compileScreen(source(), pack, scripted(`calls = Card([Text(d.answers.q2.summary, "body")])\nquarters = Stack("v", 12, @Each(d.answers.q1.periods, "p", Quarter(p)))\n`));
  const base = first.parts.map(p => basePart(p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))));
  const idle = await compileScreen(source({ base, required: [] }), pack, async () => { throw new Error("the writer must not be called"); });
  assert.equal(idle.writerCalled, false);
  const added = await compileScreen(source({ base, required: [{ id: "q3", text: "Holding estimate" }] }), pack, scripted(`estimate = Estimate()\n`));
  assert.deepEqual(added.parts.map(p => [p.id, p.origin.kind]), [["pick1", "kept"], ["pick2", "kept"], ["pick3", "writer"]]);
}

// 7d. A revised answer reshaped under the same id: its old part reads data that is gone. The writer's rewrite keeps the
// part's place; with no rewrite the stale part is dropped and its question falls back, never shipped reading missing data.
{
  const first = await compileScreen(source(), pack, scripted(`quarters = Stack("v", 12, @Each(d.answers.q1.periods, "p", Quarter(p)))\ncalls = Card([Text(d.answers.q2.summary, "body")])\n`));
  const base = first.parts.map(p => basePart(p.id, Object.fromEntries([...p.statements].map(([name, expr]) => [name, printStatement(name, expr)]))));
  const reshaped = { ...values, answers: { ...values.answers, q1: { question: "Last 2 years of EPS", periods: values.answers.q1.periods.map(p => ({ year: p.label, eps: p.eps })) } } };
  const revision = source({ values: reshaped, base, editable: new Set(["pick1"]), required: [{ id: "q1", text: "Last 2 years of EPS" }] });
  const rewritten = await compileScreen(revision, pack, scripted(`pick1 = Stack("v", 12, @Each(d.answers.q1.periods, "p", Text(p.eps, "body")))\n`));
  assert.deepEqual(rewritten.parts.map(p => [p.id, p.origin.kind]), [["pick1", "writer"], ["pick2", "kept"]]);
  const left = await compileScreen(revision, pack, scripted(""));
  assert.deepEqual(left.parts.map(p => [p.id, p.origin.kind]), [["pick2", "kept"], ["pick3", "fallback"]]);
  assert.doesNotMatch(left.program, /pick1/);
}

// 8. Statement splitting survives brackets and quoted newlines.
{
  const stream = new StatementStream();
  assert.deepEqual([...stream.push('a = Card([Text("x\\ny",\n"body")])\nb = Card(['), ...stream.push("Divider()])\n"), ...stream.end()], ['a = Card([Text("x\\ny",\n"body")])', "b = Card([Divider()])"]);
}

function printed(expr: Expr): string { return printExpr(expr); }
console.log("check:compiler ok");
