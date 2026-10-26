# Component schema index

What clients load to render OpenUI programs. Generated; do not edit by hand.

```text
src/lang/primitives.ts ─→ src/lang/library.ts ─→ npm run openui:export ─→ openui/primitives.json
SF Symbols.app ─→ npm run sf-symbols ─→ sf-symbols.json (icon allowlist the compiler checks)
```

- `openui/primitives.json`: each primitive's name and positional props with their roles, plus a digest
  of the lang-core schema. A renderer registers one view per name; the iOS app bundles this file.

`npm run openui:export -- --check` fails when it is stale. `-- --ios <Resources dir>` also writes it
into an app's Resources.
