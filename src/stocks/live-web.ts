import { OpenRouter } from "@openrouter/sdk";
import { Ajv2020 } from "ajv/dist/2020.js";
import { config, requireKey } from "../config.js";
import { providerErrorDetail } from "../llm/provider-error.js";
import { citedResearch } from "../research/research.js";
import { anthropicSender, usesAnthropic } from "../llm/anthropic.js";
import type { ContentReport, UsageReport } from "../run/recorder.js";
import { structuredCompletion, structuredParameters } from "../llm/structured-completion.js";
import type { WebLookup } from "./data.js";
import { STOCKS_PREFERRED_SOURCES } from "./sources.js";

export interface WebHooks {
  readonly usage?: (usage: UsageReport) => void;
  readonly content?: (report: ContentReport) => void;
}

let client: OpenRouter | undefined;

/** Live web lookups: cited research (OPENROUTER_SEARCH_MODEL), then a strict-JSON extraction (OPENROUTER_SUMMARY_MODEL). */
export function liveWeb(hooks: WebHooks): WebLookup {
  const cfg = config();
  let next = 0;
  const ids = new WeakMap<object, string>();
  const errorText = (error: unknown) => providerErrorDetail(error).replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 1200);
  return {
    research: async (query, hints) => {
      const id = `research${++next}`;
      const start = performance.now();
      const provider = cfg.WEB_RESEARCH_PROVIDER === "parallel" && cfg.PARALLEL_API_KEY ? "parallel" : "openrouter";
      hooks.content?.({ stage: "search", id, label: "Research query", format: "json", data: { query, provider, searchQueries: hints?.searchQueries ?? null, status: "started" } });
      try {
        // Parallel finds and reads the pages (Haiku plans queries the caller didn't give), or OpenRouter's tool.
        const research = await citedResearch(query, cfg.OPENROUTER_SEARCH_MODEL, (usage, model) =>
          hooks.usage?.({ stage: "search", engine: "llm", model, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, costUSD: usage.costUSD ?? 0, ms: Math.round(performance.now() - start) }),
        undefined, cfg.OPENROUTER_SEARCH_ENGINE, { ...(hints?.searchQueries ? { searchQueries: hints.searchQueries } : {}), preferDomains: STOCKS_PREFERRED_SOURCES });
        ids.set(research, id);
        hooks.content?.({ stage: "search", id, label: "Cited research", format: "json", data: research });
        return research;
      } catch (error) {
        hooks.content?.({ stage: "search", id, label: "Research failed", format: "json", data: { query, error: errorText(error) } });
        throw error;
      }
    },
    extract: async (system, schema, research) => {
      client ??= new OpenRouter({ apiKey: requireKey("OPENROUTER_API_KEY"), appTitle: "openui-gen" });
      const id = `${ids.get(research) ?? `research${++next}`}extract`;
      const validate = new Ajv2020({ strict: false, allErrors: true, validateFormats: false }).compile(schema);
      try {
        const result = await structuredCompletion({
          stage: "data",
          request: {
            model: cfg.OPENROUTER_SUMMARY_MODEL, stream: false, maxTokens: 8_000, ...structuredParameters(cfg.OPENROUTER_SUMMARY_MODEL),
            responseFormat: { type: "json_schema", jsonSchema: { name: "stocks_facts", strict: true, schema: schema as Record<string, unknown> } },
            messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ findings: research.findings, sources: research.sources }) }],
          },
          send: usesAnthropic() ? anthropicSender(cfg.ANTHROPIC_SUMMARY_MODEL) : (chatRequest) => client!.chat.send({ chatRequest }),
          parse: text => {
            const value: unknown = JSON.parse(text);
            if (!validate(value)) throw new Error(`Extracted facts do not satisfy schema: ${JSON.stringify(validate.errors).slice(0, 800)}`);
            return value;
          },
          hooks: { usage: ({ model, usage, attempt, ms }) => hooks.usage?.({ stage: "data", engine: "llm", model, attempt,
            inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, costUSD: usage.costUSD ?? 0, ms }) },
        });
        hooks.content?.({ stage: "data", id, label: "Extracted cited facts", format: "json", data: { query: research.query, facts: result.value } });
        return result.value;
      } catch (error) {
        hooks.content?.({ stage: "data", id, label: "Fact extraction failed", format: "json", data: { query: research.query, error: errorText(error) } });
        throw error;
      }
    },
  };
}
