import { TeamPoints } from "./lib/team-points";
import { Example, Showcase } from "./screen";

/** TeamPoints for an unbeaten record, a mixed one, a full season and no matches yet. */
export default function TeamPointsShowcase() {
  return (
    <Showcase title="Team points">
      <Example label="Unbeaten" first>
        <TeamPoints
          rank={1}
          home={{ played: 5, won: 5, drawn: 0, lost: 0, goalsFor: 20, goalsAgainst: 1, points: 15 }}
          away={{ played: 4, won: 4, drawn: 0, lost: 0, goalsFor: 13, goalsAgainst: 3, points: 12 }}
        />
      </Example>
      <Example label="Mixed record, negative goal difference">
        <TeamPoints
          rank={13}
          home={{ played: 4, won: 2, drawn: 1, lost: 1, goalsFor: 7, goalsAgainst: 6, points: 7 }}
          away={{ played: 5, won: 0, drawn: 2, lost: 3, goalsFor: 3, goalsAgainst: 9, points: 2 }}
        />
      </Example>
      <Example label="Full season: two digits in every column">
        <TeamPoints
          rank={9}
          home={{ played: 19, won: 10, drawn: 4, lost: 5, goalsFor: 31, goalsAgainst: 22, points: 34 }}
          away={{ played: 19, won: 5, drawn: 5, lost: 9, goalsFor: 19, goalsAgainst: 30, points: 20 }}
        />
      </Example>
      <Example label="No matches yet">
        <TeamPoints
          rank={20}
          home={{ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }}
          away={{ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }}
        />
      </Example>
    </Showcase>
  );
}
