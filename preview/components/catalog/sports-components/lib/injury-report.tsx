import { BandaidsIcon } from "@phosphor-icons/react/dist/csr/Bandaids";
import { dataFill } from "@/components/catalog/kino";
import { cn } from "@/lib/utils";

export type InjuryTone = "bad" | "warn" | "info";

/** One injured player. Only the name, position and colour are required. */
export type InjuredPlayer = {
  readonly name: string;
  /** As the league writes it: "RB", "C", "Forward". */
  readonly position: string;
  /** Shown after the position in a list, where players can come from several teams. */
  readonly team?: string;
  /** The team's colour, behind the photo or initials. */
  readonly color: string;
  readonly photo?: string;
  /** The league's official status: NFL IR, Out, Doubtful, Questionable; NBA Out, Day-to-day. Soccer has none. */
  readonly status?: { readonly label: string; readonly tone: InjuryTone };
  /** The expected return. `until` is the wait: "Tomorrow", "3 days". */
  readonly back?: { readonly date: string; readonly day: string; readonly until: string };
  /** What stands in for a date when there is none: "Out for season", "Mid-January 2027". */
  readonly returnNote?: string;
  /** Who reported it: "Cardinals' official site". */
  readonly source?: string;
};

const LABEL = "text-[13px] leading-[16px]";
export const FOOTNOTE = "text-[13px] leading-[18px]";
const HEADLINE = "text-[17px] leading-[22px]";

const PILL = {
  bad: "bg-kino-tone-bad-bg text-kino-tone-bad-fg",
  warn: "bg-kino-tone-warn-bg text-kino-tone-warn-fg",
  info: "bg-kino-tone-info-bg text-kino-tone-info-fg",
} satisfies Record<InjuryTone, string>;

/** The surface under the avatar: the band-aid's outline is cut from it. */
const CUTOUT = { card: "ring-kino-surface-card", screen: "ring-kino-surface-screen" };

const initials = (name: string) => name.split(/\s+/).map(word => word.charAt(0)).join("").slice(0, 2).toUpperCase();

/** The photo, or initials, on the team colour, with a band-aid at the bottom right. */
export function InjuredAvatar({ player, size = 56, on = "card" }: { player: InjuredPlayer; size?: 40 | 56; on?: keyof typeof CUTOUT }) {
  return (
    <span data-node-id="avatar" className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full" style={dataFill(player.color)}>
        {player.photo
          ? <img src={player.photo} alt="" className="size-full object-cover object-top" />
          : <span className={cn(LABEL, "font-semibold text-kino-ink-on-brand")}>{initials(player.name)}</span>}
      </span>
      <span
        data-node-id="bandaid"
        className={cn("absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-kino-surface-filled text-kino-tone-bad-fg ring-2", size === 56 ? "size-5" : "size-4", CUTOUT[on])}
      >
        <BandaidsIcon className="size-3" weight="fill" />
      </span>
    </span>
  );
}

export function InjuryStatus({ status }: { status: NonNullable<InjuredPlayer["status"]> }) {
  return <span data-node-id="status" className={cn(LABEL, "flex h-6 shrink-0 items-center rounded-[8px] px-2 font-medium", PILL[status.tone])}>{status.label}</span>;
}

/** Avatar, name and position, a spacer, then the badge when there is a status. */
export function InjuryTop({ player, size, on, team }: { player: InjuredPlayer; size: 40 | 56; on: keyof typeof CUTOUT; team: boolean }) {
  const detail = team && player.team ? `${player.position} · ${player.team}` : player.position;
  return (
    <div data-node-id="top" className="flex items-center gap-3">
      <InjuredAvatar player={player} size={size} on={on} />
      <div className="min-w-0 flex-1">
        <p data-node-id="name" className={cn(HEADLINE, "truncate font-semibold")}>{player.name}</p>
        <p data-node-id="position" className={cn(FOOTNOTE, "truncate text-kino-ink-secondary")}>{detail}</p>
      </div>
      {player.status && <InjuryStatus status={player.status} />}
    </div>
  );
}

export const stand = (player: InjuredPlayer) => player.returnNote || "No return date";

/**
 * One player on a card (injury-report/countdown): the row, a hairline, then the wait on the left and
 * the date and source on the right. With no date, the note or "No return date" takes the wait's place.
 */
export function InjuryCard({ player, className }: { player: InjuredPlayer; className?: string }) {
  return (
    <article data-node-id="injury-report" className={cn("rounded-[24px] bg-kino-surface-card p-4", className)}>
      <InjuryTop player={player} size={56} on="card" team={false} />
      <div data-node-id="footer" className="mt-3 flex items-end justify-between gap-3 border-t border-kino-outline-subtle pt-3">
        {player.back ? (
          <div data-node-id="return" className="shrink-0">
            <p className={cn(LABEL, "text-kino-ink-secondary")}>{player.back.until === "Tomorrow" ? "Back" : "Back in"}</p>
            <p className={cn(HEADLINE, "font-semibold")}>{player.back.until}</p>
          </div>
        ) : (
          <p data-node-id="return" className={cn(FOOTNOTE, "shrink-0 text-kino-ink-secondary")}>{stand(player)}</p>
        )}
        <div className={cn(FOOTNOTE, "min-w-0 text-right text-kino-ink-secondary")}>
          {player.back && <p>{player.back.day}</p>}
          {player.source && <p data-node-id="source" className="truncate">{player.source}</p>}
        </div>
      </div>
    </article>
  );
}
