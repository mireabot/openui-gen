import { z } from "zod";

/** OpenRouter ids accepted from the app's Anthropic, OpenAI, and Google picker. */
export const ScreenModelSchema = z.string().max(128).regex(
  /^(anthropic|openai|google)\/[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  "must be an Anthropic, OpenAI, or Google OpenRouter model id",
);

/** Keep the selected model stable across every compose retry. */
export function resolveScreenModel(requested: string | undefined, fallback: string): string {
  return requested ?? fallback;
}

export function usesExplicitCache(model: string): boolean {
  return model.startsWith("anthropic/");
}

/** Claude/OpenAI endpoints may omit sampling support; do not require temperature when routing. */
export function samplingParameters(model: string) {
  return model.startsWith("anthropic/") || model.startsWith("openai/") ? {} : { temperature: 0 };
}

/** Picker flagships require reasoning; Anthropic/OpenAI omit temperature support. */
export function compositionParameters(model: string) {
  return {
    reasoning: { effort: "medium" as const },
    ...(model.startsWith("google/") ? { temperature: 0 } : {}),
  };
}

/** Model authors and serving providers are distinct in OpenRouter. */
export function routingForModel(model: string): {
  only?: string[];
  allowFallbacks: false;
} {
  return usesExplicitCache(model)
    ? { only: ["anthropic"], allowFallbacks: false }
    : { allowFallbacks: false };
}
