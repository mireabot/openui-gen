import { OpenRouterError, ResponseValidationError } from "@openrouter/sdk/models/errors";
import { z } from "zod";

function invalidFields(issues: readonly z.ZodIssue[]): string[] {
  return issues.flatMap((issue) => issue.code === "invalid_union"
    ? issue.errors.flatMap(invalidFields)
    : [`${issue.path.join(".") || "root"} (${issue.code})`]);
}

function errorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const parsed = z.object({ error: z.object({ message: z.string() }).optional(), message: z.string().optional() }).safeParse(body);
  return parsed.success ? parsed.data.error?.message ?? parsed.data.message : undefined;
}

/** Select only provider error messages, never the SDK's raw request or credentials. */
function providerMessage(body: string): string | undefined {
  let value: unknown;
  try { value = JSON.parse(body); } catch { return undefined; }
  const outer = errorMessage(value);
  const parsed = z.object({ error: z.object({ metadata: z.object({ raw: z.unknown().optional() }).optional() }).optional() }).safeParse(value);
  let raw = parsed.success ? parsed.data.error?.metadata?.raw : undefined;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = undefined; }
  }
  const inner = Array.isArray(raw) ? raw.map(errorMessage).filter(Boolean).join("; ") : errorMessage(raw);
  const message = inner ? `${outer ?? "Provider error"}: ${inner}` : outer;
  return message?.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(?:sk-|AIza)[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 1_200);
}

/** Useful diagnostics without the SDK's request, headers, or raw response body. */
export function providerErrorDetail(error: unknown): string {
  if (!(error instanceof OpenRouterError)) return error instanceof Error ? error.message : String(error);
  const message = providerMessage(error.body);
  if (!(error instanceof ResponseValidationError)) return `${message ?? error.message} (HTTP ${error.statusCode})`;
  const cause = error.cause;
  const paths = cause instanceof z.ZodError
    ? [...new Set(invalidFields(cause.issues))].slice(0, 6)
    : [];
  return `${message ?? error.message} (HTTP ${error.statusCode}${paths.length ? `; invalid response fields: ${paths.join(", ")}` : ""})`;
}
