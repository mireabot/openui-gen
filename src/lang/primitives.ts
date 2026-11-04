import { z } from "zod";
import { NUMBER_FORMATS, CHILD_NAMES, copy, data, node, nodes, opt, style, token, TOKEN_SCHEMA, type PropMeta, type PropSpec } from "./props.js";
import { TONE } from "../primitives/tokens.js";

/**
 * The primitive library: what OpenUI Lang programs compose and what renderers draw. This is the
 * only list of primitives; the lang-core library, prompt signatures, client catalogs and the
 * typed builder are derived from it.
 *
 * Key order of `props` is the positional order on the wire (lang-core maps positional args by
 * zod key order), so it is API once a primitive is released: required first, optional last.
 *
 * Ground rules are baked into the primitive, not exposed as props: a Button is 44 tall, a Card
 * has radius 24 and padding 16, a Rail is full-bleed with the 24 inset inside. Props only choose
 * between token values the rules allow.
 *
 * `Repeat` is gone: `@Each(list, "p", Template(p.x))` makes the items and the Stack, Grid or Rail
 * holding them lays them out. Renderers flatten one level of child arrays, because an `@Each`
 * next to sibling children evaluates to a nested array.
 */

export type Category = "root" | "layout" | "text" | "media" | "control" | "data" | "row" | "chrome";
export type Behavior =
  /** Numbers roll between values (NumberFlow on the web). */
  | "roll"
  /** Children enter one after another. */
  | "stagger-in"
  /** Scale-down on press. */
  | "press"
  /** Local on/off state; no model call. */
  | "toggle"
  /** Local single selection. */
  | "select"
  /** Local expand/collapse. */
  | "expand"
  /** Drag across values to inspect one. */
  | "scrub"
  /** Horizontal scroll. */
  | "scroll";

export type PropSpecs = Readonly<Record<string, PropSpec>>;

export interface PrimitiveDef<N extends string = string, P extends PropSpecs = PropSpecs> {
  readonly name: N;
  readonly category: Category;
  readonly intent: string;
  readonly props: P;
  readonly behaviors: readonly Behavior[];
  /** Ground rules the renderer applies; documentation for every port, never props. */
  readonly rules: readonly string[];
  /** How it draws while streaming: containers keep their surface and layout, leaves become shapes at their real size. */
  readonly skeleton: string;
  readonly status: "proposed" | "released";
}

const P = <const N extends string, const S extends PropSpecs>(def: Omit<PrimitiveDef<N, S>, "status"> & { status?: PrimitiveDef["status"] }): PrimitiveDef<N, S> =>
  ({ status: "proposed", ...def });

const point = z.object({ label: z.string(), value: z.number() });
const POINTS = { min: 2, max: 400 } as const;

export const PRIMITIVES = [
  // ---------------------------------------------------------------- root
  P({
    name: "Screen", category: "root", intent: "The whole response, top to bottom.",
    props: { children: nodes({ min: 1 }), placement: opt(copy.oneOf(["page", "sheet"])), appearance: opt(copy.oneOf(["light", "dark"])) },
    behaviors: [], rules: ["24 screen inset", "28 between top-level blocks"],
    skeleton: "top-level blocks 28 apart, each as its own skeleton",
  }),

  // ---------------------------------------------------------------- layout
  P({
    name: "Calculation", category: "layout", intent: "A local calculation scope: child controls edit input bindings and child values recalculate together. No network request or model call.",
    props: {
      values: data.record(z.object({ unitPrice: z.number().nullable(), quantity: z.number().int().nullable(), months: z.number(), annualRate: z.number() })),
      children: nodes({ min: 1 }),
      model: opt(copy.oneOf(["compound-growth", "simple-growth"])),
    },
    behaviors: [], rules: ["transparent container; 24 between children", "initial inputs come from the record", "quantity is whole units; annualRate is percent points; months is positive", "derived startingValue, endingValue, change, periodRate, endUnitPrice and optional alternatives replace only values in this scope", "invalid inputs produce null outputs"],
    skeleton: "transparent vertical container, child skeletons with gap 24",
  }),
  P({
    name: "Stack", category: "layout", intent: "Lays children out in one direction with a token gap, or flows them into wrapping rows (\"wrap\": tags, chips, facts).",
    props: {
      axis: copy.oneOf(["v", "h", "wrap"]), gap: token("space"), children: nodes({ min: 1 }),
      align: opt(copy.oneOf(["start", "center", "end", "stretch"])), justify: opt(copy.oneOf(["start", "center", "end", "between"])),
      overlap: opt(token("space", "children after the first overlap the previous one by this much (poster over a still)")),
      divided: opt(copy.bool("hairline between children (lists)")),
      paddingX: opt(token("space")), paddingY: opt(token("space")),
    },
    behaviors: ["stagger-in"], rules: ["gap is a spacing token", "inside a horizontal Stack, a vertical Stack takes the remaining width and its Text wraps to its lines, then truncates; one aligned end is a trailing column and keeps its own width instead", "overlap is a spacing token, applied as a negative margin", "wrap: children keep their own width and flow into rows, gap between items and rows; an item wider than the row gets its own row", "divided: 1px separator between children"],
    skeleton: "keeps its axis, gap and alignment; children draw their own skeletons (an @Each before data: 3 items)",
  }),
  P({
    name: "Grid", category: "layout", intent: "Lays peer children in 1 to 24 equal columns.",
    props: { columns: copy.oneOf(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"]), gap: token("space"), children: nodes({ min: 1 }), rowGap: opt(token("space", "vertical gap; defaults to gap")) },
    behaviors: ["stagger-in"], rules: ["equal columns", "gap is a spacing token"],
    skeleton: "keeps its columns and gap",
  }),
  P({
    name: "Rail", category: "layout", intent: "A horizontal scroll row of peer items that runs edge to edge.",
    props: { gap: token("space", "12, the rail standard"), children: nodes({ min: 2 }), width: opt(copy.int("each item's width in points; 170 is the rail standard")) },
    behaviors: ["scroll", "stagger-in"], rules: ["gap 12 between items (the standard)", "items 170 wide (the standard width)", "full-bleed scroll container with no padding; the items carry the inset and snap to it", "py-1 so rings and shadows are not clipped"],
    skeleton: "keeps its scroll row; children as skeletons",
  }),
  P({
    name: "Card", category: "layout", intent: "A container that groups related content on a surface.",
    props: {
      children: nodes({ min: 1 }), surface: opt(token("surface", "default card")),
      radius: opt(copy.oneOf(["container", "control"], "container 24 (default) · control 12 for small tiles")),
      padding: opt(token("space", "default 16")), selected: opt(copy.bool("bindable per item (p.selected): brand outline")), gap: opt(token("space", "between children; defaults to 16")),
    },
    behaviors: ["press", "select"], rules: ["radius 24 (12 for control-size tiles), corner smoothing 60%", "padding 16 by default", "inner spacing 16", "selected = 1px brand stroke"],
    skeleton: "keeps its surface, radius and padding; children as skeletons",
  }),
  P({
    name: "Section", category: "layout", intent: "A titled group: the heading, an optional subtitle and footnote, and the content under it.",
    props: {
      title: copy.text(), children: nodes({ min: 1 }), subtitle: opt(copy.text()),
      trailing: opt(node(["Button", "IconButton", "Chip", "Text"])), footnote: opt(copy.text()),
      collapsible: opt(copy.bool()), sticky: opt(copy.bool("header sticks while its content scrolls")),
    },
    behaviors: ["expand"], rules: ["12 between the title and the content", "28 between sections"],
    skeleton: "title as one headline bar (55%), subtitle as a footnote bar; children as skeletons",
  }),
  P({
    name: "Divider", category: "layout", intent: "A hairline between two parts.",
    props: { inset: opt(copy.bool()), bleed: opt(copy.bool("edge to edge across the 24 screen inset")) },
    behaviors: [], rules: ["1px separator colour"], skeleton: "unchanged hairline",
  }),
  P({
    name: "Spacer", category: "layout", intent: "Fixed space between two siblings.",
    props: { size: token("space") }, behaviors: [], rules: [], skeleton: "unchanged",
  }),
  P({
    name: "ZStack", category: "layout", intent: "Layers children back to front, aligned like SwiftUI's ZStack: text over a photo or map, a badge on an avatar, a play button on a still.",
    props: {
      children: nodes({ min: 2 }),
      alignment: copy.oneOf(["top-leading", "top", "top-trailing", "leading", "center", "trailing", "bottom-leading", "bottom", "bottom-trailing"]),
      inset: opt(token("space", "distance of the upper layers from the aligned edges")), scrim: opt(copy.bool("darkens the first layer under the others for legible text")),
    },
    behaviors: [], rules: ["first child sizes the stack (the base)", "inset is a spacing token"],
    skeleton: "the base layer's skeleton",
  }),
  P({
    name: "Disclosure", category: "layout", intent: "A row that expands on tap to show more below it: details of an item, the week's hours, a breakdown.",
    props: {
      label: copy.text(), children: nodes({ min: 1 }), open: opt(copy.bool("starts expanded; bind per item (p.open) to open one row among closed ones")),
      subtitle: opt(copy.text()), trailing: opt(node(["Text", "Number", "Badge", "Pill"])),
    },
    behaviors: ["expand"], rules: ["header min height 44", "chevron.down turns from -90° (closed) to 0° (open)", "12 between the header and the content", "the tap state is the device's; open is only the start"],
    skeleton: "header bar + chevron box; closed",
  }),
  P({
    name: "Show", category: "layout", intent: "Shows its child only when a value is true (bind per item, e.g. p.open, to open one row among closed ones).",
    props: { when: copy.bool(), child: node() }, behaviors: ["expand"], rules: [],
    skeleton: "its child's skeleton when shown",
  }),

  // ---------------------------------------------------------------- text
  P({
    name: "Text", category: "text", intent: "A title, label, caption or paragraph in a type role.",
    props: {
      content: copy.text(), role: token("type"), weight: opt(token("weight")), ink: opt(token("ink")), lines: opt(copy.int()),
      align: opt(copy.oneOf(["start", "center", "end"])),
      tone: opt(token("tone", "colour by meaning (good / bad / warn / neutral), e.g. a verdict; overrides ink; bindable")),
      reserve: opt(copy.bool("keep the height of `lines` lines even when the text is shorter, so cards in a set match")),
      color: opt(data.color("a colour from the data (a medal, a club); overrides tone and ink; empty uses them")),
    },
    behaviors: [], rules: ["SF Pro", "size and line height come from the role", "tone uses the theme's tone colours, never raw accents", "reserve: height = lines × the role's line height (SwiftUI lineLimit(_:reservesSpace:))"],
    skeleton: "one bar per line at the role's line height; width by role (title 50%, body 70%, footnote 40%), last line 60%",
  }),
  P({
    name: "Number", category: "text", intent: "A formatted value from app data, e.g. money, a score or a duration.",
    props: {
      value: data.number("decimal"), format: copy.oneOf(NUMBER_FORMATS), role: token("type"), weight: opt(token("weight")),
      ink: opt(token("ink")), roll: opt(copy.bool()), signed: opt(copy.bool()),
      compact: opt(copy.bool("$4.5K, $10.7B")), suffix: opt(copy.text("unit after the figure, e.g. \"B\" or \"pts\"")),
    },
    behaviors: ["roll"], rules: ["tabular figures", "the renderer formats; the model never pre-formats"],
    skeleton: "one bar at the role's line height, 40% wide",
  }),

  // ---------------------------------------------------------------- media
  P({
    name: "Icon", category: "media", intent: "An SF Symbol by name (e.g. \"calendar\", \"heart.fill\").",
    props: { name: copy.icon(), size: opt(token("iconSize")), ink: opt(token("ink")) },
    behaviors: [], rules: ["SF Symbols name (validated against catalog/sf-symbols.json and the iOS deployment target)", ".fill variant for selected states"],
    skeleton: "rounded square at the icon size",
  }),
  P({
    name: "Image", category: "media", intent: "A photo or artwork from app data.",
    props: {
      src: data.image(), aspect: copy.oneOf(["1-1", "4-3", "16-9", "3-4", "2-3"]), rounded: opt(copy.bool()),
      width: opt(token("avatarSize", "fixed width (posters, thumbnails); default fills its column")),
      ring: opt(copy.bool("stroke in the screen colour, for an image overlapping another (poster over a still)")),
    },
    behaviors: [], rules: ["radius 24 when rounded", "placeholder is one flat colour", "scale the image proportionally to fit inside the reserved box without cropping; keep the box dimensions unchanged", "a URL / server path loads async into the reserved box (shimmer until loaded, 150ms fade in); a failed load keeps the flat placeholder"],
    skeleton: "flat box at its aspect and radius",
  }),
  P({
    name: "Avatar", category: "media", intent: "A person or company mark: image, or monogram on a tint.",
    props: { name: copy.text(), size: token("avatarSize"), image: opt(data.image()), tint: opt(token("ink")), shape: opt(copy.oneOf(["circle", "rounded"])), color: opt(data.discColor("from the data: a player's club colour fills the disc behind the photo; \"clear\" for a club with a logo, whose crest has no fill; a club without a logo uses its colour for the monogram")),
      kind: opt(copy.oneOf(["club", "player"], "club (default): a crest with nothing behind it · player: a headshot on the disc colour; both fit the whole frame")) },
    behaviors: [], rules: ["fully round, or radius 8 when rounded", "the image scales proportionally to fit the whole frame with no padding, so a player's head is never cut off; the shape's corners mask a photo", "club: a loaded crest has nothing behind it and no mask", "player: the disc colour behind the image", "image loads async (a URL or a server path resolved against the streaming server): the monogram shows first, the loaded image replaces it (150ms ease-out), and a failed load keeps the monogram"],
    skeleton: "circle (or radius-8 square) at its size",
  }),
  P({
    name: "IconTile", category: "media", intent: "A glyph on a tinted tile that marks a feature, a setting or a category (Atomize Feature-icon).",
    props: { icon: copy.icon(), size: token("avatarSize"), style: opt(copy.oneOf(["brand", "soft", "neutral"])) },
    behaviors: [], rules: ["radius 12", "24 glyph"], skeleton: "radius-12 square at its size",
  }),
  P({
    name: "AvatarStack", category: "media", intent: "Up to three overlapping avatars for a group.",
    props: { people: data.list(z.string()), size: token("avatarSize"), max: opt(copy.int()) },
    behaviors: [], rules: ["overlap -8", "ring in the surface colour"], skeleton: "one circle at its size",
  }),

  // ---------------------------------------------------------------- controls
  P({
    name: "Slider", category: "control", intent: "A labelled range input. Inside Calculation it edits its bound input and updates sibling outputs; outside it owns local state.",
    props: { label: copy.text(), value: data.number("decimal"), min: copy.decimal(), max: copy.decimal(), step: opt(copy.decimal()), unit: opt(copy.text()) },
    behaviors: ["select"], rules: ["native: the system SwiftUI Slider(value:in:step:), tint surface.brand (system track, thumb, haptics, VoiceOver adjust)", "web preview: 44 hit area, 8 pill track surface.filled, 20 thumb surface.brand", "step defaults to 1; bounds and step must be finite and valid", "keyboard changes are immediate"],
    skeleton: "label line and pill track in a 44 hit area",
  }),
  P({
    name: "ChoiceTags", category: "control", intent: "Single selection in overflowing icon/text pills, or alternative rows. Edits its bound input inside Calculation.",
    props: {
      label: copy.text(),
      options: data.list(z.object({ label: z.string(), value: z.number(), icon: z.string(), detail: z.string().optional(), trailing: z.string().optional() }), { min: 1 }),
      value: data.number("decimal"), style: opt(copy.oneOf(["tags", "rows"])),
    },
    behaviors: ["select", "scroll"], rules: ["tags: outlined pills (Kino Secondary button), 44 hit area, 20 icon, gap 8, body semibold, no fill", "tags selected: ink.primary text and icon, outline.control 1.5 border (bright); unselected: outline.control text and icon, outline.subtle 1.5 border (subtle)", "intrinsic width; horizontal overflow", "rows: selected outline.strong fill, unselected surface.filled; optional detail and trailing text; single selection"],
    skeleton: "three independent 44 tall pills in a horizontal row",
  }),
  P({
    name: "Button", category: "control", intent: "A labelled action.",
    props: {
      label: copy.text(), action: copy.action(), style: copy.oneOf(["primary", "secondary", "outline", "text"]), icon: opt(copy.icon()), wide: opt(copy.bool()),
      disabled: opt(copy.bool()), iconTrailing: opt(copy.bool("icon after the label (→)")),
    },
    behaviors: ["press"], rules: ["height 44", "padding 16", "radius 8 (12 allowed)", "text icon gap 0"],
    skeleton: "radius-8 box, 44 tall, 128 wide (full width when wide)",
  }),
  P({
    name: "IconButton", category: "control", intent: "A round icon-only action with a spoken label.",
    props: { icon: copy.icon(), label: copy.text(), action: copy.action(), style: opt(copy.oneOf(["plain", "filled"])), disabled: opt(copy.bool()) },
    behaviors: ["press"], rules: ["44 round tap target", "24 glyph"], skeleton: "44 circle",
  }),
  P({
    name: "Pill", category: "control", intent: "A static two-part pill: a label and its value, optionally with a colour dot (legend chips, \"Q3 · 4:30 PM\").",
    props: { label: copy.text(), value: opt(copy.text()), dot: opt(token("ink")) },
    behaviors: [], rules: ["pill", "label secondary ink, value medium"], skeleton: "pill 32 tall, 72 wide",
  }),
  P({
    name: "Badge", category: "control", intent: "A static status label.",
    props: {
      label: copy.text(), tone: token("tone"), icon: opt(copy.icon()),
      size: opt(copy.oneOf(["small", "regular", "large"], "small: 11 semibold, 16 tall, padding 4, for a value on an avatar; regular: 24 tall; large: title1 semibold, padding 12 horizontal and 4 vertical, radius 8")),
      fill: opt(copy.oneOf(["none", "tone.good.fg", "tone.warn.fg", "tone.bad.fg", "tone.neutral.fg", "ink.brand", "surface.brand", "surface.filled"])),
      ink: opt(copy.oneOf(["ink.primary", "ink.secondary", "ink.onBrand", "surface.screen"])),
    },
    behaviors: [], rules: ["small: 11 semibold, radius 4, height 16, padding 4 horizontal", "regular: footnote medium, radius 4, height 24", "large: title1 semibold, radius 8, padding 12 horizontal and 4 vertical", "fill and ink override the tone look", "fill none: plain text with no padding or background"], skeleton: "small: 16 tall label; regular: 24 tall label; large: 42 tall label, or 34 when fill none",
  }),
  P({
    name: "Chip", category: "control", intent: "A pill that filters or selects, or a tappable tag.",
    props: { label: copy.text(), action: opt(copy.action()), selected: opt(copy.bool()), icon: opt(copy.icon()) },
    behaviors: ["select", "press"], rules: ["pill", "height 44 tap target"], skeleton: "pill 32 tall, 72 wide",
  }),
  P({
    name: "SegmentedControl", category: "control", intent: "Switches between supplied sibling views; optional panels switch together with the selection.",
    props: {
      options: copy.list(z.string(), { min: 1, max: 5 }), selected: opt(copy.int()),
      panels: opt(nodes({ note: "one panel per option, or one @Each: only the selected item renders" })), contentFirst: opt(copy.bool()),
    },
    behaviors: ["select"], rules: ["pill track", "height 44", "optional panels: one per option, or one @Each whose selected item is the panel; contentFirst places the track below"],
    skeleton: "pill track 44 tall plus selected panel skeleton when supplied",
  }),
  P({
    name: "Toggle", category: "control", intent: "A switch with its label.",
    props: { label: copy.text(), on: opt(copy.bool()), caption: opt(copy.text("secondary line under the label")), disabled: opt(copy.bool()) },
    behaviors: ["toggle"], rules: ["44 tap target"], skeleton: "label bar + 51×31 pill",
  }),
  P({
    name: "Stepper", category: "control", intent: "Adjusts an amount with minus and plus.",
    props: { value: data.number("decimal"), unit: opt(copy.text()), step: opt(copy.decimal()) },
    behaviors: ["roll"], rules: ["44 round buttons"], skeleton: "pill 44 tall, 128 wide",
  }),

  // ---------------------------------------------------------------- data
  P({
    name: "ColorCell", category: "data", intent: "One blank filled square for a heatmap, activity grid, status matrix or legend, with a spoken label.",
    props: {
      label: copy.text("accessibility label only; never drawn inside the square"),
      fill: copy.oneOf(["tone.good.fg", "tone.warn.fg", "tone.bad.fg", "tone.neutral.fg", "outline.control", "surface.filled", "surface.brand"]),
      color: opt(data.color("a data colour #rrggbb, or empty to use fill")),
      size: opt(copy.oneOf(["fill", "12", "24", "32"], "fill (default): square at the available width; fixed sizes for swatches")),
    },
    behaviors: [], rules: ["square aspect ratio", "radius 4", "fill is a palette token; a nonempty data color overrides it", "label is spoken only; no visible text", "fill size takes the available width; fixed sizes never stretch"],
    skeleton: "radius-4 square at its fixed size or the available width",
  }),
  P({
    name: "Progress", category: "data", intent: "How far a value is toward a goal, as a bar or a ring.",
    props: { value: data.number("percent"), style: copy.oneOf(["bar", "ring"]), tone: opt(token("tone")), label: opt(copy.text()), caption: opt(copy.text()) },
    behaviors: [], rules: ["bar is a pill"], skeleton: "bar: pill track; ring: 80 circle outline",
  }),
  P({
    name: "Bars", category: "data", intent: "Values over periods as bars; can select or scrub a period.",
    props: {
      series: data.list(point), selectable: opt(copy.bool()), average: opt(copy.bool()),
      selected: opt(copy.int("index of the selected bar (wider, brand)")), values: opt(copy.bool("compact amounts above the bars")),
      style: opt(style.bar("chart look")),
    },
    behaviors: ["select", "scrub"], rules: ["pill bars", "style: token-only options, each one Swift Charts modifier (BarMark)"],
    skeleton: "radius-12 box 128 tall",
  }),
  P({
    name: "ShareBar", category: "data", intent: "How a total splits into named parts, with a legend.",
    props: {
      parts: data.list(z.object({ label: z.string(), value: z.number(), ink: TOKEN_SCHEMA.ink, detail: z.string().optional() }), { min: 2, max: 6 }),
      legend: opt(copy.bool()), selectable: opt(copy.bool()), style: opt(style.share("bar (default), donut or pie")),
    },
    behaviors: ["select"], rules: ["pill track", "optional selection dims other parts; details are supplied data", "donut / pie: 160 square, 1.5° gaps between parts, the same legend under it"],
    skeleton: "pill 12 tall, full width",
  }),
  P({
    name: "Rating", category: "data", intent: "A star rating with an optional count.",
    props: { value: data.number("decimal"), count: opt(data.number("count")), max: opt(copy.int()) },
    behaviors: [], rules: ["star / star.fill"], skeleton: "bar 16 tall, 30% wide",
  }),
  P({
    name: "Sparkline", category: "data", intent: "A tiny trend line of a series (a day or a week of prices), coloured by its direction; stretches to the space it gets.",
    props: {
      points: data.list(point, POINTS), baseline: opt(copy.bool("dotted line at the first value")),
      reference: opt(data.number("decimal", "a dashed line at this value; with fill, the zones split here")),
      fill: opt(copy.bool("gradient zone under the line: good above the reference, bad below (direction colour without a reference)")),
      style: opt(style.line("line look (axis and grid are ignored at sparkline size)")),
    },
    behaviors: [], rules: ["style: token-only options, each one Swift Charts modifier (LineMark / AreaMark / PointMark)", "height 40; full width on its own, 72 wide inside a horizontal Stack (a row)", "fill: vertical gradient zones with a hard stop at the reference, as in PriceChart threshold", "good ink when the last value ≥ the first, bad ink otherwise", "no axes, no labels"],
    skeleton: "radius-4 box 40 tall at its width (72 in a row)",
  }),
  P({
    name: "PriceChart", category: "data", intent: "A price line over a period with a soft area fill and an optional dashed reference (e.g. the previous close); scrub to read a point, or pin and drag to measure a move.",
    props: {
      points: data.list(point.extend({ session: z.enum(["pre", "regular", "after"]).optional() }), POINTS),
      height: opt(copy.oneOf(["compact", "regular"], "compact 120 · regular 200 (default)")),
      reference: opt(data.number("decimal", "value of the dashed reference line")), referenceLabel: opt(copy.text("label at the line's end, e.g. \"Prev close\"")),
      tone: opt(copy.oneOf(["direction", "threshold"], "direction (default): one colour from first vs last · threshold: good above the reference, bad below")),
      annotate: opt(copy.bool("write the high and low on the line")), measure: opt(copy.bool("tap pins a start point, drag reads the move from it")),
      comparison: opt(data.list(point, POINTS)), comparisonLabel: opt(copy.text()), unit: opt(copy.oneOf(["currency", "percent", "number"])),
      style: opt(style.line("line look")),
      sessions: opt(copy.oneOf(["auto", "off"], "auto (default): shade the points' pre-market and after-hours stretches · off")),
    },
    behaviors: ["scrub"], rules: ["area fill is a vertical gradient of the line colour",
      "sessions: each pre / after stretch (sharing its boundary point with the regular one) is a full-height band, ink.primary 7% at the top fading to 0, labelled \"Pre-market\" / \"After hours\" at its top in footnote secondary; no label on a band under 18% of the width · Swift Charts RectangleMark(xStart:xEnd:yStart:yEnd:) + annotation(position: .overlay, alignment: .top)", "reference: 1px dashed, label at its end", "threshold: hard colour stop at the reference's height", "first and last labels under the plot, footnote tertiary", "comparison: dashed secondary line; identical labels and count required; both series share the scale", "unit affects every price readout and spoken value", "style: token-only options, each one Swift Charts modifier (LineMark / AreaMark / PointMark / RuleMark, chartXAxis / chartYAxis / chartYScale)"],
    skeleton: "radius-12 box at the chart height, two footnote bars under it",
  }),
  P({
    name: "StepTimeline", category: "data", intent: "A value over time as a stepped line in stretches, each in its own colour with its crest above its middle; scrub to read the stretch, date and value.",
    props: {
      value: data.text("the current value, the header's left side"),
      segments: data.list(z.object({
        name: z.string(), lineColor: z.string(), tagColor: z.string(), logo: z.string(),
        points: z.array(z.object({ x: z.number(), label: z.string(), value: z.number(), display: z.string() })),
      })),
      ticks: data.list(z.object({ value: z.number(), display: z.string() })),
      caption: opt(data.text("under the value")),
    },
    behaviors: ["scrub"], rules: ["vertical stack, leading, with no card: header, then the plot 200 tall", "the only axis: the ticks' labels at the plot's trailing edge in footnote tertiary, with no grid lines and no dates", "header: value in title1 semibold on the left, 68 tall so nothing jumps; while scrubbing, on the right a stack with spacing 6: the stretch's name in its line colour, the date in secondary ink, the value in a tag with the tag colour and white text", "x is time; the line holds each value until the next, 2 wide, and a stretch runs up to the next one's first point", "y starts at zero, with 28 of headroom for the crests", "crest: 20, with no fill, centred on its stretch, 4 above its highest value, so it never sits on the line; left out when the stretch is narrower than the crest", "a dot marks the last point, or the scrubbed one with a 1px rule"],
    skeleton: "header bar, radius-12 box 200 tall",
  }),
  P({
    name: "Change", category: "data", intent: "A signed price change with its percent (−$1.20 · −0.52%), toned by its sign; \"percent\" shows only the percent with an arrow.",
    props: {
      value: data.number("decimal"), percent: data.number("decimal", "percent points, e.g. 1.4 for +1.4%"),
      style: opt(copy.oneOf(["pill", "text", "percent"], "pill (default) · text · percent: arrow + %")), role: opt(token("type", "default footnote")),
    },
    behaviors: [], rules: ["good tone when ≥ 0, bad when < 0", "always signed", "arrow.up.right / arrow.down.right glyph in the pill and percent styles", "tabular figures"],
    skeleton: "pill 22 tall, 96 wide (percent style 64)",
  }),
  P({
    name: "SplitBar", category: "data", intent: "How votes split between two or three sides (Buy · Hold · Sell, Yes · No) in one bar, each side in its tone, in the given order.",
    props: {
      sides: data.list(z.object({ label: z.string(), count: z.number(), tone: z.enum(TONE), color: z.string().optional() }), { min: 2, max: 3 }),
      size: opt(copy.oneOf(["regular", "thin", "micro"], "regular 8 (default) · thin 6 · micro 4 (40 wide, for chips)")), dim: opt(copy.bool("losing sides at 35%")),
      legend: opt(copy.bool("side label and count under each end")),
    },
    behaviors: [], rules: ["pill track, 2px gap between segments", "segment width = count / total", "a side's color (a team's #hex) overrides its tone", "order is the data's order; it never re-sorts by size", "fills the remaining width in a row"],
    skeleton: "one pill track at its height, full width (40 for micro)",
  }),
  P({
    name: "Note", category: "data", intent: "A short highlighted message: a tip, a status or a warning (Atomize Info-note).",
    props: { text: copy.text(), tone: opt(copy.oneOf(["neutral", "brand", "good", "warn", "bad"])), title: opt(copy.text()), icon: opt(copy.icon()) },
    behaviors: [], rules: ["radius 12", "padding 12", "text shown in full, leading aligned", "icon and text centred vertically", "height follows the content, never fixed"], skeleton: "radius-12 box 72 tall",
  }),

  // ---------------------------------------------------------------- rows
  P({
    name: "Row", category: "row", intent: "One list row: leading mark, title and subtitle, trailing value or control.",
    props: {
      title: copy.text(), subtitle: opt(copy.text()), leading: opt(node(["Icon", "Avatar", "Image"])),
      trailing: opt(node(["Text", "Number", "Badge", "Chip", "Pill", "Stack", "Toggle", "Icon", "IconButton", "Button", "Change", "Sparkline"])),
      action: opt(copy.action()),
    },
    behaviors: ["press"], rules: ["list padding 12 v · 20 h", "min height 44", "title and subtitle each wrap to at most 2 lines, then truncate"],
    skeleton: "leading shape + title bar (90%) and subtitle bar; trailing as its skeleton",
  }),
  P({
    name: "KeyValue", category: "row", intent: "A read-only fact as a label and its value; the value may link somewhere.",
    props: { label: copy.text(), value: copy.text(), action: opt(copy.action()) },
    behaviors: ["press"], rules: ["label secondary ink"], skeleton: "label bar (50%) ‖ value bar (35%)",
  }),

  // ---------------------------------------------------------------- chrome (screen mode only)
  P({
    name: "NavBar", category: "chrome", intent: "The top bar: title, back or close, up to two trailing actions.",
    props: {
      title: opt(copy.text()), leading: opt(copy.oneOf(["back", "close", "none"])), trailing: opt(nodes({ accepts: ["IconButton"], min: 0, max: 2 })),
      style: opt(copy.oneOf(["plain", "filled"], "filled: round 44 buttons on a tinted disc")),
    },
    behaviors: [], rules: ["24 icons", "blur up when content scrolls under it"], skeleton: "unchanged chrome",
  }),
  P({
    name: "Dock", category: "chrome", intent: "A bottom bar that keeps the main action in reach.",
    props: { children: nodes({ accepts: ["Button", "Stack", "Text", "Number"], min: 1 }) },
    behaviors: [], rules: ["progressive blur down", "extends through the bottom safe area"], skeleton: "unchanged chrome; buttons as skeletons",
  }),
] as const;

export type Primitive = (typeof PRIMITIVES)[number];
export type PrimitiveName = Primitive["name"];
export type PropsOf<N extends PrimitiveName> = Extract<Primitive, { name: N }>["props"];

export const PRIMITIVE_BY_NAME: ReadonlyMap<string, PrimitiveDef> = new Map(PRIMITIVES.map((p) => [p.name, p as PrimitiveDef]));

/** The role meta of one prop; undefined for an unknown primitive or prop. */
export const propMeta = (primitive: string, prop: string): PropMeta | undefined => PRIMITIVE_BY_NAME.get(primitive)?.props[prop]?.meta;

CHILD_NAMES.push(...PRIMITIVES.map((p) => p.name).filter((n) => n !== "Screen"));
