import { z } from "zod";
import { config } from "../config.js";
import type { MockValue } from "../research/dataset-schema.js";
import { LEAGUE_CODES, LEAGUE_CONFIG, LEAGUES, sportOf, type EspnFeed, type LeagueCode, type Sport } from "./leagues.js";

/**
 * ESPN's public site API for the four leagues and two cups it covers here: a day's scoreboard, the team list,
 * the league table, one team's season schedule (results oldest first), the season's goal and assist
 * leaders, and one match between two clubs with its team and player statistics. No key. ESPN names a
 * season by its start year: 2026 is 2026/27, and is the default. Each feed is trimmed to what a screen
 * shows, so the schema stage and the writer read a few hundred tokens, not ESPN's full payload.
 */

export { CUP_CODES, ESPN_FEEDS, LEAGUE_CODES, LEAGUES, MISSING_FEEDS } from "./leagues.js";
export type { EspnFeed, LeagueCode } from "./leagues.js";

/** Injectable for offline checks: a URL in, parsed JSON out. */
export type EspnTransport = (url: string) => Promise<unknown>;

export async function fetchJSON(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`ESPN HTTP ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

export const Team = z.object({
  id: z.string(), displayName: z.string(), shortDisplayName: z.string().optional(), abbreviation: z.string().optional(),
  color: z.string().optional(), alternateColor: z.string().optional(), logo: z.string().optional(),
  logos: z.array(z.object({ href: z.string() })).optional(),
}).loose();
/** The scoreboard sends a score as text; a team schedule sends it as { value, displayValue }. */
const Score = z.union([z.string(), z.object({ displayValue: z.string() }).loose()]).optional();
const scoreText = (score: z.infer<typeof Score>) => (typeof score === "string" ? score : score?.displayValue);
const Competitor = z.object({
  homeAway: z.enum(["home", "away"]), score: Score, winner: z.boolean().optional(), form: z.string().optional(),
  team: Team, records: z.array(z.object({ summary: z.string() }).loose()).optional(),
}).loose();
const Status = z.object({ type: z.object({ state: z.enum(["pre", "in", "post"]), completed: z.boolean().optional(), name: z.string().optional(), detail: z.string().optional(), shortDetail: z.string().optional() }).loose() }).loose();
export const Scoreboard = z.object({
  /** A team schedule names the season it returned here; `season` is always the current one. */
  requestedSeason: z.object({ year: z.number() }).loose().optional(),
  events: z.array(z.object({
    id: z.string().optional(),
    date: z.string(),
    status: Status.optional(),
    competitions: z.array(z.object({
      status: Status.optional(),
      competitors: z.array(Competitor),
      venue: z.object({ fullName: z.string().optional() }).loose().optional(),
      broadcasts: z.array(z.object({ names: z.array(z.string()).default([]), media: z.object({ shortName: z.string() }).loose().optional() }).loose()).optional(),
    }).loose()).min(1),
  }).loose()),
}).loose();
export const Teams = z.object({ sports: z.array(z.object({ leagues: z.array(z.object({ teams: z.array(z.object({ team: Team }).loose()) }).loose()) }).loose()) }).loose();
const Standings = z.object({
  children: z.array(z.object({ standings: z.object({ entries: z.array(z.object({
    team: Team, stats: z.array(z.object({ name: z.string(), value: z.number().optional(), displayValue: z.string().optional() }).loose()),
  }).loose()) }).loose() }).loose()),
}).loose();

const Leaders = z.object({ stats: z.array(z.object({ name: z.string(), leaders: z.array(z.object({
  value: z.number().optional(), displayValue: z.string().optional(),
  athlete: z.object({ displayName: z.string(), team: z.object({ displayName: z.string().optional(), abbreviation: z.string().optional() }).loose().optional() }).loose(),
}).loose()).default([]) }).loose()) }).loose();
const Summary = z.object({
  boxscore: z.object({ teams: z.array(z.object({ team: z.object({ id: z.string() }).loose(), statistics: z.array(z.object({ name: z.string(), displayValue: z.string().optional() }).loose()).default([]) }).loose()).default([]) }).loose().optional(),
  keyEvents: z.array(z.object({
    scoringPlay: z.boolean().optional(), type: z.object({ text: z.string().optional() }).loose().optional(),
    clock: z.object({ displayValue: z.string().optional() }).loose().optional(), team: z.object({ id: z.string().optional() }).loose().optional(),
    participants: z.array(z.object({ athlete: z.object({ displayName: z.string() }).loose() }).loose()).optional(),
  }).loose()).default([]),
  rosters: z.array(z.object({ team: z.object({ id: z.string() }).loose(), roster: z.array(z.object({
    athlete: z.object({ displayName: z.string() }).loose(), position: z.object({ abbreviation: z.string().optional() }).loose().optional(),
    stats: z.array(z.object({ name: z.string(), value: z.number().optional() }).loose()).default([]),
  }).loose()).default([]) }).loose()).default([]),
}).loose();

const ScorerReport = z.object({
  keyEvents: z.array(z.object({
    id: z.union([z.string(), z.number()]).transform(String).optional(),
    scoringPlay: z.boolean().optional(), shootout: z.boolean().optional(),
    team: z.object({ id: z.string() }).loose().optional(),
    type: z.object({ id: z.union([z.string(), z.number()]).transform(String).optional(), type: z.string().optional() }).loose().optional(),
    participants: z.array(z.object({ athlete: z.object({ id: z.string().optional(), displayName: z.string() }).loose() }).loose()).optional(),
  }).loose()),
}).loose();

export const logoOf = (team: z.infer<typeof Team>) => team.logo ?? team.logos?.[0]?.href ?? "";
export const colorOf = (hex: string | undefined) => (hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : "");
export const teamRecord = (team: z.infer<typeof Team>): Record<string, MockValue> => ({
  id: team.id, name: team.displayName, short: team.shortDisplayName ?? team.displayName, abbreviation: team.abbreviation ?? "",
  color: colorOf(team.color), alternateColor: colorOf(team.alternateColor), logo: logoOf(team),
});

/** A directory club as dataset values (`d.clubs[]`): what components need to draw it. */
export const clubRecord = (club: Club): Record<string, MockValue> => ({
  id: club.id, name: club.name, short: club.short, abbreviation: club.abbreviation,
  color: club.color, alternateColor: club.alternateColor, logo: club.logo, league: LEAGUES[club.league],
});

const words = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(fc|cf|afc)\b/g, " ").split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Whether a team is the one the request names: its abbreviation ("MNC"), or every word of the query
 * starting a word of one of its names ("Man City" → "Manchester City", "Chelsea" → "Chelsea FC").
 */
export function isTeam(record: Record<string, MockValue>, query: string): boolean {
  const needle = words(query);
  if (!needle.length) return false;
  if (String(record.abbreviation ?? "").toLowerCase() === needle.join("")) return true;
  return ["name", "short"].some(key => {
    const name = words(String(record[key] ?? ""));
    return needle.every(word => name.some(part => part.startsWith(word)));
  });
}

export interface EspnRequest {
  readonly league: LeagueCode;
  readonly feed: EspnFeed;
  /** A team the answer is about: filters matches to that team's; the table stays whole for context. Required for `schedule`. */
  readonly team?: string | null;
  /** Scoreboard only: one day, YYYYMMDD (ESPN's soccer scoreboard takes no range). Default: ESPN's current matchday. */
  readonly dates?: string | null;
  /** `match` only: the other club. */
  readonly opponent?: string | null;
  /** `standings`, `schedule` and `match`: the season's start year (2025 is 2025/26). Default: the current season. */
  readonly season?: number | null;
  readonly lastGames?: number;
  readonly allCompetitions?: boolean;
  /** `athlete` and `gamelog`: the player. */
  readonly player?: string | null;
  /** NFL `scoreboard`: a week of the regular season. */
  readonly week?: number | null;
}

/** One club ESPN covers: its id, exact name (what feeds take), short name, code, colours, logo and league. */
export interface Club {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly abbreviation: string;
  /** "#rrggbb", or "" when ESPN has none. */
  readonly color: string;
  readonly alternateColor: string;
  readonly logo: string;
  readonly league: LeagueCode;
}

let directory: { readonly at: number; readonly clubs: readonly Club[] } | undefined;
const DAY = 86_400_000;

/**
 * Every team in every league, for the planner to resolve "Barcelona", "Barça" or "Man City" to
 * ESPN's exact name and its league. A club in a domestic league and a cup is listed once, under its
 * league; a cup-only club (PSG, Benfica) is listed under the cup. Cached for a day; a competition that
 * fails to load is left out.
 */
export async function clubDirectory(send: EspnTransport = fetchJSON, now = Date.now(), codes: readonly LeagueCode[] = LEAGUE_CODES): Promise<readonly Club[]> {
  if (directory && now - directory.at < DAY) return directory.clubs;
  const base = config().ESPN_BASE_URL;
  const leagues = await Promise.all(codes.map(async league => {
    try {
      const data = Teams.parse(await send(`${base}/site/v2/sports/${LEAGUE_CONFIG[league].espnPath}/teams`));
      return data.sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(({ team }): Club => ({
        id: team.id, name: team.displayName, short: team.shortDisplayName ?? team.displayName, abbreviation: team.abbreviation ?? "",
        color: colorOf(team.color), alternateColor: colorOf(team.alternateColor), logo: logoOf(team), league,
      }))));
    } catch {
      return [];
    }
  }));
  // ESPN's team ids repeat across sports, and a soccer club repeats across its competitions.
  const seen = new Set<string>();
  const clubs = leagues.flat().filter(club => { const key = `${sportOf(club.league)}:${club.id}`; return !seen.has(key) && !!seen.add(key); });
  if (clubs.length) directory = { at: now, clubs };
  return clubs;
}

/** A feed as dataset values plus where it came from, for the citation line. */
export interface EspnAnswer {
  readonly feed: EspnFeed;
  readonly league: LeagueCode;
  readonly values: Record<string, MockValue>;
  readonly source: string;
}

export async function espnLookup(request: EspnRequest, send: EspnTransport = fetchJSON, now = new Date()): Promise<EspnAnswer> {
  const base = `${config().ESPN_BASE_URL}`;
  const league = request.league;
  const name = LEAGUES[league];
  if (request.feed === "scorers") return recentScorers(base, request, send, now);
  if (request.feed === "teams") {
    const data = Teams.parse(await send(`${base}/site/v2/sports/${LEAGUE_CONFIG[league].espnPath}/teams`));
    const teams = data.sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(t => teamRecord(t.team))));
    return { feed: "teams", league, source: `Source: ESPN · ${name} teams`, values: { league: name, teams } };
  }
  if (request.feed === "standings") {
    const url = `${base}/v2/sports/soccer/${league}/standings`;
    const data = Standings.parse(await send(request.season == null ? url : `${url}?season=${request.season}`));
    const table = (data.children[0]?.standings.entries ?? []).map(entry => {
      const stat = (key: string) => entry.stats.find(s => s.name === key)?.value ?? null;
      return {
        rank: stat("rank"), team: teamRecord(entry.team), played: stat("gamesPlayed"), won: stat("wins"), drawn: stat("ties"),
        lost: stat("losses"), goalsFor: stat("pointsFor"), goalsAgainst: stat("pointsAgainst"), goalDifference: stat("pointDifferential"), points: stat("points"),
      } as Record<string, MockValue>;
    }).sort((a, b) => Number(a.rank ?? 99) - Number(b.rank ?? 99));
    const focus = request.team ? table.find(row => isTeam(row.team as Record<string, MockValue>, request.team!)) ?? null : null;
    const season = request.season == null ? null : seasonLabel(request.season);
    return { feed: "standings", league, source: `Source: ESPN · ${name} table${season ? ` ${season}` : ""}`, values: { league: name, ...(season ? { season } : {}), table, ...(request.team ? { focus } : {}) } };
  }
  if (request.feed === "leaders") {
    const data = Leaders.parse(await send(`${base}/site/v2/sports/soccer/${league}/statistics`));
    const list = (key: string) => (data.stats.find(s => s.name === key)?.leaders ?? []).slice(0, 10).map((l, i) => ({
      rank: i + 1, name: l.athlete.displayName, team: l.athlete.team?.displayName ?? "", teamAbbreviation: l.athlete.team?.abbreviation ?? "", value: l.value ?? Number(l.displayValue ?? NaN),
    }));
    return { feed: "leaders", league, source: `Source: ESPN · ${name} leaders`, values: { league: name, goals: list("goalsLeaders"), assists: list("assistsLeaders") } };
  }
  if (request.feed === "schedule") {
    if (!request.team) throw new Error("ESPN schedule needs a team");
    const team = await findTeam(base, league, request.team, send);
    const { season, matches } = await seasonMatches(base, league, team, request.season ?? null, send);
    const count = (r: string) => matches.filter(m => m.result === r).length;
    return { feed: "schedule", league, source: `Source: ESPN · ${team.displayName} ${name} schedule`, values: {
      league: name, season: seasonLabel(season), team: teamRecord(team), matches, won: count("win"), drawn: count("draw"), lost: count("loss"),
      venues: { home: venueTotals(matches, "home"), away: venueTotals(matches, "away") },
    } };
  }
  if (request.feed === "match") {
    if (!request.team || !request.opponent) throw new Error("ESPN match needs a team and an opponent");
    const team = await findTeam(base, league, request.team, send);
    // This season unless one was named; with no meeting played yet, the most recent one last season, labelled as such.
    let found = await meetings(base, league, team, request.opponent, request.season ?? null, send);
    if (!found.played.length && request.season == null && found.season !== null) {
      const earlier = await meetings(base, league, team, request.opponent, found.season - 1, send);
      found = { ...earlier, upcoming: found.upcoming };
    }
    const meeting = found.played.at(-1);
    if (!meeting) {
      return { feed: "match", league, source: `Source: ESPN · ${name}`, values: { league: name, played: false, season: seasonLabel(found.season), currentSeason: request.season == null, upcoming: found.upcoming.slice(0, 2) } };
    }
    const summary = Summary.parse(await send(`${base}/site/v2/sports/soccer/${league}/summary?event=${encodeURIComponent(String(meeting.id))}`));
    const side = (teamId: string) => {
      const stats = summary.boxscore?.teams.find(t => t.team.id === teamId)?.statistics ?? [];
      const stat = (key: string) => { const v = stats.find(s => s.name === key)?.displayValue; return v === undefined || v === "" ? null : Number(v); };
      return { possession: stat("possessionPct"), shots: stat("totalShots"), shotsOnTarget: stat("shotsOnTarget"), corners: stat("wonCorners"),
        fouls: stat("foulsCommitted"), yellowCards: stat("yellowCards"), redCards: stat("redCards"), saves: stat("saves") };
    };
    const players = (teamId: string) => (summary.rosters.find(r => r.team.id === teamId)?.roster ?? []).map(p => {
      const stat = (key: string) => p.stats.find(s => s.name === key)?.value ?? 0;
      return { name: p.athlete.displayName, position: p.position?.abbreviation ?? "", goals: stat("totalGoals"), assists: stat("goalAssists"), shots: stat("totalShots"), shotsOnTarget: stat("shotsOnTarget") };
    }).filter(p => p.goals || p.assists || p.shots).sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.shots - a.shots).slice(0, 8);
    const goals = summary.keyEvents.filter(k => k.scoringPlay).map(k => ({
      minute: k.clock?.displayValue ?? "", team: k.team?.id === team.id ? team.displayName : String((meeting[meeting.venueSide === "home" ? "away" : "home"] as Record<string, MockValue>).name),
      scorer: k.participants?.[0]?.athlete.displayName ?? "", assist: k.participants?.[1]?.athlete.displayName ?? "", kind: k.type?.text ?? "Goal",
    }));
    return { feed: "match", league, source: `Source: ESPN · ${name} match report`, values: {
      league: name, played: true, season: seasonLabel(found.season), currentSeason: request.season == null && found.current,
      match: meeting, teamStats: side(team.id), opponentStats: side(found.opponentId!), goals,
      teamPlayers: players(team.id), opponentPlayers: players(found.opponentId!), upcoming: found.upcoming.slice(0, 2),
    } };
  }
  if (request.dates && !/^\d{8}$/.test(request.dates)) throw new Error("ESPN scoreboard dates must be one day, YYYYMMDD");
  const query = request.dates ? `?dates=${request.dates}` : "";
  const data = Scoreboard.parse(await send(`${base}/site/v2/sports/soccer/${league}/scoreboard${query}`));
  const matches = data.events.map(match);
  const filtered = request.team ? matches.filter(m => isTeam(m.home as Record<string, MockValue>, request.team!) || isTeam(m.away as Record<string, MockValue>, request.team!)) : matches;
  return { feed: "scoreboard", league, source: `Source: ESPN · ${name} scoreboard`, values: { league: name, matches: filtered } };
}

async function recentScorers(base: string, request: EspnRequest, send: EspnTransport, now: Date): Promise<EspnAnswer> {
  if (!request.team) throw new Error("ESPN scorers needs a team");
  const count = request.lastGames;
  if (!Number.isInteger(count) || count === undefined || count < 1 || count > 20) throw new Error("ESPN scorers needs lastGames between 1 and 20");
  const team = await findTeam(base, request.league, request.team, send);
  const competition = request.allCompetitions === false ? request.league : "all";
  const scope = competition === "all" ? "All competitions" : LEAGUES[competition];
  const scheduleURL = `${base}/site/v2/sports/soccer/${competition}/teams/${encodeURIComponent(team.id)}/schedule`;
  const schedule = Scoreboard.parse(await send(request.season == null ? scheduleURL : `${scheduleURL}?season=${request.season}`));
  const unique = new Map(schedule.events.map(event => [event.id ?? event.date, event]));
  const selected = [...unique.values()].filter(event => {
    const fixture = event.competitions[0]!;
    const status = (event.status ?? fixture.status)?.type;
    return status?.state === "post" && status.completed !== false
      && !["STATUS_CANCELED", "STATUS_POSTPONED", "STATUS_ABANDONED"].includes(status.name ?? "")
      && new Date(event.date).getTime() <= now.getTime() && fixture.competitors.some(side => side.team.id === team.id);
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, count);
  if (selected.length !== count) throw new Error(`Only ${selected.length} completed matches available for the requested last ${count}`);
  type Scorer = { name: string; espnId: string; team: string; goals: number };
  const reports = await Promise.all(selected.map(async event => {
    if (!event.id) throw new Error("A selected match has no report ID");
    const fixture = event.competitions[0]!;
    const side = fixture.competitors.find(competitor => competitor.team.id === team.id);
    const rawScore = side ? scoreText(side.score) : undefined;
    const expected = typeof rawScore === "string" && /^\d+$/.test(rawScore) ? Number(rawScore) : NaN;
    if (!Number.isSafeInteger(expected)) throw new Error(`Match ${event.id} has no valid final team score`);
    const report = ScorerReport.parse(await send(`${base}/site/v2/sports/soccer/${competition}/summary?event=${encodeURIComponent(event.id)}`));
    const scorers: Scorer[] = [];
    let ownGoals = 0;
    const seen = new Set<string>();
    for (const goal of report.keyEvents) {
      if (!goal.scoringPlay || goal.shootout || goal.team?.id !== team.id) continue;
      if (!goal.id) throw new Error(`Match ${event.id} has a scoring event without an ID`);
      if (seen.has(goal.id)) continue;
      seen.add(goal.id);
      if (goal.type?.type === "own-goal" || goal.type?.id === "97") { ownGoals++; continue; }
      const scorer = goal.participants?.[0]?.athlete;
      if (!scorer?.displayName.trim()) throw new Error(`Match ${event.id} has an unidentified goalscorer`);
      scorers.push({ name: scorer.displayName, espnId: scorer.id ?? "", team: team.displayName, goals: 1 });
    }
    if (scorers.length + ownGoals !== expected) throw new Error(`Match ${event.id} scorer data does not reconcile with its ${expected} team goals`);
    return { scorers, ownGoals, goalsFor: expected, match: match(event) };
  }));
  const totals = new Map<string, Scorer>();
  for (const scorer of reports.flatMap(report => report.scorers)) {
    const key = scorer.espnId || scorer.name;
    const existing = totals.get(key);
    if (existing) existing.goals++;
    else totals.set(key, { ...scorer });
  }
  const scorers = [...totals.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  const period = { requestedGames: count, gamesCounted: selected.length, scope, from: selected.at(-1)!.date, to: selected[0]!.date };
  const goalsFor = reports.reduce((sum, report) => sum + report.goalsFor, 0);
  const ownGoals = reports.reduce((sum, report) => sum + report.ownGoals, 0);
  return { feed: "scorers", league: request.league, source: `Source: ESPN · ${team.displayName} last ${count} completed matches · ${scope}`, values: {
    league: LEAGUES[request.league], season: seasonLabel(schedule.requestedSeason?.year ?? request.season ?? null),
    scope, requestedGames: count, gamesCounted: selected.length, period, team: teamRecord(team), scorers, goalsFor, ownGoals,
    matches: reports.map(report => report.match),
    summary: `${team.displayName} goalscorers over the last ${count} completed matches (${scope}), ${period.from.slice(0, 10)} to ${period.to.slice(0, 10)}. ${goalsFor} team goals, including ${ownGoals} own goals.`,
    leaderboard: {
      heading: `Top scorers · ${team.displayName} · Last ${count} games · ${scope}`, metric: "Goals",
      entries: scorers.map(scorer => ({ name: scorer.name, detail: team.displayName, value: String(scorer.goals), logo: "", color: colorOf(team.color) })),
    },
  } };
}

/** One venue's played matches added up: ESPN's table has no home and away split. */
export function venueTotals(matches: readonly Record<string, MockValue>[], venue: "home" | "away") {
  const played = matches.filter(m => m.venueSide === venue && m.result !== "upcoming");
  const goals = (side: "home" | "away") => played.reduce((sum, m) => sum + Number((m[side] as Record<string, MockValue>).score), 0);
  const count = (result: string) => played.filter(m => m.result === result).length;
  const [goalsFor, goalsAgainst] = [goals(venue), goals(venue === "home" ? "away" : "home")];
  const [won, drawn] = [count("win"), count("draw")];
  return { played: played.length, won, drawn, lost: count("loss"), goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst, points: won * 3 + drawn };
}

/** "2026/27" for ESPN's season 2026. */
export const seasonLabel = (year: number | null) => (year === null ? "" : `${year}/${String((year + 1) % 100).padStart(2, "0")}`);

export async function findTeam(base: string, league: LeagueCode, query: string, send: EspnTransport) {
  const teams = Teams.parse(await send(`${base}/site/v2/sports/${LEAGUE_CONFIG[league].espnPath}/teams`)).sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(t => t.team)));
  const team = teams.find(t => isTeam(teamRecord(t), query));
  if (!team) throw new Error(`ESPN has no ${LEAGUES[league]} team matching "${query}"`);
  return team;
}

/**
 * A team's season, oldest first, each match with its result from the team's side. ESPN lists results
 * and fixtures separately (`fixture=true`); the current season gets both, a past one only results.
 */
async function seasonMatches(base: string, league: LeagueCode, team: z.infer<typeof Team>, season: number | null, send: EspnTransport) {
  const url = `${base}/site/v2/sports/soccer/${league}/teams/${encodeURIComponent(team.id)}/schedule`;
  const data = Scoreboard.parse(await send(season === null ? url : `${url}?season=${season}`));
  const fixtures = season === null ? Scoreboard.parse(await send(`${url}?fixture=true`)).events : [];
  const seen = new Set<string>();
  const events = [...data.events, ...fixtures].filter(e => !e.id || (!seen.has(e.id) && !!seen.add(e.id)));
  const matches = events.map(match).sort((a, b) => String(a.date).localeCompare(String(b.date))).map(m => {
    const own = isTeam(m.home as Record<string, MockValue>, team.displayName) ? "home" : "away";
    const us = (m[own] as Record<string, MockValue>).score as number | null;
    const them = (m[own === "home" ? "away" : "home"] as Record<string, MockValue>).score as number | null;
    const result = m.state !== "final" || us === null || them === null ? "upcoming" : us > them ? "win" : us < them ? "loss" : "draw";
    return { ...m, venueSide: own, result } as Record<string, MockValue> & { venueSide: "home" | "away" };
  });
  return { season: data.requestedSeason?.year ?? season, matches };
}

/** The meetings with `opponent` in a season: played (oldest first) and still to come. */
async function meetings(base: string, league: LeagueCode, team: z.infer<typeof Team>, opponent: string, season: number | null, send: EspnTransport) {
  const { season: year, matches } = await seasonMatches(base, league, team, season, send);
  const against = matches.filter(m => isTeam(m[m.venueSide === "home" ? "away" : "home"] as Record<string, MockValue>, opponent));
  const opponentId = against.length ? String((against[0]![against[0]!.venueSide === "home" ? "away" : "home"] as Record<string, MockValue>).id) : null;
  return { season: year, current: season === null, opponentId,
    played: against.filter(m => m.result !== "upcoming"), upcoming: against.filter(m => m.result === "upcoming") };
}

const isObject = (v: unknown): v is Record<string, MockValue> => !!v && typeof v === "object" && !Array.isArray(v);
const isMatch = (v: unknown): v is Record<string, MockValue> & { home: Record<string, MockValue>; away: Record<string, MockValue> } =>
  isObject(v) && typeof v.date === "string" && typeof v.state === "string" && isObject(v.home) && isObject(v.away) && typeof v.home.name === "string";

/**
 * Every match in an ESPN answer, carrying MatchCard's contract as well, so the writer can call
 * `MatchCard(m)` without the dataset stage reshaping anything: each side's score as text (its number
 * moves to `goals`), the loser's score in secondary ink and the club colour from the directory; the
 * date as `label`, kickoff or status as `value` in the user's time zone, and competition · venue ·
 * broadcast as `details`. Runs after the feed's own logic, which compares scores as numbers.
 */
export function withMatchCards(values: Record<string, MockValue>, competition: string, timeZone: string, sport: Sport = "soccer"): Record<string, MockValue> {
  const clubs = new Map((directory?.clubs ?? []).filter(c => sportOf(c.league) === sport).map(c => [c.id, c]));
  const date = (iso: string, options: Intl.DateTimeFormatOptions) => { try { return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(new Date(iso)); } catch { return ""; } };
  const card = (m: Record<string, MockValue> & { home: Record<string, MockValue>; away: Record<string, MockValue> }) => {
    const goals = (side: Record<string, MockValue>) => (typeof side.goals === "number" ? side.goals : typeof side.score === "number" ? side.score : null);
    const [home, away] = [goals(m.home), goals(m.away)];
    const side = (team: Record<string, MockValue>, own: number | null, other: number | null) => ({
      ...team, goals: own, score: own === null ? "" : String(own), ink: own !== null && other !== null && own < other ? "secondary" : "primary",
      color: typeof team.color === "string" && team.color ? team.color : clubs.get(String(team.id))?.color ?? "",
    });
    const scheduled = m.state === "scheduled";
    return { ...m, home: side(m.home, home, away), away: side(m.away, away, home),
      label: date(m.date as string, { weekday: "short", month: "short", day: "numeric" }),
      value: scheduled ? date(m.date as string, { hour: "numeric", minute: "2-digit" }) : String(m.status || (m.state === "final" ? "FT" : "Live")),
      details: [competition, m.venue, m.broadcast].filter(part => typeof part === "string" && part).join(" · ") };
  };
  const walk = (v: MockValue): MockValue => Array.isArray(v) ? v.map(walk) : isMatch(v) ? card(v) : isObject(v) ? Object.fromEntries(Object.entries(v).map(([k, c]) => [k, walk(c)])) : v;
  return walk(values) as Record<string, MockValue>;
}

/** One match, from a scoreboard event or a schedule event (which keeps its status on the competition). */
export function match(event: z.infer<typeof Scoreboard>["events"][number]): Record<string, MockValue> {
  const competition = event.competitions[0]!;
  const type = (event.status ?? competition.status)?.type;
  const state = type?.state ?? "pre";
  const side = (where: "home" | "away") => {
    const c = competition.competitors.find(x => x.homeAway === where)!;
    const score = scoreText(c.score);
    return { ...teamRecord(c.team), score: state === "pre" || score === undefined ? null : Number(score), winner: c.winner ?? false, form: c.form ?? "", record: c.records?.[0]?.summary ?? "" };
  };
  return {
    id: event.id ?? "", date: event.date, state: state === "pre" ? "scheduled" : state === "in" ? "live" : "final",
    status: type?.shortDetail ?? type?.detail ?? "", venue: competition.venue?.fullName ?? "",
    // Scoreboards list channel names; schedules name one channel per broadcast under media.
    broadcast: [...new Set((competition.broadcasts ?? []).flatMap(b => b.names.length ? b.names : b.media ? [b.media.shortName] : []))].join(", "),
    home: side("home"), away: side("away"),
  };
}
