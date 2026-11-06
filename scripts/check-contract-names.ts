/**
 * Contract names can't collide with the server's: every rule derives from SPORTS_COMPONENTS, the
 * registry in src/sports/names.ts and the fixture samples, so a new contract is covered unedited.
 * 1. No contract path uses a frame name at any segment, and shared names keep their kind.
 * 2. Shared names hold only their allowed values, anywhere in any sample.
 * 3. Every contract fits the data path limit at the deepest nesting allowed (NEST_DEPTH).
 * 4. A correct record survives the dataset stage at the top level, at depth 1 and at NEST_DEPTH:
 *    not rejected, not overwritten, and the frame stays the server's.
 * 5. When the design fails and the raw answer is kept, every sample still fits its component.
 */
import assert from "node:assert/strict";
import { designDataset, inferFields } from "../src/sports/dataset.js";
import { MAX_PATH_SEGMENTS, type DataField } from "../src/research/dataset-schema.js";
import { SPORTS_COMPONENTS, fits } from "../src/sports/components.js";
import { contractNameProblems, NEST_DEPTH, RESERVED, type ReservedName } from "../src/sports/names.js";
import type { SportsPlan } from "../src/sports/plan.js";
import type { MockValue } from "../src/research/dataset-schema.js";
import { fixtureSuite } from "./openui-fixtures.js";

const problems: string[] = [];

// 1. Names.
for (const component of SPORTS_COMPONENTS) for (const field of component.contract) problems.push(...contractNameProblems(component.name, field));

// 2. Values.
const fixtures = fixtureSuite().fixtures;
const recordOf = (fixture: (typeof fixtures)[number]) => ((fixture.dataset.result as { answers: { q1: { record?: MockValue } } }).answers.q1.record);
const domains = Object.entries(RESERVED as Record<string, ReservedName>).flatMap(([name, entry]) => entry.role === "shared" && entry.values ? [[name, entry.values] as const] : []);
const walkValues = (value: unknown, path: string, key: string): void => {
  if (Array.isArray(value)) { value.forEach((item, i) => walkValues(item, `${path}[${i}]`, key)); return; }
  if (!value || typeof value !== "object") return;
  for (const [name, child] of Object.entries(value)) {
    const domain = domains.find(([reserved]) => reserved === name)?.[1];
    if (domain && typeof child === "string" && !domain.includes(child)) problems.push(`${key} ${path}.${name}: "${child}" is not ${domain.map(v => `"${v}"`).join(" or ")}; \`${name}\` means ${RESERVED[name as keyof typeof RESERVED].meaning}.`);
    walkValues(child, `${path}.${name}`, key);
  }
};
for (const fixture of fixtures) {
  const record = recordOf(fixture);
  if (record !== undefined) walkValues(record, "record", fixture.key);
}

// 3. Depth budget: answers.qN, the nesting, then the contract's own path.
for (const component of SPORTS_COMPONENTS) {
  const deepest = Math.max(...component.contract.map(field => field.path.split(".").length));
  if (2 + NEST_DEPTH + deepest > MAX_PATH_SEGMENTS) problems.push(`${component.name}: ${deepest}-segment paths at NEST_DEPTH ${NEST_DEPTH} need ${2 + NEST_DEPTH + deepest} segments; raise MAX_PATH_SEGMENTS (${MAX_PATH_SEGMENTS}) in src/research/dataset-schema.ts or lower NEST_DEPTH`);
}

// 4. Round trip through the dataset stage, with the fields a correct designer declares: the
// sample's own, plus the contract's fields under a list the sample leaves empty.
const FRAME = { status: "complete", question: "What does the check ask?", title: "Server title", source: "Source: check", asOf: "2026-11-06" } as const;
const DEPTHS: readonly (readonly string[])[] = [[], ["record"], [...Array.from({ length: NEST_DEPTH - 1 }, (_, i) => `level${i + 1}`), "record"]];
const plan: SportsPlan = { subject: { kind: "topic", name: "Contract names", league: null, season: "2026/27" }, questions: [{ id: "q1", text: FRAME.question, source: "web", searchQueries: [] }] };
const nest = (keys: readonly string[], value: MockValue): MockValue => keys.reduceRight<MockValue>((inner, key) => ({ [key]: inner }), value);
const changes = (before: unknown, after: unknown, path: string): string[] => {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object") return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => changes((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], `${path}.${key}`));
  return [`${path} ${JSON.stringify(before)} -> ${JSON.stringify(after)}`];
};
const at = (value: unknown, keys: readonly string[]) => keys.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), value);

function designedFields(component: (typeof SPORTS_COMPONENTS)[number], keys: readonly string[], content: MockValue): DataField[] {
  const fields = inferFields(content, "");
  const known = new Set(fields.map(field => field.path));
  const prefix = keys.length ? `${keys.join(".")}.` : "";
  for (const field of component.contract) {
    const path = `${prefix}${field.path}`;
    // A list of plain values (no item fields in the contract) is declared as its items.
    if (field.kind === "list" && !component.contract.some(f => f.path.startsWith(`${field.path}[]`))) {
      if (!known.has(`${path}[]`)) fields.push({ path: `${path}[]`, kind: "text", format: "none" });
      continue;
    }
    if (field.kind === "list" || known.has(path) || fields.some(f => f.path.startsWith(`${path}.`) || f.path.startsWith(`${path}[]`))) continue;
    fields.push(field.kind === "number" ? { path, kind: "number", format: "decimal" } : { path, kind: field.kind === "boolean" ? "boolean" : "text", format: "none" });
  }
  // An empty list's placeholder item gives way to the item fields the contract names.
  return fields.filter(field => !fields.some(other => other.path.startsWith(`${field.path}.`)));
}

for (const component of SPORTS_COMPONENTS) {
  const sample = fixtures.find(f => f.key === `${component.name}/full`);
  assert.ok(sample, `${component.name} has no full sample`);
  const record = recordOf(sample)!;
  for (const keys of DEPTHS) {
    const content = nest(keys, record) as Record<string, MockValue>;
    const rejected: string[] = [];
    const design = { id: "q1", title: FRAME.title, fields: designedFields(component, keys, content), valuesJson: JSON.stringify(content) };
    const result = await designDataset(plan, { q1: { ...FRAME, ...content } }, "web", new Date("2026-11-06"), { rejected: (_, problem) => rejected.push(problem) },
      async () => ({ model: "check", finishReason: "stop" as const, text: JSON.stringify({ answers: [design] }), usage: { promptTokens: 0, completionTokens: 0, costUSD: 0 } }));
    const where = `${component.name} at ${keys.join(".")}`;
    if (rejected.length) { problems.push(`${where}: rejected: ${rejected.join("; ")}`); continue; }
    const answer = (result.values.answers as Record<string, Record<string, unknown>>).q1!;
    const placed = keys.length ? at(answer, keys) : Object.fromEntries(Object.keys(record as Record<string, MockValue>).map(key => [key, answer[key]]));
    try { assert.deepEqual(placed, record); } catch { problems.push(`${where}: the dataset stage changed the record: ${changes(record, placed, "record").slice(0, 3).join("; ")}`); }
    for (const [name, value] of Object.entries(FRAME)) if (name !== "question" && answer[name] !== value) problems.push(`${where}: the frame's ${name} became ${JSON.stringify(answer[name])}`);
  }
}

// 5. The fallback path: no design comes back, so the raw answer is kept with inferred fields.
for (const component of SPORTS_COMPONENTS) for (const fixture of fixtures.filter(f => f.key.startsWith(`${component.name}/`))) {
  const record = recordOf(fixture)!;
  const result = await designDataset(plan, { q1: { ...FRAME, record } }, "web", new Date("2026-11-06"), {},
    async () => ({ model: "check", finishReason: "stop" as const, text: JSON.stringify({ answers: [] }), usage: { promptTokens: 0, completionTokens: 0, costUSD: 0 } }));
  const answer = (result.values.answers as Record<string, Record<string, MockValue>>).q1!;
  if (!fits(component, answer.record)) problems.push(`${fixture.key}: the raw answer no longer fits ${component.name}: ${changes(record, answer.record, "record").slice(0, 3).join("; ")}`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else console.log(`Contract names: ${SPORTS_COMPONENTS.length} contracts, ${fixtures.length} fixtures, ${DEPTHS.length} depths`);
