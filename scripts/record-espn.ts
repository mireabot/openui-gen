import { sportsLookup } from "../src/sports/feeds.js";
import { RECORDED_AT, SOCCER_CASES, TEAM_SPORT_CASES } from "./feed-cases.js";
import { recorder } from "./espn-replay.js";

/** Refreshes scripts/fixtures/espn from the live API. Run by hand; checks only replay these files. `-- nba` records only cases starting with "nba". */
const send = recorder();
const only = process.argv[2];
let failed = 0;
for (const { name, request } of [...SOCCER_CASES, ...TEAM_SPORT_CASES].filter(item => !only || item.name.startsWith(only))) {
  try {
    await sportsLookup(request, send, RECORDED_AT);
    console.log(`recorded ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAILED ${name}: ${(error as Error).message}`);
  }
}
if (failed) process.exitCode = 1;
