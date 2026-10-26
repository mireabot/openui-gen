import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LIBRARY_SCHEMA } from "../src/lang/library.js";
import { PRIMITIVES } from "../src/lang/primitives.js";
import { componentIndex } from "../src/sports/components.js";

/**
 * `npm run openui:export`: the component schema index for native clients.
 *
 * - catalog/openui/primitives.json: every primitive with its positional props and roles, and a
 *   digest of the lang-core schema. A renderer registers one view per primitive name.
 * - catalog/openui/sports-components.json: the Sports component index (what each component is for,
 *   when to use it, its data contract). They are server templates; clients only see primitives.
 *
 * `--check` fails when a committed file is stale; `--ios <dir>` also writes it into the native
 * Resources directory. (The iOS app bundles catalog/openui/primitives.json directly.)
 */

const check = process.argv.includes("--check");
const iosIndex = process.argv.indexOf("--ios");
const ios = iosIndex < 0 ? null : process.argv[iosIndex + 1];
if (iosIndex >= 0 && (!ios || ios.startsWith("--"))) throw new Error("--ios requires the native Resources directory");
const definitions = PRIMITIVES.map(p => ({ name: p.name, args: Object.entries(p.props).map(([name, spec]) => ({ name, optional: spec.optional, ...spec.meta })) }));
const digest = createHash("sha256").update(JSON.stringify({ definitions, schema: LIBRARY_SCHEMA })).digest("hex");
const contract = { version: 1, langCore: "1.0.0", digest, primitives: definitions };

for (const [name, value] of [["primitives", contract], ["sports-components", componentIndex()]] as const) {
  const text = JSON.stringify(value, null, 2) + "\n";
  const files = [path.join("catalog", "openui", `${name}.json`), ...(ios ? [path.join(ios, `openui-${name}.json`)] : [])];
  for (const file of files) {
    if (check) {
      if (readFileSync(file, "utf8") !== text) throw new Error(`Stale OpenUI export: ${file}. Run npm run openui:export.`);
    } else {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  }
}
console.log(`OpenUI ${check ? "freshness" : "export"}: ${definitions.length} definitions, ${componentIndex().components.length} sports components, ${digest.slice(0, 12)}`);
