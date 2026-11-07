# Component names on the wire

The program now calls Sports components by name, as OpenUI Lang intends. Before, the compiler expanded every call to primitives, so the wire, saved documents and the preview's program panel showed a 40-line `Card(...)` where the writer had written `MatchCard(d.answers.q1.match)`. Now the program keeps the call:

```
pick1        = Section(d.answers.q1.title, [pick1_match, pick1_player], null, null, d.answers.q1.source)
pick1_match  = MatchCard(d.answers.q1.latestGame.match)
pick1_player = StatsCard(d.answers.q1.latestGame.player)
```

When no component fits, the writer still writes primitives, and the two kinds mix freely in one program.

## How it works

- **Templates are data.** `npm run openui:export` prints each component's `build` once over a `record` parameter and writes it to `templates` in `catalog/openui/sports-components.json` (`{ name, params, body }`, about 13 KB for all 18). `build` stays the only definition. `openui:export -- --check` keeps the file fresh.
- **The compiler checks the expansion and keeps the call.** `validate` in `src/lang/compiler.ts` expands each call to check every node, count the budget and collect the reads for coverage. It admits the statement as written. `ScreenPack.expand` became `ScreenPack.definitions`. The fallback part calls the component by name too.
- **Every client expands before it evaluates.** `src/lang/templates.ts` holds the shared expander (`expandCall`, `expandExpr`, `expandProgram`). `programTree` takes the templates as a third argument. The preview expands in `OpenUIPreview`. On iOS, `OpenUICompiler` evaluates a template's body in a fresh scope with each parameter bound to its argument, mounted where the call sits. Element ids are the same as the expanded program's, so view identity holds.
- **Expansion can't capture an outer item.** The server and web expander renames a template's own `@Each` names to `<name><Template>` (`e` becomes `eLeaderboard`). Without that, `@Each(d.boards, "e", Leaderboard(e))` would read the wrong `e`. iOS gets the same result from the fresh scope.
- **The run carries its templates.** The stream sends a `templates` event with every definition before any program text. `done`, the saved document (`templates` in `SportsDocumentSchema`) and `GET /lang/sports/runs/:id` carry the ones the program uses. A saved screen replays with the templates it was drawn with. A follow-up recompiles kept parts with the current ones. Clients fall back to their bundled copy when a program arrives without templates.
- **Params, where they make sense.** A component may declare copy params after the record. A param is text or null, and null uses its `default`, an expression over `record`. The first one is `MetricBars(record, heading?)`. The writer sees params in the component signatures. Data stays a `d.` reference, and a number in a copy param is refused.

## Files touched

- `src/lang/templates.ts` (new): template types, the zod schema, and the expander.
- `src/lang/compiler.ts`, `src/lang/tree.ts`: check the expansion, keep the call, expand in `programTree`.
- `src/sports/components.ts`: `SPORTS_TEMPLATE_DEFS`, `SPORTS_TEMPLATES`, params on `build`, the MetricBars `heading` param, the index at version 2.
- `src/sports/screen.ts`: `definitions` and fallback parts that call components by name.
- `src/sports/ask.ts`, `src/sports/documents.ts`, `src/routes/sports.ts`: templates in results, documents, replays and the stream.
- `preview/components/primitives/openui-render.tsx`, `sports-live.tsx`, `preview/lib/imported-screen.ts`, `preview/lib/demo-screens.ts`: expansion in the preview, the `templates` event, and a demo that calls `MatchCard` and `StatsCard` by name.
- `ios/OpenUIGen/GenUI/Core/OpenUI/*`, `GenUIOpenUIRuntime.swift`, `OpenUIStreamService.swift`, `PasteScreenModel.swift`: template scopes, the `templates` event, archives and pasted screens.
- `scripts/check-templates.ts` (new, in `check:all`) and `OpenUIFixtureTests.swift`: parity, scope, params and bad calls.
- `catalog/openui/fixtures.json`: expanded fixture programs now use the renamed `@Each` names.
- `preview/next.config.ts`: resolves `./program.js`, which the preview now imports through `templates.ts`.
- `src/lang/compiler.ts`, `scripts/check-compiler.ts`: the compiler skips markdown fence lines. Before, each fence was reported as a `bad-name` issue.

## Verification

- `npm run check:all` passed, including the new `check:templates`. All 50 catalog samples, called by name, draw the same tree as their expanded programs.
- iOS: `xcodebuild clean test` passed 24 tests. `compilesComponentCallsByName` ran all 50 samples with the same trees and element ids as the expanded programs.
- The nested-game demo draws the same 47 nodes from the call form as it did from the expanded form.
- Live debug run of the Demin request (`e57dee37-4e4a-49eb-98e3-84517216d512`): 3 parts, no fallbacks, every question shown. The saved program reads `MatchCard(d.answers.q1.match)`, `MetricBars(d.answers.q2.bars, null)` and `StatsCard(d.answers.q3.card)`, and the document stores those three templates. The only issues were the two fence lines, fixed above.

## Still open

- Copy params exist only on MetricBars. Other components get them one at a time, when a request needs one.
- The writer still types source lines as Section copy (`"Source: ESPN · …"`) instead of reading `d.answers.<id>.source`. That predates this change.

# Writer relevance changes

- Made the writer select components by the original request and `useWhen`, then check the record contract. A direct match uses the component. Custom layouts cover requested content without a suitable component.
- Defined completeness as showing each requested available fact once, with valid calls and resolved sub-statements. Unrequested research stays out of the screen.
- Added each candidate's `useWhen` to the per-answer briefing and clarified that matching data shapes do not establish relevance.
- Tightened overlapping component definitions for player statistics, results, careers, valuations, rankings, comparisons and period progression.
- Removed contradictory generic root instructions from the writer prompt. Root handling itself is unchanged.
- Separated PlayerMetrics player identity, `kind`, from its time-series mode, `seriesKind`. The live baseline reproduced a compiler rejection caused by their previous shared field.
- Added a reusable offline catalog check and a live writer relevance probe. See `WRITER_RELEVANCE.md` for the sharpened task prompt, commands, findings and limits.

## Files touched

- `src/lang/compiler.ts`: writer system prompt and primitive signature assembly.
- `src/sports/screen.ts`: component relevance instructions and per-answer candidate definitions.
- `src/sports/components.ts`: `useWhen` boundaries and PlayerMetrics contract.
- `scripts/check-writer-relevance.ts`: catalog and real-model probes.
- `scripts/openui-fixtures.ts`: PlayerMetrics series mode.
- `preview/components/catalog/sports-components/metrics-data.json`: matching catalog sample data.
- `catalog/openui/sports-components.json` and `catalog/openui/fixtures.json`: regenerated catalog exports.
- `package.json`: offline audit in the full checks and a separate live probe command.
- `catalog/sports-parity.md`: current catalog coverage and relevance audit commands.
- `WRITER_RELEVANCE.md`: sharpened task and audit record.
- `NOTES.MD`: this change summary.

The local ignored `.env` remains configured for Codex 6.1 Sol at High effort from the preceding change.

## Verification

- The six-case baseline passed five cases. Its period-progression failure reproduced the shared `kind` field problem.
- All 24 refined live probes passed on Codex 6.1 Sol at High effort, with no repairs, compiler diagnostics or fallback parts.
- `npm run check:all` passed. Catalog exports are fresh, and `git diff --check` passed.
- Prepared-data probes do not test planning, the athlete adapter or the default renderer. Those earlier findings remain separate work.
- The exact full Demin request was rerun as `a5637a3d-fe33-4349-8b02-9e2b00021d09` and inspected in Chrome. It finished partial: planning stayed on topic, dataset shaping timed out after 300 seconds, the writer attempted unsupported inline records, and repair recovered the game statistics but lost the PPG comparison. The saved replay remains unchanged as evidence of that failure.
