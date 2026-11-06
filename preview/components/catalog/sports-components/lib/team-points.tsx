import type { ReactNode } from "react";
import { AirplaneTiltIcon } from "@phosphor-icons/react/dist/csr/AirplaneTilt";
import { HouseLineIcon } from "@phosphor-icons/react/dist/csr/HouseLine";
import { cn } from "@/lib/utils";

/** One venue's record, as numbers. Goal difference is derived, so it can't disagree with the goals. */
export type VenueRecord = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type TeamPointsProps = {
  title?: string;
  rank: number;
  home: VenueRecord;
  away: VenueRecord;
  className?: string;
};

const COLUMNS = "grid grid-cols-[minmax(0,1fr)_24px_24px_24px_24px_44px_28px_28px] items-center gap-x-1 text-right tabular-nums";

/** Always signed, with a true minus: +19, −6, 0. */
function signed(value: number) {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

function VenueRow({ label, record }: { label: ReactNode; record: VenueRecord }) {
  const difference = record.goalsFor - record.goalsAgainst;
  return (
    <div data-node-id="venue-row" className={cn(COLUMNS, "h-11 text-[13px] leading-[18px]")}>
      <span className="text-left">{label}</span>
      <span>{record.played}</span>
      <span>{record.won}</span>
      <span>{record.drawn}</span>
      <span>{record.lost}</span>
      <span className="text-kino-ink-secondary">{`${record.goalsFor}-${record.goalsAgainst}`}</span>
      <span className={difference < 0 ? "text-kino-tone-bad-fg" : "text-kino-ink-primary"}>{signed(difference)}</span>
      <span className="font-semibold">{record.points}</span>
    </div>
  );
}

function Venue({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] leading-[22px] font-medium">
      {icon}
      {children}
    </span>
  );
}

/**
 * A team's points so far this season: the total and rank, then its record split by venue. From
 * team-points-breakdown/table-reference, without the screen around it.
 */
export function TeamPoints({ title = "Home and away", rank, home, away, className }: TeamPointsProps) {
  return (
    <section data-node-id="team-points" className={cn("rounded-[24px] bg-kino-surface-card p-4", className)}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] leading-[22px] font-semibold">{title}</h2>
          <p className="text-[13px] leading-[18px] text-kino-ink-secondary">
            Rank {rank} · {home.played + away.played} played
          </p>
        </div>
        <span data-node-id="points-total" className="text-[28px] leading-[34px] font-semibold tabular-nums">
          {home.points + away.points}
        </span>
      </header>
      <div className="mt-4">
        <div className={cn(COLUMNS, "text-[13px] leading-[16px] text-kino-ink-secondary")}>
          <span />
          <span>Pld</span>
          <span>W</span>
          <span>D</span>
          <span>L</span>
          <span>+/-</span>
          <span>GD</span>
          <span>PTS</span>
        </div>
        <div className="mt-1 divide-y divide-kino-outline-subtle">
          <VenueRow label={<Venue icon={<HouseLineIcon className="size-4 shrink-0 text-kino-ink-secondary" />}>Home</Venue>} record={home} />
          <VenueRow label={<Venue icon={<AirplaneTiltIcon className="size-4 shrink-0 text-kino-ink-secondary" />}>Away</Venue>} record={away} />
        </div>
      </div>
    </section>
  );
}
