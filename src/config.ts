import { z } from "zod";
import { fileURLToPath } from "node:url";
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

  // Where the Claude stages run. "debug": the local Claude Code CLI, on the signed-in plan's limits.
  // "api": the Anthropic API, billed to ANTHROPIC_API_KEY. Models and effort match; search is Parallel in both.
  GENERATION_MODE: z.enum(["debug", "api"]).default("debug"),

  // Where football data comes from. "mixed": ESPN for tables, matches and clubs, FotMob for players.
  // "fotmob": FotMob for all of it, so clubs outside ESPN's six competitions work. FotMob's terms
  // forbid automated retrieval, so this is for personal research only.
  DATA_SOURCE: z.enum(["mixed", "fotmob"]).default("mixed"),

  // Claude on the Anthropic API runs every model stage in api mode; Parallel's Search and Extract APIs find and
  // read the pages behind cited web research.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  PARALLEL_API_KEY: z.string().min(1).optional(),
  // Parallel Search depth: "advanced" (~3 s, most thorough) unless set lower for latency.
  PARALLEL_SEARCH_MODE: z.enum(["turbo", "fast", "basic", "advanced"]).default("advanced"),

  // The sports endpoint: Haiku understands the request, Sonnet reads each
  // parallel search's pages into cited facts, Opus shapes the dataset and writes the screen.
  SPORTS_PLAN_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  SPORTS_SEARCH_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  SPORTS_MODEL: z.string().min(1).default("claude-opus-5-5"),
  // ESPN's public site API (scoreboard, teams, standings). No key.
  ESPN_BASE_URL: z.string().url().default("https://site.api.espn.com/apis"),
  // The same API's leaders, players and search. No key.
  ESPN_WEB_BASE_URL: z.string().url().default("https://site.web.api.espn.com/apis"),

  // Saved OpenUI state: dataset snapshots (/tools/sports_dataset) and documents (follow-ups).
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
export function requireKey(name: "ANTHROPIC_API_KEY" | "PARALLEL_API_KEY"): string {
  const value = config()[name];
  if (!value) throw new Error(`${name} is not set — see .env.example`);
  return value;
}

/** What `.env` ships with, so an unfilled key fails at boot rather than as a 502. */
const PLACEHOLDER = /^(REPLACE_ME|\.\.\.|changeme|placeholder)$/i;

/** Boot check: the keys this mode needs (Parallel search, and Claude on the Anthropic API in api mode), present and filled in. */
export function assertCredentials(): void {
  const keys = config().GENERATION_MODE === "api" ? ["ANTHROPIC_API_KEY", "PARALLEL_API_KEY"] as const : ["PARALLEL_API_KEY"] as const;
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
