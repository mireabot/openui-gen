# Writer relevance

The goal is to turn each requested fact group into the most specific suitable catalog component. A direct match requires both the right meaning and a valid data record. Once that match is established, the writer uses the component and moves to the next fact group. Requested content with no suitable component gets a custom layout from primitives.

## Sharpened task prompt

> Refine request-to-component matching in the existing sports writer. Keep the server's ownership of root and data binding unchanged.
>
> Start with original user requests, raw feed responses, saved datasets, exact writer messages and outputs, and compiler diagnostics. Separate planning mistakes, data loss, invalid component contracts, writer selection mistakes and fallback rendering. Do not infer weak model reasoning from an empty or failed provider call.
>
> Audit every component's `useWhen`. Define its subject, requested facts, time scope, granularity and subject count. Resolve overlapping meanings with explicit boundaries. Preserve existing component capabilities.
>
> For each requested fact group, have the writer internally check candidate relevance against the original request and the component's definition. A matching data shape identifies a candidate, not a selection. When the meaning and record contract both fit, call the most specific suitable component. Stop considering alternative layouts for that fact group. Use primitives only for requested content that no suitable component can express. Different fact groups may use different components or custom layouts.
>
> Update the writer system prompt and its per-answer briefing to enforce this process. Completeness means every requested available fact appears once. Related research is optional context. A match result cannot replace a player's individual performance. Every emitted component call must be valid, and every sub-statement reference must be defined and reachable.
>
> Verify with contrast cases that supply both relevant and irrelevant records. Test the same records under different requests. Check component calls, requested data reads, unwanted data reads, compilation, repairs and fallback use separately. Include current club versus club history, player performance versus game result, season comparisons versus period progression, rankings versus comparisons, and content that genuinely needs primitives.
>
> Report the failures reproduced, the changes, measured results and remaining gaps. Do not claim an accuracy improvement from passing fixtures or from fixing a contract failure alone. Leave the production acceptance threshold and any additional model-routing stage as separate product decisions.

## Evidence and method

A relevance audit needs more than checking whether components render. It checks whether the selected view answers the original request and whether its facts are visible.

The starting material is the original request and the complete saved trace. A final screenshot alone cannot show whether the planner changed the question, an adapter discarded data, the writer failed, or a default replaced its output.

The audit uses the real compiler, catalog fixtures and the selected model transport. The offline check compiles every component after player-image enrichment and rejects duplicate contract fields. The live probe checks all 18 catalog components and six additional relevance boundaries. Several cases include a fitting but unrelated component as context. These are test cases, not a production accuracy estimate.

```sh
npm run check:writer-relevance
npm run probe:writer -- --output=/private/tmp/writer-relevance.json
npm run probe:writer -- --case=player-performance --case=current-team
```

The live command uses the configured generation mode and account. Each report retains raw writer output, compiled program, selected calls, data reads, diagnostics and fallback counts. The live probe is separate from `check:all`; ordinary checks make no model calls.

## Findings

- The previous writer prompt made templates optional even when a catalog component directly answered the request. The per-answer briefing listed fitting calls without their `useWhen` definitions.
- Several definitions overlapped. StatsCard included any figures about one subject, while progression and comparison components described more specific cases. MatchCard did not explicitly distinguish a game result from one player's performance.
- Generated language instructions told the writer to emit root while the writer contract prohibited it. The prompt now derives only primitive signatures from the library. The compiler still owns root.
- PlayerMetrics used `kind` for both player identity and series mode. Player-image enrichment assigns `kind: "player"`, while MetricLines accepts `cumulative` or `period`. The contract now keeps player identity in `kind` and series mode in `seriesKind`.
- The six-case baseline on Codex passed player performance, current team, season comparison, ranked list and custom honours. The period-progression case selected PlayerMetrics correctly but hit the invalid `kind` contract. This does not establish a model-selection failure.

## Verification on November 6, 2026

All 24 live probes passed using `gpt-6.1-sol` at High effort. They produced no compiler diagnostics, repairs or fallback parts. The individual-performance probe emitted `StatsCard(d.answers.q1.player)` and did not read the supplied match result. The current-team probe read only the profile's team. The honours probe used primitives.

`npm run check:all` passed, including the new offline audit and catalog freshness check. These results demonstrate the tested selections and the contract correction. The baseline already selected player statistics correctly on Codex, so the results do not quantify a general accuracy improvement over the previous prompt.

## Limits

The original failed Demin run was a Claude debug run with no usable writer statements. Its default builder selected the first fitting component and omitted the StatsCard beside it. That failure is separate from the Codex baseline.

This change targets writer instructions, component definitions and the audit. It does not repair the planner's schedule interpretation, the athlete adapter's missing games-played column, or the fallback's first-component policy. The live relevance probes use prepared datasets and do not measure those upstream stages.

## Full Demin rerun

The exact original request was rerun through Codex on November 6. Run `a5637a3d-fe33-4349-8b02-9e2b00021d09` finished with status `partial` after 449 seconds.

The planner correctly selected athlete and game-log feeds without adding Nets fixtures. Dataset shaping then exceeded the 300-second call timeout, so the writer received raw feed records instead of prepared StatsCard and MetricBars records. The writer attempted inline objects in component calls, which only accept data references. Repair recovered the individual game statistics as primitives, but its inline ValueColumns data was also rejected. The fallback showed Demin's team and omitted the PPG comparison. Games-played counts were still absent from the adapter's data.

The replay was inspected in Chrome. Last-game statistics are visible, but the PPG comparison is missing. This run exposes a gap outside the prepared-data probes: after a shaping failure, the writer must use supported primitive data references rather than constructing records in calls. The failure is retained in the saved trace and CLI diagnostics; the replay has not been manually repaired.
