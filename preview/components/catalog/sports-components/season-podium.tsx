import { MEDALS, PODIUM_2024_25, TEAMS } from "./data";
import { SeasonPodium } from "./lib/season-podium";
import { Example, Showcase } from "./screen";

/** SeasonPodium with club logos, with monograms when there is no logo, and with a long name. */
export default function SeasonPodiumShowcase() {
  return (
    <Showcase title="Season podium">
      <Example label="Premier League 2024/25" first>
        <SeasonPodium
          first={{ ...PODIUM_2024_25.first, medal: MEDALS.gold }}
          second={{ ...PODIUM_2024_25.second, medal: MEDALS.silver }}
          third={{ ...PODIUM_2024_25.third, medal: MEDALS.bronze }}
        />
      </Example>
      <Example label="No logos: club colour and monogram">
        <SeasonPodium
          first={{ team: { ...TEAMS.arsenal, logo: undefined }, medal: MEDALS.gold }}
          second={{ team: { ...TEAMS.chelsea, logo: undefined }, medal: MEDALS.silver }}
          third={{ team: { ...TEAMS.brentford, logo: undefined }, medal: MEDALS.bronze }}
        />
      </Example>
      <Example label="A long name wraps to two lines, then truncates">
        <SeasonPodium
          first={{ team: TEAMS.liverpool, medal: MEDALS.gold }}
          second={{ team: TEAMS.wolves, medal: MEDALS.silver }}
          third={{ team: TEAMS.everton, medal: MEDALS.bronze }}
        />
      </Example>
    </Showcase>
  );
}
