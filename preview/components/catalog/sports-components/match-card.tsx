"use client";

import { TEAMS } from "./data";
import { MatchCard } from "./lib/match-card";
import { Example, Showcase } from "./screen";

/** MatchCard: every detail is optional, so the card goes from full to just the two teams. */
export default function MatchCardShowcase() {
  return (
    <Showcase title="Match card">
      <Example label="All details" first>
        <MatchCard
          home={TEAMS.arsenal}
          away={TEAMS.chelsea}
          label="Sat, Oct 31"
          value="6:30 PM"
          details={["Regular Season", "Emirates Stadium", "Sky Sports"]}
          remindable
          onPress={() => {}}
        />
      </Example>
      <Example label="Side value only, no reminder">
        <MatchCard home={TEAMS.liverpool} away={TEAMS.everton} value="Live" details={["Quarterfinal"]} />
      </Example>
      <Example label="Teams only">
        <MatchCard home={TEAMS.brentford} away={TEAMS.wolves} />
      </Example>

      <Example label="Home win" first>
        <MatchCard
          home={TEAMS.arsenal}
          away={TEAMS.chelsea}
          score={{ home: 3, away: 1 }}
          label="Sat, Oct 24"
          value="FT"
          details={["Regular Season", "Emirates Stadium", "Sky Sports"]}
          remindable
          onPress={() => {}}
        />
      </Example>
      <Example label="Away win">
        <MatchCard home={TEAMS.liverpool} away={TEAMS.everton} score={{ home: 0, away: 2 }} value="FT" details={["Quarterfinal"]} />
      </Example>
      <Example label="Draw, teams and score only">
        <MatchCard home={TEAMS.brentford} away={TEAMS.wolves} score={{ home: 1, away: 1 }} />
      </Example>
    </Showcase>
  );
}
