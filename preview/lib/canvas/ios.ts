/**
 * iOS system colours for variations, light and dark. `IPhoneFrame` writes them as
 * `--ios-*` CSS variables on the frame only (the page's shadcn theme is untouched), and
 * `app/globals.css` exposes them as Tailwind colours: `bg-ios-grouped`, `bg-ios-card`,
 * `text-ios-label`, `text-ios-label-2`, `text-ios-green`, `bg-ios-fill`, …
 */

export type Appearance = "light" | "dark";

const PALETTE = {
  bg: ["#FFFFFF", "#000000"],
  grouped: ["#F2F2F7", "#000000"],
  card: ["#FFFFFF", "#1C1C1E"],
  "card-2": ["#F2F2F7", "#2C2C2E"],
  label: ["#000000", "#FFFFFF"],
  "label-2": ["rgba(60, 60, 67, 0.6)", "rgba(235, 235, 245, 0.6)"],
  "label-3": ["rgba(60, 60, 67, 0.3)", "rgba(235, 235, 245, 0.3)"],
  separator: ["rgba(60, 60, 67, 0.29)", "rgba(84, 84, 88, 0.6)"],
  fill: ["rgba(118, 118, 128, 0.12)", "rgba(118, 118, 128, 0.24)"],
  red: ["#FF3B30", "#FF453A"],
  orange: ["#FF9500", "#FF9F0A"],
  yellow: ["#FFCC00", "#FFD60A"],
  green: ["#34C759", "#30D158"],
  mint: ["#00C7BE", "#63E6E2"],
  teal: ["#30B0C7", "#40C8E0"],
  cyan: ["#32ADE6", "#64D2FF"],
  blue: ["#007AFF", "#0A84FF"],
  indigo: ["#5856D6", "#5E5CE6"],
  purple: ["#AF52DE", "#BF5AF2"],
  pink: ["#FF2D55", "#FF375F"],
} as const;

export type IOSColor = keyof typeof PALETTE;

/** `--ios-*` variables for one appearance, as an inline style object. */
export function iosVars(appearance: Appearance): Record<string, string> {
  const i = appearance === "light" ? 0 : 1;
  return Object.fromEntries(Object.entries(PALETTE).map(([name, values]) => [`--ios-${name}`, values[i]]));
}

/**
 * EvilCharts `ChartConfig` colours for an iOS colour. Charts resolve `.dark` from an
 * ancestor class, which `IPhoneFrame` sets on a dark frame.
 */
export function chartColor(...names: IOSColor[]): { light: string[]; dark: string[] } {
  return { light: names.map((n) => PALETTE[n][0]), dark: names.map((n) => PALETTE[n][1]) };
}

/** SF Pro when available (Apple devices), otherwise the closest system face. */
export const IOS_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
