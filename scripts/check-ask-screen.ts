import assert from "node:assert/strict";
import { programTree } from "../src/lang/tree.js";
import { STOCKS_SCREEN } from "../src/stocks/lang/screen.js";
import { compileScreen, type QuestionId } from "../src/lang/compiler.js";

/** The stocks pack's defaults: every lookup's default part, complete, partial and unavailable, is a valid program. */

const periods = Array.from({ length: 8 }, (_, i) => ({ ticker: "NKE", name: "NIKE, Inc.", context: `Reported · Q${(i % 4) + 1}`, when: "NKE", summary: "Revenue $11B", watch: "", hasWatch: false, source: "Source: x.com",
  stats: [{ label: "Revenue", value: "$11B" }, { label: "EPS", value: "$0.5" }], label: `Q${(i % 4) + 1} FY${25 + Math.floor(i / 4)}`, reportedOn: "", measures: { revenue: { display: "$11B", value: 11, tone: "neutral" }, eps: { display: "$0.5", value: 0.5, tone: "neutral" } } }));
const values = {
  subject: { ticker: "NKE", name: "NIKE, Inc." },
  answers: {
    q1: { question: "Last 8 quarters", lookup: "quarters", status: "partial", note: "Guidance is not stated for every quarter.", source: "Source: x.com", title: "NIKE: last 8 quarters", columns: [{ key: "revenue", label: "Revenue" }, { key: "eps", label: "EPS" }], periods, series: {} },
    q2: { question: "Commentary", lookup: "web", status: "complete", note: "", source: "Source: x.com", title: "Commentary", summary: "Guidance cut.", columns: [], rows: [], seriesLabel: "", series: [], facts: [{ label: "CEO", value: "Reset", detail: "Q1 call" }], quotes: [{ text: "We are resetting.", by: "CEO" }], hasTable: false, hasSeries: false, hasFacts: true, hasQuotes: true },
    q3: { question: "Funds holding it", lookup: "fundHolders", status: "unavailable", note: "13F data is not available.", source: "" },
  },
};
const required = (["q1", "q2", "q3"] as QuestionId[]).map(id => ({ id, text: id }));
let skeletons = 0;
const screen = await compileScreen({ run: "r", request: "x", values, required, base: [], editable: new Set(), explicitLayout: null }, STOCKS_SCREEN,
  async () => ({ text: "", usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cost: 0 } }), { skeleton: () => skeletons++ });
assert.equal(skeletons, 1);
assert.deepEqual(screen.parts.map(p => p.origin.kind), ["fallback", "fallback", "fallback"]);
assert.deepEqual([...screen.coverage.values()].map(ids => ids.length), [1, 1, 1]);
assert.match(screen.program, /d\.answers\.q1\.note/, "a partial answer shows its note");
assert.match(screen.program, /d\.answers\.q3\.note/, "an unavailable answer shows why");
programTree(screen.program, values);

// The writer may call a registered card per quarter: EarningsCard(p) over the periods shows every quarter.
const written = await compileScreen({ run: "r", request: "x", values, required: [{ id: "q1", text: "q1" }], base: [], editable: new Set(), explicitLayout: null }, STOCKS_SCREEN,
  async (_m, emit) => { const text = `quarters = Stack("v", 16, [quarters_note, quarters_cards])\nquarters_note = Note(d.answers.q1.note, "warn")\nquarters_cards = Rail(12, @Each(d.answers.q1.periods, "p", EarningsCard(p)), 280)\n`; emit(text); return { text, usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cost: 0 } }; });
assert.deepEqual(written.parts.map(p => p.origin.kind), ["writer"]);
assert.doesNotMatch(written.program, /EarningsCard/);
console.log("check:ask-screen ok");
