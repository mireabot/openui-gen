import { z } from "zod";
import { config } from "../config.js";
import { modelSender } from "../llm/generation.js";
import { structuredCompletion, type CompletionSender, type StructuredCompletionHooks } from "../llm/structured-completion.js";
import type { MockValue } from "../research/dataset-schema.js";
import { researchWithParallel, type ParallelTransport } from "../research/parallel-research.js";
import { citationKey, type WebResearch, type WebSource } from "../research/web-research.js";
import { lookupPlayer, matchRatings, playerNameKey, playerValue, type FotmobTransport, type LineupPlayer, type PlayerLookup, type PlayerPicker, type RatedPlayer } from "./fotmob.js";
import { withStatBars } from "./components.js";
import { LEAGUES, withMatchCards, type EspnTransport } from "./espn.js";
import { isSoccer, LEAGUE_CONFIG, leagueOf, sportOf } from "./leagues.js";
import { sportsLookup, feedSourceName } from "./feeds.js";

import type { SportsPlan, SportsQuestion } from "./plan.js";

/**
 * Every question at once. ESPN questions read their feed directly. Web questions are parallel
 * searches: Parallel's Search and Extract APIs find and read the pages, then Sonnet
 * (SPORTS_SEARCH_MODEL) turns them into one cited finding. A question that fails or cites nothing
 * comes back unavailable with a note, so the screen says so instead of inventing an answer.
 */

/** Soccer's sources searched first; their pages lead the findings and win when pages disagree. Other leagues name their own. */
export const SPORTS_PREFERRED_SOURCES = [...LEAGUE_CONFIG["eng.1"].research.domains];

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
  const atHome = match.venueSide === "home";
  const [own, other] = atHome ? [ratings.home, ratings.away] : [ratings.away, ratings.home];
  const [ownSquad, otherSquad] = atHome ? [ratings.lineup.home, ratings.lineup.away] : [ratings.lineup.away, ratings.lineup.home];
  const [ownTeam, otherTeam] = atHome ? [home.name, away.name] : [away.name, home.name];
  // Every player carries their club, so the server paints their disc in its colour.
  const plain = (players: readonly RatedPlayer[], team: string) => players.map(player => ({ ...player, team, color: "" }));
  // The squad sheet has every player's FotMob id, so their photo is known before any search.
  const withPhotos = (players: MockValue | undefined, squad: readonly LineupPlayer[], team: string) => (Array.isArray(players) ? players : []).map(player => {
    if (!player || typeof player !== "object" || Array.isArray(player) || typeof player.name !== "string") return player;
    const found = inSquad(squad, player.name);
    return { ...player, team, color: "", ...(found ? { fotmobId: found.fotmobId, imageUrl: found.imageUrl, logo: found.imageUrl, kind: "player" } : {}) };
  });
  const squad = [...ownSquad.map(player => ({ ...player, team: ownTeam })), ...otherSquad.map(player => ({ ...player, team: otherTeam }))];
  const person = (name: string) => {
    const found = inSquad(squad, name);
    return { name, kind: "player", team: squad.find(player => player.fotmobId === found?.fotmobId)?.team ?? "", color: "",
      fotmobId: found?.fotmobId ?? null, imageUrl: found?.imageUrl ?? "", logo: found?.imageUrl ?? "" };
  };
  const goals = (Array.isArray(values.goals) ? values.goals : []).map(goal => {
    if (!goal || typeof goal !== "object" || Array.isArray(goal)) return goal;
    return { ...goal, scorerPlayer: person(typeof goal.scorer === "string" ? goal.scorer : ""), assistPlayer: person(typeof goal.assist === "string" ? goal.assist : "") };
  });
  return {
    goals,
    teamRated: plain(own, ownTeam), opponentRated: plain(other, otherTeam),
    teamPlayers: withPhotos(values.teamPlayers, ownSquad, ownTeam), opponentPlayers: withPhotos(values.opponentPlayers, otherSquad, otherTeam),
  };
}

/**
 * The squad member an ESPN name means: the same name, or the one player whose name's words all appear in
 * the other's ("Gabriel" for ESPN's "Gabriel Magalhães"). Null when none, or more than one, fits.
 */
export function inSquad(squad: readonly LineupPlayer[], name: string): LineupPlayer | null {
  const key = playerNameKey(name);
  const exact = squad.find(player => playerNameKey(player.name) === key);
  if (exact) return exact;
  const words = (value: string) => playerNameKey(value).split(" ").filter(Boolean);
  const covers = (short: string[], long: string[]) => short.length > 0 && short.every(word => long.includes(word));
  const fits = squad.filter(player => { const [a, b] = [words(player.name), words(name)]; return covers(a, b) || covers(b, a); });
  return fits.length === 1 ? fits[0]! : null;
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

export async function answerSports(plan: SportsPlan, prompt: string, now: Date, hooks: ResearchHooks = {}, deps: ResearchDeps = {}, timeZone?: string): Promise<Answered> {
  const cfg = config();
  const today = now.toISOString().slice(0, 10);
  // Web questions name no league of their own: they follow the screen's, and soccer otherwise.
  const research = leagueOf(plan.subject.league ?? "eng.1").research;
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
        hooks.progress?.(`${feedSourceName(question.league)} ${question.feed}${question.team ? ` · ${question.team}` : ""}${question.opponent ? ` v ${question.opponent}` : ""}: ${question.text.slice(0, 100)}`);
        const espn = await sportsLookup({ league: question.league, feed: question.feed, team: question.team, opponent: question.opponent, dates: question.date, season: question.season, ...(question.player ? { player: question.player } : {}), ...(question.week != null ? { week: question.week } : {}),
          ...(question.lastGames !== undefined ? { lastGames: question.lastGames } : {}), ...(question.allCompetitions !== undefined ? { allCompetitions: question.allCompetitions } : {}) }, deps.espn, now);
        // A match's figures come as StatBar records, one per stat in club colours.
        const values = withStatBars(withMatchCards(espn.values, LEAGUES[question.league], timeZone ?? leagueOf(question.league).defaultTimeZone, sportOf(question.league))) as Record<string, MockValue>;
        // FotMob rates soccer only, so another sport must not spend a request on it.
        const rated = question.feed === "match" && isSoccer(question.league) ? await withMatchRatings(values, deps.fotmob) : null;
        const complete = { ...values, ...rated };
        hooks.finding?.(question.id, complete);
        return [question.id, { status: "complete", question: question.text, title: question.text.slice(0, 60), ...complete, source: rated ? `${espn.source} · FotMob ratings` : espn.source }];
      }
      hooks.progress?.(`Searching: ${question.text.slice(0, 120)}`);
      const started = performance.now();
      const found = await researchWithParallel(
        `${question.text}\nAbout: ${plan.subject.name}${plan.subject.season ? `, ${plan.subject.season}` : ""}, as of ${today}. Prefer official league and club sites and ${research.phrase}, with dates.\nThe user's full request, for context: "${prompt}"`,
        { searchQueries: question.searchQueries, mode: cfg.PARALLEL_SEARCH_MODE, preferDomains: [...research.domains],
          ...(deps.parallel ? { send: deps.parallel } : {}),
          usage: ({ model, costUSD, ms }) => hooks.usage?.({ stage: "search", model, inputTokens: 0, outputTokens: 0, costUSD, ms }) },
      );
      sources.push(...found.sources);
      const extracted = await structuredCompletion({
        stage: "data",
        request: {
          model: cfg.SPORTS_SEARCH_MODEL, maxTokens: 8_000, schema: z.toJSONSchema(FindingSchema) as Record<string, unknown>,
          messages: [{ role: "system", content: `${FINDING_SYSTEM}\nSub-question: ${question.text}` }, { role: "user", content: JSON.stringify({ findings: found.findings, sources: found.sources }) }],
        },
        send: deps.extract ?? modelSender({ effort: "medium", fallbacks: true }),
        parse: text => FindingSchema.parse(JSON.parse(text)),
        hooks: { usage: ({ model, usage, attempt, ms }) => hooks.usage?.({ stage: "data", model, attempt, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, costUSD: usage.costUSD ?? 0, ms }) } satisfies StructuredCompletionHooks,
      });
      hooks.finding?.(question.id, extracted.value);
      const answer = findingAnswer(extracted.value, question, found);
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
