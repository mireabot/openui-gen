import { config } from "../config.js";
import type { MockValue } from "../research/dataset-schema.js";
import { clubDirectory, espnLookup, type Club, type EspnAnswer, type EspnRequest, type EspnTransport } from "./espn.js";
import { genericLookup } from "./espn-generic.js";
import { isSoccer, TEAM_SPORT_LEAGUE_CODES, type LeagueCode } from "./leagues.js";
import { clubsForDataset, fotmobClubDirectory, fotmobLookup, withClubColours } from "./fotmob-feeds.js";

/**
 * Where structured feeds come from. Soccer, by DATA_SOURCE: "mixed" reads ESPN for tables, matches and
 * clubs and FotMob for players; "fotmob" reads FotMob for all of it. Every other sport reads ESPN through
 * the generic adapter. A transport passed in is a test scripting ESPN.
 */
const onFotmob = (send?: EspnTransport) => !send && config().DATA_SOURCE === "fotmob";

export const feedSourceName = (league?: LeagueCode | null) => (league && !isSoccer(league)) || config().DATA_SOURCE !== "fotmob" ? "ESPN" : "FotMob";

export const sportsLookup = (request: EspnRequest, send?: EspnTransport, now?: Date): Promise<EspnAnswer> => {
  if (!isSoccer(request.league)) return genericLookup(request, send, now);
  return onFotmob(send) ? fotmobLookup(request, undefined, now) : espnLookup(request, send, now);
};

/** Every team the planner can name. FotMob covers soccer only, so other sports always come from ESPN. */
export const teamDirectory = async (send?: EspnTransport): Promise<readonly Club[]> => {
  if (!onFotmob(send)) return clubDirectory(send);
  const [soccer, others] = await Promise.all([fotmobClubDirectory(), clubDirectory(send, Date.now(), TEAM_SPORT_LEAGUE_CODES)]);
  return [...soccer, ...others];
};

/** The clubs a screen is about, with colours: FotMob's directory has none until they're asked for. */
export const clubsWithColours = async (clubs: readonly Club[], send?: EspnTransport): Promise<readonly Club[]> => {
  if (!onFotmob(send)) return clubs;
  const coloured = new Map((await withClubColours(clubs.filter(club => isSoccer(club.league)))).map(club => [`${club.league}:${club.id}`, club]));
  return clubs.map(club => coloured.get(`${club.league}:${club.id}`) ?? club);
};

/** Club names in a dataset's answers: records with no crest, and what a player's record names. */
function clubNames(answers: unknown) {
  const searched = new Set<string>();
  const known = new Set<string>();
  const walk = (value: MockValue): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, MockValue>;
    Object.values(record).forEach(walk);
    if (record.kind === "player") {
      for (const name of [record.team, ...(typeof record.detail === "string" ? record.detail.split(" · ") : [])]) if (typeof name === "string" && name) known.add(name);
    } else if (typeof record.name === "string" && record.logo === "") searched.add(record.name);
  };
  walk(answers as MockValue);
  return { searched: [...searched], known: [...known] };
}

/** The directory `fillClubMarks` reads for one dataset. On FotMob it also finds clubs outside the six competitions. */
export async function clubsForMarks(answers: unknown, send?: EspnTransport): Promise<readonly Club[]> {
  const base = await teamDirectory(send).catch(() => [] as readonly Club[]);
  if (!onFotmob(send)) return base;
  const { searched, known } = clubNames(answers);
  return clubsForDataset(base, searched, known).catch(() => base);
}
