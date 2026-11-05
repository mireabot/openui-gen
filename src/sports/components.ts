import { each, ui, type Node } from "../lang/program.js";

/**
 * The Sports component index: the components designed in ui-canvas (Sports Components, Kino) as
 * server templates. Each entry says what it is for, when to use it, and the exact data contract it
 * reads. The schema stage shapes answers to these contracts, the writer calls them by name, and they
 * expand to primitives, so every client renders them without knowing they exist.
 *
 * Contracts are strict: every field is present on every record (text may be "", a list may be
 * empty). A template expands without seeing values, and the compiler rejects a missing path.
 * Colours come from data: a club's ESPN colour as "#rrggbb" (from d.clubs), and tone (good · warn ·
 * bad · neutral) and ink (primary · secondary) fields the schema stage fills, because a template
 * cannot branch on a value. An empty colour falls back to the theme.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRef = any;

export interface ContractField {
  /** Relative to the record the component is called with; "[]" marks list items. */
  readonly path: string;
  readonly kind: "text" | "number" | "boolean" | "tone" | "ink" | "color" | "list";
  readonly note: string;
}

export interface SportsComponent {
  readonly name: string;
  readonly intent: string;
  readonly useWhen: string;
  /** Where it was designed. */
  readonly source: string;
  readonly contract: readonly ContractField[];
  /** Optional copy arguments after the data reference. */
  readonly params: readonly { readonly name: string; readonly note: string }[];
  readonly build: (data: AnyRef, args: readonly (string | null)[]) => Node;
}

const f = (path: string, kind: ContractField["kind"], note: string): ContractField => ({ path, kind, note });
const CLUB_COLOR = "\"clear\" for a club with a logo, so its crest has no fill; else the club's colour \"#rrggbb\" from d.clubs, or \"\"";
const team = (prefix: string): ContractField[] => [
  f(`${prefix}.name`, "text", "club name"),
  f(`${prefix}.logo`, "text", "logo URL, or \"\""),
  f(`${prefix}.color`, "color", CLUB_COLOR),
  f(`${prefix}.score`, "text", "goals as text (\"2\"), \"\" before kick-off"),
  f(`${prefix}.ink`, "ink", "\"secondary\" for the side that lost, else \"primary\""),
];

/** A club's mark: its logo, or its initial on the club colour. */
/** A club's mark, or a player's photo when `kind` (a literal or a data field) is "player". */
const mark = (t: AnyRef, size: 20 | 40 | 56 | 80, kind: AnyRef = "club") => ui.Avatar({ name: t.name, size, image: t.logo, color: t.color, kind });

/** A club's row: logo or monogram, its name on up to two leading lines, and an optional trailing node. */
const teamLine = (t: AnyRef, trailing?: Node) => ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
  ui.Stack({ axis: "h", gap: 12, align: "center", children: [mark(t, 20), ui.Text({ content: t.name, role: "body", weight: "medium", lines: 2, align: "start" })] }),
  ...(trailing ? [trailing] : []),
] });

/** One venue's figures, as shown, for a table row. */
const venueRow = (venue: "home" | "away"): ContractField[] => [
  f(`${venue}.played`, "text", `matches played ${venue}, e.g. "5"`),
  f(`${venue}.won`, "text", "wins"),
  f(`${venue}.drawn`, "text", "draws"),
  f(`${venue}.lost`, "text", "losses"),
  f(`${venue}.goals`, "text", "goals for and against, e.g. \"20-1\""),
  f(`${venue}.goalDifference`, "text", "always signed with a true minus: \"+19\", \"−6\", \"0\""),
  f(`${venue}.goalDifferenceTone`, "tone", "\"bad\" when negative, else \"neutral\""),
  f(`${venue}.points`, "text", "points at this venue"),
];

const cell = (content: AnyRef) => ui.Text({ content, role: "footnote", align: "end" });

const venueCells = (label: string, v: AnyRef) => ui.Grid({ columns: "8", gap: 0, children: [
  ui.Text({ content: label, role: "footnote", weight: "medium", lines: 1 }),
  cell(v.played), cell(v.won), cell(v.drawn), cell(v.lost),
  ui.Text({ content: v.goals, role: "footnote", ink: "secondary", align: "end" }),
  ui.Text({ content: v.goalDifference, role: "footnote", tone: v.goalDifferenceTone, align: "end" }),
  ui.Text({ content: v.points, role: "footnote", weight: "semibold", align: "end" }),
] });

const venueDetail = (icon: string, label: string, detail: AnyRef) => ui.Stack({ axis: "v", gap: 4, children: [
  ui.Stack({ axis: "h", gap: 8, align: "center", children: [
    ui.Icon({ name: icon, size: 16, ink: "secondary" }),
    ui.Text({ content: label, role: "body", weight: "medium" }),
  ] }),
  ui.Text({ content: detail, role: "footnote", ink: "secondary" }),
] });

/** One place on a podium, as the record carries it. */
const podiumPlace = (prefix: string, medal: string): ContractField[] => [
  f(`${prefix}.name`, "text", "club name"),
  f(`${prefix}.logo`, "text", "logo URL, or \"\""),
  f(`${prefix}.color`, "color", CLUB_COLOR),
  f(`${prefix}.medal`, "color", `always ${medal}: the place's colour, which a template cannot hold itself`),
];

/** A podium column: the numeral in its medal colour, the club's avatar scaled by place, its name. */
const podiumColumn = (place: AnyRef, numeral: string, avatar: 40 | 56 | 80, role: "title1" | "title2", winner: boolean) => ui.Stack({ axis: "v", gap: 8, align: "center", children: [
  ui.Text({ content: numeral, role, weight: "semibold", color: place.medal }),
  mark(place, avatar),
  ui.Text({ content: place.name, role: "footnote", weight: winner ? "semibold" : "regular", ink: winner ? "primary" : "secondary", lines: 2, align: "center", reserve: true }),
] });

/** One side's player in a MatchTopPlayers row. */
const matchPlayer = (prefix: string): ContractField[] => [
  f(`${prefix}.present`, "boolean", "false when this side has no player for the row, such as a side with fewer scorers; the cell stays empty and its other fields are \"\", with fill \"surface.filled\" and ink \"ink.primary\""),
  f(`${prefix}.name`, "text", "the player's full name"),
  f(`${prefix}.kind`, "text", "\"player\""),
  f(`${prefix}.detail`, "text", "position as the data gives it, e.g. \"DM\" or \"Midfielder\", or \"\""),
  f(`${prefix}.logo`, "text", "photo URL, or \"\""),
  f(`${prefix}.color`, "color", "their club's colour \"#rrggbb\" from d.clubs, or \"\""),
  f(`${prefix}.value`, "text", "the metric's value as shown, e.g. \"7.7\" or \"2\""),
  f(`${prefix}.fill`, "text", "a rating: 7.0 and up tone.good.fg, 6.0–6.99 ink.brand, under 6.0 surface.brand; any other metric: surface.filled"),
  f(`${prefix}.ink`, "text", "a rating: 7.0 and up and 6.0–6.99 surface.screen, under 6.0 ink.onBrand; any other metric: ink.primary"),
  f(`${prefix}.club.name`, "text", "the player's club"),
  f(`${prefix}.club.logo`, "text", "logo URL, or \"\""),
  f(`${prefix}.club.color`, "color", CLUB_COLOR),
];

/**
 * A cell of a two-team row: the avatar carries the value at its top right and the club's crest at its
 * outer bottom corner, both overhanging by the padding. The away side mirrors the home side.
 */
const matchPlayerCell = (p: AnyRef, side: "home" | "away") => {
  const away = side === "away";
  const textAlign = away ? "end" : "start";
  const avatar = ui.ZStack({ alignment: "top-trailing", children: [
    ui.ZStack({ alignment: away ? "bottom-trailing" : "bottom-leading", children: [
      ui.Stack({ axis: "h", gap: 0, paddingX: 8, paddingY: 8, children: [mark(p, 40, p.kind)] }),
      mark(p.club, 20),
    ] }),
    ui.Badge({ label: p.value, tone: "neutral", size: "small", fill: p.fill, ink: p.ink }),
  ] });
  const text = ui.Stack({ axis: "v", gap: 0, children: [
    ui.Text({ content: p.name, role: "body", weight: "medium", lines: 2, align: textAlign }),
    ui.Text({ content: p.detail, role: "footnote", ink: "secondary", lines: 2, align: textAlign }),
  ] });
  return ui.Stack({ axis: "v", gap: 0, ...(away ? { align: "end" as const } : {}), children: [
    ui.Show({ when: p.present, child: ui.Stack({ axis: "h", gap: 8, align: "center", children: away ? [text, avatar] : [avatar, text] }) }),
  ] });
};

export const SPORTS_COMPONENTS: readonly SportsComponent[] = [
  {
    name: "ClubTimeline",
    intent: "A player's club history as a swipeable row of club cards under one stop per year. Loans have a currency marker; brief stats are optional.",
    useWhen: "a player's career, transfer history or clubs over time; use stats only when asked for and supplied by the research",
    source: "ui-canvas club-timeline/m04 and club-timeline/m05",
    contract: [
      f("initial", "number", "zero-based card to open on; 0 for oldest, last index for current club"),
      f("clubs", "list", "club spells oldest first; multiple clubs can share the same year"),
      f("clubs[].id", "text", "unique spell ID; a return to the same club has a different ID"),
      f("clubs[].name", "text", "club name"), f("clubs[].year", "text", "the year the spell starts, e.g. 2025"),
      f("clubs[].dates", "text", "dates as the source gives them, e.g. Jul 2025 – Feb 2026"),
      f("clubs[].location", "text", "club location, or an empty string when unavailable"),
      f("clubs[].logo", "text", "club crest URL, or an empty string"),
      f("clubs[].color", "color", "club colour for a monogram when there is no logo"),
      f("clubs[].marker", "text", "currency for a loan, otherwise none"),
      f("clubs[].stats", "list", "optional stats: [] when not requested or not known, at most 3 supplied label/value pairs"),
      f("clubs[].stats[].label", "text", "stat name, e.g. Apps, Goals or Assists"),
      f("clubs[].stats[].value", "text", "published value as shown; never invent a missing stat"),
    ],
    params: [],
    build: t => ui.YearTimeline({ items: t.clubs, initial: t.initial }),
  },
  {
    name: "MatchCard",
    intent: "One match between two clubs: both teams on stacked rows with their scores, a side column (date and kickoff, or a status such as FT), and one details line.",
    useWhen: "a fixture or a result; a list of matches (@Each over them); the latest meeting between two clubs",
    source: "ui-canvas sports-components/match-card (from match-card/stacked-rows) and match-result",
    contract: [
      ...team("home"), ...team("away"),
      f("label", "text", "small side line: a date such as \"Sat, Oct 31\", or \"\""),
      f("value", "text", "large side line: kickoff \"6:30 PM\" or status \"FT\", or \"\""),
      f("details", "text", "one line: competition · venue · broadcast, or \"\""),
    ],
    params: [],
    build: m => ui.Card({ children: [
      ui.Stack({ axis: "h", gap: 16, align: "center", children: [
        ui.Stack({ axis: "v", gap: 12, children: [
          teamLine(m.home, ui.Text({ content: m.home.score, role: "headline", weight: "semibold", ink: m.home.ink })),
          teamLine(m.away, ui.Text({ content: m.away.score, role: "headline", weight: "semibold", ink: m.away.ink })),
        ] }),
        ui.Stack({ axis: "v", gap: 4, align: "end", children: [
          ui.Text({ content: m.label, role: "footnote", ink: "secondary", align: "end" }),
          ui.Text({ content: m.value, role: "headline", weight: "semibold", align: "end" }),
        ] }),
      ] }),
      ui.Text({ content: m.details, role: "footnote", ink: "secondary", lines: 2, align: "start" }),
    ] }),
  },
  {
    name: "TeamDetail",
    intent: "A club on one line: logo or monogram, name, and a short secondary line (nickname, code or league).",
    useWhen: "naming the clubs a screen is about, above stats or a comparison",
    source: "ui-canvas sports-components/team-detail",
    contract: [f("name", "text", "club name"), f("logo", "text", "logo URL, or \"\""), f("color", "color", CLUB_COLOR), f("detail", "text", "nickname, code or league, or \"\"")],
    params: [],
    build: t => ui.Row({ title: t.name, subtitle: t.detail, leading: mark(t, 40) }),
  },
  {
    name: "StatBar",
    intent: "One stat between two teams: each side's figure at its edge, the stat's name between them, and a bar split in proportion.",
    useWhen: "comparing two clubs on a stat (possession, shots, shots on target, corners, goals); stack several in a vertical Stack, no card",
    source: "ui-canvas sports-components/stat-bar (from component-references/c24)",
    contract: [
      f("label", "text", "the stat's name, e.g. \"Shots on target\""),
      f("homeDisplay", "text", "home figure as shown, e.g. \"3\" or \"37%\""),
      f("awayDisplay", "text", "away figure as shown"),
      f("sides", "list", "exactly two items, home then away"),
      f("sides[].label", "text", "club name"),
      f("sides[].count", "number", "the raw value; the bar splits in proportion"),
      f("sides[].tone", "tone", "\"good\" for the side ahead, \"neutral\" for the other (both \"neutral\" when level); used when color is \"\""),
      f("sides[].color", "color", "the club's colour \"#rrggbb\" from d.clubs, or \"\""),
    ],
    params: [],
    build: s => ui.Stack({ axis: "v", gap: 8, children: [
      // A ZStack, so the name sits on the true centre however wide each figure is.
      ui.ZStack({ alignment: "center", children: [
        ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
          ui.Text({ content: s.homeDisplay, role: "body", weight: "semibold" }),
          ui.Text({ content: s.awayDisplay, role: "body", weight: "semibold", align: "end" }),
        ] }),
        ui.Text({ content: s.label, role: "footnote", ink: "secondary", align: "center" }),
      ] }),
      ui.SplitBar({ sides: s.sides }),
    ] }),
  },
  {
    name: "Leaderboard",
    intent: "A ranked list for one metric: a header naming the list and the metric, then rows of logo or monogram, name, a detail line and the value.",
    useWhen: "top scorers, top assisters, most clean sheets, the teams conceding most: any ranking where every row has one value",
    source: "ui-canvas sports-components/leaderboard (from component-references/b06)",
    contract: [
      f("title", "text", "the list's name, e.g. \"Top scorers · Premier League\""),
      f("metric", "text", "the one metric every value is, e.g. \"Goals\""),
      f("entries", "list", "in rank order, at most 10"),
      f("entries[].name", "text", "player or club"),
      f("entries[].kind", "text", "\"player\" or \"club\": a player's photo sits on the club colour, a crest on white"),
      f("entries[].detail", "text", "position · club for a player, league for a club, or \"\""),
      f("entries[].value", "text", "the metric's value as shown, e.g. \"9\""),
      f("entries[].logo", "text", "logo or photo URL, or \"\""),
      f("entries[].color", "color", "a player: their club's colour \"#rrggbb\", or \"\"; a club: \"clear\" with a logo, else its colour"),
    ],
    params: [],
    build: b => ui.Card({ children: [
      ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
        ui.Text({ content: b.title, role: "footnote", weight: "medium", ink: "secondary", lines: 2, align: "start" }),
        ui.Text({ content: b.metric, role: "footnote", weight: "medium", ink: "secondary" }),
      ] }),
      ui.Stack({ axis: "v", gap: 12, divided: true, children: each(b.entries, "e", (e: AnyRef) => ui.Row({
        title: e.name, subtitle: e.detail, leading: mark(e, 40, e.kind),
        trailing: ui.Text({ content: e.value, role: "body", weight: "semibold" }),
      })) }),
    ] }),
  },
  {
    name: "FixturesHeatmap",
    intent: "A team's run of fixtures: a headline figure, a caption saying what it is, one square per fixture in result colours, and the won · drawn · lost counts.",
    useWhen: "form, a season so far, a run of results; no title of its own",
    source: "ui-canvas sports-components/fixtures-heatmap (layout from component-references/c24)",
    contract: [
      f("value", "text", "the headline figure, e.g. points per game \"1.6\" or \"13 pts\""),
      f("caption", "text", "what the figure is, e.g. \"Points per game · Premier League 2026/27\""),
      f("results", "list", "one per fixture, oldest first, every fixture of the run however many: a season is one record, never split"),
      f("results[].label", "text", "spoken result, e.g. \"Win\", \"Draw\", \"Loss\" or \"Upcoming\"; not visible in the square"),
      f("results[].fill", "text", "win \"tone.good.fg\", loss \"tone.bad.fg\", draw \"outline.control\", upcoming \"surface.filled\""),
      f("summary", "text", "e.g. \"4 won · 1 drawn · 3 lost\""),
      f("columns", "text", "\"10\"; the server sets it from the number of results"),
    ],
    params: [],
    build: h => ui.Card({ children: [
      ui.Stack({ axis: "v", gap: 8, align: "center", children: [
        ui.Text({ content: h.value, role: "display", weight: "semibold", align: "center" }),
        ui.Text({ content: h.caption, role: "body", ink: "secondary", align: "center" }),
      ] }),
      ui.Grid({ columns: h.columns, gap: 4, children: each(h.results, "r", (r: AnyRef) => ui.ColorCell({ label: r.label, fill: r.fill })) }),
      ui.Text({ content: h.summary, role: "footnote", ink: "secondary", align: "center" }),
    ] }),
  },
  {
    name: "StatsCard",
    intent: "A player's or a club's stats: a short card with the logo, name and a detail line, the rating in its bracket colour when there is one, then a scroll rail of small cards, one per stat, value over label. A part with no data is not shown.",
    useWhen: "a player's or a club's season or match stats; any set of figures about one subject",
    source: "ui-canvas sports-components/stats-card (from stats-grid/rating-hero)",
    contract: [
      f("name", "text", "player or club"),
      f("kind", "text", "\"player\" or \"club\": a player's photo sits on the club colour, a crest on white"),
      f("detail", "text", "club · position for a player, league · season for a club"),
      f("logo", "text", "photo or logo URL, or \"\""),
      f("color", "color", "a player: their club's colour \"#rrggbb\", or \"\"; a club: \"clear\" with a logo, else its colour"),
      f("rating.value", "text", "rating as shown, e.g. \"6.60\"; leave rating out when there is none"),
      f("rating.tone", "tone", "7.0 and up \"good\", 6.0–6.99 \"warn\", under 6.0 \"bad\""),
      f("rating.fill", "text", "7.0 and up: tone.good.fg; 6.0–6.99: ink.brand; under 6.0: surface.brand"),
      f("rating.ink", "text", "7.0 and up and 6.0–6.99: surface.screen; under 6.0: ink.onBrand"),
      f("rating.label", "text", "e.g. \"Season rating\""),
      f("rating.caption", "text", "what it averages, e.g. \"Average of 6 matches\", or \"\""),
      f("rating.show", "boolean", "the server sets this"),
      f("stats", "list", "any number, in reading order; leave out a stat with no value"),
      f("stats[].label", "text", "e.g. \"Goals\""),
      f("stats[].value", "text", "one figure or a few words, e.g. \"5\", \"86%\" or \"Norway\""),
      f("showStats", "boolean", "the server sets this"),
    ],
    params: [],
    build: c => ui.Stack({ axis: "v", gap: 12, children: [
      ui.Card({ padding: 0, gap: 0, children: [
        ui.Stack({ axis: "h", gap: 12, align: "center", paddingX: 16, paddingY: 12, children: [
          mark(c, 40, c.kind),
          ui.Stack({ axis: "v", gap: 0, children: [
            ui.Text({ content: c.name, role: "headline", weight: "semibold", lines: 2, align: "start" }),
            ui.Text({ content: c.detail, role: "footnote", ink: "secondary", lines: 2, align: "start" }),
          ] }),
        ] }),
        ui.Show({ when: c.rating.show, child: ui.Stack({ axis: "v", gap: 0, children: [
          ui.Divider({}),
          ui.Stack({ axis: "h", gap: 16, align: "center", paddingX: 16, paddingY: 16, children: [
            ui.Badge({ label: c.rating.value, tone: c.rating.tone, size: "large", fill: c.rating.fill, ink: c.rating.ink }),
            ui.Stack({ axis: "v", gap: 0, children: [
              ui.Text({ content: c.rating.label, role: "body", weight: "medium" }),
              ui.Text({ content: c.rating.caption, role: "footnote", ink: "secondary" }),
            ] }),
          ] }),
        ] }) }),
      ] }),
      ui.Show({ when: c.showStats, child: ui.Rail({ gap: 12, width: 124, children: each(c.stats, "s", (s: AnyRef) => ui.Card({ gap: 4, children: [
        ui.Text({ content: s.value, role: "headline", weight: "semibold", align: "start" }),
        ui.Text({ content: s.label, role: "footnote", ink: "secondary", align: "start" }),
      ] })) }) }),
    ] }),
  },
  {
    name: "TeamPoints",
    intent: "A team's points so far this season: the total and its rank, then a table splitting the record into home and away (played, won, drawn, lost, goals, goal difference, points).",
    useWhen: "how many points a team has, or its record this season, home and away; one team in one competition",
    source: "ui-canvas sports-components/team-points (from team-points-breakdown/table-reference)",
    contract: [
      f("subtitle", "text", "rank and matches played, e.g. \"Rank 1 · 9 played\""),
      f("points", "text", "total points as shown, e.g. \"27\""),
      ...venueRow("home"), ...venueRow("away"),
    ],
    params: [],
    build: t => ui.Card({ children: [
      ui.Stack({ axis: "h", gap: 16, align: "start", justify: "between", children: [
        ui.Stack({ axis: "v", gap: 0, children: [
          ui.Text({ content: "Points", role: "headline", weight: "semibold" }),
          ui.Text({ content: t.subtitle, role: "footnote", ink: "secondary", lines: 2, align: "start" }),
        ] }),
        ui.Text({ content: t.points, role: "title1", weight: "semibold", align: "end" }),
      ] }),
      ui.Stack({ axis: "v", gap: 12, children: [
        // Equal columns, because a Grid cannot size one wider: the venue is its name, with no icon.
        ui.Grid({ columns: "8", gap: 0, children: ["", "PL", "W", "D", "L", "+/-", "GD", "PTS"].map(content => ui.Text({ content, role: "footnote", ink: "secondary", align: "end" })) }),
        ui.Stack({ axis: "v", gap: 12, divided: true, children: [venueCells("Home", t.home), venueCells("Away", t.away)] }),
      ] }),
    ] }),
  },
  {
    name: "LeagueStanding",
    intent: "Where a team stands in the league table: its place as the hero, the points gap to the places around it, its row between its nearest two neighbours, and optionally its home and away record.",
    useWhen: "a team's position in the table, or how far it is from the teams around it; for the whole table use a list of rows instead",
    source: "ui-canvas sports-components/league-standing (from team-points-breakdown/rank-context)",
    contract: [
      f("place", "text", "the team's place as shown, e.g. \"13th\""),
      f("summary", "text", "points and gaps, e.g. \"9 points · 1 behind 12th, 1 ahead of 14th\"; for first place \"27 points · 5 clear of 2nd\""),
      f("rows", "list", "exactly three in table order: the team and its nearest two, one either side, or the two below it in first place and the two above it in last"),
      f("rows[].rank", "text", "the place, e.g. \"12\""),
      f("rows[].name", "text", "club name"),
      f("rows[].points", "text", "points as shown"),
      f("rows[].surface", "text", "\"filled\" for the team, \"none\" for the others"),
      f("rows[].ink", "ink", "\"primary\" for the team, \"secondary\" for the others"),
      f("rows[].weight", "text", "\"medium\" for the team, \"regular\" for the others"),
      f("home.detail", "text", "points and record at home, e.g. \"7 pts · 2-1-1\", from the schedule's venues; \"\" without them"),
      f("away.detail", "text", "the same away"),
      f("showVenues", "boolean", "whether to show home and away here; false when a TeamPoints record answers them, which is their primary place"),
    ],
    params: [],
    build: l => ui.Card({ children: [
      ui.Stack({ axis: "v", gap: 8, children: [
        ui.Text({ content: l.place, role: "display", weight: "semibold" }),
        ui.Text({ content: l.summary, role: "body", ink: "secondary", lines: 2, align: "start" }),
      ] }),
      ui.Stack({ axis: "v", gap: 0, children: each(l.rows, "r", (r: AnyRef) => ui.Card({ surface: r.surface, radius: "control", padding: 8, children: [
        ui.Stack({ axis: "h", gap: 12, align: "center", children: [
          ui.Text({ content: r.rank, role: "footnote", weight: r.weight, ink: r.ink }),
          ui.Stack({ axis: "v", gap: 0, children: [ui.Text({ content: r.name, role: "footnote", weight: r.weight, ink: r.ink, lines: 2, align: "start" })] }),
          ui.Text({ content: r.points, role: "footnote", weight: r.weight, ink: r.ink }),
        ] }),
      ] })) }),
      ui.Show({ when: l.showVenues, child: ui.Stack({ axis: "v", gap: 16, children: [
        ui.Divider({}),
        ui.Grid({ columns: "2", gap: 16, children: [venueDetail("house", "Home", l.home.detail), venueDetail("airplane", "Away", l.away.detail)] }),
      ] }) }),
    ] }),
  },
  {
    name: "MatchTopPlayers",
    intent: "The top players of one match from both clubs, side by side: each row a player from each side with an avatar carrying the metric's value at its top right and the club's crest at its bottom corner, then name and position.",
    useWhen: "the top scorers, top rated or other best players of one match, from both sides; not a ranking across matches, which is a Leaderboard",
    source: "ui-canvas sports-components/match-top-players (from the Fotmob match screen's Top rated card)",
    contract: [
      f("title", "text", "the card's name, e.g. \"Top scorers\""),
      f("metric", "text", "the one metric every value is, e.g. \"Goals\" or \"Rating\""),
      f("rows", "list", "as many as the request asks for per side, e.g. 1 or 3, otherwise 3; best first on each side, and only players the metric applies to, so a scorer has scored"),
      ...matchPlayer("rows[].home"), ...matchPlayer("rows[].away"),
    ],
    params: [],
    build: m => ui.Card({ children: [
      ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
        ui.Text({ content: m.title, role: "footnote", weight: "medium", ink: "secondary", lines: 2, align: "start" }),
        ui.Text({ content: m.metric, role: "footnote", weight: "medium", ink: "secondary" }),
      ] }),
      ui.Stack({ axis: "v", gap: 12, divided: true, children: each(m.rows, "r", (r: AnyRef) => ui.Grid({ columns: "2", gap: 16, children: [
        matchPlayerCell(r.home, "home"), matchPlayerCell(r.away, "away"),
      ] })) }),
    ] }),
  },
  {
    name: "PlayerValue",
    intent: "A player's market value over time: the current value, then a stepped line coloured by club with each club's crest above its stretch and prices on the y axis, no card; scrubbing shows the club, date and value.",
    useWhen: "a player's market value, or how it changed over time; the server builds the record",
    source: "ui-canvas sports-components/player-value, on FotMob marketValues, in the style of a Kalshi step chart",
    contract: [
      f("value", "text", "the current value, e.g. \"€97.7M\""),
      f("caption", "text", "e.g. \"Cole Palmer · Market value\""),
      f("segments", "list", "one per unbroken spell at a club, oldest first"),
      f("segments[].name", "text", "club name"),
      f("segments[].lineColor", "color", "the line and the club's name while scrubbing"),
      f("segments[].tagColor", "color", "the value tag behind white text"),
      f("segments[].logo", "text", "crest URL, or \"\""),
      f("segments[].points", "list", "the values in this spell, oldest first"),
      f("segments[].points[].x", "number", "time in milliseconds"),
      f("segments[].points[].label", "text", "the date as shown, e.g. \"Nov 2026\""),
      f("segments[].points[].value", "number", "the value in euros"),
      f("segments[].points[].display", "text", "the value as shown, e.g. \"€97.7M\""),
      f("ticks", "list", "the y axis's labels, from zero up"),
      f("ticks[].value", "number", "the value in euros"),
      f("ticks[].display", "text", "the label, e.g. \"€50M\""),
    ],
    params: [],
    build: t => ui.StepTimeline({ value: t.value, segments: t.segments, ticks: t.ticks, caption: t.caption }),
  },
  {
    name: "SeasonPodium",
    intent: "How a league's season ended: the winner, 2nd and 3rd in podium order (2, 1, 3), each a place numeral in gold, silver or bronze, a club avatar scaled by place and the club's name.",
    useWhen: "who won a league and who came 2nd and 3rd in a finished season; not a season still in progress, where a table or LeagueStanding says what is true so far",
    source: "ui-canvas sports-components/season-podium (from Figma Kino Screens 225:2579)",
    contract: [
      ...podiumPlace("first", "\"#E6B422\" (gold)"),
      ...podiumPlace("second", "\"#C0C4CC\" (silver)"),
      ...podiumPlace("third", "\"#CD7F32\" (bronze)"),
    ],
    params: [],
    build: p => ui.Stack({ axis: "h", gap: 12, align: "end", children: [
      podiumColumn(p.second, "2", 56, "title2", false),
      podiumColumn(p.first, "1", 80, "title1", true),
      podiumColumn(p.third, "3", 40, "title2", false),
    ] }),
  },
];

/** Up to 20 results sit 10 to a row. Past that the columns grow, keeping two rows, so the squares shrink and every result fits one card. */
export const heatmapColumns = (results: number) => String(Math.min(24, Math.max(10, Math.ceil(results / 2))));

/** The heatmap's grid follows its result count, whatever the schema stage wrote. */
export function fitHeatmaps<T extends { readonly values: Record<string, unknown>; readonly fields: readonly { readonly path: string; readonly kind: string; readonly format: string }[] }>(dataset: T): T {
  const answers = dataset.values.answers;
  if (!isObject(answers)) return dataset;
  const paths = new Set(dataset.fields.map(field => field.path));
  const added: string[] = [];
  const fit = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) return value.map(item => fit(item, `${path}[]`));
    if (!isObject(value)) return value;
    const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, fit(child, `${path}.${key}`)]));
    if (!("caption" in value && "summary" in value && Array.isArray(value.results))) return result;
    if (!paths.has(`${path}.columns`)) added.push(`${path}.columns`);
    return { ...result, columns: heatmapColumns(value.results.length) };
  };
  const values = { ...dataset.values, answers: fit(answers, "answers") };
  return { ...dataset, values, fields: [...dataset.fields, ...added.map(path => ({ path, kind: "text", format: "none" }))] };
}

/**
 * One place answers each fact. TeamPoints is the primary place for home and away, so a LeagueStanding
 * on the same screen leaves them out, whatever the schema stage decided, as it does with nothing to show.
 */
export function settleVenues<T extends { readonly values: Record<string, unknown>; readonly fields: readonly { readonly path: string; readonly kind: string; readonly format: string }[] }>(dataset: T): T {
  const answers = dataset.values.answers;
  if (!isObject(answers)) return dataset;
  const hasPoints = Object.values(answers).some(answer => placements(answer).some(p => p.component.name === "TeamPoints" && !p.list));
  const added: string[] = [];
  const paths = new Set(dataset.fields.map(field => field.path));
  const hasDetail = (venue: unknown) => isObject(venue) && typeof venue.detail === "string" && venue.detail !== "";
  const settle = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) return value.map(item => settle(item, `${path}[]`));
    if (!isObject(value)) return value;
    const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, settle(child, `${path}.${key}`)]));
    if (!("place" in value && Array.isArray(value.rows) && "home" in value && "away" in value)) return result;
    if (!paths.has(`${path}.showVenues`)) added.push(`${path}.showVenues`);
    return { ...result, showVenues: !hasPoints && hasDetail(value.home) && hasDetail(value.away) };
  };
  const values = { ...dataset.values, answers: settle(answers, "answers") };
  return { ...dataset, values, fields: [...dataset.fields, ...added.map(path => ({ path, kind: "boolean", format: "none" }))] };
}

/** Fields that say what an answer is, not what it answers: never treated as a repeated fact. */
const MISSING_VALUE = /^(?:[—–-]|n\/?a|none|null|unknown|tbd)?$/i;
const isMissing = (value: unknown) => value === null || value === undefined || (typeof value === "string" && MISSING_VALUE.test(value.trim()));

/**
 * Data a source doesn't have never reaches the screen: a stat or a ranking row with no value goes,
 * and a StatsCard's rating and rail are shown only when they have something to show.
 */
export function settleMissing<T extends { readonly values: Record<string, unknown>; readonly fields: readonly { readonly path: string; readonly kind: string; readonly format: string }[] }>(dataset: T): T {
  const fields = new Map(dataset.fields.map(field => [field.path, field]));
  const add = (path: string, kind: string) => { if (!fields.has(path)) fields.set(path, { path, kind, format: "none" }); };
  const walk = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) return value.map(item => walk(item, `${path}[]`));
    if (!isObject(value)) return value;
    const record: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child, `${path}.${key}`)]));
    if (Array.isArray(record.entries) && "metric" in record) record.entries = record.entries.filter(entry => !isObject(entry) || !isMissing(entry.value));
    if (typeof record.name !== "string" || !Array.isArray(record.stats)) return record;
    const stats = record.stats.filter(stat => isObject(stat) && !isMissing(stat.value));
    const rating = isObject(record.rating) ? record.rating : {};
    for (const key of ["value", "tone", "fill", "ink", "label", "caption"]) add(`${path}.rating.${key}`, "text");
    add(`${path}.rating.show`, "boolean");
    add(`${path}.showStats`, "boolean");
    add(`${path}.detail`, "text");
    add(`${path}.stats[].label`, "text");
    add(`${path}.stats[].value`, "text");
    return { ...record, detail: typeof record.detail === "string" ? record.detail : "", stats, showStats: stats.length > 0,
      rating: { value: "", tone: "neutral", fill: "none", ink: "ink.secondary", label: "", caption: "", ...rating, show: !isMissing(rating.value) } };
  };
  return { ...dataset, values: { ...dataset.values, answers: walk(dataset.values.answers, "answers") }, fields: [...fields.values()] };
}

const ANSWER_FRAME = new Set(["status", "question", "title", "summary", "note", "source", "asOf", "team"]);

/**
 * Every fact is locked to one place before the writer sees the data, so no card can show it twice:
 * - the same record in two places stays in the first;
 * - TeamPoints owns the season's points and record, so heatmaps that together cover the same whole
 *   season go (a heatmap of part of it, such as the last five, says something else and stays);
 * - LeagueStanding owns the team's place, so TeamPoints drops its rank;
 * - a player's first StatsCard owns its rating and stats.
 * Returns what it removed, for the trace.
 */
export function lockFacts<T extends { readonly values: Record<string, unknown>; readonly fields: readonly { readonly path: string; readonly kind: string; readonly format: string }[] }>(dataset: T): { dataset: T; removed: { path: string; reason: string }[] } {
  if (!isObject(dataset.values.answers)) return { dataset, removed: [] };
  const answers = structuredClone(dataset.values.answers) as Record<string, Record<string, unknown>>;
  const removed: { path: string; reason: string }[] = [];
  const at = (id: string, keys: readonly string[]) => keys.reduce<unknown>((value, key) => isObject(value) ? value[key] : undefined, answers[id]);
  const drop = (id: string, keys: readonly string[], reason: string) => {
    const parent = at(id, keys.slice(0, -1));
    if (isObject(parent)) delete parent[keys.at(-1)!];
    removed.push({ path: ["answers", id, ...keys].join("."), reason });
  };

  const seen = new Map<string, string>();
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted) : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
  for (const [id, answer] of Object.entries(answers)) {
    if (!isObject(answer)) continue;
    for (const [key, value] of Object.entries(answer)) {
      if (ANSWER_FRAME.has(key) || !value || typeof value !== "object") continue;
      const print = JSON.stringify(sorted(value));
      const first = seen.get(print);
      if (first) drop(id, [key], `the same data as ${first}`); else seen.set(print, `answers.${id}.${key}`);
    }
  }

  const found = (name: string) => Object.entries(answers).flatMap(([id, answer]) => placements(answer).filter(p => p.component.name === name && !p.list).map(p => ({ id, keys: p.keys })));
  // A player's second card shows only what the first doesn't; with nothing left, it goes.
  const shown = new Map<string, Set<string>>();
  for (const { id, keys } of found("StatsCard")) {
    const card = at(id, keys) as Record<string, unknown> & { rating: Record<string, unknown>; stats: Record<string, unknown>[] };
    const name = String(card.name).toLowerCase();
    const first = !shown.has(name);
    const facts = shown.get(name) ?? new Set<string>();
    shown.set(name, facts);
    const fact = (label: unknown, value: unknown) => `${String(label).toLowerCase()}=${String(value)}`;
    if (card.rating.show && facts.has(fact(card.rating.label, card.rating.value))) { card.rating.show = false; removed.push({ path: ["answers", id, ...keys, "rating"].join("."), reason: "the first card already shows this rating" }); }
    const kept = card.stats.filter(stat => !facts.has(fact(stat.label, stat.value)));
    if (kept.length < card.stats.length) removed.push({ path: ["answers", id, ...keys, "stats"].join("."), reason: "the first card already shows these stats" });
    card.stats = kept;
    card.showStats = kept.length > 0;
    if (card.rating.show) facts.add(fact(card.rating.label, card.rating.value));
    for (const stat of kept) facts.add(fact(stat.label, stat.value));
    if (!first && !card.rating.show && !kept.length) drop(id, keys, "the first card already shows everything in this one");
  }
  const points = found("TeamPoints");
  if (points.length) {
    const playedAt = (venue: unknown) => isObject(venue) ? Number(venue.played) || 0 : 0;
    const card = at(points[0]!.id, points[0]!.keys) as Record<string, unknown>;
    const season = playedAt(card.home) + playedAt(card.away);
    const heatmaps = found("FixturesHeatmap");
    const played = (results: unknown) => Array.isArray(results) ? results.filter(r => !(isObject(r) && r.label === "Upcoming")).length : 0;
    const covered = heatmaps.reduce((sum, { id, keys }) => sum + played((at(id, keys) as Record<string, unknown>).results), 0);
    if (season > 0 && covered >= season) for (const { id, keys } of heatmaps) drop(id, keys, "TeamPoints already shows this season's points and record");
  }
  if (found("LeagueStanding").length) {
    for (const { id, keys } of points) {
      const card = at(id, keys) as Record<string, unknown>;
      if (typeof card.subtitle !== "string") continue;
      const subtitle = card.subtitle.replace(/^Rank \d+\s*·\s*/, "");
      if (subtitle !== card.subtitle) { card.subtitle = subtitle; removed.push({ path: ["answers", id, ...keys, "subtitle"].join("."), reason: "LeagueStanding already shows the place" }); }
    }
  }

  const gone = removed.filter(r => !/\.(?:subtitle|rating|stats)$/.test(r.path)).map(r => r.path);
  const fields = dataset.fields.filter(field => !gone.some(path => field.path === path || field.path.startsWith(`${path}.`) || field.path.startsWith(`${path}[`)));
  return { dataset: { ...dataset, values: { ...dataset.values, answers }, fields }, removed };
}

export const COMPONENT_BY_NAME: ReadonlyMap<string, SportsComponent> = new Map(SPORTS_COMPONENTS.map(c => [c.name, c]));

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Whether `value` carries every field of the contract (lists checked on their first item). */
export function fits(component: SportsComponent, value: unknown): boolean {
  if (!isObject(value)) return false;
  return component.contract.every(field => {
    let current: unknown[] = [value];
    for (const segment of field.path.split(".")) {
      const key = segment.replace(/\[\]$/, "");
      current = current.flatMap(v => (isObject(v) && key in v ? [v[key]] : []));
      if (!current.length) return false;
      if (segment.endsWith("[]")) current = current.flatMap(v => (Array.isArray(v) ? v.slice(0, 1) : []));
      if (segment.endsWith("[]") && !current.length) return true; // an empty list fits
    }
    return current.length > 0;
  });
}

export interface Placement {
  readonly component: SportsComponent;
  /** Keys from the answer to the record or list. */
  readonly keys: readonly string[];
  /** A list whose items fit (called through @Each). */
  readonly list: boolean;
}

/** Where components fit inside an answer: a record that fits, or a list whose items fit. */
export function placements(answer: unknown): Placement[] {
  const found: Placement[] = [];
  const walk = (value: unknown, keys: string[], depth: number) => {
    if (depth > 3) return;
    if (Array.isArray(value)) {
      const first = value.find(isObject);
      if (first) for (const component of SPORTS_COMPONENTS) if (fits(component, first)) found.push({ component, keys, list: true });
      return;
    }
    if (!isObject(value)) return;
    if (keys.length) for (const component of SPORTS_COMPONENTS) if (fits(component, value)) found.push({ component, keys, list: false });
    for (const [key, child] of Object.entries(value)) walk(child, [...keys, key], depth + 1);
  };
  walk(answer, [], 0);
  // A component whose contract another one at the same place extends (TeamDetail inside StatsCard) would show less of it.
  const paths = (p: Placement) => new Set(p.component.contract.map(f => f.path));
  return found.filter(p => !found.some(q => q !== p && q.list === p.list && q.keys.join(".") === p.keys.join(".")
    && q.component.contract.length > p.component.contract.length && [...paths(p)].every(path => paths(q).has(path))));
}

/** A placement as the writer would call it, e.g. `@Each(d.answers.q1.matches, "x", MatchCard(x))`. */
export const placementCall = (p: Placement, base: string) => {
  const path = [base, ...p.keys].join(".");
  return p.list ? `@Each(${path}, "x", ${p.component.name}(x))` : `${p.component.name}(${path})`;
};

/** The writer's view: one signature line per component. */
export const COMPONENT_SIGNATURES = SPORTS_COMPONENTS.map(c =>
  `${c.name}(record) · ${c.intent} Use for ${c.useWhen}. Reads: ${c.contract.map(x => x.path).join(", ")}.`).join("\n");

/** The schema stage's view: each contract with its notes. */
export const COMPONENT_CONTRACTS = SPORTS_COMPONENTS.map(c =>
  `${c.name}: ${c.intent} Use for ${c.useWhen}.\n${c.contract.map(x => `  ${x.path} (${x.kind}): ${x.note}`).join("\n")}`).join("\n\n");

/** The index as clients and reviewers read it (catalog/openui/sports-components.json). */
export const componentIndex = () => ({
  version: 1,
  components: SPORTS_COMPONENTS.map(({ build: _build, ...entry }) => entry),
});
