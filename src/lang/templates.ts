import { parseExpression, split, tokenize } from "@openuidev/lang-core";
import { z } from "zod";
import { printStatement, type Expr } from "./program.js";

/**
 * Templates: named components defined as an OpenUI Lang body over their parameters, shipped as data.
 * A program calls a template by name (`MatchCard(d.answers.q1.match)`); every client expands the call
 * before it evaluates, so the program on the wire reads in component names while each device still
 * draws primitives only.
 *
 * Expansion binds parameters by scope: a parameter reference in the body becomes the call's argument,
 * and the body's own @Each names are renamed to `<name><Template>` so an argument that reads an outer
 * item (`@Each(d.games, "e", Leaderboard(e))`) is never captured by the body's own `e`.
 */

export interface TemplateParam {
  readonly name: string;
  /** "data": a data reference (d.<path> or an @Each item). "copy": a value the writer may pass, or null. */
  readonly role: "data" | "copy";
  /** What a copy param holds: text (the default) or a boolean flag. */
  readonly kind?: "text" | "boolean";
  /** The body expression used when a copy argument is absent or null, over the other parameters. */
  readonly default?: string;
  readonly note?: string;
}

/** A template as the catalog and the wire carry it. */
export interface TemplateDef {
  readonly name: string;
  readonly params: readonly TemplateParam[];
  readonly body: string;
}

export const TemplateDefSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
  params: z.array(z.object({ name: z.string().regex(/^[a-z][A-Za-z0-9]*$/), role: z.enum(["data", "copy"]), kind: z.enum(["text", "boolean"]).optional(), default: z.string().optional(), note: z.string().optional() }).strict()).min(1),
  body: z.string(),
}).strict();

interface Parsed { readonly def: TemplateDef; readonly body: Expr; readonly defaults: readonly (Expr | null)[] }
export type Templates = ReadonlyMap<string, Parsed>;

export const NO_TEMPLATES: Templates = new Map();

const parse = (text: string): Expr => {
  const statement = split(tokenize(`t = ${text}`))[0];
  if (!statement) throw new Error(`Cannot parse ${text}`);
  return parseExpression(statement.tokens);
};

export function templateSet(defs: readonly TemplateDef[]): Templates {
  return new Map(defs.map(def => [def.name, { def, body: parse(def.body), defaults: def.params.map(p => (p.default ? parse(p.default) : null)) }]));
}

const isReference = (e: Expr): boolean => e.k === "Ref" || e.k === "RuntimeRef" || e.k === "Member" || e.k === "Index";

/** Replace Refs by name, renaming the body's own @Each names; bound names shadow parameters. */
function substitute(e: Expr, bindings: ReadonlyMap<string, Expr>, suffix: string): Expr {
  switch (e.k) {
    case "Ref": return bindings.get(e.n) ?? e;
    case "Member": return { ...e, obj: substitute(e.obj, bindings, suffix) };
    case "Index": return { ...e, obj: substitute(e.obj, bindings, suffix), index: substitute(e.index, bindings, suffix) };
    case "Arr": return { ...e, els: e.els.map(el => substitute(el, bindings, suffix)) };
    case "Obj": return { ...e, entries: e.entries.map(([k, v]) => [k, substitute(v, bindings, suffix)] as [string, Expr]) };
    case "Comp": {
      if (e.name === "Each" && e.args[1]?.k === "Str" && e.args.length === 3) {
        const alias = e.args[1].v;
        const fresh = `${alias}${suffix}`;
        const inner = new Map(bindings).set(alias, { k: "Ref", n: fresh });
        return { ...e, args: [substitute(e.args[0]!, bindings, suffix), { k: "Str", v: fresh }, substitute(e.args[2]!, inner, suffix)] };
      }
      return { ...e, args: e.args.map(arg => substitute(arg, bindings, suffix)) };
    }
    default: return e;
  }
}

/** One template call as its body, or null when `call` names no template. Throws a message for a bad call. */
export function expandCall(call: Extract<Expr, { k: "Comp" }>, templates: Templates): Expr | null {
  const template = templates.get(call.name);
  if (!template || call.fn) return null;
  const { def, body, defaults } = template;
  if (call.args.length > def.params.length) throw new Error(`${def.name} takes ${def.params.map(p => p.name).join(", ")}`);
  const bindings = new Map<string, Expr>();
  def.params.forEach((param, index) => {
    const arg = call.args[index];
    const absent = !arg || arg.k === "Null";
    if (param.role === "data") {
      if (absent || !isReference(arg)) throw new Error(`${def.name} takes a data reference for ${param.name} (d.<path> or an @Each item)`);
      bindings.set(param.name, arg);
    } else if (absent) {
      const fallback = defaults[index];
      bindings.set(param.name, fallback ? substitute(fallback, bindings, def.name) : { k: "Null" });
    } else {
      if (param.kind === "boolean" ? arg.k !== "Bool" && !isReference(arg) : arg.k !== "Str" && !isReference(arg))
        throw new Error(`${def.name}.${param.name} is ${param.kind === "boolean" ? "true or false" : "text: a string"} or a data reference`);
      bindings.set(param.name, arg);
    }
  });
  return substitute(body, bindings, def.name);
}

/** Every template call in an expression as primitives, outermost first (a template's own body has none). */
export function expandExpr(e: Expr, templates: Templates): Expr {
  if (!templates.size) return e;
  switch (e.k) {
    case "Comp": {
      const expanded = expandCall(e, templates);
      if (expanded) return expandExpr(expanded, templates);
      return { ...e, args: e.args.map(arg => expandExpr(arg, templates)) };
    }
    case "Arr": return { ...e, els: e.els.map(el => expandExpr(el, templates)) };
    case "Obj": return { ...e, entries: e.entries.map(([k, v]) => [k, expandExpr(v, templates)] as [string, Expr]) };
    default: return e;
  }
}

/** Names of the templates an expression calls. */
export function templatesUsed(e: Expr, templates: Templates, into = new Set<string>()): Set<string> {
  if (e.k === "Comp") { if (!e.fn && templates.has(e.name)) into.add(e.name); e.args.forEach(arg => templatesUsed(arg, templates, into)); }
  else if (e.k === "Arr") e.els.forEach(el => templatesUsed(el, templates, into));
  else if (e.k === "Obj") e.entries.forEach(([, v]) => templatesUsed(v, templates, into));
  return into;
}

/**
 * A program with every template call expanded, one line at a time: the server writes one statement
 * per line, so a streaming program's unfinished last line is left as it is.
 */
export function expandProgram(program: string, templates: Templates): string {
  if (!templates.size) return program;
  return program.split("\n").map(line => {
    const match = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=/.exec(line);
    if (!match || ![...templates.keys()].some(name => line.includes(`${name}(`))) return line;
    try {
      const statement = split(tokenize(line));
      if (statement.length !== 1 || !statement[0]) return line;
      return printStatement(statement[0].id, expandExpr(parseExpression(statement[0].tokens), templates));
    } catch { return line; }
  }).join("\n");
}

/** The definitions a program uses, for a response or a saved document. */
export function definitionsFor(program: string, templates: Templates): TemplateDef[] {
  const used = new Set<string>();
  for (const line of program.split("\n")) {
    if (![...templates.keys()].some(name => line.includes(`${name}(`))) continue;
    try {
      const statement = split(tokenize(line))[0];
      if (statement) templatesUsed(parseExpression(statement.tokens), templates, used);
    } catch { /* an unfinished line calls nothing yet */ }
  }
  return [...used].sort().map(name => templates.get(name)!.def);
}
