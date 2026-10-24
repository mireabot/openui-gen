import type { ASTNode } from "@openuidev/lang-core";
import { PRIMITIVES, type PrimitiveDef, type PrimitiveName, type PropsOf } from "./primitives.js";
import type { PropSpec, Role } from "./props.js";

/**
 * Server-side authoring of OpenUI Lang: typed references into the Query result, the `ui.*`
 * builder over the primitive library, `@Each`, and the printer. The IR is lang-core's own
 * `ASTNode`; text exists only where the program is printed for the wire.
 */

export type Expr = ASTNode;

const REF = Symbol("ref");
const NODE = Symbol("node");
const HOLE = Symbol("hole");

// ---------------------------------------------------------------- refs
export interface RefBase<T> { readonly [REF]: Expr; readonly __type?: T }
/**
 * A typed path into the Query result: `d.peers.at(0).price` prints `d.peers[0].price`. Typed by
 * the pack's dataset schema, so a block can only read fields that exist, with their type.
 */
export type Ref<T> = RefBase<T> &
  ([NonNullable<T>] extends [readonly (infer U)[]] ? { readonly at: (i: number) => Ref<U> }
    : [NonNullable<T>] extends [object] ? { readonly [K in keyof NonNullable<T>]: Ref<NonNullable<T>[K]> }
    : unknown);

function refOf<T>(expr: Expr): Ref<T> {
  return new Proxy({} as Ref<T>, {
    get(_, key) {
      if (key === REF) return expr;
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return undefined;
      if (key === "at") return (i: number) => refOf({ k: "Index", obj: expr, index: { k: "Num", v: i } });
      return refOf({ k: "Member", obj: expr, field: key });
    },
  });
}

/** A typed ref over any reference expression, so a template can be bound to what a writer passed (`EarningsCard(p)`). */
export const refAt = <T>(expr: Expr): Ref<T> => refOf<T>(expr);

/** The dataset root, read through the `d = Query(...)` statement every program declares. */
export const queryRoot = <T>(statementId = "d"): Ref<T> => refOf<T>({ k: "RuntimeRef", n: statementId, refType: "query" });

export function queryPath<T>(path: string): Ref<T> {
  let expr: Expr = { k: "RuntimeRef", n: "d", refType: "query" };
  for (const part of path.split(".")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/.exec(part);
    if (!match?.[1]) throw new Error(`invalid query path ${path}`);
    expr = { k: "Member", obj: expr, field: match[1] };
    if (match[2] !== undefined) expr = { k: "Index", obj: expr, index: { k: "Num", v: Number(match[2]) } };
  }
  return refOf<T>(expr);
}

export const nodeOf = (expr: Expr): Node => {
  if (expr.k !== "Comp") throw new Error("a UI node must be a component");
  return { [NODE]: true, name: expr.name, expr };
};

const isRef = (v: unknown): v is RefBase<unknown> => typeof v === "object" && v !== null && (v as RefBase<unknown>)[REF] !== undefined;
export const exprOfRef = (r: RefBase<unknown>): Expr => r[REF];

// ---------------------------------------------------------------- holes
/** A statement the writer (or the server's fallback) fills, referenced by id: `pick1_title`. */
export interface HoleRef<S extends "copy" | "node" | "nodes" = "copy" | "node" | "nodes"> { readonly [HOLE]: string; readonly shape: S }
export const holeRef = <S extends "copy" | "node" | "nodes">(id: string, shape: S): HoleRef<S> => ({ [HOLE]: id, shape });
const isHole = (v: unknown): v is HoleRef => typeof v === "object" && v !== null && HOLE in v;

// ---------------------------------------------------------------- nodes and the builder
export interface Node<N extends string = string> { readonly [NODE]: true; readonly name: N; readonly expr: Expr }
export type EachNode = Node<"Each">;
export type Child = Node | HoleRef<"node">;
export type Children = readonly (Node | HoleRef<"node" | "nodes">)[] | EachNode | HoleRef<"nodes">;

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && NODE in v;

type In<P> = P extends PropSpec<infer T, infer R extends Role, boolean>
  ? R extends "data" ? Ref<T | null>
    : R extends "copy" ? ([T] extends [string] ? string | Ref<string> | HoleRef<"copy"> : T | Ref<T>)
    : R extends "token" ? T | Ref<T>
    : R extends "node" ? Child
    : R extends "nodes" ? Children
    : T
  : never;
type OptionalKeys<S> = { [K in keyof S]: S[K] extends PropSpec<unknown, Role, true> ? K : never }[keyof S];
export type PropsIn<S> = { readonly [K in Exclude<keyof S, OptionalKeys<S>>]: In<S[K]> } & { readonly [K in OptionalKeys<S>]?: In<S[K]> | null };

/**
 * `ui.Text({ content: p.ticker, role: "body", weight: "semibold" })`. Named props in, a
 * positional call out (zod key order; trailing absent props trimmed, inner ones printed as null).
 * A literal in a data prop does not compile.
 */
export type Builder = { readonly [N in PrimitiveName]: (props: PropsIn<PropsOf<N>>) => Node<N> };

function call(def: PrimitiveDef, props: Readonly<Record<string, unknown>>): Node {
  for (const key of Object.keys(props)) if (!(key in def.props)) throw new Error(`${def.name} has no prop "${key}"`);
  const args = Object.keys(def.props).map((key) => (props[key] === undefined ? undefined : toExpr(props[key])));
  while (args.length && args[args.length - 1] === undefined) args.pop();
  return { [NODE]: true, name: def.name, expr: { k: "Comp", name: def.name, args: args.map((a) => a ?? { k: "Null" }) } };
}

export const ui = Object.fromEntries(PRIMITIVES.map((def) => [def.name, (props: Record<string, unknown>) => call(def as PrimitiveDef, props)])) as unknown as Builder;

/**
 * `each(d.peers, "p", (p) => quoteRow(p))` → `@Each(d.peers, "p", Card(...))`. OpenUI requires the
 * template inline; the loop variable must not shadow an enclosing one.
 */
export function each<T>(list: Ref<readonly T[]> | Ref<T[]>, variable: string, template: (item: Ref<T>) => Node): EachNode {
  const body = template(refOf<T>({ k: "Ref", n: variable }));
  return { [NODE]: true, name: "Each", expr: { k: "Comp", name: "Each", args: [exprOfRef(list), { k: "Str", v: variable }, body.expr] } };
}

/** Any authoring value as AST: literals, refs, nodes, holes, arrays and plain records (chart styles). */
export function toExpr(value: unknown): Expr {
  if (value === null) return { k: "Null" };
  if (typeof value === "string") return { k: "Str", v: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot print ${value}`);
    return { k: "Num", v: value };
  }
  if (typeof value === "boolean") return { k: "Bool", v: value };
  if (Array.isArray(value)) return { k: "Arr", els: value.map(toExpr) };
  if (isRef(value)) return exprOfRef(value);
  if (isNode(value)) return value.expr;
  if (isHole(value)) return { k: "Ref", n: value[HOLE] };
  if (typeof value === "object") return { k: "Obj", entries: Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toExpr(v)]) };
  throw new Error(`cannot print a ${typeof value}`);
}

// ---------------------------------------------------------------- printer
/** lang-core built-ins are called with `@`; components are not. */
const BUILTINS = new Set(["Each", "Count", "Sum", "Avg", "Min", "Max", "Filter", "Sort", "First", "Last", "Round", "Abs", "Ceil", "Floor", "Percent", "ToAssistant", "OpenUrl", "Set", "Reset", "Run"]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** One expression as OpenUI Lang. Inverse of lang-core's parseExpression for everything the server writes. */
export function printExpr(e: Expr): string {
  switch (e.k) {
    case "Comp": return `${e.fn || BUILTINS.has(e.name) ? "@" : ""}${e.name}(${e.args.map(printExpr).join(", ")})`;
    case "Str": return JSON.stringify(e.v);
    case "Num": return String(e.v);
    case "Bool": return String(e.v);
    case "Null": return "null";
    case "Arr": return `[${e.els.map(printExpr).join(", ")}]`;
    case "Obj": return `{${e.entries.map(([k, v]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${printExpr(v)}`).join(", ")}}`;
    case "Ref": case "Ph": case "RuntimeRef": return e.n;
    case "StateRef": return e.n.startsWith("$") ? e.n : `$${e.n}`;
    case "Member": return `${printExpr(e.obj)}.${e.field}`;
    case "Index": return `${printExpr(e.obj)}[${printExpr(e.index)}]`;
    case "BinOp": return `(${printExpr(e.left)} ${e.op} ${printExpr(e.right)})`;
    case "UnaryOp": return `${e.op}${printExpr(e.operand)}`;
    case "Ternary": return `(${printExpr(e.cond)} ? ${printExpr(e.then)} : ${printExpr(e.else)})`;
    case "Assign": return `${e.target} = ${printExpr(e.value)}`;
  }
}

export const printStatement = (id: string, e: Expr): string => `${id} = ${printExpr(e)}`;

/** Primitive names used by a node, in first-use order. */
export function primitivesOf(e: Expr): PrimitiveName[] {
  const seen = new Set<string>();
  const walk = (n: Expr): void => {
    switch (n.k) {
      case "Comp": if (!BUILTINS.has(n.name) && !n.fn) seen.add(n.name); n.args.forEach(walk); break;
      case "Arr": n.els.forEach(walk); break;
      case "Obj": n.entries.forEach(([, v]) => walk(v)); break;
      case "Member": walk(n.obj); break;
      case "Index": walk(n.obj); walk(n.index); break;
      case "BinOp": walk(n.left); walk(n.right); break;
      case "UnaryOp": walk(n.operand); break;
      case "Ternary": walk(n.cond); walk(n.then); walk(n.else); break;
      default: break;
    }
  };
  walk(e);
  return [...seen] as PrimitiveName[];
}
