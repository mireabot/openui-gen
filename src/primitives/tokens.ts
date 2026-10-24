/**
 * Design tokens of the primitive format: the canvas ground rules as named values.
 *
 * Mirrors `web/lib/canvas/layout-rules.json` (via `catalog/layout-rules.json`); `npm run
 * check:primitives` fails when the two disagree. The ground rules are closed: only the
 * user adds values, and designs are fixed to fit them.
 *
 * Primitives take tokens, never raw numbers or colours; the renderer maps each token to
 * points and colours per platform and appearance.
 */

/** Spacing in points: the 8 grid plus the allowed off-grid steps. */
export const SPACE = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64] as const;
export const SCREEN_INSET = 24;
export const SECTION_GAP = 28;
export const LABEL_GAP = 12;
export const CONTAINER_PADDING = 16;
export const CONTROL_HEIGHT = 44;

export const RADIUS = { container: 24, control: 8, controlLarge: 12, inner: 4 } as const;

/** Type roles: [size, line height] in points. */
export const TYPE = {
  footnote: [14, 18],
  body: [16, 20],
  headline: [18, 22],
  title3: [20, 25],
  title2: [22, 28],
  display: [24, 28],
  title1: [28, 34],
} as const;

export const WEIGHT = ["regular", "medium", "semibold"] as const;

/** Text and icon colour roles; accents are the iOS system colours (web/lib/canvas/ios.ts). */
export const INK = ["primary", "secondary", "tertiary", "inverse"] as const;
export const ACCENT = ["red", "orange", "yellow", "green", "mint", "teal", "cyan", "blue", "indigo", "purple", "pink"] as const;
/** Semantic tones; the renderer maps good/warn/bad to green/orange/red. */
export const TONE = ["neutral", "good", "warn", "bad"] as const;
/** Container backgrounds. */
export const SURFACE = ["none", "card", "filled", "grouped", "outlined"] as const;

/** Ground rules: 16 inline (text, chips, buttons), 24 in nav bars, 28 in lists. */
export const ICON_SIZE = [16, 24, 28] as const;
/** Ground rules: 20 stacks, 40 list rows, 56 highlight portraits, 80 hero portraits. */
export const AVATAR_SIZE = [20, 40, 56, 80] as const;

export const TOKENS = {
  space: SPACE.map(String),
  type: Object.keys(TYPE),
  weight: [...WEIGHT],
  ink: [...INK, ...ACCENT],
  tone: [...TONE],
  surface: [...SURFACE],
  iconSize: ICON_SIZE.map(String),
  avatarSize: AVATAR_SIZE.map(String),
} as const;

export type TokenName = keyof typeof TOKENS;
export const TOKEN_NAMES = Object.keys(TOKENS) as TokenName[];
