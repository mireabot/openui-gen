import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PROJECT_ROOT } from "../paths.js";

/**
 * Icon names are SF Symbols names (canonical in OpenUI programs). The allowlist comes from the SF
 * Symbols app (`npm run sf-symbols` → catalog/sf-symbols.json): a name is valid when it
 * exists and is available on the app's deployment target. The web preview draws a
 * Phosphor stand-in (web/lib/primitives/icons.ts); SF glyphs are only shown on Apple platforms.
 */

/** Minimum iOS version of the app. Symbols newer than this are rejected. */
export const IOS_DEPLOYMENT_TARGET = "18.0";

interface Allowlist { version: string; symbols: Record<string, string>; aliases: Record<string, string> }
let list: Allowlist | undefined;
const load = (): Allowlist => (list ??= JSON.parse(readFileSync(fileURLToPath(new URL("catalog/sf-symbols.json", PROJECT_ROOT)), "utf8")) as Allowlist);

const newer = (a: string, b: string) => {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/** null when the name is usable; otherwise why not (with the current name for an alias). */
export function iconProblem(name: string): string | null {
  const { symbols, aliases } = load();
  const minIOS = symbols[name];
  if (minIOS === undefined) {
    const current = aliases[name];
    return current ? `"${name}" is an old SF Symbols name; use "${current}"` : `"${name}" is not an SF Symbols name`;
  }
  return newer(minIOS, IOS_DEPLOYMENT_TARGET) ? `"${name}" needs iOS ${minIOS}; the app supports iOS ${IOS_DEPLOYMENT_TARGET}` : null;
}
