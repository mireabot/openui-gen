import type { DocumentPart, LangDocument } from "./documents.js";

/** Conversation turns saved with a document, so a follow-up can replay what was asked and shown. */

export type Turn = LangDocument["turns"][number];

/** What the assistant said: the subject, the request and the parts on screen. */
export function assistantTurn(ticker: string, request: string, parts: readonly DocumentPart[], sources: string): Turn {
  return { role: "assistant", content: JSON.stringify({ ticker, request, parts: parts.map(({ statements: _s, ...part }) => part), sources: sources.slice(0, 2000) }) };
}

/** Every source, URL and as-of string in the dataset, for the follow-up planner's context. */
export function sourceSummary(values: unknown): string {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
      if (/source|url|asof|context/i.test(key) && typeof child === "string") found.add(child.slice(0, 500));
      else walk(child);
    }
  };
  walk(values);
  return [...found].join("\n").slice(0, 12000);
}
