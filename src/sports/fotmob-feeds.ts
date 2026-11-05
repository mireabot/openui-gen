import { z } from "zod";
import type { MockValue } from "../research/dataset-schema.js";
import { SOCCER_LEAGUE_CODES, type SoccerLeagueCode } from "./leagues.js";
import { isTeam, LEAGUES, seasonLabel, venueTotals, type Club, type EspnAnswer, type EspnRequest, type LeagueCode } from "./espn.js";
import { playerTeamKey } from "./fotmob.js";

/**
 * The football feeds on FotMob, for DATA_SOURCE=fotmob: the same requests and the same values as
 * `espnLookup`, so nothing downstream knows which one answered. FotMob has clubs ESPN lacks, so a club
 * outside the six competitions still gets a crest and colour. Its terms forbid automated retrieval:
 * this is for personal research at low volume, and is not for a deployment.
 */

const BASE = "https://www.fotmob.com/api/data";
const TEAM_LOGO = "https://images.fotmob.com/image_resources/logo/teamlogo";
const DAY = 86_400_000;
/** A club's colours need its whole team page, so one screen looks up only this many. */
const COLOUR_LOOKUPS_MAX = 12;

export const FOTMOB_LEAGUES: Readonly<Record<SoccerLeagueCode, number>> = { "eng.1": 47, "esp.1": 87, "ger.1": 54, "ita.1": 55, "uefa.champions": 42, "eng.fa": 132 };

export type FotmobFeedTransport = (url: string) => Promise<unknown>;

async function fetchJSON(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`FotMob HTTP ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

const Id = z.union([z.string(), z.number()]).transform(String);
const Side = z.object({ id: Id, name: z.string(), shortName: z.string().optional(), score: z.number().nullish() }).loose();
const Fixture = z.object({
  id: Id, home: Side, away: Side,
  tournament: z.object({ name: z.string().optional(), leagueId: z.number().optional() }).loose().optional(),
  status: z.object({
    utcTime: z.string(), finished: z.boolean().optional(), started: z.boolean().optional(), cancelled: z.boolean().optional(),
    scoreStr: z.string().optional(), reason: z.object({ short: z.string().optional() }).loose().optional(),
  }).loose(),
}).loose();
type FixtureValue = z.infer<typeof Fixture>;
const Row = z.object({ id: Id, name: z.string(), shortName: z.string().optional(), idx: z.number(), played: z.number(), wins: z.number(), draws: z.number(), losses: z.number(), scoresStr: z.string(), goalConDiff: z.number(), pts: z.number() }).loose();
const League = z.object({
  details: z.object({ selectedSeason: z.string().optional() }).loose().optional(),
  table: z.array(z.object({ data: z.object({ table: z.object({ all: z.array(Row).default([]) }).loose().optional() }).loose() }).loose()).default([]),
  fixtures: z.object({ allMatches: z.array(Fixture).default([]) }).loose().optional(),
  stats: z.object({ players: z.array(z.object({ name: z.string(), fetchAllUrl: z.string() }).loose()).default([]) }).loose().optional(),
}).loose();
type LeagueValue = z.infer<typeof League>;
const StatList = z.object({ TopLists: z.array(z.object({ StatList: z.array(z.object({ ParticipantName: z.string(), TeamName: z.string().optional(), StatValue: z.number() }).loose()).default([]) }).loose()).default([]) }).loose();
const TeamPage = z.object({
  details: z.object({ id: z.number(), name: z.string(), shortName: z.string().optional() }).loose().optional(),
  overview: z.object({ teamColors: z.object({ lightMode: z.string().optional(), darkMode: z.string().optional() }).loose().optional() }).loose().optional(),
  fixtures: z.object({ allFixtures: z.object({ fixtures: z.array(Fixture).default([]) }).loose().optional() }).loose().optional(),
}).loose();
const MatchEvent = z.object({
  type: z.string().optional(), timeStr: z.union([z.string(), z.number()]).optional(), isHome: z.boolean().optional(), ownGoal: z.unknown().optional(), isPenaltyShootoutEvent: z.boolean().optional(),
  nameStr: z.string().optional(), fullName: z.string().optional(), playerId: z.number().nullish(), assistStr: z.string().nullish(), suffix: z.string().nullish(),
}).loose();
const PlayerStats = z.object({ name: z.string(), teamId: z.number(), stats: z.array(z.object({ stats: z.record(z.string(), z.object({ key: z.string().nullish(), stat: z.object({ value: z.unknown().optional() }).loose().nullish() }).loose()).default({}) }).loose()).default([]) }).loose();
const MatchPage = z.object({
  content: z.object({
    matchFacts: z.object({ events: z.object({ events: z.array(MatchEvent).default([]) }).loose().optional() }).loose().nullish(),
    stats: z.object({ Periods: z.object({ All: z.object({ stats: z.array(z.object({ stats: z.array(z.object({ key: z.string().nullish(), stats: z.array(z.unknown()).default([]) }).loose()).default([]) }).loose()).default([]) }).loose().optional() }).loose().optional() }).loose().nullish(),
    playerStats: z.record(z.string(), z.unknown()).nullish(),
  }).loose().optional(),
}).loose();
const Search = z.array(z.object({ suggestions: z.array(z.object({ type: z.string(), id: Id.optional(), name: z.string().optional() }).loose()).default([]) }).loose());
const MatchDay = z.object({ leagues: z.array(z.object({ primaryId: z.number().optional(), id: z.number().optional(), matches: z.array(Fixture).default([]) }).loose()).default([]) }).loose();

const hex = (color: string | undefined) => (color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "");

const colours = new Map<string, { readonly at: number; readonly color: string; readonly alternate: string }>();

/** Colours for these clubs, up to the limit. A club that fails stays without one. */
async function loadColours(ids: readonly string[], send: FotmobFeedTransport, now: number): Promise<void> {
  const missing = [...new Set(ids)].filter(id => { const known = colours.get(id); return !known || now - known.at >= DAY; }).slice(0, COLOUR_LOOKUPS_MAX);
  await Promise.all(missing.map(async id => {
    try {
      const page = TeamPage.parse(await send(`${BASE}/teams?id=${encodeURIComponent(id)}`));
      const palette = page.overview?.teamColors;
      colours.set(id, { at: now, color: hex(palette?.lightMode), alternate: hex(palette?.darkMode) });
    } catch { /* The crest still draws without a colour. */ }
  }));
}

function teamRecord(id: string, name: string, short?: string): Record<string, MockValue> {
  const palette = colours.get(id);
  return { id, name, short: short ?? name, abbreviation: "", color: palette?.color ?? "", alternateColor: palette?.alternate ?? "", logo: `${TEAM_LOGO}/${id}.png` };
}

/** One match in the shape ESPN's feed gives: scores as numbers, null until it starts. */
function match(fixture: FixtureValue): Record<string, MockValue> {
  const { status } = fixture;
  const state = status.finished ? "final" : status.started ? "live" : "scheduled";
  const scores = /^(\d+)\s*-\s*(\d+)/.exec(status.scoreStr ?? "");
  const score = (side: z.infer<typeof Side>, index: 1 | 2) => state === "scheduled" ? null : scores ? Number(scores[index]) : side.score ?? null;
  const side = (team: z.infer<typeof Side>, index: 1 | 2) => ({ ...teamRecord(team.id, team.name, team.shortName), score: score(team, index), winner: false, form: "", record: "" });
  const [home, away] = [side(fixture.home, 1), side(fixture.away, 2)];
  const finished = state === "final" && home.score !== null && away.score !== null;
  return {
    id: fixture.id, date: status.utcTime, state, status: status.reason?.short ?? "", venue: "", broadcast: "",
    home: { ...home, winner: finished && home.score! > away.score! }, away: { ...away, winner: finished && away.score! > home.score! },
  };
}

const leaguePage = async (league: LeagueCode, season: number | null, send: FotmobFeedTransport): Promise<LeagueValue> =>
  League.parse(await send(`${BASE}/leagues?id=${FOTMOB_LEAGUES[league as SoccerLeagueCode]}${season === null ? "" : `&season=${season}/${season + 1}`}`));
const seasonOf = (page: LeagueValue, requested: number | null) => { const year = Number(page.details?.selectedSeason?.slice(0, 4)); return Number.isInteger(year) && year > 0 ? year : requested; };
const rowsOf = (page: LeagueValue) => page.table[0]?.data.table?.all ?? [];
const fixturesOf = (page: LeagueValue) => page.fixtures?.allMatches ?? [];

/** A league's clubs from its table, or from its fixtures for a cup with none. */
function clubsIn(page: LeagueValue): { id: string; name: string; short: string }[] {
  const rows = rowsOf(page).map(row => ({ id: row.id, name: row.name, short: row.shortName ?? row.name }));
  const sides = fixturesOf(page).flatMap(fixture => [fixture.home, fixture.away]).map(side => ({ id: side.id, name: side.name, short: side.shortName ?? side.name }));
  const seen = new Set<string>();
  return [...rows, ...sides].filter(club => !seen.has(club.id) && !!seen.add(club.id));
}

function findTeam(page: LeagueValue, league: LeagueCode, query: string) {
  const team = clubsIn(page).find(club => isTeam({ name: club.name, short: club.short, abbreviation: "" }, query));
  if (!team) throw new Error(`FotMob has no ${LEAGUES[league]} team matching "${query}"`);
  return team;
}

/** A team's season, oldest first, each match with its result from the team's side. */
function seasonMatches(page: LeagueValue, teamId: string) {
  return fixturesOf(page).filter(fixture => !fixture.status.cancelled && (fixture.home.id === teamId || fixture.away.id === teamId))
    .sort((a, b) => a.status.utcTime.localeCompare(b.status.utcTime)).map(fixture => {
      const record = match(fixture);
      const own = fixture.home.id === teamId ? "home" : "away";
      const us = (record[own] as Record<string, MockValue>).score as number | null;
      const them = (record[own === "home" ? "away" : "home"] as Record<string, MockValue>).score as number | null;
      const result = record.state !== "final" || us === null || them === null ? "upcoming" : us > them ? "win" : us < them ? "loss" : "draw";
      return { ...record, venueSide: own, result } as Record<string, MockValue> & { venueSide: "home" | "away" };
    });
}

const goalEvents = (page: z.infer<typeof MatchPage>) => (page.content?.matchFacts?.events?.events ?? []).filter(event => event.type === "Goal" && !event.isPenaltyShootoutEvent);
const scorerName = (event: z.infer<typeof MatchEvent>) => event.fullName ?? event.nameStr ?? "";

/** Goal and assist leaders. FotMob keeps them for past seasons too. */
async function leaders(league: LeagueCode, season: number | null, send: FotmobFeedTransport) {
  const page = await leaguePage(league, season, send);
  const list = async (key: string) => {
    const url = page.stats?.players.find(stat => stat.name === key)?.fetchAllUrl;
    if (!url) return [];
    const all = StatList.parse(await send(url)).TopLists[0]?.StatList ?? [];
    return all.slice(0, 10).map((player, index) => ({ rank: index + 1, name: player.ParticipantName, team: player.TeamName ?? "", teamAbbreviation: "", value: player.StatValue }));
  };
  const [goals, assists] = await Promise.all([list("goals"), list("goal_assist")]);
  return { goals, assists, year: seasonOf(page, season) };
}

/** The last N finished games' goalscorers, added up from match reports, and checked against each final score. */
async function recentScorers(request: EspnRequest, send: FotmobFeedTransport, now: Date): Promise<EspnAnswer> {
  if (!request.team) throw new Error("FotMob scorers needs a team");
  const count = request.lastGames;
  if (!Number.isInteger(count) || count === undefined || count < 1 || count > 20) throw new Error("FotMob scorers needs lastGames between 1 and 20");
  const page = await leaguePage(request.league, request.season ?? null, send);
  const team = findTeam(page, request.league, request.team);
  await loadColours([team.id], send, now.getTime());
  const everywhere = request.allCompetitions !== false && request.season == null;
  const scope = everywhere ? "All competitions" : LEAGUES[request.league];
  const fixtures = everywhere ? (TeamPage.parse(await send(`${BASE}/teams?id=${encodeURIComponent(team.id)}`)).fixtures?.allFixtures?.fixtures ?? []).filter(fixture => !/friendl/i.test(fixture.tournament?.name ?? "")) : fixturesOf(page);
  const selected = fixtures.filter(fixture => fixture.status.finished && !fixture.status.cancelled && (fixture.home.id === team.id || fixture.away.id === team.id) && Date.parse(fixture.status.utcTime) <= now.getTime())
    .sort((a, b) => b.status.utcTime.localeCompare(a.status.utcTime)).slice(0, count);
  if (selected.length !== count) throw new Error(`Only ${selected.length} completed matches available for the requested last ${count}`);
  type Scorer = { name: string; espnId: string; team: string; goals: number };
  const reports = await Promise.all(selected.map(async fixture => {
    const atHome = fixture.home.id === team.id;
    const record = match(fixture);
    const expected = (record[atHome ? "home" : "away"] as Record<string, MockValue>).score;
    if (typeof expected !== "number") throw new Error(`Match ${fixture.id} has no valid final team score`);
    const events = goalEvents(MatchPage.parse(await send(`${BASE}/matchDetails?matchId=${encodeURIComponent(fixture.id)}`))).filter(event => event.isHome === atHome);
    const ownGoals = events.filter(event => event.ownGoal).length;
    const scorers = events.filter(event => !event.ownGoal).map((event): Scorer => {
      if (!scorerName(event).trim()) throw new Error(`Match ${fixture.id} has an unidentified goalscorer`);
      return { name: scorerName(event), espnId: event.playerId ? String(event.playerId) : "", team: team.name, goals: 1 };
    });
    if (scorers.length + ownGoals !== expected) throw new Error(`Match ${fixture.id} scorer data does not reconcile with its ${expected} team goals`);
    return { scorers, ownGoals, goalsFor: expected, match: record };
  }));
  const totals = new Map<string, Scorer>();
  for (const scorer of reports.flatMap(report => report.scorers)) {
    const key = scorer.espnId || scorer.name;
    const existing = totals.get(key);
    if (existing) existing.goals++; else totals.set(key, { ...scorer });
  }
  const scorers = [...totals.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  const period = { requestedGames: count, gamesCounted: selected.length, scope, from: selected.at(-1)!.status.utcTime, to: selected[0]!.status.utcTime };
  const goalsFor = reports.reduce((sum, report) => sum + report.goalsFor, 0);
  const ownGoals = reports.reduce((sum, report) => sum + report.ownGoals, 0);
  return { feed: "scorers", league: request.league, source: `Source: FotMob · ${team.name} last ${count} completed matches · ${scope}`, values: {
    league: LEAGUES[request.league], season: seasonLabel(seasonOf(page, request.season ?? null)),
    scope, requestedGames: count, gamesCounted: selected.length, period, team: teamRecord(team.id, team.name, team.short), scorers, goalsFor, ownGoals,
    matches: reports.map(report => report.match),
    summary: `${team.name} goalscorers over the last ${count} completed matches (${scope}), ${period.from.slice(0, 10)} to ${period.to.slice(0, 10)}. ${goalsFor} team goals, including ${ownGoals} own goals.`,
    leaderboard: {
      title: `Top scorers · ${team.name} · Last ${count} games · ${scope}`, metric: "Goals",
      entries: scorers.map(scorer => ({ name: scorer.name, detail: team.name, value: String(scorer.goals), logo: "", color: colours.get(team.id)?.color ?? "" })),
    },
  } };
}

/** One meeting: score, team stats, the goals and the players who did something. */
async function meetingReport(request: EspnRequest, send: FotmobFeedTransport, now: Date): Promise<EspnAnswer> {
  if (!request.team || !request.opponent) throw new Error("FotMob match needs a team and an opponent");
  const { league } = request;
  const name = LEAGUES[league];
  const inSeason = async (season: number | null) => {
    const page = await leaguePage(league, season, send);
    const team = findTeam(page, league, request.team!);
    const opponent = clubsIn(page).find(club => isTeam({ name: club.name, short: club.short, abbreviation: "" }, request.opponent!));
    const against = opponent ? seasonMatches(page, team.id).filter(m => String((m[m.venueSide === "home" ? "away" : "home"] as Record<string, MockValue>).id) === opponent.id) : [];
    return { team, opponent, year: seasonOf(page, season), played: against.filter(m => m.result !== "upcoming"), upcoming: against.filter(m => m.result === "upcoming") };
  };
  // This season unless one was named; with no meeting played yet, the most recent one last season, labelled as such.
  let found = await inSeason(request.season ?? null);
  let current = request.season == null;
  if (!found.played.length && request.season == null && found.year !== null) {
    found = { ...await inSeason(found.year - 1), upcoming: found.upcoming };
    current = false;
  }
  const meeting = found.played.at(-1);
  if (!meeting || !found.opponent) {
    return { feed: "match", league, source: `Source: FotMob · ${name}`, values: { league: name, played: false, season: seasonLabel(found.year), currentSeason: request.season == null, upcoming: found.upcoming.slice(0, 2) } };
  }
  await loadColours([found.team.id, found.opponent.id], send, now.getTime());
  const page = MatchPage.parse(await send(`${BASE}/matchDetails?matchId=${encodeURIComponent(String(meeting.id))}`));
  const rows = (page.content?.stats?.Periods?.All?.stats ?? []).flatMap(group => group.stats);
  const side = (index: 0 | 1) => {
    const stat = (key: string) => { const raw = rows.find(row => row.key === key && row.stats[index] != null)?.stats[index]; return raw === undefined || raw === "" || Number.isNaN(Number(raw)) ? null : Number(raw); };
    return { possession: stat("BallPossesion"), shots: stat("total_shots"), shotsOnTarget: stat("ShotsOnTarget"), corners: stat("corners"), fouls: stat("fouls"), yellowCards: stat("yellow_cards"), redCards: stat("red_cards"), saves: stat("keeper_saves") };
  };
  const players = (teamId: string) => Object.values(page.content?.playerStats ?? {}).flatMap(raw => { const parsed = PlayerStats.safeParse(raw); return parsed.success ? [parsed.data] : []; }).filter(player => String(player.teamId) === teamId).map(player => {
    const stat = (key: string) => { for (const group of player.stats) for (const entry of Object.values(group.stats)) if (entry.key === key && typeof entry.stat?.value === "number") return entry.stat.value; return 0; };
    return { name: player.name, position: "", goals: stat("goals"), assists: stat("assists"), shots: stat("total_shots"), shotsOnTarget: stat("ShotsOnTarget") };
  }).filter(player => player.goals || player.assists || player.shots).sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.shots - a.shots).slice(0, 8);
  const ownIndex = meeting.venueSide === "home" ? 0 : 1;
  const sideName = (home: boolean | undefined) => String((meeting[home ? "home" : "away"] as Record<string, MockValue>).name);
  const goals = goalEvents(page).map(event => ({
    minute: event.timeStr === undefined ? "" : `${event.timeStr}'`, team: sideName(event.isHome), scorer: scorerName(event),
    assist: (event.assistStr ?? "").replace(/^assist by\s*/i, ""), kind: event.ownGoal ? "Own goal" : /pen/i.test(event.suffix ?? "") ? "Penalty" : "Goal",
  }));
  return { feed: "match", league, source: `Source: FotMob · ${name} match report`, values: {
    league: name, played: true, season: seasonLabel(found.year), currentSeason: current,
    match: meeting, teamStats: side(ownIndex), opponentStats: side(ownIndex === 0 ? 1 : 0), goals,
    teamPlayers: players(found.team.id), opponentPlayers: players(found.opponent.id), upcoming: found.upcoming.slice(0, 2),
  } };
}

export async function fotmobLookup(request: EspnRequest, send: FotmobFeedTransport = fetchJSON, now = new Date()): Promise<EspnAnswer> {
  const { league } = request;
  const name = LEAGUES[league];
  if (request.feed === "scorers") return recentScorers(request, send, now);
  if (request.feed === "match") return meetingReport(request, send, now);
  if (request.feed === "leaders") {
    const { goals, assists, year } = await leaders(league, request.season ?? null, send);
    const season = request.season == null ? {} : { season: seasonLabel(year) };
    return { feed: "leaders", league, source: `Source: FotMob · ${name} leaders${request.season == null ? "" : ` ${seasonLabel(year)}`}`, values: { league: name, ...season, goals, assists } };
  }
  if (request.feed === "scoreboard" && request.dates) {
    if (!/^\d{8}$/.test(request.dates)) throw new Error("FotMob scoreboard dates must be one day, YYYYMMDD");
    const day = MatchDay.parse(await send(`${BASE}/matches?date=${request.dates}`));
    const matches = day.leagues.filter(entry => (entry.primaryId ?? entry.id) === FOTMOB_LEAGUES[league as SoccerLeagueCode]).flatMap(entry => entry.matches).map(match);
    const filtered = request.team ? matches.filter(m => isTeam(m.home as Record<string, MockValue>, request.team!) || isTeam(m.away as Record<string, MockValue>, request.team!)) : matches;
    return { feed: "scoreboard", league, source: `Source: FotMob · ${name} scoreboard`, values: { league: name, matches: filtered } };
  }
  const page = await leaguePage(league, request.season ?? null, send);
  if (request.feed === "teams") {
    const clubs = clubsIn(page);
    return { feed: "teams", league, source: `Source: FotMob · ${name} teams`, values: { league: name, teams: clubs.map(club => teamRecord(club.id, club.name, club.short)) } };
  }
  if (request.feed === "standings") {
    const table = rowsOf(page).map(row => {
      const [goalsFor, goalsAgainst] = row.scoresStr.split("-").map(Number);
      return { rank: row.idx, team: teamRecord(row.id, row.name, row.shortName), played: row.played, won: row.wins, drawn: row.draws, lost: row.losses, goalsFor: goalsFor ?? null, goalsAgainst: goalsAgainst ?? null, goalDifference: row.goalConDiff, points: row.pts } as Record<string, MockValue>;
    }).sort((a, b) => Number(a.rank) - Number(b.rank));
    const focus = request.team ? table.find(row => isTeam(row.team as Record<string, MockValue>, request.team!)) ?? null : null;
    const season = request.season == null ? null : seasonLabel(request.season);
    return { feed: "standings", league, source: `Source: FotMob · ${name} table${season ? ` ${season}` : ""}`, values: { league: name, ...(season ? { season } : {}), table, ...(request.team ? { focus } : {}) } };
  }
  if (request.feed === "schedule") {
    if (!request.team) throw new Error("FotMob schedule needs a team");
    const team = findTeam(page, league, request.team);
    await loadColours([team.id], send, now.getTime());
    const matches = seasonMatches(page, team.id);
    const count = (result: string) => matches.filter(m => m.result === result).length;
    return { feed: "schedule", league, source: `Source: FotMob · ${team.name} ${name} schedule`, values: {
      league: name, season: seasonLabel(seasonOf(page, request.season ?? null)), team: teamRecord(team.id, team.name, team.short), matches, won: count("win"), drawn: count("draw"), lost: count("loss"),
      venues: { home: venueTotals(matches, "home"), away: venueTotals(matches, "away") },
    } };
  }
  // The current matchday: the round of the match nearest to now.
  const fixtures = fixturesOf(page);
  const distance = (fixture: FixtureValue) => Math.abs(Date.parse(fixture.status.utcTime) - now.getTime());
  const nearest = [...fixtures].sort((a, b) => distance(a) - distance(b))[0];
  const round = nearest ? (nearest as { round?: unknown }).round : undefined;
  const matchday = nearest ? fixtures.filter(fixture => round !== undefined ? (fixture as { round?: unknown }).round === round : distance(fixture) <= 3 * DAY) : [];
  const matches = matchday.map(match);
  const filtered = request.team ? matches.filter(m => isTeam(m.home as Record<string, MockValue>, request.team!) || isTeam(m.away as Record<string, MockValue>, request.team!)) : matches;
  return { feed: "scoreboard", league, source: `Source: FotMob · ${name} scoreboard`, values: { league: name, matches: filtered } };
}

let directory: { readonly at: number; readonly clubs: readonly Club[] } | undefined;

/**
 * Every club in the six competitions, for the planner to resolve names, listed under the first
 * competition that has it. Cached for a day; a competition that fails to load is left out. It has
 * crests but no colours: FotMob keeps those on each team's page, so `withClubColours` fetches them
 * for the clubs a screen uses.
 */
export async function fotmobClubDirectory(send: FotmobFeedTransport = fetchJSON, now = Date.now()): Promise<readonly Club[]> {
  if (directory && now - directory.at < DAY) return directory.clubs;
  const leagues = await Promise.all(SOCCER_LEAGUE_CODES.map(async league => {
    try {
      return clubsIn(await leaguePage(league, null, send)).map((club): Club => ({ id: club.id, name: club.name, short: club.short, abbreviation: "", color: "", alternateColor: "", logo: `${TEAM_LOGO}/${club.id}.png`, league }));
    } catch { return []; }
  }));
  const seen = new Set<string>();
  const clubs = leagues.flat().filter(club => !seen.has(club.id) && !!seen.add(club.id));
  if (clubs.length) directory = { at: now, clubs };
  return clubs;
}

/** These clubs with their colours filled in. */
export async function withClubColours<T extends { readonly id: string }>(clubs: readonly T[], send: FotmobFeedTransport = fetchJSON, now = Date.now()): Promise<(T & { color: string; alternateColor: string })[]> {
  await loadColours(clubs.map(club => club.id), send, now);
  return clubs.map(club => ({ ...club, color: colours.get(club.id)?.color ?? "", alternateColor: colours.get(club.id)?.alternate ?? "" }));
}

/** A club by name anywhere FotMob knows it, men's first team only. Null when none matches. */
async function searchClub(name: string, send: FotmobFeedTransport): Promise<Club | null> {
  // FotMob's search finds "Molde", not "Molde FK".
  const key = playerTeamKey(name).split(" ").filter(word => !["fk", "sk", "bk", "if", "ac", "sc", "sv", "vfb", "vfl"].includes(word)).join(" ") || playerTeamKey(name);
  const found = Search.parse(await send(`${BASE}/search/suggest?term=${encodeURIComponent(key)}&hits=5`)).flatMap(group => group.suggestions);
  const team = found.flatMap(entry => entry.type === "team" && entry.id && entry.name ? [{ id: entry.id, name: entry.name }] : [])
    .find(entry => !/\(w\)|\b(?:u\d+|ii|2)$/i.test(entry.name) && (playerTeamKey(entry.name) === key || key.includes(playerTeamKey(entry.name)) || playerTeamKey(entry.name).includes(key)));
  return team ? { id: team.id, name: team.name, short: name, abbreviation: "", color: "", alternateColor: "", logo: `${TEAM_LOGO}/${team.id}.png`, league: "eng.1" } : null;
}

/**
 * The directory, with colours, for the clubs in one dataset. `searched` are club records with no
 * crest, which may be outside the six competitions (Molde, Bryne), so they're searched by name.
 * `known` are names that may be clubs, such as a player's detail line, so only the directory is
 * checked for them: "Striker" must not start a search.
 */
export async function clubsForDataset(base: readonly Club[], searched: readonly string[], known: readonly string[], send: FotmobFeedTransport = fetchJSON, now = Date.now()): Promise<readonly Club[]> {
  const keyOf = (club: Club) => [playerTeamKey(club.name), playerTeamKey(club.short)];
  const inBase = (name: string) => base.find(club => keyOf(club).includes(playerTeamKey(name)));
  const missing = [...new Set(searched)].filter(name => !inBase(name)).slice(0, COLOUR_LOOKUPS_MAX);
  const extra = (await Promise.all(missing.map(name => searchClub(name, send).catch(() => null)))).filter((club): club is Club => !!club);
  const used = [...extra, ...[...searched, ...known].flatMap(name => { const club = inBase(name); return club ? [club] : []; })];
  const coloured = new Map((await withClubColours(used, send, now)).map(club => [club.id, club]));
  return [...extra.map(club => coloured.get(club.id) ?? club), ...base.map(club => coloured.get(club.id) ?? club)];
}
