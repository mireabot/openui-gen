import { z } from "zod";
import type { SnapshotDataset } from "../lang/snapshots.js";
import type { DataField, MockValue } from "../research/dataset-schema.js";
import { inferFields } from "./dataset.js";
import { PlayerProfileSchema, playerNameKey, playerTeamKey, type PlayerLookup, type PlayerProfile, type PlayerQuery } from "./fotmob.js";
import type { Club } from "./espn.js";
import type { SportsPlan } from "./plan.js";

type RecordValue = Record<string, MockValue>;
const object = (value: MockValue | undefined): RecordValue | null => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const records = (value: MockValue | undefined): RecordValue[] => Array.isArray(value) ? value.flatMap(item => { const record = object(item); return record ? [record] : []; }) : [];

export const savedPlayerProfiles = (value: unknown): PlayerProfile[] => {
  const parsed = z.array(PlayerProfileSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
};

/** Preserve identities supplied by the feed before the designer chooses its fields. */
export function feedPlayerProfiles(answers: Record<string, RecordValue>): PlayerProfile[] {
  const profiles = new Map<string, PlayerProfile>();
  const walk = (value: MockValue): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const record = object(value);
    if (!record) return;
    const parsed = PlayerProfileSchema.safeParse({ ...record, team: record.team ?? "", position: record.position ?? "" });
    if (parsed.success) profiles.set(`${parsed.data.fotmobId}|${playerNameKey(parsed.data.name)}`, parsed.data);
    Object.values(record).forEach(walk);
  };
  Object.values(answers).forEach(walk);
  return [...profiles.values()];
}

const queryOf = (value: RecordValue, team?: string): PlayerQuery | null => typeof value.name === "string" && value.name.trim()
  ? { name: value.name, ...(typeof value.team === "string" && value.team ? { team: value.team } : team ? { team } : {}) } : null;

export function rawPlayerQueries(plan: SportsPlan, answers: Record<string, RecordValue>): PlayerQuery[] {
  const queries: PlayerQuery[] = plan.subject.kind === "player" ? [{ name: plan.subject.name }] : [];
  for (const question of plan.questions) {
    const answer = answers[question.id];
    if (!answer || answer.status !== "complete" || question.source !== "espn") continue;
    const add = (list: MockValue | undefined, team?: string) => {
      // A player whose FotMob id came with the data (a match's squad sheet) needs no search.
      for (const record of records(list)) { if (typeof record.fotmobId === "number") continue; const query = queryOf(record, team); if (query) queries.push(query); }
    };
    if (question.feed === "leaders") { add(answer.goals); add(answer.assists); }
    if (question.feed === "scorers") add(answer.scorers, question.team ?? undefined);
    if (question.feed === "match") { add(answer.teamRated, question.team ?? undefined); add(answer.opponentRated, question.opponent ?? undefined); add(answer.teamPlayers, question.team ?? undefined); add(answer.opponentPlayers, question.opponent ?? undefined); }
  }
  return queries;
}

export function componentPlayerQueries(answers: unknown, clubs: readonly RecordValue[]): PlayerQuery[] {
  const clubNames = new Set(clubs.flatMap(club => [club.name, club.short, club.abbreviation].filter((name): name is string => typeof name === "string").map(playerNameKey)));
  const queries: PlayerQuery[] = [];
  const add = (value: RecordValue) => {
    const query = queryOf(value);
    if (query && !clubNames.has(playerNameKey(query.name))) queries.push({ ...query, ...(typeof value.detail === "string" && value.detail ? { context: value.detail } : {}) });
  };
  const walk = (value: MockValue) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const record = object(value);
    if (!record) return;
    if (object(record.rating) && Array.isArray(record.stats)) add(record);
    // A person in any list (a partner, a rival, a coach) is marked as a player by the schema stage.
    else if (record.kind === "player") add(record);
    if (typeof record.metric === "string" && Array.isArray(record.entries)) records(record.entries).forEach(add);
    if (typeof record.metric === "string" && Array.isArray(record.rows)) for (const row of records(record.rows)) {
      for (const cell of [object(row.home), object(row.away)]) {
        if (cell?.present === true) add({ ...cell, ...(typeof object(cell.club)?.name === "string" ? { team: object(cell.club)!.name! } : {}) });
      }
    }
    Object.values(record).forEach(walk);
  };
  walk(z.json().parse(answers));
  return queries;
}

/** A profile answers a query by name: the lookup already settled which of any namesakes it is. */
const matches = (profile: PlayerProfile, query: PlayerQuery) => playerNameKey(profile.name) === playerNameKey(query.name);

/**
 * Looks up every player the screen names, 4 at a time, with no cap on how many and no budget for
 * the whole run. Only a single lookup is bounded (`timeoutMs`), so one stalled request cannot hold
 * the screen; it counts as not found and the others carry on.
 */
export function createPlayerResolver(lookup: PlayerLookup, existing: readonly PlayerProfile[] = [], timeoutMs = 10_000): (queries: readonly PlayerQuery[]) => Promise<PlayerProfile[]> {
  const profiles = [...new Map(existing.map(profile => [`${profile.fotmobId}|${playerNameKey(profile.name)}|${playerTeamKey(profile.team)}`, profile])).values()];
  const attempted = new Set<string>();
  const keyOf = (query: PlayerQuery) => `${playerNameKey(query.name)}|${playerTeamKey(query.team ?? "")}`;
  const bounded = (query: PlayerQuery): Promise<PlayerProfile | null> => new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    Promise.resolve().then(() => lookup(query)).then(profile => { clearTimeout(timer); resolve(profile); }, () => { clearTimeout(timer); resolve(null); });
  });
  return async queries => {
    const unique = new Map(queries.map(query => [keyOf(query), query]));
    const missing = [...unique.values()].filter(query => !attempted.has(keyOf(query)) && !profiles.some(profile => matches(profile, query)));
    for (let offset = 0; offset < missing.length; offset += 4) {
      const batch = missing.slice(offset, offset + 4);
      batch.forEach(query => attempted.add(keyOf(query)));
      const resolved = await Promise.all(batch.map(bounded));
      for (const profile of resolved) if (profile && !profiles.some(known => known.fotmobId === profile.fotmobId)) profiles.push(profile);
    }
    return [...profiles];
  };
}

/**
 * Every club the ESPN directory knows gets its logo and colour, not only the ones the screen is about:
 * an opponent in a MatchCard, a club on a podium. A club with a logo then passes "clear", so its crest
 * has no fill whatever the schema stage wrote; a club without one keeps its colour for the monogram.
 * Runs after `populatePlayerImages`, which marks the player records.
 */
export function fillClubMarks<T extends SnapshotDataset>(dataset: T, directory: readonly Club[]): T {
  // Local names a page may use for a club ESPN lists in English.
  const clubKey = (name: string) => playerTeamKey(name).replace("munchen", "munich").replace("koln", "cologne");
  const clubOf = (name: string) => directory.find(club => clubKey(club.name) === clubKey(name) || clubKey(club.short) === clubKey(name));
  const walk = (value: MockValue): MockValue => {
    if (Array.isArray(value)) return value.map(walk);
    const record = object(value);
    if (!record) return value;
    const result: RecordValue = Object.fromEntries(Object.entries(record).map(([key, child]) => [key, walk(child)]));
    // A player's disc is their club's colour from the directory, for every club, not only the ones the screen is about.
    if (record.kind === "player") {
      const named = [record.team, ...(typeof record.detail === "string" ? record.detail.split(" · ") : [])].flatMap(name => typeof name === "string" && name ? [clubOf(name)] : []).find(Boolean);
      return named?.color ? { ...result, color: named.color } : result;
    }
    if (typeof record.name !== "string" || typeof record.logo !== "string") return result;
    const club = record.logo === "" ? clubOf(record.name) : undefined;
    const logo = club?.logo || record.logo;
    return { ...result, logo, ...("color" in record ? { color: logo ? "clear" : record.color || club?.color || "" } : {}) };
  };
  const source = z.record(z.string(), z.json()).parse(dataset.values);
  return { ...dataset, values: { ...source, ...(source.answers !== undefined ? { answers: walk(source.answers) } : {}) } };
}

export function populatePlayerImages<T extends SnapshotDataset>(dataset: T, players: readonly PlayerProfile[], knownPlayerQueries: readonly PlayerQuery[]): Omit<T, "values" | "fields"> & SnapshotDataset {
  const source = z.record(z.string(), z.json()).parse(dataset.values);
  const candidateNames = new Set([...knownPlayerQueries.map(query => playerNameKey(query.name)), ...players.map(player => playerNameKey(player.name))]);
  const fields = new Map(dataset.fields.map(field => [field.path, field]));
  const addField = (path: string, kind: DataField["kind"], format: DataField["format"]) => {
    fields.set(path, { path, kind, format });
  };
  const walk = (value: MockValue, path: string): MockValue => {
    if (Array.isArray(value)) {
      const items = value.map(item => walk(item, `${path}[]`));
      if (items.some(item => { const record = object(item); return record && "fotmobId" in record && "imageUrl" in record; })) {
        return items.map(item => {
          const record = object(item);
          return record ? { fotmobId: null, imageUrl: "", logo: "", ...record } : item;
        });
      }
      return items;
    }
    const record = object(value);
    if (!record) return value;
    const result: RecordValue = Object.fromEntries(Object.entries(record).map(([key, child]) => [key, walk(child, path ? `${path}.${key}` : key)]));
    for (const role of ["scorer", "assist"]) {
      const name = record[role];
      const nested = `${role}Player`;
      if (typeof name !== "string" || !name || object(result[nested])) continue;
      const known = players.filter(player => playerNameKey(player.name) === playerNameKey(name));
      if (known.length === 1) {
        const at = `${path}.${nested}`;
        result[nested] = walk({ name, team: known[0]!.team, kind: "player" }, at);
        for (const field of inferFields(result[nested], at)) fields.set(field.path, field);
      }
    }
    // A feed's athlete has its own headshot, and a namesake in FotMob is someone else.
    if (typeof record.athleteId === "string" && record.athleteId) return result;
    // A photo that came with the data (a match's squad sheet) is the player's: a search never replaces it.
    if (typeof record.fotmobId === "number" && typeof record.imageUrl === "string" && record.imageUrl) {
      addField(`${path}.logo`, "text", "none");
      addField(`${path}.kind`, "text", "none");
      return { ...result, logo: record.imageUrl, kind: "player" };
    }
    if (typeof record.name !== "string" || !candidateNames.has(playerNameKey(record.name))) return result;
    const query = queryOf(record);
    const candidates = query ? players.filter(player => matches(player, query)) : [];
    const player = candidates.length === 1 ? candidates[0] : undefined;
    // A record named like a player is one, photo or not: its Avatar shows the headshot on the disc colour.
    result.kind = "player";
    addField(`${path}.kind`, "text", "none");
    result.fotmobId = player?.fotmobId ?? null;
    result.imageUrl = player?.imageUrl ?? "";
    result.logo = player?.imageUrl ?? "";
    addField(`${path}.fotmobId`, "number", "integer");
    addField(`${path}.imageUrl`, "text", "none");
    addField(`${path}.logo`, "text", "none");
    return result;
  };
  const answers = source.answers;
  if (answers !== undefined) source.answers = walk(answers, "answers");
  if (players.length) {
    source.players = players.map(player => ({ ...player }));
    for (const field of inferFields(source.players, "players")) fields.set(field.path, field);
  }
  return { ...dataset, values: source, fields: [...fields.values()] };
}
