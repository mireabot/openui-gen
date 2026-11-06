import type { ContractField } from "./components.js";

/**
 * Every name the server owns in a sports answer, with who writes it and what it means. This is the
 * only list: the frame names, the root names lockFacts skips and the label names coverage ignores all
 * derive from it. To add a server-owned name, add one entry here.
 *
 * The rule for contracts: a contract field never uses a frame name at any segment of its path, and
 * uses a shared name only with the meaning, kind and values given here. Then a component record is
 * safe wherever it sits: the answer's top level, a field, a list item or any deeper level.
 */

export type ReservedName =
  | {
      /** Written by the server on every answer's top level, over whatever the design put there. */
      readonly role: "frame";
      readonly owner: string;
      readonly meaning: string;
      /** Reading it shows the answer (a summary, a note). Otherwise it only labels the answer. */
      readonly shows: boolean;
      /** What a contract calls its own field of this kind; the check's error names it. */
      readonly instead: string;
    }
  | {
      /** Read or written by the server at any depth, on any record of the right shape. */
      readonly role: "shared";
      readonly owner: string;
      readonly meaning: string;
      /** It also names what a whole answer is about when it sits at the top level. */
      readonly atRoot: boolean;
      /** The contract kind a field with this name must have, or null when no contract may use it. */
      readonly kind: ContractField["kind"] | null;
      /** The only values a field with this name may hold, when the meaning fixes them. */
      readonly values?: readonly string[];
    };

export const RESERVED = {
  status: { role: "frame", owner: "research.ts answerSports", meaning: "\"complete\" or \"unavailable\"", shows: false, instead: "a word for what the status is, e.g. injuryStatus" },
  question: { role: "frame", owner: "research.ts answerSports", meaning: "the planned question's text", shows: false, instead: "a word for what is asked" },
  title: { role: "frame", owner: "dataset.ts checked (the design's title)", meaning: "the answer's heading", shows: false, instead: "heading" },
  summary: { role: "frame", owner: "research.ts answerSports", meaning: "one or two sentences answering the question", shows: true, instead: "a word for what the line says, e.g. tally or gaps" },
  note: { role: "frame", owner: "research.ts unavailable", meaning: "why the answer is unavailable", shows: true, instead: "a word for what the note says" },
  source: { role: "frame", owner: "research.ts answerSports", meaning: "the answer's source line", shows: false, instead: "reportedBy" },
  asOf: { role: "frame", owner: "research.ts answerSports", meaning: "when the data was read", shows: false, instead: "updated" },

  team: { role: "shared", owner: "the feeds (the subject's club); player-images.ts reads it for a player's club", meaning: "the club a player or an answer belongs to", atRoot: true, kind: "text" },
  kind: { role: "shared", owner: "player-images.ts populatePlayerImages", meaning: "what an Avatar draws: a player's photo or a club's crest", atRoot: false, kind: "text", values: ["player", "club"] },
  logo: { role: "shared", owner: "player-images.ts populatePlayerImages and fillClubMarks", meaning: "a photo or crest URL, or \"\"", atRoot: false, kind: "text" },
  color: { role: "shared", owner: "player-images.ts fillClubMarks", meaning: "a club colour \"#rrggbb\", \"clear\" or \"\"", atRoot: false, kind: "color" },
  detail: { role: "shared", owner: "components.ts settleMissing", meaning: "a short secondary line; anything but text becomes \"\"", atRoot: false, kind: "text" },
  fotmobId: { role: "shared", owner: "player-images.ts populatePlayerImages", meaning: "a FotMob player id", atRoot: false, kind: null },
  imageUrl: { role: "shared", owner: "player-images.ts populatePlayerImages", meaning: "a FotMob headshot URL", atRoot: false, kind: null },
  scorerPlayer: { role: "shared", owner: "player-images.ts populatePlayerImages", meaning: "a goal's scorer as a player record", atRoot: false, kind: null },
  assistPlayer: { role: "shared", owner: "player-images.ts populatePlayerImages", meaning: "a goal's assister as a player record", atRoot: false, kind: null },
} as const satisfies Record<string, ReservedName>;

type Names = keyof typeof RESERVED;
export type FrameName = { [K in Names]: (typeof RESERVED)[K]["role"] extends "frame" ? K : never }[Names];

const names = Object.keys(RESERVED) as Names[];

/** What the server writes on every answer's top level, in the order the designer prompt lists them. */
export const FRAME_NAMES: readonly FrameName[] = names.filter((name): name is FrameName => RESERVED[name].role === "frame");

export const isFrameName = (key: string): key is FrameName => (FRAME_NAMES as readonly string[]).includes(key);

/** Top-level keys that say what an answer is rather than what it answers: never a repeated fact. */
export const ROOT_NAMES: ReadonlySet<string> = new Set(names.filter(name => {
  const entry: ReservedName = RESERVED[name];
  return entry.role === "frame" || entry.atRoot;
}));

/** Top-level keys that only label an answer: reading them alone does not show it. */
export const LABEL_NAMES: ReadonlySet<string> = new Set([...ROOT_NAMES].filter(name => {
  const entry: ReservedName = RESERVED[name as Names];
  return entry.role !== "frame" || !entry.shows;
}));
