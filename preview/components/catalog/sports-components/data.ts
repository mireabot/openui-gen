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

/**
 * Injured players for the InjuryReport showcase. NFL and NBA are ESPN's injury feeds recorded
 * 5 Nov 2026; Chelsea is the club's report of 4 Nov 2026. Waits count from 5 Nov 2026.
 */
const nflHeadshot = (id: number) => `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
const nbaHeadshot = (id: number) => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;

export const INJURIES = {
  soccer: [
    { name: "João Pedro", position: "Forward", team: "Chelsea", color: "#144992", photo: photo(1021382), back: { date: "Nov 21", day: "Sat, Nov 21", until: "16 days" }, source: "The Standard" },
    { name: "Reece James", position: "Defender", team: "Chelsea", color: "#144992", photo: photo(807729), returnNote: "Mid-January 2027", source: "The Standard" },
    { name: "Jorrel Hato", position: "Defender", team: "Chelsea", color: "#144992", photo: photo(1413846) },
  ],
  nfl: [
    { name: "Jeremiyah Love", position: "RB", team: "Cardinals", color: "#a40227", photo: nflHeadshot(4870808), status: { label: "IR", tone: "bad" }, back: { date: "Dec 6", day: "Sun, Dec 6", until: "31 days" }, source: "Cardinals' official site" },
    { name: "Brian Robinson Jr.", position: "RB", team: "Falcons", color: "#a71930", photo: nflHeadshot(4241474), status: { label: "Questionable", tone: "warn" }, back: { date: "Nov 8", day: "Sun, Nov 8", until: "3 days" }, source: "Falcons' official website" },
    { name: "Tyler Huntley", position: "QB", team: "Ravens", color: "#29126f", photo: nflHeadshot(4035671), status: { label: "Out", tone: "bad" }, returnNote: "Out for season", source: "ESPN" },
    { name: "Walter Nolen III", position: "DT", team: "Cardinals", color: "#a40227", photo: nflHeadshot(4685503), status: { label: "Questionable", tone: "warn" }, back: { date: "Nov 8", day: "Sun, Nov 8", until: "3 days" } },
  ],
  nba: [
    { name: "Jalen Duren", position: "C", team: "Pistons", color: "#1d428a", photo: nbaHeadshot(4433621), status: { label: "Out", tone: "bad" }, back: { date: "Nov 9", day: "Mon, Nov 9", until: "4 days" }, source: "ClutchPoints" },
    { name: "Jock Landale", position: "C", team: "Hawks", color: "#c8102e", photo: nbaHeadshot(3146557), status: { label: "Day-to-day", tone: "info" }, back: { date: "Nov 6", day: "Fri, Nov 6", until: "Tomorrow" }, source: "Hawks' official site" },
    { name: "Julian Strawther", position: "G", team: "Nuggets", color: "#0e2240", photo: nbaHeadshot(4432181), status: { label: "Out", tone: "bad" }, back: { date: "Nov 29", day: "Sun, Nov 29", until: "24 days" }, source: "The Denver Gazette" },
  ],
} as const;
