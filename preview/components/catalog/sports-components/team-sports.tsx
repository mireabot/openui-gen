import samples from "./team-sports-data.json";
import { FixturesHeatmap, type FixtureResult } from "./lib/fixtures-heatmap";
import { LeagueStanding, type StandingRow } from "./lib/league-standing";
import { Leaderboard, playerEntry, teamEntry } from "./lib/leaderboard";
import { MatchCard } from "./lib/match-card";
import { MatchTopPlayers } from "./lib/match-top-players";
import { RecordTable } from "./lib/record-table";
import { StatBar } from "./lib/stat-bar";
import { StatsCard } from "./lib/stats-card";
import { Crest, TeamDetail } from "./lib/team-detail";
import { Example, Showcase } from "./screen";

/**
 * The NFL and NBA demos on the Components page. Every figure is real, from `team-sports-data.json`,
 * which `npm run catalog:samples` builds from the recorded ESPN responses.
 */
export type TeamSport = "nfl" | "nba";

export const SAMPLES_RECORDED = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(samples.recorded));

const results = (list: readonly string[]) => list as FixtureResult[];

export const TEAM_DEMOS = {
  MatchCard: (sport: TeamSport) => {
    const { matches } = samples[sport];
    return <Showcase title="Match card">
      <Example label={matches.report.value === "Final/OT" ? "Overtime final" : "Final"} first><MatchCard {...matches.report} /></Example>
      <Example label="Most recent game"><MatchCard {...matches.recent} /></Example>
      <Example label="Upcoming, with a reminder"><MatchCard {...matches.upcoming} remindable /></Example>
    </Showcase>;
  },
  StatsCard: (sport: TeamSport) => {
    const sample = samples[sport];
    return <Showcase title="Stats card">
      <Example label="Player · no rating in this sport" first><StatsCard subject={{ kind: "player", ...sample.player }} stats={sample.player.stats} /></Example>
      <Example label="Team"><StatsCard subject={{ kind: "club", team: sample.team, detail: sample.teamCard.detail }} stats={sample.teamCard.stats} /></Example>
    </Showcase>;
  },
  LeagueStanding: (sport: TeamSport) => {
    const { standing } = samples[sport];
    const rows = standing.rows as StandingRow[];
    return <Showcase title="League standing">
      <Example label={`${standing.conference}: seeds around the team`} first><LeagueStanding rows={rows} summary={standing.summary} home={standing.home} away={standing.away} /></Example>
      <Example label="Without the home and away split"><LeagueStanding rows={rows} summary={standing.summary} home={standing.home} away={standing.away} showVenues={false} /></Example>
    </Showcase>;
  },
  FixturesHeatmap: (sport: TeamSport) => {
    const sample = samples[sport];
    const { heatmap } = sample;
    const drawLabel = sample.hasTies ? "Tied" : null;
    return <Showcase title="Fixtures heatmap">
      <Example label={`A whole season: ${heatmap.results.length} games`} first><FixturesHeatmap value={heatmap.record} caption={`Record · ${sample.team.name} ${sample.season}`} results={results(heatmap.results)} drawLabel={drawLabel} /></Example>
      <Example label="Last five games"><FixturesHeatmap value={heatmap.recentValue} caption={`Last ${heatmap.recent.length} games · ${sample.team.name}`} results={results(heatmap.recent)} columns={5} overview={false} /></Example>
    </Showcase>;
  },
  StatBar: (sport: TeamSport) => {
    const { statBars, homeTeam, awayTeam } = samples[sport];
    return <Showcase title="Stat bar">
      <Example label="One game's team stats" first>
        <div className="flex items-center justify-between gap-3"><TeamDetail team={homeTeam} /><TeamDetail team={awayTeam} /></div>
        <div className="mt-1 flex flex-col gap-4">{statBars.map(bar => <StatBar key={bar.label} label={bar.label} home={homeTeam} away={awayTeam} values={bar.values} display={bar.display} />)}</div>
      </Example>
    </Showcase>;
  },
  Leaderboard: (sport: TeamSport) => {
    const sample = samples[sport];
    return <Showcase title="Leaderboard">
      {sample.leaderboards.map((board, index) => <Example key={board.title} label={board.title} first={index === 0}>
        <Leaderboard title={`${board.title} · ${sample.name}`} metric={board.metric} ranked entries={board.entries.map(entry => playerEntry({ name: entry.name, image: entry.image, club: { name: entry.team, color: entry.color } }, entry.value))} />
      </Example>)}
      <Example label="Teams"><Leaderboard title={`${sample.standing.division} · ${sample.name}`} metric="W-L" ranked entries={sample.standing.divisionTable.rows.map(row => teamEntry(sample.teams.find(team => team.name === row.label) ?? { name: row.label, color: "#45423c" }, row.cells[0]!))} /></Example>
    </Showcase>;
  },
  RecordTable: (sport: TeamSport) => {
    const { tables, standing } = samples[sport];
    return <Showcase title="Record table">
      <Example label="Box score" first><RecordTable {...tables.box} /></Example>
      <Example label="Division standings"><RecordTable {...standing.divisionTable} /></Example>
      <Example label="Conference seeds"><RecordTable {...standing.conferenceTable} /></Example>
      <Example label="Player game log"><RecordTable {...tables.gamelog} /></Example>
    </Showcase>;
  },
  MatchTopPlayers: (sport: TeamSport) => {
    const { topPlayers, homeTeam, awayTeam } = samples[sport];
    const rows = topPlayers.rows.map(row => ({
      ...(row.home ? { home: { ...row.home, club: homeTeam } } : {}),
      ...("away" in row && row.away ? { away: { ...row.away, club: awayTeam } } : {}),
    }));
    return <Showcase title="Match top players">
      <Example label={`${topPlayers.title}: three per side`} first><MatchTopPlayers title={topPlayers.title} metric={topPlayers.metric} rows={rows} /></Example>
      <Example label="One row"><MatchTopPlayers title={topPlayers.title} metric={topPlayers.metric} rows={rows.slice(0, 1)} /></Example>
    </Showcase>;
  },
  TeamDetail: (sport: TeamSport) => {
    const { teams, longName, team } = samples[sport];
    return <Showcase title="Team detail">
      <Example label="Inline, with its code" first>{teams.map(item => <TeamDetail key={item.name} team={item} />)}</Example>
      <Example label="Inline, long name truncates first"><div className="w-60"><TeamDetail team={longName} /></div></Example>
      <Example label="Crest sizes"><div className="flex items-end gap-4">{([20, 40, 56, 80] as const).map(size => <Crest key={size} team={team} size={size} />)}</div></Example>
    </Showcase>;
  },
} satisfies Record<string, (sport: TeamSport) => React.ReactNode>;
