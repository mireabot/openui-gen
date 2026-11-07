"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import catalog from "../../../catalog/openui/fixtures.json";
import { OpenUIPreview, type DatasetSeed } from "@/components/primitives/openui-render";

type Theme = Pick<ComponentProps<typeof OpenUIPreview>, "theme" | "specs">;
interface Fixture { readonly key: string; readonly dataset: DatasetSeed }
const fixtures = (catalog as unknown as { fixtures: Fixture[] }).fixtures;

/** Each component's samples from catalog/openui/fixtures.json, in their export order: "full" first. */
function samplesOf(component: string): readonly Fixture[] {
  return fixtures.filter(fixture => fixture.key.startsWith(`${component}/`));
}

/** The call the writer makes: the component by name, reading the sample's record. The preview expands it with its bundled templates. */
function programOf(component: string, fixture: Fixture): string {
  return `root = Screen([pick1])\nd = Query("sports_dataset", {run: "${fixture.dataset.args.run}"}, {})\npick1 = ${component}(d.answers.q1.record)\n`;
}

/** "withStats" → "With stats"; league samples keep their name, "nba" → "NBA". */
const LEAGUE_NAMES = new Set(["nba", "nfl"]);
const label = (variant: string) => {
  if (LEAGUE_NAMES.has(variant)) return variant.toUpperCase();
  const words = variant.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

interface SourceComponent { readonly id: string; readonly name: string; readonly summary: string }

const sourceGroups: readonly { name: string; description: string; components: readonly SourceComponent[] }[] = [
  { name: "Cards", description: "Games, season records and the figures behind a player or team.", components: [
    { id: "MatchCard", name: "Match card", summary: "Two teams, scores or start time, with optional game details and a reminder." },
    { id: "StatsCard", name: "Stats card", summary: "A player or team header, an optional rating, and a scrollable row of stats." },
    { id: "TeamPoints", name: "Team points", summary: "Season points with a home and away breakdown." },
    { id: "LeagueStanding", name: "League standing", summary: "A team's place in the standings, nearby teams and optional home and away context." },
    { id: "SeasonPodium", name: "Season podium", summary: "The top three clubs in a completed season, arranged by finishing place." },
    { id: "InjuryReport", name: "Injury report", summary: "An injured player with a band-aid on the photo, an optional league status, the expected return and its source." },
  ] },
  { name: "Charts", description: "Values over time, game outcomes and head-to-head comparisons.", components: [
    { id: "PlayerValue", name: "Player value", summary: "A stepped market value chart with club spells and a scrubbable value readout." },
    { id: "FixturesHeatmap", name: "Fixtures heatmap", summary: "A compact season view with distinct marks for each result and upcoming games." },
    { id: "PlayerMetrics", name: "Player metrics", summary: "One player's metrics over a season as stepped lines: a total for one metric, a legend grid for up to four." },
    { id: "PlayersMetric", name: "Players metric", summary: "Up to four players on one metric over a season, sorted at the scrub, each line in its club colour." },
    { id: "MetricBars", name: "Metric bars", summary: "One metric across players, seasons or clubs as value pills at their height, paged sideways past five." },
    { id: "StatBar", name: "Stat bar", summary: "Compare one statistic across two teams, with values and proportional bars." },
  ] },
  { name: "Lists", description: "Rankings, tables, player comparisons, injuries and compact team identity.", components: [
    { id: "Leaderboard", name: "Leaderboard", summary: "Ranked players or teams with optional positions, photos and a trailing value." },
    { id: "RecordTable", name: "Record table", summary: "A table whose columns come from the data: box scores, standings and game logs." },
    { id: "MatchTopPlayers", name: "Match top players", summary: "The leading players from both sides of a game, aligned by rating or another metric." },
    { id: "InjuryList", name: "Injury list", summary: "A team's reported injuries, one row per player with status and expected return." },
    { id: "TeamDetail", name: "Team detail", summary: "A team crest and name with optional nickname or secondary context." },
  ] },
  { name: "Timelines", description: "Club history with a year rail that follows the selected club.", components: [
    { id: "ClubTimeline", name: "Club timeline", summary: "Swipe between club spells or select a year. Loans have a marker; up to three stats are optional." },
  ] },
];

export interface CatalogComponent {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly preview: ReactNode;
}

/** One component drawn from its OpenUI program, with a tab per sample and the program it ran. */
function ComponentSamples({ id, theme, specs }: { id: string } & Theme) {
  const samples = samplesOf(id);
  const [chosen, setChosen] = useState(samples[0]?.key ?? "");
  const fixture = samples.find(sample => sample.key === chosen) ?? samples[0];
  if (!fixture) return <p className="text-[13px] leading-[18px] text-ds-ink-secondary">No samples in catalog/openui/fixtures.json.</p>;
  const program = programOf(id, fixture);
  return <div className="min-w-0">
    {samples.length > 1 && <div className="mb-4 flex flex-wrap gap-1.5">{samples.map(sample => <button key={sample.key} type="button" onClick={() => setChosen(sample.key)} className={`rounded-full border px-3 py-1 text-[12px] leading-4 ${sample.key === fixture.key ? "border-ds-outline-control bg-ds-surface-filled text-ds-ink-primary" : "border-ds-outline-subtle text-ds-ink-secondary hover:text-ds-ink-primary"}`}>{label(sample.key.slice(id.length + 1))}</button>)}</div>}
    <OpenUIPreview key={fixture.key} program={program} seed={fixture.dataset} theme={theme} specs={specs} isStreaming={false} layout="inline" />
    <details className="mt-5 border-t border-ds-outline-subtle pt-4">
      <summary className="cursor-pointer text-[13px] leading-[18px] text-ds-ink-secondary">View OpenUI program</summary>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-xl bg-ds-surface-card p-4 text-[11px] leading-[18px] text-ds-ink-secondary [overflow-wrap:anywhere]"><code>{program}</code></pre>
    </details>
  </div>;
}

/**
 * The sports components, each drawn by the OpenUI renderer from the shared samples in
 * catalog/openui/fixtures.json: the same programs the iOS gallery and the parity tests use.
 */
export function SportsCatalog({ custom, theme, specs }: { custom: readonly CatalogComponent[] } & Theme) {
  const groups = [
    ...sourceGroups.map(group => ({ ...group, components: group.components.map((component): CatalogComponent => ({ ...component, preview: <ComponentSamples id={component.id} theme={theme} specs={specs} /> })) })),
    { name: "Custom", description: "Components composed on request from OpenUI primitives.", components: custom },
  ];
  const [filter, setFilter] = useState("All components");
  return <main className="h-full overflow-y-auto bg-ds-surface-screen text-ds-ink-primary [color-scheme:dark]">
    <div className="mx-auto max-w-[1680px] px-5 py-10 md:px-10 md:py-14">
      <header className="max-w-[650px]"><h1 className="text-[34px] leading-[40px] font-semibold tracking-[-1px]">Sports components</h1><p className="mt-3 text-[15px] leading-[22px] text-ds-ink-secondary">Every component rendered from its OpenUI program, with the samples the iOS app and the parity tests share.</p></header>
      <nav className="mt-8 mb-9 flex flex-wrap gap-2">{["All components", ...groups.map(group => group.name)].map(name => <button key={name} type="button" onClick={() => setFilter(name)} aria-pressed={filter === name} className={`rounded-full border px-4 py-2 text-[13px] leading-[18px] ${filter === name ? "border-ds-outline-control bg-ds-surface-filled" : "border-ds-outline-subtle text-ds-ink-secondary hover:text-ds-ink-primary"}`}>{name}</button>)}</nav>
      {groups.filter(group => filter === "All components" || group.name === filter).map(group => <section key={group.name} id={group.name.toLowerCase()} className="mb-14 scroll-mt-6">
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-ds-outline-subtle pb-4"><div><h2 className="text-[22px] leading-7 font-semibold">{group.name} <span className="ml-2 text-[13px] font-normal text-ds-ink-secondary">{group.components.length}</span></h2><p className="mt-1 text-[13px] leading-[18px] text-ds-ink-secondary">{group.description}</p></div></div>
        <div className="grid grid-cols-1 items-start gap-x-9 gap-y-12 md:grid-cols-2 xl:grid-cols-3">{group.components.map(component => <article key={component.id} id={component.id} data-component={component.id} className="min-w-0">
          <header className="mb-5"><h3 className="text-[17px] leading-[22px] font-semibold">{component.name}</h3><p className="mt-1.5 max-w-[420px] text-[13px] leading-[18px] text-ds-ink-secondary">{component.summary}</p></header>
          <div className="max-w-[440px]">{component.preview}</div>
        </article>)}</div>
      </section>)}
    </div>
  </main>;
}
