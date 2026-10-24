import { z } from "zod";
import { citationKey } from "../research/web-research.js";
import type { MockValue } from "../research/dataset-schema.js";
import type { WebResearch } from "../research/web-research.js";
import type { TickerInfo, WebLookup } from "./data.js";

/**
 * Open asks: the parts of a request no typed lookup answers (eight quarters of results, margins
 * across competitors, the bull and bear case). Each runs as its own cited search with the whole
 * request as context, and comes back as one generic finding the writer lays out however the
 * question needs: a period table, a numeric series, labelled facts, or quoted arguments.
 */

/** Registered cards an open answer may borrow its structure from. */
export const FINDING_TEMPLATES = ["EarningsCard", "KeyStats", "ConsensusCard", "StockBenchmark", "PeerCards", "ContentCard"] as const;

export interface OpenAsk {
  /** The sub-question in the user's terms, with every detail they asked for. */
  readonly question: string;
  readonly searchQueries: readonly string[];
  /** The registered card whose structure suits the answer, as a layout reference for the writer. */
  readonly template: string | null;
}

/**
 * The extraction shape. Length and count limits are applied after parsing (clip), not in the schema:
 * structured outputs do not enforce them, and an answer with five sources is still an answer.
 */
export const FindingSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  columns: z.array(z.string()),
  rows: z.array(z.object({ label: z.string(), cells: z.array(z.string()) }).strict()),
  seriesLabel: z.string().nullable(),
  series: z.array(z.object({ label: z.string(), value: z.number() }).strict()),
  facts: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string() }).strict()),
  quotes: z.array(z.object({ text: z.string(), by: z.string() }).strict()),
  sourceUrls: z.array(z.string()),
}).strict();
const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
export type FindingFacts = z.infer<typeof FindingSchema>;
export const FINDING_JSON_SCHEMA = z.toJSONSchema(FindingSchema);

export const FINDING_SYSTEM = `Turn the research findings into one record answering the sub-question. Use only facts the findings state with a cited URL; never invent or estimate figures.
title: a short heading for this answer (e.g. "Last 8 quarters", "Margins vs peers"). summary: one or two factual sentences answering the sub-question, max 280 characters.
Fill whichever parts the answer needs and leave the rest empty:
columns + rows: a comparison table. columns name the measures; each row has a label (a quarter, a company, a period) and one cell per column, values exactly as published ("$11.1B", "+3.2%", "Beat by $0.08"). Use "—" for a cell the findings do not state. Order rows as the user would read them (oldest to newest for periods).
seriesLabel + series: one numeric measure over periods or across companies, for a bar chart (label "Q1 FY26", value 0.53). Only plain numbers the findings state. Empty when no single measure fits.
facts: labelled standalone facts (label, value, one-line detail).
quotes: up to four attributed statements: management commentary, analyst arguments, bull or bear cases. "by" names the speaker or firm.
sourceUrls: the cited URLs the record relies on, most important first.`;

export const findingQuery = (ask: OpenAsk, info: TickerInfo, today: string, prompt: string) =>
  `${ask.question}\nSubject: ${info.name} (${info.ticker}), as of ${today}. Cite primary or reputable financial sources with dates.\nThe user's full request, for context: "${prompt}"`;

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** The finding as dataset values, or null when nothing in it is backed by a cited URL. */
export function findingRecord(raw: FindingFacts, ask: OpenAsk, research: WebResearch): Record<string, MockValue> | null {
  const facts: FindingFacts = {
    title: clip(raw.title, 60), summary: clip(raw.summary, 320), columns: raw.columns.slice(0, 6).map(c => clip(c, 24)),
    rows: raw.rows.slice(0, 12).map(r => ({ label: clip(r.label, 40), cells: r.cells.slice(0, 6).map(c => clip(c, 40)) })),
    seriesLabel: raw.seriesLabel ? clip(raw.seriesLabel, 40) : null, series: raw.series.slice(0, 16).map(p => ({ label: clip(p.label, 16), value: p.value })),
    facts: raw.facts.slice(0, 8).map(f => ({ label: clip(f.label, 40), value: clip(f.value, 60), detail: clip(f.detail, 140) })),
    quotes: raw.quotes.slice(0, 4).map(q => ({ text: clip(q.text, 240), by: clip(q.by, 60) })), sourceUrls: raw.sourceUrls,
  };
  const cited = facts.sourceUrls.flatMap(url => research.sources.filter(source => citationKey(source.url) === citationKey(url)).slice(0, 1));
  if (!cited.length) return null;
  const width = facts.columns.length;
  // Each row also pairs its cells with their column names, so a template can show "Gross margin · 42.8%" per row.
  const rows = width ? facts.rows.map(row => {
    const cells = Array.from({ length: width }, (_, i) => row.cells[i] ?? "—");
    return { label: row.label, cells, pairs: cells.map((value, i) => ({ label: facts.columns[i]!, value })) };
  }) : [];
  return {
    question: ask.question, title: facts.title, summary: facts.summary,
    columns: width && rows.length ? facts.columns : [], rows,
    seriesLabel: facts.seriesLabel ?? "", series: facts.series.length >= 2 ? facts.series : [],
    facts: facts.facts, quotes: facts.quotes,
    hasTable: width > 0 && rows.length > 0, hasSeries: facts.series.length >= 2, hasFacts: facts.facts.length > 0, hasQuotes: facts.quotes.length > 0,
    source: `Source: ${[...new Set(cited.map(source => host(source.url)))].slice(0, 3).join(", ")}`,
  };
}

/** Every open ask at once; a failed or uncited ask is null, so coverage can say so. */
export function lookupFindings(asks: readonly OpenAsk[], info: TickerInfo, web: WebLookup, today: string, prompt: string, progress?: (detail: string) => void): Promise<(Record<string, MockValue> | null)[]> {
  return Promise.all(asks.map(async ask => {
    progress?.(`Researching: ${ask.question.slice(0, 120)}`);
    try {
      const research = await web.research(findingQuery(ask, info, today, prompt), { searchQueries: ask.searchQueries });
      return findingRecord(FindingSchema.parse(await web.extract(`${FINDING_SYSTEM}\nSub-question: ${ask.question}`, FINDING_JSON_SCHEMA, research)), ask, research);
    } catch (error) {
      progress?.(`Research failed for "${ask.question.slice(0, 80)}": ${(error as Error).message.slice(0, 200)}`);
      return null;
    }
  }));
}
