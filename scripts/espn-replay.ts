import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { EspnTransport } from "../src/sports/espn.js";

export const FIXTURES = path.join(import.meta.dirname, "fixtures");
const RESPONSES = path.join(FIXTURES, "espn");

/** One file per URL: readable names, and a changed request fails instead of silently matching. */
const fileFor = (url: string) => {
  const { hostname, pathname, search } = new URL(url);
  const host = hostname.startsWith("site.web") ? "web" : "site";
  return path.join(RESPONSES, `${host}${pathname}${search}`.replace(/[^a-zA-Z0-9._-]+/g, "_") + ".json");
};

/** ESPN fields no feed reads. Dropping them keeps recorded responses reviewable. */
const UNUSED = new Set(["links", "headlines", "odds", "plays", "videos", "news", "article", "pickcenter", "againstTheSpread", "winprobability", "predictor", "tickets", "ticketsInfo", "geoBroadcasts", "guid", "alternateIds", "contracts", "drives", "meta", "wallclockAvailable", "highlights", "franchise", "commentary", "glossary", "seasons", "provider", "shotChart", "logoDark", "notes", "timeValid", "format", "birthPlace", "address", "images", "longComment", "source", "rel", "lastFiveGames", "broadcast"]);
const prune = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(prune);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !UNUSED.has(key)).map(([key, child]) => [key, prune(child)]));
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** A few rows show what a long list looks like; a league's whole injury report and leader lists do not need recording. */
function shorten(url: string, data: Json): Json {
  if (url.includes("/injuries")) return { ...data, injuries: data.injuries.slice(0, 4).map((group: Json) => ({ ...group, injuries: group.injuries.slice(0, 4) })) };
  if (url.includes("/leaders") && data.leaders?.categories) {
    return { ...data, leaders: { ...data.leaders, categories: data.leaders.categories.map((category: Json) => ({ ...category, leaders: category.leaders.slice(0, 12).map(({ displayValue, value, athlete, team }: Json) => ({ displayValue, value, athlete, team })) })) } };
  }
  return data;
}

/** Reads recorded responses and logs every URL. An unrecorded URL throws, so nothing reaches the network. */
export function replay() {
  const urls: string[] = [];
  const send: EspnTransport = async url => {
    urls.push(url);
    const file = fileFor(url);
    if (!existsSync(file)) throw new Error(`No recorded response for ${url}. Run npm run record:espn.`);
    return JSON.parse(readFileSync(file, "utf8"));
  };
  return { send, urls };
}

/** Fetches live ESPN and saves a pruned copy of every response. A failed URL records nothing and throws, as the replay would. */
export function recorder(): EspnTransport {
  mkdirSync(RESPONSES, { recursive: true });
  return async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json", "User-Agent": "openui-gen-fixtures" } });
    if (!response.ok) throw new Error(`ESPN HTTP ${response.status} for ${url}`);
    const pruned = shorten(url, prune(await response.json()) as Json);
    writeFileSync(fileFor(url), JSON.stringify(pruned) + "\n");
    return pruned;
  };
}
