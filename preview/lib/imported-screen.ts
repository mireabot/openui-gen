import { z } from "zod";
import { TemplateDefSchema, type TemplateDef } from "../../src/lang/templates";

const Result = z.record(z.string(), z.unknown());
const Imported = z.object({
  prompt: z.string().optional(),
  program: z.string().min(1),
  /** The component templates the program calls; absent, the preview's bundled set expands them. */
  templates: z.array(TemplateDefSchema).optional(),
  /** A saved generation or an export carries `snapshot`; `dataset` or a bare `result` also work for a hand-written schema. */
  snapshot: z.object({ result: Result }).loose().optional(),
  dataset: z.object({ result: Result }).loose().optional(),
  result: Result.optional(),
  turns: z.array(z.object({ role: z.string(), content: z.string() }).loose()).optional(),
}).loose();

export interface ImportedScreen {
  readonly prompt: string;
  readonly program: string;
  readonly templates?: readonly TemplateDef[];
  readonly seed: { readonly tool: "sports_dataset"; readonly args: { readonly run: string }; readonly result: Record<string, unknown> };
}

/** A schema to show with no model call: saved generation, export or hand-written. Throws what is wrong with it. */
export function parseImportedScreen(value: unknown): ImportedScreen {
  const parsed = Imported.safeParse(value);
  if (!parsed.success) throw new Error(`Not a screen schema: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "file"} ${issue.message}`).join("; ")}`);
  const { program, templates, prompt, snapshot, dataset, result, turns } = parsed.data;
  const values = snapshot?.result ?? dataset?.result ?? result;
  if (!values) throw new Error("The schema has no data: expected snapshot, dataset or result");
  // The seed answers the program's own Query only under the run it names; otherwise the preview would ask the server.
  const run = /Query\(\s*"sports_dataset"\s*,\s*\{\s*run:\s*"([^"]+)"/.exec(program)?.[1];
  if (!run) throw new Error('The program has no Query("sports_dataset", {run: "..."}) to read its data');
  return { prompt: prompt ?? turns?.find(turn => turn.role === "user")?.content ?? "", program, ...(templates?.length ? { templates } : {}), seed: { tool: "sports_dataset", args: { run }, result: values } };
}
