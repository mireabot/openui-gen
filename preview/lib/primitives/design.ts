import { readFileSync } from "node:fs";
import path from "node:path";
import type { CSSProperties } from "react";

/**
 * The bound design language (design/atomize/design.json), read on the server. A brand theme
 * becomes CSS variables (`--ds-ink-primary`, `--ds-effect-component`, …) on the preview root;
 * primitive specs say which token each style uses. Ground-rule sizes stay in the renderer.
 */
export type Spec = Record<string, unknown>;

export interface Design {
  defaultTheme: string;
  themes: Record<string, Record<string, unknown>>;
  effects: Record<string, string | number>;
  primitives: Record<string, Spec>;
}

const FILE = path.join(process.cwd(), "..", "design", "atomize", "design.json");

export function readDesign(): Design | null {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Design;
  } catch {
    return null;
  }
}

/** `surface.brand` → `var(--ds-surface-brand)`. */
export const tokenVar = (ref: string) => `var(--ds-${ref.replace(/\./g, "-")})`;

/** Brand tokens that a dark screen keeps from the brand (everything else comes from the dark theme). */
const BRAND_KEYS: [string, string][] = [["ink", "brand"], ["ink", "onBrand"], ["surface", "brand"], ["surface", "brandSoft"], ["surface", "brandGradient"]];

/**
 * CSS variables for one brand theme. `appearance: "dark"` (a `Screen(…, "dark")` root) takes
 * the dark theme's neutrals and keeps the brand's own colours.
 */
export function themeVars(design: Design, brand: string, appearance: "light" | "dark" = "light"): CSSProperties {
  const own = design.themes[brand] ?? design.themes[design.defaultTheme]!;
  let theme = own;
  if (appearance === "dark" && own.appearance !== "dark" && design.themes.dark) {
    const dark = structuredClone(design.themes.dark) as Record<string, Record<string, unknown>>;
    for (const [group, key] of BRAND_KEYS) dark[group]![key] = (own[group] as Record<string, unknown>)[key];
    theme = dark;
  }
  const vars: Record<string, string> = {};
  const walk = (o: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (k === "appearance") continue;
      if (Array.isArray(v)) vars[`--ds-${prefix}${k}`] = `linear-gradient(180deg, ${v.join(", ")})`;
      else if (v && typeof v === "object") walk(v as Record<string, unknown>, `${prefix}${k}-`);
      else vars[`--ds-${prefix}${k}`] = String(v);
    }
  };
  walk(theme, "");
  for (const [name, e] of Object.entries(design.effects)) {
    if (typeof e === "string") vars[`--ds-effect-${name}`] = e.replace(/\{([^}]+)\}/g, (_, ref: string) => tokenVar(ref));
  }
  return vars as CSSProperties;
}

export const appearanceOf = (design: Design, brand: string) =>
  ((design.themes[brand] ?? design.themes[design.defaultTheme]!).appearance as "light" | "dark") ?? "light";

const KINO = path.join(process.cwd(), "..", "design", "kino", "theme.json");

/**
 * The bound design with the Kino theme added and made the default (dark; design/kino/theme.json,
 * read from Figma). Kino brings its own colours and type sizes per role; specs, radii and
 * spacing stay Atomize + ground rules.
 */
export function readDesignWithKino(): Design | null {
  const design = readDesign();
  if (!design) return null;
  try {
    const kino = (JSON.parse(readFileSync(KINO, "utf8")) as { themes: Record<string, Record<string, unknown>> }).themes;
    return { ...design, defaultTheme: "kino", themes: { ...kino, ...design.themes } };
  } catch {
    return design;
  }
}
