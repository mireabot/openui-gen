import { FRAME_NAMES, isFrameName } from "./names.js";
import { z } from "zod";
import { config } from "../config.js";
import { modelSender } from "../llm/generation.js";
import { structuredCompletion, type CompletionSender, type StructuredCompletionHooks } from "../llm/structured-completion.js";
import { DATA_FORMATS, dataShape, validateValues, type DataField, type DataShape, type MockValue } from "../research/dataset-schema.js";
import type { SnapshotDataset } from "../lang/snapshots.js";
import { contractsFor } from "./components.js";
import { isSoccer } from "./leagues.js";
import type { SportsPlan } from "./plan.js";
import type { PlayerProfile } from "./fotmob.js";

/**
 * The schema stage (Opus, SPORTS_MODEL): from every answer it designs the fields the screen needs
 * and their values, selecting, ordering and deriving from the data it was given (a top five, a
 * W/D/L string, a points gap) and never adding figures. The server validates every field and value
 * (dataShape, validateValues); a question whose design fails keeps its raw answer with inferred
 * fields, so a schema mistake costs polish, not the screen. Rejection is soft: small slips are repaired
 * in place, and a design that still fails costs only its own question.
 */

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

/** What the schema stage needs for the sports on this screen. */
const TEAM_SPORT_NOTES = `Team sports without a points table (NFL, NBA): a team's standing is its record ("6-2"), win percentage and games behind, and a tie is rare. A LeagueStanding's rows come from the answer's group, with the row's record in points. The feeds already shape several records: a "leaderboards" item fits Leaderboard, a "results" list fits a FixturesHeatmap's results, a table with title, columnCount, columns and rows fits RecordTable, and an athlete's "career" (initial and clubs) fits ClubTimeline, the same component soccer careers use. Keep those as they are when you use them, selecting rows if the request asks for fewer. A player record that has a logo already has its photo: keep logo, kind, team and athleteId.`;

export const schemaSystem = (hasSoccer: boolean, hasTeamSports: boolean) => `You design the dataset a mobile sports screen reads. For each answer, return the fields the screen needs and their values.
Use only the data given: select, order, trim and derive (a top five, a points gap, a form string such as "WWDLW", a goal difference), but never add a figure, name or date that is not in the data.
fields: flat paths relative to the answer, lowerCamel segments, "[]" for list items (e.g. "table[].team.name", "table[].points", "leader.name"). A list path names its items' fields, never the list itself. Kinds: text, number (format integer, count, decimal or percent 0–100), boolean, date (format day or month; ISO dates), status (good, warn, bad or neutral), object and list are implied by paths. Every other kind uses format "none". Logos and URLs are text.
Do not define these fields; the server adds them: ${FRAME_NAMES.join(", ")}.
valuesJson: one JSON object with exactly those fields. A number or date the data does not have is null. Lists hold at most 20 items, except a FixturesHeatmap's results, which hold every fixture.
title: a short heading for the answer, e.g. "Premier League table", "Chelsea's season".
Missing data: leave it out. Never write "—", "N/A", "unknown" or an empty value; a part of a card with no data is not shown.
Long data: a stat's value is one figure or a few words ("317", "€51m", "Norway") with its name in label. Split "162 goals, 29 assists" into one stat each. Sentences belong in summary.
Collections: named things a player or team has won or holds (trophies, awards, honours, records, selections) are a list of items, each { name, count, detail }, never a table. name is the honour as it is called ("All-NBA 2nd Team"); count is how many with an x ("4x"), or "" when it was once; detail is the years, newest first ("2025, 2021, 2007, 2005"), or a few words ("13 First Team, 4 Second Team"). A table is only for figures across several columns.
Players and clubs: every player or club the answer names, anywhere (a list item, a field, a partner, a rival, a coach, an opponent), is a record with its essential metadata, never a bare name in a text field. A player is { name (full name), kind "player", team (their club, or ""), logo "", color "" }; a club is { name, kind "club", logo "", color "" }. The server fills each photo, crest and colour it can find by name, so leave logo and color "" unless the data already has them. What is said about them goes in short text fields beside these.
Text once: an answer's title, a nested title (a list's or a card's) and the summary each say something different. Leave a nested title "" when the answer's title already says it, and keep the summary to what the data itself does not show; prefer less text.
Repeats: a fact goes in one answer. When two answers are about the same player, the second holds only what the first does not.

Sports components. When an answer suits one, shape the answer (a field of it, or a list's items) to its contract exactly, field for field, so the screen can show it with that component: a match → a MatchCard record, a run of results → a FixturesHeatmap record, two clubs compared on a stat → one StatBar record per stat in a list, one figure compared across players, clubs or seasons when the request asks to compare them (compare, vs, against each other, side by side), even if it also says top N, or any such list of more than 10 → one MetricBars record with every subject, never split, a plain ranked list of at most 10 where the order is the answer → a Leaderboard record, one player's figures period by period over a season (up to four metrics) → a PlayerMetrics record, two to four players on one figure period by period → a PlayersMetric record, a match's statBars → keep this field and its records unchanged, one StatBar per item in their order, the top players of one match from both sides → a MatchTopPlayers record with the number of rows the request asks for (for top rated, values from teamRated and opponentRated), a player's or a club's figures → a StatsCard record, a club's points or record this season → a TeamPoints record, a club's place in the table → a LeagueStanding record, a league's final top three → a SeasonPodium record, one injured player → an InjuryReport record, a team's or a league's injured players → an InjuryList record with the players in it. Lock every fact to one place, however many questions ask for it: never put the same figure or record in two fields, and when questions overlap, answer the fact once and leave it out of the others. When both a TeamPoints and a LeagueStanding record are on the screen, TeamPoints is the place for home and away, and the LeagueStanding's showVenues is false. Give TeamPoints a short title describing the comparison, such as "Home and away". Pld means matches played, not Premier League. TeamPoints also holds the season's points: never split them across other records, and a FixturesHeatmap beside it headlines something else, such as points per game. Every contract field is present: text "" and lists [] when the data has nothing. Colours: take each club's "#rrggbb" and logo from the clubs list in the input, matched by club name; "" for a club not in it, and the server fills those it knows. A club with a logo has color "clear", so its crest has no fill; the server enforces it. Player photos: match the verified players list by full player name and use its imageUrl for a player's logo. Never use the club crest as a player photo or invent an image URL. Keep each player's full name in its record so the server can attach the verified image.
${hasTeamSports ? `${TEAM_SPORT_NOTES}\n` : ""}${contractsFor(hasSoccer, hasTeamSports)}`;

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
    // One decimal makes the field decimal: 24 and 19.5 are one column.
    else if (typeof known === "number" && typeof child === "number" && !Number.isInteger(child)) merged[key] = child;
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
  FRAME_NAMES.filter(key => key in answer).map(key => ({ path: `answers.${id}.${key}`, kind: "text", format: "none" }));

/** A designed list holds at most this many items: an NBA team's season of results fits. */
const LIST_MAX = 120;
/** Raw lists, sent when a design fails, are shorter. */
const RAW_LIST_MAX = 40;
/** Keeps what a raw list is for: every result of a season, the newest of a run of games, the top of anything else. */
const rawList = (key: string, value: readonly MockValue[]) => key === "results" ? value : key === "matches" ? value.slice(-RAW_LIST_MAX) : value.slice(0, RAW_LIST_MAX);

/**
 * `value` without the keys of list items that declared no field: an empty list inside every item,
 * such as a career spell's stats. A record's own empty list stays, so a caller can still declare it.
 */
function keepDeclared(value: MockValue, path: string, declared: readonly string[]): MockValue {
  if (Array.isArray(value)) return value.map(item => keepDeclared(item, `${path}[]`, declared));
  if (!value || typeof value !== "object") return value;
  const inItem = path.includes("[]");
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const at = `${path}.${key}`;
    const known = declared.some(field => field === at || field.startsWith(`${at}.`) || field.startsWith(`${at}[]`));
    return !inItem || known ? [[key, keepDeclared(child, at, declared)]] : [];
  }));
}

/** Raw values as they came, keeping only keys that yield fields (an empty list declares nothing). */
function rawAnswer(answer: Record<string, MockValue>, id: string): { fields: DataField[]; values: Record<string, MockValue> } {
  const content: Record<string, MockValue> = {};
  const fields: DataField[] = [];
  for (const [key, value] of Object.entries(answer)) {
    if (isFrameName(key) || !PATH.test(key)) continue;
    const found = inferFields(value, `answers.${id}.${key}`);
    if (!found.length) continue;
    const kept = keepDeclared(value, `answers.${id}.${key}`, found.map(field => field.path));
    content[key] = Array.isArray(kept) ? [...rawList(key, kept)] : kept;
    fields.push(...found);
  }
  return { fields, values: { ...content, ...Object.fromEntries(FRAME_NAMES.filter(k => k in answer).map(k => [k, answer[k]!])) } };
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

const isPlainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * A design's values fitted to its own fields, without adding a fact. Missing or null text becomes "",
 * which a component shows as nothing; a number the data lacks is null; a numeric string is its number;
 * undeclared keys and items past the list limit go. An invalid status is neutral, and text over the
 * limit is cut. What this cannot settle, such as a word in a number field, still fails validation.
 */
export function repairValues(node: DataShape, value: unknown): MockValue {
  const kind = node.field?.kind ?? (node.item ? "list" : "object");
  if (kind === "object") {
    const source = isPlainObject(value) ? value : {};
    return Object.fromEntries([...node.children].map(([key, child]) => [key, repairValues(child, source[key])]));
  }
  if (kind === "list") return (Array.isArray(value) ? value : []).slice(0, LIST_MAX).map(item => repairValues(node.item!, item));
  if (kind === "number") {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "string" ? Number(value) : NaN;
    // A word where a figure belongs is a wrong design, not a slip: it stays and fails validation.
    return Number.isFinite(parsed) ? parsed : value as MockValue;
  }
  if (kind === "boolean") return typeof value === "boolean" ? value : false;
  if (kind === "date") return typeof value === "string" ? value : null;
  if (kind === "status") return value === "good" || value === "warn" || value === "bad" || value === "neutral" ? value : "neutral";
  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  return text.slice(0, 1000);
}

/** One answer's design checked against its own values; throws the problem the stage is told about. */
function checked(id: string, answer: Record<string, MockValue>, design: z.infer<typeof Design>["answers"][number]): { fields: DataField[]; values: Record<string, MockValue> } {
  const values = JSON.parse(design.valuesJson) as unknown;
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error(`${id}: valuesJson must be an object`);
  if (design.fields.some(f => isFrameName(f.path.split(".")[0]!.replace("[]", "")))) throw new Error(`${id}: fields may not redefine ${FRAME_NAMES.join(", ")}`);
  const fields = design.fields.map(f => ({ ...f, path: `answers.${id}.${f.path}` })) as DataField[];
  const merged: Record<string, MockValue> = { ...(values as Record<string, MockValue>), ...Object.fromEntries(FRAME_NAMES.filter(k => k in answer).map(k => [k, answer[k]!])), title: design.title || (answer.title as string) };
  // The shape comes from the design's own fields: base fields are the server's and stay as they are.
  if (!fields.length) throw new Error(`${id}: a design needs fields`);
  const declared = dataShape(fields).children.get("answers")!.children.get(id)!;
  const repaired = repairValues(declared, values) as Record<string, MockValue>;
  const fitted: Record<string, MockValue> = { ...repaired, ...Object.fromEntries(Object.entries(merged).filter(([key]) => isFrameName(key))) };
  validate(id, [...baseFields(fitted, id), ...fields], fitted);
  return { fields, values: fitted };
}

export interface DatasetHooks {
  readonly usage?: StructuredCompletionHooks["usage"];
  readonly rejected?: (id: string, problem: string) => void;
}

/** Whether every structured question and the subject are outside soccer, so soccer's components have no place here. */
const teamSportsOnly = (plan: SportsPlan) => {
  const leagues = plan.questions.flatMap(q => (q.source === "espn" ? [q.league] : []));
  return (plan.subject.league !== null || leagues.length > 0) && (plan.subject.league === null || !isSoccer(plan.subject.league)) && leagues.every(league => !isSoccer(league));
};

/** The dataset the program reads (`d.answers.<id>`), with its fields, ready to snapshot. */
export async function designDataset(plan: SportsPlan, answers: Record<string, Record<string, MockValue>>, source: SnapshotDataset["source"], now: Date,
  hooks: DatasetHooks = {}, send?: CompletionSender, clubs: readonly Record<string, MockValue>[] = [], players: readonly PlayerProfile[] = []): Promise<SnapshotDataset & { readonly designed: readonly string[] }> {
  const model = config().SPORTS_MODEL;
  const complete = plan.questions.filter(q => answers[q.id]?.status === "complete" && q.source !== "fotmob" && !(q.source === "espn" && q.feed === "scorers"));
  let designs = new Map<string, z.infer<typeof Design>["answers"][number]>();
  if (complete.length) {
    try {
      const result = await structuredCompletion({
        stage: "data",
        request: {
          model, maxTokens: 16_000, schema: z.toJSONSchema(Design) as Record<string, unknown>,
          messages: [{ role: "system", content: schemaSystem(!teamSportsOnly(plan), plan.questions.some(q => q.source === "espn" && !isSoccer(q.league)) || (plan.subject.league !== null && !isSoccer(plan.subject.league))) }, { role: "user", content: JSON.stringify({
            subject: plan.subject, today: now.toISOString().slice(0, 10), clubs, players,
            answers: complete.map(q => ({ id: q.id, question: q.text, data: Object.fromEntries(Object.entries(answers[q.id]!).filter(([k]) => !isFrameName(k) || k === "summary")) })),
          }) }],
        },
        send: send ?? modelSender({ effort: "high", fallbacks: true }),
        // One bad design costs only its question: the loop below keeps its raw answer and the others
        // keep theirs. The stage regenerates once only when nothing it designed is usable.
        parse: text => {
          const design = Design.parse(JSON.parse(text));
          const byId = new Map(design.answers.map(a => [a.id, a]));
          const results = complete.flatMap(q => {
            const d = byId.get(q.id);
            if (!d) return [];
            try { checked(q.id, answers[q.id]!, d); return [null]; }
            catch (error) { return [error as Error]; }
          });
          const failure = results.find(result => result !== null);
          if (failure && results.every(result => result !== null)) throw failure;
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
    if (q.source === "espn" && q.feed === "match" && Array.isArray(answer.statBars) && answer.statBars.length) {
      const prefix = `answers.${q.id}.statBars`;
      shaped = {
        values: { ...shaped.values, statBars: answer.statBars },
        fields: [...shaped.fields.filter(field => field.path !== prefix && !field.path.startsWith(`${prefix}[]`)), ...inferFields(answer.statBars, prefix)],
      };
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
