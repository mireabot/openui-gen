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
import { InjuryReportShowcase } from "./sports-components/injury-report";
import ClubTimeline from "./club-timeline/showcase";
import { SAMPLES_RECORDED, TEAM_DEMOS, type TeamSport } from "./sports-components/team-sports";

type Demo = (sport: TeamSport) => ReactNode;
interface SourceComponent { readonly id: string; readonly name: string; readonly summary: string; readonly preview?: ReactNode; readonly team?: Demo }

const sourceGroups: readonly { name: string; description: string; components: readonly SourceComponent[] }[] = [
  { name: "Cards", description: "Games, season records and the figures behind a player or team.", components: [
    { id: "MatchCard", name: "Match card", summary: "Two teams, scores or start time, with optional game details and a reminder.", preview: <MatchCard />, team: TEAM_DEMOS.MatchCard },
    { id: "StatsCard", name: "Stats card", summary: "A player or team header, an optional rating, and a scrollable row of stats.", preview: <StatsCard />, team: TEAM_DEMOS.StatsCard },
    { id: "TeamPoints", name: "Team points", summary: "Season points with a home and away breakdown.", preview: <TeamPoints /> },
    { id: "LeagueStanding", name: "League standing", summary: "A team's place in the standings, nearby teams and optional home and away context.", preview: <LeagueStanding />, team: TEAM_DEMOS.LeagueStanding },
    { id: "SeasonPodium", name: "Season podium", summary: "The top three clubs in a completed season, arranged by finishing place.", preview: <SeasonPodium /> },
    { id: "InjuryReport", name: "Injury report", summary: "An injured player with a band-aid on the photo, an optional league status, the expected return and its source. A card for one player, a list element for a report.", preview: <InjuryReportShowcase />, team: sport => <InjuryReportShowcase sport={sport} /> },
  ] },
  { name: "Charts", description: "Values over time, game outcomes and head-to-head comparisons.", components: [
    { id: "PlayerValue", name: "Player value", summary: "A stepped market value chart with club spells and a scrubbable value readout.", preview: <PlayerValue /> },
    { id: "FixturesHeatmap", name: "Fixtures heatmap", summary: "A compact season view with distinct marks for each result and upcoming games.", preview: <FixturesHeatmap />, team: TEAM_DEMOS.FixturesHeatmap },
    { id: "StatBar", name: "Stat bar", summary: "Compare one statistic across two teams, with values and proportional bars.", preview: <StatBar />, team: TEAM_DEMOS.StatBar },
  ] },
  { name: "Lists", description: "Rankings, tables, player comparisons and compact team identity.", components: [
    { id: "Leaderboard", name: "Leaderboard", summary: "Ranked players or teams with optional positions, photos and a trailing value.", preview: <Leaderboard />, team: TEAM_DEMOS.Leaderboard },
    { id: "RecordTable", name: "Record table", summary: "A table whose columns come from the data: box scores, standings and game logs.", team: TEAM_DEMOS.RecordTable },
    { id: "MatchTopPlayers", name: "Match top players", summary: "The leading players from both sides of a game, aligned by rating or another metric.", preview: <MatchTopPlayers />, team: TEAM_DEMOS.MatchTopPlayers },
    { id: "TeamDetail", name: "Team detail", summary: "A team crest and name with optional nickname or secondary context.", preview: <TeamDetail />, team: TEAM_DEMOS.TeamDetail },
  ] },
  { name: "Timelines", description: "Club history with a year rail that follows the selected club.", components: [
    { id: "ClubTimeline", name: "Club timeline", summary: "Swipe between club spells or select a year. Loans have a marker; up to three stats are optional. NFL and NBA careers come from ESPN's seasons.", preview: <ClubTimeline />, team: sport => <ClubTimeline sport={sport} /> },
  ] },
];

const SPORTS = [{ id: "soccer", label: "Soccer" }, { id: "nfl", label: "NFL" }, { id: "nba", label: "NBA" }] as const;
type Sport = (typeof SPORTS)[number]["id"];

/** A sport's components, and the ones it has no data for. */
function forSport(sport: Sport, custom: readonly CatalogComponent[]) {
  const visible = (component: SourceComponent) => (sport === "soccer" ? component.preview !== undefined : component.team !== undefined);
  const groups = sourceGroups.map(group => ({
    name: group.name, description: group.description,
    components: group.components.filter(visible).map((component): CatalogComponent => ({
      id: component.id, name: component.name, summary: component.summary,
      preview: sport === "soccer" ? component.preview : component.team!(sport),
    })),
  })).filter(group => group.components.length);
  const hidden = sport === "soccer" ? [] : sourceGroups.flatMap(group => group.components.filter(component => !visible(component)).map(component => component.name));
  return { groups: sport === "soccer" ? [...groups, { name: "Custom", description: "Components composed on request from OpenUI primitives.", components: custom }] : groups, hidden };
}

export interface CatalogComponent {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly preview: ReactNode;
}

export function SportsCatalog({ custom }: { custom: readonly CatalogComponent[] }) {
  const [sport, setSport] = useState<Sport>("soccer");
  const [chosen, setChosen] = useState("All components");
  const { groups, hidden } = forSport(sport, custom);
  // A group this sport does not have falls back to everything.
  const filter = groups.some(group => group.name === chosen) ? chosen : "All components";
  const setFilter = setChosen;
  return <main className="h-full overflow-y-auto bg-kino-surface-screen text-kino-ink-primary [color-scheme:dark]">
    <div className="mx-auto max-w-[1680px] px-5 py-10 md:px-10 md:py-14">
      <header className="max-w-[650px]"><h1 className="text-[34px] leading-[40px] font-semibold tracking-[-1px]">Sports components</h1><p className="mt-3 text-[15px] leading-[22px] text-kino-ink-secondary">Cards, charts and timelines from UI Canvas. Explore the variations inside each component.</p></header>
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex gap-1 rounded-full bg-kino-surface-filled p-1">{SPORTS.map(item => <button key={item.id} type="button" onClick={() => setSport(item.id)} aria-pressed={sport === item.id} className={`rounded-full px-4 py-1.5 text-[13px] leading-[18px] transition-colors duration-150 ${sport === item.id ? "bg-kino-surface-card font-medium text-kino-ink-primary" : "text-kino-ink-secondary hover:text-kino-ink-primary"}`}>{item.label}</button>)}</div>
        <p className="text-[13px] leading-[18px] text-kino-ink-secondary">{sport === "soccer" ? "Real clubs and players with sample figures." : `Real ESPN data recorded ${SAMPLES_RECORDED}.${hidden.length ? ` ${hidden.join(", ")}: soccer only.` : ""}`}</p>
      </div>
      <nav className="mt-6 mb-9 flex flex-wrap gap-2">{["All components", ...groups.map(group => group.name)].map(name => <button key={name} type="button" onClick={() => setFilter(name)} aria-pressed={filter === name} className={`rounded-full border px-4 py-2 text-[13px] leading-[18px] ${filter === name ? "border-kino-outline-control bg-kino-surface-filled" : "border-kino-outline-subtle text-kino-ink-secondary hover:text-kino-ink-primary"}`}>{name}</button>)}</nav>
      {groups.filter(group => filter === "All components" || group.name === filter).map(group => <section key={group.name} id={group.name.toLowerCase()} className="mb-14 scroll-mt-6">
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-kino-outline-subtle pb-4"><div><h2 className="text-[22px] leading-7 font-semibold">{group.name} <span className="ml-2 text-[13px] font-normal text-kino-ink-secondary">{group.components.length}</span></h2><p className="mt-1 text-[13px] leading-[18px] text-kino-ink-secondary">{group.description}</p></div></div>
        <div className="grid grid-cols-1 items-start gap-x-9 gap-y-12 md:grid-cols-2 xl:grid-cols-3">{group.components.map(component => <article key={component.id} id={component.id} data-component={component.id} className="min-w-0">
          <header className="mb-5"><h3 className="text-[17px] leading-[22px] font-semibold">{component.name}</h3><p className="mt-1.5 max-w-[420px] text-[13px] leading-[18px] text-kino-ink-secondary">{component.summary}</p></header>
          <div key={sport} className="max-w-[440px]">{component.preview}</div>
        </article>)}</div>
      </section>)}
    </div>
  </main>;
}
