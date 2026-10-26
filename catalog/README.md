# Component schema index

What clients load to render OpenUI programs. Generated; do not edit by hand.

```text
src/lang/primitives.ts ─→ src/lang/library.ts ─→ npm run openui:export ─→ openui/primitives.json
SF Symbols.app ─→ npm run sf-symbols ─→ sf-symbols.json (icon allowlist the compiler checks)
```

- `openui/primitives.json`: each primitive's name and positional props with their roles, plus a digest
  of the lang-core schema. A renderer registers one view per name; the iOS app bundles this file.
- `openui/sports-components.json`: the Sports component index (purpose, when to use, data contract).
- `openui/fixtures.json`: the compiler parity suite from `scripts/openui-fixtures.ts`. Each fixture is a
  program in the shape the server streams, its dataset, and the tree lang-core evaluates. Every Sports
  component appears over a full and a sparse record, plus plain @Each, member-read and null programs.
  The iOS `OpenUIFixtureTests` compiles each one and must produce the same tree.

`npm run openui:export -- --check` fails when any of them is stale. `-- --ios <Resources dir>` also writes it
into an app's Resources.
