import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FIXTURES } from "./espn-replay.js";

/**
 * NBA and NFL samples for the web Components page, built from the recorded ESPN responses, so the page
 * shows real teams, players and figures. `--check` fails when the committed file is stale.
 */
type Values = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const OUT = path.join(import.meta.dirname, "..", "preview/components/catalog/sports-components/team-sports-data.json");
const golden = (name: string): Values => JSON.parse(readFileSync(path.join(FIXTURES, "goldens", `${name}.json`), "utf8")).answer.values;

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(iso));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(iso));
const ordinalSeason = (values: Values) => String(values.season ?? "");

interface League { readonly key: "nba" | "nfl"; readonly match: string; readonly team: string; readonly statBars: readonly string[]; readonly leaderboards: readonly string[]; readonly topTable: { readonly title: string; readonly metric: string; readonly valueColumn: string; readonly table: RegExp }; readonly boxTable: RegExp }

const LEAGUES: readonly League[] = [
  { key: "nba", match: "nba-match", team: "Los Angeles Lakers", statBars: ["Field Goal %", "Three Point %", "Rebounds", "Assists", "Turnovers"], leaderboards: ["Points Per Game", "Assists Per Game", "Rebounds Per Game"], topTable: { title: "Top scorers", metric: "Points", valueColumn: "PTS", table: /./ }, boxTable: /./ },
  { key: "nfl", match: "nfl-match-overtime", team: "Kansas City Chiefs", statBars: ["Total Yards", "Passing", "Rushing", "Turnovers", "Yards per Play"], leaderboards: ["Passing Yards", "Rushing Yards", "Sacks"], topTable: { title: "Top rushers", metric: "Yards", valueColumn: "YDS", table: /Rushing/ }, boxTable: /Receiving/ },
];

function league({ key, match: matchCase, team: teamName, statBars, leaderboards, topTable, boxTable }: League) {
  const directory = golden(`${key}-teams`).teams as Values[];
  const toTeam = (raw: Values) => {
    const full = directory.find(t => t.id === raw.id) ?? raw;
    return { name: full.name, nickname: full.abbreviation, color: full.color || "#45423c", logo: full.logo };
  };
  const standings = golden(`${key}-standings`);
  const schedule = golden(`${key}-schedule`);
  const report = golden(matchCase);
  const leaders = golden(`${key}-leaders`);
  const athlete = golden(`${key}-athlete`);
  const teamStats = golden(`${key}-team-stats`);
  const log = golden(`${key}-gamelog`);

  // Games, from the team's season and one box score.
  const card = (game: Values) => ({
    home: toTeam(game.home), away: toTeam(game.away), label: dayLabel(game.date),
    value: game.state === "final" ? game.status : timeLabel(game.date), details: [key.toUpperCase(), game.venue].filter(Boolean),
    ...(game.state === "final" ? { score: { home: game.home.score, away: game.away.score } } : {}),
  });
  const played = (schedule.matches as Values[]).filter(game => game.state === "final");
  const next = (schedule.matches as Values[]).find(game => game.state !== "final");
  const reportGame = card(report.match);

  // One game's team comparison: figures read as printed, bars by their number.
  const number = (text: string) => { const parsed = Number.parseFloat(text.replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : 0; };
  const homeIsTeam = report.match.home.name === teamName;
  const [homeStats, awayStats] = homeIsTeam ? [report.teamStats, report.opponentStats] : [report.opponentStats, report.teamStats];
  const bars = statBars.map(label => {
    const home = (homeStats as Values[]).find(stat => stat.label === label);
    const away = (awayStats as Values[]).find(stat => stat.label === label);
    assert.ok(home && away, `${key} has no team stat "${label}": ${(homeStats as Values[]).map(s => s.label).join(", ")}`);
    return { label, values: { home: number(home.display), away: number(away.display) }, display: { home: home.display, away: away.display } };
  });

  // Leaders.
  const boards = leaderboards.map(title => {
    const board = (leaders.leaderboards as Values[]).find(item => item.title === title);
    assert.ok(board, `${key} has no leaders "${title}": ${(leaders.leaderboards as Values[]).map(b => b.title).join(", ")}`);
    return { title: board.title, metric: board.metric, entries: (board.entries as Values[]).slice(0, 5).map(entry => ({ name: entry.name, team: entry.team, color: entry.color, image: entry.logo, value: entry.value })) };
  });

  // A season, oldest first.
  const results = (schedule.results as Values[]).map(row => row.result);
  const recent = (schedule.results as Values[]).filter(row => row.result !== "upcoming").slice(-5);
  const wins = recent.filter(row => row.result === "win").length;

  // The team among the seeds around it in its conference.
  const focus = standings.focus as Values;
  const conference = (standings.table as Values[]).filter(row => row.conference === focus.conference);
  const at = conference.findIndex(row => row.team.id === focus.team.id);
  const neighbours = conference.slice(Math.max(0, at - 1), at + 2).map(row => ({ rank: row.seed, name: row.team.name, points: row.record, ...(row.team.id === focus.team.id ? { isTeam: true } : {}) }));
  const division = (standings.group as Values[]).map(row => ({ label: row.team.name, cells: [row.record, row.winPercent, row.gamesBehind, row.home, row.road, row.streak] }));
  const conferenceTop = conference.slice(0, 6).map(row => ({ label: `${row.seed}. ${row.team.name}`, cells: [row.record, row.winPercent, row.gamesBehind, row.streak] }));

  // Players of one game, by the league's main number.
  const sides = (tables: Values[]) => {
    const table = tables.find(item => topTable.table.test(item.title)) ?? tables[0]!;
    const column = (table.columns as Values[]).findIndex(c => c.label === topTable.valueColumn);
    return (table.rows as Values[]).map(row => ({ name: row.label, image: row.logo, position: row.position, value: row.cells[column].value }))
      .sort((a, b) => number(b.value) - number(a.value));
  };
  const [homeTables, awayTables] = homeIsTeam ? [report.teamTables, report.opponentTables] : [report.opponentTables, report.teamTables];
  const [homePlayers, awayPlayers] = [sides(homeTables), sides(awayTables)];
  const topRows = Array.from({ length: Math.min(3, Math.max(homePlayers.length, awayPlayers.length)) }, (_, i) => ({ ...(homePlayers[i] ? { home: homePlayers[i] } : {}), ...(awayPlayers[i] ? { away: awayPlayers[i] } : {}) }));
  // `teamTables` are always the named team's, whichever side it played on.
  const boxSource = (report.teamTables as Values[]).find(item => boxTable.test(item.title))!;
  const box = { title: boxSource.title === "Box score" ? `${teamName} · box score` : boxSource.title, columns: boxSource.columns.map((c: Values) => c.label), rows: boxSource.rows.map((row: Values) => ({ label: row.label, cells: row.cells.map((c: Values) => c.value) })) };

  const team = schedule.team as Values;
  const stats = (teamStats.categories as Values[]).flatMap(category => category.stats as Values[]).slice(0, 8).map(stat => ({ label: stat.label, value: stat.display }));
  const others = directory.filter(t => t.id !== team.id).slice(0, 2);
  return {
    name: standings.league, season: ordinalSeason(schedule), hasTies: results.includes("draw"),
    team: toTeam(team), rival: toTeam(report.match.home.name === teamName ? report.match.away : report.match.home), homeTeam: toTeam(report.match.home), awayTeam: toTeam(report.match.away),
    teams: [toTeam(team), ...others.map(toTeam)], longName: toTeam(directory.reduce((longest, t) => (String(t.name).length > String(longest.name).length ? t : longest))),
    matches: { report: reportGame, recent: card(played.at(-1)!), ...(next ? { upcoming: card(next) } : {}) },
    statBars: bars,
    leaderboards: boards,
    heatmap: { record: schedule.record, results, recentValue: `${wins}-${recent.length - wins}`, recent: recent.map(row => row.result), ...(schedule.tied ? { tied: schedule.tied } : {}) },
    standing: {
      place: focus.seed, conference: focus.conference, record: focus.record, division: focus.division,
      rows: neighbours, summary: `${focus.record} · ${focus.gamesBehind === "-" ? "leads" : `${focus.gamesBehind} behind in`} the ${focus.division}`,
      home: { record: focus.home }, away: { record: focus.road },
      divisionTable: { title: focus.division, columns: ["W-L", "PCT", "GB", "HOME", "ROAD", "STRK"], rows: division },
      conferenceTable: { title: focus.conference, columns: ["W-L", "PCT", "GB", "STRK"], rows: conferenceTop },
    },
    player: { name: athlete.player.name, position: athlete.player.position, image: athlete.player.logo, club: toTeam((directory.find(t => t.name === athlete.player.team) ?? team)), stats: (athlete.seasonStats as Values[]).map(stat => ({ label: stat.label, value: stat.display })) },
    teamCard: { stats: [{ label: "Record", value: schedule.record }, ...stats], detail: [standings.league, ...(schedule.season ? [schedule.season] : [])] },
    topPlayers: { title: topTable.title, metric: topTable.metric, rows: topRows },
    tables: {
      box,
      gamelog: { title: `${log.player.name} · last ${log.gamesCounted} games`, columns: log.log.columns.map((c: Values) => c.label), rows: log.log.rows.map((row: Values) => ({ label: row.label, cells: row.cells.map((c: Values) => c.value) })) },
    },
  };
}

const lakersBox = golden("nba-match").teamTables[0].rows.map((row: Values) => row.label);
const lakersRoster = new Set(golden("nba-roster").athletes.map((athlete: Values) => athlete.name));
assert.ok(lakersBox.every((name: string) => lakersRoster.has(name)), `the Lakers box score lists only Lakers: ${lakersBox.join(", ")}`);

const samples = {
  recorded: "2026-11-05", source: "ESPN",
  nba: league(LEAGUES[0]!), nfl: league(LEAGUES[1]!),
};
const text = JSON.stringify(samples, null, 1) + "\n";
if (process.argv.includes("--check")) {
  assert.equal(readFileSync(OUT, "utf8"), text, "team-sports-data.json is stale. Run npm run catalog:samples.");
  console.log("catalog samples: fresh");
} else {
  writeFileSync(OUT, text);
  console.log(`catalog samples: ${text.length} characters written`);
}
