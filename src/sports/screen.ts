import type { DataPath, DatasetValues, QuestionId, ScreenPack, ScreenSource } from "../lang/compiler.js";
import { each, refAt, ui, type Expr, type Node } from "../lang/program.js";
import { COMPONENT_BY_NAME, COMPONENT_SIGNATURES, placementCall, placements } from "./components.js";
import { BASE_FIELDS } from "./dataset.js";

/**
 * The sports screen pack: answers live at `d.answers.<id>`; a question is shown when a part reads
 * its content (or its note, when unavailable); the default part is a generic card built from the
 * answer's own shape. No templates yet: the writer composes from primitives.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRef = any;
type Answer = Record<string, unknown>;

const answerOf = (values: DatasetValues, q: QuestionId): Answer | undefined => ((values.answers ?? {}) as Record<string, Answer>)[q];
const at = (q: QuestionId, ...keys: string[]): Expr => ["answers", q, ...keys].reduce<Expr>((obj, field) => ({ k: "Member", obj, field }), { k: "Ref", n: "d" });
const ref = (q: QuestionId, ...keys: string[]): AnyRef => refAt(at(q, ...keys));
const NOT_CONTENT = new Set<string>(["status", "question", "title", "source", "asOf"]);

function shows(q: QuestionId, reads: readonly DataPath[], values: DatasetValues): boolean {
  const answer = answerOf(values, q);
  if (!answer) return true;
  if (answer.status === "unavailable") return reads.some(path => path[0] === "note");
  return reads.some(path => typeof path[0] === "string" && !NOT_CONTENT.has(path[0]));
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const LABEL_KEYS = ["name", "label", "title", "player", "short", "abbreviation", "opponent", "date"];

/** A path inside a list item to the first value matching `test`, preferring label-like keys, one level of nesting deep. */
function find(item: Record<string, unknown>, test: (v: unknown) => boolean): string[] | null {
  const keys = [...LABEL_KEYS.filter(k => k in item), ...Object.keys(item).filter(k => !LABEL_KEYS.includes(k))];
  for (const key of keys) if (test(item[key])) return [key];
  for (const key of keys) {
    const child = item[key];
    if (isObject(child)) { const inner = find(child, test); if (inner) return [key, ...inner]; }
  }
  return null;
}
const member = (base: AnyRef, path: readonly string[]): AnyRef => path.reduce((r, key) => r[key], base);
const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());

/** The default part: title, summary, scalar facts as rows, the first list as rows, and the source. */
function fallback(q: QuestionId, values: DatasetValues): Expr {
  const answer = answerOf(values, q);
  if (!answer || answer.status === "unavailable") return ui.Note({ title: ref(q, "title"), text: ref(q, "note"), tone: "warn" }).expr;
  const footnote = typeof answer.source === "string" && answer.source ? [ui.Text({ content: ref(q, "source"), role: "footnote", ink: "tertiary" })] : [];
  // An answer shaped for a Sports component shows as that component.
  const placed = placements(answer)[0];
  if (placed) {
    const data = ref(q, ...placed.keys);
    const body = placed.list ? ui.Stack({ axis: "v", gap: 12, children: each(data, "x", (x: AnyRef) => placed.component.build(x, [])) }) : placed.component.build(data, []);
    return ui.Stack({ axis: "v", gap: 12, children: [ui.Text({ content: ref(q, "title"), role: "headline", weight: "semibold" }), body, ...footnote] }).expr;
  }
  const children: Node[] = [ui.Text({ content: ref(q, "title"), role: "headline", weight: "semibold" })];
  if (typeof answer.summary === "string" && answer.summary) children.push(ui.Text({ content: ref(q, "summary"), role: "body" }));
  const content = Object.entries(answer).filter(([key]) => !(BASE_FIELDS as readonly string[]).includes(key));
  const scalars = content.filter(([, v]) => typeof v === "string" || typeof v === "number").slice(0, 6);
  // KeyValue takes text only: numbers go in a row with a Number on the right.
  if (scalars.length) children.push(ui.Stack({ axis: "v", gap: 8, children: scalars.map(([key, v]) => typeof v === "number"
    ? ui.Row({ title: humanize(key), trailing: ui.Number({ value: ref(q, key), format: "decimal", role: "body" }) })
    : ui.KeyValue({ label: humanize(key), value: ref(q, key) })) }));
  const list = content.find(([, v]) => Array.isArray(v) && v.length > 0 && v.every(isObject));
  if (list) {
    const [key, items] = list as [string, Record<string, unknown>[]];
    const first = items[0]!;
    const title = find(first, v => typeof v === "string" && v.length > 0);
    const number = find(first, v => typeof v === "number");
    if (title) {
      children.push(ui.Stack({ axis: "v", gap: 12, divided: true, children: each(ref(q, key), "item", (item: AnyRef) => ui.Row({
        title: member(item, title),
        ...(number ? { trailing: ui.Number({ value: member(item, number), format: "decimal", role: "body" }) } : {}),
      })) }));
    }
  }
  children.push(...footnote);
  return ui.Card({ children }).expr;
}

/**
 * Long lists trimmed for the prompt; the writer reads paths, not every value. A trimmed list stays a
 * list, with a marker for the items left out, so it never reads as an object with `first` and `last` keys.
 */
export function preview(value: unknown): unknown {
  if (Array.isArray(value)) return value.length > 6 ? [...value.slice(0, 3).map(preview), `… ${value.length - 4} more items …`, preview(value.at(-1))] : value.map(preview);
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, preview(v)]));
  return typeof value === "string" && value.length > 160 ? `${value.slice(0, 157)}…` : value;
}

function briefing(source: ScreenSource): string {
  const answers = (source.values.answers ?? {}) as Record<string, Answer>;
  const clubs = source.values.clubs as Answer[] | undefined;
  const clubLines = clubs?.length ? `# d.clubs (the clubs this screen is about: ESPN id, names, colour "#rrggbb", logo)\n${JSON.stringify(clubs)}\n\n` : "";
  const required = new Set(source.required.map(q => q.id));
  return `${clubLines}# Answers\n${Object.entries(answers).map(([id, a]) => `## d.answers.${id}${required.has(id as QuestionId) ? " (must be shown)" : ""}
question: ${String(a.question ?? "")}
status: ${String(a.status ?? "complete")}${a.note ? ` · note (show it): ${String(a.note)}` : ""}${a.source ? ` · show its source line (d.answers.${id}.source) as a footnote` : ""}
components that fit: ${placements(a).map(p => placementCall(p, `d.answers.${id}`)).join(" · ") || "none"}
data: ${JSON.stringify(preview(a))}`).join("\n\n")}`;
}

export const SPORTS_SCREEN: ScreenPack = {
  tool: "sports_dataset",
  /** A Sports component call (MatchCard(d.answers.q1.match), …) as primitives. */
  expand: call => {
    const component = COMPONENT_BY_NAME.get(call.name);
    if (!component) return null;
    const [data, ...rest] = call.args;
    if (!data || !["Ref", "RuntimeRef", "Member", "Index"].includes(data.k)) throw new Error(`${call.name} takes a data reference first (d.<path> or an @Each item)`);
    if (rest.length > component.params.length) throw new Error(`${call.name} takes only its data record`);
    return component.build(refAt(data), []).expr;
  },
  evidenceOf: path => path[0] === "answers" && typeof path[1] === "string" && /^q\d+$/.test(path[1]) ? { question: path[1] as QuestionId, rest: path.slice(2) } : null,
  shows,
  listProblem: () => null,
  fallback,
  briefing,
  templates: `Sports components: call one with a record that has every field it reads (the briefing lists where they fit), or copy its structure.\n${COMPONENT_SIGNATURES}`,
};
