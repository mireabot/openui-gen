import { execFileSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import type { WriterUsage } from "../lang/compiler.js";
import { log } from "../log.js";
import { anthropicMessages, anthropicSchema, type ClaudeCallOptions } from "./anthropic.js";
import type { Completion, CompletionSender } from "./structured-completion.js";

/**
 * Claude through the local `claude` CLI, on the signed-in plan's limits instead of API spend. Each
 * call is one bare `claude -p` with the stage's own model, effort, prompt and output budget, and no
 * tools, settings, CLAUDE.md, MCP servers or session on disk. Local debugging only.
 */

const CALL_TIMEOUT_MS = 5 * 60_000;

/** The CLI bills an API key over the plan when it finds one, and `.env` puts one in this process. */
export function planEnv(env: NodeJS.ProcessEnv, maxTokens: number): NodeJS.ProcessEnv {
  const kept = Object.entries(env).filter(([name]) => !name.startsWith("ANTHROPIC_"));
  return { ...Object.fromEntries(kept), CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxTokens) };
}

/** The last line of the CLI's stream. */
export interface PlanResult {
  readonly is_error?: boolean;
  readonly subtype?: string;
  readonly stop_reason?: string | null;
  readonly result?: string;
  readonly structured_output?: unknown;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number; readonly cache_creation_input_tokens?: number; readonly cache_read_input_tokens?: number };
  readonly modelUsage?: Record<string, unknown>;
}

const OUTPUT_LIMIT = /exceeded the \d+ output token maximum/;

/** Cost is 0: the call spent plan limits, not money, and traces should say so. */
export function planCompletion(result: PlanResult, requestedModel: string): Completion {
  // The CLI reports an output limit as an error; the API reports it as a stop reason, which callers retry.
  const cutOff = result.is_error === true && OUTPUT_LIMIT.test(result.result ?? "");
  if (result.is_error && !cutOff) throw new Error(`Claude Code ${result.subtype ?? "error"}: ${(result.result ?? "no detail").slice(0, 600)}`);
  const usage = result.usage ?? {};
  return {
    model: Object.keys(result.modelUsage ?? {})[0] ?? requestedModel,
    finishReason: cutOff || result.stop_reason === "max_tokens" ? "length" : result.stop_reason === "refusal" ? "content_filter" : "stop",
    text: cutOff ? "" : result.structured_output === undefined ? result.result ?? "" : JSON.stringify(result.structured_output),
    usage: {
      promptTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      completionTokens: usage.output_tokens ?? 0,
      costUSD: 0,
    },
  };
}

interface PlanCall {
  readonly model: string;
  readonly maxTokens: number;
  readonly messages: readonly { readonly role: "system" | "user"; readonly content: string }[];
  readonly effort: ClaudeCallOptions["effort"];
  readonly schema?: unknown;
  readonly onText?: (delta: string) => void;
}

/** One CLI run. It stops at once if the CLI reports any auth source but the plan's login. */
function runPlan(call: PlanCall): Promise<PlanResult> {
  const { system, messages } = anthropicMessages(call.messages);
  const prompt = messages.flatMap(turn => typeof turn.content === "string" ? [turn.content] : turn.content.flatMap(block => block.type === "text" ? [block.text] : [])).join("\n\n");
  const args = [
    "-p", "--no-session-persistence", "--setting-sources", "", "--strict-mcp-config", "--disable-slash-commands",
    "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--model", call.model,
    ...(call.effort ? ["--effort", call.effort] : []),
    "--system-prompt", system.map(block => block.text).join("\n\n"),
    ...(call.schema ? ["--json-schema", JSON.stringify(anthropicSchema(call.schema))] : []),
    "--tools", "",
  ];
  return new Promise((resolve, reject) => {
    // Outside the repo, so the project's files are no part of the call.
    const child = spawn("claude", args, { cwd: tmpdir(), env: planEnv(process.env, call.maxTokens), stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => stop(new Error(`Claude Code took over ${CALL_TIMEOUT_MS / 1000} s`)), CALL_TIMEOUT_MS);
    let result: PlanResult | undefined;
    let stderr = "";
    const stop = (error: Error) => { clearTimeout(timer); child.kill(); reject(error); };
    child.on("error", stop);
    child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-600); });
    child.stdin.on("error", () => {}); // A CLI that dies early reports through `close`.
    child.stdin.end(prompt);
    createInterface({ input: child.stdout }).on("line", line => {
      let event: { type?: string; subtype?: string; apiKeySource?: string; event?: { delta?: { type?: string; text?: string } } } & PlanResult;
      try { event = JSON.parse(line); } catch { return; }
      if (event.type === "system" && event.subtype === "init" && event.apiKeySource !== "none") {
        stop(new Error(`Claude Code would bill ${event.apiKeySource} instead of the plan`));
      } else if (event.type === "stream_event" && event.event?.delta?.type === "text_delta") {
        call.onText?.(event.event.delta.text ?? "");
      } else if (event.type === "result") {
        result = event;
      }
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (result) resolve(result);
      else reject(new Error(`Claude Code exited ${code} with no result: ${stderr.trim() || "no detail"}`));
    });
  });
}

/** The structured-completion transport on the plan. The API's refusal fallback has no equivalent here. */
export function claudeCodeSender(options: ClaudeCallOptions = {}): CompletionSender {
  return async request => planCompletion(await runPlan({
    model: request.model, maxTokens: request.maxTokens, messages: request.messages, effort: options.effort, schema: request.schema,
  }), request.model);
}

/** The screen writer on the plan: text deltas feed the statement stream as they arrive. */
export async function claudeCodeWriter(input: readonly { role: "system" | "user"; content: string }[], model: string, onText: (delta: string) => void, maxTokens = 4_000, options: ClaudeCallOptions = {}): Promise<{ text: string; usage: WriterUsage }> {
  try {
    let written = "";
    const result = await runPlan({ model, maxTokens, messages: input, effort: options.effort, onText: delta => { written += delta; onText(delta); } });
    const { finishReason, usage } = planCompletion(result, model);
    if (finishReason === "length") throw new Error("Model output reached its token limit before finishing the layout");
    if (finishReason === "content_filter") throw new Error("Model stopped with content_filter");
    if (!written.trim()) throw new Error("Model returned empty layout content");
    return { text: written, usage: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, cost: 0 } };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error("claude code writer failed", { stage: "compose", model, detail });
    throw new Error(`compose: ${detail}`, { cause: error });
  }
}

/** Boot check for debug mode: the CLI is installed and signed in. */
export function assertClaudeCode(): void {
  let status: { loggedIn?: boolean };
  try {
    status = JSON.parse(execFileSync("claude", ["auth", "status"], { env: planEnv(process.env, 1), encoding: "utf8" }));
  } catch (error) {
    throw new Error(`Debug mode needs the Claude Code CLI: ${(error as Error).message}\nInstall it, or set GENERATION_MODE=api.`);
  }
  if (!status.loggedIn) throw new Error("Debug mode needs a Claude Code login. Run `claude auth login`, or set GENERATION_MODE=api.");
}
