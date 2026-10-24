/**
 * `npm run sf-symbols`: builds catalog/sf-symbols.json, the allowlist of SF Symbol names the
 * DSL may use, from the SF Symbols app installed on this Mac (no CLI exists; the app ships
 * its metadata as plists). Each name gets its minimum iOS version; aliases map old names to
 * current ones. Re-run after updating SF Symbols and commit the result.
 *
 * Only names and OS versions are read. No glyphs are exported: SF Symbols may only be shown
 * on Apple platforms, so the web preview draws a Phosphor stand-in (src/primitives/icons.ts).
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const APP = "/Applications/SF Symbols.app";
const META = path.join(APP, "Contents/Resources/Metadata");
if (!existsSync(META)) throw new Error(`SF Symbols app not found at ${APP}; install it from developer.apple.com/sf-symbols`);

const json = (file: string) => JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", path.join(META, file)], { encoding: "utf8", maxBuffer: 64 << 20 }));
const version = execFileSync("defaults", ["read", path.join(APP, "Contents/Info.plist"), "CFBundleShortVersionString"], { encoding: "utf8" }).trim();

const availability = json("name_availability.plist") as { symbols: Record<string, string>; year_to_release: Record<string, { iOS: string }> };
const aliases = json("name_aliases.strings") as Record<string, string>;

const symbols: Record<string, string> = {};
for (const [name, year] of Object.entries(availability.symbols).sort(([a], [b]) => a.localeCompare(b))) {
  const ios = availability.year_to_release[year]?.iOS;
  if (ios) symbols[name] = ios;
}

writeFileSync("catalog/sf-symbols.json", `${JSON.stringify({ source: `SF Symbols.app ${version} (name_availability.plist, name_aliases.strings)`, version, symbols, aliases }, null, 1)}\n`);
console.log(`SF Symbols ${version}: ${Object.keys(symbols).length} names, ${Object.keys(aliases).length} aliases → catalog/sf-symbols.json`);
