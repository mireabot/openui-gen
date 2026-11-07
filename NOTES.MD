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
