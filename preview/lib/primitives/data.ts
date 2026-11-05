/**
 * Primitive trees as exported by the backend (`src/primitives/validate.ts` PNode), and
 * dummy data for previews: every `@path` resolves to a stable, plausible value from its
 * name, so a recipe renders without the app's data.
 */

export type Value =
  | string | number | boolean | null
  | readonly Value[]
  | { readonly [key: string]: Value }
  | { readonly $data: string };

export interface PNode {
  readonly id: string;
  readonly primitive: string;
  readonly props: Readonly<Record<string, Value>>;
  readonly children: Readonly<Record<string, readonly string[]>>;
  readonly line: number;
  readonly itemOf: string | null;
}

export interface Placement {
  readonly children: readonly string[];
  readonly where: string;
  readonly anchor: string | null;
  readonly presentation?: "page" | "sheet";
  readonly appearance?: "light" | "dark";
}

export interface PTree {
  readonly placement: Placement | null;
  readonly nodes: readonly PNode[];
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const WORDS = ["Apple", "Nvidia", "Morning run", "Protein", "Groceries", "Blue Bottle", "Sleep", "Rent", "Notion", "Coffee", "Strava", "Salary"];
const TINTS = ["blue", "green", "orange", "indigo", "pink", "teal", "purple", "red"];

/** A stable dummy for a data path (`answers.q1.rows`, `.club.name`, `.goals`). */
export function dummy(path: string, item = 0): string | number | boolean | Value[] {
  const key = path.split(".").filter(Boolean).at(-1)?.toLowerCase() ?? "";
  const h = hash(`${path}#${item}`);
  if (/^(is|has)|enabled|on$|selected|watched|liked|saved|featured|expanded/.test(key)) return h % 2 === 0;
  if (/items|list|rows|series|parts|days|calls|transactions|plans|updates|events|week|history|people|groups|recent|quotes|factors|metrics|stats|month/.test(key)) {
    return Array.from({ length: 3 + (h % 2) }, (_, i) => i);
  }
  if (/image|logo|photo|poster|cover|avatar|src/.test(key)) return TINTS[h % TINTS.length]!;
  if (/ink|color|tint/.test(key)) return TINTS[h % TINTS.length]!;
  if (/tone|status$/.test(key)) return ["good", "warn", "bad", "neutral"][h % 4]!;
  if (/time/.test(key)) return `${7 + (h % 10)}:${h % 2 ? "30" : "00"} ${h % 3 ? "AM" : "PM"}`;
  if (/date|day$/.test(key)) return ["Mon 12", "Tue 13", "Wed 14", "Thu 15"][h % 4]!;
  if (/pct|percent|share|progress|ratio/.test(key)) return (h % 90) + 10;
  if (/amount|total|value|estimate|actual|score|count|kcal|calories|distance|pace|avg|average|current/.test(key)) {
    return Math.round(((h % 9000) + 100) / (key.includes("eps") ? 100 : 1) * 100) / 100;
  }
  return WORDS[h % WORDS.length]!;
}
