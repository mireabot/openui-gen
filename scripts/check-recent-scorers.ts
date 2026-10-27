import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { SnapshotStore } from "../src/lang/snapshots.js";
import { programTree } from "../src/lang/tree.js";
import { askSports } from "../src/sports/ask.js";
import { espnLookup, type EspnTransport } from "../src/sports/espn.js";
import { toPlan } from "../src/sports/plan.js";

const now = new Date("2026-10-27T12:00:00Z");
const chelsea = { id: "363", displayName: "Chelsea", shortDisplayName: "Chelsea", abbreviation: "CHE", color: "144992" };
const opponent = { id: "367", displayName: "Opponent", abbreviation: "OPP" };
const event = (id: string, date: string, goals: number, state = "post") => ({
  id, date, competitions: [{ status: { type: { state, shortDetail: state === "post" ? "FT" : "Scheduled" } },
    competitors: [{ homeAway: "home", team: chelsea, score: String(goals) }, { homeAway: "away", team: opponent, score: "0" }],
  }],
});
const goal = (id: string, name: string, playerId: string, teamId = "363", type = "goal", shootout = false) => ({
  id, scoringPlay: true, shootout, team: { id: teamId }, type: { id: type === "own-goal" ? "97" : type === "penalty---scored" ? "98" : "70", type, text: type },
  participants: [{ athlete: { id: playerId, displayName: name } }, { athlete: { id: "palmer", displayName: "Cole Palmer" } }],
  clock: { displayValue: "45'" },
});
const fixtures = [
  event("old", "2026-08-20T12:00:00Z", 20),
  event("one", "2026-09-12T12:00:00Z", 2),
  event("two", "2026-09-18T12:00:00Z", 0),
  event("three", "2026-10-10T12:00:00Z", 5),
  event("four", "2026-10-17T12:00:00Z", 2),
  event("five", "2026-10-24T12:00:00Z", 0),
  event("future", "2026-11-01T12:00:00Z", 7),
  event("live", "2026-10-26T12:00:00Z", 3, "in"),
  event("scheduled", "2026-10-25T12:00:00Z", 0, "pre"),
];
const reports: Record<string, { keyEvents: ReturnType<typeof goal>[] }> = {
  one: { keyEvents: [goal("a", "João Pedro", "jp"), goal("b", "Pedro Neto", "pn")] },
  two: { keyEvents: [goal("opponent", "Other player", "other", "367")] },
  three: { keyEvents: [goal("c", "João Pedro", "jp"), goal("d", "João Pedro", "jp"), goal("e", "Jordan Henderson", "jh"), goal("f", "Jordan Henderson", "jh", "363", "penalty---scored"), goal("g", "Morgan Rogers", "mr")] },
  four: { keyEvents: [goal("h", "Morgan Rogers", "mr"), goal("i", "Pedro Neto", "pn"), goal("h", "Morgan Rogers", "mr")] },
  five: { keyEvents: [goal("shootout", "Cole Palmer", "palmer", "363", "penalty---scored", true)] },
};
const requestedReports: string[] = [];
const transport = (records = reports, games = fixtures): EspnTransport => async raw => {
  const url = new URL(raw);
  if (url.pathname.endsWith("/teams")) return { sports: [{ leagues: [{ teams: [{ team: chelsea }] }] }] };
  if (url.pathname.endsWith("/schedule")) return { requestedSeason: { year: 2026 }, events: [...games, games[1]] };
  if (url.pathname.endsWith("/summary")) {
    const id = url.searchParams.get("event") ?? "";
    requestedReports.push(id);
    assert.ok(records[id], `Unexpected report requested: ${id}`);
    return records[id];
  }
  throw new Error(`Unexpected ESPN request: ${url.pathname}`);
};
const request = { feed: "scorers", league: "eng.1", team: "Chelsea", lastGames: 5, allCompetitions: true } as const;
const result = await espnLookup(request, transport(), now);
const Scorers = z.array(z.object({ name: z.string(), espnId: z.string(), team: z.string(), goals: z.number() }));
const scorers = Scorers.parse(result.values.scorers);
assert.deepEqual(Object.fromEntries(scorers.map(player => [player.name, player.goals])), {
  "João Pedro": 3, "Jordan Henderson": 2, "Morgan Rogers": 2, "Pedro Neto": 2,
});
assert.ok(!scorers.some(player => player.name === "Cole Palmer"), "assists and shootout penalties are not player goals");
assert.equal(result.values.requestedGames, 5);
assert.equal(result.values.gamesCounted, 5);
assert.equal(result.values.goalsFor, 9);
assert.equal(result.values.ownGoals, 0);
assert.deepEqual(new Set(requestedReports), new Set(["one", "two", "three", "four", "five"]), "only the latest five completed fixtures need reports");
assert.equal(requestedReports.length, 5, "duplicate fixtures do not cause duplicate reports");

const ownGoalReports = { ...reports, one: { keyEvents: [goal("own", "Opponent defender", "other", "363", "own-goal"), goal("b", "Pedro Neto", "pn")] } };
const withOwnGoal = await espnLookup(request, transport(ownGoalReports), now);
assert.equal(withOwnGoal.values.ownGoals, 1);
assert.equal(Scorers.parse(withOwnGoal.values.scorers).reduce((sum, player) => sum + player.goals, 0), 8);

await assert.rejects(espnLookup(request, transport({ ...reports, three: { keyEvents: [] } }), now), /scor|goal|report|complete/i, "missing scoring events cannot produce a complete ranking");
await assert.rejects(espnLookup(request, transport(reports, fixtures.slice(0, 3)), now), /five|5|enough|fixture|match/i, "a five-match request cannot silently rank fewer matches");
await assert.rejects(espnLookup({ ...request, lastGames: 0 }, transport(), now), /lastGames|count|positive|1|games/i);
for (const score of ["", " "]) {
  const blankScore = fixtures.map(fixture => fixture.id === "five" ? {
    ...fixture, competitions: fixture.competitions.map(competition => ({ ...competition, competitors: competition.competitors.map(side => side.team.id === "363" ? { ...side, score } : side) })),
  } : fixture);
  await assert.rejects(espnLookup(request, transport(reports, blankScore), now), /valid final.*score/i, "an unpublished final score must not turn into zero");
}

const plan = toPlan({ subject: { kind: "team", name: "Chelsea", league: "eng.1", season: "2026/27" }, questions: [{
  text: "Who are top scorers in Chelsea for the past 5 games?", source: "espn", competition: "all", feed: "scorers", team: "Chelsea", opponent: null, date: null, season: null, lastGames: 5, searchQueries: [],
}] });
assert.equal(plan.questions[0]?.source, "espn");

const dir = mkdtempSync(path.join(tmpdir(), "recent-scorers-"));
try {
  const store = new SnapshotStore(dir);
  let schemaCalls = 0;
  const response = await askSports({ prompt: "Who are top scorers in Chelsea for the past 5 games?" }, store, {}, "recent-scorers", {
    plan: async () => plan, espn: transport(), now,
    schema: async () => { schemaCalls++; throw new Error("Verified scorer rankings must retain their exact source window"); },
    player: async query => ({ fotmobId: query.name === "João Pedro" ? 1 : query.name === "Jordan Henderson" ? 2 : query.name === "Morgan Rogers" ? 3 : 4, name: query.name, team: "Chelsea", position: "Forward", imageUrl: `https://example.test/${encodeURIComponent(query.name)}.png` }),
    write: async (_messages, emit) => {
      const text = "scorers = Leaderboard(d.answers.q1.leaderboard)\n";
      emit(text);
      return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } };
    },
  });
  assert.equal(schemaCalls, 0, "an authoritative match-window ranking bypasses dataset redesign");
  const answer = z.object({ answers: z.object({ q1: z.object({ scorers: Scorers, requestedGames: z.number(), gamesCounted: z.number(), period: z.object({ from: z.string(), to: z.string() }).passthrough(), leaderboard: z.object({ entries: z.array(z.object({ name: z.string(), value: z.string(), logo: z.string() })) }) }) }), players: z.array(z.object({ name: z.string(), imageUrl: z.string() })) }).parse(response.snapshot.result);
  assert.equal(answer.answers.q1.gamesCounted, 5);
  assert.equal(answer.answers.q1.requestedGames, 5);
  assert.equal(answer.players.length, 4);
  assert.ok(answer.answers.q1.leaderboard.entries.every(entry => entry.logo.startsWith("https://example.test/")));
  assert.equal(programTree(response.program, response.snapshot.result).nodes.filter(node => node.primitive === "Avatar").length, 4, "the screen renders players rather than substitute match cards");

  const scorelessFixtures = fixtures.map(fixture => event(fixture.id, fixture.date, 0, fixture.competitions[0]!.status.type.state));
  const scorelessReports = Object.fromEntries(Object.keys(reports).map(id => [id, { keyEvents: [] }]));
  const scoreless = await askSports({ prompt: "Chelsea top scorers in the last 5 games" }, store, {}, "scoreless-window", {
    plan: async () => plan, espn: transport(scorelessReports, scorelessFixtures), now, player: async () => null,
    schema: async () => { throw new Error("A zero-goal ranking is already authoritative"); },
    write: async (_messages, emit) => {
      const text = "scorers = Leaderboard(d.answers.q1.leaderboard)\n";
      emit(text);
      return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } };
    },
  });
  const zero = z.object({ answers: z.object({ q1: z.object({ status: z.literal("complete"), gamesCounted: z.literal(5), goalsFor: z.literal(0), scorers: z.array(z.unknown()).length(0), leaderboard: z.object({ entries: z.array(z.unknown()).length(0) }) }) }) }).parse(scoreless.snapshot.result);
  assert.equal(zero.answers.q1.goalsFor, 0, "a verified scoreless window remains a complete empty ranking");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("recent scorers: exact five-match window, player goals, penalties, own goals, deduplication, completeness, authoritative ranking and portraits passed");
