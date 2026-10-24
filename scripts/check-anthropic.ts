import assert from "node:assert/strict";
import { z } from "zod";
import { anthropicCost, anthropicMessages, anthropicSchema } from "../src/llm/anthropic.js";

/** The Anthropic adapter, offline: message mapping, cache breakpoints, schema subset and pricing. */

// A follow-up's shape: rules, replayed turns, the saved-screen state, then the new message.
const mapped = anthropicMessages([
  { role: "system", content: "Resolve follow-ups." },
  { role: "user", content: "NVDA upcoming earnings" },
  { role: "assistant", content: "{\"ticker\":\"NVDA\"}" },
  { role: "system", content: "{\"parts\":[]}" },
  { role: "user", content: "get the latest report rather than upcoming" },
]);
assert.deepEqual(mapped.system, [{ type: "text", text: "Resolve follow-ups.", cache_control: { type: "ephemeral" } }], "rules are the cached system prompt");
assert.deepEqual(mapped.messages.map(m => m.role), ["user", "assistant", "user"]);
const blocks = mapped.messages.map(m => (m.content as { text: string; cache_control?: unknown }[])[0]!);
assert.ok(blocks[1]!.cache_control && !blocks[0]!.cache_control && !blocks[2]!.cache_control, "the replayed conversation ends the cached prefix; the newest turn is fresh");
assert.match(blocks[2]!.text, /^<context>\n\{"parts":\[\]\}\n<\/context>\n\nget the latest report/, "a mid-conversation system message rides in front of the next user turn");

// Same-role turns merge; a lone writer request caches only its system prompt.
const writer = anthropicMessages([{ role: "system", content: "Fill holes." }, { role: "user", content: "a" }, { role: "user", content: "b" }]);
assert.equal(writer.messages.length, 1);
assert.equal((writer.messages[0]!.content as { text: string }[])[0]!.text, "a\n\nb");

// Structured outputs reject length and range keywords and need closed objects; local validation keeps them.
const Plan = z.object({ request: z.string().min(1).max(500), questions: z.array(z.string()).max(6) });
const schema = anthropicSchema(z.toJSONSchema(Plan)) as { properties: { request: Record<string, unknown> }; additionalProperties: unknown };
assert.equal(schema.additionalProperties, false);
assert.ok(!("minLength" in schema.properties.request) && !("maxLength" in schema.properties.request));
assert.deepEqual(anthropicSchema({ type: "object", properties: { a: { type: "array", minItems: 3, maxItems: 9, items: { type: "string", pattern: "\\bx" } } } }),
  { type: "object", properties: { a: { type: "array", items: { type: "string" } } }, additionalProperties: false });

// A property named like a keyword (the intent's limits[].maxItems) is a field and stays, with its own keywords dropped.
assert.deepEqual(anthropicSchema({ type: "object", required: ["maxItems"], properties: { maxItems: { type: "integer", minimum: 1, maximum: 100 } } }),
  { type: "object", required: ["maxItems"], properties: { maxItems: { type: "integer" } }, additionalProperties: false });

// Price: 4,700 fresh input + 50 output on Opus 5.5; cache reads cost 5% of input.
assert.equal(anthropicCost("claude-opus-5-5", { input_tokens: 4_700, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }), 0.0198);
assert.equal(anthropicCost("claude-haiku-5-5", { input_tokens: 100, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 10_000 }), 0.00011);
assert.equal(anthropicCost("unknown-model", { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }), undefined);
console.log("anthropic: message mapping, cache breakpoints, schema subset and pricing passed");
