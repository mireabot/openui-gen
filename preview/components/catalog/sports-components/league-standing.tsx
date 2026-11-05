import { LeagueStanding } from "./lib/league-standing";
import { Example, Showcase } from "./screen";

/** LeagueStanding at the top, in the middle and at the bottom of the table. */
export default function LeagueStandingShowcase() {
  return (
    <Showcase title="League standing">
      <Example label="First place: the two below" first>
        <LeagueStanding
          rows={[
            { rank: 1, name: "Arsenal", points: 27, isTeam: true },
            { rank: 2, name: "Chelsea", points: 22 },
            { rank: 3, name: "Brentford", points: 20 },
          ]}
          home={{ rank: 1, points: 15, won: 5, drawn: 0, lost: 0 }}
          away={{ rank: 1, points: 12, won: 4, drawn: 0, lost: 0 }}
        />
      </Example>
      <Example label="Mid-table: one either side">
        <LeagueStanding
          rows={[
            { rank: 12, name: "Brentford", points: 10 },
            { rank: 13, name: "Liverpool", points: 9, isTeam: true },
            { rank: 14, name: "Everton", points: 8 },
          ]}
          home={{ rank: 8, points: 7, won: 2, drawn: 1, lost: 1 }}
          away={{ rank: 16, points: 2, won: 0, drawn: 2, lost: 3 }}
        />
      </Example>
      <Example label="Beside a TeamPoints card, which answers home and away">
        <LeagueStanding
          showVenues={false}
          rows={[
            { rank: 9, name: "Brentford", points: 53 },
            { rank: 10, name: "Chelsea", points: 52, isTeam: true },
            { rank: 11, name: "Everton", points: 52 },
          ]}
          home={{ points: 26, won: 7, drawn: 5, lost: 7 }}
          away={{ points: 26, won: 7, drawn: 5, lost: 7 }}
        />
      </Example>
      <Example label="Last place, a long name, no venue ranks">
        <LeagueStanding
          rows={[
            { rank: 18, name: "Everton", points: 6 },
            { rank: 19, name: "Chelsea", points: 5 },
            { rank: 20, name: "Wolverhampton Wanderers", points: 3, isTeam: true },
          ]}
          home={{ points: 2, won: 0, drawn: 2, lost: 3 }}
          away={{ points: 1, won: 0, drawn: 1, lost: 3 }}
        />
      </Example>
    </Showcase>
  );
}
