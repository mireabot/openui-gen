import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileScreen, type ProgramWriter } from "../src/lang/compiler.js";
import { programTree } from "../src/lang/tree.js";
import { SnapshotStore } from "../src/lang/snapshots.js";
import type { Completion, CompletionSender } from "../src/llm/structured-completion.js";
import type { ParallelTransport } from "../src/research/parallel-research.js";
import { askSports } from "../src/sports/ask.js";
import { espnLookup, type EspnTransport } from "../src/sports/espn.js";
import { rawSchema, toPlan, type SportsPlan } from "../src/sports/plan.js";
import { preview, SPORTS_SCREEN } from "../src/sports/screen.js";

/** The sports pipeline offline: scripted ESPN, Parallel, Sonnet, Opus and writer; no network, no keys. */

const team = (id: string, name: string, abbreviation: string) => ({ id, displayName: name, shortDisplayName: name, abbreviation, color: "034694", logo: `https://example.test/${id}.png` });
const CHELSEA = team("363", "Chelsea", "CHE");
const SPURS = team("367", "Tottenham Hotspur", "TOT");
const EVERTON = team("368", "Everton", "EVE");
const entry = (t: ReturnType<typeof team>, rank: number, points: number) => ({ team: t, stats: [
  { name: "rank", value: rank }, { name: "gamesPlayed", value: 8 }, { name: "wins", value: 4 }, { name: "ties", value: 1 },
  { name: "losses", value: 3 }, { name: "pointsFor", value: 17 }, { name: "pointsAgainst", value: 15 }, { name: "pointDifferential", value: 2 }, { name: "points", value: points },
] });
const event = (date: string, home: ReturnType<typeof team>, away: ReturnType<typeof team>, homeScore: string, awayScore: string) => ({
  date, competitions: [{ status: { type: { state: "post", shortDetail: "FT" } }, venue: { fullName: "Ground" },
    broadcasts: [{ media: { shortName: "TV" } }],
    competitors: [{ homeAway: "home", team: home, score: { displayValue: homeScore } }, { homeAway: "away", team: away, score: { displayValue: awayScore } }] }],
});
const CITY = team("382", "Manchester City", "MNC");
const fixture = (date: string, home: ReturnType<typeof team>, away: ReturnType<typeof team>, id: string) => ({ id, date, competitions: [{ status: { type: { state: "pre", shortDetail: "Scheduled" } }, competitors: [{ homeAway: "home", team: home }, { homeAway: "away", team: away }] }] });
const box = (t: ReturnType<typeof team>, shots: string, onTarget: string, possession: string) => ({ team: { id: t.id }, statistics: [{ name: "totalShots", displayValue: shots }, { name: "shotsOnTarget", displayValue: onTarget }, { name: "possessionPct", displayValue: possession }] });
const espn: EspnTransport = async raw => {
  const url = new URL(raw);
  if (url.pathname.endsWith("/standings")) return { children: [{ standings: { entries: [entry(SPURS, 4, 15), entry(CHELSEA, 5, 13)] } }] };
  if (url.pathname.endsWith("/teams")) return { sports: [{ leagues: [{ teams: [{ team: CHELSEA }, { team: SPURS }, { team: EVERTON }, { team: CITY }] }] }] };
  if (url.pathname.endsWith("/schedule")) {
    // This season: two results, no City game yet, City still to come; last season: the April meeting.
    if (url.searchParams.get("fixture") === "true") return { requestedSeason: { year: 2026 }, events: [fixture("2026-12-12T17:30Z", CITY, CHELSEA, "f1")] };
    if (url.searchParams.get("season") === "2025") return { requestedSeason: { year: 2025 }, events: [{ id: "740909", ...event("2026-04-12T15:30Z", CHELSEA, CITY, "0", "3") }] };
    return { requestedSeason: { year: 2026 }, events: [event("2026-10-24T14:00Z", CHELSEA, SPURS, "0", "2"), event("2026-10-17T14:00Z", EVERTON, CHELSEA, "0", "2")] };
  }
  if (url.pathname.endsWith("/summary") && url.searchParams.get("event") === "740909") return {
    boxscore: { teams: [box(CHELSEA, "12", "3", "37.3"), box(CITY, "18", "8", "62.7")] },
    keyEvents: [{ scoringPlay: true, clock: { displayValue: "51'" }, team: { id: "382" }, participants: [{ athlete: { displayName: "Nico O'Reilly" } }, { athlete: { displayName: "Rayan Cherki" } }] }],
    rosters: [{ team: { id: "363" }, roster: [{ athlete: { displayName: "Cole Palmer" }, stats: [{ name: "totalShots", value: 4 }, { name: "shotsOnTarget", value: 1 }] }] }],
  };
  throw new Error(`unexpected ESPN url ${raw}`);
};

const PAGE = "https://www.bbc.com/sport/football/scorers";
const parallel: ParallelTransport = async kind => kind === "search"
  ? { search_id: "s", results: [{ url: PAGE, title: "Top scorers", excerpts: ["João Pedro 5 goals, Cole Palmer 3 goals"] }] }
  : { extract_id: "e", results: [], errors: [] };
const completion = (value: unknown): Completion => ({ model: "fake", finishReason: "stop", text: JSON.stringify(value), usage: { promptTokens: 0, completionTokens: 0, costUSD: 0 } });
const finding = (sourceUrls: string[]) => ({ title: "Top scorers", summary: "João Pedro leads Chelsea with five league goals.", columns: ["Goals"],
  rows: [{ label: "João Pedro", cells: ["5"] }, { label: "Cole Palmer", cells: ["3"] }], facts: [], asOf: "2026-10-25", sourceUrls });
const extract = (sourceUrls: string[]): CompletionSender => async () => completion(finding(sourceUrls));

const plan: SportsPlan = toPlan({
  subject: { kind: "team", name: "Chelsea", league: "eng.1", season: "2026/27" },
  questions: [
    { text: "Where are Chelsea in the table?", source: "espn", competition: "league", feed: "standings", team: "Chelsea", opponent: null, date: null, season: null, searchQueries: [] },
    { text: "Chelsea's top scorers this season", source: "web", competition: "league", feed: "none", team: null, opponent: null, date: null, season: null, searchQueries: ["Chelsea top scorers 2026/27", "Premier League scorers Chelsea"] },
  ],
});
/** Opus's design: q1 trimmed to the focus row; q2 left to its raw answer (no design returned). */
const schema = (q1: unknown): CompletionSender => async () => completion({ answers: [{ id: "q1", title: "Chelsea in the table", fields: [
  { path: "position", kind: "number", format: "integer" }, { path: "points", kind: "number", format: "integer" }, { path: "gap", kind: "text", format: "none" },
], valuesJson: JSON.stringify(q1) }] });
/** The writer shows q1 only; the compiler must add a default part for q2. */
const PROGRAM = `standing = Card([Text(d.answers.q1.title, "headline"), Row("Position", null, null, Number(d.answers.q1.position, "integer", "body")), Row("Points", null, null, Number(d.answers.q1.points, "integer", "body"))])\n`;
const write: ProgramWriter = async (_messages, emit) => { emit(PROGRAM); return { text: PROGRAM, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } }; };

const dir = mkdtempSync(path.join(tmpdir(), "sports-check-"));
try {
  const store = new SnapshotStore(dir);
  const now = new Date("2026-10-25T12:00:00Z");
  const run = (q1: unknown, sourceUrls: string[], id: string) => askSports({ prompt: "How are Chelsea doing?" }, store, {}, id,
    { plan: async () => plan, espn, parallel, extract: extract(sourceUrls), schema: schema(q1), write, now });

  // Wiring: ESPN and web answered, the design admitted, the snapshot readable by the program, and q2 shown by the compiler's default.
  const result = await run({ position: 5, points: 13, gap: "2 points behind 4th" }, [PAGE], "check-1");
  assert.equal(result.snapshot.tool, "sports_dataset");
  assert.equal(result.snapshot.source, "mixed");
  assert.match(result.program, /^d = Query\("sports_dataset", \{run: "check-1"\}, \{\}\)$/m);
  const answers = (result.snapshot.result as { answers: Record<string, Record<string, unknown>> }).answers;
  assert.deepEqual([answers.q1!.position, answers.q1!.points, answers.q1!.source], [5, 13, "Source: ESPN · Premier League table"]);
  assert.equal(answers.q2!.source, "Source: bbc.com");
  assert.deepEqual(result.holes, { total: 2, filled: 1, fallback: 1, repairRounds: result.holes.repairRounds }, "the unshown question gets a default part");
  assert.ok(result.nodes > 0);
  const clubsOut = (result.snapshot.result as { clubs?: { name: string; color: string }[] }).clubs ?? [];
  assert.deepEqual(clubsOut.map(c => [c.name, c.color]), [["Chelsea", "#034694"]], "the plan's clubs come from ESPN with their colour");

  // An answer citing no page it read is unavailable, and its default part shows the note instead of a table.
  const uncited = await run({ position: 5, points: 13, gap: "" }, ["https://invented.example/page"], "check-2");
  const q2 = (uncited.snapshot.result as { answers: Record<string, Record<string, unknown>> }).answers.q2!;
  assert.deepEqual([q2.status, q2.note], ["unavailable", "No cited source answered this."]);
  assert.match(uncited.program, /Note\(d\.answers\.q2\.note/);

  // A design whose values break its own fields is rejected and the raw ESPN answer kept, still valid.
  const broken = await run({ position: "fifth", points: 13, gap: "" }, [PAGE], "check-3");
  const raw = (broken.snapshot.result as { answers: Record<string, Record<string, unknown>> }).answers.q1!;
  assert.ok(Array.isArray(raw.table) && raw.table.length === 2, "the raw table is kept");
  assert.equal(raw.position, undefined, "none of the rejected design's fields leak in");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// Routing rules the schema cannot express.
const question = (overrides: object) => ({ text: "Where are Chelsea?", source: "espn" as const, competition: "league" as const, feed: "standings" as const, team: null, opponent: null, date: null, season: null, searchQueries: [], ...overrides });
assert.throws(() => toPlan({ subject: { kind: "team", name: "Celtic", league: "other", season: "" }, questions: [question({})] }), /needs one of eng\.1/);
assert.throws(() => toPlan({ subject: { kind: "team", name: "Chelsea", league: "eng.1", season: "" }, questions: [question({ feed: "schedule" })] }), /schedule feed needs a team/);

// Clubs resolve to ESPN's names, and a question reads its club's league: Barcelona is LaLiga in a Premier League conversation.
const club = (id: string, name: string, short: string, abbreviation: string, color: string, league: "esp.1" | "eng.1") => ({ id, name, short, abbreviation, color, alternateColor: "", logo: `https://example.test/${id}.png`, league });
const clubs = [club("83", "Barcelona", "Barcelona", "BAR", "#a50044", "esp.1"), club("382", "Manchester City", "Man City", "MNC", "#99c5ea", "eng.1")];
const barca = toPlan({ subject: { kind: "team", name: "Manchester City", league: "eng.1", season: "" }, questions: [question({ team: "Barcelona" })] }, clubs);
assert.equal(barca.questions[0]!.source === "espn" && barca.questions[0]!.league, "esp.1");
// A cup question reads the cup, whatever the club's league; the FA Cup has no table.
const ucl = toPlan({ subject: { kind: "team", name: "Barcelona", league: "esp.1", season: "" }, questions: [question({ team: "Barcelona", competition: "uefa.champions", feed: "schedule" })] }, clubs);
assert.equal(ucl.questions[0]!.source === "espn" && ucl.questions[0]!.league, "uefa.champions");
assert.throws(() => toPlan({ subject: { kind: "team", name: "Chelsea", league: "eng.1", season: "" }, questions: [question({ competition: "eng.fa" })] }), /no FA Cup standings/);
assert.ok(!rawSchema(clubs).safeParse({ subject: { kind: "team", name: "Barça", league: "esp.1", season: "" }, questions: [question({ team: "Barça" })] }).success, "a club outside the directory is rejected");

// A result is scored from the team's side: an away 2–0 win is a win, a home 0–2 a loss; the fixture is upcoming.
const schedule = await espnLookup({ league: "eng.1", feed: "schedule", team: "Chelsea" }, espn);
assert.deepEqual((schedule.values.matches as { result: string }[]).map(m => m.result), ["win", "loss", "upcoming"], "oldest first, Chelsea's perspective, fixtures included");
assert.deepEqual([schedule.values.won, schedule.values.drawn, schedule.values.lost, schedule.values.season], [1, 0, 1, "2026/27"]);

// No meeting yet this season: last season's, labelled as such, with Chelsea's own stats on the team side.
const meeting = (await espnLookup({ league: "eng.1", feed: "match", team: "Chelsea", opponent: "Man City" }, espn)).values as Record<string, any>;
assert.deepEqual([meeting.played, meeting.season, meeting.currentSeason], [true, "2025/26", false]);
assert.deepEqual([meeting.teamStats.shots, meeting.teamStats.shotsOnTarget, meeting.opponentStats.shots], [12, 3, 18]);
assert.deepEqual(meeting.goals[0], { minute: "51'", team: "Manchester City", scorer: "Nico O'Reilly", assist: "Rayan Cherki", kind: "Goal" });
assert.deepEqual(meeting.upcoming.map((m: { date: string }) => m.date), ["2026-12-12T17:30Z"], "this season's fixture is still named");

// Sports components: a MatchCard shaped to its contract expands, its club colour reaches the mark, the loser's score is secondary,
// a StatBar keeps each side's colour, and an unshown answer that fits a component defaults to it.
const side = (name: string, color: string, score: string, ink: string) => ({ name, logo: "", color, score, ink });
const componentValues = { answers: {
  q1: { status: "complete", question: "Last meeting", title: "Chelsea v Man City", source: "Source: ESPN",
    match: { home: side("Chelsea", "#034694", "0", "secondary"), away: side("Manchester City", "#99c5ea", "3", "primary"), label: "Apr 12", value: "FT", details: "Premier League" } },
  q2: { status: "complete", question: "Shots", title: "Shots", source: "Source: ESPN",
    bars: [{ label: "Shots", homeDisplay: "12", awayDisplay: "18", sides: [{ label: "Chelsea", count: 12, tone: "neutral", color: "#034694" }, { label: "Manchester City", count: 18, tone: "good", color: "#99c5ea" }] }] },
} };
const callWriter: ProgramWriter = async (_m, emit) => { const text = "meeting = MatchCard(d.answers.q1.match)\n"; emit(text); return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } }; };
const composed = await compileScreen({ run: "components", request: "Chelsea v City", values: componentValues, required: [{ id: "q1", text: "Last meeting" }, { id: "q2", text: "Shots" }], base: [], editable: new Set(), explicitLayout: null }, SPORTS_SCREEN, callWriter);
assert.equal(composed.parts.filter(p => p.origin.kind === "writer").length, 1, "the writer's MatchCard call is admitted");
assert.equal(composed.stats.fallbacks, 1, "q2 gets a default part");
const nodes = programTree(composed.program, componentValues).nodes;
assert.ok(nodes.some(n => n.primitive === "Avatar" && n.props.color === "#034694"), "the club colour tints its mark");
assert.ok(nodes.some(n => n.primitive === "Text" && n.props.content === "0" && n.props.ink === "secondary"), "the losing score is secondary");
assert.ok(nodes.some(n => n.primitive === "SplitBar" && JSON.stringify(n.props.sides).includes("#99c5ea")), "q2's default is a StatBar with team colours");

// An empty list is valid data: the writer's Leaderboard over no entries is admitted. A StatsCard answer
// defaults to StatsCard, not to TeamDetail, whose contract it extends.
const emptyValues = { answers: {
  q1: { status: "complete", question: "Clean sheets", title: "Clean sheets", source: "Source: ESPN", board: { title: "Clean sheets", metric: "", entries: [] } },
  q2: { status: "complete", question: "Palmer", title: "Palmer", source: "Source: ESPN", player: { name: "Cole Palmer", detail: "Chelsea", logo: "", color: "#034694",
    rating: { value: "7.21", tone: "good", label: "Season rating", caption: "" }, stats: [{ label: "Goals", value: "5" }] } },
} };
const boardWriter: ProgramWriter = async (_m, emit) => { const text = "sheets = Leaderboard(d.answers.q1.board)\n"; emit(text); return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } }; };
const empty = await compileScreen({ run: "empty", request: "Clean sheets and Palmer", values: emptyValues, required: [{ id: "q1", text: "Clean sheets" }, { id: "q2", text: "Palmer" }], base: [], editable: new Set(), explicitLayout: null }, SPORTS_SCREEN, boardWriter);
assert.equal(empty.parts.filter(p => p.origin.kind === "writer").length, 1, "a Leaderboard over an empty list is admitted");
assert.ok(programTree(empty.program, emptyValues).nodes.some(n => n.primitive === "Badge" && n.props.label === "7.21"), "q2's default is a StatsCard, showing its rating");

// The writer's preview of a long list is still a list, so it offers no paths the data lacks.
assert.deepEqual(preview({ table: Array.from({ length: 20 }, (_, rank) => ({ rank })) }), { table: [{ rank: 0 }, { rank: 1 }, { rank: 2 }, "… 16 more items …", { rank: 19 }] });

console.log("sports: pipeline wiring, uncited answers, rejected designs, plan routing, schedule results, match fallback, components, empty lists, component defaults and list previews passed");
