import assert from "node:assert/strict";
import { SPORTS_TEMPLATES } from "../src/sports/components.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { SnapshotStore } from "../src/lang/snapshots.js";
import { programTree } from "../src/lang/tree.js";
import type { ProgramWriter } from "../src/lang/compiler.js";
import type { Completion, CompletionSender } from "../src/llm/structured-completion.js";
import { sportsRoutes } from "../src/routes/sports.js";
import { askSports, editSports, type SportsDeps, type SportsResult } from "../src/sports/ask.js";
import { inferFields } from "../src/sports/dataset.js";
import { DocumentStore, nextRevision } from "../src/sports/documents.js";
import { createPlayerLookup, type FotmobTransport, type PlayerLookup, type PlayerPicker, marketValueText, matchRatings, playerValueChart, valueTicks } from "../src/sports/fotmob.js";
import { componentPlayerQueries, createPlayerResolver, feedPlayerProfiles, fillClubMarks, populatePlayerImages, rawPlayerQueries } from "../src/sports/player-images.js";
import type { SportsPlan } from "../src/sports/plan.js";

const IMAGE = "https://images.fotmob.com/image_resources/playerimages/1096353.png";
const PROFILE = { fotmobId: 1096353, name: "Cole Palmer", team: "Chelsea", position: "Attacking Midfielder", imageUrl: IMAGE };
{
  const player = { name: "Cole Palmer", team: "Chelsea", fotmobId: 1096353, imageUrl: IMAGE };
  const enriched = populatePlayerImages({ values: { answers: { q1: { players: [player] } } }, fields: [], source: "espn", asOf: "2026-11-05" }, [], []);
  const row = (enriched.values.answers as { q1: { players: { logo?: string; kind?: string }[] } }).q1.players[0]!;
  assert.equal(row.logo, IMAGE, "a squad portrait reaches Avatar's logo even without a separate player lookup");
  assert.equal(row.kind, "player");
  let lookups = 0;
  const resolve = createPlayerResolver(async () => { lookups++; return null; }, [...feedPlayerProfiles({ q1: { players: [player] } }), PROFILE]);
  const known = await resolve([{ name: "Cole Palmer", team: "Chelsea" }]);
  const shaped = { name: "Cole Palmer", kind: "player", team: "Chelsea", logo: "" };
  const restored = populatePlayerImages({ values: { answers: { q1: { players: [shaped] } } }, fields: [], source: "espn", asOf: "2026-11-05" }, known, []);
  assert.equal((restored.values.answers as { q1: { players: { logo: string }[] } }).q1.players[0]!.logo, IMAGE, "a model-omitted photo is restored from the squad identity");
  assert.equal(lookups, 0, "verified squad identities need no search or picker call");
  assert.equal(known.length, 1, "a saved identity and the same fresh squad player do not become ambiguous on follow-up");
  const goals = populatePlayerImages({ values: { answers: { q1: { goals: [{ scorer: "Cole Palmer", assist: "" }] } } }, fields: [], source: "espn", asOf: "2026-11-05" }, known, []);
  assert.equal((goals.values.answers as { q1: { goals: { scorerPlayer: { logo: string } }[] } }).q1.goals[0]!.scorerPlayer.logo, IMAGE, "goal identities use the scorer's own verified photo after model shaping");
  assert.ok(goals.fields.some(field => field.path === "answers.q1.goals[].scorerPlayer.name"), "the goal person's added identity fields are declared");
}
const profilePayload = (id = 1096353, name = "Cole Palmer", team = "Chelsea") => ({
  id, name, primaryTeam: { teamId: 8455, teamName: team },
  positionDescription: { primaryPosition: { label: "Attacking Midfielder" } },
});
const option = (id: string, name: string, team: string, isCoach = false) => ({ text: `${name}|${id}`, payload: { id, teamName: team, isCoach } });
const searchPayload = (...options: ReturnType<typeof option>[]) => ({ squadMemberSuggest: [{ text: "Cole Palmer", options }] });
const calls: string[] = [];
const send: FotmobTransport = async raw => {
  calls.push(raw);
  const url = new URL(raw);
  return url.hostname === "apigw.fotmob.com" ? searchPayload(option("1096353", "Cole Palmer", "Chelsea")) : profilePayload();
};
const lookup = createPlayerLookup({ send });
assert.deepEqual(await lookup({ name: "Cole Palmer", team: "Chelsea" }), PROFILE);
assert.deepEqual(await lookup({ name: "Cole Palmer", team: "Chelsea" }), PROFILE);
assert.equal(calls.length, 4, "nothing is cached: each lookup searches again");
assert.ok(calls[0]?.startsWith("https://apigw.fotmob.com/searchapi/suggest?"));
assert.equal(new URL(calls[0]!).searchParams.get("term"), "Cole Palmer");
assert.equal(new URL(calls[1]!).searchParams.get("id"), "1096353");

const concurrentCalls: string[] = [];
const concurrent = createPlayerLookup({ send: async url => { concurrentCalls.push(url); return send(url); } });
await Promise.all([concurrent({ name: "Cole Palmer" }), concurrent({ name: "Cole Palmer" })]);
assert.equal(concurrentCalls.length, 2, "concurrent requests for one identity share search and profile work");

let ambiguousProfileCalls = 0;
const ambiguous = createPlayerLookup({ send: async raw => {
  if (new URL(raw).hostname === "apigw.fotmob.com") return searchPayload(option("1096353", "Cole Palmer", "Chelsea"), option("9999", "Cole Palmer", "Other club"));
  ambiguousProfileCalls++;
  return profilePayload();
} });
assert.equal(await ambiguous({ name: "Cole Palmer" }), null, "same-name players cannot select an arbitrary portrait");
assert.equal(ambiguousProfileCalls, 0);
assert.deepEqual(await ambiguous({ name: "Cole Palmer", team: "Chelsea" }), PROFILE, "the club disambiguates a full name");
assert.equal(await ambiguous({ name: "Cole Palmer", team: "Unknown club" }), null);

for (const response of [
  searchPayload(),
  searchPayload(option("1096353", "Cole Palmer", "Chelsea", true)),
  searchPayload(option("1096353", "Cole Palmer Jr", "Chelsea")),
  searchPayload(option("not-an-id", "Cole Palmer", "Chelsea")),
]) {
  let profiles = 0;
  const unknown = createPlayerLookup({ send: async raw => {
    if (new URL(raw).hostname === "apigw.fotmob.com") return response;
    profiles++;
    return profilePayload();
  } });
  assert.equal(await unknown({ name: "Cole Palmer" }), null);
  assert.equal(profiles, 0, "unverified identities never produce a profile or image URL");
}

// Run 81cbaba2: namesakes and players who have moved go to the model, which reads each career. It can only choose a real result.
{
  const entry = (id: string, name: string, team: string) => option(id, name, team);
  const careers: Record<string, string[]> = { "1": ["Manchester City", "Chelsea", "Benfica"], "2": ["C.S. Cartaginés"] };
  const searches: string[] = [];
  const fotmob = createPlayerLookup({ send: async raw => {
    const url = new URL(raw);
    if (url.hostname === "apigw.fotmob.com") {
      const term = url.searchParams.get("term")!;
      searches.push(term);
      return term === "Heung-min Son" ? searchPayload(entry("1", "Heung-min Son", "Los Angeles FC")) : searchPayload(entry("1", "Enzo Fernández", "Manchester City"), entry("2", "Enzo Fernandez", "C.S. Cartaginés"));
    }
    const id = url.searchParams.get("id")!;
    return { id: Number(id), name: "Enzo Fernández", primaryTeam: { teamName: careers[id]![0] }, careerHistory: { careerItems: { senior: { teamEntries: careers[id]!.map(team => ({ team })) } } } };
  } });
  const photo = "https://images.fotmob.com/image_resources/playerimages/1.png";
  const seen: { name: string; careers: string[][] }[] = [];
  const chooses = (fotmobId: number | null, searchAgain: string | null = null): PlayerPicker => async (query, candidates) => {
    seen.push({ name: query.name, careers: candidates.map(c => [...c.career]) });
    return { fotmobId, searchAgain };
  };
  assert.deepEqual(await fotmob({ name: "Enzo Fernández", team: "Chelsea" }, chooses(1)).then(p => [p?.imageUrl, p?.team]), [photo, "Chelsea"], "the model's choice decides, and he keeps the club asked about");
  assert.deepEqual(seen[0]?.careers, [careers["1"], careers["2"]], "the model reads each namesake's career");
  assert.equal(await fotmob({ name: "Enzo Fernández", context: "x" }, chooses(99)), null, "an id that is not in the results is ignored");
  assert.equal(await createPlayerLookup({ send: async raw => new URL(raw).hostname === "apigw.fotmob.com" ? searchPayload(entry("1", "Enzo Fernández", "Manchester City"), entry("2", "Enzo Fernandez", "C.S. Cartaginés")) : {} })({ name: "Enzo Fernández" }), null, "with no model, namesakes stay unresolved");
  let calls = 0;
  const secondSearch: PlayerPicker = async (_query, candidates) => { calls++; return calls === 1 ? { fotmobId: null, searchAgain: "Heung-min Son" } : { fotmobId: candidates[0]?.fotmobId ?? null, searchAgain: null }; };
  searches.length = 0;
  assert.equal((await fotmob({ name: "Son Heung-Min" }, secondSearch))?.imageUrl, photo, "a name FotMob knows differently is searched again");
  assert.deepEqual(searches, ["Son Heung-Min", "Heung-min Son"]);
  assert.deepEqual(componentPlayerQueries({ board: { metric: "Goals", entries: [{ name: "João Pedro", detail: "Forward · Chelsea" }] } }, []), [{ name: "João Pedro", context: "Forward · Chelsea" }], "the detail line reaches the model");
  const filled = fillClubMarks({ values: { answers: { q1: { match: { home: { name: "West Ham United", logo: "", color: "" }, away: { name: "Chelsea", logo: "chelsea.png", color: "#144992" }, unknown: { name: "Nowhere FC", logo: "", color: "#123456" } }, scorer: { kind: "player", name: "Everton", logo: "", color: "#0606fa" } } } }, fields: [], asOf: "", source: "espn" as const },
    [{ id: "21", name: "West Ham United", short: "West Ham", abbreviation: "WHU", color: "#7a263a", alternateColor: "", logo: "whu.png", league: "eng.1" }, { id: "368", name: "Everton", short: "Everton", abbreviation: "EVE", color: "#0606fa", alternateColor: "", logo: "eve.png", league: "eng.1" }]);
  assert.deepEqual((filled.values.answers as Record<string, unknown>).q1, { match: { home: { name: "West Ham United", logo: "whu.png", color: "clear" }, away: { name: "Chelsea", logo: "chelsea.png", color: "clear" }, unknown: { name: "Nowhere FC", logo: "", color: "#123456" } }, scorer: { kind: "player", name: "Everton", logo: "", color: "#0606fa" } }, "a club with a logo passes clear; a club without one keeps its colour for the monogram; a player keeps the disc colour");
  // ESPN and FotMob name Inter differently, and a late kickoff can sit under FotMob's earlier day.
  const fotmobMatches = async (url: string) => url.includes("matchDetails") ? { content: { matchFacts: { topPlayers: { homeTopPlayers: [{ playerId: 7, name: { fullName: "Hakan Calhanoglu" }, playerRatingRounded: "8.1", positionLabel: { label: "DM" } }], awayTopPlayers: [] } } } }
    : url.endsWith("20261101") ? { leagues: [{ matches: [{ id: 1, home: { name: "Inter", score: 1 }, away: { name: "Roma", score: 1 } }, { id: 2, home: { name: "Inter", score: 2 }, away: { name: "Lille", score: 0 } }] }] } : { leagues: [] };
  assert.deepEqual(await matchRatings({ date: "2026-11-02T00:30:00Z", home: "Internazionale", away: "Monaco", homeScore: 2, awayScore: 0 }, fotmobMatches), { home: [{ fotmobId: 7, name: "Hakan Calhanoglu", rating: "8.1", position: "DM", imageUrl: "https://images.fotmob.com/image_resources/playerimages/7.png" }], away: [], lineup: { home: [], away: [] } }, "the match is found by the day before, its score and one club's name");
  assert.equal(await matchRatings({ date: "2026-11-01T18:00:00Z", home: "Internazionale", away: "AS Monaco", homeScore: 3, awayScore: 0 }, fotmobMatches), null, "a different score is a different match");
  // A move back to a club is a new stretch, and the history reads in date order whatever order it arrives in.
  const spell = (date: string, value: number, teamId: number, teamName: string) => ({ date, value, teamId, teamName, teamColor: { lightMode: "#111111", darkMode: "#222222" } });
  const chart = playerValueChart("A Player", [spell("2024-01-01T00:00:00Z", 2_000_000, 2, "Loan FC"), spell("2023-01-01T00:00:00Z", 950_000, 1, "Home FC"), spell("2025-01-01T00:00:00Z", 110_000_000, 1, "Home FC")]);
  assert.deepEqual(chart?.segments.map(s => [s.name, s.points.map(p => p.display)]), [["Home FC", ["€950k"]], ["Loan FC", ["€2M"]], ["Home FC", ["€110M"]]], "one stretch per unbroken spell, oldest first, values short");
  assert.equal(chart?.value, "€110M", "the current value is the latest one");
  assert.deepEqual([900_000, 999_499, 999_500, 1_000_000, 1_250_000].map(marketValueText), ["€900k", "€999k", "€1M", "€1M", "€1.3M"], "thousands under a million, millions from there, never \"€1000k\"");
  assert.deepEqual([116_235_970, 900_000].map(top => valueTicks(top).map(tick => tick.display)), [["€0", "€50M", "€100M"], ["€0", "€250k", "€500k", "€750k"]], "round y axis labels from zero, no higher than the top value");
  assert.equal(playerValueChart("A Player", [spell("2024-01-01T00:00:00Z", 1, 1, "Home FC")]), null, "one value is not a history");
  // Haaland's 54 months at City broke the dataset's limit of 40 per list, and the whole chart became "Couldn't show this data".
  const months = Array.from({ length: 54 }, (_, month) => spell(new Date(Date.UTC(2022, 6 + month)).toISOString(), month === 37 ? 200_000_000 : 1_000_000 + month, 1, "Long FC"));
  const long = playerValueChart("A Player", months)!.segments[0]!.points;
  assert.equal(long.length, 40, "a long spell fits the dataset's list limit");
  assert.deepEqual([long[0]!.label, long.at(-1)!.label, Math.max(...long.map(point => point.value))], ["Jul 2022", "Dec 2026", 200_000_000], "it keeps the spell's start, end and peak");
  const cell = (name: string, club: string, present = true) => ({ present, name, detail: "Midfielder", club: { name: club } });
  assert.deepEqual(componentPlayerQueries({ q1: { card: { metric: "Goals", rows: [{ home: cell("Cole Palmer", "Chelsea"), away: cell("", "", false) }] } } }, []), [{ name: "Cole Palmer", team: "Chelsea", context: "Midfielder" }], "a two-team card looks up its players by club and skips an empty side");
  // People in any list are looked up when the schema stage marks them as players; other named records are not.
  assert.deepEqual(componentPlayerQueries({ q5: { partners: [{ name: "Ricardo Carvalho", kind: "player", team: "Chelsea", logo: "", color: "" }], honours: [{ name: "Premier League", count: "5x", detail: "" }], mentor: { name: "Marcel Desailly", kind: "player", team: "", logo: "", color: "" } } }, []),
    [{ name: "Ricardo Carvalho", team: "Chelsea" }, { name: "Marcel Desailly" }], "a list of people is looked up; an honour is not");
}

const mismatch = createPlayerLookup({ send: async raw => new URL(raw).hostname === "apigw.fotmob.com"
  ? searchPayload(option("1096353", "Cole Palmer", "Chelsea")) : profilePayload(422685, "Bruno Fernandes", "Manchester United") });
assert.equal(await mismatch({ name: "Cole Palmer" }), null, "profile identity must match the search result");
let failing = true;
const recovery = createPlayerLookup({ send: async raw => {
  if (failing) throw new Error("FotMob temporarily unavailable");
  return send(raw);
} });
assert.equal(await recovery({ name: "Cole Palmer" }), null);
failing = false;
assert.deepEqual(await recovery({ name: "Cole Palmer" }), PROFILE, "a failed lookup does not stop the next one");

// No cap on how many: every named player is looked up.
let everyLookup = 0;
const everyone = createPlayerResolver(async query => { everyLookup++; return { ...PROFILE, fotmobId: everyLookup, name: query.name }; });
assert.equal((await everyone(Array.from({ length: 30 }, (_, i) => ({ name: `Player ${i}` })))).length, 30, "thirty players, thirty photos");
assert.equal(everyLookup, 30);
// One stalled lookup times out on its own; the others in its batch still answer.
let releaseLate: (profile: typeof PROFILE) => void = () => {};
const lateResult = new Promise<typeof PROFILE>(resolve => { releaseLate = resolve; });
const bounded = createPlayerResolver(async query => (query.name === "Stalled" ? lateResult : { ...PROFILE, name: query.name }), [], 1);
assert.deepEqual((await bounded([{ name: "Stalled" }, { name: "Cole Palmer" }])).map(profile => profile.name), ["Cole Palmer"], "a stalled provider cannot hold the screen or the other lookups");
releaseLate(PROFILE);
assert.deepEqual((await bounded([{ name: "Stalled" }])).map(profile => profile.name), ["Cole Palmer"], "a late answer does not change a returned directory or start the lookup again");

const plan: SportsPlan = { subject: { kind: "player", name: "Cole Palmer", league: "eng.1", season: "2026/27" }, questions: [
  { id: "q1", text: "Cole Palmer season stats", source: "web", searchQueries: ["Cole Palmer season stats"] },
] };
const PAGE = "https://www.chelseafc.com/en/teams/profile/cole-palmer";
assert.deepEqual(rawPlayerQueries({ subject: { ...plan.subject, kind: "match" }, questions: [{
  id: "q1", text: "Chelsea v Manchester City", source: "espn", league: "eng.1", feed: "match", team: "Chelsea", opponent: "Manchester City", date: null, season: null,
}] }, { q1: { status: "complete", teamPlayers: [{ name: "Cole Palmer" }], opponentPlayers: [{ name: "Phil Foden" }] } }), [
  { name: "Cole Palmer", team: "Chelsea" }, { name: "Phil Foden", team: "Manchester City" },
], "explicit match players retain their club context during identity resolution");
const record = {
  name: "Cole Palmer", detail: "Chelsea · Attacking Midfielder", logo: "https://example.test/model-guessed.png", color: "#051495",
  rating: { value: "7.21", tone: "good", fill: "tone.good.fg", ink: "surface.screen", label: "Season rating", caption: "Average of 6 matches" },
  stats: [{ label: "Goals", value: "2" }],
};
const completion = (value: unknown): Completion => ({ model: "fake", finishReason: "stop", text: JSON.stringify(value), usage: { promptTokens: 0, completionTokens: 0, costUSD: 0 } });
const writer = (text: string): ProgramWriter => async (_messages, emit) => {
  emit(text);
  return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } };
};
const schema: CompletionSender = async request => {
  assert.ok(request.messages.some(message => message.content.includes(IMAGE)), "the schema stage can use the verified portrait");
  return completion({ answers: [{ id: "q1", title: "Cole Palmer", fields: [
    ...inferFields({ player: record }, ""), { path: "passAccuracy", kind: "number", format: "percent" },
  ], valuesJson: JSON.stringify({ player: record, passAccuracy: 86.5 }) }] });
};
const deps = (player: PlayerLookup = lookup, design: CompletionSender = schema): SportsDeps => ({
  plan: async () => plan,
  espn: async () => ({ sports: [{ leagues: [{ teams: [] }] }] }),
  parallel: async kind => kind === "search" ? { search_id: "s", results: [{ url: PAGE, title: "Cole Palmer", excerpts: ["Cole Palmer plays for Chelsea. Goals 2."] }] } : { extract_id: "e", results: [], errors: [] },
  extract: async () => completion({ title: "Cole Palmer", summary: "Cole Palmer plays for Chelsea.", columns: ["Goals"], rows: [{ label: "Cole Palmer", cells: ["2"] }], facts: [], asOf: "2026-10-27", sourceUrls: [PAGE] }),
  schema: design, player,
  write: writer("palmer = StatsCard(d.answers.q1.player)\n"),
  now: new Date("2026-10-27T12:00:00Z"),
});
const responseSchema = z.object({
  players: z.array(z.object({ fotmobId: z.number(), name: z.string(), team: z.string(), position: z.string(), imageUrl: z.string() })),
  answers: z.object({ q1: z.object({ player: z.object({ name: z.string(), logo: z.string(), imageUrl: z.string(), fotmobId: z.number() }) }) }),
});
const correctedMetadata = populatePlayerImages({
  values: { answers: { q1: { player: { name: "Cole Palmer", imageUrl: 0, fotmobId: "guessed", logo: 0 }, passAccuracy: 86.5 } } },
  fields: [
    { path: "answers.q1.player.imageUrl", kind: "number", format: "decimal" },
    { path: "answers.q1.player.fotmobId", kind: "text", format: "none" },
    { path: "answers.q1.player.logo", kind: "number", format: "decimal" },
    { path: "answers.q1.passAccuracy", kind: "number", format: "percent" },
  ], asOf: "2026-10-27", source: "web",
}, [PROFILE], [{ name: "Cole Palmer" }]);
assert.deepEqual(correctedMetadata.fields.find(field => field.path === "answers.q1.player.imageUrl"), { path: "answers.q1.player.imageUrl", kind: "text", format: "none" });
assert.deepEqual(correctedMetadata.fields.find(field => field.path === "answers.q1.player.fotmobId"), { path: "answers.q1.player.fotmobId", kind: "number", format: "integer" });
assert.deepEqual(correctedMetadata.fields.find(field => field.path === "answers.q1.player.logo"), { path: "answers.q1.player.logo", kind: "text", format: "none" });
assert.ok(correctedMetadata.fields.some(field => field.path === "answers.q1.passAccuracy" && field.format === "percent"));
assert.equal((correctedMetadata.values as { answers: { q1: { player: { kind: unknown } } } }).answers.q1.player.kind, "player", "a resolved player's Avatar shows the photo on the disc colour");
const clubAnswers = { q1: { board: { heading: "League table", metric: "Points", entries: [{ name: "Arsenal", detail: "Premier League", value: "20", logo: "https://example.test/arsenal.png", color: "#ef0107" }] } } };
assert.deepEqual(componentPlayerQueries(clubAnswers, []), [{ name: "Arsenal", context: "Premier League" }], "an unknown leaderboard entry is only a possible player");
const clubDataset = { values: { answers: clubAnswers }, fields: inferFields(clubAnswers, "answers"), asOf: "2026-10-27", source: "espn" as const };
assert.deepEqual(populatePlayerImages(clubDataset, [], []).values, clubDataset.values, "an unresolved component candidate cannot erase a club's crest or add player metadata");
// Only the clubs a screen is about used to reach d.clubs, so every other player's photo sat on the theme's orange.
const clubDirectoryFixture = [
  { id: "1", name: "Liverpool", short: "Liverpool", abbreviation: "LIV", color: "#d11317", alternateColor: "", logo: "", league: "eng.1" },
  { id: "2", name: "Bayern Munich", short: "Bayern", abbreviation: "BAY", color: "#dc052d", alternateColor: "", logo: "", league: "ger.1" },
] as const;
const colours = (fillClubMarks({ values: { answers: { q1: { board: { entries: [
  { name: "Alexander Isak", kind: "player", detail: "Striker · Liverpool", logo: "x", color: "" },
  { name: "Michael Olise", kind: "player", detail: "FC Bayern München", logo: "x", color: "#123456" },
  { name: "Someone Else", kind: "player", detail: "Unknown FC", logo: "x", color: "" },
] } } } }, fields: [], asOf: "2026-11-04", source: "espn" as const }, clubDirectoryFixture as never).values as { answers: { q1: { board: { entries: { color: string }[] } } } }).answers.q1.board.entries.map(entry => entry.color);
assert.deepEqual(colours, ["#d11317", "#dc052d", ""], "a player's disc is their club's colour, from any part of the detail line and under a local name; an unknown club stays empty");
const directory = mkdtempSync(path.join(tmpdir(), "player-images-check-"));
try {
  const store = new SnapshotStore(path.join(directory, "snapshots"));
  const documents = new DocumentStore(path.join(directory, "documents"));
  const results: SportsResult[] = [];
  const app = sportsRoutes({ store, documents, savedDirectory: path.join(directory, "saved"), ask: async (request, snapshots, hooks, run) => {
    const result = await askSports(request, snapshots, hooks, run, deps());
    results.push(result);
    return result;
  } });
  const generated = await app.request("/lang/sports/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "Cole Palmer season stats" }) });
  assert.equal(generated.status, 200);
  const events = await generated.text();
  assert.ok(events.includes("event: done"), events);
  const result = results[0];
  assert.ok(result);
  const response = await app.request("/tools/sports_dataset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run: result.run }) });
  assert.equal(response.status, 200);
  const body = responseSchema.parse(await response.json());
  assert.deepEqual(body.players, [PROFILE]);
  assert.equal(body.answers.q1.player.fotmobId, PROFILE.fotmobId);
  assert.equal(body.answers.q1.player.imageUrl, IMAGE);
  assert.equal(body.answers.q1.player.logo, IMAGE, "authoritative imagery replaces a model's guessed logo");
  assert.ok(result.snapshot.fields.some(field => field.path === "answers.q1.passAccuracy" && field.format === "percent"), "enrichment preserves numeric field formats");
  assert.ok(programTree(result.program, result.snapshot.result, SPORTS_TEMPLATES).nodes.some(node => node.primitive === "Avatar" && node.props.image === IMAGE), "the compiled StatsCard uses the portrait");

  const saved = nextRevision(null, result.run, "Cole Palmer season stats", result);
  let keptLookups = 0;
  const kept = await editSports(saved, { prompt: "Keep this" }, store, {}, "players-kept", {
    ...deps(async () => { keptLookups++; return null; }),
    planFollowUp: async () => ({ subject: plan.subject, questions: plan.questions.map(question => ({ ...question, change: "kept" })), removed: [] }),
  });
  assert.deepEqual(kept.snapshot.result.players, result.snapshot.result.players);
  assert.deepEqual(kept.snapshot.result.answers, result.snapshot.result.answers);
  assert.equal(keptLookups, 0, "kept player profiles need no lookup");
  assert.deepEqual(programTree(kept.program, kept.snapshot.result, SPORTS_TEMPLATES), programTree(result.program, result.snapshot.result, SPORTS_TEMPLATES), "a kept part renders the same data and portrait from the new snapshot");

  let freshLookups = 0;
  const fresh = await editSports(saved, { prompt: "Also show his recent ratings" }, store, {}, "players-fresh", {
    ...deps(async () => { freshLookups++; return null; }, async () => completion({ answers: [{ id: "q2", title: "Recent ratings", fields: inferFields({ player: record }, ""), valuesJson: JSON.stringify({ player: record }) }] })),
    planFollowUp: async () => ({ subject: plan.subject, questions: [
      ...plan.questions.map(question => ({ ...question, change: "kept" as const })),
      { id: "q2", text: "Cole Palmer recent ratings", source: "web", searchQueries: ["Cole Palmer recent ratings"], change: "added" },
    ], removed: [] }),
    write: writer("recent = StatsCard(d.answers.q2.player)\n"),
  });
  assert.equal(freshLookups, 0, "new questions about a known player reuse the saved profile");
  assert.deepEqual(fresh.snapshot.result.players, [PROFILE]);
  assert.equal(programTree(fresh.program, fresh.snapshot.result, SPORTS_TEMPLATES).nodes.filter(node => node.primitive === "Avatar" && node.props.image === IMAGE).length, 2, "kept and newly composed parts receive the same saved portrait");

  const fallback = await askSports({ prompt: "Cole Palmer season stats" }, store, {}, "players-fallback", deps(lookup, async () => completion({ answers: [] })));
  assert.deepEqual(fallback.snapshot.result.players, [PROFILE], "raw fallback still returns the verified player object");

  const board = { heading: "Chelsea top scorers", metric: "Goals", entries: [{ name: "Cole Palmer", detail: "Chelsea", value: "2", logo: "", color: "#051495" }] };
  const boardDeps: SportsDeps = {
    ...deps(),
    plan: async () => ({ ...plan, subject: { ...plan.subject, kind: "team", name: "Chelsea" } }),
    schema: async () => completion({ answers: [{ id: "q1", title: "Top scorers", fields: inferFields({ board }, ""), valuesJson: JSON.stringify({ board }) }] }),
    write: writer("scorers = Leaderboard(d.answers.q1.board)\n"),
  };
  const ranked = await askSports({ prompt: "Chelsea top scorers" }, store, {}, "players-leaderboard", boardDeps);
  assert.deepEqual(ranked.snapshot.result.players, [PROFILE], "player names introduced by component shaping are resolved");
  assert.ok(programTree(ranked.program, ranked.snapshot.result, SPORTS_TEMPLATES).nodes.some(node => node.primitive === "Avatar" && node.props.image === IMAGE), "Leaderboard entries use their verified player portrait");

  const clubRanking = await askSports({ prompt: "Premier League points leaders" }, store, {}, "players-club-ranking", {
    ...deps(async () => null, async () => completion({ answers: [{ id: "q1", title: "League table", fields: inferFields(clubAnswers.q1, ""), valuesJson: JSON.stringify(clubAnswers.q1) }] })),
    plan: async () => ({ ...plan, subject: { ...plan.subject, kind: "league", name: "Premier League" } }),
    write: writer("clubs = Leaderboard(d.answers.q1.board)\n"),
  });
  assert.ok(programTree(clubRanking.program, clubRanking.snapshot.result, SPORTS_TEMPLATES).nodes.some(node => node.primitive === "Avatar" && node.props.image === "https://example.test/arsenal.png"), "failed player enrichment preserves a club leaderboard's existing crest through the full pipeline");

  let missingLookups = 0;
  const withoutImages = await askSports({ prompt: "Cole Palmer season stats" }, store, {}, "players-unavailable", deps(async () => { missingLookups++; return null; }, async () => completion({ answers: [{
    id: "q1", title: "Cole Palmer", fields: inferFields({ player: { ...record, logo: "" } }, ""), valuesJson: JSON.stringify({ player: { ...record, logo: "" } }),
  }] })));
  assert.ok(withoutImages.program.length > 0, "missing portraits cannot prevent the screen from being returned");
  assert.equal(missingLookups, 1, "schema shaping does not retry a missing identity within the same request");
  assert.ok(programTree(withoutImages.program, withoutImages.snapshot.result, SPORTS_TEMPLATES).nodes.some(node => node.primitive === "Avatar" && node.props.image === ""), "unresolved players keep the initials fallback");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("player images: verified identity, ambiguity, failure recovery, API object, schema omission, Avatar wiring, follow-ups, people lists and raw fallback passed");
