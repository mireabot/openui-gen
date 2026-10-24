import { z } from "zod";
import { fileURLToPath } from "node:url";
import { ScreenModelSchema } from "./llm/model.js";
import { PROJECT_ROOT } from "./paths.js";

const bool = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .or(z.boolean());

/**
 * API keys are optional here and asserted where they are used, so offline checks run without
 * credentials. The server still checks them at boot with `assertCredentials()`, so a missing
 * key never surfaces mid-request as what looks like a generation failure.
 */
const Schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  OPENROUTER_API_KEY: z.string().min(1).optional(),
  // Claude on the Anthropic API: the writer, question planning and fact extraction. Without
  // LLM_PROVIDER, the key decides (set → anthropic). Search planning stays on OpenRouter.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  LLM_PROVIDER: z.enum(["anthropic", "openrouter"]).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
  ANTHROPIC_SUMMARY_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  OPENROUTER_MODEL: ScreenModelSchema.default("anthropic/claude-opus-5"),
  OPENROUTER_SUMMARY_MODEL: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9][A-Za-z0-9._:-]*$/).default("anthropic/claude-haiku-5.5"),
  // Web research for "web" data requests. Chosen by a bake-off on 2026-10-11 (8 models, Exa vs Parallel):
  // Claude Haiku 5.5 on Parallel gave the most accurate cited facts at ~15 s / ~$0.013 a run.
  OPENROUTER_SEARCH_MODEL: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9][A-Za-z0-9._:-]*$/).default("anthropic/claude-haiku-5.5"),
  OPENROUTER_SEARCH_ENGINE: z.enum(["parallel", "exa", "perplexity", "firecrawl", "native", "auto"]).default("parallel"),
  // Who finds the pages behind cited research. "parallel": Parallel's Search API returns ranked pages
  // with excerpts and Haiku (OPENROUTER_SUMMARY_MODEL) reads them; "openrouter": the model above runs
  // its own web_search tool. Without PARALLEL_API_KEY, "parallel" falls back to "openrouter".
  WEB_RESEARCH_PROVIDER: z.enum(["parallel", "openrouter"]).default("parallel"),
  PARALLEL_API_KEY: z.string().min(1).optional(),
  // Parallel Search depth: "advanced" (~3 s, most thorough) unless set lower for latency.
  PARALLEL_SEARCH_MODE: z.enum(["turbo", "fast", "basic", "advanced"]).default("advanced"),

  // Market data (src/packs/stocks/data.ts). MASSIVE_RPM is the plan's request limit per minute (free plan: 5).
  MASSIVE_API_KEY: z.string().min(1).optional(),
  FMP_API_KEY: z.string().min(1).optional(),
  MASSIVE_BASE_URL: z.string().url().default("https://api.massive.com"),
  MASSIVE_RPM: z.coerce.number().int().min(1).max(10_000).default(5),
  // Plan entitlements. Free Massive has no current-session data; free FMP has no 5-minute bars.
  MASSIVE_CURRENT_DAY: bool.default(false),
  FMP_INTRADAY: bool.default(false),
  MASSIVE_CACHE_DIR: z.string().min(1).default("data/massive-cache"),
  // Saved OpenUI state: dataset snapshots (/tools/stocks_dataset) and documents (follow-ups).
  DATA_DIR: z.string().min(1).default("data"),

  // One JSON per generation: steps, usage, cost and artifacts.
  TRACE_ENABLED: bool.default(false),
  TRACE_DIR: z.string().min(1).default("traces"),

  // Extra browser origins allowed to call the API, comma-separated. localhost is always allowed;
  // the bundled preview is same-origin and needs nothing here.
  CORS_ORIGINS: z.string().default(""),
});

export type Config = z.infer<typeof Schema>;

let cached: Config | undefined;
let envFileLoaded = false;

/** Node reads `.env` natively; no dependency, and absent in production is fine. */
function loadEnvFile(): void {
  if (envFileLoaded) return;
  envFileLoaded = true;
  try {
    process.loadEnvFile(fileURLToPath(new URL(".env", PROJECT_ROOT)));
  } catch (error) {
    // No .env is normal in production; other errors should not hide broken setup.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function config(): Config {
  if (cached) return cached;
  loadEnvFile();
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Asserts a key at the point of use, so the failure names the service that needs it. */
export function requireKey(name: "ANTHROPIC_API_KEY" | "OPENROUTER_API_KEY" | "MASSIVE_API_KEY" | "FMP_API_KEY" | "PARALLEL_API_KEY"): string {
  const value = config()[name];
  if (!value) throw new Error(`${name} is not set — see .env.example`);
  return value;
}

/** What `.env` ships with, so an unfilled key fails at boot rather than as a 502. */
const PLACEHOLDER = /^(REPLACE_ME|sk-or-v1-\.\.\.|\.\.\.|changeme|placeholder)$/i;

/** Boot check: the model keys present and actually filled in. OpenRouter always plans searches. */
export function assertCredentials(): void {
  const cfg = config();
  const anthropic = cfg.LLM_PROVIDER === "anthropic" || (!cfg.LLM_PROVIDER && !!cfg.ANTHROPIC_API_KEY);
  const keys = anthropic ? ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"] as const : ["OPENROUTER_API_KEY"] as const;
  const missing = keys.filter((k) => !config()[k]);
  const unfilled = keys.filter((k) => {
    const v = config()[k];
    return v !== undefined && PLACEHOLDER.test(v);
  });

  if (missing.length > 0 || unfilled.length > 0) {
    const problems = [
      ...missing.map((k) => `${k} is not set`),
      ...unfilled.map((k) => `${k} is still a placeholder`),
    ];
    throw new Error(`Credentials not ready:\n  ${problems.join("\n  ")}\nEdit .env — see .env.example.`);
  }
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
/** CORS origin check: localhost for development, plus CORS_ORIGINS. */
export function allowedOrigin(origin: string): string | null {
  if (LOCAL_ORIGIN.test(origin)) return origin;
  return config().CORS_ORIGINS.split(",").map((o) => o.trim()).includes(origin) ? origin : null;
}
