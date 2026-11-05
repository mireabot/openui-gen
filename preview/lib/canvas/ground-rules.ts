/**
 * Ground rules for the design system that follows the Mobbin exploration. The canvas
 * lists them in the Rules drawer; renderers (web, SwiftUI) should read the same values.
 */

import layoutRules from "./layout-rules.json";

export type Rule = { label: string; value: string; note?: string };
export type RuleSection = { id: string; title: string; summary?: string; rules: Rule[] };

export const GROUND_RULES: RuleSection[] = [
  {
    id: "exploration",
    title: "Screen exploration",
    rules: [
      { label: "Variations", value: "25", note: "complete the exploration with five batches of five distinct compositions" },
      { label: "Batches", value: "5 × 5" },
      { label: "Exploration brief", value: "content first", note: "define the user question, semantic blocks, data and relationships before layouts; use explorations/PROMPT.md; an anchor is a reference, not a content boundary" },
      { label: "Distinct compositions", value: "information + interaction", note: "vary hierarchy, grouping, density, comparison, narrative or disclosure; colour or shell changes alone do not count" },
      { label: "Save in stages", value: "live", note: "save exploration.json (design tree) first, then each batch-<n>.json as soon as it is done; the canvas updates live at every stage" },
      { label: "References", value: "Mobbin MCP", note: "search by specific content blocks and interactions; inspect screens, borrow useful patterns, and record sources separately from extrapolations" },
      { label: "Interaction references", value: "60fps MCP", note: "search interaction and animation shots related to the request; when one has a fitting pattern, build it as a live variation and record the link" },
      { label: "Motion", value: "animate skill", note: "strict: follow ~/.agents/skills/animate (Emil Kowalski's bar) for whether, what, curve and duration; check with review-animations; respect reduced motion" },
    ],
  },
  {
    id: "grid",
    title: "Grid",
    summary:
      "Every component follows a simple, layered grid: an 8px base grid set as tightly as possible for flexibility; then padding (safe space) and content areas that show grouping; then structure — text hierarchy, image placeholders and controls; then the actual font sizes and weights.",
    rules: [
      { label: "Base grid", value: "8px" },
      { label: "Screen inset", value: "24px", note: "paired with the 24px container radius" },
    ],
  },
  {
    id: "containers",
    title: "Containers",
    rules: [
      { label: "Corner radius", value: "24px", note: "corner smoothing 60% (squircle)" },
      { label: "Padding", value: "16px" },
      { label: "Inner spacing", value: "16px", note: "between elements inside a container" },
      { label: "Stroke", value: "1px", note: "if applicable" },
    ],
  },
  {
    id: "radii",
    title: "Corner radius by element",
    rules: [
      { label: "Containers, inputs, images", value: "24px" },
      { label: "Buttons, controls, banners, toasts, messages", value: "8px", note: "buttons may use 12px" },
      { label: "Inner elements, static badges", value: "4px" },
      { label: "Icon buttons, avatars", value: "= width", note: "fully round" },
      { label: "Selections, interactive badges, progress bars", value: "pill", note: "radius = height / 2" },
    ],
  },
  {
    id: "buttons",
    title: "Buttons",
    rules: [
      { label: "Height", value: "44px" },
      { label: "Horizontal padding", value: "16px", note: "text layer wrapped in 4px horizontal padding" },
      { label: "Text ↔ icon gap", value: "0px" },
      { label: "Spacing in a v/h stack", value: "12px" },
      { label: "Stroke", value: "1px", note: "if applicable" },
    ],
  },
  {
    id: "scroll",
    title: "Horizontal scroll",
    summary: "A horizontal rail (cards, chips, tags) runs edge to edge with no padding of its own: the items carry the inset, so they scroll under the container edge instead of being cut at it, and snap to the inset.",
    rules: [
      { label: "Scroll container", value: "full-bleed, no padding", note: "no mx-*/px-*; overflow-x-auto reaching the container edge (screen, or a card's edge inside a card)" },
      { label: "Inset", value: "on the items", note: "first item's leading margin and last item's trailing margin = the container inset (24 on screen, the card padding in a card)" },
      { label: "Snap", value: "start, at the inset", note: "scroll-padding = the inset; cards snap mandatory, chips/tags proximity" },
      { label: "Vertical breathing room", value: "py-1+", note: "so rings, shadows and badges on items are not clipped" },
    ],
  },
  {
    id: "overlays",
    title: "Overlays",
    summary: "Anything floating over scrolling content (docked bars, sticky headers, sheets over a screen) is either a solid surface or a progressive blur — never a hard-edged translucent box.",
    rules: [
      { label: "Docked bar (bottom)", value: "blur ↓", note: "clear at the top edge, strongest at the screen edge, tinted toward the surface colour; extend through the bottom safe area to the container edge (safe space is padding, not an outer margin)" },
      { label: "Sticky header (top)", value: "blur ↑", note: "strongest at the top, clear toward content" },
      { label: "Blur steps", value: "0.5 → 16px", note: "6 masked backdrop-blur bands — components/canvas/progressive-blur.tsx" },
    ],
  },
  {
    id: "charts",
    title: "Charts",
    summary: "EvilCharts only (@/components/evilcharts/charts/echarts-*). Native ECharts marks reach a chart through two props: seriesOptions (merged into each data series) and chartOptions (top-level option keys).",
    rules: [
      { label: "Area fill", value: "vertical gradient", note: "<Area variant=\"gradient\">: the series colour fading to transparent at the baseline; line 2px" },
      { label: "Zones", value: "gradient markArea", note: "a range of the x axis (pre-market, after hours, a forecast) as seriesOptions.markArea with a vertical linear gradient ~7% → 0% of the text colour and a 11px label inside the top; never a solid block" },
      { label: "Zones by fill", value: "split series", note: "alternative: one series per zone sharing the boundary point, extended hours dotted, the main zone gradient; pass several <Area> children as an array or inline, never inside a fragment (EvilCharts collects them by reference)" },
      { label: "Reference line", value: "dashed markLine", note: "previous close, a target or an average: 1px dashed in the strong border colour, label at the line's end" },
      { label: "Threshold colour", value: "visualMap pieces", note: "chartOptions.visualMap colours the line and fill above / below a value (e.g. the previous close); colour is never the only cue — keep the signed number and arrow beside it" },
      { label: "Value axis", value: "scaled", note: "chartOptions.yAxis min/max around the data (~12% padding), not from zero" },
      { label: "Stable options", value: "useMemo", note: "seriesOptions / chartOptions objects must be memoised or module constants; a new object each render re-pushes the chart" },
    ],
  },
  {
    id: "placeholders",
    title: "Placeholders",
    summary: "Exploration is about layout and composition, so media and data can be lo-fi. A map only has to read as a map; a photo as a photo; a chart as a chart.",
    rules: [
      { label: "Maps", value: "lo-fi", note: "abstract street grid, no real streets, place names or precise routes — a route stroke only when the layout needs one" },
      { label: "Photos & artwork", value: "single colour", note: "one flat colour at the right size and radius: no gradients, shapes or text that try to recreate the image" },
      { label: "Data", value: "dummy", note: "plausible values; only the structure has to be right" },
    ],
  },
  {
    id: "type",
    title: "Type & colour",
    summary: "From the apple-design-rule skill.",
    rules: [
      { label: "Family", value: "SF Pro only", note: "Regular, Medium & Semibold; no serif or mono" },
      { label: "Titles", value: "28/34 · 22/28 · 20/25", note: "title1 · title2 · title3, Apple's title sizes" },
      { label: "Sizes", value: "14/18 · 16/20 · 18/22 · 24/28", note: "footnote · body · headline · display (hero numbers); 28 is the largest size" },
      { label: "Text colour", value: "#000000 · #666666", note: "default · subtle (dark frames: #FFFFFF · 60% white)" },
    ],
  },
  {
    id: "spacing",
    title: "Spacing & icons",
    summary: "From the apple-design-rule skill.",
    rules: [
      { label: "Between labels & lists", value: "12px" },
      { label: "Between sections", value: "28px" },
      { label: "List padding", value: "12px v · 20px h" },
      { label: "Icons", value: "16px inline · 24px nav · 28px list", note: "16 only inside text, chips and buttons" },
      { label: "Avatars & logos", value: "20 · 40 · 56 · 80", note: "stacks · list rows · highlight portraits · hero portraits" },
      { label: "Icon source", value: "Phosphor", note: "use @phosphor-icons/core assets/catalog and @phosphor-icons/react components; use existing library glyphs instead of drawing custom interface icons" },
      { label: "Icon weights", value: "regular · fill", note: "regular by default; fill for selected states, ratings and solid play glyphs" },
    ],
  },
];

/** Grid overlay drawn on frames when the toolbar toggle is on. */
export const GRID_OVERLAY = { step: 8, color: "rgba(255, 0, 0, 0.1)", stroke: 0.5 } as const;


/**
 * The same rules as numbers, for machines, kept in `layout-rules.json` so the root
 * scripts (block indexer) can read them too. The indexer checks every block against them
 * and exports `catalog/layout-rules.json` for the backend validator and the DSL.
 * It mirrors GROUND_RULES exactly: never add a value the ground rules don't list.
 */
export const LAYOUT_TOKENS = layoutRules.tokens;

export type LayoutRuleId =
  | "spacing.scale"
  | "inset.screen"
  | "gap.block"
  | "radius.allowed"
  | "type.size"
  | "type.leading"
  | "type.weight"
  | "control.height"
  | "rail.fullBleed"
  | "dock.blur"
  | "placeholder.flat";

export type LayoutRule = { id: LayoutRuleId; severity: "error" | "warn" | "info"; rule: string };

/** Checkable rules; the indexer implements one check per id (scripts/canvas-index/rules.ts). */
export const LAYOUT_RULES = layoutRules.rules as LayoutRule[];
