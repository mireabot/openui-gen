import Anthropic from "@anthropic-ai/sdk";
import type { ChatRequest } from "@openrouter/sdk/models";
import { config, requireKey } from "../config.js";
import { providerErrorDetail } from "./provider-error.js";
import type { WriterUsage } from "./openrouter-writer.js";
import { log } from "../log.js";
import type { CompletionEnvelope, CompletionSender } from "./structured-completion.js";

/**
 * Claude through the Anthropic API. Call sites keep building the OpenRouter-shaped request; this
 * adapter maps it to Messages, marks the stable prefix for prompt caching, and prices the usage
 * (the API reports tokens, not dollars). The API keeps no conversation either: callers still replay
 * their stored turns, and the cache makes that replay cheap.
 */

let client: Anthropic | undefined;
const anthropic = () => client ??= new Anthropic({ apiKey: requireKey("ANTHROPIC_API_KEY") });

/** USD per million tokens: input, 5-minute cache write, cache read, output (platform.claude.com pricing, Oct 2026). */
const PRICES: Readonly<Record<string, readonly [number, number, number, number]>> = {
  "claude-opus-5-5": [4, 5, 0.2, 20],
  "claude-opus-5": [5, 6.25, 0.5, 25],
  // A server-side refusal fallback target for Opus 5 and Sonnet 5.5.
  "claude-opus-4-8": [5, 6.25, 0.5, 25],
  "claude-sonnet-5-5": [2, 2.5, 0.1, 10],
  "claude-haiku-5-5": [0.1, 0.125, 0.01, 0.5],
};
type Usage = Pick<Anthropic.Usage, "input_tokens" | "output_tokens" | "cache_creation_input_tokens" | "cache_read_input_tokens">;
export function anthropicCost(model: string, usage: Usage): number | undefined {
  const price = PRICES[model];
  if (!price) return undefined;
  const [input, write, read, output] = price;
  return (usage.input_tokens * input + (usage.cache_creation_input_tokens ?? 0) * write + (usage.cache_read_input_tokens ?? 0) * read + usage.output_tokens * output) / 1e6;
}
/** Input as the monitor counts it: fresh, written and read prompt tokens together. */
const promptTokens = (usage: Usage) => usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);

/** Which provider serves the LLM stages: Anthropic once its key is set, unless LLM_PROVIDER says otherwise. */
export const usesAnthropic = () => (config().LLM_PROVIDER ?? (config().ANTHROPIC_API_KEY ? "anthropic" : "openrouter")) === "anthropic";

type Message = { readonly role: string; readonly content?: unknown };
const text = (content: unknown): string => typeof content === "string" ? content
  : Array.isArray(content) ? content.map(part => typeof part === "object" && part && "text" in part ? String(part.text) : "").join("") : "";
const CACHED = { type: "ephemeral" } as const;

/**
 * Leading system messages become the cached system prompt. A later system message (the follow-up's
 * saved-screen state) is context for the next user turn, so it rides in front of that turn. Turns
 * of the same role merge, and the turn before the newest user message closes the cached prefix.
 */
export function anthropicMessages(messages: readonly Message[]): { system: Anthropic.TextBlockParam[]; messages: Anthropic.MessageParam[] } {
  const leading = messages.findIndex(message => message.role !== "system");
  const head = leading < 0 ? messages : messages.slice(0, leading);
  const system = head.map(message => text(message.content)).filter(Boolean).join("\n\n");
  const turns: { role: "user" | "assistant"; parts: string[] }[] = [];
  let pending: string[] = [];
  for (const message of leading < 0 ? [] : messages.slice(leading)) {
    const content = text(message.content);
    if (message.role === "system") { pending.push(`<context>\n${content}\n</context>`); continue; }
    const role = message.role === "assistant" ? "assistant" : "user";
    const parts = role === "user" ? [...pending, content] : [content];
    if (role === "user") pending = [];
    if (turns.at(-1)?.role === role) turns.at(-1)!.parts.push(...parts); else turns.push({ role, parts });
  }
  if (pending.length) turns.push({ role: "user", parts: pending });
  const out: Anthropic.MessageParam[] = turns.map((turn, index) => ({ role: turn.role, content: [{
    type: "text", text: turn.parts.join("\n\n"),
    // The replayed conversation is byte-stable between follow-ups: cache everything before the newest turn.
    ...(index === turns.length - 2 ? { cache_control: CACHED } : {}),
  }] }));
  return { system: system ? [{ type: "text", text: system, cache_control: CACHED }] : [], messages: out };
}

/**
 * Structured outputs accept a subset of JSON Schema. Constraints it rejects are dropped here and
 * still enforced by each caller's own validator (zod or ajv) after the response arrives.
 */
export function anthropicSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(anthropicSchema);
  if (!schema || typeof schema !== "object") return schema;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    // Keys under these maps are property or definition names ("maxItems" can be a field), not keywords.
    if (["properties", "$defs", "definitions"].includes(key) && value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, anthropicSchema(child)]));
      continue;
    }
    if (["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "maxItems", "$schema"].includes(key)) continue;
    if (key === "minItems" && typeof value === "number" && value > 1) continue;
    if (key === "pattern" && typeof value === "string" && /\\[bB]|\(\?[=!<]/.test(value)) continue;
    result[key] = anthropicSchema(value);
  }
  if (result.type === "object" || "properties" in result) result.additionalProperties = false;
  return result;
}

/**
 * Per-call settings. `effort` sets thinking depth and spend (each model has its own default).
 * `fallbacks` opts into the API's server-side refusal fallback ("default" routing by refusal
 * category); only Opus and Sonnet take it, Haiku has no server-side fallback.
 */
export interface ClaudeCallOptions {
  readonly effort?: "low" | "medium" | "high" | "xhigh" | "max";
  readonly fallbacks?: boolean;
}
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** A structured-completion transport on the Anthropic API, using `model` whatever the request names. */
export function anthropicSender(model: string, options: ClaudeCallOptions = {}): CompletionSender {
  return async (request: ChatRequest): Promise<CompletionEnvelope> => {
    const { system, messages } = anthropicMessages(request.messages as readonly Message[]);
    const format = request.responseFormat && "jsonSchema" in request.responseFormat ? request.responseFormat.jsonSchema.schema : undefined;
    const output = format || options.effort ? { output_config: {
      ...(format ? { format: { type: "json_schema" as const, schema: anthropicSchema(format) as Record<string, unknown> } } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
    } } : {};
    const params = { model, max_tokens: request.maxTokens ?? 2_000, system, messages, ...output };
    // A fallback answer is billed at the fallback model's rates: price it by the model that served it.
    const response = options.fallbacks
      ? await anthropic().beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" })
      : await anthropic().messages.create(params);
    const content = response.content.flatMap(block => block.type === "text" ? [block.text] : []).join("");
    const finishReason = response.stop_reason === "max_tokens" ? "length" : response.stop_reason === "refusal" ? "content_filter" : "stop";
    return { model: response.model, choices: [{ finishReason, message: { content } }],
      usage: { promptTokens: promptTokens(response.usage), completionTokens: response.usage.output_tokens, cost: anthropicCost(response.model, response.usage) ?? null } };
  };
}

/** The screen writer on the Anthropic API: text deltas feed the statement stream as they arrive. */
export async function anthropicWriter(input: readonly { role: "system" | "user"; content: string }[], model: string, onText: (delta: string) => void, maxTokens = 4_000, options: ClaudeCallOptions = {}): Promise<{ text: string; usage: WriterUsage }> {
  try {
    const { system, messages } = anthropicMessages(input);
    const params = { model, max_tokens: maxTokens, system, messages, ...(options.effort ? { output_config: { effort: options.effort } } : {}) };
    let written = "";
    const append = (delta: string) => { written += delta; onText(delta); };
    // A mid-stream fallback keeps the streamed text and continues it on the fallback model.
    let message: { readonly model: string; readonly stop_reason: string | null; readonly usage: Usage };
    if (options.fallbacks) {
      const stream = anthropic().beta.messages.stream({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" });
      stream.on("text", append);
      message = await stream.finalMessage();
    } else {
      const stream = anthropic().messages.stream(params);
      stream.on("text", append);
      message = await stream.finalMessage();
    }
    if (message.stop_reason === "max_tokens") throw new Error("Model output reached its token limit before finishing the layout");
    if (message.stop_reason === "refusal") throw new Error("Model stopped with content_filter");
    if (!written.trim()) throw new Error("Model returned empty layout content");
    return { text: written, usage: { promptTokens: promptTokens(message.usage), completionTokens: message.usage.output_tokens, reasoningTokens: 0, cost: anthropicCost(message.model, message.usage) } };
  } catch (error) {
    const detail = providerErrorDetail(error);
    log.error("anthropic writer failed", { stage: "compose", model, detail });
    throw new Error(`compose: ${detail}`, { cause: error });
  }
}
