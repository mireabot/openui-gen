import assert from "node:assert/strict";
import { SPORTS_TEMPLATES } from "../src/sports/components.js";
import { z } from "zod";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileScreen, type ProgramWriter } from "../src/lang/compiler.js";
import { programTree } from "../src/lang/tree.js";
import { SnapshotStore } from "../src/lang/snapshots.js";
import type { Completion, CompletionSender } from "../src/llm/structured-completion.js";
import type { ParallelTransport } from "../src/research/parallel-research.js";
import { sportsRoutes } from "../src/routes/sports.js";
import { askSports, editSports, type SportsDeps } from "../src/sports/ask.js";
import { DocumentStore, type SportsDocument } from "../src/sports/documents.js";
import { espnLookup, withMatchCards, type EspnTransport } from "../src/sports/espn.js";
import { followUpSchema, rawSchema, toFollowUp, toPlan, type SportsPlan } from "../src/sports/plan.js";
import { preview, SPORTS_SCREEN } from "../src/sports/screen.js";
import { fitHeatmaps, heatmapColumns, lockFacts, placements, sameTitle, settleInjuries, settleMissing, settleVenues, withStatBars } from "../src/sports/components.js";
import { designDataset } from "../src/sports/dataset.js";
import { careerOf, reportSource } from "../src/sports/espn-generic.js";
import { answerSports, findingAnswer } from "../src/sports/research.js";

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
const longText = "A complete streaming coverage description that must retain every word, including the channels, match availability and service limitations. ".repeat(4);
const fullTextAnswer = findingAnswer({
  title: longText, summary: longText, columns: [longText], rows: [{ label: longText, cells: [longText] }],
  facts: [{ label: longText, value: longText, detail: longText }], asOf: "2026-11-04", sourceUrls: [PAGE],
}, { id: "q1", text: "Where can I watch?", source: "web", searchQueries: ["streaming coverage"] }, {
  query: "streaming coverage", findings: longText, sources: [{ url: PAGE, title: "Coverage" }], searchedAt: "2026-11-04", model: "test", usage: { promptTokens: 0, completionTokens: 0, costUSD: 0 },
});
assert.ok(fullTextAnswer);
assert.equal(fullTextAnswer.title, longText);
assert.equal(fullTextAnswer.summary, longText);
assert.deepEqual(fullTextAnswer.columns, [longText]);
assert.deepEqual(fullTextAnswer.rows, [{ label: longText, cells: [longText], pairs: [{ label: longText, value: longText }] }]);
assert.deepEqual(fullTextAnswer.facts, [{ label: longText, value: longText, detail: longText }]);
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
    { plan: async () => plan, espn, parallel, extract: extract(sourceUrls), schema: schema(q1), write, now, player: async () => null });

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
// Chelsea lost 0-2 at home to Spurs and won 2-0 at Everton; the upcoming City match counts for neither.
assert.deepEqual(schedule.values.venues, {
  home: { played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 2, goalDifference: -2, points: 0 },
  away: { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, goalDifference: 2, points: 3 },
});

// Every ESPN match also carries MatchCard's contract, so the writer is offered MatchCard without the dataset stage reshaping it:
// scores as text with the number kept as goals, the loser in secondary ink, the date and kickoff in the request's time zone.
const carded = withMatchCards(schedule.values, "Premier League", "America/New_York") as { matches: Record<string, any>[] };
const [played, , upcoming] = carded.matches;
assert.deepEqual([played!.home.name, played!.home.score, played!.home.goals, played!.home.ink, played!.away.score, played!.away.ink, played!.label, played!.value],
  ["Everton", "0", 0, "secondary", "2", "primary", "Sat, Oct 17", "FT"], "Everton 0–2 Chelsea, as MatchCard reads it")
assert.ok(placements({ q: carded }).some(p => p.component.name === "MatchCard" && p.list), "a schedule's matches are offered as @Each MatchCard");
const researched = await answerSports(toPlan({ subject: { kind: "team", name: "Chelsea", league: "eng.1", season: "" }, questions: [{ text: "Chelsea's results", source: "espn", competition: "league", feed: "schedule", team: "Chelsea", opponent: null, date: null, season: null, searchQueries: [] }] }),
  "Chelsea's results", new Date("2026-10-25T12:00:00Z"), {}, { espn }, "America/New_York");
assert.equal((researched.answers.q1!.matches as Record<string, any>[])[0]!.label, "Sat, Oct 17", "research hands the dataset stage MatchCard-ready matches");
assert.equal(upcoming!.home.score, "", "a fixture has no score yet");
assert.match(String(upcoming!.value), /^\d{1,2}:\d{2} [AP]M$/, "a fixture's side line is its kickoff in the request's time zone");
assert.ok(String(played!.details).startsWith("Premier League"), "details lead with the competition");

// No meeting yet this season: last season's, labelled as such, with Chelsea's own stats on the team side.
const meeting = (await espnLookup({ league: "eng.1", feed: "match", team: "Chelsea", opponent: "Man City" }, espn)).values as Record<string, any>;
assert.deepEqual([meeting.played, meeting.season, meeting.currentSeason], [true, "2025/26", false]);
assert.deepEqual([meeting.teamStats.shots, meeting.teamStats.shotsOnTarget, meeting.opponentStats.shots], [12, 3, 18]);
assert.deepEqual(meeting.goals[0], { minute: "51'", team: "Manchester City", scorer: "Nico O'Reilly", assist: "Rayan Cherki", kind: "Goal" });
assert.deepEqual(meeting.upcoming.map((m: { date: string }) => m.date), ["2026-12-12T17:30Z"], "this season's fixture is still named");

{
  const comparisons = withStatBars(meeting);
  const answer = { status: "complete", question: "Match statistics", title: "Match statistics", source: "Source: ESPN", ...comparisons };
  const matchPlan: SportsPlan = { subject: { kind: "match", name: "Chelsea vs Manchester City", league: "eng.1", season: "2025/26" }, questions: [{ id: "q1", text: "Match statistics", source: "espn", league: "eng.1", feed: "match", team: "Chelsea", opponent: "Manchester City", date: null, season: 2025 }] };
  const dataset = await designDataset(matchPlan, { q1: z.record(z.string(), z.json()).parse(answer) }, "espn", new Date("2026-11-05"), {}, async () => completion({ answers: [{ id: "q1", title: "Match statistics", fields: [{ path: "context", kind: "text", format: "none" }], valuesJson: JSON.stringify({ context: "Last league meeting" }) }] }));
  const bars = (dataset.values.answers as { q1: { statBars?: unknown[] } }).q1.statBars;
  assert.deepEqual(bars, comparisons.statBars, "prepared match comparisons survive model shaping without losing any bars");
  const writer: ProgramWriter = async (_messages, emit) => { const text = 'stats = Stack("v", 16, @Each(d.answers.q1.statBars, "s", StatBar(s)))\n'; emit(text); return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } }; };
  const compiled = await compileScreen({ run: "match-bars", request: "Match statistics", values: dataset.values, required: [{ id: "q1", text: "Match statistics" }], base: [], editable: new Set(), explicitLayout: null }, SPORTS_SCREEN, writer);
  assert.equal(programTree(compiled.program, dataset.values, SPORTS_TEMPLATES).nodes.filter(n => n.primitive === "SplitBar").length, bars?.length, "every match statistic renders the same split-bar component");
}

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
const nodes = programTree(composed.program, componentValues, SPORTS_TEMPLATES).nodes;
assert.ok(nodes.some(n => n.primitive === "Avatar" && n.props.color === "#034694"), "the club colour tints its mark");
assert.ok(nodes.some(n => n.primitive === "Text" && n.props.content === "0" && n.props.ink === "secondary"), "the losing score is secondary");
assert.ok(nodes.some(n => n.primitive === "SplitBar" && JSON.stringify(n.props.sides).includes("#99c5ea")), "q2's default is a StatBar with team colours");

// An empty list is valid data: the writer's Leaderboard over no entries is admitted. A StatsCard answer
// defaults to StatsCard, not to TeamDetail, whose contract it extends.
const emptyValues = { answers: {
  q1: { status: "complete", question: "Clean sheets", title: "Clean sheets", source: "Source: ESPN", board: { heading: "Clean sheets", metric: "", entries: [] } },
  q2: { status: "complete", question: "Palmer", title: "Palmer", source: "Source: ESPN", player: { kind: "player", name: "Cole Palmer", detail: "Chelsea", logo: "", color: "#034694",
    rating: { value: "7.21", tone: "good", fill: "tone.good.fg", ink: "surface.screen", label: "Season rating", caption: "", show: true }, stats: [{ label: "Goals", value: "5" }], showStats: true } },
} };
// A source's gaps never reach the screen: a dash used to render as a "— Season rating" row and a "—" stat, once per card.
const missingCard = { name: "E Haaland", kind: "player", detail: "City", logo: "", color: "", rating: { value: "—", label: "Season rating" }, stats: [{ label: "Goals", value: "9" }, { label: "Assists", value: "—" }] };
const settled = settleMissing({ values: { answers: { q1: { player: missingCard, board: { heading: "t", metric: "Goals", entries: [{ name: "A", kind: "player", detail: "", value: "6", logo: "", color: "" }, { name: "B", kind: "player", detail: "", value: "N/A", logo: "", color: "" }] } } } }, fields: [] }).values.answers as unknown as { q1: { player: { rating: { show: boolean }; stats: unknown[]; showStats: boolean }; board: { entries: unknown[] } } };
assert.deepEqual([settled.q1.player.rating.show, settled.q1.player.stats, settled.q1.player.showStats, settled.q1.board.entries.length], [false, [{ label: "Goals", value: "9" }], true, 1], "a dash in a rating, a stat or a ranking row is left out");
assert.equal((settleMissing({ values: { answers: { q1: { player: { ...missingCard, stats: [{ label: "Assists", value: "" }] } } } }, fields: [] }).values.answers.q1.player as unknown as { showStats: boolean }).showStats, false, "a card with no stats has no rail");
// A player's second card shows only what's new, and goes when nothing is.
const playerCard = (stats: { label: string; value: string }[]) => ({ kind: "player", name: "E Haaland", detail: "City", logo: "", color: "", showStats: true, rating: { value: "7.5", tone: "good", fill: "x", ink: "y", label: "Season rating", caption: "", show: true }, stats });
const locked = lockFacts({ values: { answers: { q1: { player: playerCard([{ label: "Goals", value: "9" }]) }, q2: { player: playerCard([{ label: "Goals", value: "9" }, { label: "Shots", value: "30" }]) }, q3: { player: playerCard([{ label: "Goals", value: "9" }]) } } }, fields: [] }).dataset.values.answers as Record<string, { player?: { rating: { show: boolean }; stats: unknown[] } }>;
assert.deepEqual([locked.q1!.player!.rating.show, locked.q2!.player!.rating.show, locked.q2!.player!.stats, locked.q3!.player], [true, false, [{ label: "Shots", value: "30" }], undefined], "the first card owns a player's rating and stats");
const boardWriter: ProgramWriter = async (_m, emit) => { const text = "sheets = Leaderboard(d.answers.q1.board)\n"; emit(text); return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } }; };
const empty = await compileScreen({ run: "empty", request: "Clean sheets and Palmer", values: emptyValues, required: [{ id: "q1", text: "Clean sheets" }, { id: "q2", text: "Palmer" }], base: [], editable: new Set(), explicitLayout: null }, SPORTS_SCREEN, boardWriter);
assert.equal(empty.parts.filter(p => p.origin.kind === "writer").length, 1, "a Leaderboard over an empty list is admitted");
assert.ok(programTree(empty.program, emptyValues, SPORTS_TEMPLATES).nodes.some(n => n.primitive === "Badge" && n.props.label === "7.21"), "q2's default is a StatsCard, showing its rating");

// The writer's preview of a long list is still a list, so it offers no paths the data lacks.
assert.deepEqual(preview({ table: Array.from({ length: 20 }, (_, rank) => ({ rank })) }), { table: [{ rank: 0 }, { rank: 1 }, { rank: 2 }, "… 16 more items …", { rank: 19 }] });


// Follow-ups through the routes: "Chelsea vs Man City last meeting stats", then add the table, revise the meeting, drop the scorers.
// Kept parts stay byte for byte, kept answers are not researched again, and a stale or failed turn commits nothing.
{
  const dir = mkdtempSync(path.join(tmpdir(), "sports-follow-ups-"));
  try {
    const store = new SnapshotStore(path.join(dir, "snapshots"));
    const documents = new DocumentStore(path.join(dir, "documents"));
    const scripts: string[] = [];
    const writer: ProgramWriter = async (_m, emit) => { const text = scripts.shift() ?? ""; emit(text); return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } }; };
    const researched: string[] = [];
    const extractLogged: CompletionSender = async request => { researched.push(/Sub-question: (.*)/.exec(request.messages[0]!.content)?.[1] ?? ""); return completion(finding([PAGE])); };
    const meeting = { text: "Chelsea v Manchester City, last meeting stats", source: "espn" as const, competition: "league" as const, feed: "match" as const, team: "Chelsea", opponent: "Manchester City", date: null, season: null, searchQueries: [] };
    const scorers = { text: "Chelsea's top scorers this season", source: "web" as const, competition: "league" as const, feed: "none" as const, team: null, opponent: null, date: null, season: null, searchQueries: ["Chelsea top scorers 2026/27", "Chelsea goals this season"] };
    const subject = { kind: "match" as const, name: "Chelsea vs Manchester City", league: "eng.1" as const, season: "2026/27" };
    const followUps: Record<string, Omit<Parameters<typeof toFollowUp>[0], "subject">> = {
      "add the Premier League table and Spurs' results": { keep: ["q1", "q2"], revise: [], remove: [], add: [{ ...meeting, text: "The Premier League table", feed: "standings", opponent: null }, { ...meeting, text: "Tottenham's results this season", feed: "schedule", team: "Tottenham Hotspur", opponent: null }] },
      "make it the last three meetings": { keep: ["q2", "q3", "q4"], remove: [], add: [], revise: [{ id: "q1", text: "Chelsea v Manchester City, last three meetings", source: "web", competition: "league", feed: "none", team: null, opponent: null, date: null, season: null, searchQueries: ["Chelsea Manchester City last three meetings", "Chelsea v Man City head to head"] }] },
      "drop the scorers": { keep: ["q1", "q3", "q4"], revise: [], remove: ["q2"], add: [] },
    };
    const deps: SportsDeps = {
      player: async () => null,
      plan: async () => toPlan({ subject: { ...subject }, questions: [meeting, scorers] }), espn, parallel, extract: extractLogged, schema: async () => completion({ answers: [] }), write: writer, now: new Date("2026-10-25T12:00:00Z"),
      planFollowUp: async context => {
        const raw = followUps[context.prompt];
        if (!raw) throw new Error("the planner is unavailable");
        return toFollowUp({ subject: { ...subject }, ...raw }, context.questions);
      },
    };
    const savedDirectory = mkdtempSync(path.join(tmpdir(), "saved-generations-"));
    const app = sportsRoutes({ store, documents, savedDirectory, ask: (request, s, hooks, run) => askSports(request, s, hooks, run, deps), edit: (saved, request, s, hooks, run) => editSports(saved, request, s, hooks, run, deps) });
    const post = async (url: string, body: object) => {
      const response = await app.request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const events = response.headers.get("content-type")?.includes("text/event-stream")
        ? (await response.text()).split("\n\n").filter(Boolean).map(frame => ({ event: /^event: (.*)$/m.exec(frame)?.[1], data: JSON.parse(/^data: (.*)$/m.exec(frame)?.[1] ?? "null") as Record<string, any> }))
        : [];
      return { status: response.status, events, done: events.find(e => e.event === "done")?.data };
    };
    const lines = (doc: SportsDocument) => Object.fromEntries(doc.parts.map(p => [p.id, p.statements]));
    const answersOf = (doc: SportsDocument) => (doc.snapshot.result as { answers: Record<string, unknown> }).answers;

    scripts.push(`meeting = Card([Text(d.answers.q1.title, "headline"), Row("Shots", null, null, Number(d.answers.q1.statBars[1].sides[0].count, "integer", "body"))])\nscorers = Card([Text(d.answers.q2.summary, "body")])\n`);
    const first = await post("/lang/sports/stream", { prompt: "Chelsea vs Man City last meeting stats" });
    const id = first.done!.document.id as string;
    assert.deepEqual(first.done!.document, { id, revision: 1 }, "the first screen is saved as revision 1 before done");
    assert.equal((await post(`/lang/sports/${id}/save`, { revision: 2 })).status, 409, "only the revision on screen can be saved");
    assert.equal((await post(`/lang/sports/${id}/save`, { revision: 1 })).status, 200);
    const kept = JSON.parse(readFileSync(path.join(savedDirectory, `${id}-r1.json`), "utf8")) as SportsDocument;
    assert.deepEqual([kept.program, kept.revision], [first.done!.program, 1], "the saved copy is the screen's program");
    assert.equal((await post(`/lang/sports/00000000-0000-4000-8000-000000000000/save`, { revision: 1 })).status, 404);
    // Replay gives back the same screen with no model call: nothing below reaches a script.
    const scriptsBefore = scripts.length;
    const runs = await (await app.request("/lang/sports/runs")).json() as { runs: { id: string; prompt: string }[] };
    assert.deepEqual(runs.runs.map(r => [r.id, r.prompt]), [[id, "Chelsea vs Man City last meeting stats"]]);
    const replay = await (await app.request(`/lang/sports/runs/${id}`)).json() as { prompt: string; program: string; snapshot: { args: { run: string } } };
    assert.deepEqual([replay.program, replay.snapshot.args.run], [first.done!.program, id], "the same program and its dataset");
    assert.equal((await app.request("/lang/sports/runs/00000000-0000-4000-8000-000000000000")).status, 404);
    assert.equal(scripts.length, scriptsBefore);
    const r1 = (await documents.get(id))!;
    assert.deepEqual(r1.parts.map(p => [p.id, p.questions]), [["pick1", ["q1"]], ["pick2", ["q2"]]]);

    // Adding questions: the writer may only add parts (its attempt to rewrite pick1 is refused); q4, which it skips, gets a default part.
    scripts.push(`pick1 = Card([Text(d.answers.q1.title, "body")])\ntable = Card([Text(d.answers.q3.title, "headline"), Stack("v", 8, @Each(d.answers.q3.table, "r", Row(r.team.name, null, null, Number(r.points, "integer", "body"))))])\n`);
    researched.length = 0;
    const added = await post(`/lang/sports/${id}/follow-up`, { prompt: "add the Premier League table and Spurs' results", baseRevision: 1, model: "ignored", timeZone: "Europe/London" });
    assert.deepEqual(added.done!.document, { id, revision: 2 });
    assert.deepEqual(added.events.map(e => e.event).filter(event => event !== "usage").filter(e => e !== "activity"), ["templates", "data", "openui", "done"], "content arrives only after the commit");
    assert.equal(added.events.find(e => e.event === "openui")!.data.replace, true);
    const r2 = (await documents.get(id))!;
    assert.deepEqual(r2.parts.map(p => [p.id, p.questions]), [["pick1", ["q1"]], ["pick2", ["q2"]], ["pick3", ["q3"]], ["pick4", ["q4"]]]);
    assert.deepEqual([lines(r2).pick1, lines(r2).pick2], [lines(r1).pick1, lines(r1).pick2], "kept parts survive byte for byte");
    for (const statement of [...Object.values(lines(r1).pick1!), ...Object.values(lines(r1).pick2!)]) assert.ok(r2.program.includes(`${statement}\n`), "kept statements are in the new program as they were");
    assert.deepEqual([answersOf(r2).q1, answersOf(r2).q2], [answersOf(r1).q1, answersOf(r1).q2], "kept answers carried over");
    assert.deepEqual(researched, [], "kept answers are not researched again");
    const clubNames = (doc: SportsDocument) => ((doc.snapshot.result as { clubs: { name: string }[] }).clubs).map(c => c.name);
    assert.deepEqual([clubNames(r1), clubNames(r2)], [["Chelsea", "Manchester City"], ["Chelsea", "Manchester City", "Tottenham Hotspur"]], "saved clubs keep their index, so kept parts reading d.clubs[i] read the same club");

    assert.equal((await post(`/lang/sports/${id}/follow-up`, { prompt: "drop the scorers", baseRevision: 1 })).status, 409, "a stale revision is refused");
    assert.equal((await post("/lang/sports/no-such-document/follow-up", { prompt: "add the table", baseRevision: 1 })).status, 404);

    // A failed turn: failure on the stream, and the document is exactly as it was (no revision, no turns).
    const failed = await post(`/lang/sports/${id}/follow-up`, { prompt: "show the referees", baseRevision: 2 });
    assert.deepEqual([failed.events.at(-1)!.event, failed.done], ["failure", undefined]);
    assert.deepEqual(await documents.get(id), r2, "a failed follow-up commits nothing");

    // Revising q1: only its part is rewritten (under its id, in its place); the writer may not touch pick2.
    scripts.push(`pick1 = Card([Text(d.answers.q1.title, "headline"), Text(d.answers.q1.summary, "body")])\npick2 = Card([Text(d.answers.q2.title, "body")])\n`);
    const revised = await post(`/lang/sports/${id}/follow-up`, { prompt: "make it the last three meetings", baseRevision: 2 });
    assert.deepEqual(revised.done!.document, { id, revision: 3 });
    const r3 = (await documents.get(id))!;
    assert.deepEqual(r3.parts.map(p => p.id), ["pick1", "pick2", "pick3", "pick4"]);
    assert.match(lines(r3).pick1!.pick1!, /d\.answers\.q1\.summary/);
    assert.deepEqual([lines(r3).pick2, lines(r3).pick3], [lines(r2).pick2, lines(r2).pick3]);
    assert.ok(revised.done!.issues.some((i: { code: string; statementId?: string }) => i.code === "locked-part" && i.statementId === "pick2"));
    assert.deepEqual(researched, ["Chelsea v Manchester City, last three meetings"], "only the revised question is researched");

    // Removing q2 drops its part; the others stay byte for byte and no writer runs.
    const removed = await post(`/lang/sports/${id}/follow-up`, { prompt: "drop the scorers", baseRevision: 3 });
    assert.deepEqual(removed.done!.document, { id, revision: 4 });
    const r4 = (await documents.get(id))!;
    assert.deepEqual([r4.parts.map(p => p.id), removed.done!.issues], [["pick1", "pick3", "pick4"], []], "a removal is not a stale part");
    assert.deepEqual([lines(r4).pick1, lines(r4).pick3], [lines(r3).pick1, lines(r3).pick3]);
    assert.doesNotMatch(r4.program, /pick2|answers\.q2/);
    assert.deepEqual(Object.keys(answersOf(r4)), ["q1", "q3", "q4"]);
    assert.deepEqual(r4.turns.filter(t => t.role === "user").map(t => t.content), ["Chelsea vs Man City last meeting stats", "add the Premier League table and Spurs' results", "make it the last three meetings", "drop the scorers"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The follow-up planner accounts for every saved question exactly once.
assert.throws(() => toFollowUp({ subject: { kind: "team", name: "Chelsea", league: "eng.1", season: "" }, keep: ["q1"], revise: [], remove: ["q1"], add: [] }, plan.questions), /exactly once/);
assert.ok(followUpSchema([], ["q1", "q2"]).safeParse({ subject: { kind: "team", name: "Chelsea", league: "eng.1", season: "" }, keep: ["q7"], revise: [], remove: [], add: [] }).success === false, "only saved ids");

// Run 13439935: a bad gap in a row, then a misplaced argument, dropped the part with the answer. The club
// row left standing names the subject and answers nothing, so the default part must show the projections.
{
  const answer = { status: "complete", question: "Projected finish?", title: "Chelsea's projected finish", summary: "Projections vary by source.", source: "Source: x", asOf: "2026-10-25",
    team: { name: "Chelsea", logo: "", color: "#034694", detail: "Premier League" }, projectionRange: "3rd to 6th",
    projections: [{ source: "Opta", position: "3rd", detail: "September", date: "2026-09-01" }, { source: "Sky Sports", position: "5th", detail: "October", date: "2026-10-01" }] };
  const prompts: string[] = [];
  const issues: { code: string; statementId?: string; message: string }[] = [];
  const written = [
    `club = Card([club_team])\nclub_team = TeamDetail(d.answers.q1.team)\nprojection = Card([projection_rows, projection_range])\nprojection_range = Text(d.answers.q1.projectionRange, "title1")\nprojection_rows = Stack("v", 0, @Each(d.answers.q1.projections, "p", Row(p.source, p.detail, null, Stack("v", 2, [Text(p.position, "headline")]))))\n`,
    `projection_rows = Stack("v", 0, @Each(d.answers.q1.projections, "p", Row(p.source, p.detail, null, Text(p.position, "headline"))), "stretch", "start", true)\n`,
  ];
  const screen = await compileScreen({ run: "r", request: "projection", values: { answers: { q1: answer } }, required: [{ id: "q1", text: "Projected finish?" }], base: [], editable: new Set(), explicitLayout: null }, SPORTS_SCREEN, async (messages, emit) => {
    prompts.push(String(messages.at(-1)!.content));
    const text = written[prompts.length - 1] ?? "";
    emit(text);
    return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } };
  }, { issue: issue => issues.push(issue) });
  assert.equal(issues.filter(i => i.message.startsWith("Stack.gap")).length, 1, "one bad value across rows is one problem");
  assert.ok(prompts[1]!.includes(`Stack("v", 2,`) && prompts[1]!.includes("got 2") && prompts[1]!.includes("Stack(axis, gap, children, align?"), "repair shows the statement, the value and the signature");
  assert.ok(issues.some(i => i.code === "part-incomplete"), "the part is reported as dropped");
  assert.deepEqual(screen.parts.map(p => p.origin.kind), ["writer", "fallback"]);
  assert.match(screen.program, /d\.answers\.q1\.projectionRange/);
  assert.match(screen.program, /d\.answers\.q1\.projections/);
  assert.match(screen.program, /item\.position/, "and each row keeps the position, which is the answer");
}

// One place answers home and away: TeamPoints when it is on the screen, else LeagueStanding if it has them.
{
  const venue = { played: "19", won: "7", drawn: "5", lost: "7", goals: "26-25", goalDifference: "+1", goalDifferenceTone: "neutral", points: "26" };
  const record = { heading: "Home and away", subtitle: "Rank 10 · 38 played", points: "52", home: venue, away: venue };
  const standing = (detail: string) => ({ place: "10th", gaps: "52 points", rows: [], home: { detail }, away: { detail }, showVenues: true });
  const shown = (answers: Record<string, unknown>) => (settleVenues({ values: { answers }, fields: [] }).values.answers as { q1: { standing: { showVenues: boolean } } }).q1.standing.showVenues;
  assert.equal(shown({ q1: { standing: standing("26 pts · 7-5-7") }, q2: { record } }), false, "TeamPoints elsewhere on the screen answers them");
  assert.equal(shown({ q1: { standing: standing("26 pts · 7-5-7") } }), true, "alone, the standing shows them");
  assert.equal(shown({ q1: { standing: standing("") } }), false, "with no figures there is nothing to show");
}

// The heatmap's grid follows its count: 20 sit 10 to a row, a season's 38 keep two rows with smaller squares.
assert.deepEqual([5, 20, 21, 38, 46, 60].map(heatmapColumns), ["10", "10", "11", "19", "23", "24"]);
{
  const fitted = fitHeatmaps({ values: { answers: { q1: { run: { value: "1.37", caption: "PPG", tally: "x", columns: "10", results: Array.from({ length: 38 }, () => ({ label: "Win", fill: "tone.good.fg" })) } } } }, fields: [] });
  assert.equal((fitted.values.answers as { q1: { run: { columns: string } } }).q1.run.columns, "19", "the server sets it, whatever the model wrote");
}

// A home and away table built by hand where TeamPoints fits is refused, and the repair is told what to call.
{
  const side = { played: "19", won: "7", drawn: "5", lost: "7", goals: "26-25", goalDifference: "+1", goalDifferenceTone: "neutral", points: "26" };
  const answer = { status: "complete", question: "Season", title: "Season", source: "Source: ESPN", record: { heading: "Home and away comparison", subtitle: "Rank 10 · 38 played", points: "52", home: side, away: side } };
  const prompts: string[] = [];
  const replies = [`season = Card([Text(d.answers.q1.record.home.points, "body"), Text(d.answers.q1.record.away.points, "body")])\n`, `season = TeamPoints(d.answers.q1.record)\n`];
  const screen = await compileScreen({ run: "r", request: "season", values: { answers: { q1: answer } }, required: [{ id: "q1", text: "Season" }], base: [], editable: new Set(), explicitLayout: null }, SPORTS_SCREEN, async (messages, emit) => {
    prompts.push(String(messages.at(-1)!.content));
    const text = replies[prompts.length - 1] ?? "";
    emit(text);
    return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } };
  });
  assert.ok(prompts[1]!.includes("Call TeamPoints(d.answers.q1.record)"), "the repair names the card");
  assert.deepEqual(screen.parts.map(p => p.origin.kind), ["writer"]);
  const rendered = programTree(screen.program, { answers: { q1: answer } }, SPORTS_TEMPLATES).nodes;
  assert.ok(rendered.some(n => n.primitive === "Text" && n.props.content === "Home and away comparison"), "the card uses its supplied title");
  assert.ok(!rendered.some(n => n.primitive === "Text" && n.props.content === "PL"), "played is not abbreviated as Premier League");
  assert.ok(rendered.some(n => n.primitive === "Spacer" && n.props.size === 0), "the empty venue header keeps its grid cell instead of shifting the statistics left");
  const cells = new Map(rendered.map(node => [node.id, node]));
  const tables = rendered.filter(node => node.primitive === "Grid" && node.props.columns === "8");
  assert.equal(tables.length, 3, "the record has a header and two venue rows");
  for (const table of tables) {
    const row = (table.children.children ?? []).map(id => cells.get(id));
    assert.equal(row.length, 8);
    if (row[0]?.primitive === "Text") assert.equal(row[0].props.align, "start", "venue labels lead their column");
    for (const numeric of row.slice(1)) assert.equal(numeric?.props.align, "end", "every numeric header and value trails its column");
  }
}

// Run 341a9f75: the season's points showed in TeamPoints and again in two half-season heatmaps. Each fact is locked to one place.
{
  const side = { played: "19", won: "7", drawn: "5", lost: "7", goals: "26-25", goalDifference: "+1", goalDifferenceTone: "neutral", points: "26" };
  const points = { heading: "Home and away", subtitle: "Rank 10 · 38 played", points: "52", home: side, away: side };
  const heat = (count: number, value: string) => ({ value, caption: "Points", tally: "s", columns: "10", results: Array.from({ length: count }, () => ({ label: "Win", fill: "tone.good.fg" })) });
  const standing = { place: "10th", gaps: "52 points", rows: [], home: { detail: "" }, away: { detail: "" }, showVenues: false };
  const match = { name: "x", value: "1" };
  const season = lockFacts({ values: { answers: { q1: { status: "complete", title: "Table", standing }, q2: { status: "complete", title: "Season", points, firstHalf: heat(19, "30 pts"), secondHalf: heat(19, "22 pts") } } }, fields: [{ path: "answers.q2.firstHalf.value", kind: "text", format: "none" }, { path: "answers.q2.points.points", kind: "text", format: "none" }] });
  const q2 = (season.dataset.values.answers as Record<string, Record<string, { subtitle?: string }>>).q2!;
  assert.deepEqual(Object.keys(q2), ["status", "title", "points"], "heatmaps of the whole season go");
  assert.equal(q2.points!.subtitle, "38 played", "the standing owns the place");
  assert.deepEqual(season.dataset.fields.map(f => f.path), ["answers.q2.points.points"]);
  assert.equal(season.removed.length, 3);
  const form = lockFacts({ values: { answers: { q1: { points, form: heat(5, "2.4") } } }, fields: [] });
  assert.deepEqual(form.removed, [], "the last five is another fact and stays");
  const twice = lockFacts({ values: { answers: { q1: { status: "complete", win: match }, q2: { status: "complete", title: "Best", best: { value: "1", name: "x" } } } }, fields: [] });
  assert.deepEqual(twice.removed.map(r => r.path), ["answers.q2.best"], "the same record stays in the first place, whatever its key order");
  // A question whose facts all moved elsewhere needs nothing from the writer and no default part.
  assert.equal(SPORTS_SCREEN.shows("q2", [], twice.dataset.values as Parameters<typeof SPORTS_SCREEN.shows>[2]), true);
  // `team` labels an answer as a club's name; a TeamDetail record under `team` is the answer.
  const club = { answers: { q1: { status: "complete", title: "Playing today", team: { name: "Brooklyn Nets", logo: "", color: "", detail: "NBA" } } } };
  assert.equal(SPORTS_SCREEN.shows("q1", [["team", "name"]], club), true, "reading a record under team shows the answer");
  assert.equal(SPORTS_SCREEN.shows("q1", [["title"]], club), false);
  assert.equal(SPORTS_SCREEN.shows("q1", [["team"]], { answers: { q1: { status: "complete", team: "Chelsea", summary: "Top of the table." } } }), false, "a club's name still only labels");
}

// Injuries: the server turns the league's wording and a date into the badge and the wait.
{
  const day = new Date("2026-11-05T23:30:00Z");
  const raw = (status: string, returnDate: string, returnNote = "", source = "") => ({ name: "P", kind: "player", position: "RB", team: "Cardinals", logo: "", color: "", injuryStatus: status, returnDate, returnNote, reportedBy: source });
  const settled = settleInjuries({ values: { answers: { q1: { list: { heading: "", players: [raw("Injured Reserve", "2026-12-06", "", "ESPN"), raw("Day-To-Day", "2026-11-06"), raw("", "", "Out for season"), raw("Questionable", "2026-11-01")] } } } }, fields: [] }, day);
  const list = (settled.values.answers as unknown as { q1: { list: { showHeading: boolean; players: Record<string, unknown>[] } } }).q1.list;
  const [ir, dtd, season, stale] = list.players as { badge: { label: string; tone: string; show: boolean }; wait: { label: string; value: string; day: string; dated: boolean }; line: string; sourceLine: string; detail: string }[];
  assert.equal(list.showHeading, false, "an empty heading is not shown");
  // A list title that repeats its answer's title is hidden; one that adds something stays.
  const titled = (title: string) => (settleInjuries({ values: { answers: { q1: { title: "Chiefs injury report", list: { heading: title, players: [] } } } }, fields: [] }, day).values.answers as unknown as { q1: { list: { showHeading: boolean } } }).q1.list.showHeading;
  assert.deepEqual([titled("Chiefs injuries"), titled("Chiefs Injury Report"), titled("Out for Sunday")], [false, false, true], "each text on a screen says something new");
  assert.deepEqual([sameTitle("NBA injuries", "NBA injury list"), sameTitle("Chiefs injuries", "Bills injuries"), sameTitle("", "")], [true, false, false]);
  assert.deepEqual([ir!.badge, ir!.wait.value, ir!.wait.day, ir!.line, ir!.sourceLine, ir!.detail], [{ label: "IR", tone: "bad", show: true }, "31 days", "Sun, Dec 6", "Back Dec 6", "· ESPN", "RB · Cardinals"]);
  assert.deepEqual([dtd!.badge.label, dtd!.wait.label, dtd!.wait.value], ["Day-to-day", "Back", "Tomorrow"], "the wait counts whole days, whatever the hour");
  assert.deepEqual([season!.badge.show, season!.wait.dated, season!.wait.value, season!.line], [false, false, "Out for season", "Out for season"], "no status, no badge; the note stands in for a date");
  assert.deepEqual([stale!.wait.dated, stale!.line], [false, "No return date"], "a date already past is no date");
  assert.ok((settled.fields as readonly { path: string }[]).some(field => field.path === "answers.q1.list.players[].wait.value"));
  assert.equal(reportSource("Conner (foot) won't return from IR this week, Darren Urban of the team's official site reports.", "Arizona Cardinals"), "Cardinals' official site");
  assert.equal(reportSource("Knight (concussion) did not practice Wednesday, Theo Mackie of The Arizona Republic reports."), "The Arizona Republic");
  // A trade splits a season into two rows plus a Totals row; consecutive seasons with one team are one spell.
  const row = (season: string, teamSlug: string) => ({ season: { displayName: season }, teamSlug });
  const career = careerOf({ teams: { hou: { slug: "hou", displayName: "Houston Rockets", location: "Houston", color: "CE1141", logos: [{ href: "h.png" }] }, bkn: { slug: "bkn", displayName: "Brooklyn Nets", location: "Brooklyn", color: "000000" } },
    categories: [{ statistics: [row("2019-20", "hou"), row("2020-21", "hou"), row("2020-21", "bkn"), row("2020-21", "2020-21 Totals"), row("2021-22", "bkn")] }] });
  assert.deepEqual(career.clubs.map(club => [club.name, club.year, club.dates, club.color, club.logo]), [["Houston Rockets", "2019", "2019-20 – 2020-21", "#ce1141", "h.png"], ["Brooklyn Nets", "2020", "2020-21 – 2021-22", "#000000", ""]]);
  assert.equal(career.initial, 1, "the timeline opens on the current team");
  assert.equal(reportSource("The Ravens placed Loop (groin) on injured reserve Tuesday."), "", "a note that names no one has no source");
}

console.log("sports: pipeline wiring, uncited answers, rejected designs, plan routing, schedule results, match fallback, components, empty lists, component defaults, list previews, injuries, careers and follow-ups passed");
