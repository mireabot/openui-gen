import { dataFill } from "@/components/catalog/kino";
import { cn } from "@/lib/utils";
import { RatingPill } from "./rating";
import { Crest, type Team } from "./team-detail";

/** Who the stats are about: a player (photo or initials on the club colour) or a club. */
export type StatsSubject =
  | { kind: "player"; name: string; club?: Team; position?: string; image?: string }
  | { kind: "club"; team: Team; detail?: string[] };

/** One cell. The value is shown as given ("86%", 1.8, 298); null is unavailable and is not shown. */
export type StatsCardStat = { label: string; value: string | number | null };

export type StatsCardProps = {
  subject: StatsSubject;
  /** The headline rating, coloured by bracket, with what it is and what it averages. */
  rating?: { value: number | null; label?: string; caption?: string };
  /** Any number of stats, one small card each, in a scroll rail. */
  stats: StatsCardStat[];
  className?: string;
};

const initials = (name: string) => name.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();

/** The subject's 40pt mark: a player's photo, else initials on the club colour; a club's circle. */
function SubjectMark({ subject }: { subject: StatsSubject }) {
  if (subject.kind === "club") return <Crest team={subject.team} size={40} />;
  if (subject.image) return <img src={subject.image} alt="" className="size-10 shrink-0 rounded-full object-contain" style={subject.club ? dataFill(subject.club.color) : undefined} />;
  return (
    <span
      className={cn("grid size-10 shrink-0 place-items-center rounded-full text-[13px] leading-[18px] font-semibold text-kino-ink-on-brand", !subject.club && "bg-kino-surface-filled")}
      style={subject.club ? dataFill(subject.club.color) : undefined}
    >
      {initials(subject.name)}
    </span>
  );
}

/**
 * A subject's stats: a short card with a general header (a player with club and position, or a club
 * with its detail) and the rating as a large bracket pill when there is one, then a scroll rail of
 * small cards, one per stat. A part with no data is not shown: a null rating, a null stat, no detail.
 */
export function StatsCard({ subject, rating, stats, className }: StatsCardProps) {
  const name = subject.kind === "player" ? subject.name : subject.team.name;
  const detail = subject.kind === "player" ? [subject.club?.name, subject.position].filter((p): p is string => !!p) : (subject.detail ?? []);
  const shown = stats.filter((stat) => stat.value !== null);
  return (
    <section data-node-id="stats-card" className={cn("flex flex-col gap-3", className)}>
      <div className="rounded-[24px] bg-kino-surface-card">
        <header data-node-id="subject" className="flex items-center gap-3 px-4 py-3">
          <SubjectMark subject={subject} />
          <div className="flex min-w-0 flex-col">
            <span className="line-clamp-2 text-[17px] leading-[22px] font-semibold">{name}</span>
            {detail.length > 0 && <span className="line-clamp-2 text-[13px] leading-[18px] text-kino-ink-secondary">{detail.join(" · ")}</span>}
          </div>
        </header>
        {rating?.value != null && (
          <div data-node-id="rating-hero" className="flex items-center gap-4 border-t border-kino-outline-subtle px-4 py-4">
            <RatingPill value={rating.value} large />
            <div className="flex min-w-0 flex-col">
              <span className="text-[15px] leading-[22px] font-medium">{rating.label ?? "Rating"}</span>
              {rating.caption && <span className="text-[13px] leading-[18px] text-kino-ink-secondary">{rating.caption}</span>}
            </div>
          </div>
        )}
      </div>
      {shown.length > 0 && (
        <div data-node-id="stats" className="-mx-6 flex gap-3 overflow-x-auto px-6 py-1">
          {shown.map((stat) => (
            <div key={stat.label} className="flex w-[124px] shrink-0 flex-col gap-1 rounded-[24px] bg-kino-surface-card p-4">
              <span className="text-[17px] leading-[22px] font-semibold tabular-nums">{stat.value}</span>
              <span className="text-[13px] leading-[18px] text-kino-ink-secondary">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
