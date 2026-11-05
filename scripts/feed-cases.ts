import type { EspnRequest } from "../src/sports/espn.js";

/** The clock every recorded feed runs against, so "completed" and "upcoming" stay stable. */
export const RECORDED_AT = new Date("2026-11-05T12:00:00Z");

export interface FeedCase { readonly name: string; readonly request: EspnRequest }

/** Soccer's output must stay byte-identical while the feeds become generic. */
export const SOCCER_CASES: readonly FeedCase[] = [
  { name: "soccer-teams", request: { league: "eng.1", feed: "teams" } },
  { name: "soccer-standings", request: { league: "eng.1", feed: "standings", team: "Chelsea" } },
  { name: "soccer-standings-past", request: { league: "esp.1", feed: "standings", season: 2025 } },
  { name: "soccer-scoreboard", request: { league: "eng.1", feed: "scoreboard", dates: "20261101" } },
  { name: "soccer-schedule", request: { league: "eng.1", feed: "schedule", team: "Chelsea" } },
  { name: "soccer-leaders", request: { league: "eng.1", feed: "leaders" } },
  { name: "soccer-match", request: { league: "eng.1", feed: "match", team: "Chelsea", opponent: "Arsenal", season: 2025 } },
  { name: "soccer-scorers", request: { league: "eng.1", feed: "scorers", team: "Chelsea", lastGames: 3, allCompetitions: true } },
];

/** The generic adapter, one case per feed and the shapes that differ between leagues. */
export const TEAM_SPORT_CASES: readonly FeedCase[] = [
  { name: "nba-teams", request: { league: "nba", feed: "teams" } },
  { name: "nba-standings", request: { league: "nba", feed: "standings", team: "Los Angeles Lakers" } },
  { name: "nba-standings-past", request: { league: "nba", feed: "standings", season: 2026 } },
  { name: "nba-scoreboard", request: { league: "nba", feed: "scoreboard", dates: "20261104" } },
  { name: "nba-schedule", request: { league: "nba", feed: "schedule", team: "Los Angeles Lakers" } },
  { name: "nba-leaders", request: { league: "nba", feed: "leaders" } },
  { name: "nba-match", request: { league: "nba", feed: "match", team: "Los Angeles Lakers", opponent: "LA Clippers" } },
  { name: "nba-roster", request: { league: "nba", feed: "roster", team: "Los Angeles Lakers" } },
  { name: "nba-injuries-team", request: { league: "nba", feed: "injuries", team: "Atlanta Hawks" } },
  { name: "nba-team-stats", request: { league: "nba", feed: "teamStats", team: "Los Angeles Lakers" } },
  { name: "nba-athlete", request: { league: "nba", feed: "athlete", player: "Luka Doncic" } },
  { name: "nba-gamelog", request: { league: "nba", feed: "gamelog", player: "LeBron James", team: "Philadelphia 76ers", lastGames: 3 } },
  { name: "nfl-teams", request: { league: "nfl", feed: "teams" } },
  { name: "nfl-standings", request: { league: "nfl", feed: "standings", team: "Kansas City Chiefs" } },
  { name: "nfl-standings-past", request: { league: "nfl", feed: "standings", season: 2025 } },
  { name: "nfl-scoreboard-week", request: { league: "nfl", feed: "scoreboard", week: 1, season: 2026 } },
  { name: "nfl-schedule", request: { league: "nfl", feed: "schedule", team: "Kansas City Chiefs" } },
  { name: "nfl-leaders", request: { league: "nfl", feed: "leaders" } },
  { name: "nfl-match-overtime", request: { league: "nfl", feed: "match", team: "Kansas City Chiefs", opponent: "Indianapolis Colts" } },
  { name: "nfl-roster", request: { league: "nfl", feed: "roster", team: "Kansas City Chiefs" } },
  { name: "nfl-injuries", request: { league: "nfl", feed: "injuries" } },
  { name: "nfl-team-stats", request: { league: "nfl", feed: "teamStats", team: "Kansas City Chiefs" } },
  { name: "nfl-athlete", request: { league: "nfl", feed: "athlete", player: "Patrick Mahomes", team: "Kansas City Chiefs" } },
  { name: "nfl-gamelog", request: { league: "nfl", feed: "gamelog", player: "Patrick Mahomes", lastGames: 3 } },
];
