import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FIXTURES } from "./espn-replay.js";
import { fitHeatmaps, placements, withStatBars } from "../src/sports/components.js";
import { LEAGUES, withMatchCards } from "../src/sports/espn.js";
import { leagueOf, sportOf } from "../src/sports/leagues.js";

/**
 * NBA and NFL samples for the parity suite, built from the recorded ESPN responses
 * (scripts/fixtures/goldens), so the Components page, the iOS gallery and the parity tests show real
 * teams, players and figures as OpenUI records.
 *
 * MatchCard, RecordTable, Leaderboard, TeamDetail and ClubTimeline records are what the server's own
 * passes make of a feed answer (withMatchCards, withStatBars, placements). The other components are
 * shaped by the dataset designer in a live run, so their records are written here from the same
 * answers, in the shape each contract asks for; fixtureSuite checks every one with `fits`.
 */

type Values = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type League = "nba" | "nfl";
const golden = (name: string): Values => JSON.parse(readFileSync(path.join(FIXTURES, "goldens", `${name}.json`), "utf8")).answer;

/** A feed answer as research hands it on: match cards and stat bars added by the server. */
function feed(name: string): Values {
  const { league, values } = golden(name);
  const key = league as keyof typeof LEAGUES;
  return { status: "complete", question: name, title: name, ...withStatBars(withMatchCards(values, LEAGUES[key], leagueOf(key).defaultTimeZone, sportOf(key))) };
}

/** The record a component fits at `keys` in an answer, as the briefing offers it to the writer. */
function placed(answer: Values, component: string, pick: (record: Values) => boolean = () => true): Values {
  for (const placement of placements(answer)) {
    if (placement.component.name !== component) continue;
    const found = placement.keys.reduce<unknown>((value, key) => (value as Values)?.[key], answer);
    const record = (placement.list ? (found as Values[]) : [found as Values]).find(pick);
    if (record) return record;
  }
  throw new Error(`No ${component} record in ${String(answer.question)}`);
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const number = (text: string) => { const parsed = Number.parseFloat(String(text).replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : 0; };

interface Setup { readonly team: string; readonly match: string; readonly statBar: string; readonly leaders: string; readonly box: RegExp; readonly top: { readonly heading: string; readonly metric: string; readonly column: string; readonly table: RegExp } }
const SETUP: Record<League, Setup> = {
  nba: { team: "Los Angeles Lakers", match: "nba-match", statBar: "Field Goal %", leaders: "Points Per Game", box: /./, top: { heading: "Top scorers", metric: "Points", column: "PTS", table: /./ } },
  nfl: { team: "Kansas City Chiefs", match: "nfl-match-overtime", statBar: "Total Yards", leaders: "Passing Yards", box: /Receiving/, top: { heading: "Top rushers", metric: "Yards", column: "YDS", table: /Rushing/ } },
};

function league(key: League): Record<string, Values> {
  const setup = SETUP[key];
  const directory = golden(`${key}-teams`).values.teams as Values[];
  const colour = (team: Values) => (directory.find(t => t.id === team.id || t.name === team.name)?.color as string | undefined) || "";
  const report = feed(setup.match);
  const schedule = golden(`${key}-schedule`).values;
  const standings = golden(`${key}-standings`).values;
  const athlete = feed(`${key}-athlete`);
  const game = report.match as Values;
  const [homeStats, awayStats] = game.home.name === setup.team ? [report.teamStats, report.opponentStats] : [report.opponentStats, report.teamStats];

  // One stat across both sides, the side ahead in "good".
  const stat = (stats: Values[]) => stats.find(item => item.label === setup.statBar) ?? assert.fail(`${key} has no team stat "${setup.statBar}"`);
  const [home, away] = [stat(homeStats), stat(awayStats)];
  const ahead = (mine: string, theirs: string) => (number(mine) > number(theirs) ? "good" : "neutral");
  const statBar = {
    label: setup.statBar, homeDisplay: home.display, awayDisplay: away.display,
    sides: [
      { label: game.home.name, count: number(home.display), tone: ahead(home.display, away.display), color: colour(game.home) },
      { label: game.away.name, count: number(away.display), tone: ahead(away.display, home.display), color: colour(game.away) },
    ],
  };

  // The season, oldest first: the schedule's results already carry their label and fill.
  const results = (schedule.results as Values[]).map(row => ({ label: row.label, fill: row.fill }));
  const heatmapAnswer = { record: { value: schedule.record, caption: `Record · ${key.toUpperCase()} ${schedule.season}`, results, tally: `${schedule.won} won · ${schedule.lost} lost${schedule.tied ? ` · ${schedule.tied} tied` : ""}`, columns: "" } };
  const heatmap = ((fitHeatmaps({ values: { answers: { q1: heatmapAnswer } }, fields: [] }).values.answers as Values).q1 as Values).record as Values;

  // The team among its conference neighbours: one either side, or the two below first place.
  const focus = standings.focus as Values;
  const conference = (standings.table as Values[]).filter(row => row.conference === focus.conference);
  const at = conference.findIndex(row => row.team.id === focus.team.id);
  const start = Math.max(0, Math.min(at - 1, conference.length - 3));
  const standing = {
    place: ordinal(focus.seed),
    gaps: `${focus.record} · ${focus.gamesBehind === "-" ? "leads" : `${focus.gamesBehind} games behind in`} the ${focus.conference}`,
    rows: conference.slice(start, start + 3).map(row => {
      const own = row.team.id === focus.team.id;
      return { rank: String(row.seed), name: row.team.name, points: row.record, surface: own ? "filled" : "none", ink: own ? "primary" : "secondary", weight: own ? "medium" : "regular" };
    }),
    home: { detail: `Home ${focus.home}` }, away: { detail: `Road ${focus.road}` }, showVenues: true,
  };

  // A player's season, with no rating: team sports have none.
  const player = athlete.player as Values;
  const statsCard = {
    kind: "player", name: player.name, detail: `${player.team} · ${player.position}`, logo: player.logo, color: player.color,
    rating: { value: "", tone: "neutral", fill: "none", ink: "ink.secondary", label: "", caption: "", show: false },
    stats: (athlete.seasonStats as Values[]).slice(0, 4).map(item => ({ label: item.label, value: item.display })), showStats: true,
  };

  // Each side's leaders in one game, by the league's main number.
  const sideOf = (team: Values) => {
    const tables = (team.name === setup.team ? report.teamTables : report.opponentTables) as Values[];
    const table = tables.find(item => setup.top.table.test(item.heading)) ?? tables[0]!;
    const column = (table.columns as Values[]).findIndex(c => c.label === setup.top.column);
    const club = { name: team.name, logo: team.logo, color: "clear" };
    return (table.rows as Values[])
      .map(row => ({ present: true, name: row.label, kind: "player", detail: row.position ?? "", logo: row.logo ?? "", color: colour(team), value: String(row.cells[column]?.value ?? ""), fill: "surface.filled", ink: "ink.primary", club }))
      .sort((a, b) => number(b.value) - number(a.value));
  };
  const absent = { present: false, name: "", kind: "player", detail: "", logo: "", color: "", value: "", fill: "surface.filled", ink: "ink.primary", club: { name: "", logo: "", color: "" } };
  const [homeSide, awaySide] = [sideOf(game.home), sideOf(game.away)];
  const topPlayers = {
    heading: `${setup.top.heading} · ${game.home.short ?? game.home.name} ${game.home.score}-${game.away.score} ${game.away.short ?? game.away.name}`,
    metric: setup.top.metric,
    rows: Array.from({ length: Math.min(3, Math.max(homeSide.length, awaySide.length)) }, (_, i) => ({ home: homeSide[i] ?? absent, away: awaySide[i] ?? absent })),
  };

  return {
    MatchCard: placed(report, "MatchCard"),
    StatBar: statBar,
    StatsCard: statsCard,
    LeagueStanding: standing,
    FixturesHeatmap: heatmap,
    Leaderboard: placed(golden(`${key}-leaders`).values, "Leaderboard", board => board.heading === setup.leaders),
    RecordTable: placed(report, "RecordTable", table => setup.box.test(String(table.heading))),
    MatchTopPlayers: topPlayers,
    TeamDetail: placed(athlete, "TeamDetail"),
    ClubTimeline: placed(athlete, "ClubTimeline"),
  };
}

// The box score's team tables are the named team's: every Lakers row is on the Lakers roster.
const lakersBox = (golden("nba-match").values.teamTables[0].rows as Values[]).map(row => row.label as string);
const lakersRoster = new Set((golden("nba-roster").values.athletes as Values[]).map(athlete => athlete.name));
assert.ok(lakersBox.every(name => lakersRoster.has(name)), `the Lakers box score lists only Lakers: ${lakersBox.join(", ")}`);

const nba = league("nba");
const nfl = league("nfl");
/** Recorded 5 Nov 2026 from ESPN. `{ Component: { nba, nfl } }`, merged into the parity samples. */
export const TEAM_SAMPLES: Readonly<Record<string, Readonly<Record<League, Values>>>> = Object.fromEntries(Object.keys(nba).map(name => [name, { nba: nba[name]!, nfl: nfl[name]! }]));
