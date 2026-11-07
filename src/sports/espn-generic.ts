import { z } from "zod";
import { config } from "../config.js";
import type { MockValue } from "../research/dataset-schema.js";
import { colorOf, fetchJSON, findTeam, isTeam, match, Scoreboard, Team, teamRecord, Teams, type EspnAnswer, type EspnRequest, type EspnTransport } from "./espn.js";
import { leagueOf, type LeagueCode } from "./leagues.js";

/**
 * ESPN's feeds for team sports with a record instead of a points table (NFL, NBA), driven by the league
 * registry. One code path for every such league, returning the same envelope as soccer's feeds.
 *
 * ESPN sends box scores and game logs as string arrays described by labels, and labels repeat (`YDS` for
 * passing and rushing), so columns are always read by position. Every record carries every key, because
 * the dataset validator requires it: text is "" and numbers are null when ESPN has nothing.
 */

type Values = Record<string, MockValue>;
type Event = z.infer<typeof Scoreboard>["events"][number];

const MAX_COLUMNS = 7;
const RECENT_GAMES = 20;
const NEXT_GAMES = 5;
const LEADERS = 10;
const BOX_ROWS = 5;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const headshot = (athlete: Record<string, unknown>) => text((isRecord(athlete.headshot) ? athlete.headshot : {}).href);
const positionOf = (athlete: Record<string, unknown>) => text((isRecord(athlete.position) ? athlete.position : {}).abbreviation);

/** A league's season name, or "" when ESPN named none. */
const seasonName = (league: LeagueCode, year: number | null | undefined) => (year == null ? "" : leagueOf(league).seasonLabel(year));

/** A side's score per period as one text ("21 21 33 31"), "" before the game: an empty list would declare no field. */
const periodText = (lines: unknown) => list(lines).map(line => text(line.displayValue)).join(" ");

/** One game: the shared match record, plus each side's scores by period. */
function game(event: Event): Values {
  const base = match(event);
  const periods = (where: "home" | "away") => periodText(event.competitions[0]!.competitors.find(side => side.homeAway === where)?.linescores);
  return { ...base, home: { ...(base.home as Values), periods: periods("home") }, away: { ...(base.away as Values), periods: periods("away") } };
}

/** A game from one team's side. A tie shares soccer's draw code; only the word differs. */
function fromSide(raw: Values, team: { readonly displayName: string }) {
  const own = isTeam(raw.home as Values, team.displayName) ? "home" : "away";
  const us = (raw[own] as Values).score;
  const them = (raw[own === "home" ? "away" : "home"] as Values).score;
  const result = raw.state !== "final" || typeof us !== "number" || typeof them !== "number" ? "upcoming" : us > them ? "win" : us < them ? "loss" : "draw";
  return { ...raw, venueSide: own, result } as Values & { venueSide: "home" | "away"; result: string };
}

const HEAT = { win: ["Win", "tone.good.fg"], loss: ["Loss", "tone.bad.fg"], draw: ["Tie", "outline.control"], upcoming: ["Upcoming", "surface.filled"] } as const;

/** A season as one short row per game, ready for a FixturesHeatmap. */
function resultRow(m: Values & { venueSide: "home" | "away"; result: string }): Values {
  const [label, fill] = HEAT[m.result as keyof typeof HEAT];
  const opponent = m[m.venueSide === "home" ? "away" : "home"] as Values;
  const own = m[m.venueSide] as Values;
  return { date: text(m.date), opponent: text(opponent.name), venueSide: m.venueSide, result: m.result, score: m.result === "upcoming" ? "" : `${String(own.score)}-${String(opponent.score)}`, label, fill };
}

function record(games: readonly (Values & { result: string })[]) {
  const count = (result: string) => games.filter(g => g.result === result).length;
  const [won, lost, tied] = [count("win"), count("loss"), count("draw")];
  return { played: won + lost + tied, won, lost, tied, record: tied ? `${won}-${lost}-${tied}` : `${won}-${lost}` };
}

async function seasonGames(league: LeagueCode, team: z.infer<typeof Team>, season: number | null | undefined, send: EspnTransport) {
  const url = `${config().ESPN_BASE_URL}/site/v2/sports/${leagueOf(league).espnPath}/teams/${encodeURIComponent(team.id)}/schedule`;
  const data = Scoreboard.parse(await send(season == null ? url : `${url}?season=${season}`));
  const games = data.events.map(game).sort((a, b) => String(a.date).localeCompare(String(b.date))).map(raw => fromSide(raw, team));
  return { year: data.requestedSeason?.year ?? season ?? null, games };
}

/** Columns kept for a phone, as positions into the row: the league's preferred ones, else the first few. */
function keptColumns(labels: readonly string[], preferred: readonly string[]) {
  const picked = preferred.flatMap(name => { const at = labels.indexOf(name); return at < 0 ? [] : [at]; });
  return (picked.length ? picked : labels.map((_, at) => at)).slice(0, MAX_COLUMNS);
}

/** A table the RecordTable component can draw as it stands. */
function statTable(title: string, labels: readonly string[], rows: readonly { readonly label: string; readonly stats: readonly unknown[]; readonly extra?: Values }[], preferred: readonly string[]): Values {
  const kept = keptColumns(labels, preferred);
  return {
    heading: title, columnCount: String(kept.length || 1), columns: kept.map(at => ({ label: labels[at]! })),
    rows: rows.map(row => ({ label: row.label, ...row.extra, cells: kept.map(at => ({ value: text(row.stats[at]) })) })),
  };
}

const athleteRecord = (athlete: Record<string, unknown>, team: string, color = ""): Values => ({
  athleteId: text(athlete.id), name: text(athlete.displayName), kind: "player", position: positionOf(athlete), jersey: text(athlete.jersey),
  logo: headshot(athlete), team, detail: [positionOf(athlete), team].filter(Boolean).join(" · "), color, status: text((isRecord(athlete.status) ? athlete.status : {}).name),
});

const nameWords = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(" ");

async function rosterOf(league: LeagueCode, team: z.infer<typeof Team>, send: EspnTransport) {
  const data = await send(`${config().ESPN_BASE_URL}/site/v2/sports/${leagueOf(league).espnPath}/teams/${encodeURIComponent(team.id)}/roster`);
  // The NFL groups a roster by position; the NBA lists it flat.
  const athletes = list(isRecord(data) ? data.athletes : []).flatMap(entry => (Array.isArray(entry.items) ? list(entry.items) : [entry]));
  return { athletes, coach: isRecord(data) ? list(data.coach)[0] : undefined };
}

/** A player's ESPN id: from the team's roster when a team is named, else from search within the league. */
async function findAthlete(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<string> {
  const name = request.player?.trim();
  if (!name) throw new Error(`ESPN ${request.feed} needs a player`);
  if (request.team) {
    const team = await findTeam(config().ESPN_BASE_URL, league, request.team, send);
    const { athletes } = await rosterOf(league, team, send);
    const found = athletes.find(a => nameWords(text(a.displayName)) === nameWords(name));
    if (found) return text(found.id);
  }
  const data = await send(`${config().ESPN_WEB_BASE_URL}/search/v2?query=${encodeURIComponent(name)}&limit=5&type=player`);
  const contents = list(isRecord(data) ? data.results : []).filter(group => group.type === "player").flatMap(group => list(group.contents));
  const uid = (content: Record<string, unknown>) => /^s:\d+~l:(\d+)~a:(\d+)$/.exec(text(content.uid));
  const inLeague = contents.filter(content => uid(content)?.[1] === leagueOf(league).espnLeagueId);
  const exact = inLeague.find(content => nameWords(text(content.displayName)) === nameWords(name)) ?? inLeague[0];
  const id = exact && uid(exact)?.[2];
  if (!id) throw new Error(`ESPN has no ${leagueOf(league).name} player matching "${name}"`);
  return id;
}

const athleteUrl = (league: LeagueCode, id: string, suffix = "") => `${config().ESPN_WEB_BASE_URL}/common/v3/sports/${leagueOf(league).espnPath}/athletes/${encodeURIComponent(id)}${suffix}`;

async function athleteIdentity(league: LeagueCode, id: string, send: EspnTransport) {
  const data = await send(athleteUrl(league, id));
  const athlete = isRecord(data) && isRecord(data.athlete) ? data.athlete : {};
  const team = isRecord(athlete.team) ? athlete.team : {};
  return { athlete, record: athleteRecord(athlete, text(team.displayName), colorOf(text(team.color))) };
}

async function standings(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<Values> {
  const url = `${config().ESPN_BASE_URL}/v2/sports/${leagueOf(league).espnPath}/standings?level=3`;
  const data = await send(request.season == null ? url : `${url}&season=${request.season}`);
  const conferences = list(isRecord(data) ? data.children : []);
  const table = conferences.flatMap(conference => list(conference.children).flatMap(division =>
    list(isRecord(division.standings) ? division.standings.entries : []).map((entry, at) => {
      const stats = list(entry.stats);
      const stat = (name: string) => stats.find(s => s.name === name);
      const shown = (name: string) => text(stat(name)?.displayValue) || text(stat(name)?.summary);
      const value = (name: string) => numberOrNull(stat(name)?.value);
      const [won, lost, tied] = [value("wins"), value("losses"), value("ties") ?? 0];
      return {
        seed: value("playoffSeed"), team: teamRecord(Team.parse(entry.team)), conference: text(conference.name), division: text(division.name), divisionRank: at + 1,
        played: won === null || lost === null ? null : won + lost + tied, won, lost, tied,
        // The NBA names no overall record, so build it for every league.
        record: won === null || lost === null ? shown("overall") : tied ? `${won}-${lost}-${tied}` : `${won}-${lost}`, winPercent: shown("winPercent"), gamesBehind: shown("gamesBehind"), streak: shown("streak"),
        pointsFor: value("pointsFor"), pointsAgainst: value("pointsAgainst"), differential: shown("differential"), home: shown("Home"), road: shown("Road"), conferenceRecord: shown("vs. Conf."), lastTen: shown("Last Ten Games"),
      } as Values;
    })));
  table.sort((a, b) => String(a.conference).localeCompare(String(b.conference)) || Number(a.seed ?? 99) - Number(b.seed ?? 99));
  const focus = request.team ? table.find(row => isTeam(row.team as Values, request.team!)) ?? null : null;
  const season = seasonName(league, request.season);
  return { league: leagueOf(league).name, ...(season ? { season } : {}), table,
    ...(request.team ? { focus, group: focus ? table.filter(row => row.division === focus.division).sort((a, b) => Number(a.divisionRank) - Number(b.divisionRank)) : [] } : {}) };
}

async function leaders(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<Values> {
  const query = request.season == null ? "" : `?season=${request.season}&seasontype=2`;
  const data = await send(`${config().ESPN_WEB_BASE_URL}/site/v3/sports/${leagueOf(league).espnPath}/leaders${query}`);
  const categories = list(isRecord(data) && isRecord(data.leaders) ? data.leaders.categories : []);
  const leaderboards = leagueOf(league).leaderCategories.flatMap(key => {
    const category = categories.find(c => c.name === key);
    if (!category) return [];
    const entries = list(category.leaders).slice(0, LEADERS).map((entry, at) => {
      const athlete = isRecord(entry.athlete) ? entry.athlete : {};
      const team = isRecord(entry.team) ? entry.team : {};
      return { rank: at + 1, athleteId: text(athlete.id), name: text(athlete.displayName), kind: "player", detail: text(team.displayName), team: text(team.displayName), value: text(entry.displayValue), logo: headshot(athlete), color: colorOf(text(team.color)) };
    });
    return [{ key, heading: text(category.displayName), metric: text(category.abbreviation) || text(category.displayName), entries } as Values];
  });
  const season = seasonName(league, request.season);
  return { league: leagueOf(league).name, ...(season ? { season } : {}), leaderboards };
}

/** The last meeting between two teams: score, each side's team stats, top players per stat group and how the scoring went. */
async function meeting(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<EspnAnswer> {
  const name = leagueOf(league).name;
  if (!request.team || !request.opponent) throw new Error("ESPN match needs a team and an opponent");
  const team = await findTeam(config().ESPN_BASE_URL, league, request.team, send);
  const { year, games } = await seasonGames(league, team, request.season, send);
  const against = games.filter(g => isTeam(g[g.venueSide === "home" ? "away" : "home"] as Values, request.opponent!));
  const played = against.filter(g => g.result !== "upcoming");
  const upcoming = against.filter(g => g.result === "upcoming").slice(0, 2);
  const last = played.at(-1);
  if (!last) return { feed: "match", league, source: `Source: ESPN · ${name}`, values: { league: name, played: false, season: seasonName(league, year), currentSeason: request.season == null, upcoming } };
  const summary = await send(`${config().ESPN_BASE_URL}/site/v2/sports/${leagueOf(league).espnPath}/summary?event=${encodeURIComponent(String(last.id))}`);
  const box = isRecord(summary) && isRecord(summary.boxscore) ? summary.boxscore : {};
  const opponentId = String((last[last.venueSide === "home" ? "away" : "home"] as Values).id);
  const teamId = (entry: Record<string, unknown>) => text((isRecord(entry.team) ? entry.team : {}).id);
  const teamStats = (id: string) => list(list(box.teams).find(entry => teamId(entry) === id)?.statistics).map(stat => ({ key: text(stat.name), label: text(stat.label), display: text(stat.displayValue) }));
  const tables = (id: string) => list(list(box.players).find(entry => teamId(entry) === id)?.statistics).flatMap(group => {
    const labels = Array.isArray(group.labels) ? group.labels.map(text) : [];
    const rows = list(group.athletes).filter(row => Array.isArray(row.stats) && row.stats.length).slice(0, leagueOf(league).boxColumns.length ? 8 : BOX_ROWS).map(row => {
      const athlete = isRecord(row.athlete) ? row.athlete : {};
      return { label: text(athlete.displayName), stats: row.stats as unknown[], extra: { athleteId: text(athlete.id), position: positionOf(athlete), logo: headshot(athlete) } };
    });
    return rows.length ? [statTable(text(group.text) || text(group.name) || "Box score", labels, rows, leagueOf(league).boxColumns)] : [];
  });
  const scoring = list(isRecord(summary) ? summary.scoringPlays : []).map(play => ({
    text: text(play.text), period: numberOrNull((isRecord(play.period) ? play.period : {}).number), clock: text((isRecord(play.clock) ? play.clock : {}).displayValue),
    kind: text((isRecord(play.scoringType) ? play.scoringType : {}).displayName), homeScore: numberOrNull(play.homeScore), awayScore: numberOrNull(play.awayScore),
  }));
  // A schedule leaves period scores empty; the summary's header has them.
  const header = isRecord(summary) && isRecord(summary.header) ? list(summary.header.competitions)[0] : undefined;
  const periodsFrom = (side: "home" | "away") => periodText(list(header?.competitors).find(c => c.homeAway === side)?.linescores);
  const withPeriods = { ...last, home: { ...(last.home as Values), periods: periodsFrom("home") }, away: { ...(last.away as Values), periods: periodsFrom("away") } };
  return { feed: "match", league, source: `Source: ESPN · ${name} box score`, values: {
    league: name, played: true, season: seasonName(league, year), currentSeason: request.season == null,
    match: withPeriods, teamStats: teamStats(team.id), opponentStats: teamStats(opponentId), teamTables: tables(team.id), opponentTables: tables(opponentId), scoring, upcoming,
  } };
}

async function teamStats(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<Values> {
  if (!request.team) throw new Error("ESPN teamStats needs a team");
  const team = await findTeam(config().ESPN_BASE_URL, league, request.team, send);
  const url = `${config().ESPN_BASE_URL}/site/v2/sports/${leagueOf(league).espnPath}/teams/${encodeURIComponent(team.id)}/statistics`;
  const data = await send(request.season == null ? url : `${url}?season=${request.season}`);
  const results = isRecord(data) && isRecord(data.results) && isRecord(data.results.stats) ? data.results.stats : {};
  const categories = list(results.categories);
  return { league: leagueOf(league).name, team: teamRecord(team), season: seasonName(league, request.season), categories: leagueOf(league).teamStatCategories.flatMap(key => {
    const category = categories.find(c => c.name === key);
    if (!category) return [];
    return [{ key, title: text(category.displayName) || key, stats: list(category.stats).slice(0, 10).map(stat => ({ key: text(stat.name), label: text(stat.displayName), display: text(stat.displayValue), value: numberOrNull(stat.value) })) }];
  }) };
}

async function roster(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<Values> {
  if (!request.team) throw new Error("ESPN roster needs a team");
  const team = await findTeam(config().ESPN_BASE_URL, league, request.team, send);
  const { athletes, coach } = await rosterOf(league, team, send);
  const color = colorOf(team.color);
  return { league: leagueOf(league).name, team: teamRecord(team), coach: coach ? [text(coach.firstName), text(coach.lastName)].filter(Boolean).join(" ") : "",
    athletes: athletes.map(athlete => athleteRecord(athlete, team.displayName, color)) };
}

/**
 * The outlet behind an injury note, which ESPN gives only in prose: "…, Darren Urban of the
 * Cardinals' official site reports." → "Cardinals' official site". "the team's" becomes the team's
 * name ("Arizona Cardinals" → "Cardinals'"). "" when the note names no one.
 */
export function reportSource(comment: string, team = ""): string {
  const byline = comment.match(/,\s*([^,]+?)\s+reports?\.?\s*$/)?.[1]?.replace(/^["“”]\s*/, "").trim();
  if (!byline) return "";
  const outlet = (byline.match(/\sof\s+(.+)$/)?.[1] ?? byline).replace(/^the\s+/, "");
  const nickname = team.trim().split(/\s+/).at(-1);
  return nickname ? outlet.replace(/^team's\b/, `${nickname}'`) : outlet;
}

async function injuries(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<Values> {
  const data = await send(`${config().ESPN_BASE_URL}/site/v2/sports/${leagueOf(league).espnPath}/injuries`);
  const groups = list(isRecord(data) ? data.injuries : []);
  const wanted = request.team ? groups.filter(group => isTeam({ name: text(group.displayName), short: text(group.displayName), abbreviation: "" }, request.team!)) : groups;
  // ESPN's report also lists players who have returned, marked Active: they are not hurt.
  const rows = wanted.flatMap(group => list(group.injuries).filter(injury => text(injury.status) !== "Active").map(injury => {
    const athlete = isRecord(injury.athlete) ? injury.athlete : {};
    const details = isRecord(injury.details) ? injury.details : {};
    const where = [text(details.side), text(details.type)].filter(side => side && side !== "Not Specified").join(" ");
    return { name: text(athlete.displayName), kind: "player", team: text(group.displayName), position: positionOf(athlete), logo: headshot(athlete),
      injuryStatus: text(injury.status), injury: where, returnDate: text(details.returnDate), reportedBy: reportSource(text(injury.shortComment), text(group.displayName)), detail: text(injury.shortComment) || [text(injury.status), where].filter(Boolean).join(" · "), date: text(injury.date) };
  }));
  // An empty list is an answer: nobody is reported hurt.
  return { league: leagueOf(league).name, ...(request.team ? { team: request.team } : {}), count: rows.length, injuries: rows.slice(0, 30) };
}

/**
 * A player's teams, from the season rows of ESPN's athlete stats: each row names its team, a trade
 * puts two rows in one season, and a "Totals" row names none. Consecutive seasons with one team are
 * one spell. Shaped as a ClubTimeline record, opening on the current team. A season with no stats
 * (a year out injured, or on a practice squad) is not in the rows, so it is not in the career.
 */
export function careerOf(stats: unknown): { initial: number; clubs: Record<string, MockValue>[] } {
  const teams = isRecord(stats) && isRecord(stats.teams) ? stats.teams : {};
  const bySlug = new Map(Object.values(teams).filter(isRecord).map(team => [text(team.slug), team]));
  const startYear = (season: string) => Number(season.slice(0, 4)) || 0;
  const seen = new Set<string>();
  const rows = list(isRecord(stats) ? stats.categories : []).flatMap(category => list(category.statistics).flatMap((row, order) => {
    const season = text((isRecord(row.season) ? row.season : {}).displayName);
    const slug = text(row.teamSlug);
    if (!season || !bySlug.has(slug) || seen.has(`${season}|${slug}`)) return [];
    seen.add(`${season}|${slug}`);
    return [{ season, slug, order }];
  })).sort((a, b) => startYear(a.season) - startYear(b.season) || a.order - b.order);
  const spells: { slug: string; first: string; last: string }[] = [];
  for (const row of rows) {
    const current = spells.at(-1);
    if (current?.slug === row.slug) current.last = row.season; else spells.push({ slug: row.slug, first: row.season, last: row.season });
  }
  const clubs = spells.map(spell => {
    const team = bySlug.get(spell.slug)!;
    const logos = list(team.logos);
    return { id: `${spell.slug}-${spell.first}`, name: text(team.displayName), year: String(startYear(spell.first)),
      dates: spell.first === spell.last ? spell.first : `${spell.first} – ${spell.last}`, location: text(team.location),
      logo: text(logos[0]?.href), color: colorOf(text(team.color)), marker: "none", stats: [] };
  });
  return { initial: Math.max(0, clubs.length - 1), clubs };
}

async function athlete(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<Values> {
  const id = await findAthlete(league, request, send);
  const { athlete: raw, record: player } = await athleteIdentity(league, id, send);
  const summary = isRecord(raw.statsSummary) ? raw.statsSummary : {};
  const stats = await send(athleteUrl(league, id, "/stats"));
  const tables = list(isRecord(stats) ? stats.categories : []).slice(0, 3).map(category => {
    const labels = Array.isArray(category.labels) ? category.labels.map(text) : [];
    const rows = list(category.statistics).slice(-3).reverse().map(row => ({ label: text((isRecord(row.season) ? row.season : {}).displayName), stats: Array.isArray(row.stats) ? row.stats as unknown[] : [] }));
    return statTable(text(category.displayName) || text(category.name), labels, rows, leagueOf(league).boxColumns);
  });
  return { league: leagueOf(league).name, player, career: careerOf(stats), seasonSummary: text(summary.displayName),
    seasonStats: list(summary.statistics).map(stat => ({ key: text(stat.name), label: text(stat.shortDisplayName) || text(stat.displayName), display: text(stat.displayValue), value: numberOrNull(stat.value), rank: text(stat.rankDisplayValue) })), tables };
}

async function gamelog(league: LeagueCode, request: EspnRequest, send: EspnTransport): Promise<Values> {
  const id = await findAthlete(league, request, send);
  const { record: player } = await athleteIdentity(league, id, send);
  const url = athleteUrl(league, id, "/gamelog");
  const data = await send(request.season == null ? url : `${url}?season=${request.season}`);
  if (!isRecord(data)) throw new Error("ESPN gamelog returned no data");
  const labels = Array.isArray(data.labels) ? data.labels.map(text) : [];
  const events = isRecord(data.events) ? data.events : {};
  const regular = list(data.seasonTypes).find(type => /regular/i.test(text(type.displayName))) ?? list(data.seasonTypes)[0];
  const rows = list(regular?.categories).flatMap(category => (category.type === "event" || category.type === undefined ? list(category.events) : []));
  const count = request.lastGames ?? 10;
  const games = rows.flatMap(row => {
    const event = events[text(row.eventId)];
    if (!isRecord(event)) return [];
    const opponent = isRecord(event.opponent) ? event.opponent : {};
    const label = [`${text(event.atVs)} ${text(opponent.abbreviation)}`.trim(), [text(event.gameResult), text(event.score)].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    return [{ label, stats: Array.isArray(row.stats) ? row.stats as unknown[] : [], extra: { date: text(event.gameDate) } }];
  }).sort((a, b) => b.extra.date.localeCompare(a.extra.date)).slice(0, count);
  return { league: leagueOf(league).name, player, requestedGames: count, gamesCounted: games.length, log: statTable(`Last ${games.length} games`, labels, games, leagueOf(league).boxColumns) };
}

export async function genericLookup(request: EspnRequest, send: EspnTransport = fetchJSON, _now = new Date()): Promise<EspnAnswer> {
  const league = request.league;
  const name = leagueOf(league).name;
  const base = config().ESPN_BASE_URL;
  const path = leagueOf(league).espnPath;
  const about = request.player ?? request.team ?? "";
  const source = (what: string) => `Source: ESPN · ${about ? `${about} ` : ""}${name} ${what}`;
  switch (request.feed) {
    case "teams": {
      const data = Teams.parse(await send(`${base}/site/v2/sports/${path}/teams`));
      return { feed: "teams", league, source: `Source: ESPN · ${name} teams`, values: { league: name, teams: data.sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(t => teamRecord(t.team)))) } };
    }
    case "standings": return { feed: "standings", league, source: `Source: ESPN · ${name} standings`, values: await standings(league, request, send) };
    case "leaders": return { feed: "leaders", league, source: `Source: ESPN · ${name} leaders`, values: await leaders(league, request, send) };
    case "match": return meeting(league, request, send);
    case "teamStats": return { feed: "teamStats", league, source: source("team stats"), values: await teamStats(league, request, send) };
    case "roster": return { feed: "roster", league, source: source("roster"), values: await roster(league, request, send) };
    case "injuries": return { feed: "injuries", league, source: source("injuries"), values: await injuries(league, request, send) };
    case "athlete": return { feed: "athlete", league, source: source("stats"), values: await athlete(league, request, send) };
    case "gamelog": return { feed: "gamelog", league, source: source("game log"), values: await gamelog(league, request, send) };
    case "schedule": {
      if (!request.team) throw new Error("ESPN schedule needs a team");
      const team = await findTeam(base, league, request.team, send);
      const { year, games } = await seasonGames(league, team, request.season, send);
      const [home, away] = [record(games.filter(g => g.venueSide === "home")), record(games.filter(g => g.venueSide === "away"))];
      const played = games.filter(g => g.result !== "upcoming");
      const next = games.filter(g => g.result === "upcoming").slice(0, NEXT_GAMES);
      return { feed: "schedule", league, source: `Source: ESPN · ${team.displayName} ${name} schedule`, values: {
        league: name, season: seasonName(league, year), team: teamRecord(team), ...record(games), venues: { home, away },
        matches: [...played.slice(-RECENT_GAMES), ...next], results: games.map(resultRow),
      } };
    }
    case "scoreboard": {
      if (request.dates && !/^\d{8}$/.test(request.dates)) throw new Error("ESPN scoreboard dates must be one day, YYYYMMDD");
      const params = request.week != null ? `?seasontype=2&week=${request.week}${request.season == null ? "" : `&dates=${request.season}`}` : request.dates ? `?dates=${request.dates}` : "";
      const data = Scoreboard.parse(await send(`${base}/site/v2/sports/${path}/scoreboard${params}`));
      const games = data.events.map(game);
      const matches = request.team ? games.filter(g => isTeam(g.home as Values, request.team!) || isTeam(g.away as Values, request.team!)) : games;
      return { feed: "scoreboard", league, source: `Source: ESPN · ${name} scoreboard`, values: { league: name, matches } };
    }
    case "scorers": throw new Error(`ESPN has no ${name} scorers feed`);
  }
}
