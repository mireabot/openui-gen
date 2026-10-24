import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The server stays on the OpenUI Ask path: nothing imports the legacy DSL, Jev decisions or the V2 contract. */

const BANNED = [/\/dsl\//, /\/decide(\.js)?"/, /\/contract\//, /\/bindings\//, /\/retrieve\//, /\/validate\//, /\/pack\.js"/, /@typesafe-ai\//, /\/observe\//];
const files: string[] = [];
const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = path.join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) files.push(p); } };
walk("src");
const found = files.flatMap(file => [...readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)]
  .filter(([, spec]) => BANNED.some(rule => rule.test(`"${spec}"`))).map(([, spec]) => `${file}: ${spec}`));
assert.deepEqual(found, [], `legacy imports:\n${found.join("\n")}`);
console.log(`closure: ${files.length} files, no legacy imports`);
