import { dataFill, dataPaint } from "@/components/catalog/design-system";
import { cn } from "@/lib/utils";

/** A team as the Sports components show it. `color` is the team's own colour, from the data. */
export type Team = {
  name: string;
  /** A short secondary name or code: "HAR", "The Harbors". */
  nickname?: string;
  color: string;
  /** One or two letters on the crest; defaults to the name's first letter. */
  monogram?: string;
  /** A crest image, fitted to the disc with nothing behind it. */
  logo?: string;
  /** A player's photo, fitted to the disc on the team colour. Wins over the logo. */
  photo?: string;
};

export type CrestSize = 20 | 40 | 56 | 80;

/** A flat circle in the team colour. The monogram shows from 40pt, where it can be read. */
export function Crest({ team, size = 20 }: { team: Team; size?: CrestSize }) {
  if (team.photo || team.logo) {
    return (
      <span
        data-node-id="crest"
        className={cn("block shrink-0", team.photo && "overflow-hidden rounded-full")}
        style={{ width: size, height: size, ...(team.photo ? dataFill(team.color) : {}) }}
      >
        <img src={team.photo ?? team.logo} alt="" className="size-full object-contain" />
      </span>
    );
  }
  return (
    <svg data-node-id="crest" width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r="20" fill={dataPaint(team.color)} />
      {size >= 40 && (
        <text x="20" y="20" dominantBaseline="central" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--color-ds-ink-on-brand)">
          {team.monogram ?? team.name.charAt(0)}
        </text>
      )}
    </svg>
  );
}

/**
 * A team on one line: crest, name, then the nickname in secondary ink. `inline` is the only
 * type so far (the row inside MatchCard); the name wraps to two lines before the nickname gives way.
 */
export function TeamDetail({ team, type = "inline", className }: { team: Team; type?: "inline"; className?: string }) {
  return (
    <div data-node-id="team-detail" data-type={type} className={cn("flex min-w-0 items-center gap-3", className)}>
      <Crest team={team} size={20} />
      <span className="line-clamp-2 text-[15px] leading-[22px] font-medium">{team.name}</span>
      {team.nickname && <span className="shrink-0 text-[13px] leading-[16px] text-ds-ink-secondary">{team.nickname}</span>}
    </div>
  );
}
