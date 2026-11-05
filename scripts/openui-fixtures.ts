import { evaluateRoot, type ElementNode } from "@openuidev/lang-core";
import { LIBRARY, PARSER } from "../src/lang/library.js";
import { PRIMITIVE_BY_NAME } from "../src/lang/primitives.js";
import { exprOfRef, printExpr, queryPath } from "../src/lang/program.js";
import { isElement } from "../src/lang/tree.js";
import { SPORTS_COMPONENTS, fits, settleInjuries } from "../src/sports/components.js";
import { valueTicks } from "../src/sports/fotmob.js";
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

const crest = (id: number) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
const chelsea = { name: "Chelsea", logo: crest(363), color: "clear" };
const arsenal = { name: "Arsenal", logo: crest(359), color: "clear" };
const noPlayer = { present: false, name: "", kind: "player", detail: "", logo: "", color: "", value: "", fill: "surface.filled", ink: "ink.primary", club: { name: "", logo: "", color: "" } };
const fromChelsea = (name: string, detail: string, photo: number, value: string, fill: string, ink: string) => ({ present: true, name, kind: "player", detail, logo: photo ? `https://images.fotmob.com/image_resources/playerimages/${photo}.png` : "", color: "#034694", value, fill, ink, club: chelsea });
const fromArsenal = (name: string, detail: string, photo: number, value: string, fill: string, ink: string) => ({ ...fromChelsea(name, detail, photo, value, fill, ink), color: "#e20520", club: arsenal });

/** An injured player as the schema stage writes it, settled as the server would on 5 Nov 2026. */
const INJURY_DAY = new Date("2026-11-05T12:00:00Z");
const injured = (name: string, position: string, team: string, logo: string, color: string, status: string, returnDate: string, returnNote: string, source: string) => {
  const raw = { name, kind: "player", position, team, logo, color, status, returnDate, returnNote, source };
  return (settleInjuries({ values: { answers: { q: raw } }, fields: [] }, INJURY_DAY).values.answers as { q: Record<string, unknown> }).q;
};
const nflPhoto = (id: number) => `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;

const valueStretch = (name: string, lineColor: string, tagColor: string, team: number, points: readonly (readonly [string, number, string])[]) => ({
  name, lineColor, tagColor, logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${team}.png`,
  points: points.map(([date, value, display]) => ({ x: Date.parse(date), label: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date)), value, display })),
});

const side = (name: string, logo: string, color: string, score: string, ink: string) => ({ name, logo, color, score, ink });
const timelineClubs = [
  { id: "nassr", name: "Al Nassr", logo: "", color: "#fbd129", year: "2025", dates: "Jan 2025 – Feb 2026", location: "Riyadh, Saudi Arabia", marker: "none", stats: [] },
  { id: "fenerbahce", name: "Fenerbahçe", logo: "", color: "#ffed00", year: "2025", dates: "Jul 2025 – Feb 2026", location: "İstanbul, Turkey", marker: "currency", stats: [] },
  { id: "zenit", name: "Zenit St. Petersburg", logo: "", color: "#7fcbf3", year: "2026", dates: "Feb 2026 – Jun 2026", location: "", marker: "currency", stats: [] },
];
const SAMPLES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  ClubTimeline: {
    full: { initial: 0, clubs: timelineClubs },
    withStats: { initial: 2, clubs: timelineClubs.map(club => ({ ...club, stats: [{ label: "Apps", value: "9" }, { label: "Goals", value: "2" }, { label: "Assists", value: "0" }] })) },
    oneYear: { initial: 0, clubs: timelineClubs.slice(0, 2) },
    sparse: { initial: 0, clubs: [] },
  },
  MatchCard: {
    full: {
      home: side("Chelsea", "https://a.espncdn.com/i/teamlogos/soccer/500/363.png", "clear", "0", "secondary"),
      away: side("Manchester City", "https://a.espncdn.com/i/teamlogos/soccer/500/382.png", "clear", "3", "primary"),
      label: "Sun, Apr 12", value: "FT", details: "Premier League · Stamford Bridge · Sky Sports",
    },
    sparse: { home: side("Everton", "", "", "", "primary"), away: side("Nottingham Forest", "", "", "", "primary"), label: "", value: "6:30 PM", details: "" },
  },
  TeamDetail: {
    full: { name: "Barcelona", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/83.png", color: "clear", detail: "LaLiga · BAR" },
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
      { kind: "player", name: "João Pedro", detail: "Forward · Chelsea", value: "5", logo: "https://images.fotmob.com/image_resources/playerimages/1021382.png", color: "#034694" },
      { kind: "player", name: "Bukayo Saka", detail: "Winger · Arsenal", value: "4", logo: "https://images.fotmob.com/image_resources/playerimages/961995.png", color: "#e20520" },
    ] },
    sparse: { title: "Clean sheets", metric: "", entries: [] },
  },
  FixturesHeatmap: {
    full: { value: "1.6", caption: "Points per game · Premier League 2026/27", summary: "4 won · 2 drawn · 3 lost", columns: "10", results: [
      { label: "Win", fill: "tone.good.fg" }, { label: "Draw", fill: "outline.control" }, { label: "Loss", fill: "tone.bad.fg" },
      { label: "Win", fill: "tone.good.fg" }, { label: "Loss", fill: "tone.bad.fg" }, { label: "Draw", fill: "outline.control" },
      { label: "Win", fill: "tone.good.fg" }, { label: "Win", fill: "tone.good.fg" }, { label: "Loss", fill: "tone.bad.fg" },
      { label: "Upcoming", fill: "surface.filled" }, { label: "Upcoming", fill: "surface.filled" }, { label: "Upcoming", fill: "surface.filled" },
    ] },
    season: { value: "1.37", caption: "Points per game · Premier League 2025/26", summary: "14 won · 10 drawn · 14 lost", columns: "19", results: Array.from({ length: 38 }, (_, i) => i % 19 === 0 ? { label: "Draw", fill: "outline.control" } : i % 2 ? { label: "Win", fill: "tone.good.fg" } : { label: "Loss", fill: "tone.bad.fg" }) },
    sparse: { value: "0 pts", caption: "", summary: "", columns: "10", results: [] },
  },
  StatsCard: {
    full: {
      kind: "player", name: "Cole Palmer", detail: "Chelsea · Attacking Midfielder", logo: "https://images.fotmob.com/image_resources/playerimages/1096353.png", color: "#034694",
      rating: { value: "7.21", tone: "good", fill: "tone.good.fg", ink: "surface.screen", label: "Season rating", caption: "Average of 6 matches", show: true },
      stats: [{ label: "Goals", value: "5" }, { label: "Assists", value: "3" }, { label: "Pass accuracy", value: "86%" }, { label: "Shots", value: "24" }], showStats: true,
    },
    mid: {
      kind: "player", name: "Declan Rice", detail: "Arsenal · Midfielder", logo: "https://images.fotmob.com/image_resources/playerimages/654096.png", color: "#e20520",
      rating: { value: "6.60", tone: "warn", fill: "ink.brand", ink: "surface.screen", label: "Season rating", caption: "Average of 6 matches", show: true },
      stats: [{ label: "Goals", value: "0" }, { label: "Assists", value: "1" }, { label: "Started", value: "2" }, { label: "Matches", value: "6" }, { label: "Minutes played", value: "298" }, { label: "Key passes", value: "7" }, { label: "Pass accuracy", value: "86%" }, { label: "Tackles", value: "9" }, { label: "Duels won", value: "54%" }], showStats: true,
    },
    low: {
      kind: "club", name: "Everton", detail: "Premier League · 2026/27", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/368.png", color: "clear",
      rating: { value: "5.80", tone: "bad", fill: "surface.brand", ink: "ink.onBrand", label: "Match rating", caption: "", show: true },
      stats: [{ label: "Minutes played", value: "90" }], showStats: true,
    },
    unavailable: {
      kind: "player", name: "João Pedro", detail: "Chelsea · Forward", logo: "https://images.fotmob.com/image_resources/playerimages/1021382.png", color: "#034694",
      rating: { value: "", tone: "neutral", fill: "none", ink: "ink.secondary", label: "", caption: "", show: false },
      stats: [{ label: "Matches", value: "1" }, { label: "Minutes played", value: "34" }], showStats: true,
    },
    sparse: { kind: "player", name: "Unknown player", detail: "", logo: "", color: "", rating: { value: "", tone: "neutral", fill: "none", ink: "ink.secondary", label: "", caption: "", show: false }, stats: [], showStats: false, },
  },
  TeamPoints: {
    full: { subtitle: "Rank 1 · 9 played", points: "27",
      home: { played: "5", won: "5", drawn: "0", lost: "0", goals: "20-1", goalDifference: "+19", goalDifferenceTone: "neutral", points: "15" },
      away: { played: "4", won: "4", drawn: "0", lost: "0", goals: "13-3", goalDifference: "+10", goalDifferenceTone: "neutral", points: "12" },
    },
    mixed: { subtitle: "Rank 13 · 9 played", points: "9",
      home: { played: "4", won: "2", drawn: "1", lost: "1", goals: "7-6", goalDifference: "+1", goalDifferenceTone: "neutral", points: "7" },
      away: { played: "5", won: "0", drawn: "2", lost: "3", goals: "3-9", goalDifference: "−6", goalDifferenceTone: "bad", points: "2" },
    },
    sparse: { subtitle: "", points: "0",
      home: { played: "0", won: "0", drawn: "0", lost: "0", goals: "0-0", goalDifference: "0", goalDifferenceTone: "neutral", points: "0" },
      away: { played: "0", won: "0", drawn: "0", lost: "0", goals: "0-0", goalDifference: "0", goalDifferenceTone: "neutral", points: "0" },
    },
  },
  LeagueStanding: {
    full: { place: "1st", summary: "27 points · 5 clear of 2nd", rows: [
      { rank: "1", name: "Bayern München", points: "27", surface: "filled", ink: "primary", weight: "medium" },
      { rank: "2", name: "Borussia Dortmund", points: "22", surface: "none", ink: "secondary", weight: "regular" },
      { rank: "3", name: "RB Leipzig", points: "20", surface: "none", ink: "secondary", weight: "regular" },
    ], home: { detail: "15 pts · 5-0-0" }, away: { detail: "12 pts · 4-0-0" }, showVenues: true },
    mixed: { place: "13th", summary: "9 points · 1 behind 12th, 1 ahead of 14th", rows: [
      { rank: "12", name: "Brentford", points: "10", surface: "none", ink: "secondary", weight: "regular" },
      { rank: "13", name: "Everton", points: "9", surface: "filled", ink: "primary", weight: "medium" },
      { rank: "14", name: "Aston Villa", points: "8", surface: "none", ink: "secondary", weight: "regular" },
    ], home: { detail: "7 pts · 2-1-1" }, away: { detail: "2 pts · 0-2-3" }, showVenues: false },
    sparse: { place: "", summary: "", rows: [], home: { detail: "" }, away: { detail: "" }, showVenues: false },
  },
  MatchTopPlayers: {
    full: { title: "Top rated · Chelsea 2-1 Arsenal", metric: "Rating", rows: [
      { home: fromChelsea("Cole Palmer", "Midfielder", 1096353, "8.6", "tone.good.fg", "surface.screen"), away: fromArsenal("Bukayo Saka", "Attacker", 961995, "7.7", "tone.good.fg", "surface.screen") },
      { home: fromChelsea("João Pedro", "Attacker", 1021382, "7.5", "tone.good.fg", "surface.screen"), away: fromArsenal("Declan Rice", "Midfielder", 654096, "6.9", "ink.brand", "surface.screen") },
      { home: fromChelsea("Enzo Fernández", "Midfielder", 0, "6.8", "ink.brand", "surface.screen"), away: fromArsenal("Martin Ødegaard", "Midfielder", 0, "5.9", "surface.brand", "ink.onBrand") },
    ] },
    one: { title: "Top scorers · Chelsea 2-1 Arsenal", metric: "Goals", rows: [
      { home: fromChelsea("Cole Palmer", "Midfielder", 1096353, "2", "surface.filled", "ink.primary"), away: fromArsenal("Bukayo Saka", "Attacker", 961995, "1", "surface.filled", "ink.primary") },
    ] },
    uneven: { title: "Top scorers · Chelsea 3-1 Arsenal", metric: "Goals", rows: [
      { home: fromChelsea("Cole Palmer", "Midfielder", 1096353, "2", "surface.filled", "ink.primary"), away: fromArsenal("Bukayo Saka", "Attacker", 961995, "1", "surface.filled", "ink.primary") },
      { home: fromChelsea("João Pedro", "Attacker", 1021382, "1", "surface.filled", "ink.primary"), away: noPlayer },
    ] },
    sparse: { title: "Top scorers", metric: "", rows: [] },
  },
  PlayerValue: {
    full: { value: "€97.7M", caption: "Cole Palmer · Market value", segments: [
      valueStretch("Manchester City U18", "#69A8D8", "#69A8D8", 1113543, [["2018-12-31", 250_000, "€250k"], ["2019-12-31", 530_000, "€530k"]]),
      valueStretch("Manchester City", "#76b4e5", "#69A8D8", 8456, [["2020-06-30", 1_200_000, "€1.2M"], ["2022-01-31", 15_370_000, "€15.4M"], ["2022-09-30", 4_460_000, "€4.5M"], ["2023-06-30", 5_050_000, "€5.1M"]]),
      valueStretch("Chelsea", "#033cc1", "#051495", 8455, [["2023-09-01", 18_000_000, "€18M"], ["2024-03-31", 49_295_400, "€49.3M"], ["2024-12-31", 116_235_970, "€116.2M"], ["2025-10-01", 116_165_340, "€116.2M"], ["2026-07-01", 110_374_028, "€110.4M"], ["2026-11-01", 97_678_048, "€97.7M"]]),
    ], ticks: valueTicks(116_235_970) },
    oneClub: { value: "€157.7M", caption: "Erling Haaland · Market value", segments: [
      valueStretch("Manchester City", "#76b4e5", "#69A8D8", 8456, [["2024-01-31", 170_000_000, "€170M"], ["2025-01-31", 190_000_000, "€190M"], ["2026-11-01", 157_706_260, "€157.7M"]]),
    ], ticks: valueTicks(190_000_000) },
    underMillion: { value: "€900k", caption: "A prospect · Market value", segments: [
      valueStretch("Chelsea", "#033cc1", "#051495", 8455, [["2025-06-30", 150_000, "€150k"], ["2025-12-31", 400_000, "€400k"], ["2026-06-30", 900_000, "€900k"]]),
    ], ticks: valueTicks(900_000) },
    sparse: { value: "", caption: "", segments: [], ticks: [] },
  },
  RecordTable: {
    full: { title: "Passing", columnCount: "4", columns: [{ label: "C/ATT" }, { label: "YDS" }, { label: "TD" }, { label: "INT" }],
      rows: [{ label: "Patrick Mahomes", cells: [{ value: "30/41" }, { value: "321" }, { value: "3" }, { value: "0" }] }, { label: "Gardner Minshew", cells: [{ value: "1/2" }, { value: "9" }, { value: "0" }, { value: "0" }] }] },
    sparse: { title: "No games yet", columnCount: "1", columns: [], rows: [] },
  },
  InjuryReport: {
    full: injured("Jeremiyah Love", "RB", "Cardinals", nflPhoto(4870808), "#a40227", "Injured Reserve", "2026-12-06", "", "Cardinals' official site"),
    tomorrow: injured("Jock Landale", "C", "Hawks", "https://a.espncdn.com/i/headshots/nba/players/full/3146557.png", "#c8102e", "Day-To-Day", "2026-11-06", "", "Hawks' official site"),
    noted: injured("Reece James", "Defender", "Chelsea", "https://images.fotmob.com/image_resources/playerimages/807729.png", "#034694", "", "", "Mid-January 2027", "The Standard"),
    sparse: injured("Unknown player", "", "", "", "", "", "", "", ""),
  },
  InjuryList: {
    full: (() => {
      const players = [
        injured("Jeremiyah Love", "RB", "Cardinals", nflPhoto(4870808), "#a40227", "Injured Reserve", "2026-12-06", "", "Cardinals' official site"),
        injured("Tyler Huntley", "QB", "Ravens", nflPhoto(4035671), "#29126f", "Out", "", "Out for season", "ESPN"),
        injured("Walter Nolen III", "DT", "Cardinals", nflPhoto(4685503), "#a40227", "Questionable", "2026-11-08", "", ""),
      ];
      return { title: "NFL injuries", showTitle: true, players };
    })(),
    sparse: { title: "", showTitle: false, players: [] },
  },
  SeasonPodium: {
    full: {
      first: { name: "Liverpool", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/364.png", color: "clear", medal: "#E6B422" },
      second: { name: "Arsenal", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/359.png", color: "clear", medal: "#C0C4CC" },
      third: { name: "Manchester City", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/382.png", color: "clear", medal: "#CD7F32" },
    },
    sparse: {
      first: { name: "Winner", logo: "", color: "", medal: "#E6B422" },
      second: { name: "Runner-up", logo: "", color: "", medal: "#C0C4CC" },
      third: { name: "Third", logo: "", color: "", medal: "#CD7F32" },
    },
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
