import { OpenRouter } from "@openrouter/sdk";
import type { ChatRequest } from "@openrouter/sdk/models";
import type { SendChatCompletionRequestResponse } from "@openrouter/sdk/models/operations";
import { requireKey } from "../config.js";
import { compositionParameters, routingForModel } from "./model.js";
import { providerErrorDetail } from "./provider-error.js";
import { log } from "../log.js";

/** Streams the writer's plain-text output from OpenRouter; `onText` sees every delta as it arrives. */

let client: OpenRouter | undefined;
const openRouter = () => (client ??= new OpenRouter({ apiKey: requireKey("OPENROUTER_API_KEY"), appTitle: "openui-gen" }));

export interface WriterUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly reasoningTokens: number;
  readonly cost: number | undefined;
}

export function writerChatRequest(messages: readonly { role: "system" | "user"; content: string }[], model: string): ChatRequest {
  return {
    model, stream: true, streamOptions: { includeUsage: true },
    // Includes reasoning tokens as well as the visible primitive tree.
    maxTokens: 6_000,
    ...compositionParameters(model),
    provider: routingForModel(model),
    messages: messages.map((message) => ({ ...message })),
  };
}

export type WriterSender = (request: ChatRequest) => Promise<SendChatCompletionRequestResponse>;

export async function streamWriter(
  messages: readonly { role: "system" | "user"; content: string }[],
  model: string,
  onText: (delta: string) => void,
  send: WriterSender = (chatRequest) => openRouter().chat.send({ chatRequest }),
): Promise<{ text: string; usage: WriterUsage }> {
  try {
    const stream = await send(writerChatRequest(messages, model));
    if ("choices" in stream) throw new Error("OpenRouter did not return a stream.");
    let text = "";
    let usage: WriterUsage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cost: undefined };
    for await (const chunk of stream) {
      if (chunk.error) throw new Error(`Provider stream error ${chunk.error.code}: ${chunk.error.message}`);
      const choice = chunk.choices[0];
      if (choice?.finishReason === "error" || choice?.finishReason === "content_filter") {
        throw new Error(`Model stopped with ${choice.finishReason}`);
      }
      if (choice?.finishReason === "length") throw new Error("Model output reached its token limit before finishing the layout");
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta) {
        text += delta;
        onText(delta);
      }
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.promptTokens ?? 0,
          completionTokens: chunk.usage.completionTokens ?? 0,
          reasoningTokens: chunk.usage.completionTokensDetails?.reasoningTokens ?? 0,
          cost: chunk.usage.cost ?? undefined,
        };
      }
    }
    if (!text.trim()) throw new Error("Model returned empty layout content");
    return { text, usage };
  } catch (error) {
    const detail = providerErrorDetail(error);
    log.error("primitive writer failed", { stage: "compose", model, detail });
    throw new Error(`compose: ${detail}`, { cause: error });
  }
}
