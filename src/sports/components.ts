import { each, ui, type Node } from "../lang/program.js";

/**
 * The Sports component index: the sports components as server templates. Each entry says what it is for, when to use it, and the exact data contract it
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
  readonly contract: readonly ContractField[];
  /** Optional copy arguments after the data reference. */
  readonly params: readonly { readonly name: string; readonly note: string }[];
  readonly build: (data: AnyRef, args: readonly (string | null)[]) => Node;
}

const f = (path: string, kind: ContractField["kind"], note: string): ContractField => ({ path, kind, note });
const CLUB_COLOR = "\"clear\" for a club with a logo, so its crest has no fill; else the club's colour \"#rrggbb\" from d.clubs, or \"\"";
const team = (prefix: string): ContractField[] => [
  f(`${prefix}.name`, "text", "team name"),
  f(`${prefix}.logo`, "text", "logo URL, or \"\""),
  f(`${prefix}.color`, "color", CLUB_COLOR),
  f(`${prefix}.score`, "text", "the score as text (\"2\"), \"\" before the start"),
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
  ui.Text({ content: label, role: "footnote", weight: "medium", lines: 1, align: "start" }),
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
  f(`${prefix}.name`, "text", "team name"),
  f(`${prefix}.logo`, "text", "logo URL, or \"\""),
  f(`${prefix}.color`, "color", CLUB_COLOR),
  f(`${prefix}.medal`, "color", `always ${medal}: the place's colour, which a template cannot hold itself`),
];

/**
 * An injured player as the record carries it. The schema stage fills the data; the server fills
 * `detail`, `badge`, `wait`, `line` and `sourceLine` from it (settleInjuries), because a template
 * cannot count days or map a league's wording.
 */
const injuredPlayer = (prefix: string): ContractField[] => [
  f(`${prefix}name`, "text", "the player's full name"),
  f(`${prefix}kind`, "text", "\"player\""),
  f(`${prefix}position`, "text", "position as the data gives it, e.g. \"RB\" or \"Forward\""),
  f(`${prefix}team`, "text", "the player's team, e.g. \"Cardinals\" or \"Chelsea\""),
  f(`${prefix}logo`, "text", "photo URL, or \"\""),
  f(`${prefix}color`, "color", "their team's colour \"#rrggbb\" from d.clubs, or \"\""),
  f(`${prefix}status`, "text", "the league's status as the data writes it, e.g. \"Injured Reserve\", \"Questionable\", \"Day-To-Day\"; \"\" when there is none, as in most soccer reports"),
  f(`${prefix}returnDate`, "text", "the expected return as \"YYYY-MM-DD\", or \"\" when no date is given or the player is out for the season"),
  f(`${prefix}returnNote`, "text", "what stands in for a missing date, e.g. \"Out for season\" or \"Mid-January 2027\"; \"\" otherwise"),
  f(`${prefix}source`, "text", "who reported it, e.g. \"The Athletic\" or \"Cardinals' official site\"; \"\" when the data names no one"),
  f(`${prefix}detail`, "text", "the server sets this"),
  f(`${prefix}badge.label`, "text", "the server sets this"),
  f(`${prefix}badge.tone`, "tone", "the server sets this"),
  f(`${prefix}badge.show`, "boolean", "the server sets this"),
  f(`${prefix}wait.label`, "text", "the server sets this"),
  f(`${prefix}wait.value`, "text", "the server sets this"),
  f(`${prefix}wait.day`, "text", "the server sets this"),
  f(`${prefix}wait.dated`, "boolean", "the server sets this"),
  f(`${prefix}wait.undated`, "boolean", "the server sets this"),
  f(`${prefix}line`, "text", "the server sets this"),
  f(`${prefix}sourceLine`, "text", "the server sets this"),
];

/** The photo on the team colour, with a band-aid at its bottom right. */
const injuredAvatar = (p: AnyRef, size: 40 | 56) => ui.Avatar({ name: p.name, size, image: p.logo, color: p.color, kind: p.kind, mark: "bandage.fill", markTone: "bad" });

/** Avatar, name and a detail line, then the league's badge when there is one. */
const injuryTop = (p: AnyRef, size: 40 | 56, detail: AnyRef) => ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
  ui.Stack({ axis: "h", gap: 12, align: "center", children: [
    injuredAvatar(p, size),
    ui.Stack({ axis: "v", gap: 0, children: [
      ui.Text({ content: p.name, role: "headline", weight: "semibold", lines: 1, align: "start" }),
      ui.Text({ content: detail, role: "footnote", ink: "secondary", lines: 1, align: "start" }),
    ] }),
  ] }),
  ui.Show({ when: p.badge.show, child: ui.Badge({ label: p.badge.label, tone: p.badge.tone }) }),
] });

/** A list element: the row at 40, then "Back Nov 8 · source" under the name (40 + 12 in). */
const injuryRow = (p: AnyRef) => ui.Stack({ axis: "v", gap: 4, children: [
  injuryTop(p, 40, p.detail),
  ui.Stack({ axis: "h", gap: 12, children: [
    ui.Spacer({ size: 40 }),
    ui.Stack({ axis: "h", gap: 4, children: [
      ui.Text({ content: p.line, role: "footnote", weight: "medium", lines: 1 }),
      ui.Text({ content: p.sourceLine, role: "footnote", ink: "secondary", lines: 1, align: "start" }),
    ] }),
  ] }),
] });

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
    intent: "One game between two teams: both teams on stacked rows with their scores, a side column (date and start time, or a status such as FT or Final), and one details line.",
    useWhen: "a fixture or a result; a list of matches (@Each over them); the latest meeting between two clubs",
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
    intent: "A team on one line: logo or monogram, name, and a short secondary line (nickname, code or league).",
    useWhen: "naming the clubs a screen is about, above stats or a comparison",
    contract: [f("name", "text", "club name"), f("logo", "text", "logo URL, or \"\""), f("color", "color", CLUB_COLOR), f("detail", "text", "nickname, code or league, or \"\"")],
    params: [],
    build: t => ui.Row({ title: t.name, subtitle: t.detail, leading: mark(t, 40) }),
  },
  {
    name: "StatBar",
    intent: "One stat between two teams: each side's figure at its edge, the stat's name between them, and a bar split in proportion.",
    useWhen: "comparing two clubs on a stat (possession, shots, shots on target, corners, goals); stack several in a vertical Stack, no card",
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
    intent: "A team's run of fixtures: a headline figure, a caption saying what it is, one square per fixture in result colours, and the record.",
    useWhen: "form, a season so far, a run of results; no title of its own",
    contract: [
      f("value", "text", "the headline figure, e.g. points per game \"1.6\", \"13 pts\" or a record \"6-2\""),
      f("caption", "text", "what the figure is, e.g. \"Points per game · Premier League 2026/27\""),
      f("results", "list", "one per fixture, oldest first, every fixture of the run however many: a season is one record, never split"),
      f("results[].label", "text", "spoken result, e.g. \"Win\", \"Draw\", \"Tie\", \"Loss\" or \"Upcoming\"; not visible in the square"),
      f("results[].fill", "text", "win \"tone.good.fg\", loss \"tone.bad.fg\", draw or tie \"outline.control\", upcoming \"surface.filled\""),
      f("summary", "text", "e.g. \"4 won · 1 drawn · 3 lost\" or \"6-2\""),
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
    intent: "A player's or a club's stats: a short card with the logo, name and a detail line, the rating in its bracket colour when there is one, then a scroll rail of small cards, one per stat, value over label, each as wide as its content and at least 124. A part with no data is not shown.",
    useWhen: "a player's or a club's season or match stats; any set of figures about one subject",
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
      ui.Show({ when: c.showStats, child: ui.Rail({ gap: 12, minWidth: 124, children: each(c.stats, "s", (s: AnyRef) => ui.Card({ gap: 4, children: [
        ui.Text({ content: s.value, role: "headline", weight: "semibold", align: "start" }),
        ui.Text({ content: s.label, role: "footnote", ink: "secondary", align: "start" }),
      ] })) }) }),
    ] }),
  },
  {
    name: "TeamPoints",
    intent: "A team's points so far this season: the total and its rank, then a table splitting the record into home and away (played, won, drawn, lost, goals, goal difference, points).",
    useWhen: "how many points a team has, or its record this season, home and away; one team in one competition",
    contract: [
      f("title", "text", "a heading for this comparison, e.g. \"Home and away\" or \"League record\"; not a fixed competition abbreviation"),
      f("subtitle", "text", "rank and matches played, e.g. \"Rank 1 · 9 played\""),
      f("points", "text", "total points as shown, e.g. \"27\""),
      ...venueRow("home"), ...venueRow("away"),
    ],
    params: [],
    build: t => ui.Card({ children: [
      ui.Stack({ axis: "h", gap: 16, align: "start", justify: "between", children: [
        ui.Stack({ axis: "v", gap: 0, children: [
          ui.Text({ content: t.title, role: "headline", weight: "semibold", lines: 2, align: "start" }),
          ui.Text({ content: t.subtitle, role: "footnote", ink: "secondary", lines: 2, align: "start" }),
        ] }),
        ui.Text({ content: t.points, role: "title1", weight: "semibold", align: "end" }),
      ] }),
      ui.Stack({ axis: "v", gap: 12, children: [
        // Equal columns, because a Grid cannot size one wider: the venue is its name, with no icon.
        ui.Grid({ columns: "8", gap: 0, children: [ui.Spacer({ size: 0 }), ...["Pld", "W", "D", "L", "+/-", "GD", "PTS"].map(content => ui.Text({ content, role: "footnote", ink: "secondary", align: "end" }))] }),
        ui.Stack({ axis: "v", gap: 12, divided: true, children: [venueCells("Home", t.home), venueCells("Away", t.away)] }),
      ] }),
    ] }),
  },
  {
    name: "LeagueStanding",
    intent: "Where a team stands in the league table: its place as the hero, the points gap to the places around it, its row between its nearest two neighbours, and optionally its home and away record.",
    useWhen: "a team's position in the table, or how far it is from the teams around it; for the whole table use a list of rows instead",
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
    intent: "The top players of one game from both teams, side by side: each row a player from each side with an avatar carrying the metric's value at its top right and the club's crest at its bottom corner, then name and position.",
    useWhen: "the top scorers, top rated or other best players of one match, from both sides; not a ranking across matches, which is a Leaderboard",
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
  {
    name: "RecordTable",
    intent: "A table whose columns come from the data: a title, a row of column labels, then each row's name above its figures.",
    useWhen: "a box score, a team's record split, standings or a game log, where the columns depend on the sport",
    contract: [
      f("title", "text", "what the table shows, e.g. \"Passing\" or \"AFC West\""),
      f("columnCount", "text", "\"5\"; the server sets it from the columns"),
      f("columns", "list", "at most 7, in the order the cells follow"),
      f("columns[].label", "text", "a short column label as the source writes it, e.g. \"YDS\" or \"W-L\""),
      f("rows", "list", "one per player, team or game"),
      f("rows[].label", "text", "whose figures these are, e.g. \"Patrick Mahomes\" or \"@ DET · W 112-106\""),
      f("rows[].cells", "list", "one per column, in the same order"),
      f("rows[].cells[].value", "text", "the figure as the source writes it, e.g. \"20/32\", or \"\""),
    ],
    params: [],
    build: t => ui.Card({ children: [
      ui.Text({ content: t.title, role: "headline", weight: "semibold" }),
      ui.Stack({ axis: "v", gap: 12, children: [
        ui.Grid({ columns: t.columnCount, gap: 4, children: each(t.columns, "c", (c: AnyRef) => ui.Text({ content: c.label, role: "footnote", ink: "secondary", lines: 1 })) }),
        ui.Stack({ axis: "v", gap: 12, divided: true, children: each(t.rows, "r", (r: AnyRef) => ui.Stack({ axis: "v", gap: 4, children: [
          ui.Text({ content: r.label, role: "body", weight: "medium", lines: 2, align: "start" }),
          ui.Grid({ columns: t.columnCount, gap: 4, children: each(r.cells, "v", (v: AnyRef) => ui.Text({ content: v.value, role: "footnote", lines: 1 })) }),
        ] })) }),
      ] }),
    ] }),
  },
  {
    name: "InjuryReport",
    intent: "One injured player on a card: photo with a band-aid, name and position, the league's status badge when there is one, then how long until they are back, with the date and the source on the right.",
    useWhen: "one injured player, or a few as separate cards: are they hurt, when are they back, who says so; for a team's or a league's report use InjuryList",
    contract: injuredPlayer(""),
    params: [],
    build: p => ui.Card({ gap: 12, children: [
      injuryTop(p, 56, p.position),
      ui.Divider({}),
      ui.Stack({ axis: "h", gap: 12, align: "end", justify: "between", children: [
        ui.Stack({ axis: "v", gap: 0, children: [
          ui.Show({ when: p.wait.dated, child: ui.Stack({ axis: "v", gap: 0, children: [
            ui.Text({ content: p.wait.label, role: "footnote", ink: "secondary" }),
            ui.Text({ content: p.wait.value, role: "headline", weight: "semibold" }),
          ] }) }),
          ui.Show({ when: p.wait.undated, child: ui.Text({ content: p.wait.value, role: "footnote", ink: "secondary" }) }),
        ] }),
        ui.Stack({ axis: "v", gap: 0, align: "end", children: [
          ui.Text({ content: p.wait.day, role: "footnote", ink: "secondary", align: "end" }),
          ui.Text({ content: p.source, role: "footnote", ink: "secondary", lines: 1, align: "end" }),
        ] }),
      ] }),
    ] }),
  },
  {
    name: "InjuryList",
    intent: "An injury report as a list with no card: one row per player (photo with a band-aid, name, position · team, status badge), then the return and the source under the name.",
    useWhen: "a team's or a league's injured players, any number, in the order the data gives them",
    contract: [
      f("title", "text", "what the list is, e.g. \"Cardinals injuries\", or \"\""),
      f("showTitle", "boolean", "the server sets this"),
      f("players", "list", "the injured players, at most 30"),
      ...injuredPlayer("players[]."),
    ],
    params: [],
    build: l => ui.Stack({ axis: "v", gap: 12, children: [
      ui.Show({ when: l.showTitle, child: ui.Text({ content: l.title, role: "footnote", weight: "medium", ink: "secondary", lines: 2, align: "start" }) }),
      ui.Stack({ axis: "v", gap: 12, divided: true, children: each(l.players, "p", (p: AnyRef) => injuryRow(p)) }),
    ] }),
  },
];

/** A soccer match's figures as StatBars, in reading order; for these, fewer is better. */
const MATCH_STATS: readonly { key: string; label: string; percent?: boolean; fewerIsBetter?: boolean }[] = [
  { key: "possession", label: "Possession", percent: true }, { key: "shots", label: "Shots" }, { key: "shotsOnTarget", label: "Shots on target" },
  { key: "corners", label: "Corners" }, { key: "saves", label: "Saves" }, { key: "fouls", label: "Fouls", fewerIsBetter: true },
  { key: "yellowCards", label: "Yellow cards", fewerIsBetter: true }, { key: "redCards", label: "Red cards", fewerIsBetter: true },
];

/**
 * A match's two stat objects (`teamStats`, `opponentStats`) as one StatBar record per stat, home then
 * away, each side in its club's colour, so every stat gets its bar and nothing shows twice. A stat
 * either side lacks is left out. Values without a match and both stat objects pass through.
 */
export function withStatBars(values: Record<string, unknown>): Record<string, unknown> {
  const { match, teamStats, opponentStats, ...rest } = values;
  if (!isObject(match) || !isObject(teamStats) || !isObject(opponentStats) || !isObject(match.home) || !isObject(match.away)) return values;
  const [homeStats, awayStats] = match.venueSide === "away" ? [opponentStats, teamStats] : [teamStats, opponentStats];
  const hexOf = (value: unknown) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "");
  const side = (club: Record<string, unknown>, count: number, ahead: boolean) => ({ label: String(club.name ?? ""), count, tone: ahead ? "good" : "neutral", color: hexOf(club.color) });
  const statBars = MATCH_STATS.flatMap(({ key, label, percent, fewerIsBetter }) => {
    const [home, away] = [homeStats[key], awayStats[key]];
    if (typeof home !== "number" || typeof away !== "number") return [];
    const shown = (value: number) => (percent ? `${Math.round(value * 10) / 10}%` : String(value));
    const homeAhead = home !== away && (home > away) !== Boolean(fewerIsBetter);
    const awayAhead = home !== away && !homeAhead;
    return [{ label, homeDisplay: shown(home), awayDisplay: shown(away), sides: [side(match.home as Record<string, unknown>, home, homeAhead), side(match.away as Record<string, unknown>, away, awayAhead)] }];
  });
  return { ...rest, match, statBars };
}

/** A league's wording for a status, as the badge says it, and how bad it is. */
const STATUS_BADGES: Record<string, { label: string; tone: string }> = {
  "injured reserve": { label: "IR", tone: "bad" }, ir: { label: "IR", tone: "bad" },
  "physically unable to perform": { label: "PUP", tone: "bad" }, pup: { label: "PUP", tone: "bad" },
  out: { label: "Out", tone: "bad" }, suspension: { label: "Suspended", tone: "bad" }, suspended: { label: "Suspended", tone: "bad" },
  doubtful: { label: "Doubtful", tone: "warn" }, questionable: { label: "Questionable", tone: "warn" },
  "day-to-day": { label: "Day-to-day", tone: "warn" }, probable: { label: "Probable", tone: "neutral" },
};

const DAY = 86_400_000;
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** The wait until `returnDate`, counted in whole days from `today` (UTC). A past or unreadable date is no date. */
export function injuryWait(record: { returnDate?: unknown; returnNote?: unknown }, today: Date) {
  const note = typeof record.returnNote === "string" ? record.returnNote.trim() : "";
  const iso = typeof record.returnDate === "string" ? record.returnDate.trim().slice(0, 10) : "";
  const back = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T00:00:00Z`) : NaN;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((back - start) / DAY);
  if (!Number.isFinite(days) || days < 0) {
    const value = note || "No return date";
    return { wait: { label: "", value, day: "", dated: false, undated: true }, line: value };
  }
  const when = new Date(back);
  const [label, value] = days === 0 ? ["Back", "Today"] : days === 1 ? ["Back", "Tomorrow"] : ["Back in", `${days} days`];
  return { wait: { label, value, day: longDate.format(when), dated: true, undated: false }, line: `Back ${shortDate.format(when)}` };
}

/** A title's words, lower case, without plurals or filler: "Chiefs injury report" and "Chiefs injuries" say the same. */
const TITLE_FILLER = new Set(["the", "a", "an", "of", "for", "and", "report", "list", "overview", "summary"]);
const titleWords = (title: string) => new Set(title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
  .filter(word => word && !TITLE_FILLER.has(word)).map(word => word.replace(/ies$/, "y").replace(/s$/, "")));

/** Whether two titles say the same thing, so a screen shows only one of them. */
export function sameTitle(a: string, b: string): boolean {
  const left = titleWords(a);
  const right = titleWords(b);
  return left.size > 0 && left.size === right.size && [...left].every(word => right.has(word));
}

/**
 * Fills what an injured player's templates show and cannot work out: "position · team", the badge
 * from the league's wording, the wait from the date, and the list row's bottom line. A list title
 * that repeats its answer's title is hidden: each text on a screen says something new.
 */
export function settleInjuries<T extends { readonly values: Record<string, unknown>; readonly fields: readonly { readonly path: string; readonly kind: string; readonly format: string }[] }>(dataset: T, today = new Date()): T {
  const fields = new Map(dataset.fields.map(field => [field.path, field]));
  const add = (path: string, kind: string) => { if (!fields.has(path)) fields.set(path, { path, kind, format: "none" }); };
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const walk = (value: unknown, path: string, heading = ""): unknown => {
    if (Array.isArray(value)) return value.map(item => walk(item, `${path}[]`, heading));
    if (!isObject(value)) return value;
    // An answer's own title is the heading its parts must not repeat.
    const own = /^answers\.[^.]+$/.test(path) ? text(value.title) : heading;
    const record: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child, `${path}.${key}`, own)]));
    if (Array.isArray(record.players) && "title" in record) {
      record.showTitle = text(record.title) !== "" && !sameTitle(text(record.title), own);
      add(`${path}.showTitle`, "boolean");
    }
    if (typeof record.name !== "string" || !("returnDate" in record) || !("status" in record)) return record;
    const status = text(record.status);
    const badge = STATUS_BADGES[status.toLowerCase()] ?? { label: status, tone: "neutral" };
    const source = text(record.source);
    const { wait, line } = injuryWait(record, today);
    for (const key of ["detail", "badge.label", "wait.label", "wait.value", "wait.day", "line", "sourceLine"]) add(`${path}.${key}`, "text");
    for (const key of ["badge.show", "wait.dated", "wait.undated"]) add(`${path}.${key}`, "boolean");
    add(`${path}.badge.tone`, "text");
    return { ...record, detail: [text(record.position), text(record.team)].filter(Boolean).join(" · "),
      badge: { ...badge, show: status !== "" }, wait, line, sourceLine: source ? `· ${source}` : "" };
  };
  return { ...dataset, values: { ...dataset.values, answers: walk(dataset.values.answers, "answers") }, fields: [...fields.values()] };
}

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
    // A RecordTable's columns follow its data the same way, up to what fits a phone.
    if (Array.isArray(value.columns) && Array.isArray(value.rows) && "columnCount" in value) {
      const columns = value.columns.slice(0, RECORD_TABLE_COLUMNS);
      const rows = value.rows.map(row => (isObject(row) && Array.isArray(row.cells) ? { ...row, cells: row.cells.slice(0, columns.length) } : row));
      return { ...result, columns, rows, columnCount: String(columns.length || 1) };
    }
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

const RECORD_TABLE_COLUMNS = 7;

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

/** Soccer's own components: their shape is its points table, its market values or its final table. */
const SOCCER_ONLY = new Set(["TeamPoints", "PlayerValue", "SeasonPodium"]);
/** Drawn for leagues whose figures have no fixed columns. */
const TEAM_SPORT_ONLY = new Set(["RecordTable"]);

/** The writer's view: one signature line per component. */
export const COMPONENT_SIGNATURES = SPORTS_COMPONENTS.map(c =>
  `${c.name}(record) · ${c.intent} Use for ${c.useWhen}. Reads: ${c.contract.map(x => x.path).join(", ")}.`).join("\n");

/** The schema stage's view: each contract with its notes. */
export const contractsFor = (hasSoccer: boolean, hasTeamSports: boolean) => SPORTS_COMPONENTS
  .filter(c => (hasSoccer || !SOCCER_ONLY.has(c.name)) && (hasTeamSports || !TEAM_SPORT_ONLY.has(c.name)))
  .map(c => `${c.name}: ${c.intent} Use for ${c.useWhen}.\n${c.contract.map(x => `  ${x.path} (${x.kind}): ${x.note}`).join("\n")}`).join("\n\n");

/** The index as clients and reviewers read it (catalog/openui/sports-components.json). */
export const componentIndex = () => ({
  version: 1,
  components: SPORTS_COMPONENTS.map(({ build: _build, ...entry }) => entry),
});
