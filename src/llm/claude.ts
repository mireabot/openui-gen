import { config } from "../config.js";
import { anthropicSender, anthropicWriter } from "./anthropic.js";
import { claudeCodeSender, claudeCodeWriter } from "./claude-code.js";

/** The model stages' Claude, by GENERATION_MODE: the plan through Claude Code, or the paid API. */
const onApi = () => config().GENERATION_MODE === "api";

export const claudeSender: typeof anthropicSender = options => onApi() ? anthropicSender(options) : claudeCodeSender(options);
export const claudeWriter: typeof anthropicWriter = (...args) => onApi() ? anthropicWriter(...args) : claudeCodeWriter(...args);
