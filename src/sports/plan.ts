import { z } from "zod";
import { config } from "../config.js";
import type { QuestionId } from "../lang/compiler.js";
import { claudeSender } from "../llm/claude.js";
import { structuredCompletion, type StructuredCompletionHooks } from "../llm/structured-completion.js";
import { CUP_CODES, ESPN_FEEDS, LEAGUE_CODES, LEAGUES, MISSING_FEEDS, type Club, type EspnTransport } from "./espn.js";
import { footballClubs } from "./football.js";

/**
 * Understanding the request (Haiku, SPORTS_PLAN_MODEL): what it is about and the questions the
 * screen must answer, each routed to an ESPN feed when one has the data, otherwise to cited web
 * research. One question becomes one part of the screen. A follow-up is planned against the saved
 * questions: each is kept, revised under its id, or removed, and new ones are added.
 */

const KINDS = ["league", "team", "player", "match", "topic"] as const;
const QuestionIdSchema = z.templateLiteral(["q", z.number().int().positive()]);
export const SportsSubjectSchema = z.object({
  kind: z.enum(KINDS),
  name: z.string(),
  /** An ESPN league code, or null when the request is outside the four leagues. */
  league: z.enum(LEAGUE_CODES).nullable(),
  season: z.string(),
}).strict();
/** A routed question, as saved with the document so a follow-up can keep or revise it by id. */
export const SportsQuestionSchema = z.discriminatedUnion("source", [
  z.object({ id: QuestionIdSchema, text: z.string(), source: z.literal("espn"), league: z.enum(LEAGUE_CODES), feed: z.enum(ESPN_FEEDS), team: z.string().nullable(), opponent: z.string().nullable(), date: z.string().nullable(), season: z.number().int().nullable(), lastGames: z.number().int().min(1).max(20).optional(), allCompetitions: z.boolean().optional() }).strict(),
  z.object({ id: QuestionIdSchema, text: z.string(), source: z.literal("web"), searchQueries: z.array(z.string()) }).strict(),
  z.object({ id: QuestionIdSchema, text: z.string(), source: z.literal("fotmob"), player: z.string(), team: z.string().nullable() }).strict(),
]);
export type SportsSubject = z.infer<typeof SportsSubjectSchema>;
/** `text` is the sub-question in the user's terms, with every detail they asked for. */
export type SportsQuestion = z.infer<typeof SportsQuestionSchema>;
export interface SportsPlan { readonly subject: SportsSubject; readonly questions: readonly SportsQuestion[] }

/**
 * A question as the model writes it. With the club directory, `team` and `opponent` are its exact
 * names, so the model resolves "Barcelona", "Barça" or "Man City" itself and nothing downstream guesses.
 */
const rawQuestion = (clubs: readonly Club[]) => {
  const club = clubs.length ? z.enum(clubs.map(c => c.name) as [string, ...string[]]).nullable() : z.string().nullable();
  return z.object({
    text: z.string().min(3),
    source: z.enum(["espn", "web", "fotmob"]),
    player: z.string().nullable().optional(),
    competition: z.enum([...CUP_CODES, "league", "all"]),
    feed: z.enum([...ESPN_FEEDS, "none"]),
    team: club,
    opponent: club,
    date: z.string().nullable(),
    season: z.number().int().nullable(),
    lastGames: z.number().int().min(1).max(20).nullable().optional(),
    searchQueries: z.array(z.string()),
  }).strict();
};
const rawSubject = z.object({ kind: z.enum(KINDS), name: z.string().min(1), league: z.enum([...LEAGUE_CODES, "other"]), season: z.string() }).strict();
type RawQuestion = z.infer<ReturnType<typeof rawQuestion>>;
type RawSubject = z.infer<typeof rawSubject>;

export const rawSchema = (clubs: readonly Club[]) => z.object({ subject: rawSubject, questions: z.array(rawQuestion(clubs)).min(1).max(5) }).strict();

const leagueList = LEAGUE_CODES.map(code => `${code} ${LEAGUES[code]}`).join(", ");

const clubList = (clubs: readonly Club[]) => LEAGUE_CODES.map(code => {
  const names = clubs.filter(c => c.league === code).map(c => (c.short && c.short !== c.name ? `${c.name} (${c.short})` : c.name));
  return names.length ? `${LEAGUES[code]} (${code}): ${names.join(", ")}` : "";
}).filter(Boolean).join("\n");

/** How a question is routed to data, for the first plan and for follow-ups. */
const routing = (clubs: readonly Club[]) => `Route each question to data. Use ESPN for anything it carries; search the web only for what it does not.
- source "espn", for these competitions only (code: ${leagueList}). competition: a cup's code when the question is about that cup, else "league" (the club's own league, or the subject's). For "scorers", use "all" when no competition is named. The FA Cup has no "standings" or "leaders". Feeds:
  "standings": the league table (rank, played, W/D/L, goals, points). With a season, that season's final table: who won a past season and who came 2nd and 3rd reads this feed.
  "scoreboard": one day's matches; date YYYYMMDD, null for the current matchday.
  "schedule": one team's season, results and fixtures, oldest first, each with its result, plus its home and away totals; team required. A club's points, record or place in the table needs both this and "standings", as two questions.
  "match": one meeting between two clubs: score, each side's possession, shots, shots on target, corners and cards, the goals with scorer and assist, and the players' goals, assists and shots, and each side's top five rated players of that match from FotMob; team and opponent required. Without a season it is the most recent meeting this season, or last season's if they have not played yet (the data says which). The top scorers or top rated players of one match read this feed, not "scorers" or the web, and keep the count asked for per side.
  "leaders": the league's top scorers and top assisters this season.${config().DATA_SOURCE === "fotmob" ? " With a season, that season's." : ""}
  "scorers": a club's top goalscorers across its last N completed games, calculated from match reports. Set team and lastGames (1–20) to the requested count. Use this for "Who are Chelsea's top scorers in the past 5 games?" and equivalent recent-game scoring rankings. competition "all" includes all competitions; choose "league" or a cup only when explicitly requested. Never use "schedule", season "leaders", or web search for a last-N-game scorer ranking. Assists and shootouts do not count as player goals, and own goals are reported separately.
  "teams": the league's clubs with colours and logos.
  Set team to the club the question is about (for standings too, so the table can mark it)${clubs.length ? ", written exactly as listed below, the opponent too. Resolve what the user typed to the club they mean: \"Barcelona\" or \"Barça\" is Barcelona, \"Man City\" is Manchester City, \"Inter\" is Internazionale. A club not listed is outside these competitions: use the web" : ""}. season: the season's start year (2025 for 2025/26) only when the user names a past season, else null.
- source "fotmob": a player's market value, or how it changed over time. Set player to their full name and team to their club when it is named.
- source "web" for everything else: season player ratings and per-season player statistics beyond the leaders, injuries, transfers, news, history, explanations, and any other league or competition (Europa League, League Cup). Give 2–3 keyword search queries (3–6 words each) naming the players, clubs, competition and season.
For every feed other than "scorers", set lastGames null. A schedule has scores but no player goalscorers. Do not substitute team goals or season totals for a requested player ranking.
For espn and fotmob questions set searchQueries to []; for fotmob questions set feed "none", competition "league", and opponent, date, season and lastGames null. Set player null on other questions. for web questions set feed "none", competition "league", and team, opponent, date, season and lastGames null.
subject.name: the club, player, league or match by its full name (the listed club name for a club). subject.league: the ESPN league code the request is about, or "other". subject.season: e.g. "2026/27".${clubs.length ? `\n\nClubs ESPN covers, by league (exact name, then short name):\n${clubList(clubs)}` : ""}`;

export const planSystem = (today: string, clubs: readonly Club[] = []) => `You plan a mobile screen that answers a football (soccer) request. Today is ${today}; "this season" means the season in progress.
Return the subject and 1–5 questions. Each question is one part of the screen, in the user's terms, with every detail they asked for (period, competition, count). Ask only what the request needs.
${routing(clubs)}`;

/**
 * Plain checks the schema cannot express. A question about a cup reads the cup; otherwise a question
 * about a listed club reads that club's league, whatever the subject's league is ("Barcelona" in a
 * Premier League conversation is LaLiga).
 */
function toQuestion(q: RawQuestion, id: QuestionId, subject: RawSubject, clubs: readonly Club[]): SportsQuestion {
  if (q.source === "fotmob") return { id, text: q.text, source: "fotmob", player: q.player?.trim() || subject.name, team: q.team };
  if (q.source === "espn") {
    const own = clubs.find(c => c.name === q.team)?.league;
    const league = q.competition !== "league" && q.competition !== "all" ? q.competition : own ?? (subject.league === "other" ? null : subject.league);
    if (!league) throw new Error(`${id}: an ESPN question needs one of ${LEAGUE_CODES.join(", ")}`);
    if (q.feed === "none") throw new Error(`${id}: an ESPN question needs a feed`);
    if (q.competition === "all" && q.feed !== "scorers") throw new Error(`${id}: all competitions is supported by the scorers feed`);
    if (q.lastGames != null && q.feed !== "scorers") throw new Error(`${id}: lastGames needs the scorers feed, not ${q.feed}`);
    if (MISSING_FEEDS[league]?.includes(q.feed)) throw new Error(`${id}: ESPN has no ${LEAGUES[league]} ${q.feed}; use the web`);
    if ((q.feed === "schedule" || q.feed === "scorers") && !q.team) throw new Error(`${id}: the ${q.feed} feed needs a team`);
    if (q.feed === "scorers" && (!Number.isInteger(q.lastGames) || q.lastGames == null || q.lastGames < 1 || q.lastGames > 20)) throw new Error(`${id}: scorers needs lastGames between 1 and 20`);
    if (q.feed === "match" && (!q.team || !q.opponent)) throw new Error(`${id}: the match feed needs a team and an opponent`);
    if (q.date && !/^\d{8}$/.test(q.date)) throw new Error(`${id}: date must be YYYYMMDD`);
    const season = q.feed === "standings" || q.feed === "schedule" || q.feed === "match" || q.feed === "scorers" || (q.feed === "leaders" && config().DATA_SOURCE === "fotmob") ? q.season : null;
    return { id, text: q.text, source: "espn", league, feed: q.feed, team: q.team, opponent: q.feed === "match" ? q.opponent : null, date: q.feed === "scoreboard" ? q.date : null, season,
      ...(q.feed === "scorers" && q.lastGames != null ? { lastGames: q.lastGames, allCompetitions: q.competition === "all" } : {}) };
  }
  const searchQueries = q.searchQueries.map(s => s.trim()).filter(Boolean).slice(0, 3);
  if (searchQueries.length < 2) throw new Error(`${id}: a web question needs 2–3 search queries`);
  return { id, text: q.text, source: "web", searchQueries };
}
const toSubject = (raw: RawSubject): SportsSubject => ({ ...raw, league: raw.league === "other" ? null : raw.league });

/** The first plan; ids are assigned in order. */
export function toPlan(raw: z.infer<ReturnType<typeof rawSchema>>, clubs: readonly Club[] = []): SportsPlan {
  return { subject: toSubject(raw.subject), questions: raw.questions.map((q, index) => toQuestion(q, `q${index + 1}`, raw.subject, clubs)) };
}

export async function planSports(prompt: string, now: Date, hooks?: StructuredCompletionHooks, espn?: EspnTransport): Promise<SportsPlan> {
  // Without the directory (ESPN down) club names stay free text and the feeds match them loosely.
  const clubs = await footballClubs(espn).catch(() => [] as readonly Club[]);
  const schema = rawSchema(clubs);
  return plan(schema, planSystem(now.toISOString().slice(0, 10), clubs), prompt, text => toPlan(schema.parse(JSON.parse(text)), clubs), 3_000, hooks);
}

// ------------------------------------------------------------------ follow-ups

/** A question after a follow-up: kept as saved (its answer reused), revised under its id (answered again), or added under a fresh id. */
export type QuestionChange = "kept" | "revised" | "added";
export type PlannedQuestion = SportsQuestion & { readonly change: QuestionChange };
export interface FollowUpPlan {
  readonly subject: SportsSubject;
  /** The screen's questions after the follow-up: the saved ones in order, then the added ones. */
  readonly questions: readonly PlannedQuestion[];
  readonly removed: readonly QuestionId[];
}

/** What the follow-up planner reads: the conversation, the saved plan and what each part shows. */
export interface FollowUpContext {
  readonly prompt: string;
  readonly subject: SportsSubject;
  readonly questions: readonly SportsQuestion[];
  /** Parts in screen order with the questions each shows, so "the table" or "the bottom card" resolve to questions. */
  readonly parts: readonly { readonly id: string; readonly questions: readonly string[] }[];
  readonly turns: readonly { readonly role: "user" | "assistant"; readonly content: string }[];
  /** Parts the user pointed at, if any. */
  readonly targets?: readonly string[] | undefined;
}

const MAX_QUESTIONS = 8;

/** Every saved id appears in exactly one of keep, revise and remove; the schema limits them to saved ids. */
export const followUpSchema = (clubs: readonly Club[], ids: readonly [QuestionId, ...QuestionId[]]) => z.object({
  subject: rawSubject,
  keep: z.array(z.enum(ids)),
  revise: z.array(rawQuestion(clubs).extend({ id: z.enum(ids) }).strict()),
  remove: z.array(z.enum(ids)),
  add: z.array(rawQuestion(clubs)).max(3),
}).strict();

export const followUpSystem = (today: string, clubs: readonly Club[] = []) => `You update the plan of a mobile football (soccer) screen after a follow-up message. Today is ${today}; "this season" means the season in progress.
The screen shows the saved questions, one part each. Read the follow-up against the conversation and decide, for every saved question by id, exactly one of:
- keep: the follow-up is not about it. Its answer and its part stay exactly as they are. Keep everything the follow-up does not change.
- revise: the follow-up changes what it asks (a period, a count, a club, a competition, a statistic). Return the whole question again under the same id, in the user's terms with every detail, routed again.
- remove: the user asks to drop it.
add: new questions for what the follow-up asks that no saved question covers (0–3), one part each.
subject: the screen's subject after the follow-up; unchanged unless the follow-up changes what the screen is about.
The screen holds at most ${MAX_QUESTIONS} questions.
${routing(clubs)}`;

const same = (a: SportsQuestion, b: SportsQuestion) => JSON.stringify(SportsQuestionSchema.parse(a)) === JSON.stringify(SportsQuestionSchema.parse(b));

/** The follow-up's questions: saved ids keep their place, a revision identical to the saved question is kept, new ids continue after the highest. */
export function toFollowUp(raw: z.infer<ReturnType<typeof followUpSchema>>, saved: readonly SportsQuestion[], clubs: readonly Club[] = []): FollowUpPlan {
  const revised = new Map(raw.revise.map(({ id, ...q }) => [id, q]));
  for (const q of saved) {
    const verdicts = [raw.keep.includes(q.id), revised.has(q.id), raw.remove.includes(q.id)].filter(Boolean).length;
    if (verdicts !== 1) throw new Error(`${q.id}: keep, revise or remove each saved question exactly once`);
  }
  let next = Math.max(...saved.map(q => Number(q.id.slice(1)))) + 1;
  const questions: PlannedQuestion[] = [
    ...saved.filter(q => !raw.remove.includes(q.id)).map((q): PlannedQuestion => {
      const rewrite = revised.get(q.id);
      const revision = rewrite && toQuestion(rewrite, q.id, raw.subject, clubs);
      return revision && !same(revision, q) ? { ...revision, change: "revised" } : { ...q, change: "kept" };
    }),
    ...raw.add.map((q): PlannedQuestion => ({ ...toQuestion(q, `q${next++}`, raw.subject, clubs), change: "added" })),
  ];
  if (!questions.length) throw new Error("A follow-up leaves at least one question on the screen");
  if (questions.length > MAX_QUESTIONS) throw new Error(`At most ${MAX_QUESTIONS} questions`);
  return { subject: toSubject(raw.subject), questions, removed: saved.filter(q => raw.remove.includes(q.id)).map(q => q.id) };
}

export async function planFollowUp(context: FollowUpContext, now: Date, hooks?: StructuredCompletionHooks, espn?: EspnTransport): Promise<FollowUpPlan> {
  const clubs = await footballClubs(espn).catch(() => [] as readonly Club[]);
  const ids = context.questions.map(q => q.id);
  if (!ids.length) throw new Error("A saved screen has at least one question");
  const schema = followUpSchema(clubs, ids as [QuestionId, ...QuestionId[]]);
  const { prompt, targets, ...saved } = context;
  const input = JSON.stringify({ ...saved, ...(targets?.length ? { pointedAt: targets } : {}), followUp: prompt });
  return plan(schema, followUpSystem(now.toISOString().slice(0, 10), clubs), input, text => toFollowUp(schema.parse(JSON.parse(text)), context.questions, clubs), 2_500, hooks);
}

async function plan<T>(schema: z.ZodType, system: string, user: string, parse: (text: string) => T, maxTokens: number, hooks?: StructuredCompletionHooks): Promise<T> {
  const model = config().SPORTS_PLAN_MODEL;
  const result = await structuredCompletion({
    stage: "summarize",
    request: {
      model, maxTokens, schema: z.toJSONSchema(schema) as Record<string, unknown>,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    },
    // Haiku has no server-side refusal fallback; a short plan needs little thinking.
    send: claudeSender({ effort: "low" }),
    parse,
    ...(hooks ? { hooks } : {}),
  });
  return result.value;
}
