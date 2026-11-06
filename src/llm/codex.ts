import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { config } from "../config.js";
import type { WriterUsage } from "../lang/compiler.js";
import type { Completion, CompletionSender } from "./structured-completion.js";

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("item.completed"), item: z.object({ type: z.string(), text: z.string().optional(), phase: z.string().optional() }).loose() }).loose(),
  z.object({ type: z.literal("turn.completed"), usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).loose() }).loose(),
  z.object({ type: z.literal("turn.failed"), error: z.object({ message: z.string() }).loose() }).loose(),
  z.object({ type: z.literal("error"), message: z.string() }).loose(),
]);

/** Only final agent messages are output. Reasoning and tool messages never reach the screen. */
export class CodexOutput {
  private text = "";
  private usage: Completion["usage"] | undefined;
  private failure: string | undefined;

  read(line: string): void {
    let json: unknown;
    try { json = JSON.parse(line); } catch { return; }
    const parsed = Event.safeParse(json);
    if (!parsed.success) return;
    const event = parsed.data;
    switch (event.type) {
      case "item.completed":
        if (event.item.type === "agent_message" && event.item.phase !== "commentary") this.text = event.item.text ?? "";
        break;
      case "turn.completed":
        this.usage = { promptTokens: event.usage.input_tokens, completionTokens: event.usage.output_tokens, costUSD: 0 };
        break;
      case "turn.failed": this.failure = event.error.message; break;
      case "error": this.failure = event.message; break;
    }
  }

  completion(model: string): Completion {
    if (this.failure) throw new Error(`Codex: ${this.failure}`);
    if (!this.usage) throw new Error("Codex exited without a completed turn");
    if (!this.text.trim()) throw new Error("Codex returned empty content");
    return { model, finishReason: "stop", text: this.text, usage: this.usage };
  }
}

/** Keep the signed-in CLI account as the auth source, even when the server has API keys. */
export const codexEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => Object.fromEntries(
  Object.entries(env).filter(([key]) => !["OPENAI_API_KEY", "CODEX_API_KEY"].includes(key) && !key.startsWith("ANTHROPIC_")),
);

/** Strict output schemas require every property. Optional fields become nullable. */
export function codexSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(codexSchema);
  const parsed = z.record(z.string(), z.unknown()).safeParse(schema);
  if (!parsed.success) return schema;
  const node = parsed.data;
  const result = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, codexSchema(value)]));
  const properties = z.record(z.string(), z.unknown()).safeParse(node.properties);
  if (properties.success) {
    const required = new Set(z.array(z.string()).catch([]).parse(node.required));
    result.properties = Object.fromEntries(Object.entries(properties.data).map(([name, field]) => [name,
      required.has(name) ? codexSchema(field) : { anyOf: [codexSchema(field), { type: "null" }] },
    ]));
    result.required = Object.keys(properties.data);
    result.additionalProperties = false;
  }
  return result;
}

async function runCodex(messages: readonly { role: "system" | "user"; content: string }[], schema?: Record<string, unknown>): Promise<Completion> {
  const cfg = config();
  const directory = await mkdtemp(path.join(tmpdir(), "openui-codex-"));
  try {
    const schemaFile = path.join(directory, "schema.json");
    if (schema) await writeFile(schemaFile, JSON.stringify(codexSchema(schema)));
    const args = [
      "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only",
      "--model", cfg.CODEX_MODEL, "-c", `model_reasoning_effort="${cfg.CODEX_EFFORT}"`,
      "-c", "features.shell_tool=false", "-c", "features.apps=false", "-c", "features.view_image=false", "-c", 'web_search="disabled"',
      "--json", ...(schema ? ["--output-schema", schemaFile] : []), "-",
    ];
    const prompt = ["Generate only the requested response. Do not use tools, inspect files, or add commentary. Follow the supplied system instructions and return only the final content.",
      ...messages.map(message => `<${message.role}>\n${message.content}\n</${message.role}>`)].join("\n\n");
    return await new Promise<Completion>((resolve, reject) => {
      const child = spawn("codex", args, { cwd: directory, env: codexEnv(process.env), stdio: ["pipe", "pipe", "pipe"] });
      const output = new CodexOutput();
      let stderr = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("Codex took over 300 seconds")); }, 300_000);
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-1000); });
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
      createInterface({ input: child.stdout }).on("line", line => output.read(line));
      child.on("close", code => {
        clearTimeout(timer);
        try {
          const result = output.completion(cfg.CODEX_MODEL);
          if (code !== 0) throw new Error(`Codex exited ${code}: ${stderr.trim() || "no detail"}`);
          resolve(result);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          reject(new Error(`${detail}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
        }
      });
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export const codexSender = (): CompletionSender => request => runCodex(request.messages, request.schema);

/** The CLI emits completed messages rather than token deltas. Feed the final text through the same compiler. */
export async function codexWriter(messages: readonly { role: "system" | "user"; content: string }[], onText: (text: string) => void): Promise<{ text: string; usage: WriterUsage }> {
  const result = await runCodex(messages);
  onText(result.text);
  return { text: result.text, usage: { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, cost: 0 } };
}

export function assertCodex(): void {
  const result = spawnSync("codex", ["login", "status"], { env: codexEnv(process.env), encoding: "utf8", timeout: 10_000 });
  if (result.error || result.status !== 0) throw new Error(`Codex mode needs the Codex CLI and a login. Run codex login. ${result.error?.message ?? result.stderr.trim()}`);
  if (!`${result.stdout}${result.stderr}`.includes("Logged in using ChatGPT")) throw new Error("Codex mode needs ChatGPT login. Run codex login instead of API-key login.");
}
