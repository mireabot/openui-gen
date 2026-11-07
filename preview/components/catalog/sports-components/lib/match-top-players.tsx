import { cn } from "@/lib/utils";
import { Crest, type Team } from "./team-detail";

/** One side's player. `value` is the metric's value on the avatar; `valueClass` is its paint. */
export type MatchPlayer = {
  name: string;
  position?: string;
  club: Team;
  image?: string;
  value: string;
  valueClass?: string;
};

export type MatchTopPlayersProps = {
  /** The card's name, top left: "Top rated". */
  title: string;
  /** The one metric every value is, top right: "Rating", "Goals". */
  metric: string;
  /** As many as the request asks for. A side with fewer players leaves its cell empty. */
  rows: { home?: MatchPlayer; away?: MatchPlayer }[];
  className?: string;
};

const NEUTRAL_VALUE = "bg-ds-surface-filled text-ds-ink-primary";

function PlayerCell({ player, side }: { player?: MatchPlayer; side: "home" | "away" }) {
  if (!player) return <span />;
  const away = side === "away";
  const initials = player.name.split(/\s+/).map((word) => word.charAt(0)).join("").slice(0, 2).toUpperCase();
  return (
    <div data-node-id="player" className={cn("flex min-w-0 items-center gap-2", away && "flex-row-reverse text-right")}>
      <span className="relative block size-14 shrink-0 p-2">
        <Crest team={{ ...player.club, monogram: initials, logo: undefined, photo: player.image }} size={40} />
        <span className={cn("absolute bottom-0", away ? "right-0" : "left-0")}>
          <Crest team={player.club} size={20} />
        </span>
        <span data-node-id="value" className={cn("absolute top-0 right-0 inline-flex h-4 items-center rounded-[4px] px-1 text-[11px] leading-4 font-semibold tabular-nums", player.valueClass ?? NEUTRAL_VALUE)}>
          {player.value}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-[15px] leading-[22px] font-medium">{player.name}</span>
        {player.position && <span className="line-clamp-2 text-[13px] leading-[16px] text-ds-ink-secondary">{player.position}</span>}
      </div>
    </div>
  );
}

/** The top players of one match from both clubs, side by side, from the Fotmob match screen's Top rated card. */
export function MatchTopPlayers({ title, metric, rows, className }: MatchTopPlayersProps) {
  return (
    <section data-node-id="match-top-players" className={cn("flex flex-col rounded-[24px] bg-ds-surface-card px-4 pt-4 pb-1", className)}>
      <header className="flex items-baseline justify-between gap-3 pb-2 text-[13px] leading-[16px] font-medium text-ds-ink-secondary">
        <span className="line-clamp-2 min-w-0">{title}</span>
        <span data-node-id="metric" className="shrink-0">{metric}</span>
      </header>
      <ol className="flex flex-col">
        {rows.map((row, index) => (
          <li key={index} data-node-id="row" className="grid grid-cols-2 gap-4 border-t border-ds-outline-subtle py-3">
            <PlayerCell player={row.home} side="home" />
            <PlayerCell player={row.away} side="away" />
          </li>
        ))}
      </ol>
    </section>
  );
}
