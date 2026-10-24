import type { MockValue } from "../../research/dataset-schema.js";

/**
 * Consensus: any group of voters split between two or three sides (analyst ratings, critics,
 * a team poll). Shared by packs; the stocks pack fills it with analyst ratings.
 *
 * The rule that makes it generic (consensus-card exploration):
 * - the score is the winning side's share; the colour (tone) follows the winner;
 * - sides keep a fixed order in the bar (e.g. Buy · Hold · Sell), so it never flips;
 * - a tie has no winner: the score is the count ("4–4") and the verdict "Split decision";
 * - fewer than MIN_VOTERS is flagged with a note.
 * Every string is built here; the writer binds and never types a figure.
 */

export const MIN_VOTERS = 3;

export type Tone = "good" | "bad" | "neutral";
export interface ConsensusSide { readonly label: string; readonly count: number; readonly tone: Tone }
export interface ConsensusInput {
  /** What is being decided: "Analyst consensus", "Critics", "Ship v2 on Friday?". */
  readonly title: string;
  /** The thing it is about, short: "NVDA". */
  readonly subject: string;
  /** Plural noun for voters: "analysts", "reviews", "votes". */
  readonly voterNoun: string;
  /** Noun for the verdict sentence: "Consensus" → "Consensus is Buy". */
  readonly verdictNoun?: string;
  /** In display order (the bar's order). */
  readonly sides: readonly ConsensusSide[];
  /** Named voters for the avatar stack (may be empty). */
  readonly voters: readonly string[];
  readonly previous?: { readonly label: string; readonly sides: readonly ConsensusSide[] } | undefined;
  readonly momentum?: { readonly up: number; readonly down: number; readonly window: string } | undefined;
  readonly target?: { readonly avg: number; readonly low: number | null; readonly high: number | null; readonly price: number } | undefined;
}

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function winnerOf(sides: readonly ConsensusSide[]) {
  const total = sides.reduce((a, s) => a + s.count, 0);
  const ranked = [...sides].sort((a, b) => b.count - a.count);
  const tie = !total || (ranked[1] !== undefined && ranked[0]!.count === ranked[1].count);
  return { total, top: ranked[0]!, tie, share: total ? Math.round((100 * ranked[0]!.count) / total) : 0 };
}

/** The display record every consensus block binds to. */
export function consensusRecord(c: ConsensusInput): Record<string, MockValue> {
  const w = winnerOf(c.sides);
  const noun = c.verdictNoun ?? "Consensus";
  const thin = w.total > 0 && w.total < MIN_VOTERS;
  const winnerLabel = w.tie ? "Split" : w.top.label;
  const record: Record<string, MockValue> = {
    title: c.title,
    subject: c.subject,
    source: `From ${w.total} ${c.voterNoun}`,
    voters: [...c.voters].slice(0, 12),
    // Whether the avatar row draws. A set decides it once for all its items (uniformVoters).
    showVoters: c.voters.length > 0,
    sides: c.sides.map((s) => ({ label: s.label, count: s.count, tone: s.tone })),
    score: w.tie ? c.sides.map((s) => s.count).join("–") : `${w.share}%`,
    verdict: w.tie ? "Split decision" : `${noun} is ${w.top.label}`,
    verdictWord: winnerLabel.toUpperCase(),
    verdictLabel: winnerLabel,
    verdictShare: w.tie ? "Split" : `${w.top.label} ${w.share}%`,
    shareText: w.tie ? `No majority among ${w.total} ${c.voterNoun}` : `${w.share}% of ${w.total} ${c.voterNoun} agree`,
    tone: w.tie ? "neutral" : w.top.tone,
    hasNote: thin,
    note: thin ? `Only ${w.total} ${c.voterNoun} cover it` : "",
  };
  if (c.previous) {
    const p = winnerOf(c.previous.sides);
    // The move of the current winner's share since then (or the plain count change on a tie).
    const thenShare = p.total ? Math.round((100 * (c.previous.sides.find((s) => s.label === w.top.label)?.count ?? 0)) / p.total) : 0;
    const delta = w.share - thenShare;
    record.shift = {
      label: c.previous.label,
      sides: c.previous.sides.map((s) => ({ label: s.label, count: s.count, tone: s.tone })),
      share: p.tie ? "Split" : `${p.share}% ${p.top.label}`,
      now: w.tie ? "Split" : `${w.share}% ${w.top.label}`,
      delta: w.tie ? `Even now, from ${p.tie ? "a tie" : `${p.share}% ${p.top.label}`}` : `${delta >= 0 ? "Up" : "Down"} ${Math.abs(delta)} points since ${c.previous.label.toLowerCase()}`,
      deltaTone: w.tie || delta === 0 ? "neutral" : delta > 0 ? w.top.tone : "neutral",
    };
  }
  if (c.momentum) {
    record.momentum = {
      up: `${c.momentum.up} upgrade${c.momentum.up === 1 ? "" : "s"}`,
      down: `${c.momentum.down} downgrade${c.momentum.down === 1 ? "" : "s"}`,
      window: c.momentum.window,
    };
  }
  if (c.target) {
    const upside = Math.round((1000 * (c.target.avg - c.target.price)) / c.target.price) / 10;
    record.target = {
      avg: usd(c.target.avg),
      upside: `${upside >= 0 ? "+" : "−"}${Math.abs(upside)}% from ${usd(c.target.price)}`,
      tone: upside >= 0 ? "good" : "bad",
      summary: c.target.low !== null && c.target.high !== null ? `Targets range ${usd(c.target.low)}–${usd(c.target.high)}.` : "",
    };
  }
  return record;
}

/**
 * A set shows voter avatars on every item or on none, so tiles in a grid keep one height:
 * avatars only when every item has voters.
 */
export function uniformVoters<T extends Record<string, MockValue>>(set: readonly T[]): (T & { showVoters: boolean })[] {
  const all = set.every((c) => Array.isArray(c.voters) && c.voters.length > 0);
  return set.map((c) => ({ ...c, showVoters: all }));
}


