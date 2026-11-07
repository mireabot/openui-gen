import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { compileScreen, type ProgramIssue, type ScreenSource } from "../src/lang/compiler.js";
import { config } from "../src/config.js";
import { modelWriter } from "../src/llm/generation.js";
import { SPORTS_COMPONENTS, placements } from "../src/sports/components.js";
import { SPORTS_SCREEN } from "../src/sports/screen.js";
import { populatePlayerImages } from "../src/sports/player-images.js";
import { fixtureSuite } from "./openui-fixtures.js";

const fixtures = fixtureSuite().fixtures;
const recordSchema = z.object({ answers: z.object({ q1: z.object({ record: z.record(z.string(), z.unknown()) }) }) });
function sample(name: string): Record<string, unknown> {
  const fixture = fixtures.find(item => item.key === `${name}/full`);
  assert.ok(fixture, `Missing full fixture for ${name}`);
  return recordSchema.parse(fixture.dataset.result).answers.q1.record;
}

interface Probe {
  readonly id: string;
  readonly request: string;
  readonly records: Readonly<Record<string, unknown>>;
  readonly expected: readonly string[];
  readonly forbidden?: readonly string[];
  readonly requiredReads?: readonly string[];
  readonly forbiddenReads?: readonly string[];
}

const requests: Readonly<Record<string, string>> = {
  ClubTimeline: "Trace this player's club career and loans in chronological order.",
  MatchCard: "Show the result and score of this Chelsea versus Manchester City game.",
  TeamDetail: "Identify the club named in this record, with its crest and league.",
  StatBar: "Compare Chelsea and Manchester City's possession in this match.",
  Leaderboard: "Who are the top three Premier League goalscorers? Show their ranked order.",
  FixturesHeatmap: "Show this team's recent form as results across its fixtures.",
  StatsCard: "Show Cole Palmer's key season statistics and rating.",
  TeamPoints: "Show this club's season points and home versus away record.",
  LeagueStanding: "Where is this club in the league table, relative to its nearest neighbours?",
  MatchTopPlayers: "Show the best players from both sides of this one match.",
  PlayerValue: "Show this player's market value and how it changed across clubs.",
  MetricBars: "Compare Egor Demin's points per game this season versus last season, including games played.",
  PlayerMetrics: "Show Cole Palmer's goals, assists and chances created by matchweek through this season.",
  PlayersMetric: "Compare these quarterbacks' interceptions through each week of the season.",
  SeasonPodium: "Show the champion, runner-up and third-place club of this completed season.",
  RecordTable: "Show the supplied passing box score for each quarterback, with all four statistical columns.",
  InjuryReport: "What is this player's injury status and expected return?",
  InjuryList: "Show all players on this supplied injury report and their return status.",
};

const distractors: Readonly<Record<string, string>> = {
  ClubTimeline: "PlayerValue", MatchCard: "StatsCard", StatBar: "MetricBars",
  StatsCard: "MatchCard", PlayerValue: "ClubTimeline", PlayerMetrics: "StatsCard", PlayersMetric: "MetricBars",
};

const player = {
  ...sample("StatsCard"), name: "Egor Demin", detail: "Brooklyn Nets · G",
  rating: { value: "", tone: "neutral", fill: "none", ink: "ink.secondary", label: "", caption: "", show: false },
  stats: [{ label: "Minutes", value: "10" }, { label: "Points", value: "2" }, { label: "Rebounds", value: "1" }, { label: "Assists", value: "2" }, { label: "Steals", value: "1" }, { label: "FG", value: "1-3" }],
};
const probes: readonly Probe[] = [
  ...SPORTS_COMPONENTS.map(component => {
    const request = requests[component.name];
    assert.ok(request, `Missing relevance probe for ${component.name}`);
    const distractor = distractors[component.name];
    return { id: component.name, request, records: { record: sample(component.name), ...(distractor ? { context: sample(distractor) } : {}) },
      expected: [component.name], forbidden: distractor ? [distractor] : [], forbiddenReads: distractor ? ["context"] : [] };
  }),
  {
    id: "player-performance", request: "Show only Egor Demin's individual key statistics from his latest game.",
    records: { game: sample("MatchCard"), player }, expected: ["StatsCard"], forbidden: ["MatchCard", "RecordTable"],
    requiredReads: ["player.stats"], forbiddenReads: ["game"],
  },
  {
    id: "current-team", request: "Where does Egor Demin play now? Name his current team only.",
    records: { profile: { name: "Egor Demin", team: "Brooklyn Nets", position: "G" }, career: sample("ClubTimeline"), upcoming: [sample("MatchCard")] },
    expected: [], forbidden: ["ClubTimeline", "MatchCard"], requiredReads: ["profile.team"], forbiddenReads: ["career", "upcoming"],
  },
  {
    id: "season-comparison", request: requests.MetricBars!,
    records: { comparison: sample("MetricBars"), player }, expected: ["MetricBars"], forbidden: ["StatsCard", "PlayerMetrics", "PlayersMetric"],
    requiredReads: ["comparison.columns"], forbiddenReads: ["player"],
  },
  {
    id: "player-periods", request: requests.PlayerMetrics!,
    records: { progression: sample("PlayerMetrics"), totals: sample("StatsCard") }, expected: ["PlayerMetrics"], forbidden: ["StatsCard", "MetricBars"],
    requiredReads: ["progression.metrics"], forbiddenReads: ["totals"],
  },
  {
    id: "ranked-list", request: requests.Leaderboard!,
    records: { ranking: sample("Leaderboard"), comparison: sample("MetricBars") }, expected: ["Leaderboard"], forbidden: ["MetricBars"],
    requiredReads: ["ranking.entries"], forbiddenReads: ["comparison"],
  },
  {
    id: "custom-honours", request: "List the supplied honours with their years. Keep it compact.",
    records: { honours: [{ name: "Player of the tournament", year: "2024" }, { name: "Team of the season", year: "2025" }] },
    expected: [], forbidden: SPORTS_COMPONENTS.map(component => component.name), requiredReads: ["honours"],
  },
];

function sourceOf(probe: Probe): ScreenSource {
  return { run: `relevance-${probe.id}`, request: probe.request,
    values: { answers: { q1: { status: "complete", question: probe.request, title: "", ...probe.records } } },
    required: [{ id: "q1", text: probe.request }], base: [], editable: new Set(), explicitLayout: null };
}

const problems = SPORTS_COMPONENTS.flatMap(component => {
  const fields = component.contract.map(field => field.path);
  return fields.filter((field, index) => fields.indexOf(field) !== index).map(field => `${component.name}: duplicate contract field ${field}`);
});
for (const probe of probes) {
  const candidates = placements(probe.records).map(placement => placement.component.name);
  for (const expected of probe.expected) assert.ok(candidates.includes(expected), `${probe.id}: expected component has no fitting record`);
}
for (const component of SPORTS_COMPONENTS) {
  const record = sample(component.name);
  const enriched = populatePlayerImages({ values: { answers: { q1: { record } } }, fields: [], asOf: "2026-11-06T00:00:00Z", source: "espn" }, [], [{ name: "Cole Palmer" }]);
  const source = { ...sourceOf({ id: component.name, request: requests[component.name]!, records: {}, expected: [] }), values: enriched.values };
  const issues: ProgramIssue[] = [];
  const compiled = await compileScreen(source, SPORTS_SCREEN, async (_messages, emit) => {
    const text = `answer = ${component.name}(d.answers.q1.record)\n`;
    emit(text);
    return { text, usage: { promptTokens: 0, completionTokens: 0, cost: 0 } };
  }, { issue: issue => issues.push(issue) });
  assert.deepEqual(issues, [], `${component.name}: a prepared record must compile after player enrichment`);
  assert.equal(compiled.stats.fallbacks, 0);
}
console.log(`Catalog audit: ${SPORTS_COMPONENTS.length} useWhen definitions, ${probes.length} request probes`);
for (const problem of problems) console.error(problem);

if (process.argv.includes("--live")) {
  const selectedIds = process.argv.filter(arg => arg.startsWith("--case=")).map(arg => arg.slice(7));
  const selected = selectedIds.length ? probes.filter(probe => selectedIds.includes(probe.id)) : probes;
  assert.equal(selected.length, selectedIds.length || probes.length, "Unknown probe id");
  const results: Record<string, unknown>[] = [];
  const cfg = config();
  for (let offset = 0; offset < selected.length; offset += 3) {
    const batch = await Promise.allSettled(selected.slice(offset, offset + 3).map(async probe => {
      const issues: ProgramIssue[] = [];
      const outputs: string[] = [];
      const compiled = await compileScreen(sourceOf(probe), SPORTS_SCREEN, async (messages, emit) => {
        const result = await modelWriter(messages, cfg.SPORTS_MODEL, emit, 12_000, { effort: "high" });
        outputs.push(result.text);
        return result;
      }, { issue: issue => issues.push(issue) });
      const output = outputs.join("\n");
      const calls = SPORTS_COMPONENTS.filter(component => new RegExp(`\\b${component.name}\\(`).test(output)).map(component => component.name);
      const reads = compiled.parts.flatMap(part => [...part.evidence.values()].flatMap(paths => paths.map(segments => segments.filter(segment => segment !== null).join("."))));
      const failures = [
        ...probe.expected.filter(name => !calls.includes(name)).map(name => `Missing ${name} call`),
        ...(probe.forbidden ?? []).filter(name => calls.includes(name)).map(name => `Irrelevant ${name} call`),
        ...(probe.requiredReads ?? []).filter(path => !reads.some(read => read === path || read.startsWith(`${path}.`))).map(path => `Missing data ${path}`),
        ...(probe.forbiddenReads ?? []).filter(path => reads.some(read => read === path || read.startsWith(`${path}.`))).map(path => `Unrequested data ${path}`),
        ...issues.map(issue => `${issue.code}: ${issue.message}`),
        ...(compiled.stats.fallbacks ? [`${compiled.stats.fallbacks} fallback parts`] : []),
      ];
      return { id: probe.id, request: probe.request, passed: failures.length === 0, calls, reads, failures, output, program: compiled.program, stats: compiled.stats };
    }));
    for (let index = 0; index < batch.length; index++) {
      const result = batch[index]!;
      const value = result.status === "fulfilled" ? result.value : { id: selected[offset + index]!.id, passed: false, failures: [String(result.reason)] };
      results.push(value);
      console.log(`${value.passed ? "PASS" : "FAIL"} ${value.id}${value.failures.length ? `: ${value.failures.join("; ")}` : ""}`);
    }
  }
  const report = { model: cfg.SPORTS_MODEL, mode: cfg.GENERATION_MODE, effort: cfg.CODEX_EFFORT, catalogProblems: problems, results };
  const outputFile = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
  if (outputFile) await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
  if (results.some(result => !result.passed)) process.exitCode = 1;
}
if (problems.length) process.exitCode = 1;
