import type { DataPath, DatasetValues, QuestionId, ScreenPack, ScreenSource } from "../lang/compiler.js";
import { each, exprOfRef, nodeOf, refAt, ui, type Expr, type Node } from "../lang/program.js";
import { COMPONENT_SIGNATURES, placementCall, placements, SPORTS_TEMPLATES, type SportsComponent } from "./components.js";
import { isFrameName, LABEL_NAMES, ROOT_NAMES } from "./names.js";

/**
 * The sports screen pack: answers live at `d.answers.<id>`; a question is shown when a part reads
 * its content (or its note, when unavailable); the default part is a generic card built from the
 * answer's own shape, or the component call its record fits.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRef = any;
type Answer = Record<string, unknown>;

const answerOf = (values: DatasetValues, q: QuestionId): Answer | undefined => ((values.answers ?? {}) as Record<string, Answer>)[q];
const at = (q: QuestionId, ...keys: string[]): Expr => ["answers", q, ...keys].reduce<Expr>((obj, field) => ({ k: "Member", obj, field }), { k: "Ref", n: "d" });
const ref = (q: QuestionId, ...keys: string[]): AnyRef => refAt(at(q, ...keys));

function shows(q: QuestionId, reads: readonly DataPath[], values: DatasetValues): boolean {
  const answer = answerOf(values, q);
  if (!answer) return true;
  if (answer.status === "unavailable") return reads.some(path => path[0] === "note");
  // A label name only labels when it holds a name: a record or a list under `team` is content.
  const labels = (key: string) => LABEL_NAMES.has(key) && (typeof answer[key] !== "object" || answer[key] === null);
  // Its facts were locked to another answer: nothing is left here to show.
  if (Object.keys(answer).every(labels)) return true;
  return reads.some(path => typeof path[0] === "string" && !labels(path[0]));
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
/** A component called by name, as the writer would: `MatchCard(d.answers.q1.match)`. */
const callOf = (component: SportsComponent, data: AnyRef): Node => nodeOf({ k: "Comp", name: component.name, args: [exprOfRef(data)] });
const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());

/** The default part: title, summary, scalar facts as rows, the first list as rows, and the source. */
function fallback(q: QuestionId, values: DatasetValues): Expr {
  const answer = answerOf(values, q);
  if (!answer || answer.status === "unavailable") return ui.Note({ title: ref(q, "title"), text: ref(q, "note"), tone: "warn" }).expr;
  const footnote = typeof answer.source === "string" && answer.source ? [ui.Text({ content: ref(q, "source"), role: "footnote", ink: "tertiary" })] : [];
  // An answer shaped for a Sports component shows as that component.
  // Not a club's name line, though, when the answer has more to say than which club it is about.
  const hasContent = Object.keys(answer).some(key => !ROOT_NAMES.has(key));
  const placed = placements(answer).find(p => !(hasContent && p.keys[0] === "team"));
  if (placed) {
    const data = ref(q, ...placed.keys);
    const body = placed.list ? ui.Stack({ axis: "v", gap: 12, children: each(data, "x", (x: AnyRef) => callOf(placed.component, x)) }) : callOf(placed.component, data);
    return ui.Stack({ axis: "v", gap: 12, children: [ui.Text({ content: ref(q, "title"), role: "headline", weight: "semibold" }), body, ...footnote] }).expr;
  }
  const children: Node[] = [ui.Text({ content: ref(q, "title"), role: "headline", weight: "semibold" })];
  if (typeof answer.summary === "string" && answer.summary) children.push(ui.Text({ content: ref(q, "summary"), role: "body" }));
  const content = Object.entries(answer).filter(([key]) => !isFrameName(key));
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
    // Up to two more text fields, so a row of words (a source and its projected position) keeps its point.
    const [detail, extra] = Object.keys(first).filter(k => k !== title?.[0] && typeof first[k] === "string" && first[k]);
    if (title) {
      children.push(ui.Stack({ axis: "v", gap: 12, divided: true, children: each(ref(q, key), "item", (item: AnyRef) => ui.Row({
        title: member(item, title),
        ...(detail ? { subtitle: item[detail] } : {}),
        ...(number ? { trailing: ui.Number({ value: member(item, number), format: "decimal", role: "body" }) } : extra ? { trailing: ui.Text({ content: item[extra], role: "body", weight: "medium" }) } : {}),
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
data-shape candidates (choose by relevance to the request, not by order):
${placements(a).map(p => `- ${placementCall(p, `d.answers.${id}`)}\n  Use for ${p.component.useWhen}.`).join("\n") || "- none; compose requested content from primitives"}
data: ${JSON.stringify(preview(a))}`).join("\n\n")}`;
}

/**
 * A hand-built home and away table where TeamPoints fits is refused: the writer's copy loses the
 * card's total and rank. Anything that calls TeamPoints, or reads other fields, is fine.
 */
function refuses(statement: Expr, values: DatasetValues): string | null {
  const answers = (values.answers ?? {}) as Record<string, Answer>;
  const cards = Object.entries(answers).flatMap(([id, answer]) => placements(answer).filter(p => p.component.name === "TeamPoints" && !p.list).map(p => `d.answers.${id}.${p.keys.join(".")}`));
  if (!cards.length) return null;
  const dotted = (node: Record<string, unknown>): string | null => node.k === "Ref" ? String(node.n) : node.k === "Member" && isObject(node.obj) ? (base => base && `${base}.${String(node.field)}`)(dotted(node.obj)) : null;
  let found: string | null = null;
  const walk = (node: unknown): void => {
    if (found) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!isObject(node)) return;
    if (node.k === "Comp" && node.name === "TeamPoints") return;
    const path = dotted(node);
    if (path) { found = cards.find(card => path.startsWith(`${card}.home`) || path.startsWith(`${card}.away`)) ?? null; return; }
    Object.values(node).forEach(walk);
  };
  walk(statement);
  return found ? `This reads the home and away record by hand. Call TeamPoints(${found}) instead: it is the card for home, away and total points.` : null;
}

export const SPORTS_SCREEN: ScreenPack = {
  tool: "sports_dataset",
  /** The Sports components (MatchCard(d.answers.q1.match), …) as templates. */
  definitions: SPORTS_TEMPLATES,
  evidenceOf: path => path[0] === "answers" && typeof path[1] === "string" && /^q\d+$/.test(path[1]) ? { question: path[1] as QuestionId, rest: path.slice(2) } : null,
  shows,
  refuses,
  listProblem: () => null,
  fallback,
  briefing,
  templates: `Sports component relevance: first identify whose facts the user requested, which facts, and whether they describe one game, a season, a comparison or a history. Read the original request before selecting any candidate. Rephrased questions and extra feed data do not authorize extra content. A specific player's game or season statistics belong in StatsCard with that player's stat record. For one game's performance, show that game's MatchCard first when the data has the game's record, then StatsCard(record, false): the game card already says who played, so only the stat rail shows. Keep the header (null) when the rating is one of the requested stats or there is no game record. Otherwise MatchCard answers a game result, not a player's performance: include it only when the result or fixture is requested. For each other fact group, use the component whose Use for definition directly matches it. A comparison across season totals belongs in MetricBars; period-by-period values belong in PlayerMetrics or PlayersMetric. Once a component directly answers the fact group, use its call and move to the next requested fact group. Use primitives only when no component can express that content. Render every item of a match's statBars with StatBar. Each comparison keeps its split bar, including shots, corners, saves, fouls, and cards. Do not substitute Progress or a row of figures. Call the selected component with a record that has every field it reads. The briefing lists data-shape candidates with their use rules, not preselected components. Lock every fact to one place: however the questions overlap, show each figure or record once on the screen, never again in another part. Names, titles and descriptions wrap: give their Text lines 2, never lines 1. A Text that reads a summary or a note has no lines: it shows in full. Data an answer lacks is skipped: write no Note or Text saying it is missing (an answer whose status is unavailable still shows its note), and type no figure, name or source of your own: read them from d. Prefer icon-led compact rows to tables and plain lists. When each item is a named thing with a short detail (a trophy, an award, an honour, a fact), draw it as an icon then compact text, in a Stack("v", 16) with no Card and no dividers: Stack("h", 12, [Icon(symbol, 24, accent), Stack("v", 0, [Stack("h", 4, [Text(x.count, "body", "semibold"), Text(x.name, "body", null, null, 2)]), Text(x.detail, "body", null, "secondary", 2)])], "start"). For goal scorers and assists, read scorerPlayer and assistPlayer records for their name and Avatar. Never borrow a photo from another list by numeric position. A missing player photo omits the Avatar while keeping the text. Every player or club on the screen shows its available mark beside its name: a record with kind "player" or "club" gets Avatar(x.name, 40, x.logo, null, null, x.color, x.kind), in a row, a list or a card, so a photo or crest shows wherever the name does. In the icon-led rows that Avatar replaces the icon. Otherwise pick one SF Symbol for what the items are ("trophy.fill" for trophies and awards, "medal.fill" for medals, "star.fill" for selections) and one accent ink that suits it ("yellow" for a trophy). No column headers or labels: the name and one short secondary line carry it. Use RecordTable only when the items share several figures in columns. Every text on the screen says something new: never show the same title, label or sentence twice, such as a Section title and a list title, or a title and a summary that restates it. When two texts would say the same thing, show one. Prefer less text: a short title and the data, not sentences repeating what the data shows. Keep the parts in the order the user asked for them. Keep a part under 16 statements by calling components and writing small pieces inline.\n${COMPONENT_SIGNATURES}`,
};
