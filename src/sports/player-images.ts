import { z } from "zod";
import type { SnapshotDataset } from "../lang/snapshots.js";
import type { DataField, MockValue } from "../research/dataset-schema.js";
import { inferFields } from "./dataset.js";
import { PlayerProfileSchema, playerNameKey, playerTeamKey, type PlayerLookup, type PlayerProfile, type PlayerQuery } from "./fotmob.js";
import type { SportsPlan } from "./plan.js";

type RecordValue = Record<string, MockValue>;
const object = (value: MockValue | undefined): RecordValue | null => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const records = (value: MockValue | undefined): RecordValue[] => Array.isArray(value) ? value.flatMap(item => { const record = object(item); return record ? [record] : []; }) : [];

export const savedPlayerProfiles = (value: unknown): PlayerProfile[] => {
  const parsed = z.array(PlayerProfileSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
};

const queryOf = (value: RecordValue, team?: string): PlayerQuery | null => typeof value.name === "string" && value.name.trim()
  ? { name: value.name, ...(typeof value.team === "string" && value.team ? { team: value.team } : team ? { team } : {}) } : null;

export function rawPlayerQueries(plan: SportsPlan, answers: Record<string, RecordValue>): PlayerQuery[] {
  const queries: PlayerQuery[] = plan.subject.kind === "player" ? [{ name: plan.subject.name }] : [];
  for (const question of plan.questions) {
    const answer = answers[question.id];
    if (!answer || answer.status !== "complete" || question.source !== "espn") continue;
    const add = (list: MockValue | undefined, team?: string) => {
      for (const record of records(list)) { const query = queryOf(record, team); if (query) queries.push(query); }
    };
    if (question.feed === "leaders") { add(answer.goals); add(answer.assists); }
    if (question.feed === "scorers") add(answer.scorers, question.team ?? undefined);
    if (question.feed === "match") { add(answer.teamPlayers, question.team ?? undefined); add(answer.opponentPlayers, question.opponent ?? undefined); }
  }
  return queries;
}

export function componentPlayerQueries(answers: unknown, clubs: readonly RecordValue[]): PlayerQuery[] {
  const clubNames = new Set(clubs.flatMap(club => [club.name, club.short, club.abbreviation].filter((name): name is string => typeof name === "string").map(playerNameKey)));
  const queries: PlayerQuery[] = [];
  const add = (value: RecordValue) => {
    const query = queryOf(value);
    if (query && !clubNames.has(playerNameKey(query.name))) queries.push(query);
  };
  const walk = (value: MockValue) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const record = object(value);
    if (!record) return;
    if (object(record.rating) && Array.isArray(record.stats)) add(record);
    if (typeof record.metric === "string" && Array.isArray(record.entries)) records(record.entries).forEach(add);
    Object.values(record).forEach(walk);
  };
  walk(z.json().parse(answers));
  return queries;
}

const matches = (profile: PlayerProfile, query: PlayerQuery) => playerNameKey(profile.name) === playerNameKey(query.name)
  && (!query.team || playerTeamKey(profile.team) === playerTeamKey(query.team));

export function createPlayerResolver(lookup: PlayerLookup, existing: readonly PlayerProfile[] = [], budgetMs = 5_000): (queries: readonly PlayerQuery[]) => Promise<PlayerProfile[]> {
  const profiles = [...existing];
  const attempted = new Set<string>();
  let remaining = budgetMs;
  let timedOut = false;
  const keyOf = (query: PlayerQuery) => `${playerNameKey(query.name)}|${playerTeamKey(query.team ?? "")}`;
  const withinBudget = (query: PlayerQuery, milliseconds: number): Promise<PlayerProfile | null> => new Promise(resolve => {
    const timer = setTimeout(() => { timedOut = true; resolve(null); }, milliseconds);
    Promise.resolve().then(() => lookup(query)).then(profile => { clearTimeout(timer); resolve(profile); }, () => { clearTimeout(timer); resolve(null); });
  });
  return async queries => {
    if (remaining <= 0) return [...profiles];
    const started = performance.now();
    const deadline = started + remaining;
    const unique = new Map(queries.map(query => [keyOf(query), query]));
    const missing = [...unique.values()].filter(query => !attempted.has(keyOf(query)) && !profiles.some(profile => matches(profile, query))).slice(0, Math.max(0, 20 - attempted.size));
    for (let offset = 0; offset < missing.length; offset += 4) {
      const available = deadline - performance.now();
      if (available <= 0) break;
      const batch = missing.slice(offset, offset + 4);
      batch.forEach(query => attempted.add(keyOf(query)));
      const resolved = await Promise.all(batch.map(query => withinBudget(query, available)));
      for (const profile of resolved) if (profile && !profiles.some(known => known.fotmobId === profile.fotmobId)) profiles.push(profile);
      if (timedOut) break;
    }
    remaining = timedOut ? 0 : Math.max(0, remaining - (performance.now() - started));
    return [...profiles];
  };
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
    if (typeof record.name !== "string" || !candidateNames.has(playerNameKey(record.name))) return result;
    const query = queryOf(record);
    const candidates = query ? players.filter(player => matches(player, query)) : [];
    const player = candidates.length === 1 ? candidates[0] : undefined;
    // A record named like a player is one, photo or not: its Avatar stands the headshot on the disc's bottom edge.
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
