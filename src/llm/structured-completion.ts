import type { ChatRequest, ChatResult } from "@openrouter/sdk/models";
import type { SendChatCompletionRequestResponse } from "@openrouter/sdk/models/operations";
import { z } from "zod";
import { log } from "../log.js";
import { providerErrorDetail } from "./provider-error.js";
import { samplingParameters } from "./model.js";

export interface CompletionUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUSD: number | undefined;
}

export interface StructuredCompletionHooks {
  readonly usage?: (report: { model: string; usage: CompletionUsage; attempt: number; ms: number }) => void;
  readonly retry?: (attempt: number, detail: string) => void;
}

/** The non-streaming response fields structured completion reads; OpenRouter's ChatResult and the Anthropic adapter both supply them. */
export interface CompletionEnvelope {
  readonly model: string;
  readonly choices: readonly { readonly finishReason?: string | null; readonly message: { readonly content?: unknown } }[];
  readonly usage?: { readonly promptTokens?: number; readonly completionTokens?: number; readonly cost?: number | null } | undefined;
}
/** Injectable transport for offline checks, with the SDK's response envelope intact. */
export type CompletionSender = (request: ChatRequest) => Promise<SendChatCompletionRequestResponse | CompletionEnvelope>;

/** Strict JSON routing must not require sampling controls unsupported by Claude/OpenAI endpoints. */
export function structuredParameters(model: string) {
  return {
    reasoning: { effort: "none" as const },
    provider: { requireParameters: true },
    ...samplingParameters(model),
  };
}

function validationDetail(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.slice(0, 4).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Strictly validate generated JSON, regenerating once on malformed/truncated output.
 * Provider/SDK failures are reported separately and never treated as valid model data.
 * Usage is reported before parsing, so rejected completions are still counted.
 */
export async function structuredCompletion<T>(options: {
  stage: "summarize" | "data";
  request: ChatRequest;
  send: CompletionSender;
  parse: (text: string) => T;
  hooks?: StructuredCompletionHooks;
}): Promise<{ value: T; model: string; usage: CompletionUsage }> {
  let request = options.request;
  let promptTokens = 0;
  let completionTokens = 0;
  let costUSD = 0;
  let costKnown = true;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = performance.now();
    let result: ChatResult | CompletionEnvelope;
    try {
      const response = await options.send(request);
      // The SDK has already validated this envelope; don't accept a stream here.
      if (!response || typeof response !== "object" || !("choices" in response)) {
        throw new Error("Expected a non-streaming completion response");
      }
      result = response;
    } catch (error) {
      const detail = providerErrorDetail(error);
      log.error("structured generation provider failed", { stage: options.stage, model: request.model, attempt, detail });
      throw new Error(`${options.stage}: ${detail}`, { cause: error });
    }

    const usage = {
      promptTokens: result.usage?.promptTokens ?? 0,
      completionTokens: result.usage?.completionTokens ?? 0,
      costUSD: result.usage?.cost ?? undefined,
    };
    promptTokens += usage.promptTokens;
    completionTokens += usage.completionTokens;
    costUSD += usage.costUSD ?? 0;
    costKnown &&= usage.costUSD !== undefined;
    options.hooks?.usage?.({ model: result.model, usage, attempt, ms: Math.round(performance.now() - started) });

    const choice = result.choices[0];
    const finishReason = choice?.finishReason ?? "unknown";
    const text = choice?.message.content;
    if (finishReason === "content_filter" || finishReason === "error") {
      log.error("structured generation stopped", { stage: options.stage, model: result.model, attempt, finishReason, usage });
      throw new Error(`${options.stage}: model stopped with ${finishReason}`);
    }

    try {
      if (finishReason === "length") throw new Error("Model output reached its token limit before finishing JSON");
      if (typeof text !== "string" || !text.trim()) throw new Error("Model returned empty JSON content");
      const value = options.parse(text);
      return { value, model: result.model, usage: { promptTokens, completionTokens, costUSD: costKnown ? costUSD : undefined } };
    } catch (error) {
      const detail = validationDetail(error);
      log.warn("structured generation rejected", {
        stage: options.stage, model: result.model, attempt, finishReason,
        characters: typeof text === "string" ? text.length : 0, usage, detail,
      });
      if (attempt === 2) throw new Error(`${options.stage}: invalid generated JSON after 2 attempts (${finishReason}): ${detail}`, { cause: error });
      options.hooks?.retry?.(2, `Regenerating invalid JSON with the same model (finish reason: ${finishReason}; ${typeof text === "string" ? text.length : 0} characters)`);
      request = {
        ...options.request,
        maxTokens: Math.min((options.request.maxTokens ?? 1_500) * 2, 12_000),
        messages: [...options.request.messages, {
          role: "user",
          content: `The previous output failed validation: ${detail.slice(0, 800)}. Regenerate the complete response from scratch. Return one valid JSON object satisfying the schema and all field/type rules. Keep it concise and finish every string and object.`,
        }],
      };
    }
  }
  throw new Error(`${options.stage}: completion attempts exhausted`);
}
