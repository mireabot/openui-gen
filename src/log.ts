import { config } from "./config.js";

/**
 * Structured lines on stdout.
 *
 * Generation failures are diagnosed from the record of what each gate said across
 * attempts, so the fields matter more than the prose. One JSON object per line, no
 * dependency.
 */
const ORDER = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof ORDER;

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  let threshold: Level = "info";
  try {
    threshold = config().LOG_LEVEL;
  } catch {
    // Logging must survive a boot that failed on configuration, since that failure is
    // exactly what needs reporting.
  }
  if (ORDER[level] < ORDER[threshold]) return;
  const line = { ts: new Date().toISOString(), level, message, ...fields };
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(`${JSON.stringify(line)}\n`);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};
