"use client";

import { Children, Component, createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createLibrary, Renderer, useRendererQuery, type ComponentRenderProps, type OpenUIError } from "@openuidev/react-lang";
import { LIBRARY } from "../../../src/lang/library";
import { expandProgram, templateSet, type TemplateDef } from "../../../src/lang/templates";
import SPORTS_INDEX from "../../../catalog/openui/sports-components.json";
import { PRIMITIVES, type PrimitiveDef } from "../../../src/lang/primitives";
import { BE_URL } from "@/lib/be-url";
import type { Value } from "@/lib/primitives/data";
import { DesignSystemPrimitive, DesignSystemProvider } from "./render";

export interface DatasetSeed {
  tool: "sports_dataset";
  args: { run: string };
  result: Record<string, unknown>;
}

const definitions = new Map<string, PrimitiveDef>(PRIMITIVES.map(def => [def.name, def]));
const RuntimeCtx = createContext<{ pending: ReactNode; layout: "screen" | "inline" }>({ pending: null, layout: "screen" });

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function rendererFor(name: string) {
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
    return <DesignSystemPrimitive name={name} props={values} slots={slots} />;
  };
}

/** A top-level block: the screen has no horizontal padding, so each block carries the 16 inset. Rails and bleeding dividers reach back to the edge through --inset. */
const Blocks = ({ children }: { children: ReactNode }) => <>{Children.map(children, child => <div className="min-w-0 px-(--inset)">{child}</div>)}</>;
const SCREEN_INSET = { "--inset": "16px" } as CSSProperties;

function OpenUIScreen({ children, placement }: { children: ReactNode; placement: Value | undefined }) {
  const query = useRendererQuery();
  const { pending, layout } = useContext(RuntimeCtx);
  if (query.errors.length) return null;
  if (layout === "inline") return <div className="flex min-w-0 flex-col gap-4" style={{ color: "var(--ds-ink-primary)" }}>{query.isLoading ? null : children}{pending}</div>;
  return placement === "sheet" ? <div className="flex min-h-[874px] flex-col bg-black pt-(--safe-top)"><div className="mx-4 mt-2 h-4 rounded-t-[24px]" style={{ background: "var(--ds-surface-filled)" }} /><div className="relative -mt-2 flex flex-1 flex-col gap-7 rounded-t-[24px] pb-(--safe-bottom)" style={{ ...SCREEN_INSET, background: "var(--ds-surface-screen)", color: "var(--ds-ink-primary)" }}>{query.isLoading ? null : <Blocks>{children}</Blocks>}<Blocks>{pending}</Blocks></div></div> : <div className="flex min-h-[874px] flex-col gap-7 pt-(--safe-top) pb-(--safe-bottom)" style={{ ...SCREEN_INSET, background: "var(--ds-surface-screen)", color: "var(--ds-ink-primary)" }}>{query.isLoading ? null : <Blocks>{children}</Blocks>}<Blocks>{pending}</Blocks></div>;
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

function OpenUIRuntime({ program, seed, isStreaming, specs, skeleton, pending, layout }: { program: string; seed: DatasetSeed | null; isStreaming: boolean; specs?: Record<string, Record<string, unknown>>; skeleton: boolean; pending: ReactNode; layout: "screen" | "inline" }) {
  const [errors, setErrors] = useState<OpenUIError[]>([]);
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
      return result;
    } };
  }, [seed]);
  return <DesignSystemProvider specs={specs} skeleton={skeleton}><RuntimeCtx value={{ pending, layout }}>
    <Renderer response={program} library={OPENUI_LIBRARY} isStreaming={isStreaming} toolProvider={toolProvider} onError={setErrors} publishObservability={false} />
    {errors.length > 0 && <ul role="alert" className="m-6 list-disc rounded-lg border border-destructive/40 p-3 pl-7 text-sm text-destructive">{errors.map((error, index) => <li key={index}>{error.message}</li>)}</ul>}
  </RuntimeCtx></DesignSystemProvider>;
}

/** The component templates bundled with the preview, for programs that arrive without their own. */
const BUNDLED_TEMPLATES = (SPORTS_INDEX as { templates: TemplateDef[] }).templates;

/**
 * `pending` draws under the finished parts: the skeleton of the ones still being written. The program
 * calls Sports components by name; they expand with `templates` (the run's own, else the bundled set)
 * before the renderer sees them, the way every client draws primitives only.
 */
export function OpenUIPreview({ program, templates = null, seed, theme, specs, isStreaming, skeleton = false, pending = null, layout = "screen" }: { program: string; templates?: readonly TemplateDef[] | null; seed: DatasetSeed | null; theme?: CSSProperties; specs?: Record<string, Record<string, unknown>>; isStreaming: boolean; skeleton?: boolean; pending?: ReactNode; layout?: "screen" | "inline" }) {
  const definitions = useMemo(() => templateSet(templates ?? BUNDLED_TEMPLATES), [templates]);
  const expanded = useMemo(() => expandProgram(program, definitions), [program, definitions]);
  return <div style={{ ...theme, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif' }}><RenderBoundary program={expanded}><OpenUIRuntime program={expanded} seed={seed} specs={specs} isStreaming={isStreaming} skeleton={skeleton} pending={pending} layout={layout} /></RenderBoundary></div>;
}
