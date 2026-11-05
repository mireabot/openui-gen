"use client";

import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { BellRingingIcon } from "@phosphor-icons/react/dist/csr/BellRinging";
import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { TeamDetail, type Team } from "./team-detail";

export type MatchCardProps = {
  home: Team;
  away: Team;
  /** The side column's small line, e.g. a date ("Sat, Oct 31"). */
  label?: string;
  /** The side column's large line, e.g. a kickoff time ("6:30 PM"). With no label or value the column is gone. */
  value?: string;
  /** The footer line, joined with " · ": stage, venue, where to watch, or anything else. */
  details?: string[];
  /** The final (or current) score. Each team row then ends in its score; the losing score is secondary. */
  score?: { home: number; away: number };
  /** The game is over: no reminder bell. Defaults to true when there is a score. */
  past?: boolean;
  /** Adds a reminder bell (a toggle) to the footer of an upcoming game. */
  remindable?: boolean;
  onRemindChange?: (on: boolean) => void;
  /** Makes the whole card pressable, e.g. to open the match. */
  onPress?: () => void;
  className?: string;
};

/** A team, then (with a score) a spacer and its score: the winner's in primary ink, the loser's secondary. A draw keeps both primary. */
function TeamRow({ team, score, against }: { team: Team; score?: number; against?: number }) {
  if (score === undefined) return <TeamDetail team={team} />;
  const lost = against !== undefined && score < against;
  return (
    <div className="flex items-center gap-3">
      <TeamDetail team={team} />
      <span className="flex-1" />
      <span data-node-id="score" className={cn("text-[17px] leading-[22px] font-semibold tabular-nums", lost ? "text-kino-ink-secondary" : "text-kino-ink-primary")}>
        {score}
      </span>
    </div>
  );
}

/**
 * One match, from match-card/stacked-rows: two TeamDetail rows, an optional side column and an
 * optional footer. Everything except the two teams is optional generic text. With a score the
 * rows end in the score and the game counts as past, so the reminder bell is not shown.
 */
export function MatchCard({ home, away, label, value, details = [], score, past = score !== undefined, remindable = false, onRemindChange, onPress, className }: MatchCardProps) {
  const [reminded, setReminded] = useState(false);
  const side = label !== undefined || value !== undefined;
  const bell = remindable && !past;
  const footer = details.length > 0 || bell;
  const press = (event: KeyboardEvent) => {
    if (onPress && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onPress(); }
  };
  return (
    <div
      data-node-id="match-card"
      role={onPress ? "button" : undefined}
      tabIndex={onPress ? 0 : undefined}
      onClick={onPress}
      onKeyDown={press}
      className={cn(
        "flex flex-col rounded-[24px] bg-kino-surface-card px-4 pt-4",
        footer ? "pb-1" : "pb-4",
        onPress && "cursor-pointer transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] select-none active:scale-[0.97] has-[button:active]:scale-100 motion-reduce:active:scale-100",
        className,
      )}
    >
      <div className="flex items-stretch gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TeamRow team={home} score={score?.home} against={score?.away} />
          <TeamRow team={away} score={score?.away} against={score?.home} />
        </div>
        {side && (
          <div data-node-id="side" className="flex w-24 shrink-0 flex-col items-end justify-center border-l border-kino-outline-subtle pl-4">
            {label !== undefined && <span className="text-[13px] leading-[18px] text-kino-ink-secondary">{label}</span>}
            {value !== undefined && <span className="text-[17px] leading-[22px] font-semibold">{value}</span>}
          </div>
        )}
      </div>
      {footer && (
        <div data-node-id="details" className="mt-3 flex min-h-11 items-center gap-3 border-t border-kino-outline-subtle">
          <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px] text-kino-ink-secondary">{details.join(" · ")}</span>
          {bell && (
            <button
              type="button"
              data-node-id="reminder"
              onClick={(event) => { event.stopPropagation(); setReminded(!reminded); onRemindChange?.(!reminded); }}
              onKeyDown={(event) => event.stopPropagation()}
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
                reminded ? "bg-kino-surface-brand text-kino-ink-on-brand" : "text-kino-ink-secondary",
              )}
            >
              {reminded ? <BellRingingIcon className="size-6" weight="fill" /> : <BellIcon className="size-6" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
