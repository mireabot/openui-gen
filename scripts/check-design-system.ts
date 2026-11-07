/**
 * Design system names. Tailwind drops a class it does not know without an error, so a component
 * written with the old Kino names (`text-kino-ink-secondary`, `--color-kino-*`), or a token that
 * does not exist, builds fine and renders unstyled. This fails instead:
 * - no file in the repo may say "kino": the design system has no other name;
 * - every `*-ds-<token>` class and `var(--color-ds-<token>)` in the preview must name a token
 *   (or an `@utility`) defined in preview/app/design-system.css.
 * When bringing a component in (from a canvas exploration or another branch), rename `kino` to
 * `ds` in its classes and import `@/components/catalog/design-system`.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const self = path.relative(root, fileURLToPath(import.meta.url));
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\n").filter(file => file && file !== self && !/\.(png|jpe?g|gif|webp|ico|mp4|mov|ttf|otf|woff2?)$/i.test(file));
const read = (file: string) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return ""; } };
const where = (file: string, text: string, index: number) => `${file}:${text.slice(0, index).split("\n").length}`;

const kino = tracked.flatMap(file => {
  const text = read(file);
  return [...text.matchAll(/kino/gi)].map(match => `${where(file, text, match.index)}  ${match[0]}`);
});
assert.deepEqual(kino, [], `The design system is not called Kino. Rename these (classes kino → ds, the theme kino → default):\n${kino.join("\n")}`);

const css = read("preview/app/design-system.css");
const defined = new Set([...css.matchAll(/--color-ds-([a-z0-9-]+)\s*:/g)].map(match => match[1]!));
/** Whole classes the file defines itself, such as `@utility bg-ds-surface-brand-gradient`. */
const utilities = new Set([...css.matchAll(/@utility\s+([a-z0-9-]+)/g)].map(match => match[1]!));
assert.ok(defined.size > 0, "preview/app/design-system.css defines no --color-ds-* tokens");
// A utility class (text-, bg-, border-t-, ring-offset-, …) or a CSS var naming a ds colour token.
const uses = /(?<![-\w])(?:[a-z]+-)+ds-([a-z0-9]+(?:-[a-z0-9]+)*)|var\(--color-ds-([a-z0-9-]+)\)/g;
const unknown = tracked.filter(file => file.startsWith("preview/") && /\.(tsx?|css)$/.test(file)).flatMap(file => {
  const text = read(file);
  return [...text.matchAll(uses)].flatMap(match => {
    const token = match[1] ?? match[2]!;
    return defined.has(token) || utilities.has(match[0]) ? [] : [`${where(file, text, match.index)}  ${match[0]}`];
  });
});
assert.deepEqual(unknown, [], `These name no token in preview/app/design-system.css, so Tailwind renders them unstyled:\n${unknown.join("\n")}`);

console.log(`design system: no Kino names, ${defined.size} ds colour tokens, every ds class and var resolves`);
