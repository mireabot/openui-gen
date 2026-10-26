import { z } from "zod";
import { config } from "../config.js";
import type { QuestionId } from "../lang/compiler.js";
import { anthropicSender } from "../llm/anthropic.js";
import { structuredCompletion, type StructuredCompletionHooks } from "../llm/structured-completion.js";
import { clubDirectory, CUP_CODES, ESPN_FEEDS, LEAGUE_CODES, LEAGUES, MISSING_FEEDS, type Club, type EspnFeed, type EspnTransport, type LeagueCode } from "./espn.js";

/**
 * Understanding the request (Haiku, SPORTS_PLAN_MODEL): what it is about and the questions the
 * screen must answer, each routed to an ESPN feed when one has the data, otherwise to cited web
 * research. One question becomes one part of the screen.
 */

export interface SportsSubject {
  readonly kind: "league" | "team" | "player" | "match" | "topic";
  readonly name: string;
  /** An ESPN league code, or null when the request is outside the four leagues. */
  readonly league: LeagueCode | null;
  readonly season: string;
}

export type SportsQuestion = {
  readonly id: QuestionId;
  /** The sub-question in the user's terms, with every detail they asked for. */
  readonly text: string;
} & (
  | { readonly source: "espn"; readonly league: LeagueCode; readonly feed: EspnFeed; readonly team: string | null; readonly opponent: string | null; readonly date: string | null; readonly season: number | null }
  | { readonly source: "web"; readonly searchQueries: readonly string[] }
);

export interface SportsPlan { readonly subject: SportsSubject; readonly questions: readonly SportsQuestion[] }

/**
 * The plan's shape. With the club directory, `team` and `opponent` are its exact names, so the model
 * resolves "Barcelona", "Barça" or "Man City" itself and nothing downstream guesses.
 */
export const rawSchema = (clubs: readonly Club[]) => {
  const club = clubs.length ? z.enum(clubs.map(c => c.name) as [string, ...string[]]).nullable() : z.string().nullable();
  return z.object({
  subject: z.object({
    kind: z.enum(["league", "team", "player", "match", "topic"]),
    name: z.string().min(1),
    league: z.enum([...LEAGUE_CODES, "other"]),
    season: z.string(),
  }).strict(),
  questions: z.array(z.object({
    text: z.string().min(3),
    source: z.enum(["espn", "web"]),
    competition: z.enum([...CUP_CODES, "league"]),
    feed: z.enum([...ESPN_FEEDS, "none"]),
    team: club,
    opponent: club,
    date: z.string().nullable(),
    season: z.number().int().nullable(),
    searchQueries: z.array(z.string()),
  }).strict()).min(1).max(5),
}).strict();
};
const Raw = rawSchema([]);

const leagueList = LEAGUE_CODES.map(code => `${code} ${LEAGUES[code]}`).join(", ");

const clubList = (clubs: readonly Club[]) => LEAGUE_CODES.map(code => {
  const names = clubs.filter(c => c.league === code).map(c => (c.short && c.short !== c.name ? `${c.name} (${c.short})` : c.name));
  return names.length ? `${LEAGUES[code]} (${code}): ${names.join(", ")}` : "";
}).filter(Boolean).join("\n");

export const planSystem = (today: string, clubs: readonly Club[] = []) => `You plan a mobile screen that answers a football (soccer) request. Today is ${today}; "this season" means the season in progress.
Return the subject and 1–5 questions. Each question is one part of the screen, in the user's terms, with every detail they asked for (period, competition, count). Ask only what the request needs.
Route each question to data. Use ESPN for anything it carries; search the web only for what it does not.
- source "espn", for these competitions only (code: ${leagueList}). competition: a cup's code when the question is about that cup, else "league" (the club's own league, or the subject's). The FA Cup has no "standings" or "leaders". Feeds:
  "standings": the league table (rank, played, W/D/L, goals, points).
  "scoreboard": one day's matches; date YYYYMMDD, null for the current matchday.
  "schedule": one team's season, results and fixtures, oldest first, each with its result; team required.
  "match": one meeting between two clubs: score, each side's possession, shots, shots on target, corners and cards, the goals with scorer and assist, and the players' goals, assists and shots; team and opponent required. Without a season it is the most recent meeting this season, or last season's if they have not played yet (the data says which).
  "leaders": the league's top scorers and top assisters this season.
  "teams": the league's clubs with colours and logos.
  Set team to the club the question is about (for standings too, so the table can mark it)${clubs.length ? ", written exactly as listed below, the opponent too. Resolve what the user typed to the club they mean: \"Barcelona\" or \"Barça\" is Barcelona, \"Man City\" is Manchester City, \"Inter\" is Internazionale. A club not listed is outside these competitions: use the web" : ""}. season: the season's start year (2025 for 2025/26) only when the user names a past season, else null.
- source "web" for everything else: player ratings and per-season player statistics beyond the leaders, injuries, transfers, news, history, explanations, and any other league or competition (Europa League, League Cup). Give 2–3 keyword search queries (3–6 words each) naming the players, clubs, competition and season.
For espn questions set searchQueries to []; for web questions set feed "none", competition "league", and team, opponent, date and season null.
subject.name: the club, player, league or match by its full name (the listed club name for a club). subject.league: the ESPN league code the request is about, or "other". subject.season: e.g. "2026/27".${clubs.length ? `\n\nClubs ESPN covers, by league (exact name, then short name):\n${clubList(clubs)}` : ""}`;

/**
 * Plain checks the schema cannot express; ids are assigned here in order. A question about a cup reads
 * the cup; otherwise a question about a listed club reads that club's league, whatever the subject's
 * league is ("Barcelona" in a Premier League conversation is LaLiga).
 */
export function toPlan(raw: z.infer<typeof Raw>, clubs: readonly Club[] = []): SportsPlan {
  const questions = raw.questions.map((q, index): SportsQuestion => {
    const id = `q${index + 1}` as QuestionId;
    if (q.source === "espn") {
      const own = clubs.find(c => c.name === q.team)?.league;
      const league = q.competition !== "league" ? q.competition : own ?? (raw.subject.league === "other" ? null : raw.subject.league);
      if (!league) throw new Error(`${id}: an ESPN question needs one of ${LEAGUE_CODES.join(", ")}`);
      if (q.feed === "none") throw new Error(`${id}: an ESPN question needs a feed`);
      if (MISSING_FEEDS[league]?.includes(q.feed)) throw new Error(`${id}: ESPN has no ${LEAGUES[league]} ${q.feed}; use the web`);
      if (q.feed === "schedule" && !q.team) throw new Error(`${id}: the schedule feed needs a team`);
      if (q.feed === "match" && (!q.team || !q.opponent)) throw new Error(`${id}: the match feed needs a team and an opponent`);
      if (q.date && !/^\d{8}$/.test(q.date)) throw new Error(`${id}: date must be YYYYMMDD`);
      const season = q.feed === "schedule" || q.feed === "match" ? q.season : null;
      return { id, text: q.text, source: "espn", league, feed: q.feed, team: q.team, opponent: q.feed === "match" ? q.opponent : null, date: q.feed === "scoreboard" ? q.date : null, season };
    }
    const searchQueries = q.searchQueries.map(s => s.trim()).filter(Boolean).slice(0, 3);
    if (searchQueries.length < 2) throw new Error(`${id}: a web question needs 2–3 search queries`);
    return { id, text: q.text, source: "web", searchQueries };
  });
  return { subject: { ...raw.subject, league: raw.subject.league === "other" ? null : raw.subject.league }, questions };
}

export async function planSports(prompt: string, now: Date, hooks?: StructuredCompletionHooks, espn?: EspnTransport): Promise<SportsPlan> {
  const model = config().SPORTS_PLAN_MODEL;
  // Without the directory (ESPN down) club names stay free text and the feeds match them loosely.
  const clubs = await clubDirectory(espn).catch(() => [] as readonly Club[]);
  const schema = rawSchema(clubs);
  const result = await structuredCompletion({
    stage: "summarize",
    request: {
      model, maxTokens: 1_500, schema: z.toJSONSchema(schema) as Record<string, unknown>,
      messages: [{ role: "system", content: planSystem(now.toISOString().slice(0, 10), clubs) }, { role: "user", content: prompt }],
    },
    // Haiku has no server-side refusal fallback; a short plan needs little thinking.
    send: anthropicSender({ effort: "low" }),
    parse: text => toPlan(schema.parse(JSON.parse(text)), clubs),
    ...(hooks ? { hooks } : {}),
  });
  return result.value;
}
