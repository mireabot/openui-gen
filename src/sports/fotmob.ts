import { z } from "zod";

export const PlayerProfileSchema = z.object({
  fotmobId: z.number().int().positive(), name: z.string().min(1), team: z.string(), position: z.string(), imageUrl: z.string().url(),
});
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;
export interface PlayerQuery { readonly name: string; readonly team?: string }
export type PlayerLookup = (query: PlayerQuery) => Promise<PlayerProfile | null>;
export type FotmobTransport = (url: string) => Promise<unknown>;

export const playerNameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const playerTeamKey = (name: string) => playerNameKey(name).split(" ").filter(word => !["fc", "cf", "afc"].includes(word)).join(" ");

const Suggestion = z.object({
  text: z.string(), payload: z.object({ id: z.string().regex(/^[1-9][0-9]*$/), isCoach: z.boolean().optional(), teamName: z.string().optional() }).loose(),
}).loose();
const Search = z.object({ squadMemberSuggest: z.array(z.object({ options: z.array(Suggestion).default([]) }).loose()).default([]) }).loose();
const Profile = z.object({
  id: z.number().int().positive(), name: z.string().min(1), isCoach: z.boolean().optional(),
  primaryTeam: z.object({ teamName: z.string() }).loose().nullish(),
  positionDescription: z.object({ primaryPosition: z.object({ label: z.string() }).loose().nullish() }).loose().nullish(),
}).loose();

async function fetchJSON(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`FotMob HTTP ${response.status}`);
  return response.json();
}

export function createPlayerLookup({ send = fetchJSON, now = Date.now }: { readonly send?: FotmobTransport; readonly now?: () => number } = {}): PlayerLookup {
  const cache = new Map<string, { readonly until: number; readonly value: PlayerProfile | null }>();
  const pending = new Map<string, Promise<PlayerProfile | null>>();
  const lookup = async (query: PlayerQuery): Promise<PlayerProfile | null> => {
    const search = Search.parse(await send(`https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(query.name.trim())}&lang=en`));
    const candidates = new Map(search.squadMemberSuggest.flatMap(group => group.options)
      .filter(option => !option.payload.isCoach && playerNameKey(option.text.split("|")[0] ?? "") === playerNameKey(query.name)
        && (!query.team || playerTeamKey(option.payload.teamName ?? "") === playerTeamKey(query.team)))
      .map(option => [option.payload.id, option]));
    if (candidates.size !== 1) return null;
    const id = candidates.keys().next().value;
    if (!id) return null;
    const profile = Profile.parse(await send(`https://www.fotmob.com/api/data/playerData?id=${id}`));
    if (profile.isCoach || String(profile.id) !== id || playerNameKey(profile.name) !== playerNameKey(query.name)
      || (query.team && playerTeamKey(profile.primaryTeam?.teamName ?? "") !== playerTeamKey(query.team))) return null;
    return {
      fotmobId: profile.id, name: profile.name, team: profile.primaryTeam?.teamName ?? "",
      position: profile.positionDescription?.primaryPosition?.label ?? "",
      imageUrl: `https://images.fotmob.com/image_resources/playerimages/${profile.id}.png`,
    };
  };
  return async query => {
    if (!playerNameKey(query.name)) return null;
    const key = `${playerNameKey(query.name)}|${playerTeamKey(query.team ?? "")}`;
    const known = cache.get(key);
    if (known && known.until > now()) return known.value;
    const running = pending.get(key);
    if (running) return running;
    const result = lookup(query).then(value => {
      cache.delete(key);
      cache.set(key, { value, until: now() + (value ? 86_400_000 : 300_000) });
      while (cache.size > 1_000) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return value;
    }).catch(() => null).finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  };
}

export const lookupPlayer = createPlayerLookup();
