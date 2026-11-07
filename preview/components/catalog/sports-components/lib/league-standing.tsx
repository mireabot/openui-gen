import { AirplaneTiltIcon } from "@phosphor-icons/react/dist/csr/AirplaneTilt";
import { HouseLineIcon } from "@phosphor-icons/react/dist/csr/HouseLine";
import { cn } from "@/lib/utils";

/** `points` is a table's points, or a record ("6-2") in a league without them. */
export type StandingRow = { rank: number; name: string; points: number | string; isTeam?: boolean };

export type VenueStanding = { rank?: number; points: number; won: number; drawn: number; lost: number } | { rank?: number; record: string };

export type LeagueStandingProps = {
  /** The team and its nearest two, in table order, with the team marked by `isTeam`. */
  rows: StandingRow[];
  home: VenueStanding;
  away: VenueStanding;
  /** The line under the place, for a league without points: "6-2 · leads the Pacific". By default, the points gap. */
  summary?: string;
  /** Off when a TeamPoints card on the same screen answers home and away, its primary place. */
  showVenues?: boolean;
  className?: string;
};

function ordinal(value: number) {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}

/** What the place means in points: the gap to the places around it. */
function gapLine(rows: StandingRow[], team: StandingRow) {
  const above = rows.find((row) => row.rank === team.rank - 1);
  const below = rows.find((row) => row.rank === team.rank + 1);
  const points = `${team.points} points`;
  const pointsOf = (row?: StandingRow) => Number(row?.points ?? 0);
  const gap = pointsOf(team) - pointsOf(below);
  if (above && below) return `${points} · ${pointsOf(above) - pointsOf(team)} behind ${ordinal(above.rank)}, ${gap === 0 ? `level with ${ordinal(below.rank)}` : `${gap} ahead of ${ordinal(below.rank)}`}`;
  if (below) return `${points} · ${pointsOf(team) - pointsOf(below)} clear of ${ordinal(below.rank)}`;
  if (above) return `${points} · ${pointsOf(above) - pointsOf(team)} behind ${ordinal(above.rank)}`;
  return points;
}

function VenueDetail({ venue, record }: { venue: "home" | "away"; record: VenueStanding }) {
  const Icon = venue === "home" ? HouseLineIcon : AirplaneTiltIcon;
  const place = record.rank === undefined ? "" : `${ordinal(record.rank)} · `;
  return (
    <div data-node-id="venue-row">
      <span className="inline-flex items-center gap-2 text-[15px] leading-[22px] font-medium">
        <Icon className="size-4 shrink-0 text-ds-ink-secondary" />
        {venue === "home" ? "Home" : "Away"}
      </span>
      <p className="mt-1 text-[13px] leading-[18px] tabular-nums text-ds-ink-secondary">
        {place}
        {"record" in record ? record.record : `${record.points} ${record.points === 1 ? "pt" : "pts"} · ${record.won}-${record.drawn}-${record.lost}`}
      </p>
    </div>
  );
}

/**
 * A team in the league table: its place as the hero, the gap to its neighbours, its row between
 * its nearest two, then home and away. From team-points-breakdown/rank-context, without the screen.
 */
export function LeagueStanding({ rows, home, away, summary, showVenues = true, className }: LeagueStandingProps) {
  const team = rows.find((row) => row.isTeam) ?? rows[0];
  return (
    <section data-node-id="league-standing" className={cn("rounded-[24px] bg-ds-surface-card p-4", className)}>
      {team && (
        <>
          <span data-node-id="rank" className="block text-[56px] leading-[56px] font-semibold tabular-nums">
            {ordinal(team.rank)}
          </span>
          <p data-node-id="points-total" className="mt-2 text-[15px] leading-[22px] tabular-nums text-ds-ink-secondary">
            {summary ?? gapLine(rows, team)}
          </p>
        </>
      )}
      <div data-node-id="neighbours" className="mt-4 flex flex-col">
        {rows.map((row) => (
          <div
            key={row.rank}
            className={cn(
              "-mx-2 flex h-8 items-center gap-3 rounded-[8px] px-2 text-[13px] leading-[18px] tabular-nums",
              row.isTeam ? "bg-ds-surface-filled font-medium" : "text-ds-ink-secondary",
            )}
          >
            <span className="w-4 text-right">{row.rank}</span>
            <span className="line-clamp-2 min-w-0 flex-1">{row.name}</span>
            <span>{row.points}</span>
          </div>
        ))}
      </div>
      {showVenues && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-ds-outline-subtle pt-4">
          <VenueDetail venue="home" record={home} />
          <VenueDetail venue="away" record={away} />
        </div>
      )}
    </section>
  );
}
