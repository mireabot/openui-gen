import assert from "node:assert/strict";
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
import { createPlayerLookup, type FotmobTransport, type PlayerLookup } from "../src/sports/fotmob.js";
import { componentPlayerQueries, createPlayerResolver, populatePlayerImages, rawPlayerQueries } from "../src/sports/player-images.js";
import type { SportsPlan } from "../src/sports/plan.js";

const IMAGE = "https://images.fotmob.com/image_resources/playerimages/1096353.png";
const PROFILE = { fotmobId: 1096353, name: "Cole Palmer", team: "Chelsea", position: "Attacking Midfielder", imageUrl: IMAGE };
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
assert.equal(calls.length, 2, "a cached identity needs no second search or profile request");
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
assert.deepEqual(await recovery({ name: "Cole Palmer" }), PROFILE, "transient failures do not cache a missing identity");

let budgetLookups = 0;
const noBudget = createPlayerResolver(async () => { budgetLookups++; return PROFILE; }, [], 0);
assert.deepEqual(await noBudget([{ name: "Cole Palmer" }]), []);
assert.equal(budgetLookups, 0, "an exhausted enrichment budget queues no requests");
let releaseLate: (profile: typeof PROFILE) => void = () => {};
const lateResult = new Promise<typeof PROFILE>(resolve => { releaseLate = resolve; });
const bounded = createPlayerResolver(async () => lateResult, [], 1);
const expiredProfiles = await bounded([{ name: "Cole Palmer" }]);
assert.deepEqual(expiredProfiles, [], "a stalled provider cannot hold enrichment open");
releaseLate(PROFILE);
assert.deepEqual(await bounded([{ name: "Cole Palmer" }]), [], "late completion cannot alter a returned directory or start another lookup");

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
assert.equal((correctedMetadata.values as { answers: { q1: { player: { kind: unknown } } } }).answers.q1.player.kind, "player", "a resolved player's Avatar stands the photo on the disc's bottom edge");
const clubAnswers = { q1: { board: { title: "League table", metric: "Points", entries: [{ name: "Arsenal", detail: "Premier League", value: "20", logo: "https://example.test/arsenal.png", color: "#ef0107" }] } } };
assert.deepEqual(componentPlayerQueries(clubAnswers, []), [{ name: "Arsenal" }], "an unknown leaderboard entry is only a possible player");
const clubDataset = { values: { answers: clubAnswers }, fields: inferFields(clubAnswers, "answers"), asOf: "2026-10-27", source: "espn" as const };
assert.deepEqual(populatePlayerImages(clubDataset, [], []).values, clubDataset.values, "an unresolved component candidate cannot erase a club's crest or add player metadata");
const directory = mkdtempSync(path.join(tmpdir(), "player-images-check-"));
try {
  const store = new SnapshotStore(path.join(directory, "snapshots"));
  const documents = new DocumentStore(path.join(directory, "documents"));
  const results: SportsResult[] = [];
  const app = sportsRoutes({ store, documents, ask: async (request, snapshots, hooks, run) => {
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
  assert.ok(programTree(result.program, result.snapshot.result).nodes.some(node => node.primitive === "Avatar" && node.props.image === IMAGE), "the compiled StatsCard uses the portrait");

  const saved = nextRevision(null, result.run, "Cole Palmer season stats", result);
  let keptLookups = 0;
  const kept = await editSports(saved, { prompt: "Keep this" }, store, {}, "players-kept", {
    ...deps(async () => { keptLookups++; return null; }),
    planFollowUp: async () => ({ subject: plan.subject, questions: plan.questions.map(question => ({ ...question, change: "kept" })), removed: [] }),
  });
  assert.deepEqual(kept.snapshot.result.players, result.snapshot.result.players);
  assert.deepEqual(kept.snapshot.result.answers, result.snapshot.result.answers);
  assert.equal(keptLookups, 0, "kept player profiles need no lookup");
  assert.deepEqual(programTree(kept.program, kept.snapshot.result), programTree(result.program, result.snapshot.result), "a kept part renders the same data and portrait from the new snapshot");

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
  assert.equal(programTree(fresh.program, fresh.snapshot.result).nodes.filter(node => node.primitive === "Avatar" && node.props.image === IMAGE).length, 2, "kept and newly composed parts receive the same saved portrait");

  const fallback = await askSports({ prompt: "Cole Palmer season stats" }, store, {}, "players-fallback", deps(lookup, async () => completion({ answers: [] })));
  assert.deepEqual(fallback.snapshot.result.players, [PROFILE], "raw fallback still returns the verified player object");

  const board = { title: "Chelsea top scorers", metric: "Goals", entries: [{ name: "Cole Palmer", detail: "Chelsea", value: "2", logo: "", color: "#051495" }] };
  const boardDeps: SportsDeps = {
    ...deps(),
    plan: async () => ({ ...plan, subject: { ...plan.subject, kind: "team", name: "Chelsea" } }),
    schema: async () => completion({ answers: [{ id: "q1", title: "Top scorers", fields: inferFields({ board }, ""), valuesJson: JSON.stringify({ board }) }] }),
    write: writer("scorers = Leaderboard(d.answers.q1.board)\n"),
  };
  const ranked = await askSports({ prompt: "Chelsea top scorers" }, store, {}, "players-leaderboard", boardDeps);
  assert.deepEqual(ranked.snapshot.result.players, [PROFILE], "player names introduced by component shaping are resolved");
  assert.ok(programTree(ranked.program, ranked.snapshot.result).nodes.some(node => node.primitive === "Avatar" && node.props.image === IMAGE), "Leaderboard entries use their verified player portrait");

  const clubRanking = await askSports({ prompt: "Premier League points leaders" }, store, {}, "players-club-ranking", {
    ...deps(async () => null, async () => completion({ answers: [{ id: "q1", title: "League table", fields: inferFields(clubAnswers.q1, ""), valuesJson: JSON.stringify(clubAnswers.q1) }] })),
    plan: async () => ({ ...plan, subject: { ...plan.subject, kind: "league", name: "Premier League" } }),
    write: writer("clubs = Leaderboard(d.answers.q1.board)\n"),
  });
  assert.ok(programTree(clubRanking.program, clubRanking.snapshot.result).nodes.some(node => node.primitive === "Avatar" && node.props.image === "https://example.test/arsenal.png"), "failed player enrichment preserves a club leaderboard's existing crest through the full pipeline");

  let missingLookups = 0;
  const withoutImages = await askSports({ prompt: "Cole Palmer season stats" }, store, {}, "players-unavailable", deps(async () => { missingLookups++; return null; }, async () => completion({ answers: [{
    id: "q1", title: "Cole Palmer", fields: inferFields({ player: { ...record, logo: "" } }, ""), valuesJson: JSON.stringify({ player: { ...record, logo: "" } }),
  }] })));
  assert.ok(withoutImages.program.length > 0, "missing portraits cannot prevent the screen from being returned");
  assert.equal(missingLookups, 1, "schema shaping does not retry a missing identity within the same request");
  assert.ok(programTree(withoutImages.program, withoutImages.snapshot.result).nodes.some(node => node.primitive === "Avatar" && node.props.image === ""), "unresolved players keep the initials fallback");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("player images: verified identity, ambiguity, cache, failure recovery, API object, schema omission, Avatar wiring, follow-ups and raw fallback passed");
