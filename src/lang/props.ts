import { z } from "zod";
import { tagSchemaId } from "@openuidev/lang-core";
import { ACCENT, AVATAR_SIZE, ICON_SIZE, INK, SPACE, SURFACE, TONE, TYPE, WEIGHT, type TokenName } from "../primitives/tokens.js";

/**
 * The prop vocabulary of the OpenUI primitive library. Every primitive prop is made by one of
 * these helpers, which pairs the zod schema lang-core validates with a `PropMeta` for what
 * lang-core cannot express (copy vs data, number format, token family, child allow-lists).
 *
 * lang-core drops zod `.meta()` from `toJSONSchema()`, so meta lives on the primitive
 * definition and reaches clients through `catalog/openui/primitives.json`.
 *
 * Roles are also carried in the TS type, so the builder (`ui.*`, program.ts) rejects a literal
 * in a data prop at compile time.
 */

export const NUMBER_FORMATS = ["integer", "decimal", "percent", "currency", "duration", "distance", "energy", "mass", "count"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export type Role = "copy" | "data" | "token" | "node" | "nodes" | "style";
export type DataKind = "text" | "number" | "boolean" | "status" | "image" | "icon" | "color" | "record" | "list";

export type PropMeta =
  | { readonly role: "copy"; readonly kind?: "icon" | "action"; readonly note?: string }
  | { readonly role: "data"; readonly kind: DataKind; readonly format?: NumberFormat; readonly note?: string }
  | { readonly role: "token"; readonly token: TokenName; readonly note?: string }
  | { readonly role: "node"; readonly accepts: readonly string[] | "any"; readonly note?: string }
  | { readonly role: "nodes"; readonly accepts: readonly string[] | "any"; readonly min?: number; readonly max?: number; readonly note?: string }
  | { readonly role: "style"; readonly record: "bar" | "share"; readonly fields: Readonly<Record<string, StyleField>>; readonly note?: string };

/** One chart style field and the Swift Charts modifier it maps to (the Swift port contract). */
export interface StyleField { readonly values: readonly string[]; readonly swift: string }

/**
 * A prop before it joins a primitive. Child props are lazy because the primitive graph is
 * cyclic (Stack holds Stack); `definePrimitive` turns them into zod getters, which give exact
 * `Text | Stack` prompt signatures where `z.lazy` prints `any`.
 */
export interface PropSpec<out T = unknown, out R extends Role = Role, out O extends boolean = boolean> {
  readonly meta: PropMeta & { readonly role: R };
  readonly optional: O;
  readonly schema: z.ZodType | ((ref: (name: string) => z.ZodType) => z.ZodType);
  /** Type-level only: the value the prop holds once evaluated. */
  readonly __value?: T;
}

const spec = <T, R extends Role>(schema: PropSpec["schema"], meta: PropMeta & { readonly role: R }): PropSpec<T, R, false> => ({ meta, optional: false, schema });
const noted = (note?: string) => (note ? { note } : {});

/** `opt(copy.text())`: optional; a positional `null` skips it and trailing absent props are trimmed. */
export const opt = <T, R extends Role>(p: PropSpec<T, R, false>): PropSpec<T, R, true> => ({ ...p, optional: true });

export const copy = {
  text: (note?: string) => spec<string, "copy">(z.string(), { role: "copy", ...noted(note) }),
  oneOf: <const V extends readonly [string, ...string[]]>(values: V, note?: string) => spec<V[number], "copy">(z.enum(values), { role: "copy", ...noted(note) }),
  bool: (note?: string) => spec<boolean, "copy">(z.boolean(), { role: "copy", ...noted(note) }),
  int: (note?: string) => spec<number, "copy">(z.number().int(), { role: "copy", ...noted(note) }),
  decimal: (note?: string) => spec<number, "copy">(z.number(), { role: "copy", ...noted(note) }),
  /** SF Symbol name; checked against catalog/sf-symbols.json by the gate, not by zod. */
  icon: (note?: string) => spec<string, "copy">(z.string(), { role: "copy", kind: "icon", ...noted(note) }),
  /** An OpenUI action: `@OpenUrl(...)`, `@ToAssistant(...)` or `Action([...])`. */
  action: (note?: string) => spec<unknown, "copy">(z.any(), { role: "copy", kind: "action", ...noted(note) }),
  list: <T>(item: z.ZodType<T>, range: Range = {}, note?: string) => spec<T[], "copy">(ranged(z.array(item), range), { role: "copy", ...noted(note) }),
};

/** Data props hold a reference into the Query result (`d.clubs[0].points`, or an `@Each` item), never a literal. */
export const data = {
  number: (format: NumberFormat, note?: string) => spec<number, "data">(z.number(), { role: "data", kind: "number", format, ...noted(note) }),
  text: (note?: string) => spec<string, "data">(z.string(), { role: "data", kind: "text", ...noted(note) }),
  bool: (note?: string) => spec<boolean, "data">(z.boolean(), { role: "data", kind: "boolean", ...noted(note) }),
  image: (note?: string) => spec<string, "data">(z.string(), { role: "data", kind: "image", ...noted(note) }),
  icon: (note?: string) => spec<string, "data">(z.string(), { role: "data", kind: "icon", ...noted(note) }),
  /** A colour from the data, "#rrggbb" (a club's ESPN colour) or "" for none; never a typed literal. */
  color: (note?: string) => spec<string, "data">(z.string().regex(/^(#[0-9a-fA-F]{6})?$/), { role: "data", kind: "color", ...noted(note) }),
  /** An Avatar's colour: "#rrggbb", "" for none, or "clear" for no fill behind a crest. */
  discColor: (note?: string) => spec<string, "data">(z.string().regex(/^(#[0-9a-fA-F]{6}|clear)?$/), { role: "data", kind: "color", ...noted(note) }),
  status: (note?: string) => spec<(typeof TONE)[number], "data">(z.enum(TONE), { role: "data", kind: "status", ...noted(note) }),
  list: <T>(item: z.ZodType<T>, range: Range = {}, note?: string) => spec<T[], "data">(ranged(z.array(item), range), { role: "data", kind: "list", ...noted(note) }),
  record: <T>(schema: z.ZodType<T>, note?: string) => spec<T, "data">(schema, { role: "data", kind: "record", ...noted(note) }),
};

/**
 * Token schemas, closed: values come only from tokens.ts. `z.literal([...])` compiles to a JSON
 * enum that lang-core enforces (`z.union` of literals is not enforced); `tagSchemaId` names the
 * family in prompt signatures (`gap: Space`).
 */
const tagged = <Z extends z.ZodType>(schema: Z, id: string): Z => (tagSchemaId(schema, id), schema);
/** The type name each token has in prompt signatures (`gap: Space`). */
export const TOKEN_IDS = { space: "Space", type: "TypeRole", weight: "Weight", ink: "Ink", tone: "Tone", surface: "Surface", iconSize: "IconSize", avatarSize: "AvatarSize" } as const;
export const TOKEN_SCHEMA = {
  space: tagged(z.literal(SPACE), TOKEN_IDS.space),
  type: tagged(z.enum(Object.keys(TYPE) as [keyof typeof TYPE, ...(keyof typeof TYPE)[]]), TOKEN_IDS.type),
  weight: tagged(z.enum(WEIGHT), TOKEN_IDS.weight),
  ink: tagged(z.enum([...INK, ...ACCENT]), TOKEN_IDS.ink),
  tone: tagged(z.enum(TONE), TOKEN_IDS.tone),
  surface: tagged(z.enum(SURFACE), TOKEN_IDS.surface),
  iconSize: tagged(z.literal(ICON_SIZE), TOKEN_IDS.iconSize),
  avatarSize: tagged(z.literal(AVATAR_SIZE), TOKEN_IDS.avatarSize),
} as const satisfies Record<TokenName, z.ZodType>;
type TokenValue<T extends TokenName> = z.infer<(typeof TOKEN_SCHEMA)[T]>;

export const token = <T extends TokenName>(t: T, note?: string) => spec<TokenValue<T>, "token">(TOKEN_SCHEMA[t], { role: "token", token: t, ...noted(note) });

/** One child, optionally limited to some primitives (checked by the gate; lang-core does not enforce accepts). */
export const node = (accepts?: readonly string[], note?: string) =>
  spec<unknown, "node">((ref) => union(accepts, ref), { role: "node", accepts: accepts ?? "any", ...noted(note) });
export const nodes = (opts: { accepts?: readonly string[]; min?: number; max?: number; note?: string } = {}) =>
  spec<unknown, "nodes">((ref) => z.array(union(opts.accepts, ref)), {
    role: "nodes", accepts: opts.accepts ?? "any",
    ...(opts.min !== undefined ? { min: opts.min } : {}), ...(opts.max !== undefined ? { max: opts.max } : {}), ...noted(opts.note),
  });

/** Every primitive that may be a child: filled by primitives.ts so `accepts: "any"` resolves. */
export const CHILD_NAMES: string[] = [];
function union(accepts: readonly string[] | undefined, ref: (name: string) => z.ZodType): z.ZodType {
  const names = accepts ?? CHILD_NAMES;
  const [first, ...rest] = names.map(ref);
  if (!first) throw new Error("a child slot needs at least one accepted primitive");
  return rest.length === 0 ? first : z.union([first, ...rest]);
}

// ---------------------------------------------------------------- chart style records
const sf = (values: readonly [string, ...string[]], swift: string): StyleField => ({ values, swift });
const AXIS = sf(["none", "x", "y", "both"], "chartXAxis / chartYAxis(.hidden | AxisMarks), labels footnote tertiary");
const GRID: StyleField = { values: ["true", "false"], swift: "AxisGridLine on the y axis, outline.subtle" };
const INK_FIELD: StyleField = { values: [...INK, ...ACCENT], swift: "foregroundStyle(ink)" };

const STYLE_FIELDS = {
  bar: {
    orientation: sf(["vertical", "horizontal"], "BarMark x/y swap"),
    corners: sf(["pill", "soft", "square"], "BarMark.cornerRadius pill · 4 · 0"),
    highlight: sf(["selected", "max", "last", "none"], "brand fill on one bar"),
    axis: AXIS, grid: GRID,
    ink: INK_FIELD,
  },
  share: {
    shape: sf(["bar", "donut", "pie"], "SectorMark(angle:, innerRadius: .ratio(0.62 | 0), angularInset: 1.5).cornerRadius(4)"),
  },
} as const satisfies Record<"bar" | "share", Record<string, StyleField>>;

type StyleOf<R extends keyof typeof STYLE_FIELDS> = {
  [K in keyof (typeof STYLE_FIELDS)[R]]?: (typeof STYLE_FIELDS)[R][K] extends typeof GRID ? boolean : (typeof STYLE_FIELDS)[R][K] extends { values: readonly (infer V)[] } ? V : never;
};

const styleSchema = (fields: Record<string, StyleField>) =>
  z.object(Object.fromEntries(Object.entries(fields).map(([k, f]) =>
    [k, (f === GRID ? z.boolean() : z.enum(f.values as [string, ...string[]])).optional()])));

export const style = Object.fromEntries((Object.keys(STYLE_FIELDS) as (keyof typeof STYLE_FIELDS)[]).map((r) =>
  [r, (note?: string) => spec(styleSchema(STYLE_FIELDS[r]), { role: "style", record: r, fields: STYLE_FIELDS[r], ...noted(note) })],
)) as { readonly [R in keyof typeof STYLE_FIELDS]: (note?: string) => PropSpec<StyleOf<R>, "style", false> };

// ---------------------------------------------------------------- helpers
interface Range { readonly min?: number; readonly max?: number }
function ranged<T>(a: z.ZodArray<z.ZodType<T>>, { min, max }: Range): z.ZodArray<z.ZodType<T>> {
  const lower = min !== undefined ? a.min(min) : a;
  return max !== undefined ? lower.max(max) : lower;
}
