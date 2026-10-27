# Sports catalog and rendering audit

The six reusable sports components are indexed. Each expands into generic primitives before reaching either client. Component coverage does not establish visual equivalence with the source designs.

The source library is `ui-canvas/web/components/canvas/variations/sports-components/lib`. Its six components are MatchCard, TeamDetail, StatBar, Leaderboard, FixturesHeatmap, and StatsCard. `rating.tsx` is a shared helper. The MatchResult showcase uses MatchCard with scores.

## Coverage checks

Run `npm run check:sports-catalog` to check full and sparse compiler fixtures, primitive registration in both renderers, and the heatmap's grid and fill semantics.

To compare the index with the source library, run the same command with `-- --source <sports-components/lib directory>`. This catches newly added source components that have no template.

`npm run openui:export -- --check` checks catalog freshness. The native `OpenUIFixtureTests` compile the exported programs and compare their trees with the server's trees. These tests do not compare screenshots with the source design.

The preview's `/catalog` page renders the fixtures without a model or external research. It includes empty lists and generic ColorCell examples.

## Findings and changes

| Component | Result |
| --- | --- |
| FixturesHeatmap | Fixed wrapping text badges through generic ColorCell marks in a ten-column Grid. Win, loss, draw, and upcoming use separate palette fills. Header spacing is eight points. The source legend still has coloured swatches; the template retains its summary text. |
| TeamDetail | Indexed, with a different layout. The source uses a 20-point crest, name, and nickname on one line. The template uses a 40-point Avatar and a Row with a stacked subtitle. |
| MatchCard | Indexed. The template omits the fixed 96-point side column, vertical separator, footer separator, and minimum 44-point footer. Source reminder and card-press options are absent from the contract. |
| Leaderboard | Indexed. Optional rank numbers, the closing additional-items row, and custom monograms are absent. Header and list spacing differ. |
| StatsCard | Fixed the 13-point status badge to a 28-point semibold rating in a 42-point pill. The header now uses 17-point semibold text. Section dividers, 12-point header padding, 24-point rating and grid padding, and 24-point grid row gaps match the source defaults. Avatar initials and image treatment still differ. Optional rating sections and configurable columns remain absent from the contract. |
| StatBar | Indexed. The source has a four-point segment gap and a visible empty track for zero against zero. The shared SplitBar uses a two-point gap and no visible segment for an empty total. |

The web preview originally inherited Geist from its application shell. The shell and OpenUIPreview now use the same SF system font stack as the source canvas. SwiftUI already uses system typography. The preview no longer downloads shell fonts from Google Fonts.

## Generic cell contract

`ColorCell(label, fill, color?, size?)` draws one blank square with a four-point corner radius. The label supplies accessibility text. Fill chooses a closed palette token. An optional data colour overrides fill with a validated six-digit hex value. Size defaults to the available width, or selects a fixed 12-, 24-, or 32-point square.

Grid supports one through twelve equal columns. No renderer interprets football outcomes. The heatmap record carries the paint decision in `results[].fill`.

The updated heatmap contract replaces `results[].tone` with `results[].fill`. Existing primitive programs containing Badge remain valid. A previously saved heatmap record needs the new fill field before the server can expand it through the updated template.

The updated StatsCard contract adds `rating.fill` and `rating.ink`. These explicit paint tokens preserve the source rating brackets without putting rating thresholds inside either renderer. Saved records need both fields before re-expansion. Previously expanded programs remain valid because new primitive arguments are optional and appended.

Native ColorCell rendering tests check square geometry, four actual palette fills, and hex override behavior. Native Badge rendering tests check the regular 24-point height, large 42-point height, and plain 34-point height. Compiler fixtures cover high, mid, low, and unavailable ratings.

Skeleton frames retain Stack padding and Grid row spacing across serialization and both renderers. This preserves the corrected card sections while the response streams.

## Verification limits

Verification passed with `npm run check:all`, a production preview build through `npm --prefix preview run build -- --webpack`, and the complete native suite. The native run passed 41 tests across 12 suites, including 21 parameterized compiler fixtures and rendering geometry checks.

The audit compares source code, generated contracts, compiler trees, and selected runtime geometry and paint. A complete screenshot comparison across both platforms and every source option has not been established. The remaining differences above prevent an exact-parity claim.
