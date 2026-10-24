import { z } from "zod";
import { createLibrary, createParser, defineComponent, type DefinedComponent, type Library, type LibraryJSONSchema, type Parser } from "@openuidev/lang-core";
import { PRIMITIVES, type PrimitiveDef, type PrimitiveName } from "./primitives.js";

if (typeof process !== "undefined") process.env.OPENUI_TELEMETRY_DISABLED = "1";

/**
 * The lang-core libraries derived from PRIMITIVES. `component` is null: lang-core stores it
 * opaquely, and each client (web React, SwiftUI) attaches its renderers by primitive name.
 *
 * Libraries and parsers live at module scope; lang-core memoizes parsers by library identity.
 */

/** Zod object for a primitive: child props become getters so the cyclic graph resolves lazily. */
function zodProps(def: PrimitiveDef, ref: (name: string) => z.ZodType): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(def.props)) {
    const build = () => {
      const schema = typeof prop.schema === "function" ? prop.schema(ref) : prop.schema;
      return prop.optional ? schema.optional() : schema;
    };
    if (typeof prop.schema === "function") {
      let cached: z.ZodType | undefined;
      Object.defineProperty(shape, key, { get: () => (cached ??= build()), enumerable: true, configurable: true });
    } else shape[key] = build();
  }
  return z.object(shape);
}

function libraryOf(defs: readonly PrimitiveDef[], root: string): { library: Library; schema: LibraryJSONSchema; parser: Parser } {
  const refs = new Map<string, z.ZodType>();
  const ref = (name: string) => {
    const r = refs.get(name);
    if (!r) throw new Error(`unknown primitive "${name}" in a child slot`);
    return r;
  };
  const components: DefinedComponent[] = defs.map((def) => {
    const c = defineComponent({ name: def.name, description: def.intent, props: zodProps(def, ref), component: null });
    refs.set(def.name, c.ref as unknown as z.ZodType);
    return c;
  });
  const library = createLibrary({ components, root });
  const schema = library.toJSONSchema();
  return { library, schema, parser: createParser(schema, root) };
}

const FULL = libraryOf(PRIMITIVES as readonly PrimitiveDef[], "Screen");
export const LIBRARY: Library = FULL.library;
export const LIBRARY_SCHEMA: LibraryJSONSchema = FULL.schema;
export const PARSER: Parser = FULL.parser;

export interface SlotLibrary {
  readonly names: readonly PrimitiveName[];
  readonly library: Library;
  readonly parser: Parser;
}

const slotLibraries = new Map<string, SlotLibrary>();
/**
 * A primitives-only library for validating a writer slot. Its root is a synthetic `Slot`, so a
 * fragment parses as a complete program. Built with createLibrary (lang-core cannot remove a
 * root), and child slots keep only accepted names that are in the set.
 */
export function slotLibrary(names: readonly PrimitiveName[]): SlotLibrary {
  const key = [...names].sort().join(",");
  const hit = slotLibraries.get(key);
  if (hit) return hit;
  const keep = new Set<string>(names);
  const defs = PRIMITIVES.filter((p) => keep.has(p.name)).map((p) => narrow(p as PrimitiveDef, keep));
  const slot: PrimitiveDef = {
    name: "Slot", category: "root", intent: "Validation root for a writer slot; never on the wire.",
    props: { children: { meta: { role: "nodes", accepts: [...keep] }, optional: false, schema: (ref) => z.array(oneOf(names.map(ref))) } },
    behaviors: [], rules: [], skeleton: "", status: "proposed",
  };
  const built = libraryOf([slot, ...defs], "Slot");
  const lib: SlotLibrary = { names, library: built.library, parser: built.parser };
  slotLibraries.set(key, lib);
  return lib;
}

/** Restrict a primitive's child slots to `keep`; a required slot left with nothing is a build error. */
function narrow(def: PrimitiveDef, keep: ReadonlySet<string>): PrimitiveDef {
  const props = Object.fromEntries(Object.entries(def.props).map(([key, prop]) => {
    const meta = prop.meta;
    if (meta.role !== "node" && meta.role !== "nodes") return [key, prop];
    const accepts = (meta.accepts === "any" ? [...keep] : meta.accepts.filter((n) => keep.has(n)));
    if (accepts.length === 0) {
      if (!prop.optional) throw new Error(`slot library: ${def.name}.${key} would accept nothing`);
      // Keep the key so positional order matches the full library; any value is a type-mismatch.
      return [key, { ...prop, meta: { ...meta, accepts }, schema: z.never() }];
    }
    const pick = (ref: (n: string) => z.ZodType) => oneOf(accepts.map(ref));
    return [key, { ...prop, meta: { ...meta, accepts }, schema: meta.role === "node" ? pick : (ref: (n: string) => z.ZodType) => z.array(pick(ref)) }];
  }));
  return { ...def, props };
}

function oneOf(schemas: z.ZodType[]): z.ZodType {
  const [first, ...rest] = schemas;
  if (!first) throw new Error("a child slot needs at least one accepted primitive");
  return rest.length ? z.union([first, ...rest]) : first;
}
