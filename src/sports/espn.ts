import { z } from "zod";
import { config } from "../config.js";
import type { MockValue } from "../research/dataset-schema.js";

/**
 * ESPN's public site API for the four leagues and two cups it covers here: a day's scoreboard, the team list,
 * the league table, one team's season schedule (results oldest first), the season's goal and assist
 * leaders, and one match between two clubs with its team and player statistics. No key. ESPN names a
 * season by its start year: 2026 is 2026/27, and is the default. Each feed is trimmed to what a screen
 * shows, so the schema stage and the writer read a few hundred tokens, not ESPN's full payload.
 */

/** Domestic leagues first: a club's league is the first competition that lists it. */
export const LEAGUES = {
  "eng.1": "Premier League",
  "esp.1": "LaLiga",
  "ger.1": "Bundesliga",
  "ita.1": "Serie A",
  "uefa.champions": "Champions League",
  "eng.fa": "FA Cup",
} as const;
export type LeagueCode = keyof typeof LEAGUES;
export const LEAGUE_CODES = Object.keys(LEAGUES) as LeagueCode[];
export const CUP_CODES = ["uefa.champions", "eng.fa"] as const satisfies readonly LeagueCode[];

export const ESPN_FEEDS = ["scoreboard", "standings", "teams", "schedule", "leaders", "match"] as const;
export type EspnFeed = (typeof ESPN_FEEDS)[number];
/** Feeds a competition has no data for: a knockout cup has no table and ESPN keeps no FA Cup leaders. */
export const MISSING_FEEDS: Partial<Record<LeagueCode, readonly EspnFeed[]>> = { "eng.fa": ["standings", "leaders"] };

/** Injectable for offline checks: a URL in, parsed JSON out. */
export type EspnTransport = (url: string) => Promise<unknown>;

async function fetchJSON(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`ESPN HTTP ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

const Team = z.object({
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
const Status = z.object({ type: z.object({ state: z.enum(["pre", "in", "post"]), detail: z.string().optional(), shortDetail: z.string().optional() }).loose() }).loose();
const Scoreboard = z.object({
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
const Teams = z.object({ sports: z.array(z.object({ leagues: z.array(z.object({ teams: z.array(z.object({ team: Team }).loose()) }).loose()) }).loose()) }).loose();
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

const logoOf = (team: z.infer<typeof Team>) => team.logo ?? team.logos?.[0]?.href ?? "";
const colorOf = (hex: string | undefined) => (hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : "");
const teamRecord = (team: z.infer<typeof Team>): Record<string, MockValue> => ({
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
  /** `schedule` and `match`: the season's start year (2025 is 2025/26). Default: the current season. */
  readonly season?: number | null;
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
 * Every club in the six competitions, for the planner to resolve "Barcelona", "Barça" or "Man City" to
 * ESPN's exact name and its league. A club in a domestic league and a cup is listed once, under its
 * league; a cup-only club (PSG, Benfica) is listed under the cup. Cached for a day; a competition that
 * fails to load is left out.
 */
export async function clubDirectory(send: EspnTransport = fetchJSON, now = Date.now()): Promise<readonly Club[]> {
  if (directory && now - directory.at < DAY) return directory.clubs;
  const base = config().ESPN_BASE_URL;
  const leagues = await Promise.all(LEAGUE_CODES.map(async league => {
    try {
      const data = Teams.parse(await send(`${base}/site/v2/sports/soccer/${league}/teams`));
      return data.sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(({ team }): Club => ({
        id: team.id, name: team.displayName, short: team.shortDisplayName ?? team.displayName, abbreviation: team.abbreviation ?? "",
        color: colorOf(team.color), alternateColor: colorOf(team.alternateColor), logo: logoOf(team), league,
      }))));
    } catch {
      return [];
    }
  }));
  const seen = new Set<string>();
  const clubs = leagues.flat().filter(club => !seen.has(club.id) && !!seen.add(club.id));
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

export async function espnLookup(request: EspnRequest, send: EspnTransport = fetchJSON): Promise<EspnAnswer> {
  const base = `${config().ESPN_BASE_URL}`;
  const league = request.league;
  const name = LEAGUES[league];
  if (request.feed === "teams") {
    const data = Teams.parse(await send(`${base}/site/v2/sports/soccer/${league}/teams`));
    const teams = data.sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(t => teamRecord(t.team))));
    return { feed: "teams", league, source: `Source: ESPN · ${name} teams`, values: { league: name, teams } };
  }
  if (request.feed === "standings") {
    const data = Standings.parse(await send(`${base}/v2/sports/soccer/${league}/standings`));
    const table = (data.children[0]?.standings.entries ?? []).map(entry => {
      const stat = (key: string) => entry.stats.find(s => s.name === key)?.value ?? null;
      return {
        rank: stat("rank"), team: teamRecord(entry.team), played: stat("gamesPlayed"), won: stat("wins"), drawn: stat("ties"),
        lost: stat("losses"), goalsFor: stat("pointsFor"), goalsAgainst: stat("pointsAgainst"), goalDifference: stat("pointDifferential"), points: stat("points"),
      } as Record<string, MockValue>;
    }).sort((a, b) => Number(a.rank ?? 99) - Number(b.rank ?? 99));
    const focus = request.team ? table.find(row => isTeam(row.team as Record<string, MockValue>, request.team!)) ?? null : null;
    return { feed: "standings", league, source: `Source: ESPN · ${name} table`, values: { league: name, table, ...(request.team ? { focus } : {}) } };
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

/** "2026/27" for ESPN's season 2026. */
const seasonLabel = (year: number | null) => (year === null ? "" : `${year}/${String((year + 1) % 100).padStart(2, "0")}`);

async function findTeam(base: string, league: LeagueCode, query: string, send: EspnTransport) {
  const teams = Teams.parse(await send(`${base}/site/v2/sports/soccer/${league}/teams`)).sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(t => t.team)));
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

/** One match, from a scoreboard event or a schedule event (which keeps its status on the competition). */
function match(event: z.infer<typeof Scoreboard>["events"][number]): Record<string, MockValue> {
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
