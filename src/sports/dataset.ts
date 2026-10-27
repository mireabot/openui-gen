import { z } from "zod";
import { config } from "../config.js";
import { anthropicSender } from "../llm/anthropic.js";
import { structuredCompletion, type CompletionSender, type StructuredCompletionHooks } from "../llm/structured-completion.js";
import { DATA_FORMATS, dataShape, validateValues, type DataField, type MockValue } from "../research/dataset-schema.js";
import type { SnapshotDataset } from "../lang/snapshots.js";
import { COMPONENT_CONTRACTS } from "./components.js";
import type { SportsPlan } from "./plan.js";
import type { PlayerProfile } from "./fotmob.js";

/**
 * The schema stage (Opus, SPORTS_MODEL): from every answer it designs the fields the screen needs
 * and their values, selecting, ordering and deriving from the data it was given (a top five, a
 * W/D/L string, a points gap) and never adding figures. The server validates every field and value
 * (dataShape, validateValues); a question whose design fails keeps its raw answer with inferred
 * fields, so a schema mistake costs polish, not the screen.
 */

/** Fields every answer carries, set by the server: the writer reads them, the schema stage may not redefine them. */
export const BASE_FIELDS = ["status", "question", "title", "summary", "note", "source", "asOf"] as const;
/** Kinds the schema stage may use: colours, icons and images are tokens in this dataset model, and ESPN logos are URLs (text). */
const KINDS = ["text", "number", "boolean", "date", "status", "object", "list"] as const;

const Design = z.object({
  answers: z.array(z.object({
    id: z.string(),
    title: z.string(),
    fields: z.array(z.object({ path: z.string(), kind: z.enum(KINDS), format: z.enum(DATA_FORMATS) }).strict()),
    /** The values as one JSON object; structured outputs cannot type free-form values. */
    valuesJson: z.string(),
  }).strict()),
}).strict();

export const SCHEMA_SYSTEM = `You design the dataset a mobile sports screen reads. For each answer, return the fields the screen needs and their values.
Use only the data given: select, order, trim and derive (a top five, a points gap, a form string such as "WWDLW", a goal difference), but never add a figure, name or date that is not in the data.
fields: flat paths relative to the answer, lowerCamel segments, "[]" for list items (e.g. "table[].team.name", "table[].points", "leader.name"). A list path names its items' fields, never the list itself. Kinds: text, number (format integer, count, decimal or percent 0–100), boolean, date (format day or month; ISO dates), status (good, warn, bad or neutral), object and list are implied by paths. Every other kind uses format "none". Logos and URLs are text.
Do not define these fields; the server adds them: ${BASE_FIELDS.join(", ")}.
valuesJson: one JSON object with exactly those fields. A number or date the data does not have is null. Lists hold at most 20 items.
title: a short heading for the answer, e.g. "Premier League table", "Chelsea's season".

Sports components. When an answer suits one, shape the answer (a field of it, or a list's items) to its contract exactly, field for field, so the screen can show it with that component: a match → a MatchCard record, a run of results → a FixturesHeatmap record, two clubs compared on a stat → one StatBar record per stat in a list, a ranking → a Leaderboard record, a player's or a club's figures → a StatsCard record. Every contract field is present: text "" and lists [] when the data has nothing. Colours: take each club's "#rrggbb" and logo from the clubs list in the input, matched by club name; "" for a club not in it. Player photos: match the verified players list by full player name and use its imageUrl for a player's logo. Never use the club crest as a player photo or invent an image URL. Keep each player's full name in its record so the server can attach the verified image.
${COMPONENT_CONTRACTS}`;

const PATH = /^[a-z][A-Za-z0-9]*(?:\[\])?(?:\.[a-z][A-Za-z0-9]*(?:\[\])?)*$/;

/**
 * One value standing for a list's items: objects merged key by key (first non-null wins), so an
 * item with a null score does not hide the number a later item has.
 */
function representative(items: readonly MockValue[]): MockValue {
  const present = items.filter(item => item !== null && item !== undefined);
  if (!present.length) return null;
  if (!present.every(item => item && typeof item === "object" && !Array.isArray(item))) return present[0]!;
  const merged: Record<string, MockValue> = {};
  for (const item of present as Record<string, MockValue>[]) for (const [key, child] of Object.entries(item)) {
    const known = merged[key];
    if (known === undefined || known === null) merged[key] = Array.isArray(child) && Array.isArray(known) ? [...known, ...child] : child;
    else if (Array.isArray(known) && Array.isArray(child)) merged[key] = [...known, ...child];
  }
  return merged;
}

/** Fields for raw values, inferred from their shape (the fallback when a design fails). */
export function inferFields(value: MockValue, prefix: string): DataField[] {
  if (Array.isArray(value)) return value.length ? inferFields(representative(value), `${prefix}[]`) : [];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => (PATH.test(key) ? inferFields(child, prefix ? `${prefix}.${key}` : key) : []));
  if (typeof value === "number") return [{ path: prefix, kind: "number", format: Number.isInteger(value) ? "integer" : "decimal" }];
  if (typeof value === "boolean") return [{ path: prefix, kind: "boolean", format: "none" }];
  // Never published: a nullable number validates as unknown, where a text null would not.
  if (value === null) return [{ path: prefix, kind: "number", format: "decimal" }];
  return [{ path: prefix, kind: "text", format: "none" }];
}

/** Base fields present on an answer, as text. */
const baseFields = (answer: Record<string, MockValue>, id: string): DataField[] =>
  BASE_FIELDS.filter(key => key in answer).map(key => ({ path: `answers.${id}.${key}`, kind: "text", format: "none" }));

/** Lists longer than this are trimmed by the schema stage; the validator allows a full season. */
const LIST_MAX = 40;

/** Raw values as they came, keeping only keys that yield fields (an empty list declares nothing). */
function rawAnswer(answer: Record<string, MockValue>, id: string): { fields: DataField[]; values: Record<string, MockValue> } {
  const content: Record<string, MockValue> = {};
  const fields: DataField[] = [];
  for (const [key, value] of Object.entries(answer)) {
    if ((BASE_FIELDS as readonly string[]).includes(key) || !PATH.test(key)) continue;
    const found = inferFields(value, `answers.${id}.${key}`);
    if (!found.length) continue;
    content[key] = Array.isArray(value) ? value.slice(0, LIST_MAX) : value;
    fields.push(...found);
  }
  return { fields, values: { ...content, ...Object.fromEntries(BASE_FIELDS.filter(k => k in answer).map(k => [k, answer[k]!])) } };
}

function scorerAnswer(answer: Record<string, MockValue>, id: string): ReturnType<typeof rawAnswer> {
  const result = rawAnswer(answer, id);
  if (Array.isArray(answer.scorers) && !answer.scorers.length) {
    result.values.scorers = [];
    result.fields.push(...["name", "espnId", "team"].map(key => ({ path: `answers.${id}.scorers[].${key}`, kind: "text", format: "none" } satisfies DataField)),
      { path: `answers.${id}.scorers[].goals`, kind: "number", format: "integer" });
  }
  const leaderboard = answer.leaderboard;
  if (leaderboard && typeof leaderboard === "object" && !Array.isArray(leaderboard) && Array.isArray(leaderboard.entries) && !leaderboard.entries.length) {
    result.fields.push(...["name", "detail", "value", "logo", "color"].map(key => ({ path: `answers.${id}.leaderboard.entries[].${key}`, kind: "text", format: "none" } satisfies DataField)));
  }
  return result;
}

/** Throws when values do not match their fields. */
const validate = (id: string, fields: readonly DataField[], values: Record<string, MockValue>) =>
  validateValues(dataShape(fields), { answers: { [id]: values } }, "root", true, LIST_MAX);

/** One answer's design checked against its own values; throws the problem the stage is told about. */
function checked(id: string, answer: Record<string, MockValue>, design: z.infer<typeof Design>["answers"][number]): { fields: DataField[]; values: Record<string, MockValue> } {
  const values = JSON.parse(design.valuesJson) as unknown;
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error(`${id}: valuesJson must be an object`);
  if (design.fields.some(f => (BASE_FIELDS as readonly string[]).includes(f.path.split(".")[0]!.replace("[]", "")))) throw new Error(`${id}: fields may not redefine ${BASE_FIELDS.join(", ")}`);
  const fields = design.fields.map(f => ({ ...f, path: `answers.${id}.${f.path}` })) as DataField[];
  const merged: Record<string, MockValue> = { ...(values as Record<string, MockValue>), ...Object.fromEntries(BASE_FIELDS.filter(k => k in answer).map(k => [k, answer[k]!])), title: design.title || (answer.title as string) };
  validate(id, [...baseFields(merged, id), ...fields], merged);
  return { fields, values: merged };
}

export interface DatasetHooks {
  readonly usage?: StructuredCompletionHooks["usage"];
  readonly rejected?: (id: string, problem: string) => void;
}

/** The dataset the program reads (`d.answers.<id>`), with its fields, ready to snapshot. */
export async function designDataset(plan: SportsPlan, answers: Record<string, Record<string, MockValue>>, source: SnapshotDataset["source"], now: Date,
  hooks: DatasetHooks = {}, send?: CompletionSender, clubs: readonly Record<string, MockValue>[] = [], players: readonly PlayerProfile[] = []): Promise<SnapshotDataset & { readonly designed: readonly string[] }> {
  const model = config().SPORTS_MODEL;
  const complete = plan.questions.filter(q => answers[q.id]?.status === "complete" && !(q.source === "espn" && q.feed === "scorers"));
  let designs = new Map<string, z.infer<typeof Design>["answers"][number]>();
  if (complete.length) {
    try {
      const result = await structuredCompletion({
        stage: "data",
        request: {
          model, maxTokens: 16_000, schema: z.toJSONSchema(Design) as Record<string, unknown>,
          messages: [{ role: "system", content: SCHEMA_SYSTEM }, { role: "user", content: JSON.stringify({
            subject: plan.subject, today: now.toISOString().slice(0, 10), clubs, players,
            answers: complete.map(q => ({ id: q.id, question: q.text, data: Object.fromEntries(Object.entries(answers[q.id]!).filter(([k]) => !(BASE_FIELDS as readonly string[]).includes(k) || k === "summary")) })),
          }) }],
        },
        send: send ?? anthropicSender({ effort: "high", fallbacks: true }),
        // Every design is validated here, so a bad one regenerates the whole stage once.
        parse: text => {
          const design = Design.parse(JSON.parse(text));
          const byId = new Map(design.answers.map(a => [a.id, a]));
          for (const q of complete) { const d = byId.get(q.id); if (d) checked(q.id, answers[q.id]!, d); }
          return byId;
        },
        ...(hooks.usage ? { hooks: { usage: hooks.usage } } : {}),
      });
      designs = result.value;
    } catch (error) {
      for (const q of complete) hooks.rejected?.(q.id, (error as Error).message.slice(0, 300));
    }
  }
  const fields: DataField[] = [];
  const values: Record<string, Record<string, MockValue>> = {};
  const designed: string[] = [];
  for (const q of plan.questions) {
    const answer = answers[q.id]!;
    const design = designs.get(q.id);
    let shaped = q.source === "espn" && q.feed === "scorers" && answer.status === "complete" ? scorerAnswer(answer, q.id) : rawAnswer(answer, q.id);
    if (design) {
      try { shaped = checked(q.id, answer, design); designed.push(q.id); }
      catch (error) { hooks.rejected?.(q.id, (error as Error).message.slice(0, 300)); }
    }
    try { validate(q.id, [...baseFields(shaped.values, q.id), ...shaped.fields], shaped.values); }
    catch (error) {
      // Raw data that does not validate cannot be shown faithfully: say so instead.
      hooks.rejected?.(q.id, `raw answer: ${(error as Error).message.slice(0, 300)}`);
      shaped = { fields: [], values: { status: "unavailable", question: q.text, title: q.text.slice(0, 60), note: "Couldn't show this data.", source: "" } };
    }
    values[q.id] = shaped.values;
    fields.push(...baseFields(shaped.values, q.id), ...shaped.fields);
  }
  // The clubs the screen is about, from ESPN by id: names, colours and logos any part may use.
  if (clubs.length) fields.push(...inferFields(clubs as MockValue, "clubs"));
  return { values: { answers: values, ...(clubs.length ? { clubs: [...clubs] } : {}) }, fields, asOf: now.toISOString(), source, designed };
}
