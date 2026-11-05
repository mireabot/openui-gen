import { cn } from "@/lib/utils";
import { Crest, type Team } from "./team-detail";

/** One row: a circle (a team's colour and monogram), a name, an optional detail line and the metric's value. */
export type LeaderEntry = {
  name: string;
  /** Joined with " · " under the name: a player's position and club, a team's league. */
  detail?: string[];
  /** The circle: colour and monogram. */
  mark: Team;
  value: string | number;
};

/** A team row: its circle and name, with an optional detail line. */
export function teamEntry(team: Team, value: string | number, detail?: string[]): LeaderEntry {
  return { name: team.name, detail, mark: team, value };
}

/** A player row: a photo, or initials, on the club's colour, the name, then "position · club". */
export function playerEntry(player: { name: string; position?: string; club: Team; image?: string }, value: string | number): LeaderEntry {
  const initials = player.name.split(/\s+/).map((word) => word.charAt(0)).join("").slice(0, 2).toUpperCase();
  return {
    name: player.name,
    detail: [player.position, player.club.name].filter((part): part is string => !!part),
    mark: { ...player.club, monogram: initials, logo: undefined, photo: player.image },
    value,
  };
}

export type LeaderboardProps = {
  /** The list's name, top left: "Top scorers · LaLiga". */
  title?: string;
  /** The one metric every value is, top right: "Goals", "Assists", "Conceded". */
  metric: string;
  entries: LeaderEntry[];
  /** Numbers the rows 1, 2, 3… */
  ranked?: boolean;
  /** A closing row for the rest of the list: "+17 more players". */
  more?: { count: number; label: string };
  className?: string;
};

/**
 * A ranked list for one metric, from basket-card's top holdings (component-references/b06). A
 * skeleton for requests such as "best scorers in LaLiga" or "teams conceding the most": the
 * request decides the title, the metric and the rows.
 */
export function Leaderboard({ title, metric, entries, ranked = false, more, className }: LeaderboardProps) {
  return (
    <section data-node-id="leaderboard" className={cn("flex flex-col rounded-[24px] bg-kino-surface-card px-4 pt-4 pb-1", className)}>
      <header className="flex items-baseline justify-between gap-3 pb-2 text-[13px] leading-[16px] font-medium text-kino-ink-secondary">
        <span className="line-clamp-2 min-w-0">{title}</span>
        <span data-node-id="metric" className="shrink-0">{metric}</span>
      </header>
      <ol className="flex flex-col">
        {entries.map((entry, index) => (
          <li key={`${entry.name}-${index}`} data-node-id="entry" className="flex items-center gap-3 border-t border-kino-outline-subtle py-3">
            {ranked && <span className="w-5 shrink-0 text-[13px] leading-[18px] text-kino-ink-secondary tabular-nums">{index + 1}</span>}
            <Crest team={entry.mark} size={40} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-2 text-[15px] leading-[22px] font-medium">{entry.name}</span>
              {!!entry.detail?.length && <span className="line-clamp-2 text-[13px] leading-[16px] text-kino-ink-secondary">{entry.detail.join(" · ")}</span>}
            </div>
            <span data-node-id="value" className="shrink-0 text-[15px] leading-[22px] font-semibold tabular-nums">{entry.value}</span>
          </li>
        ))}
        {more && (
          <li data-node-id="more" className="flex items-center gap-3 border-t border-kino-outline-subtle py-3 text-kino-ink-secondary">
            {ranked && <span className="w-5 shrink-0" />}
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-kino-surface-filled text-[13px] leading-[18px] font-semibold">+{more.count}</span>
            <span className="text-[15px] leading-[22px]">{more.label}</span>
          </li>
        )}
      </ol>
    </section>
  );
}
