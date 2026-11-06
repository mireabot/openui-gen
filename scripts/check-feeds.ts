import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fits, COMPONENT_BY_NAME, placements } from "../src/sports/components.js";
import { sportsLookup } from "../src/sports/feeds.js";
import type { EspnRequest } from "../src/sports/espn.js";
import { FIXTURES, replay } from "./espn-replay.js";
import { RECORDED_AT, SOCCER_CASES, TEAM_SPORT_CASES } from "./feed-cases.js";

/** Replays recorded ESPN responses against the goldens, offline. `--update` rewrites the goldens. */
const update = process.argv.includes("--update");
const GOLDENS = path.join(FIXTURES, "goldens");
mkdirSync(GOLDENS, { recursive: true });

type Values = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const answers = new Map<string, Values>();
const usedUrls = new Map<string, readonly string[]>();

for (const { name, request } of [...SOCCER_CASES, ...TEAM_SPORT_CASES]) {
  const { send, urls } = replay();
  const answer = await sportsLookup(request, send, RECORDED_AT);
  answers.set(name, answer.values);
  usedUrls.set(name, urls);
  const actual = JSON.stringify({ urls, answer }, null, 1) + "\n";
  const file = path.join(GOLDENS, `${name}.json`);
  if (update) writeFileSync(file, actual);
  else {
    assert.ok(existsSync(file), `${name} has no golden. Run npm run check:feeds -- --update.`);
    assert.equal(actual, readFileSync(file, "utf8"), `${name} changed from its golden`);
  }
}

const get = (name: string) => answers.get(name)!;
const component = (name: string) => COMPONENT_BY_NAME.get(name)!;

// One adapter, two leagues: nothing but the registry entry differs.
assert.ok(usedUrls.get("nba-teams")![0]!.includes("/basketball/nba/teams"));
assert.ok(usedUrls.get("nfl-teams")![0]!.includes("/football/nfl/teams"));
assert.equal(get("nba-teams").teams.length, 30);
assert.equal(get("nfl-teams").teams.length, 32);

// Standings: every team once, grouped by division, with no soccer points.
for (const [name, teams] of [["nba-standings", 30], ["nfl-standings", 32]] as const) {
  const { table, focus, group } = get(name);
  assert.equal(table.length, teams, `${name} lists every team`);
  assert.equal(new Set(table.map((row: Values) => row.team.id)).size, teams, `${name} lists each team once`);
  assert.ok(table.every((row: Values) => row.conference && row.division && /^\d+-\d+/.test(row.record)), `${name} rows carry their group and record`);
  assert.ok(!("points" in table[0]), "a record league has no points column");
  assert.ok(focus && group.some((row: Values) => row.team.id === focus.team.id), `${name} marks the team within its division`);
}
assert.deepEqual([...new Set(get("nfl-standings").table.map((row: Values) => row.conference))].sort(), ["American Football Conference", "National Football Conference"]);
assert.ok(get("nfl-standings").table.every((row: Values) => typeof row.tied === "number"), "the NFL carries ties");
assert.equal(get("nfl-standings").group.length, 4, "an NFL division has four teams");
assert.ok(usedUrls.get("nfl-standings-past")![0]!.endsWith("&season=2025"), "a past season reaches ESPN");

// A season: the record adds up, games keep their order, and a heatmap can draw every result.
for (const name of ["nba-schedule", "nfl-schedule"]) {
  const { played, won, lost, tied, matches, results, venues } = get(name);
  assert.equal(played, won + lost + tied, `${name} record adds up`);
  assert.equal(venues.home.played + venues.away.played, played, `${name} venues add up`);
  assert.deepEqual(matches.map((m: Values) => m.date), [...matches.map((m: Values) => m.date)].sort(), `${name} is oldest first`);
  assert.ok(matches.length <= 25, `${name} sends a bounded run of full game records`);
  assert.ok(results.every((r: Values) => r.label && r.fill), `${name} results fit a heatmap`);
  assert.ok(results.filter((r: Values) => r.result !== "upcoming").every((r: Values) => /^\d+-\d+$/.test(r.score)), `${name} played games have scores`);
}
assert.ok(get("nba-schedule").results.length > 40, "a whole NBA season survives past the old 40-game limit");

// Leaders are current-season lists that a Leaderboard draws as they are.
for (const name of ["nba-leaders", "nfl-leaders"]) {
  const { leaderboards } = get(name);
  assert.ok(leaderboards.length >= 4, `${name} has its main categories`);
  assert.ok(leaderboards.every((board: Values) => fits(component("Leaderboard"), board)), `${name} fits Leaderboard`);
  assert.ok(leaderboards[0].entries[0].logo.includes("/headshots/"), `${name} carries ESPN's headshots`);
  assert.ok(placements(get(name)).some(p => p.component.name === "Leaderboard"), `${name} is placed without a design`);
}

// Box scores: one table per stat group, read by position, drawn by RecordTable.
const box = get("nfl-match-overtime");
assert.equal(box.played, true);
assert.ok(box.teamTables.length >= 5, "the NFL has a table per stat group");
for (const table of [...box.teamTables, ...box.opponentTables, ...get("nba-match").teamTables]) {
  assert.ok(fits(component("RecordTable"), table), `${table.heading} fits RecordTable`);
  assert.ok(table.columns.length <= 7, `${table.heading} fits a phone`);
  assert.equal(String(table.columns.length), table.columnCount);
  assert.ok(table.rows.every((row: Values) => row.cells.length === table.columns.length), `${table.heading} rows match its columns`);
}
assert.equal(box.match.home.periods.split(" ").length, 5, "an overtime game has an extra period");
assert.ok(box.scoring.length > 0 && box.scoring[0].text, "an NFL game has scoring plays");
assert.ok(get("nba-match").teamStats.some((stat: Values) => stat.key === "fieldGoalPct"));
const nbaBox = get("nba-match").teamTables[0];
assert.ok(nbaBox.columns.some((c: Values) => c.label === "PTS"), "the NBA box score keeps the league's preferred columns");

// A repeated label stays in position: rushing yards are not read as passing yards.
const log = get("nfl-gamelog").log;
assert.ok(log.rows.length === 3 && log.rows[0].label.includes("·"), "a game log has the requested games, newest first");
assert.ok(fits(component("RecordTable"), log));
const rawLog = JSON.parse(readFileSync(path.join(FIXTURES, "espn", "web_apis_common_v3_sports_football_nfl_athletes_3139477_gamelog.json"), "utf8"));
const firstRow = rawLog.seasonTypes[0].categories.flatMap((c: Values) => c.events).find((e: Values) => log.rows[0].date === rawLog.events[e.eventId].gameDate);
assert.equal(log.columns[2].label, "YDS");
assert.equal(log.rows[0].cells[2].value, firstRow.stats[2], "the first YDS column is passing yards, read by position");

// Players come with identity and a photo from the feed.
for (const name of ["nba-athlete", "nfl-athlete"]) {
  const { player, seasonStats, tables } = get(name);
  assert.ok(player.athleteId && player.logo.includes("/headshots/") && player.team, `${name} has identity and photo`);
  assert.ok(seasonStats.length > 0, `${name} has this season's figures`);
  assert.ok(tables.every((table: Values) => fits(component("RecordTable"), table)), `${name} season tables fit RecordTable`);
}
assert.ok(get("nfl-roster").athletes.length > 40, "the NFL's grouped roster flattens");
assert.ok(get("nba-roster").athletes.length >= 13, "the NBA's flat roster reads");
assert.ok(get("nfl-roster").athletes.every((a: Values) => a.athleteId && a.position), "every player has an id and position");

// Injuries: a team filter holds, and every row names a player and a status.
assert.ok(get("nba-injuries-team").injuries.every((row: Values) => row.team === "Atlanta Hawks" && row.name && row.injuryStatus));
assert.equal(get("nfl-injuries").count >= get("nfl-injuries").injuries.length, true);
for (const name of ["nba-injuries-team", "nfl-injuries"]) {
  assert.ok(get(name).injuries.every((row: Values) => row.injuryStatus !== "Active" && row.detail), `${name} lists only hurt players, each with a line of text`);
}

// A request ESPN cannot answer fails plainly, which the pipeline reports as unavailable.
const missing = async (request: EspnRequest, pattern: RegExp) => assert.rejects(sportsLookup(request, replay().send, RECORDED_AT), pattern);
await missing({ league: "nba", feed: "scorers" }, /no NBA scorers/);
await missing({ league: "nfl", feed: "athlete" }, /needs a player/);
await missing({ league: "nba", feed: "schedule" }, /needs a team/);

console.log(`feeds: ${SOCCER_CASES.length} soccer and ${TEAM_SPORT_CASES.length} team sport goldens ${update ? "written" : "match"}, shapes hold`);
