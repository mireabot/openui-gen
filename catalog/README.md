# Component schema index

What clients load to render OpenUI programs. Generated; do not edit by hand.

```text
src/lang/primitives.ts ─→ src/lang/library.ts ─→ npm run openui:export ─→ openui/primitives.json
src/stocks/lang/screen.ts (templates) + eval/fixtures ─→ npm run openui:export ─→ openui/fixtures.json
SF Symbols.app ─→ npm run sf-symbols ─→ sf-symbols.json (icon allowlist the compiler checks)
```

- `openui/primitives.json`: each primitive's name and positional props with their roles, plus a digest
  of the lang-core schema. A renderer registers one view per name.
- `openui/fixtures.json`: one program per template variant with the recorded dataset it reads and the
  evaluated element tree a renderer must produce.

`npm run openui:export -- --check` fails when these are stale. `-- --ios <Resources dir>` also writes
them into the app.
