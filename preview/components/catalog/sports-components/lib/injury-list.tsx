import { cn } from "@/lib/utils";
import { FOOTNOTE, InjuryTop, stand, type InjuredPlayer } from "./injury-report";

/** One player as a bare list element (injury-report/card-or-row): the row at 40, the bottom line under the name. */
export function InjuryRow({ player, className }: { player: InjuredPlayer; className?: string }) {
  return (
    <div data-node-id="injury-report" className={className}>
      <InjuryTop player={player} size={40} on="screen" team />
      <p data-node-id="footer" className={cn(FOOTNOTE, "mt-1 truncate pl-[52px] text-ds-ink-secondary")}>
        <span data-node-id="return" className="font-medium text-ds-ink-primary">{player.back ? `Back ${player.back.date}` : stand(player)}</span>
        {player.source && <span data-node-id="source"> · {player.source}</span>}
      </p>
    </div>
  );
}

/** Rows on the screen with hairlines between them, under an optional title. */
export function InjuryList({ title, players, className }: { title?: string; players: readonly InjuredPlayer[]; className?: string }) {
  return (
    <section data-node-id="injury-list" className={className}>
      {title && <h3 className={cn(FOOTNOTE, "mb-3 font-medium text-ds-ink-secondary")}>{title}</h3>}
      <ul className="flex flex-col">
        {players.map(player => (
          <li key={player.name} className="border-t border-ds-outline-subtle py-3 first:border-t-0 first:pt-0 last:pb-0">
            <InjuryRow player={player} />
          </li>
        ))}
      </ul>
    </section>
  );
}
