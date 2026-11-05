import { PLAYERS, TEAMS } from "./data";
import { Leaderboard, playerEntry, teamEntry } from "./lib/leaderboard";
import { Example, Showcase } from "./screen";

/** One Leaderboard skeleton, filled for three kinds of request. */
export default function LeaderboardShowcase() {
  return (
    <Showcase title="Leaderboard">
      <Example label="Players: best scorers" first>
        <Leaderboard
          title="Top scorers · Premier League"
          metric="Goals"
          ranked
          entries={PLAYERS.slice(0, 4).map((player, i) => playerEntry(player, [21, 18, 17, 14][i]!))}
          more={{ count: 16, label: "more players" }}
        />
      </Example>
      <Example label="A long title wraps to two lines beside the metric">
        <Leaderboard
          title="Top scorers · Chelsea · Premier League 2025/26, all goals including penalties"
          metric="Goals"
          entries={PLAYERS.slice(2, 4).map((player, i) => playerEntry(player, [15, 10][i]!))}
        />
      </Example>
      <Example label="Players: a different metric">
        <Leaderboard title="Most assists" metric="Assists" entries={PLAYERS.slice(1, 4).map((player, i) => playerEntry(player, [12, 9, 8][i]!))} />
      </Example>
      <Example label="Teams">
        <Leaderboard
          title="Most goals conceded"
          metric="Conceded"
          ranked
          entries={[TEAMS.brentford, TEAMS.everton, TEAMS.chelsea].map((team, i) => teamEntry(team, [48, 44, 41][i]!, ["Premier League"]))}
        />
      </Example>
    </Showcase>
  );
}
