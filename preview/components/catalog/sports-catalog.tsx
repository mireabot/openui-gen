"use client";

import { useState, type ReactNode } from "react";
import MatchCard from "./sports-components/match-card";
import StatsCard from "./sports-components/stats-card";
import TeamPoints from "./sports-components/team-points";
import LeagueStanding from "./sports-components/league-standing";
import SeasonPodium from "./sports-components/season-podium";
import PlayerValue from "./sports-components/player-value";
import FixturesHeatmap from "./sports-components/fixtures-heatmap";
import StatBar from "./sports-components/stat-bar";
import Leaderboard from "./sports-components/leaderboard";
import MatchTopPlayers from "./sports-components/match-top-players";
import TeamDetail from "./sports-components/team-detail";
import ClubTimeline from "./club-timeline/showcase";

const sourceGroups = [
  { name: "Cards", description: "Matches, season records and the figures behind a player or club.", components: [
    { id: "MatchCard", name: "Match card", summary: "Two clubs, scores or kickoff time, with optional match details and a reminder.", preview: <MatchCard /> },
    { id: "StatsCard", name: "Stats card", summary: "A player or club header, an optional rating, and a scrollable row of stats.", preview: <StatsCard /> },
    { id: "TeamPoints", name: "Team points", summary: "Season points with a home and away breakdown.", preview: <TeamPoints /> },
    { id: "LeagueStanding", name: "League standing", summary: "A club’s place in the table, nearby teams and optional venue context.", preview: <LeagueStanding /> },
    { id: "SeasonPodium", name: "Season podium", summary: "The top three clubs in a completed season, arranged by finishing place.", preview: <SeasonPodium /> },
  ] },
  { name: "Charts", description: "Values over time, fixture outcomes and head-to-head comparisons.", components: [
    { id: "PlayerValue", name: "Player value", summary: "A stepped market value chart with club spells and a scrubbable value readout.", preview: <PlayerValue /> },
    { id: "FixturesHeatmap", name: "Fixtures heatmap", summary: "A compact season view with distinct marks for wins, draws, losses and upcoming games.", preview: <FixturesHeatmap /> },
    { id: "StatBar", name: "Stat bar", summary: "Compare one statistic across two clubs, with values and proportional bars.", preview: <StatBar /> },
  ] },
  { name: "Lists", description: "Rankings, player comparisons and compact team identity.", components: [
    { id: "Leaderboard", name: "Leaderboard", summary: "Ranked players or clubs with optional positions, photos and a trailing value.", preview: <Leaderboard /> },
    { id: "MatchTopPlayers", name: "Match top players", summary: "The leading players from both sides of a match, aligned by rating or another metric.", preview: <MatchTopPlayers /> },
    { id: "TeamDetail", name: "Team detail", summary: "A team crest and name with optional nickname or secondary context.", preview: <TeamDetail /> },
  ] },
  { name: "Timelines", description: "Club history with a year rail that follows the selected club.", components: [
    { id: "ClubTimeline", name: "Club timeline", summary: "Swipe between club spells or select a year. Loans have a marker; up to three stats are optional.", preview: <ClubTimeline /> },
  ] },
];

export interface CatalogComponent {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly preview: ReactNode;
}

export function SportsCatalog({ custom }: { custom: readonly CatalogComponent[] }) {
  const groups = [...sourceGroups, {
    name: "Custom",
    description: "Components composed on request from OpenUI primitives.",
    components: custom,
  }];
  const [filter, setFilter] = useState("All components");
  return <main className="h-full overflow-y-auto bg-kino-surface-screen text-kino-ink-primary [color-scheme:dark]">
    <div className="mx-auto max-w-[1680px] px-5 py-10 md:px-10 md:py-14">
      <header className="max-w-[650px]"><h1 className="text-[34px] leading-[40px] font-semibold tracking-[-1px]">Sports components</h1><p className="mt-3 text-[15px] leading-[22px] text-kino-ink-secondary">Cards, charts and timelines from UI Canvas. Explore the variations inside each component.</p></header>
      <nav className="my-9 flex flex-wrap gap-2">{["All components", ...groups.map(group => group.name)].map(name => <button key={name} type="button" onClick={() => setFilter(name)} aria-pressed={filter === name} className={`rounded-full border px-4 py-2 text-[13px] leading-[18px] ${filter === name ? "border-kino-outline-control bg-kino-surface-filled" : "border-kino-outline-subtle text-kino-ink-secondary hover:text-kino-ink-primary"}`}>{name}</button>)}</nav>
      {groups.filter(group => filter === "All components" || group.name === filter).map(group => <section key={group.name} id={group.name.toLowerCase()} className="mb-14 scroll-mt-6">
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-kino-outline-subtle pb-4"><div><h2 className="text-[22px] leading-7 font-semibold">{group.name} <span className="ml-2 text-[13px] font-normal text-kino-ink-secondary">{group.components.length}</span></h2><p className="mt-1 text-[13px] leading-[18px] text-kino-ink-secondary">{group.description}</p></div></div>
        <div className="grid grid-cols-1 items-start gap-x-9 gap-y-12 md:grid-cols-2 xl:grid-cols-3">{group.components.map(component => <article key={component.id} id={component.id} data-component={component.id} className="min-w-0">
          <header className="mb-5"><h3 className="text-[17px] leading-[22px] font-semibold">{component.name}</h3><p className="mt-1.5 max-w-[420px] text-[13px] leading-[18px] text-kino-ink-secondary">{component.summary}</p></header>
          <div className="max-w-[440px]">{component.preview}</div>
        </article>)}</div>
      </section>)}
    </div>
  </main>;
}
