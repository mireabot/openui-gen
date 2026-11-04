"use client";

import { Component, createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createLibrary, Renderer, useRendererQuery, type ComponentRenderProps, type ElementNode, type OpenUIError } from "@openuidev/react-lang";
import { LIBRARY, PARSER } from "../../../src/lang/library";
import { PRIMITIVES, type PrimitiveDef } from "../../../src/lang/primitives";
import { BE_URL } from "@/lib/be-url";
import type { PNode, Value } from "@/lib/primitives/data";
import { KinoCalculation, KinoPrimitive, KinoProvider } from "./render";

export interface DatasetSeed {
  tool: "sports_dataset";
  args: { run: string };
  result: Record<string, unknown>;
}

const definitions = new Map<string, PrimitiveDef>(PRIMITIVES.map(def => [def.name, def]));
const RuntimeCtx = createContext<{ calculations: ReadonlyMap<string, readonly PNode[]>; dataset: unknown; pending: ReactNode }>({ calculations: new Map(), dataset: undefined, pending: null });

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function element(value: unknown): value is ElementNode {
  return object(value) && value.type === "element" && typeof value.typeName === "string" && object(value.props) && typeof value.partial === "boolean";
}

/** Each can nest arrays at any depth. Flatten before panel selection and rail wrappers. */
export function flattenOpenUIChildren(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenOpenUIChildren);
  return value === null || value === undefined ? [] : [value];
}

function literal(value: unknown): Value {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(literal);
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, literal(item)]));
  throw new Error("OpenUI produced an unsupported prop value.");
}

function referencePath(value: Record<string, unknown>, query: string): string | null {
  if (value.k === "RuntimeRef" && value.n === query) return "";
  if (value.k === "Member" && object(value.obj) && typeof value.field === "string") {
    const parent = referencePath(value.obj, query);
    return parent === null ? null : parent ? `${parent}.${value.field}` : value.field;
  }
  if (value.k === "Index" && object(value.obj) && object(value.index) && value.index.k === "Num" && typeof value.index.v === "number") {
    const parent = referencePath(value.obj, query);
    return parent === null ? null : `${parent}[${value.index.v}]`;
  }
  return null;
}

function calculationValue(value: unknown, query: string): Value {
  if (Array.isArray(value)) return value.map(item => calculationValue(item, query));
  if (!object(value)) return literal(value);
  if (typeof value.k !== "string") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, calculationValue(item, query)]));
  const path = referencePath(value, query);
  if (path !== null) return { $data: path };
  switch (value.k) {
    case "Str": case "Num": case "Bool": return literal(value.v);
    case "Null": return null;
    case "Arr": if (Array.isArray(value.els)) return value.els.map(item => calculationValue(item, query)); break;
    case "Obj": if (Array.isArray(value.entries)) return Object.fromEntries(value.entries.map(entry => {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") throw new Error("Invalid Calculation record.");
      return [entry[0], calculationValue(entry[1], query)];
    })); break;
  }
  throw new Error(`Unsupported Calculation expression ${value.k}.`);
}

function calculationNodes(root: ElementNode, query: string): readonly PNode[] {
  const nodes: PNode[] = [];
  function visit(source: ElementNode): string {
    const id = `${root.statementId}:${nodes.length}`;
    const index = nodes.length;
    nodes.push({ id, primitive: source.typeName, props: {}, children: {}, line: 0, itemOf: null });
    const props: Record<string, Value> = {};
    const children: Record<string, string[]> = {};
    const def = definitions.get(source.typeName);
    if (!def) throw new Error(`Unknown Calculation component ${source.typeName}.`);
    for (const [key, value] of Object.entries(source.props)) {
      const role = def.props[key]?.meta.role;
      if (role === "node" || role === "nodes") children[key] = flattenOpenUIChildren(value).map(child => {
        if (!element(child)) throw new Error(`Unsupported dynamic child in Calculation.${key}.`);
        return visit(child);
      });
      else props[key] = calculationValue(value, query);
    }
    nodes[index] = { id, primitive: source.typeName, props, children, line: 0, itemOf: null };
    return id;
  }
  visit(root);
  return nodes;
}

function calculationsIn(program: string): ReadonlyMap<string, readonly PNode[]> {
  const parsed = PARSER.parse(program);
  const query = parsed.queryStatements.find(statement => statement.toolAST?.k === "Str" && statement.toolAST.v === "sports_dataset")?.statementId;
  const found = new Map<string, readonly PNode[]>();
  function visit(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!element(value)) return;
    if (value.typeName === "Calculation") {
      if (!value.statementId || !query) throw new Error("Calculation requires a named statement and sports_dataset Query.");
      found.set(value.statementId, calculationNodes(value, query));
      return;
    }
    Object.values(value.props).forEach(visit);
  }
  visit(parsed.root);
  return found;
}

function NativeCalculation({ statementId }: ComponentRenderProps) {
  const runtime = useContext(RuntimeCtx);
  const nodes = statementId ? runtime.calculations.get(statementId) : undefined;
  if (!nodes) throw new Error("OpenUI Calculation source was not found.");
  return runtime.dataset === undefined ? <p role="status">Loading calculation…</p> : <KinoCalculation nodes={nodes} data={runtime.dataset} />;
}

function rendererFor(name: string) {
  if (name === "Calculation") return NativeCalculation;
  const def = definitions.get(name);
  return function NativePrimitive({ props, renderNode }: ComponentRenderProps) {
    const slots: Record<string, ReactNode[]> = {};
    const values: Record<string, Value> = {};
    for (const [key, value] of Object.entries(props)) {
      const role = def?.props[key]?.meta.role;
      if (role === "node" || role === "nodes") slots[key] = flattenOpenUIChildren(value).map((child, index) => <span key={index} className="contents">{renderNode(child)}</span>);
      else values[key] = literal(value);
    }
    if (name === "Screen") {
      return <OpenUIScreen placement={values.placement}>{slots.children}</OpenUIScreen>;
    }
    return <KinoPrimitive name={name} props={values} slots={slots} />;
  };
}

function OpenUIScreen({ children, placement }: { children: ReactNode; placement: Value | undefined }) {
  const query = useRendererQuery();
  const { pending } = useContext(RuntimeCtx);
  if (query.errors.length) return null;
  return placement === "sheet" ? <div className="flex min-h-[874px] flex-col bg-black pt-(--safe-top)"><div className="mx-4 mt-2 h-4 rounded-t-[24px]" style={{ background: "var(--ds-surface-filled)" }} /><div className="relative -mt-2 flex flex-1 flex-col gap-7 rounded-t-[24px] px-6 pb-(--safe-bottom)" style={{ background: "var(--ds-surface-screen)", color: "var(--ds-ink-primary)" }}>{query.isLoading ? null : children}{pending}</div></div> : <div className="flex min-h-[874px] flex-col gap-7 px-6 pt-(--safe-top) pb-(--safe-bottom)" style={{ background: "var(--ds-surface-screen)", color: "var(--ds-ink-primary)" }}>{query.isLoading ? null : children}{pending}</div>;
}

const OPENUI_LIBRARY = createLibrary({ root: "Screen", components: Object.values(LIBRARY.components).map(def => ({ ...def, component: rendererFor(def.name) })) });

class RenderBoundary extends Component<{ children: ReactNode; program: string }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidUpdate(previous: Readonly<{ children: ReactNode; program: string }>) {
    if (previous.program !== this.props.program && this.state.error) this.setState({ error: null });
  }
  render() { return this.state.error ? <p role="alert" className="p-6 text-sm text-destructive">OpenUI rendering failed. {this.state.error}</p> : this.props.children; }
}

function OpenUIRuntime({ program, seed, isStreaming, specs, skeleton, pending }: { program: string; seed: DatasetSeed | null; isStreaming: boolean; specs?: Record<string, Record<string, unknown>>; skeleton: boolean; pending: ReactNode }) {
  const [dataset, setDataset] = useState<unknown>(undefined);
  const [errors, setErrors] = useState<OpenUIError[]>([]);
  const calculations = useMemo(() => calculationsIn(program), [program]);
  const toolProvider = useMemo(() => {
    const cache = new Map<string, Promise<unknown>>();
    return { sports_dataset: async (args: Record<string, unknown>) => {
      if (typeof args.run !== "string") throw new Error("sports_dataset requires a run ID.");
      const run = args.run;
      let result = cache.get(run);
      if (!result) {
        result = seed?.args.run === run ? Promise.resolve(seed.result) : fetch(`${BE_URL}/tools/sports_dataset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run }) }).then(async response => {
          const body: unknown = await response.json();
          if (!response.ok) throw new Error(object(body) && typeof body.error === "string" ? body.error : `sports_dataset failed (${response.status}).`);
          if (!object(body)) throw new Error("sports_dataset returned invalid data.");
          return body;
        });
        result = result.catch(error => { cache.delete(run); throw error; });
        cache.set(run, result);
      }
      const data = await result;
      setDataset(data);
      return data;
    } };
  }, [seed]);
  return <KinoProvider specs={specs} skeleton={skeleton}><RuntimeCtx value={{ calculations, dataset, pending }}>
    <Renderer response={program} library={OPENUI_LIBRARY} isStreaming={isStreaming} toolProvider={toolProvider} onError={setErrors} publishObservability={false} />
    {errors.length > 0 && <ul role="alert" className="m-6 list-disc rounded-lg border border-destructive/40 p-3 pl-7 text-sm text-destructive">{errors.map((error, index) => <li key={index}>{error.message}</li>)}</ul>}
  </RuntimeCtx></KinoProvider>;
}

/** `pending` draws under the finished parts: the skeleton of the ones still being written. */
export function OpenUIPreview({ program, seed, theme, specs, isStreaming, skeleton = false, pending = null }: { program: string; seed: DatasetSeed | null; theme?: CSSProperties; specs?: Record<string, Record<string, unknown>>; isStreaming: boolean; skeleton?: boolean; pending?: ReactNode }) {
  return <div style={{ ...theme, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif' }}><RenderBoundary program={program}><OpenUIRuntime program={program} seed={seed} specs={specs} isStreaming={isStreaming} skeleton={skeleton} pending={pending} /></RenderBoundary></div>;
}
