/**
 * Every league the sports pipeline reads, as configuration. Adding a league on ESPN's API means adding
 * an entry here: its URL path, how its seasons are named, which feeds it has and which stats it leads
 * with. Soccer also keeps its own presenter in `espn.ts` and its FotMob feeds.
 */

export type Sport = "soccer" | "football" | "basketball";

export const ESPN_FEEDS = ["scoreboard", "standings", "teams", "schedule", "leaders", "match", "scorers", "roster", "injuries", "teamStats", "athlete", "gamelog"] as const;
export type EspnFeed = (typeof ESPN_FEEDS)[number];

const SOCCER_FEEDS = ["scoreboard", "standings", "teams", "schedule", "leaders", "match", "scorers"] as const satisfies readonly EspnFeed[];
const TEAM_SPORT_FEEDS = ["scoreboard", "standings", "teams", "schedule", "leaders", "match", "roster", "injuries", "teamStats", "athlete", "gamelog"] as const satisfies readonly EspnFeed[];

export interface LeagueConfig {
  readonly name: string;
  readonly sport: Sport;
  /** The `{sport}/{league}` part of ESPN's URLs. */
  readonly espnPath: string;
  /** ESPN's numeric league id, as in a search result's uid (`s:40~l:46~a:1966`). */
  readonly espnLeagueId: string;
  /** How a season ends: a final table names its winner, playoffs and knockouts do not. */
  readonly format: "table" | "playoffs" | "knockout";
  readonly feeds: readonly EspnFeed[];
  /** A season's name from ESPN's year for it. */
  readonly seasonLabel: (year: number) => string;
  /** How the planner should write `season`. */
  readonly seasonRule: string;
  readonly defaultTimeZone: string;
  /** Leader categories worth a screen, in ESPN's names. Soccer's feed has its own two lists. */
  readonly leaderCategories: readonly string[];
  /** Columns a box score or game log keeps, by ESPN's label, when it has more than fit a phone. */
  readonly boxColumns: readonly string[];
  /** Team stat categories worth a screen, in ESPN's names. */
  readonly teamStatCategories: readonly string[];
  /** What web research should prefer. */
  readonly research: { readonly phrase: string; readonly domains: readonly string[] };
  /** Where player photos come from. */
  readonly photos: "fotmob" | "feed";
}

/** ESPN names a soccer season by its start year: 2026 is 2026/27. */
const startYearLabel = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
/** ESPN names an NBA season by its end year: 2027 is 2026-27. */
const endYearLabel = (year: number) => `${year - 1}-${String(year % 100).padStart(2, "0")}`;

const SOCCER_RESEARCH = { phrase: "established football data sources", domains: ["espn.com", "bbc.com", "premierleague.com", "laliga.com", "bundesliga.com", "legaseriea.it", "transfermarkt.com", "fbref.com"] } as const;

const soccer = (name: string, slug: string, espnLeagueId: string, format: "table" | "knockout", missing: readonly EspnFeed[] = []): LeagueConfig => ({
  name, sport: "soccer", espnPath: `soccer/${slug}`, espnLeagueId, format, feeds: SOCCER_FEEDS.filter(feed => !missing.includes(feed)),
  seasonLabel: startYearLabel, seasonRule: "the season's start year (2025 for 2025/26)", defaultTimeZone: "Europe/London",
  leaderCategories: [], boxColumns: [], teamStatCategories: [], research: SOCCER_RESEARCH, photos: "fotmob",
});

export const LEAGUE_CONFIG = {
  // Domestic leagues first: a club's league is the first competition that lists it.
  "eng.1": soccer("Premier League", "eng.1", "700", "table"),
  "esp.1": soccer("LaLiga", "esp.1", "740", "table"),
  "ger.1": soccer("Bundesliga", "ger.1", "720", "table"),
  "ita.1": soccer("Serie A", "ita.1", "730", "table"),
  "uefa.champions": soccer("Champions League", "uefa.champions", "775", "knockout"),
  // A knockout cup has no table and ESPN keeps no FA Cup leaders.
  "eng.fa": soccer("FA Cup", "eng.fa", "40", "knockout", ["standings", "leaders"]),
  nba: {
    name: "NBA", sport: "basketball", espnPath: "basketball/nba", espnLeagueId: "46", format: "playoffs", feeds: TEAM_SPORT_FEEDS,
    seasonLabel: endYearLabel, seasonRule: "the season's end year (2026 for 2025-26)", defaultTimeZone: "America/New_York",
    leaderCategories: ["pointsPerGame", "reboundsPerGame", "assistsPerGame", "stealsPerGame", "blocksPerGame", "3PointsMadePerGame"],
    boxColumns: ["MIN", "PTS", "REB", "AST", "STL", "BLK", "FG"],
    teamStatCategories: ["offensive", "defensive", "general"],
    research: { phrase: "official NBA and team sites and established basketball data sources", domains: ["espn.com", "nba.com", "basketball-reference.com"] },
    photos: "feed",
  },
  nfl: {
    name: "NFL", sport: "football", espnPath: "football/nfl", espnLeagueId: "28", format: "playoffs", feeds: TEAM_SPORT_FEEDS,
    seasonLabel: year => String(year), seasonRule: "the season's year (2025 for the 2025 season)", defaultTimeZone: "America/New_York",
    leaderCategories: ["passingYards", "passingTouchdowns", "rushingYards", "receivingYards", "receptions", "sacks", "interceptions"],
    boxColumns: [],
    teamStatCategories: ["passing", "rushing", "receiving", "defensive", "scoring"],
    research: { phrase: "official NFL and team sites and established football data sources", domains: ["espn.com", "nfl.com", "pro-football-reference.com"] },
    photos: "feed",
  },
} as const satisfies Record<string, LeagueConfig>;

export type LeagueCode = keyof typeof LEAGUE_CONFIG;
export const LEAGUE_CODES = Object.keys(LEAGUE_CONFIG) as LeagueCode[];
export const LEAGUES = Object.fromEntries(LEAGUE_CODES.map(code => [code, LEAGUE_CONFIG[code].name])) as Readonly<Record<LeagueCode, string>>;
export const CUP_CODES = ["uefa.champions", "eng.fa"] as const satisfies readonly LeagueCode[];

export const leagueOf = (code: LeagueCode): LeagueConfig => LEAGUE_CONFIG[code];
export const sportOf = (code: LeagueCode): Sport => LEAGUE_CONFIG[code].sport;
export const isSoccer = (code: LeagueCode | null | undefined) => code != null && sportOf(code) === "soccer";

export type SoccerLeagueCode = "eng.1" | "esp.1" | "ger.1" | "ita.1" | "uefa.champions" | "eng.fa";
export const SOCCER_LEAGUE_CODES = LEAGUE_CODES.filter(code => sportOf(code) === "soccer") as SoccerLeagueCode[];
export const TEAM_SPORT_LEAGUE_CODES = LEAGUE_CODES.filter(code => sportOf(code) !== "soccer");

/** Feeds a league has no data for. */
export const MISSING_FEEDS: Readonly<Record<LeagueCode, readonly EspnFeed[]>> = Object.fromEntries(
  LEAGUE_CODES.map(code => [code, ESPN_FEEDS.filter(feed => !leagueOf(code).feeds.includes(feed))]),
) as unknown as Record<LeagueCode, readonly EspnFeed[]>;
