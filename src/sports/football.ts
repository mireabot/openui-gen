import { config } from "../config.js";
import type { MockValue } from "../research/dataset-schema.js";
import { clubDirectory, espnLookup, type Club, type EspnAnswer, type EspnRequest, type EspnTransport } from "./espn.js";
import { clubsForDataset, fotmobClubDirectory, fotmobLookup, withClubColours } from "./fotmob-feeds.js";

/**
 * Where the football feeds come from, by DATA_SOURCE. "mixed": ESPN for tables, matches and clubs,
 * FotMob for players. "fotmob": FotMob for all of it. A transport passed in is a test scripting ESPN.
 */
const onFotmob = (send?: EspnTransport) => !send && config().DATA_SOURCE === "fotmob";

export const footballSourceName = () => config().DATA_SOURCE === "fotmob" ? "FotMob" : "ESPN";

export const footballLookup = (request: EspnRequest, send?: EspnTransport, now?: Date): Promise<EspnAnswer> =>
  onFotmob(send) ? fotmobLookup(request, undefined, now) : espnLookup(request, send, now);

export const footballClubs = (send?: EspnTransport): Promise<readonly Club[]> =>
  onFotmob(send) ? fotmobClubDirectory() : clubDirectory(send);

/** The clubs a screen is about, with colours: FotMob's directory has none until they're asked for. */
export const clubsWithColours = async (clubs: readonly Club[], send?: EspnTransport): Promise<readonly Club[]> =>
  onFotmob(send) ? withClubColours(clubs) : clubs;

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
  const base = await footballClubs(send).catch(() => [] as readonly Club[]);
  if (!onFotmob(send)) return base;
  const { searched, known } = clubNames(answers);
  return clubsForDataset(base, searched, known).catch(() => base);
}
