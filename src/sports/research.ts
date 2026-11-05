import { z } from "zod";
import { config } from "../config.js";
import { claudeSender } from "../llm/claude.js";
import { structuredCompletion, type CompletionSender, type StructuredCompletionHooks } from "../llm/structured-completion.js";
import type { MockValue } from "../research/dataset-schema.js";
import { researchWithParallel, type ParallelTransport } from "../research/parallel-research.js";
import { citationKey, type WebResearch, type WebSource } from "../research/web-research.js";
import { lookupPlayer, matchRatings, playerValue, type FotmobTransport, type PlayerLookup, type PlayerPicker, type RatedPlayer } from "./fotmob.js";
import { LEAGUES, withMatchCards, type EspnTransport } from "./espn.js";
import { footballLookup, footballSourceName } from "./football.js";

/** Kickoff times for a client that names no time zone: football's home clock. */
export const DEFAULT_TIME_ZONE = "Europe/London";
import type { SportsPlan, SportsQuestion } from "./plan.js";

/**
 * Every question at once. ESPN questions read their feed directly. Web questions are parallel
 * searches: Parallel's Search and Extract APIs find and read the pages, then Sonnet
 * (SPORTS_SEARCH_MODEL) turns them into one cited finding. A question that fails or cites nothing
 * comes back unavailable with a note, so the screen says so instead of inventing an answer.
 */

/** Football sources searched first; their pages lead the findings and win when pages disagree. */
export const SPORTS_PREFERRED_SOURCES = ["espn.com", "bbc.com", "premierleague.com", "laliga.com", "bundesliga.com", "legaseriea.it", "transfermarkt.com", "fbref.com"];

export const FindingSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  columns: z.array(z.string()),
  rows: z.array(z.object({ label: z.string(), cells: z.array(z.string()) }).strict()),
  facts: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string() }).strict()),
  asOf: z.string(),
  sourceUrls: z.array(z.string()),
}).strict();
export type Finding = z.infer<typeof FindingSchema>;

export const FINDING_SYSTEM = `Turn the search results into one record answering the sub-question. Use only facts the pages state, with a cited URL; never invent or estimate figures, names or dates.
title: a short heading (e.g. "Top scorers", "Last five matches"). summary: one or two factual sentences answering the sub-question, max 280 characters.
columns + rows: a table when the answer is a ranking or a list: columns name the measures (e.g. "Club", "Goals", "Matches"); each row has a label (a player, a club, a match) and one cell per column, values exactly as published. Use "—" for a cell the pages do not state. Order rows as the user would read them (rank order, or oldest to newest).
facts: labelled standalone facts (label, value, one-line detail).
asOf: the date the figures are current to, as the pages state it (YYYY-MM-DD), or "".
sourceUrls: the cited URLs the record relies on, most important first.`;

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** A web finding as answer values, or null when nothing in it is backed by a page that was read. */
export function findingAnswer(raw: Finding, question: SportsQuestion, research: WebResearch): Record<string, MockValue> | null {
  const cited = raw.sourceUrls.flatMap(url => research.sources.filter(source => citationKey(source.url) === citationKey(url)).slice(0, 1));
  if (!cited.length) return null;
  const columns = raw.columns.slice(0, 6);
  const rows = columns.length ? raw.rows.slice(0, 20).map(row => {
    const cells = Array.from({ length: columns.length }, (_, i) => row.cells[i] ?? "—");
    return { label: row.label, cells, pairs: cells.map((value, i) => ({ label: columns[i]!, value })) };
  }) : [];
  return {
    status: "complete", question: question.text, title: raw.title, summary: raw.summary,
    columns: rows.length ? columns : [], rows,
    // Bound collection sizes, but keep the sourced text. Presentation chooses how it wraps.
    facts: raw.facts.slice(0, 8),
    asOf: raw.asOf, source: `Source: ${[...new Set(cited.map(source => host(source.url)))].slice(0, 3).join(", ")}`,
  };
}

const unavailable = (question: SportsQuestion, note: string): Record<string, MockValue> => ({ status: "unavailable", question: question.text, title: question.text.slice(0, 60), note, source: "" });

/** A played match's FotMob ratings for each club, as `teamRated` and `opponentRated`. The match still answers without them. */
async function withMatchRatings(values: Record<string, MockValue>, send?: FotmobTransport): Promise<Record<string, MockValue> | null> {
  const match = values.match as Record<string, MockValue> | undefined;
  const side = (key: "home" | "away") => match?.[key] as { name?: MockValue; goals?: MockValue } | undefined;
  const [home, away] = [side("home"), side("away")];
  if (typeof match?.date !== "string" || typeof home?.name !== "string" || typeof away?.name !== "string" || typeof home.goals !== "number" || typeof away.goals !== "number") return null;
  const ratings = await matchRatings({ date: match.date, home: home.name, away: away.name, homeScore: home.goals, awayScore: away.goals }, send).catch(() => null);
  if (!ratings) return null;
  const plain = (players: readonly RatedPlayer[]) => players.map(player => ({ ...player }));
  const [own, other] = match.venueSide === "home" ? [ratings.home, ratings.away] : [ratings.away, ratings.home];
  return { teamRated: plain(own), opponentRated: plain(other) };
}

export interface ResearchDeps {
  readonly espn?: EspnTransport;
  /** FotMob's transport, for a match's player ratings (tests). */
  readonly fotmob?: FotmobTransport;
  readonly player?: PlayerLookup;
  readonly pickPlayer?: PlayerPicker;
  readonly parallel?: ParallelTransport;
  /** The Sonnet extraction transport (tests). */
  readonly extract?: CompletionSender;
}
export interface ResearchHooks {
  readonly progress?: (detail: string) => void;
  readonly usage?: (entry: { stage: "search" | "data"; model: string; inputTokens: number; outputTokens: number; costUSD: number; ms: number; attempt?: number }) => void;
  readonly finding?: (id: string, value: unknown) => void;
}

export interface Answered {
  readonly answers: Record<string, Record<string, MockValue>>;
  readonly sources: readonly WebSource[];
  readonly espn: boolean;
  readonly web: boolean;
}

export async function answerSports(plan: SportsPlan, prompt: string, now: Date, hooks: ResearchHooks = {}, deps: ResearchDeps = {}, timeZone = DEFAULT_TIME_ZONE): Promise<Answered> {
  const cfg = config();
  const today = now.toISOString().slice(0, 10);
  const sources: WebSource[] = [];
  const results = await Promise.all(plan.questions.map(async (question): Promise<[string, Record<string, MockValue>]> => {
    try {
      if (question.source === "fotmob") {
        hooks.progress?.(`FotMob market value · ${question.player}`);
        const chart = await playerValue({ name: question.player, ...(question.team ? { team: question.team } : {}) }, query => (deps.player ?? lookupPlayer)(query, deps.pickPlayer), deps.fotmob);
        if (!chart) return [question.id, unavailable(question, `FotMob has no market value history for ${question.player}.`)];
        const values = { chart: { ...chart, segments: chart.segments.map(segment => ({ ...segment, points: segment.points.map(point => ({ ...point })) })), ticks: chart.ticks.map(tick => ({ ...tick })) } };
        hooks.finding?.(question.id, values);
        return [question.id, { status: "complete", question: question.text, title: question.text.slice(0, 60), ...values, source: "Source: FotMob · SciSports market values" }];
      }
      if (question.source === "espn") {
        hooks.progress?.(`${footballSourceName()} ${question.feed}${question.team ? ` · ${question.team}` : ""}${question.opponent ? ` v ${question.opponent}` : ""}: ${question.text.slice(0, 100)}`);
        const espn = await footballLookup({ league: question.league, feed: question.feed, team: question.team, opponent: question.opponent, dates: question.date, season: question.season,
          ...(question.lastGames !== undefined ? { lastGames: question.lastGames } : {}), ...(question.allCompetitions !== undefined ? { allCompetitions: question.allCompetitions } : {}) }, deps.espn, now);
        const values = withMatchCards(espn.values, LEAGUES[question.league], timeZone);
        const rated = question.feed === "match" ? await withMatchRatings(values, deps.fotmob) : null;
        const complete = { ...values, ...rated };
        hooks.finding?.(question.id, complete);
        return [question.id, { status: "complete", question: question.text, title: question.text.slice(0, 60), ...complete, source: rated ? `${espn.source} · FotMob ratings` : espn.source }];
      }
      hooks.progress?.(`Searching: ${question.text.slice(0, 120)}`);
      const started = performance.now();
      const research = await researchWithParallel(
        `${question.text}\nAbout: ${plan.subject.name}${plan.subject.season ? `, ${plan.subject.season}` : ""}, as of ${today}. Prefer official league and club sites and established football data sources, with dates.\nThe user's full request, for context: "${prompt}"`,
        { searchQueries: question.searchQueries, mode: cfg.PARALLEL_SEARCH_MODE, preferDomains: SPORTS_PREFERRED_SOURCES,
          ...(deps.parallel ? { send: deps.parallel } : {}),
          usage: ({ model, costUSD, ms }) => hooks.usage?.({ stage: "search", model, inputTokens: 0, outputTokens: 0, costUSD, ms }) },
      );
      sources.push(...research.sources);
      const extracted = await structuredCompletion({
        stage: "data",
        request: {
          model: cfg.SPORTS_SEARCH_MODEL, maxTokens: 8_000, schema: z.toJSONSchema(FindingSchema) as Record<string, unknown>,
          messages: [{ role: "system", content: `${FINDING_SYSTEM}\nSub-question: ${question.text}` }, { role: "user", content: JSON.stringify({ findings: research.findings, sources: research.sources }) }],
        },
        send: deps.extract ?? claudeSender({ effort: "medium", fallbacks: true }),
        parse: text => FindingSchema.parse(JSON.parse(text)),
        hooks: { usage: ({ model, usage, attempt, ms }) => hooks.usage?.({ stage: "data", model, attempt, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, costUSD: usage.costUSD ?? 0, ms }) } satisfies StructuredCompletionHooks,
      });
      hooks.finding?.(question.id, extracted.value);
      const answer = findingAnswer(extracted.value, question, research);
      hooks.progress?.(`${answer ? "Found" : "No cited answer"}: ${question.text.slice(0, 100)} (${Math.round(performance.now() - started)} ms)`);
      return [question.id, answer ?? unavailable(question, "No cited source answered this.")];
    } catch (error) {
      hooks.progress?.(`Failed: ${question.text.slice(0, 80)}: ${(error as Error).message.slice(0, 200)}`);
      return [question.id, unavailable(question, "Couldn't get this data right now.")];
    }
  }));
  const answers = Object.fromEntries(results);
  return {
    answers, sources,
    espn: plan.questions.some(q => q.source !== "web" && answers[q.id]?.status === "complete"),
    web: plan.questions.some(q => q.source === "web" && answers[q.id]?.status === "complete"),
  };
}
