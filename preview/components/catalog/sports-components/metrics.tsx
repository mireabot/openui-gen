"use client";

import samples from "./metrics-data.json";
import { MetricBars, type BarSet } from "./lib/metric-bars";
import type { Person, Values } from "./lib/metric-chart";
import { PlayerMetrics } from "./lib/player-metrics";
import { PlayersMetric } from "./lib/players-metric";
import { Example, Showcase } from "./screen";

/**
 * Showcases for MetricBars, PlayerMetrics and PlayersMetric, from the same records as the OpenUI
 * parity fixtures. Every figure is real, fetched on 6 Nov 2026: ESPN game logs and box scores,
 * and FotMob for Palmer's chances created.
 */

const bars = (record: typeof samples.MetricBars.full): BarSet => ({
  title: record.title,
  metric: record.metric,
  subjects: record.columns.map((column, i) => ({ id: `${column.caption}-${i}`, name: column.name, caption: column.caption, value: column.value, display: column.display, secondary: column.secondary, color: column.color, photo: column.logo })),
});

/** Egor Demin, points per game last season and this season so far. */
export function MetricBarsShowcase() {
  return (
    <Showcase title="Metric bars">
      <Example label="Last season vs this season" first><MetricBars set={bars(samples.MetricBars.full)} /></Example>
      <Example label="One season"><MetricBars set={bars(samples.MetricBars.sparse)} /></Example>
    </Showcase>
  );
}

const palmer = samples.PlayerMetrics.full;
const person: Person = { name: palmer.name, short: "Palmer", club: "Chelsea", clubColor: palmer.metrics[0]!.lineColor, photo: palmer.logo };
const periods = { periods: palmer.periods, ends: [palmer.from, palmer.to] as const };
const metric = (m: (typeof palmer.metrics)[number]) => ({ id: m.label, label: m.label, values: m.values as Values, decimals: m.decimals });

/** Cole Palmer, Premier League 2025/26, running totals by matchweek. */
export function PlayerMetricsShowcase() {
  return (
    <Showcase title="Player metrics">
      <Example label="Goals, assists and chances created, with the player" first>
        <PlayerMetrics person={person} metrics={palmer.metrics.map(metric)} {...periods} caption={palmer.detail} footnote="Gaps are matchweeks he missed. Chances created stand in for corners, which no feed reports per player." />
      </Example>
      <Example label="Goals only, chart without the player">
        <PlayerMetrics person={person} metrics={[metric(palmer.metrics[0]!)]} {...periods} header={false} subtitle="this season" detailAt={i => samples.PlayerMetrics.sparse.details[i] || undefined} />
      </Example>
    </Showcase>
  );
}

const qbs = samples.PlayersMetric.full;
const people: Person[] = qbs.players.map(player => ({ name: player.name, short: player.name.split(" ").at(-1)!, club: player.team, clubColor: player.color, photo: player.logo }));

const chiefs = samples.PlayersMetric.sparse;
const chiefsPeople: Person[] = chiefs.players.map(player => ({ name: player.name, short: player.name.split(" ").at(-1)!, club: player.team, clubColor: player.color, photo: player.logo }));

/** AFC quarterbacks, interceptions thrown this season, through week 8. */
export function PlayersMetricShowcase() {
  return (
    <Showcase title="Players metric">
      <Example label="Four AFC quarterbacks" first>
        <PlayersMetric title={qbs.title} subtitle={qbs.subtitle} people={people} values={qbs.players.map(player => player.values as Values)} periods={qbs.periods} ends={[qbs.from, qbs.to]} footnote="A gap is a bye week." />
      </Example>
      <Example label="Two from one club, one with a single game">
        <PlayersMetric title={chiefs.title} subtitle={chiefs.subtitle} people={chiefsPeople} values={chiefs.players.map(player => player.values as Values)} periods={chiefs.periods} ends={[chiefs.from, chiefs.to]} footnote="Fields played week 1 only, so his line runs flat across the season. A second player from a club draws in white." />
      </Example>
    </Showcase>
  );
}
