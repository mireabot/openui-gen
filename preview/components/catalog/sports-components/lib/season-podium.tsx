import { dataPaint } from "@/components/catalog/kino";
import { cn } from "@/lib/utils";
import { Crest, type CrestSize, type Team } from "./team-detail";

export type PodiumPlace = {
  team: Team;
  /** The place's colour, from the data: gold, silver or bronze. */
  medal: string;
  /** A logo URL, with nothing behind it; without one the crest is the club colour and its monogram. */
  logo?: string;
};

export type SeasonPodiumProps = {
  first: PodiumPlace;
  second: PodiumPlace;
  third: PodiumPlace;
  className?: string;
};

/** Figma Elevation/2, in Kino's shadow tokens. */
const ELEVATION = "shadow-[inset_0_1px_0_var(--color-kino-shadow-highlight-med),0_2px_6px_var(--color-kino-shadow-low),0_16px_40px_var(--color-kino-shadow-high)]";

const NUMERAL = {
  1: { width: 24, height: 45, fontSize: 36 },
  2: { width: 24, height: 28, fontSize: 22 },
  3: { width: 24, height: 28, fontSize: 22 },
};

function Column({ rank, place, size }: { rank: 1 | 2 | 3; place: PodiumPlace; size: CrestSize }) {
  const numeral = NUMERAL[rank];
  return (
    <div data-node-id={`place-${rank}`} className="flex min-w-0 flex-col items-center gap-2">
      {/* SVG text, because a medal colour is data and data colours paint through dataPaint. */}
      <svg data-node-id="numeral" width={numeral.width} height={numeral.height} viewBox={`0 0 ${numeral.width} ${numeral.height}`}>
        <text
          x={numeral.width / 2}
          y={numeral.height / 2}
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={numeral.fontSize}
          fontWeight="600"
          fill={dataPaint(place.medal)}
        >
          {rank}
        </text>
      </svg>
      <span className={cn("relative block shrink-0", !place.logo && cn("overflow-hidden rounded-full", ELEVATION))} style={{ width: size, height: size }}>
        {place.logo ? (
          <span className="flex size-full items-center justify-center">
            <img src={place.logo} alt="" className="size-full object-contain" />
          </span>
        ) : (
          <Crest team={place.team} size={size} />
        )}
      </span>
      <p
        data-node-id="club-name"
        className={cn(
          "line-clamp-2 min-h-9 w-full text-center text-[13px] leading-[18px]",
          rank === 1 ? "font-semibold text-kino-ink-primary" : "text-kino-ink-secondary",
        )}
      >
        {place.team.name}
      </p>
    </div>
  );
}

/**
 * How a league's season ended, from Figma Kino Screens 225:2579: three columns in podium order 2, 1,
 * 3, each a place numeral, an avatar and a centred name. Club crests with no fill replace
 * the reference's posters, scaled by place (80, 56, 40), and the numerals take the place's colour. The avatars' bottoms and the
 * names line up across the columns; no card.
 */
export function SeasonPodium({ first, second, third, className }: SeasonPodiumProps) {
  return (
    <section data-node-id="season-podium" className={cn("grid grid-cols-3 items-end gap-3", className)}>
      <Column rank={2} place={second} size={56} />
      <Column rank={1} place={first} size={80} />
      <Column rank={3} place={third} size={40} />
    </section>
  );
}
