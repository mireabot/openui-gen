/**
 * Real clubs, players, logos (ESPN) and photos (FotMob) for the Sports components showcase. Each logo
 * and photo URL was checked to load. The scores, stats and table positions are sample numbers, not results.
 */
import type { Team } from "./lib/team-detail";

const logo = (id: number) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
const photo = (id: number) => `https://images.fotmob.com/image_resources/playerimages/${id}.png`;

export const TEAMS = {
  arsenal: { name: "Arsenal", nickname: "ARS", color: "#E20520", logo: logo(359) },
  chelsea: { name: "Chelsea", nickname: "CHE", color: "#144992", logo: logo(363) },
  liverpool: { name: "Liverpool", nickname: "LIV", color: "#D11317", logo: logo(364) },
  manCity: { name: "Manchester City", nickname: "MNC", color: "#99C5EA", logo: logo(382) },
  wolves: { name: "Wolverhampton Wanderers", nickname: "WOL", color: "#FDB913", logo: logo(380) },
  brentford: { name: "Brentford", color: "#F42727", logo: logo(337) },
  everton: { name: "Everton", nickname: "The Toffees", color: "#0606FA", logo: logo(368) },
} satisfies Record<string, Team>;

/** Real clubs and logos, ESPN's final Premier League 2024/25 top three, for the SeasonPodium showcase. */
export const PODIUM_2024_25 = {
  first: { team: { name: "Liverpool", color: "#D11317" }, logo: "https://a.espncdn.com/i/teamlogos/soccer/500/364.png" },
  second: { team: { name: "Arsenal", color: "#E20520" }, logo: "https://a.espncdn.com/i/teamlogos/soccer/500/359.png" },
  third: { team: { name: "Manchester City", color: "#99C5EA" }, logo: "https://a.espncdn.com/i/teamlogos/soccer/500/382.png" },
};

/** The places on a SeasonPodium, painted on the numerals. */
export const MEDALS = { gold: "#E6B422", silver: "#C0C4CC", bronze: "#CD7F32" };

/** Real players, for the Leaderboard and StatsCard showcases. */
export const PLAYERS = [
  { name: "Erling Haaland", position: "Forward", club: TEAMS.manCity, image: photo(737066) },
  { name: "Bukayo Saka", position: "Winger", club: TEAMS.arsenal, image: photo(961995) },
  { name: "Cole Palmer", position: "Attacking Midfielder", club: TEAMS.chelsea, image: photo(1096353) },
  { name: "João Pedro", position: "Forward", club: TEAMS.chelsea, image: photo(1021382) },
  { name: "Declan Rice", position: "Midfielder", club: TEAMS.arsenal, image: photo(654096) },
];
