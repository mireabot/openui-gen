"use client";

import { CurrencyDollarIcon } from "@phosphor-icons/react/dist/csr/CurrencyDollar";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { smooth, stops, toLeft, toProgress, useDragScroll } from "./year-timeline-scroll";

export type ClubStat = { label: string; value: string };
/** One club spell. `logo` is empty with no crest (the card shows a monogram on the club colour); `location` is null with none. */
export type ClubStop = { id: string; name: string; logo: string; color: string; year: string; dates: string; location: string | null; loan?: boolean; stats?: ClubStat[] };

const STATS_MAX = 3;
/** How long a hop's glide takes, during which the cards' position doesn't move the years. */
const HOP_MS = 700;
/** How long the years must stay still before a swipe of them counts as a hop. */
const RAIL_SETTLE_MS = 120;

/**
 * The years anchor the cards. The cards are one row and swipe freely: inside a year the years hold
 * still, and they snap to the next year only once a card from that year is the centred one. Going the
 * other way, tapping or swiping to a year jumps the cards to that year's first club.
 */
function useYearAnchor(clubs: ClubStop[], initial: number) {
  const { years, yearOf, firstOf } = useMemo(() => {
    const list = [...new Set(clubs.map((club) => club.year))];
    return { years: list, yearOf: clubs.map((club) => list.indexOf(club.year)), firstOf: list.map((year) => clubs.findIndex((club) => club.year === year)) };
  }, [clubs]);
  const cards = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(initial);
  const [railAt, setRailAt] = useState(yearOf[initial] ?? 0);
  const shownYear = useRef(yearOf[initial] ?? 0);
  const hopping = useRef(false);
  const railDragged = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hopTo = useCallback((year: number) => {
    if (!cards.current || !rail.current) return;
    railDragged.current = false;
    hopping.current = true;
    shownYear.current = year;
    cards.current.scrollTo({ left: toLeft(cards.current, firstOf[year] ?? 0), behavior: smooth() });
    rail.current.scrollTo({ left: stops(rail.current)[year] ?? 0, behavior: smooth() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { hopping.current = false; }, HOP_MS);
  }, [firstOf]);

  const onCards = useCallback(() => {
    if (!cards.current) return;
    const next = toProgress(cards.current);
    setProgress(next);
    if (hopping.current) return;
    const year = yearOf[Math.round(next)] ?? 0;
    if (year === shownYear.current) return;
    shownYear.current = year;
    railDragged.current = false;
    if (rail.current) rail.current.scrollTo({ left: stops(rail.current)[year] ?? 0, behavior: smooth() });
  }, [yearOf]);

  const onRail = useCallback(() => {
    if (!rail.current) return;
    const next = toProgress(rail.current);
    setRailAt(next);
    // Holding the years still mid-drag isn't letting go: the hop waits for the release.
    if (!railDragged.current || hopping.current || rail.current.dataset.dragging) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => hopTo(Math.round(next)), RAIL_SETTLE_MS);
  }, [hopTo]);

  const releaseRail = useCallback(() => { railDragged.current = true; }, []);

  useLayoutEffect(() => {
    if (cards.current) cards.current.scrollLeft = toLeft(cards.current, initial);
    if (rail.current) rail.current.scrollLeft = stops(rail.current)[yearOf[initial] ?? 0] ?? 0;
  }, [initial, yearOf]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return { years, cards, rail, progress, railAt, hopTo, onCards, onRail, releaseRail };
}

/** A club: crest, name (then a green dollar on a loan), the player's dates and location, from the leading edge, then a stats row only when it has stats. */
function Card({ club }: { club: ClubStop }) {
  const stats = (club.stats ?? []).slice(0, STATS_MAX);
  return (
    <article data-node-id="card" className="flex h-full flex-col items-start rounded-[24px] bg-ds-surface-card p-5">
      <span data-node-id="crest" className="block size-14 shrink-0">
        {club.logo
          ? <img src={club.logo} alt="" draggable={false} className="size-full object-contain" />
          : <span className="flex size-full items-center justify-center rounded-full text-[17px] leading-[22px] font-semibold text-ds-ink-on-brand" style={{ backgroundColor: club.color }}>{club.name.charAt(0)}</span>}
      </span>
      <h3 data-node-id="name" className="mt-4 text-[17px] leading-[22px] font-semibold">
        {club.name}
        {club.loan && <CurrencyDollarIcon data-node-id="loan" size={16} weight="bold" className="ml-1 inline-block -translate-y-px align-middle text-ds-tone-good-fg" />}
      </h3>
      <p data-node-id="dates" className="mt-1 text-[15px] leading-[22px] font-medium">{club.dates}</p>
      {club.location && <p data-node-id="location" className="mt-1 text-[13px] leading-[18px] text-ds-ink-secondary">{club.location}</p>}
      {stats.length > 0 && (
        <dl data-node-id="stats" className="mt-auto flex w-full gap-4 pt-4">
          <div className="flex w-full gap-4 border-t border-ds-outline-subtle pt-3">
            {stats.map((stat) => (
              <div key={stat.label} className="flex min-w-0 flex-1 flex-col">
                <dd className="text-[15px] leading-[22px] font-semibold tabular-nums">{stat.value}</dd>
                <dt className="text-[13px] leading-[18px] text-ds-ink-secondary">{stat.label}</dt>
              </div>
            ))}
          </div>
        </dl>
      )}
    </article>
  );
}

/** One stop per year over one row of club cards. With a single year there is nothing to hop between, so no years. */
export function YearTimelineView({ clubs, initial = 0 }: { clubs: ClubStop[]; initial?: number }) {
  const { years, cards, rail, progress, railAt, hopTo, onCards, onRail, releaseRail } = useYearAnchor(clubs, initial);
  useDragScroll(rail);
  useDragScroll(cards);
  return (
    <div data-node-id="club-timeline" className="flex flex-col gap-4">
      {years.length > 1 && (
        <div
          ref={rail}
          data-node-id="rail"
          onScroll={onRail}
          onPointerDown={releaseRail}
          onWheel={releaseRail}
          className="relative flex cursor-grab snap-x snap-mandatory overflow-x-auto px-[calc(50%-48px)] active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {years.map((year, index) => (
            <button key={year} type="button" onClick={() => hopTo(index)} className="flex h-10 w-24 shrink-0 snap-center items-center justify-center text-[22px] leading-[28px] font-semibold tabular-nums text-ds-ink-primary" style={{ opacity: Math.max(0.28, 1 - Math.abs(index - railAt) * 0.62) }}>
              {year}
            </button>
          ))}
        </div>
      )}
      <div
        ref={cards}
        data-node-id="cards"
        onScroll={onCards}
        className="relative flex cursor-grab snap-x snap-mandatory items-stretch gap-4 overflow-x-auto active:cursor-grabbing px-[max(0px,calc((100%-280px)/2))] py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {clubs.map((club, index) => (
          <div key={club.id} className="w-[280px] shrink-0 snap-center" style={{ opacity: 1 - 0.55 * Math.min(1, Math.abs(index - progress)) }}>
            <Card club={club} />
          </div>
        ))}
      </div>
    </div>
  );
}
