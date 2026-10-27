import { evaluateRoot, type ElementNode } from "@openuidev/lang-core";
import { LIBRARY, PARSER } from "../src/lang/library.js";
import { PRIMITIVE_BY_NAME } from "../src/lang/primitives.js";
import { exprOfRef, printExpr, queryPath } from "../src/lang/program.js";
import { isElement } from "../src/lang/tree.js";
import { SPORTS_COMPONENTS, fits } from "../src/sports/components.js";
import { SPORTS_SCREEN } from "../src/sports/screen.js";

/**
 * The compiler parity suite (catalog/openui/fixtures.json): OpenUI programs in the shape the server
 * streams, each with its dataset and the element tree lang-core evaluates. The iOS compiler must
 * build the same tree from the same program and dataset.
 *
 * Every Sports component is expanded over a full record and a sparse one (empty strings, no club
 * colour, empty lists). Plain programs cover @Each, nested @Each, member, index and statement
 * reads, and null arguments.
 */

const TOOL = "sports_dataset";

const side = (name: string, logo: string, color: string, score: string, ink: string) => ({ name, logo, color, score, ink });
const SAMPLES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  MatchCard: {
    full: {
      home: side("Chelsea", "https://a.espncdn.com/i/teamlogos/soccer/500/363.png", "#034694", "0", "secondary"),
      away: side("Manchester City", "https://a.espncdn.com/i/teamlogos/soccer/500/382.png", "#99c5ea", "3", "primary"),
      label: "Sun, Apr 12", value: "FT", details: "Premier League · Stamford Bridge · Sky Sports",
    },
    sparse: { home: side("Everton", "", "", "", "primary"), away: side("Nottingham Forest", "", "", "", "primary"), label: "", value: "6:30 PM", details: "" },
  },
  TeamDetail: {
    full: { name: "Barcelona", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/83.png", color: "#a50044", detail: "LaLiga · BAR" },
    sparse: { name: "Brentford", logo: "", color: "", detail: "" },
  },
  StatBar: {
    full: { label: "Possession", homeDisplay: "37.3%", awayDisplay: "62.7%", sides: [
      { label: "Chelsea", count: 37.3, tone: "neutral", color: "#034694" }, { label: "Manchester City", count: 62.7, tone: "good", color: "#99c5ea" },
    ] },
    sparse: { label: "Corners", homeDisplay: "0", awayDisplay: "0", sides: [
      { label: "Everton", count: 0, tone: "neutral", color: "" }, { label: "Nottingham Forest", count: 0, tone: "neutral", color: "" },
    ] },
  },
  Leaderboard: {
    full: { title: "Top scorers · Premier League", metric: "Goals", entries: [
      { kind: "player", name: "Erling Haaland", detail: "Forward · Manchester City", value: "11", logo: "https://images.fotmob.com/image_resources/playerimages/737066.png", color: "#99c5ea" },
      { kind: "player", name: "João Pedro", detail: "Forward · Chelsea", value: "5", logo: "", color: "#034694" },
      { kind: "player", name: "Nico O'Reilly", detail: "", value: "4", logo: "", color: "" },
    ] },
    sparse: { title: "Clean sheets", metric: "", entries: [] },
  },
  FixturesHeatmap: {
    full: { value: "1.6", caption: "Points per game · Premier League 2026/27", summary: "4 won · 2 drawn · 3 lost", results: [
      { label: "Win", fill: "tone.good.fg" }, { label: "Draw", fill: "outline.control" }, { label: "Loss", fill: "tone.bad.fg" },
      { label: "Win", fill: "tone.good.fg" }, { label: "Loss", fill: "tone.bad.fg" }, { label: "Draw", fill: "outline.control" },
      { label: "Win", fill: "tone.good.fg" }, { label: "Win", fill: "tone.good.fg" }, { label: "Loss", fill: "tone.bad.fg" },
      { label: "Upcoming", fill: "surface.filled" }, { label: "Upcoming", fill: "surface.filled" }, { label: "Upcoming", fill: "surface.filled" },
    ] },
    sparse: { value: "0 pts", caption: "", summary: "", results: [] },
  },
  StatsCard: {
    full: {
      kind: "player", name: "Cole Palmer", detail: "Chelsea · Attacking Midfielder", logo: "https://images.fotmob.com/image_resources/playerimages/1096353.png", color: "#034694",
      rating: { value: "7.21", tone: "good", fill: "tone.good.fg", ink: "surface.screen", label: "Season rating", caption: "Average of 6 matches" },
      stats: [{ label: "Goals", value: "5" }, { label: "Assists", value: "3" }, { label: "Pass accuracy", value: "86%" }, { label: "Shots", value: "24" }],
    },
    mid: {
      kind: "player", name: "Ilan Okafor", detail: "Lakeshore · Midfielder", logo: "", color: "#4477aa",
      rating: { value: "6.60", tone: "warn", fill: "ink.brand", ink: "surface.screen", label: "Season rating", caption: "Average of 6 matches" },
      stats: [{ label: "Goals", value: "0" }, { label: "Assists", value: "1" }, { label: "Started", value: "2" }, { label: "Matches", value: "6" }, { label: "Minutes played", value: "298" }, { label: "Key passes", value: "7" }, { label: "Pass accuracy", value: "86%" }, { label: "Tackles", value: "9" }, { label: "Duels won", value: "54%" }],
    },
    low: {
      kind: "club", name: "Low rating", detail: "", logo: "", color: "",
      rating: { value: "5.80", tone: "bad", fill: "surface.brand", ink: "ink.onBrand", label: "Match rating", caption: "" },
      stats: [{ label: "Minutes played", value: "90" }],
    },
    unavailable: {
      kind: "player", name: "Noah Petit", detail: "Cedar · Midfielder", logo: "", color: "#557744",
      rating: { value: "—", tone: "neutral", fill: "none", ink: "ink.secondary", label: "Season rating", caption: "Shows after 90 minutes played" },
      stats: [{ label: "Matches", value: "1" }, { label: "Minutes played", value: "34" }, { label: "xG", value: "—" }],
    },
    sparse: { kind: "player", name: "Unknown player", detail: "", logo: "", color: "", rating: { value: "—", tone: "neutral", fill: "none", ink: "ink.secondary", label: "Season rating", caption: "" }, stats: [] },
  },
};

const scorers = [{ name: "Erling Haaland", club: "Manchester City", goals: 11, xg: 9.42 }, { name: "João Pedro", club: "Chelsea", goals: 5, xg: 3.1 }];
/** Programs written in primitives, as the writer does when no component fits. `pick1` is the part. */
const PROGRAMS: readonly { key: string; values: Record<string, unknown>; statements: readonly string[] }[] = [
  {
    key: "ColorCell/fluid",
    values: { cells: [
      { label: "Completed", fill: "tone.good.fg" }, { label: "Attention", fill: "tone.warn.fg" },
      { label: "Failed", fill: "tone.bad.fg" }, { label: "Inactive", fill: "tone.neutral.fg" },
      { label: "Available", fill: "outline.control" }, { label: "Scheduled", fill: "surface.filled" },
      { label: "Selected", fill: "surface.brand" },
    ] },
    statements: [`pick1 = Grid("7", 4, @Each(d.answers.q1.cells, "c", ColorCell(c.label, c.fill)))`],
  },
  {
    key: "ColorCell/fixed",
    values: { color: "#6f42c1", empty: "" },
    statements: [`pick1 = Stack("h", 8, [ColorCell("Project colour", "surface.brand", d.answers.q1.color, "12"), ColorCell("Available", "outline.control", d.answers.q1.empty, "24"), ColorCell("Scheduled", "surface.filled", null, "32")])`],
  },
  {
    key: "Each/rows",
    values: { scorers },
    statements: [`pick1 = Card([Stack("v", 12, @Each(d.answers.q1.scorers, "p", Row(p.name, p.club, null, Number(p.goals, "count", "body"))), null, null, null, true)])`],
  },
  {
    key: "Each/nested",
    values: { groups: [
      { name: "Champions League", clubs: [{ name: "Arsenal", points: 22 }, { name: "Chelsea", points: 19.5 }] },
      { name: "Relegation", clubs: [] },
      { name: "Europa League", clubs: [{ name: "Aston Villa", points: 17 }] },
    ] },
    statements: [`pick1 = Stack("v", 16, @Each(d.answers.q1.groups, "g", Section(g.name, [Stack("v", 8, @Each(g.clubs, "c", KeyValue(c.name, g.name)))])))`],
  },
  {
    key: "Query/reads",
    values: { scorers, match: { home: { name: "Chelsea", stats: { shots: 12 } } }, season: { label: "2026/27" } },
    statements: [
      `pick1 = Card([pick1_head, KeyValue("Leader", d.answers.q1.scorers[0].name), KeyValue("Runner-up", d.answers.q1.scorers[1].club), Row(d.answers.q1.match.home.name, d.answers.q1.season.label, null, Number(d.answers.q1.match.home.stats.shots, "integer", "body")), Number(d.answers.q1.scorers[0].xg, "decimal", "headline")])`,
      `pick1_head = Text("Haaland \\"the robot\\" leads", "headline", "semibold")`,
    ],
  },
  {
    key: "Nullable/values",
    values: { club: { name: "Everton", logo: null } },
    statements: [`pick1 = Card([Row(d.answers.q1.club.name, null, Avatar(d.answers.q1.club.name, 40, d.answers.q1.club.logo, null, null, null), null), Text(d.answers.q1.club.name, "body", null, null, null, null, null, null)], null, null, null, null)`],
  },
];

interface Shape { kind: string; properties: Record<string, unknown>; slots: Record<string, Shape[]> }
export interface Fixture { key: string; program: string; dataset: { tool: string; args: { run: string }; result: unknown }; expected: Shape }

const children = (value: unknown): ElementNode[] => Array.isArray(value) ? value.flatMap(children) : isElement(value) ? [value] : [];

/** `{kind, properties, slots}`: null and absent properties left out, and empty slots too. */
function shape(element: ElementNode): Shape {
  const definition = PRIMITIVE_BY_NAME.get(element.typeName);
  if (!definition) throw new Error(`Unknown fixture primitive ${element.typeName}`);
  const properties: Record<string, unknown> = {}, slots: Record<string, Shape[]> = {};
  for (const [key, spec] of Object.entries(definition.props)) {
    const value = element.props[key];
    if (spec.meta.role === "node" || spec.meta.role === "nodes") {
      const nodes = children(value).map(shape);
      if (nodes.length) slots[key] = nodes;
    } else if (value !== undefined && value !== null) properties[key] = value;
  }
  return { kind: element.typeName, properties, slots };
}

function fixture(key: string, answer: Record<string, unknown>, statements: readonly string[]): Fixture {
  const values = { answers: { q1: { status: "complete", question: key, title: key, ...answer } } };
  const program = [`root = Screen([pick1])`, `d = Query("${TOOL}", {run: "${key}"}, {})`, ...statements].join("\n") + "\n";
  const parsed = PARSER.parse(program);
  if (parsed.meta.errors.length || parsed.meta.unresolved.length || parsed.meta.incomplete) throw new Error(`Invalid fixture ${key}: ${JSON.stringify(parsed.meta)}`);
  const root = evaluateRoot(parsed, { ctx: { getState: () => undefined, resolveRef: name => name === "d" ? values : undefined }, library: LIBRARY, store: null });
  if (!isElement(root)) throw new Error(`Fixture ${key} has no root element`);
  return { key, program, dataset: { tool: TOOL, args: { run: key }, result: values }, expected: shape(root) };
}

export function fixtureSuite(): { version: number; fixtures: Fixture[] } {
  const components = SPORTS_COMPONENTS.flatMap(component => {
    const samples = SAMPLES[component.name];
    if (!samples) throw new Error(`${component.name} has no parity sample in scripts/openui-fixtures.ts`);
    return Object.entries(samples).map(([variant, record]) => {
      const key = `${component.name}/${variant}`;
      if (!fits(component, record)) throw new Error(`${key} does not satisfy its contract`);
      const expanded = SPORTS_SCREEN.expand({ k: "Comp", name: component.name, args: [exprOfRef(queryPath("answers.q1.record"))] });
      if (!expanded) throw new Error(`${component.name} did not expand`);
      return fixture(key, { record }, [`pick1 = ${printExpr(expanded)}`]);
    });
  });
  return { version: 3, fixtures: [...components, ...PROGRAMS.map(p => fixture(p.key, p.values, p.statements))] };
}
