"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import catalog from "../../../catalog/openui/fixtures.json";
import { OpenUIPreview, type DatasetSeed } from "@/components/primitives/openui-render";

type Theme = Pick<ComponentProps<typeof OpenUIPreview>, "theme" | "specs">;
interface Fixture { readonly key: string; readonly dataset: DatasetSeed }
const fixtures = (catalog as unknown as { fixtures: Fixture[] }).fixtures;

type Sport = "soccer" | "nba" | "nfl";
const SPORTS: readonly { id: Sport; name: string; description: string }[] = [
  { id: "soccer", name: "Soccer", description: "Real clubs and players with sample figures." },
  { id: "nba", name: "NBA", description: "Real teams, players and figures from recorded ESPN responses." },
  { id: "nfl", name: "NFL", description: "Real teams, players and figures from recorded ESPN responses." },
];

/** The league a record's images come from, or null when it has none (a sparse sample). */
function imageSport(fixture: Fixture): Sport | null {
  const text = JSON.stringify(fixture.dataset.result);
  const league = /espncdn\.com\/i\/(?:teamlogos|headshots)\/(nba|nfl)\//.exec(text)?.[1] as Sport | undefined;
  if (league) return league;
  return /fotmob\.com|espncdn\.com\/i\/teamlogos\/soccer\//.test(text) ? "soccer" : null;
}

/** A sample's sport: an `nba` or `nfl` sample by name, else by its images; one without images follows its component's full sample. */
function sportOf(fixture: Fixture): Sport {
  const [component, variant] = fixture.key.split("/") as [string, string];
  if (variant === "nba" || variant === "nfl") return variant;
  const full = fixtures.find(item => item.key === `${component}/full`);
  return imageSport(fixture) ?? (full && imageSport(full)) ?? "soccer";
}

/** A component's samples for one sport, from catalog/openui/fixtures.json, in their export order: "full" first. */
function samplesOf(component: string, sport: Sport): readonly Fixture[] {
  return fixtures.filter(fixture => fixture.key.startsWith(`${component}/`) && sportOf(fixture) === sport);
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

/** The components in page order: cards, charts, lists, then timelines. */
const COMPONENTS: readonly SourceComponent[] = [
    { id: "MatchCard", name: "Match card", summary: "Two teams, scores or start time, with optional game details and a reminder." },
    { id: "StatsCard", name: "Stats card", summary: "A player or team header, an optional rating, and a scrollable row of stats." },
    { id: "TeamPoints", name: "Team points", summary: "Season points with a home and away breakdown." },
    { id: "LeagueStanding", name: "League standing", summary: "A team's place in the standings, nearby teams and optional home and away context." },
    { id: "SeasonPodium", name: "Season podium", summary: "The top three clubs in a completed season, arranged by finishing place." },
    { id: "InjuryReport", name: "Injury report", summary: "An injured player with a band-aid on the photo, an optional league status, the expected return and its source." },
    { id: "PlayerValue", name: "Player value", summary: "A stepped market value chart with club spells and a scrubbable value readout." },
    { id: "FixturesHeatmap", name: "Fixtures heatmap", summary: "A compact season view with distinct marks for each result and upcoming games." },
    { id: "PlayerMetrics", name: "Player metrics", summary: "One player's metrics over a season as stepped lines: a total for one metric, a legend grid for up to four." },
    { id: "PlayersMetric", name: "Players metric", summary: "Up to four players on one metric over a season, sorted at the scrub, each line in its club colour." },
    { id: "MetricBars", name: "Metric bars", summary: "One metric across players, seasons or clubs as value pills at their height, paged sideways past five." },
    { id: "StatBar", name: "Stat bar", summary: "Compare one statistic across two teams, with values and proportional bars." },
    { id: "Leaderboard", name: "Leaderboard", summary: "Ranked players or teams with optional positions, photos and a trailing value." },
    { id: "RecordTable", name: "Record table", summary: "A table whose columns come from the data: box scores, standings and game logs." },
    { id: "MatchTopPlayers", name: "Match top players", summary: "The leading players from both sides of a game, aligned by rating or another metric." },
    { id: "InjuryList", name: "Injury list", summary: "A team's reported injuries, one row per player with status and expected return." },
    { id: "TeamDetail", name: "Team detail", summary: "A team crest and name with optional nickname or secondary context." },
    { id: "ClubTimeline", name: "Club timeline", summary: "Swipe between club spells or select a year. Loans have a marker; up to three stats are optional." },
];

export interface CatalogComponent {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly preview: ReactNode;
}

/** One component drawn from its OpenUI program, with a tab per sample and the program it ran. */
function ComponentSamples({ id, samples, theme, specs }: { id: string; samples: readonly Fixture[] } & Theme) {
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

/** A section's grid of component cards. */
function Grid({ components, prefix }: { components: readonly CatalogComponent[]; prefix: string }) {
  return <div className="grid grid-cols-1 items-start gap-x-9 gap-y-12 md:grid-cols-2 xl:grid-cols-3">{components.map(component => <article key={component.id} id={`${prefix}-${component.id}`} data-component={component.id} className="min-w-0">
    <header className="mb-5"><h3 className="text-[17px] leading-[22px] font-semibold">{component.name}</h3><p className="mt-1.5 max-w-[420px] text-[13px] leading-[18px] text-ds-ink-secondary">{component.summary}</p></header>
    <div className="max-w-[440px]">{component.preview}</div>
  </article>)}</div>;
}

/** A large-titled section: a sport, or the custom components. */
function Section({ id, name, description, count, children }: { id: string; name: string; description: string; count: number; children: ReactNode }) {
  return <section id={id} className="mt-16 scroll-mt-6 first:mt-12">
    <div className="mb-8 border-b border-ds-outline-subtle pb-5"><h2 className="text-[28px] leading-[34px] font-semibold tracking-[-0.5px]">{name} <span className="ml-2 text-[15px] font-normal tracking-normal text-ds-ink-secondary">{count}</span></h2><p className="mt-1.5 text-[13px] leading-[18px] text-ds-ink-secondary">{description}</p></div>
    {children}
  </section>;
}

/**
 * The sports components in one scroll, a large-titled section per sport: each component drawn by the
 * OpenUI renderer from that sport's samples in catalog/openui/fixtures.json, the same programs the
 * iOS gallery and the parity tests use.
 */
export function SportsCatalog({ custom, theme, specs }: { custom: readonly CatalogComponent[] } & Theme) {
  const sections = SPORTS.map(sport => ({
    ...sport,
    components: COMPONENTS.flatMap((component): CatalogComponent[] => {
      const samples = samplesOf(component.id, sport.id);
      return samples.length ? [{ ...component, preview: <ComponentSamples id={component.id} samples={samples} theme={theme} specs={specs} /> }] : [];
    }),
  }));
  return <main className="h-full overflow-y-auto bg-ds-surface-screen text-ds-ink-primary [color-scheme:dark]">
    <div className="mx-auto max-w-[1680px] px-5 py-10 md:px-10 md:py-14">
      <header className="max-w-[650px]"><h1 className="text-[34px] leading-[40px] font-semibold tracking-[-1px]">Sports components</h1><p className="mt-3 text-[15px] leading-[22px] text-ds-ink-secondary">Every component rendered from its OpenUI program, with the samples the iOS app and the parity tests share.</p></header>
      {sections.map(section => <Section key={section.id} id={section.id} name={section.name} description={section.description} count={section.components.length}><Grid components={section.components} prefix={section.id} /></Section>)}
      <Section id="custom" name="Custom" description="Components composed on request from OpenUI primitives." count={custom.length}><Grid components={custom} prefix="custom" /></Section>
    </div>
  </main>;
}
