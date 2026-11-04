import assert from "node:assert/strict";
import { clubsForDataset, fotmobLookup } from "../src/sports/fotmob-feeds.js";

/** The FotMob feeds, offline: they must give the pipeline what the ESPN feeds give it. */

const fixture = (id: string, utcTime: string, home: [string, string], away: [string, string], scoreStr: string | null) => ({
  id, home: { id: home[0], name: home[1] }, away: { id: away[0], name: away[1] },
  status: { utcTime, finished: scoreStr !== null, started: scoreStr !== null, ...(scoreStr ? { scoreStr, reason: { short: "FT" } } : {}) },
});
const chelsea: [string, string] = ["8455", "Chelsea"];
const arsenal: [string, string] = ["9825", "Arsenal"];
const league = {
  details: { selectedSeason: "2025/2026" },
  table: [{ data: { table: { all: [
    { id: "8455", name: "Chelsea", idx: 2, played: 2, wins: 1, draws: 0, losses: 1, scoresStr: "3-2", goalConDiff: 1, pts: 3 },
    { id: "9825", name: "Arsenal", idx: 1, played: 2, wins: 1, draws: 0, losses: 1, scoresStr: "2-3", goalConDiff: -1, pts: 3 },
  ] } } }],
  fixtures: { allMatches: [
    fixture("3", "2026-03-01T15:00:00Z", arsenal, chelsea, null),
    fixture("2", "2026-02-01T15:00:00Z", arsenal, chelsea, "2 - 0"),
    fixture("1", "2026-01-01T15:00:00Z", chelsea, arsenal, "3 - 0"),
  ] },
  stats: { players: [{ name: "goals", fetchAllUrl: "https://data.test/goals.json" }, { name: "goal_assist", fetchAllUrl: "https://data.test/assists.json" }] },
};
const goal = (isHome: boolean, name: string, playerId: number, ownGoal?: boolean) => ({ type: "Goal", isHome, nameStr: name, playerId, ownGoal: ownGoal ?? null, timeStr: 10 });
const transport = (reports: Record<string, unknown>) => async (url: string): Promise<unknown> => {
  if (url.includes("/leagues?")) return league;
  if (url.includes("/teams?")) return { details: { id: 8455, name: "Chelsea" }, overview: { teamColors: { lightMode: "#051495", darkMode: "#033CC1" } } };
  if (url.includes("goals.json")) return { TopLists: [{ StatList: [{ ParticipantName: "A Scorer", TeamName: "Chelsea", StatValue: 9 }] }] };
  if (url.includes("assists.json")) return { TopLists: [{ StatList: [{ ParticipantName: "A Passer", TeamName: "Arsenal", StatValue: 5 }] }] };
  const id = /matchId=(\d+)/.exec(url)?.[1];
  if (id && reports[id]) return { content: { matchFacts: { events: { events: reports[id] } } } };
  throw new Error(`Unexpected URL ${url}`);
};
const now = new Date("2026-02-15T00:00:00Z");

// FotMob sends goals as "3-2", and its table isn't always in rank order.
const standings = await fotmobLookup({ league: "eng.1", feed: "standings", team: "Chelsea", season: 2025 }, transport({}), now);
assert.deepEqual((standings.values.table as { rank: number }[]).map(row => row.rank), [1, 2], "the table reads in rank order");
assert.deepEqual([(standings.values.focus as { goalsFor: number }).goalsFor, (standings.values.focus as { goalsAgainst: number }).goalsAgainst], [3, 2], "goals split out of the score text");

// Results are from the team's side, wherever it played; an unplayed match counts for nothing.
const schedule = await fotmobLookup({ league: "eng.1", feed: "schedule", team: "Chelsea" }, transport({}), now);
assert.deepEqual((schedule.values.matches as { result: string }[]).map(m => m.result), ["win", "loss", "upcoming"], "oldest first, from Chelsea's side");
assert.deepEqual([schedule.values.won, schedule.values.lost, schedule.values.season, (schedule.values.team as { color: string }).color], [1, 1, "2025/26", "#051495"], "season totals and the club's colour");
assert.deepEqual((schedule.values.venues as { home: { goalsFor: number; won: number }; away: { goalsFor: number; lost: number } }).away.lost, 1, "the away loss lands on the away side");

// Same check ESPN's feed makes: scorers that don't add up to the final score are an error, not a wrong number.
const scorers = await fotmobLookup({ league: "eng.1", feed: "scorers", team: "Chelsea", lastGames: 1, allCompetitions: false }, transport({ 1: [goal(true, "Own", 2), goal(true, "Own", 2), goal(true, "Their Defender", 3, true), goal(false, "Other", 4)] }), new Date("2026-01-15T00:00:00Z"));
assert.deepEqual([scorers.values.goalsFor, scorers.values.ownGoals, scorers.values.scorers], [3, 1, [{ name: "Own", espnId: "2", team: "Chelsea", goals: 2 }]], "own goals count for the team, not a scorer; the other side's goals don't count");
await assert.rejects(fotmobLookup({ league: "eng.1", feed: "scorers", team: "Chelsea", lastGames: 1, allCompetitions: false }, transport({ 1: [goal(true, "Own", 2)] }), new Date("2026-01-15T00:00:00Z")), /does not reconcile/);

// A club outside the competitions is found by its plain name, and a women's team is never picked for it.
const searches: string[] = [];
const search = async (url: string): Promise<unknown> => {
  if (url.includes("/search/")) { searches.push(url); return [{ suggestions: [{ type: "match", id: "1" }, { type: "team", id: "726186", name: "Molde (W)" }, { type: "team", id: "9917", name: "Molde" }] }]; }
  return { overview: { teamColors: { lightMode: "#0D47A0" } } };
};
const clubs = await clubsForDataset([], ["Molde FK"], ["Striker"], search, Date.parse("2026-02-15"));
assert.deepEqual(clubs.map(club => [club.id, club.short, club.color]), [["9917", "Molde FK", "#0d47a0"]], "the men's club, under the name the dataset uses, with its colour");
assert.equal(searches.length, 1, "a word from a detail line never starts a search");
assert.match(searches[0]!, /term=molde&/);

console.log("fotmob feeds: table, schedule, scorers and club search passed");
