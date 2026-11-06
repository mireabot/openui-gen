import assert from "node:assert/strict";
import { CodexOutput, codexEnv, codexSchema } from "../src/llm/codex.js";

const result = new CodexOutput();
for (const event of [
  { type: "thread.started", thread_id: "test" },
  { type: "item.completed", item: { type: "reasoning", text: "private reasoning" } },
  { type: "item.completed", item: { type: "agent_message", phase: "commentary", text: "Working" } },
  { type: "item.completed", item: { type: "agent_message", text: '{"ok":true}' } },
  { type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 12 } },
]) result.read(JSON.stringify(event));
assert.deepEqual(result.completion("gpt-6.1-sol"), {
  model: "gpt-6.1-sol", finishReason: "stop", text: '{"ok":true}', usage: { promptTokens: 100, completionTokens: 12, costUSD: 0 },
});

const failed = new CodexOutput();
failed.read(JSON.stringify({ type: "turn.failed", error: { message: "Usage limit reached" } }));
assert.throws(() => failed.completion("gpt-6.1-sol"), /Usage limit reached/);
const partial = new CodexOutput();
partial.read(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "partial layout" } }));
assert.throws(() => partial.completion("gpt-6.1-sol"), /without a completed turn/);

assert.deepEqual(codexEnv({ PATH: "/bin", CODEX_HOME: "/auth", OPENAI_API_KEY: "key", CODEX_API_KEY: "key", ANTHROPIC_API_KEY: "key" }), { PATH: "/bin", CODEX_HOME: "/auth" });
assert.deepEqual(codexSchema({ type: "object", properties: { player: { type: "string" }, week: { type: "integer" } }, required: ["player"] }), {
  type: "object", properties: { player: { type: "string" }, week: { anyOf: [{ type: "integer" }, { type: "null" }] } }, required: ["player", "week"], additionalProperties: false,
});
console.log("codex: final output, usage, failed and interrupted turns, and account auth environment passed");
