import { each, ui, type Node } from "../lang/program.js";

/**
 * The Sports component index: the components designed in ui-canvas (Sports Components, Kino) as
 * server templates. Each entry says what it is for, when to use it, and the exact data contract it
 * reads. The schema stage shapes answers to these contracts, the writer calls them by name, and they
 * expand to the 42 primitives, so every client renders them without knowing they exist.
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
const team = (prefix: string): ContractField[] => [
  f(`${prefix}.name`, "text", "club name"),
  f(`${prefix}.logo`, "text", "logo URL, or \"\""),
  f(`${prefix}.color`, "color", "the club's colour \"#rrggbb\" from d.clubs, or \"\""),
  f(`${prefix}.score`, "text", "goals as text (\"2\"), \"\" before kick-off"),
  f(`${prefix}.ink`, "ink", "\"secondary\" for the side that lost, else \"primary\""),
];

/** A club's mark: its logo, or its initial on the club colour. */
const mark = (t: AnyRef, size: 20 | 40) => ui.Avatar({ name: t.name, size, image: t.logo, color: t.color });

/** A club on one line: logo or monogram, name, and an optional trailing node. */
const teamLine = (t: AnyRef, trailing?: Node) => ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
  ui.Stack({ axis: "h", gap: 12, align: "center", children: [mark(t, 20), ui.Text({ content: t.name, role: "body", weight: "medium", lines: 1 })] }),
  ...(trailing ? [trailing] : []),
] });

export const SPORTS_COMPONENTS: readonly SportsComponent[] = [
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
      ui.Text({ content: m.details, role: "footnote", ink: "secondary", lines: 1 }),
    ] }),
  },
  {
    name: "TeamDetail",
    intent: "A club on one line: logo or monogram, name, and a short secondary line (nickname, code or league).",
    useWhen: "naming the clubs a screen is about, above stats or a comparison",
    source: "ui-canvas sports-components/team-detail",
    contract: [f("name", "text", "club name"), f("logo", "text", "logo URL, or \"\""), f("color", "color", "the club's colour \"#rrggbb\", or \"\""), f("detail", "text", "nickname, code or league, or \"\"")],
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
      ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
        ui.Text({ content: s.homeDisplay, role: "body", weight: "semibold" }),
        ui.Text({ content: s.label, role: "footnote", ink: "secondary", align: "center" }),
        ui.Text({ content: s.awayDisplay, role: "body", weight: "semibold", align: "end" }),
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
      f("entries[].detail", "text", "position · club for a player, league for a club, or \"\""),
      f("entries[].value", "text", "the metric's value as shown, e.g. \"9\""),
      f("entries[].logo", "text", "logo or photo URL, or \"\""),
      f("entries[].color", "color", "the club's colour \"#rrggbb\" (a player's club), or \"\""),
    ],
    params: [],
    build: b => ui.Card({ children: [
      ui.Stack({ axis: "h", gap: 12, align: "center", justify: "between", children: [
        ui.Text({ content: b.title, role: "footnote", weight: "medium", ink: "secondary", lines: 1 }),
        ui.Text({ content: b.metric, role: "footnote", weight: "medium", ink: "secondary" }),
      ] }),
      ui.Stack({ axis: "v", gap: 12, divided: true, children: each(b.entries, "e", (e: AnyRef) => ui.Row({
        title: e.name, subtitle: e.detail, leading: mark(e, 40),
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
      f("results", "list", "one per fixture, oldest first"),
      f("results[].label", "text", "\"W\", \"D\" or \"L\"; \"\" for a fixture to come"),
      f("results[].tone", "tone", "win \"good\", loss \"bad\", draw or to come \"neutral\""),
      f("summary", "text", "e.g. \"4 won · 1 drawn · 3 lost\""),
    ],
    params: [],
    build: h => ui.Card({ children: [
      ui.Stack({ axis: "v", gap: 4, align: "center", children: [
        ui.Text({ content: h.value, role: "display", weight: "semibold", align: "center" }),
        ui.Text({ content: h.caption, role: "body", ink: "secondary", align: "center" }),
      ] }),
      ui.Stack({ axis: "wrap", gap: 4, justify: "center", children: each(h.results, "r", (r: AnyRef) => ui.Badge({ label: r.label, tone: r.tone })) }),
      ui.Text({ content: h.summary, role: "footnote", ink: "secondary", align: "center" }),
    ] }),
  },
  {
    name: "StatsCard",
    intent: "A player's or a club's stats: a header (logo, name and a detail line), the rating on top in its bracket colour, then a grid of any number of stats, value over label.",
    useWhen: "a player's or a club's season or match stats; any set of figures about one subject",
    source: "ui-canvas sports-components/stats-card (from stats-grid/rating-hero)",
    contract: [
      f("name", "text", "player or club"),
      f("detail", "text", "club · position for a player, league · season for a club"),
      f("logo", "text", "photo or logo URL, or \"\""),
      f("color", "color", "the club's colour \"#rrggbb\" (a player's club), or \"\""),
      f("rating.value", "text", "rating as shown, e.g. \"6.60\", or \"—\" when there is none"),
      f("rating.tone", "tone", "7.0 and up \"good\", 6.0–6.99 \"warn\", under 6.0 \"bad\", none \"neutral\""),
      f("rating.label", "text", "e.g. \"Season rating\""),
      f("rating.caption", "text", "what it averages, e.g. \"Average of 6 matches\", or \"\""),
      f("stats", "list", "any number, in reading order"),
      f("stats[].label", "text", "e.g. \"Goals\""),
      f("stats[].value", "text", "as shown, e.g. \"5\" or \"86%\""),
    ],
    params: [],
    build: c => ui.Card({ children: [
      ui.Row({ title: c.name, subtitle: c.detail, leading: mark(c, 40) }),
      ui.Stack({ axis: "h", gap: 16, align: "center", children: [
        ui.Badge({ label: c.rating.value, tone: c.rating.tone }),
        ui.Stack({ axis: "v", gap: 0, children: [
          ui.Text({ content: c.rating.label, role: "body", weight: "medium" }),
          ui.Text({ content: c.rating.caption, role: "footnote", ink: "secondary" }),
        ] }),
      ] }),
      ui.Grid({ columns: "3", gap: 16, children: each(c.stats, "s", (s: AnyRef) => ui.Stack({ axis: "v", gap: 4, align: "center", children: [
        ui.Text({ content: s.value, role: "headline", weight: "semibold", align: "center" }),
        ui.Text({ content: s.label, role: "footnote", ink: "secondary", align: "center" }),
      ] })) }),
    ] }),
  },
];

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
