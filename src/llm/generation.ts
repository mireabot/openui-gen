import { config } from "../config.js";
import { anthropicSender, anthropicWriter } from "./anthropic.js";
import { claudeCodeSender, claudeCodeWriter } from "./claude-code.js";
import { codexSender, codexWriter } from "./codex.js";

export const modelSender: typeof anthropicSender = options => {
  switch (config().GENERATION_MODE) {
    case "api": return anthropicSender(options);
    case "debug": return claudeCodeSender(options);
    case "codex": return codexSender();
  }
};

export const modelWriter: typeof anthropicWriter = (messages, model, emit, maxTokens, options) => {
  switch (config().GENERATION_MODE) {
    case "api": return anthropicWriter(messages, model, emit, maxTokens, options);
    case "debug": return claudeCodeWriter(messages, model, emit, maxTokens, options);
    case "codex": return codexWriter(messages, emit);
  }
};
