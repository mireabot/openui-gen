import { OpenRouter } from "@openrouter/sdk";
import { z } from "zod";
import { config, requireKey } from "../config.js";
import { structuredCompletion, structuredParameters, type CompletionUsage } from "../llm/structured-completion.js";

const QueryPlan = z.object({ queries: z.array(z.string().min(3).max(80)).min(2).max(3) }).strict();
const QUERY_PLAN_SYSTEM = `Write 2–3 web search keyword queries (3–6 words each) that together find pages answering the research objective. Name the specific entities (company, ticker, fund, place, product). Prefer queries that surface authoritative, dated pages: official sites, data tables, lists. Output JSON only.`;

let client: OpenRouter | undefined;

/**
 * Haiku (OPENROUTER_SUMMARY_MODEL) turns a research objective into keyword queries for Parallel
 * Search, which takes both a natural-language objective and 2–3 short queries.
 */
export async function planSearchQueries(objective: string,
  usage?: (entry: { model: string; usage: CompletionUsage; attempt: number; ms: number }) => void): Promise<readonly string[]> {
  const model = config().OPENROUTER_SUMMARY_MODEL;
  client ??= new OpenRouter({ apiKey: requireKey("OPENROUTER_API_KEY"), appTitle: "openui-gen" });
  const result = await structuredCompletion({
    stage: "data",
    request: {
      model, stream: false, maxTokens: 300, ...structuredParameters(model),
      responseFormat: { type: "json_schema", jsonSchema: { name: "search_queries", strict: true, schema: z.toJSONSchema(QueryPlan) as Record<string, unknown> } },
      messages: [{ role: "system", content: QUERY_PLAN_SYSTEM }, { role: "user", content: objective }],
    },
    send: (chatRequest) => client!.chat.send({ chatRequest }),
    parse: text => QueryPlan.parse(JSON.parse(text)).queries,
    ...(usage ? { hooks: { usage } } : {}),
  });
  return result.value;
}
