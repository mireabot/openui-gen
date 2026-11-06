import { z } from "zod";
import { NUMBER_FORMATS } from "../lang/props.js";

const DATE_PRECISIONS = ["month", "day", "time"] as const;
import { iconProblem } from "../primitives/icons.js";
import { TOKENS } from "../primitives/tokens.js";
import type { WebSource } from "./web-research.js";

export const DATA_KINDS = ["text", "number", "boolean", "date", "status", "color", "icon", "image", "object", "list"] as const;
export const DATA_FORMATS = ["none", ...NUMBER_FORMATS, ...DATE_PRECISIONS] as const;
const path = z.string().max(180).regex(/^[a-z][A-Za-z0-9]*(?:\[\])?(?:\.[a-z][A-Za-z0-9]*(?:\[\])?)*$/);
export const DataFieldSchema = z.object({ path, kind: z.enum(DATA_KINDS), format: z.enum(DATA_FORMATS) }).strict();
export type DataField = z.infer<typeof DataFieldSchema>;
export const CalculationSchema = z.object({ path, operation: z.enum(["subtract", "sum"]), inputs: z.array(path).min(1).max(12) }).strict();
export type Calculation = z.infer<typeof CalculationSchema>;
export type MockValue = string | number | boolean | null | MockValue[] | { [key: string]: MockValue };
export interface MockDataset {
  readonly source: "mock" | "web" | "mixed";
  readonly fields: readonly DataField[];
  readonly values: { [key: string]: MockValue };
  readonly sources?: readonly WebSource[];
  readonly searchedAt?: string;
}

export interface DataShape {
  field?: DataField;
  readonly children: Map<string, DataShape>;
  item?: DataShape;
}
const shape = (): DataShape => ({ children: new Map() });
const unsafe = new Set(["__proto__", "prototype", "constructor"]);

/** The most segments a data path may have. Sports packs check their nesting budget against it. */
export const MAX_PATH_SEGMENTS = 10;

/** Flat paths keep the model's response schema small, including nested Repeat item fields. */
export function dataShape(fields: readonly DataField[]): DataShape {
  const root = shape();
  for (const field of fields) {
    const segments = field.path.split(".");
    if (segments.length > MAX_PATH_SEGMENTS) throw new Error(`Data path is too deep: ${field.path}`);
    let current = root;
    for (const segment of segments) {
      const key = segment.replace(/\[\]$/, "");
      if (unsafe.has(key)) throw new Error(`Unsafe data key: ${key}`);
      let child = current.children.get(key);
      if (!child) { child = shape(); current.children.set(key, child); }
      current = child;
      if (segment.endsWith("[]")) { current.item ??= shape(); current = current.item; }
    }
    if (current.field) throw new Error(`Duplicate data path: ${field.path}`);
    if (field.kind === "number" ? !NUMBER_FORMATS.includes(field.format as never)
      : field.kind === "date" ? !DATE_PRECISIONS.includes(field.format as never) : field.format !== "none") {
      throw new Error(`Invalid format for ${field.path}: ${field.format}`);
    }
    current.field = field;
  }
  checkShape(root, "root");
  return root;
}

function checkShape(node: DataShape, path: string): void {
  const kind = node.field?.kind ?? (node.item ? "list" : "object");
  if (kind === "list") {
    if (!node.item || node.children.size) throw new Error(`List needs one item shape: ${path}`);
    checkShape(node.item, `${path}[]`);
  } else if (kind === "object") {
    if (node.item || !node.children.size) throw new Error(`Object needs fields: ${path}`);
    for (const [key, child] of node.children) checkShape(child, `${path}.${key}`);
  } else if (node.item || node.children.size) throw new Error(`Scalar also has children: ${path}`);
}

/** `allowUnknown` (web data): a number or date may be null when the sources do not publish it. */
export function validateValues(node: DataShape, value: unknown, path = "root", allowUnknown = false, listMax = 12): asserts value is MockValue {
  const kind = node.field?.kind ?? (node.item ? "list" : "object");
  if (allowUnknown && value === null && (kind === "number" || kind === "date")) return;
  if (kind === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected object at ${path}`);
    const object = value as Record<string, unknown>;
    if (Object.keys(object).some((key) => !node.children.has(key))) throw new Error(`Undeclared field at ${path}`);
    for (const [key, child] of node.children) validateValues(child, object[key], `${path}.${key}`, allowUnknown, listMax);
  } else if (kind === "list") {
    if (!Array.isArray(value) || value.length > listMax) throw new Error(`Expected at most ${listMax} items at ${path}`);
    for (const item of value) validateValues(node.item!, item, `${path}[]`, allowUnknown, listMax);
  } else if (kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Expected finite number at ${path}`);
    if (["integer", "count"].includes(node.field!.format) && !Number.isInteger(value)) throw new Error(`Expected integer at ${path}`);
    if (node.field!.format === "percent" && (value < 0 || value > 100)) throw new Error(`Percent out of range at ${path}`);
  } else if (kind === "boolean") {
    if (typeof value !== "boolean") throw new Error(`Expected boolean at ${path}`);
  } else {
    if (typeof value !== "string" || value.length > 1000) throw new Error(`Expected short string at ${path}`);
    if (kind === "date" && !validDate(value, node.field!.format)) throw new Error(`Expected ISO date at ${path}`);
    if (kind === "status" && !["good", "warn", "bad", "neutral"].includes(value)) throw new Error(`Invalid status at ${path}`);
    if (kind === "color" && !TOKENS.ink.includes(value as never)) throw new Error(`Invalid colour token at ${path}`);
    if (kind === "icon" && iconProblem(value)) throw new Error(`Invalid SF Symbol at ${path}`);
    // Mock media stays a flat colour placeholder, never an invented remote URL.
    if (kind === "image" && !TOKENS.ink.includes(value as never)) throw new Error(`Invalid image placeholder at ${path}`);
  }
}

function validDate(value: string, precision: string): boolean {
  if (precision === "month") return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const head = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return false;
  const parsed = new Date(`${head}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== head) return false;
  return precision === "day" ? value === head
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

/** Resolve [] as every item, or the index of a surrounding calculation's item scope. */
export function valuesAt(values: MockValue, path: string, scope: ReadonlyMap<string, number> = new Map()): MockValue[] {
  let current: MockValue[] = [values];
  let prefix = "";
  for (const segment of path.split(".")) {
    prefix = prefix ? `${prefix}.${segment}` : segment;
    const key = segment.replace(/\[\]$/, "");
    const children: MockValue[] = [];
    for (const value of current) {
      const child = value && typeof value === "object" && !Array.isArray(value) ? value[key] : undefined;
      if (child === undefined) continue;
      if (!segment.endsWith("[]")) children.push(child);
      else if (Array.isArray(child)) {
        const index = scope.get(prefix);
        if (index === undefined) children.push(...child);
        else if (child[index] !== undefined) children.push(child[index]);
      }
    }
    current = children;
  }
  return current;
}
