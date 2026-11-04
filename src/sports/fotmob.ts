import { z } from "zod";

export const PlayerProfileSchema = z.object({
  fotmobId: z.number().int().positive(), name: z.string().min(1), team: z.string(), position: z.string(), imageUrl: z.string().url(),
});
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;
export interface PlayerQuery {
  readonly name: string;
  readonly team?: string;
  /** What the screen says about this player, e.g. "Forward · Chelsea", for telling namesakes apart. */
  readonly context?: string;
}
/** A FotMob result the picker reads: who it is now and every senior club they played for. */
export interface PlayerCandidate { readonly fotmobId: number; readonly name: string; readonly team: string; readonly career: readonly string[] }
/** The picker's choice from `candidates`, or another name to search for when none of them is the player. */
export interface PlayerPick { readonly fotmobId: number | null; readonly searchAgain: string | null }
export type PlayerPicker = (query: PlayerQuery, candidates: readonly PlayerCandidate[]) => Promise<PlayerPick>;
export type PlayerLookup = (query: PlayerQuery, pick?: PlayerPicker) => Promise<PlayerProfile | null>;
export type FotmobTransport = (url: string) => Promise<unknown>;

export const playerNameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const playerTeamKey = (name: string) => playerNameKey(name).split(" ").filter(word => !["fc", "cf", "afc"].includes(word)).join(" ");
const Suggestion = z.object({
  text: z.string(), score: z.number().optional(), payload: z.object({ id: z.string().regex(/^[1-9][0-9]*$/), isCoach: z.boolean().optional(), teamName: z.string().optional() }).loose(),
}).loose();
const Search = z.object({ squadMemberSuggest: z.array(z.object({ options: z.array(Suggestion).default([]) }).loose()).default([]) }).loose();
const Profile = z.object({
  id: z.number().int().positive(), name: z.string().min(1), isCoach: z.boolean().optional(),
  primaryTeam: z.object({ teamName: z.string() }).loose().nullish(),
  careerHistory: z.object({ careerItems: z.object({ senior: z.object({ teamEntries: z.array(z.object({ team: z.string() }).loose()).default([]) }).loose().nullish() }).loose().nullish() }).loose().nullish(),
  positionDescription: z.object({ primaryPosition: z.object({ label: z.string() }).loose().nullish() }).loose().nullish(),
}).loose();

async function fetchJSON(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`FotMob HTTP ${response.status}`);
  return response.json();
}

export function createPlayerLookup({ send = fetchJSON }: { readonly send?: FotmobTransport } = {}): PlayerLookup {
  const pending = new Map<string, Promise<PlayerProfile | null>>();
  const search = async (term: string) => {
    const found = Search.parse(await send(`https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(term.trim())}&lang=en`));
    return [...new Map(found.squadMemberSuggest.flatMap(group => group.options).filter(option => !option.payload.isCoach).map(option => [option.payload.id, option])).values()];
  };
  const profile = async (id: string) => {
    const found = Profile.parse(await send(`https://www.fotmob.com/api/data/playerData?id=${id}`));
    return !found.isCoach && String(found.id) === id ? found : null;
  };
  const lookup = async (query: PlayerQuery, pick?: PlayerPicker): Promise<PlayerProfile | null> => {
    const result = (found: z.infer<typeof Profile>): PlayerProfile => ({
      // The club asked about, which is not the player's current one when they have moved since.
      // The name as the screen writes it, which is how its record finds this profile.
      fotmobId: found.id, name: query.name, team: query.team ?? found.primaryTeam?.teamName ?? "",
      position: found.positionDescription?.primaryPosition?.label ?? "",
      imageUrl: `https://images.fotmob.com/image_resources/playerimages/${found.id}.png`,
    });
    const named = (name: string) => playerNameKey(name) === playerNameKey(query.name);
    const options = await search(query.name);
    const exact = options.filter(option => named(option.text.split("|")[0] ?? ""));
    // Nothing to decide: one player has this name, or one of them is at the named club.
    const clear = exact.length === 1 ? exact : query.team ? exact.filter(option => playerTeamKey(option.payload.teamName ?? "") === playerTeamKey(query.team!)) : [];
    if (clear.length === 1) {
      const found = await profile(clear[0]!.payload.id);
      if (found && named(found.name)) return result(found);
    }
    if (!pick) return null;
    // Namesakes, a player who has moved, or a name spelled differently: the model decides who is meant.
    const choose = async (from: typeof options) => {
      const profiles = (await Promise.all(from.slice(0, 4).map(option => profile(option.payload.id)))).filter((found): found is NonNullable<typeof found> => !!found);
      const candidates = profiles.map(found => ({ fotmobId: found.id, name: found.name, team: found.primaryTeam?.teamName ?? "", career: (found.careerHistory?.careerItems?.senior?.teamEntries ?? []).map(entry => entry.team) }));
      const picked = await pick(query, candidates);
      return { picked, found: profiles.find(found => found.id === picked.fotmobId) ?? null };
    };
    const first = await choose(exact.length ? exact : options);
    if (first.found) return result(first.found);
    if (!first.picked.searchAgain) return null;
    const second = await choose(await search(first.picked.searchAgain));
    return second.found ? result(second.found) : null;
  };
  return async (query, pick) => {
    if (!playerNameKey(query.name)) return null;
    const key = `${playerNameKey(query.name)}|${playerTeamKey(query.team ?? "")}`;
    const running = pending.get(key);
    if (running) return running;
    const result = lookup(query, pick).catch(() => null).finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  };
}

export const lookupPlayer = createPlayerLookup();

const MatchDay = z.object({ leagues: z.array(z.object({ matches: z.array(z.object({
  id: z.number(), home: z.object({ name: z.string(), score: z.number().nullish() }).loose(), away: z.object({ name: z.string(), score: z.number().nullish() }).loose(),
}).loose()).default([]) }).loose()).default([]) }).loose();
const TopPlayer = z.object({ playerId: z.number(), name: z.object({ fullName: z.string() }).loose(), playerRatingRounded: z.string(), positionLabel: z.object({ label: z.string() }).loose().nullish() }).loose();
const MatchDetails = z.object({ content: z.object({ matchFacts: z.object({ topPlayers: z.object({ homeTopPlayers: z.array(TopPlayer).default([]), awayTopPlayers: z.array(TopPlayer).default([]) }).loose().nullish() }).loose().nullish() }).loose().nullish() }).loose();

const MarketValues = z.object({ marketValues: z.object({ values: z.array(z.object({
  date: z.string(), value: z.number(), teamId: z.number().nullish(), teamName: z.string().nullish(),
  teamColor: z.object({ lightMode: z.string().nullish(), darkMode: z.string().nullish() }).loose().nullish(),
}).loose()).default([]) }).loose().nullish() }).loose();
type MarketValue = z.infer<typeof MarketValues>["marketValues"] extends infer M ? NonNullable<M> extends { values: (infer V)[] } ? V : never : never;

/** The one place a market value is written: FotMob's figures are euros. */
export const marketValueText = (value: number) => {
  const short = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  // Under a million reads as thousands, "€900k", and a figure rounding up to a million reads as "€1M".
  if (value >= 1e9) return `€${short(value / 1e9)}B`;
  if (value >= 999_500) return `€${short(value / 1e6)}M`;
  return value >= 1e3 ? `€${Math.round(value / 1e3)}k` : `€${Math.round(value)}`;
};

/** The y axis: zero and round steps up to the top value, at most four labels. */
export function valueTicks(top: number): { value: number; display: string }[] {
  const size = 10 ** Math.floor(Math.log10(Math.max(top, 1)));
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5].map(factor => factor * size).find(candidate => top / candidate < 4) ?? size * 10;
  return Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => ({ value: index * step, display: marketValueText(index * step) }));
}

export interface ValuePoint { readonly x: number; readonly label: string; readonly value: number; readonly display: string }
export interface ClubStretch { readonly name: string; readonly lineColor: string; readonly tagColor: string; readonly logo: string; readonly points: readonly ValuePoint[] }
export interface PlayerValueChart { readonly value: string; readonly caption: string; readonly segments: readonly ClubStretch[]; readonly ticks: readonly { readonly value: number; readonly display: string }[] }

const hex = (color: string | null | undefined) => (color && /^#[0-9a-f]{6}$/i.test(color) ? color : "");
const monthOf = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** A player's value history, one stretch per unbroken spell at a club. The line takes the dark-theme colour; the tag, with white text, the darker light-theme one. Null with fewer than two values. */
/** The dataset's limit for one list. A long spell keeps its first, last and highest values, and even steps between. */
const STRETCH_POINTS_MAX = 40;
function thinnedPoints(points: readonly ValuePoint[]): ValuePoint[] {
  if (points.length <= STRETCH_POINTS_MAX) return [...points];
  const last = points.length - 1;
  const peak = points.reduce((best, point, index) => point.value > points[best]!.value ? index : best, 0);
  const steps = STRETCH_POINTS_MAX - 2;
  const kept = new Set([peak, ...Array.from({ length: steps + 1 }, (_, step) => Math.round(step * last / steps))]);
  return [...kept].sort((a, b) => a - b).map(index => points[index]!);
}

export function playerValueChart(name: string, values: readonly MarketValue[]): PlayerValueChart | null {
  const sorted = [...values].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (sorted.length < 2) return null;
  const segments: { key: string; stretch: ClubStretch & { points: ValuePoint[] } }[] = [];
  for (const entry of sorted) {
    const key = String(entry.teamId ?? entry.teamName ?? "");
    const point: ValuePoint = { x: Date.parse(entry.date), label: monthOf.format(new Date(entry.date)), value: entry.value, display: marketValueText(entry.value) };
    const last = segments.at(-1);
    if (last?.key === key) { last.stretch.points.push(point); continue; }
    segments.push({ key, stretch: { name: entry.teamName ?? "", lineColor: hex(entry.teamColor?.darkMode), tagColor: hex(entry.teamColor?.lightMode),
      logo: entry.teamId ? `https://images.fotmob.com/image_resources/logo/teamlogo/${entry.teamId}.png` : "", points: [point] } });
  }
  return { value: marketValueText(sorted.at(-1)!.value), caption: `${name} · Market value`, segments: segments.map(s => ({ ...s.stretch, points: thinnedPoints(s.stretch.points) })), ticks: valueTicks(Math.max(...sorted.map(entry => entry.value))) };
}

/** A player's value over time: the same lookup photos use, then the history on their FotMob profile. */
export async function playerValue(query: PlayerQuery, find: (query: PlayerQuery) => Promise<PlayerProfile | null>, send: FotmobTransport = fetchJSON): Promise<PlayerValueChart | null> {
  const player = await find(query);
  if (!player) return null;
  const { marketValues } = MarketValues.parse(await send(`https://www.fotmob.com/api/data/playerData?id=${player.fotmobId}`));
  return playerValueChart(query.name, marketValues?.values ?? []);
}

export interface RatedPlayer { readonly fotmobId: number; readonly name: string; readonly rating: string; readonly position: string; readonly imageUrl: string }
export interface MatchToRate { readonly date: string; readonly home: string; readonly away: string; readonly homeScore: number; readonly awayScore: number }

const dayOf = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");

/**
 * FotMob's top rated players of one finished match, best first, up to five a side. FotMob names some
 * clubs differently and files a late kickoff under its own day, so a match is the one on that day or
 * the day before with the same score and at least one club of a matching name. Null when none is found.
 */
export async function matchRatings(match: MatchToRate, send: FotmobTransport = fetchJSON): Promise<{ home: RatedPlayer[]; away: RatedPlayer[] } | null> {
  const kickoff = new Date(match.date);
  // "Inter" is "Internazionale" and "Milan" is "AC Milan": every word of one starts a word of the other.
  const covers = (short: string[], long: string[]) => short.length > 0 && short.every(word => long.some(part => part.startsWith(word)));
  const same = (a: string, b: string) => { const [x, y] = [playerTeamKey(a).split(" "), playerTeamKey(b).split(" ")]; return covers(x, y) || covers(y, x); };
  for (const day of [kickoff, new Date(kickoff.getTime() - 86_400_000)]) {
    const { leagues } = MatchDay.parse(await send(`https://www.fotmob.com/api/data/matches?date=${dayOf(day)}`));
    const found = leagues.flatMap(league => league.matches).find(m => m.home.score === match.homeScore && m.away.score === match.awayScore && (same(m.home.name, match.home) || same(m.away.name, match.away)));
    if (!found) continue;
    const top = MatchDetails.parse(await send(`https://www.fotmob.com/api/data/matchDetails?matchId=${found.id}`)).content?.matchFacts?.topPlayers;
    if (!top) return null;
    const rated = (players: readonly z.infer<typeof TopPlayer>[]): RatedPlayer[] => players.map(p => ({
      fotmobId: p.playerId, name: p.name.fullName, rating: p.playerRatingRounded, position: p.positionLabel?.label ?? "",
      imageUrl: `https://images.fotmob.com/image_resources/playerimages/${p.playerId}.png`,
    }));
    return { home: rated(top.homeTopPlayers), away: rated(top.awayTopPlayers) };
  }
  return null;
}
