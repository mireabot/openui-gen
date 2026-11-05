import { TEAMS } from "./data";
import { StatBar } from "./lib/stat-bar";
import { TeamDetail } from "./lib/team-detail";
import { Example, Showcase } from "./screen";

const HOME = TEAMS.arsenal;
const AWAY = TEAMS.liverpool;

/** StatBars stacked on the screen, no card: a match's stats, numbers and metrics, then the edge cases. */
export default function StatBarShowcase() {
  return (
    <Showcase title="Stat bar">
      <Example label="Match stats" first>
        <div className="flex items-center justify-between gap-3">
          <TeamDetail team={HOME} />
          <TeamDetail team={AWAY} />
        </div>
        <div className="mt-1 flex flex-col gap-4">
          <StatBar label="Possession" home={HOME} away={AWAY} values={{ home: 58, away: 42 }} display={{ home: "58%", away: "42%" }} />
          <StatBar label="Shots" home={HOME} away={AWAY} values={{ home: 14, away: 9 }} />
          <StatBar label="Shots on target" home={HOME} away={AWAY} values={{ home: 6, away: 3 }} />
          <StatBar label="Expected goals" home={HOME} away={AWAY} values={{ home: 1.8, away: 0.9 }} display={{ home: "1.8", away: "0.9" }} />
          <StatBar label="Corners" home={HOME} away={AWAY} values={{ home: 4, away: 7 }} />
        </div>
      </Example>
      <Example label="Edge cases: one side only, both zero">
        <div className="flex flex-col gap-4">
          <StatBar label="Red cards" home={HOME} away={AWAY} values={{ home: 0, away: 1 }} />
          <StatBar label="Penalties" home={HOME} away={AWAY} values={{ home: 0, away: 0 }} />
        </div>
      </Example>
    </Showcase>
  );
}
