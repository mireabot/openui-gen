import { evaluateRoot, type ElementNode } from "@openuidev/lang-core";
import { z } from "zod";
import type { PNode, ProgramTree, Value } from "./nodes.js";
import { skeletonOf } from "./skeleton.js";
import { LIBRARY, PARSER } from "./library.js";
import { PRIMITIVE_BY_NAME } from "./primitives.js";

export const isElement = (value: unknown): value is ElementNode => typeof value === "object" && value !== null && "type" in value && value.type === "element" && "typeName" in value && typeof value.typeName === "string" && "props" in value && typeof value.props === "object" && value.props !== null;
const elements = (value: unknown): ElementNode[] => Array.isArray(value) ? value.flatMap(elements) : isElement(value) ? [value] : [];

export function programTree(program: string, values: unknown): ProgramTree {
  const parsed = PARSER.parse(program);
  if (parsed.meta.errors.length || parsed.meta.unresolved.length || parsed.meta.incomplete) throw new Error(`Invalid server OpenUI program: ${JSON.stringify(parsed.meta)}`);
  const root = evaluateRoot(parsed, { ctx: { getState: () => undefined, resolveRef: (name) => name === "d" ? values : undefined }, library: LIBRARY, store: null });
  if (!isElement(root) || root.typeName !== "Screen") throw new Error("OpenUI program has no Screen");
  const nodes: PNode[] = [];
  const add = (element: ElementNode, address: string): string => {
    const id = element.statementId ?? address;
    const def = PRIMITIVE_BY_NAME.get(element.typeName);
    if (!def) throw new Error(`Unknown server primitive ${element.typeName}`);
    const props: Record<string, Value> = {};
    const children: Record<string, string[]> = {};
    nodes.push({ id, primitive: element.typeName, props, children, line: 1, itemOf: null });
    for (const [key, spec] of Object.entries(def.props)) {
      const value = element.props[key];
      if (spec.meta.role === "node" || spec.meta.role === "nodes") children[key] = elements(value).map((child, index) => add(child, `${id}/${key}/${index}`));
      else if (value !== undefined) props[key] = z.json().parse(value);
    }
    return id;
  };
  const children = elements(root.props.children).map((child, index) => add(child, `part${index}`));
  return { placement: { children, where: "screen", anchor: null }, nodes };
}

export const programSkeleton = (program: string, values: unknown) => skeletonOf(programTree(program, values));
