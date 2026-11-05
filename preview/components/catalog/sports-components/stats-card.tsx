import { PLAYERS, TEAMS } from "./data";
import { StatsCard } from "./lib/stats-card";
import { Example, Showcase } from "./screen";

/** One StatsCard, filled for a player and for a club; the grid takes however many stats the request asks for. */
export default function StatsCardShowcase() {
  return (
    <Showcase title="Stats card">
      <Example label="Player · nine stats" first>
        <StatsCard
          subject={{ kind: "player", ...PLAYERS[4]! }}
          rating={{ value: 6.6, label: "Season rating", caption: "Premier League 2026/2027 · 6 matches" }}
          stats={[
            { label: "Goals", value: 0 }, { label: "Assists", value: 1 }, { label: "Started", value: 2 },
            { label: "Matches", value: 6 }, { label: "Minutes played", value: 298 }, { label: "Key passes", value: 7 },
            { label: "Pass accuracy", value: "86%" }, { label: "Tackles", value: 9 }, { label: "Duels won", value: "54%" },
          ]}
        />
      </Example>
      <Example label="Club">
        <StatsCard
          subject={{ kind: "club", team: TEAMS.arsenal, detail: ["Premier League", "2026/2027"] }}
          rating={{ value: 7.12, label: "Team rating", caption: "Average of 8 matches" }}
          stats={[
            { label: "Position", value: "3rd" }, { label: "Points", value: 17 }, { label: "Goal difference", value: "+9" },
            { label: "Goals", value: 18 }, { label: "Conceded", value: 9 }, { label: "Clean sheets", value: 3 },
          ]}
        />
      </Example>
      <Example label="Player · no rating yet, a value unavailable">
        <StatsCard
          subject={{ kind: "player", ...PLAYERS[3]! }}
          rating={{ value: null, label: "Season rating", caption: "Shows after 90 minutes played" }}
          stats={[{ label: "Matches", value: 1 }, { label: "Minutes played", value: 34 }, { label: "xG", value: null }]}
        />
      </Example>
    </Showcase>
  );
}
