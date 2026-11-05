import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { programTree } from "../src/lang/tree.js";
import { SnapshotStore } from "../src/lang/snapshots.js";
import { askSports, type SportsDeps } from "../src/sports/ask.js";
import { fitHeatmaps } from "../src/sports/components.js";
import { designDataset } from "../src/sports/dataset.js";
import { clubDirectory, type Club, type EspnTransport } from "../src/sports/espn.js";
import { planSystem, rawSchema, toPlan, type SportsPlan } from "../src/sports/plan.js";
import { populatePlayerImages } from "../src/sports/player-images.js";
import { replay } from "./espn-replay.js";
import { RECORDED_AT, TEAM_SPORT_CASES } from "./feed-cases.js";

/** NFL and NBA through the whole pipeline with every model stage scripted and recorded ESPN responses: no network. */

// ESPN reuses team ids across sports: both teams stay, while a club in a league and a cup stays one.
{
  const teams = (id: string, name: string) => ({ sports: [{ leagues: [{ teams: [{ team: { id, displayName: name } }] }] }] });
  const send: EspnTransport = async url => url.includes("/nba/") ? teams("7", "Denver Nuggets") : url.includes("/nfl/") ? teams("7", "Denver Broncos") : url.includes("/eng.1/") || url.includes("/uefa.champions/") ? teams("363", "Chelsea") : teams("1", "Other");
  const clubs = await clubDirectory(send, 1e15);
  assert.ok(clubs.some(c => c.name === "Denver Nuggets") && clubs.some(c => c.name === "Denver Broncos"), "the same id in two sports keeps both teams");
  assert.equal(clubs.filter(c => c.name === "Chelsea").length, 1, "a club in a league and a cup is listed once");
}

const club = (name: string, league: Club["league"]): Club => ({ id: name, name, short: name, abbreviation: "", color: "", alternateColor: "", logo: "", league });
const directory = [club("Los Angeles Lakers", "nba"), club("Kansas City Chiefs", "nfl"), club("Chelsea", "eng.1")];
const raw = { text: "A question about it", source: "espn" as const, player: null, competition: "league" as const, feed: "schedule" as const, team: "Los Angeles Lakers" as string | null, opponent: null, date: null, season: null, lastGames: null, week: null, searchQueries: [] as string[] };
const subject = (league: SportsPlan["subject"]["league"] | "other", name = "Lakers") => ({ kind: "team" as const, name, league: league ?? "other", season: "2026-27" });

// The planner reads a team's league from the team, and enforces what each league has.
{
  const lakers = toPlan({ subject: subject("other"), questions: [raw] }, directory).questions[0]!;
  assert.ok(lakers.source === "espn" && lakers.league === "nba", "the team decides the league");
  const chiefs = toPlan({ subject: subject("other"), questions: [{ ...raw, team: "Kansas City Chiefs" }] }, directory).questions[0]!;
  assert.ok(chiefs.source === "espn" && chiefs.league === "nfl");
  assert.throws(() => toPlan({ subject: subject("nba"), questions: [{ ...raw, feed: "scorers", lastGames: 5 }] }, directory), /no NBA scorers/, "soccer's scorers feed stays soccer's");
  assert.throws(() => toPlan({ subject: subject("nfl"), questions: [{ ...raw, source: "fotmob", feed: "none", team: "Kansas City Chiefs" }] }, directory), /FotMob has no NFL/, "FotMob stays soccer's");
  assert.throws(() => toPlan({ subject: subject("nba"), questions: [{ ...raw, feed: "athlete" }] }, directory), /needs a player/);
  assert.throws(() => toPlan({ subject: subject("nba"), questions: [{ ...raw, feed: "standings", team: null, competition: "league" }, { ...raw, feed: "teamStats", team: null }] }, directory), /needs a team/);
  const log = toPlan({ subject: subject("nfl"), questions: [{ ...raw, team: "Kansas City Chiefs", feed: "gamelog", player: "Patrick Mahomes", lastGames: 3 }] }, directory).questions[0]!;
  assert.ok(log.source === "espn" && log.player === "Patrick Mahomes" && log.lastGames === 3);
  const week = toPlan({ subject: subject("nfl"), questions: [{ ...raw, team: null, feed: "scoreboard", week: 1, season: 2026 }] }, directory).questions[0]!;
  assert.ok(week.source === "espn" && week.week === 1 && week.season === 2026);
  // A saved soccer question gains no keys, or every follow-up would count it as revised.
  const soccer = toPlan({ subject: subject("eng.1", "Chelsea"), questions: [{ ...raw, team: "Chelsea" }] }, directory).questions[0]!;
  assert.deepEqual(Object.keys(soccer).sort(), ["date", "feed", "id", "league", "opponent", "season", "source", "team", "text"]);
  assert.match(planSystem("2026-11-05", directory), /NBA \(nba\) and NFL \(nfl\)/);
  assert.ok(rawSchema(directory).safeParse({ subject: subject("nfl"), questions: [{ ...raw, team: "Kansas City Chiefs", week: 9 }] }).success);
}

// Long lists and data-driven tables.
{
  const fitted = fitHeatmaps({ values: { answers: { q1: { table: { title: "T", columnCount: "9", columns: Array.from({ length: 9 }, (_, i) => ({ label: `C${i}` })), rows: [{ label: "A", cells: Array.from({ length: 9 }, (_, i) => ({ value: String(i) })) }] } } } }, fields: [] }).values.answers as { q1: { table: { columnCount: string; columns: unknown[]; rows: { cells: unknown[] }[] } } };
  assert.deepEqual([fitted.q1.table.columnCount, fitted.q1.table.columns.length, fitted.q1.table.rows[0]!.cells.length], ["7", 7, 7], "a designed table is trimmed to what fits a phone");
}

// A feed's athlete keeps its headshot even when FotMob knows the same name.
{
  const dataset = { values: { answers: { q1: { person: { name: "Josh Allen", athleteId: "3918298", kind: "player", logo: "https://a.espncdn.com/espn.png" } } } }, fields: [], asOf: "2026-11-05", source: "espn" as const };
  const out = populatePlayerImages(dataset, [{ fotmobId: 1, name: "Josh Allen", team: "Other", position: "", imageUrl: "https://fotmob/x.png" }], [{ name: "Josh Allen" }]).values.answers as { q1: { person: { logo: string } } };
  assert.equal(out.q1.person.logo, "https://a.espncdn.com/espn.png");
}

// Soft rejection: small slips are repaired, and a bad design costs only its own question.
{
  const question = (id: "q1" | "q2", text: string) => ({ id, text, source: "web" as const, searchQueries: ["a b", "c d"] });
  const plan: SportsPlan = { subject: { kind: "team", name: "Chiefs", league: "nfl", season: "2026" }, questions: [question("q1", "Injuries"), question("q2", "Record")] };
  const answers = { q1: { status: "complete", question: "Injuries", title: "Injuries", source: "s", raw: "kept" }, q2: { status: "complete", question: "Record", title: "Record", source: "s", raw: "kept" } };
  const text = (path: string) => ({ path, kind: "text", format: "none" });
  const number = (path: string) => ({ path, kind: "number", format: "integer" });
  let calls = 0;
  const reply = (designs: unknown) => async () => { calls++; return { model: "fake", finishReason: "stop" as const, text: JSON.stringify({ answers: designs }), usage: { promptTokens: 0, completionTokens: 0, costUSD: 0 } }; };
  const design = (id: string, fields: unknown[], values: unknown) => ({ id, title: id, fields, valuesJson: JSON.stringify(values) });
  const now = new Date("2026-11-05T12:00:00Z");

  // The Chiefs' failure: an injury with null text, and a key the design never declared. Both questions keep their designs.
  const repaired = await designDataset(plan, answers, "web", now, {}, reply([
    design("q1", [text("injuries[].name"), text("injuries[].detail"), number("count")], { injuries: [{ name: "Rice", detail: null }, { name: "Kelce" }], count: "2", extra: 1 }),
    design("q2", [text("record")], { record: "4-3" }),
  ]));
  assert.deepEqual(repaired.designed, ["q1", "q2"], "repairable slips keep every design");
  const fixed = repaired.values.answers as Record<string, Record<string, unknown>>;
  assert.deepEqual([fixed.q1!.injuries, fixed.q1!.count, fixed.q1!.extra], [[{ name: "Rice", detail: "" }, { name: "Kelce", detail: "" }], 2, undefined]);

  // A word where a figure belongs is a wrong design: only that question falls back, with no second attempt.
  calls = 0;
  const rejected: string[] = [];
  const partial = await designDataset(plan, answers, "web", now, { rejected: id => rejected.push(id) }, reply([
    design("q1", [number("count")], { count: "several" }),
    design("q2", [text("record")], { record: "4-3" }),
  ]));
  assert.deepEqual([partial.designed, rejected, calls], [["q2"], ["q1"], 1], "one bad design costs only its question");
  const kept = partial.values.answers as Record<string, Record<string, unknown>>;
  assert.equal(kept.q1!.raw, "kept", "the rejected question shows its raw answer");
  assert.equal(kept.q2!.record, "4-3", "the other question keeps its design");

  // Nothing usable: the stage still tries once more, then every question shows its raw answer.
  calls = 0;
  const none = await designDataset(plan, answers, "web", now, {}, reply([design("q1", [number("count")], { count: "several" })]));
  assert.deepEqual([none.designed, calls], [[], 2], "a stage with nothing usable regenerates once");
}

// Every feed reaches a compiled screen by its default parts, and nothing asks FotMob.
const dir = mkdtempSync(path.join(tmpdir(), "team-sports-"));
try {
  const store = new SnapshotStore(path.join(dir, "snapshots"));
  await clubDirectory(replay().send, 2e15);
  const chart: string[] = [];
  for (const { name, request } of TEAM_SPORT_CASES) {
    const { send } = replay();
    const plan: SportsPlan = {
      subject: { kind: "topic", name: request.player ?? request.team ?? request.league, league: request.league, season: "" },
      questions: [{ id: "q1", text: name, source: "espn", league: request.league, feed: request.feed, team: request.team ?? null, opponent: request.opponent ?? null, date: request.dates ?? null, season: request.season ?? null,
        ...(request.lastGames !== undefined ? { lastGames: request.lastGames } : {}), ...(request.player ? { player: request.player } : {}), ...(request.week != null ? { week: request.week } : {}) }],
    };
    const fotmob = async () => { throw new Error(`${name} asked FotMob`); };
    const deps: SportsDeps = {
      plan: async () => plan, espn: send, now: RECORDED_AT, fotmob, player: async () => { throw new Error(`${name} looked a player up on FotMob`); },
      pickPlayer: async () => { throw new Error(`${name} used FotMob's picker`); },
      schema: async () => ({ text: JSON.stringify({ answers: [] }), usage: { promptTokens: 0, completionTokens: 0, costUSD: 0 } }) as never,
      write: async () => ({ text: "", usage: { promptTokens: 0, completionTokens: 0, cost: 0 } }),
    };
    const problems: string[] = [];
    const result = await askSports({ prompt: name, timeZone: "America/New_York" }, store, { content: item => { if (String(item.id).startsWith("rejected")) problems.push(String(item.data)); } }, undefined, deps);
    const answer = (result.snapshot.result as { answers: Record<string, Record<string, unknown>> }).answers.q1!;
    assert.deepEqual(problems, [], `${name}'s raw answer validates`);
    assert.equal(answer.status, "complete", `${name} is complete`);
    const tree = programTree(result.program, result.snapshot.result as never);
    assert.ok(tree.nodes.length > 1, `${name} draws something`);
    chart.push(`${name}: ${tree.nodes.length} primitives`);
  }
  console.log(`team sports: ${TEAM_SPORT_CASES.length} feeds reach a screen, FotMob untouched. ${chart.slice(0, 2).join(", ")} ...`);
} finally { rmSync(dir, { recursive: true, force: true }); }
