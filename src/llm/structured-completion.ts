import { z } from "zod";
import { log } from "../log.js";

export interface CompletionUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUSD: number | undefined;
}

export interface StructuredCompletionHooks {
  readonly usage?: (report: { model: string; usage: CompletionUsage; attempt: number; ms: number }) => void;
  readonly retry?: (attempt: number, detail: string) => void;
}

/** One structured call: the model, its output budget, the JSON Schema the answer must follow, and the turns. */
export interface CompletionRequest {
  readonly model: string;
  readonly maxTokens: number;
  readonly schema: Record<string, unknown>;
  readonly messages: readonly { readonly role: "system" | "user"; readonly content: string }[];
}

/** One call's answer. `model` is the one that served it, which a refusal fallback can change. */
export interface Completion {
  readonly model: string;
  readonly finishReason: "stop" | "length" | "content_filter";
  readonly text: string;
  readonly usage: CompletionUsage;
}

/** Injectable transport, so offline checks can script the model. */
export type CompletionSender = (request: CompletionRequest) => Promise<Completion>;

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
  request: CompletionRequest;
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
    let result: Completion;
    try {
      result = await options.send(request);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log.error("structured generation provider failed", { stage: options.stage, model: request.model, attempt, detail });
      throw new Error(`${options.stage}: ${detail}`, { cause: error });
    }

    const { usage, finishReason, text } = result;
    promptTokens += usage.promptTokens;
    completionTokens += usage.completionTokens;
    costUSD += usage.costUSD ?? 0;
    costKnown &&= usage.costUSD !== undefined;
    options.hooks?.usage?.({ model: result.model, usage, attempt, ms: Math.round(performance.now() - started) });

    if (finishReason === "content_filter") {
      log.error("structured generation stopped", { stage: options.stage, model: result.model, attempt, finishReason, usage });
      throw new Error(`${options.stage}: model stopped with ${finishReason}`);
    }

    try {
      if (finishReason === "length") throw new Error("Model output reached its token limit before finishing JSON");
      if (!text.trim()) throw new Error("Model returned empty JSON content");
      const value = options.parse(text);
      return { value, model: result.model, usage: { promptTokens, completionTokens, costUSD: costKnown ? costUSD : undefined } };
    } catch (error) {
      const detail = validationDetail(error);
      log.warn("structured generation rejected", { stage: options.stage, model: result.model, attempt, finishReason, characters: text.length, usage, detail });
      if (attempt === 2) throw new Error(`${options.stage}: invalid generated JSON after 2 attempts (${finishReason}): ${detail}`, { cause: error });
      options.hooks?.retry?.(2, `Regenerating invalid JSON with the same model (finish reason: ${finishReason}; ${text.length} characters)`);
      request = {
        ...options.request,
        // More room up to 12,000; a stage that starts above that keeps its own budget.
        maxTokens: Math.max(options.request.maxTokens, Math.min(options.request.maxTokens * 2, 12_000)),
        messages: [...options.request.messages, {
          role: "user",
          content: `The previous output failed validation: ${detail.slice(0, 800)}. Regenerate the complete response from scratch. Return one valid JSON object satisfying the schema and all field/type rules. Keep it concise and finish every string and object.`,
        }],
      };
    }
  }
  throw new Error(`${options.stage}: completion attempts exhausted`);
}
