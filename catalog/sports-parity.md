# Sports catalog and rendering audit

The 18 reusable sports components are indexed. Each expands into generic primitives before reaching either client. Component coverage does not establish visual equivalence with the source designs.

The index includes ClubTimeline, MatchCard, TeamDetail, StatBar, Leaderboard, FixturesHeatmap, StatsCard, TeamPoints, LeagueStanding, MatchTopPlayers, PlayerValue, MetricBars, PlayerMetrics, PlayersMetric, SeasonPodium, RecordTable, InjuryReport and InjuryList. The MatchResult showcase uses MatchCard with scores.

## Coverage checks

Run `npm run check:sports-catalog` to check full and sparse compiler fixtures, primitive registration in both renderers, and the heatmap's grid and fill semantics.

`npm run openui:export -- --check` checks catalog freshness. The native `OpenUIFixtureTests` compile the exported programs and compare their trees with the server's trees. These tests do not compare screenshots with the source design.

The preview's `/catalog` page renders the fixtures without a model or external research. It includes empty lists and generic ColorCell examples.

`npm run check:writer-relevance` checks unique contract fields and compiles every component after player enrichment. `npm run probe:writer` separately calls the configured model on 24 request cases, checking component selection, requested data, irrelevant context and compiler diagnostics. See [Writer relevance](../WRITER_RELEVANCE.md) for the goal and audit limits. These probes do not measure upstream planning or feed coverage.

PlayerMetrics keeps player identity in `kind` and time-series mode in `seriesKind`. The latter must be `cumulative` or `period`; player enrichment must not overwrite it.

## One place for each fact

A club with a logo passes `color: "clear"`, set by `fillClubMarks`, so a crest has no fill, and a crest is not clipped to a circle. A club without a logo keeps its colour for the monogram, and a player keeps the disc colour behind the photo.

Match squad IDs supply player photos before individual search. Feed profiles survive dataset shaping,
and enrichment restores omitted photo fields. Player avatars render nothing when the URL is absent
or the image fails to load. The surrounding name and statistics remain visible. Club monograms remain available.

Prepared match comparisons keep their `statBars` records through dataset design. Every comparison
uses the same StatBar contract, including possession, shots, corners, saves, fouls, and cards.

`lockFacts` in `src/sports/components.ts` runs on the dataset before the writer sees it. The same record in two places stays in the first. Heatmaps that together cover the whole season a TeamPoints card shows are removed; a heatmap of part of a season stays. TeamPoints drops its rank when a LeagueStanding is present. A trace's `fact-lock` entry lists what was removed.

## Findings and changes

| Component | Result |
| --- | --- |
| FixturesHeatmap | The server sets the columns from the result count: 10 up to 20 results, then half the count (at most 24), so a whole season stays in two rows with smaller squares. Fixed wrapping text badges through generic ColorCell marks in a ten-column Grid. Win, loss, draw, and upcoming use separate palette fills. Header spacing is eight points. The source legend still has coloured swatches; the template retains its summary text. |
| TeamDetail | Indexed, with a different layout. The source uses a 20-point crest, name, and nickname on one line. The template uses a 40-point Avatar and a Row with a stacked subtitle. |
| MatchCard | Indexed. The template omits the fixed 96-point side column, vertical separator, footer separator, and minimum 44-point footer. Source reminder and card-press options are absent from the contract. |
| Leaderboard | Indexed. Optional rank numbers, the closing additional-items row, and custom monograms are absent. Header and list spacing differ. |
| StatsCard | Fixed the 13-point status badge to a 28-point semibold rating in a 42-point pill. The header now uses 17-point semibold text. Section dividers, 12-point header padding, 24-point rating and grid padding, and 24-point grid row gaps match the source defaults. Avatar initials and image treatment still differ. Optional rating sections and configurable columns remain absent from the contract. |
| TeamPoints | The title comes from the data. `Pld` means matches played. Venue labels lead their column; all seven numeric headers and values trail theirs. An explicit empty grid cell reserves the venue header. A hand-built table is refused where this card fits. The source has a venue icon and a wider venue column. The template uses equal columns and text venue names. Non-negative goal difference uses neutral ink. |
| LeagueStanding | Indexed. Rank numbers have no fixed column, so a name moves slightly where ranks cross from one digit to two. ESPN has no venue ranks, so the venue line carries points and record only. `showVenues` hides that line when TeamPoints is on the same screen. |
| SeasonPodium | Indexed. Numerals are Text in their medal colour, at the title1 and title2 roles where the source has 36 and 22 points. Avatars show the logo on a light disc and carry no elevation, because Avatar has no shadow prop. Columns are equal widths. |
| MatchTopPlayers | Indexed. Rows follow the count the request asks for. A side with fewer players leaves its cell empty through `present`. Goals, assists and shots come from ESPN's `match` feed. Ratings come from FotMob's `matchDetails` (`matchFacts.topPlayers`, five a side), found by day, score and club name, and the match still answers without them. |
| PlayerValue | Built by the server from FotMob's `marketValues`, without the schema stage. A StepTimeline primitive holds the scrub state, because the header reacts to it. It has no card, and prices on the y axis are its only axis. The iOS line and scrub follow the SwiftUX Win Probability Chart (Kalshi): hold 0.1 s to scrub so the screen still scrolls, a dotted line, a haptic on each tick, a dim right of the finger and a draw-in on appear. The web keeps a plain scrub. Values are euros, as FotMob reports them. |
| ClubTimeline | All three leagues. Soccer careers come from research; NFL and NBA careers from the `athlete` feed's `career`, built by `careerOf` from ESPN's athlete stats: one spell per run of seasons with a team, a mid-season trade starting the next, dates as seasons ("2012-13 – 2020-21"), no loans and no stats. A season with no stats (a year out injured, a practice squad) has no row, so it is not in the career. |
| InjuryReport | Indexed, from the picked injury-report/countdown. The schema stage writes the league's status, an ISO return date or a note, and the source; `settleInjuries` turns them into the badge ("Injured Reserve" → IR), the wait counted from today ("31 days", "Tomorrow") and the date. A past date counts as no date. The band-aid is the Avatar's mark (`mark: "bandage.fill"`, `markTone: "bad"`): a filled disc over the bottom-right corner, as in the source. Its ring is always the card surface, so on the bare screen (InjuryList) it reads as a faint edge rather than a cutout. Day-to-day is `warn`, because the tone set has no info blue. |
| InjuryList | Indexed, from the picked injury-report/card-or-row. Rows at 40 with "position · team", and "Back Nov 8 · source" indented under the name by a 40 Spacer. Same mark and tone notes as InjuryReport. ESPN's `injuries` feed has no source field: `reportSource` reads it from the note's byline, which names one in about 40% of rows. ESPN's return date is often just the next game day, so "Back in 3 days" can promise more than the team does. |
| StatBar | Indexed. The source has a four-point segment gap and a visible empty track for zero against zero. The shared SplitBar uses a two-point gap and no visible segment for an empty total. |

The web preview originally inherited Geist from its application shell. The shell and OpenUIPreview now use the same SF system font stack as the designs. SwiftUI already uses system typography. The preview no longer downloads shell fonts from Google Fonts.

## Generic cell contract

`ColorCell(label, fill, color?, size?)` draws one blank square with a four-point corner radius. The label supplies accessibility text. Fill chooses a closed palette token. An optional data colour overrides fill with a validated six-digit hex value. Size defaults to the available width, or selects a fixed 12-, 24-, or 32-point square.

Grid supports one through twelve equal columns. No renderer interprets football outcomes. The heatmap record carries the paint decision in `results[].fill`.

The updated heatmap contract replaces `results[].tone` with `results[].fill`. Existing primitive programs containing Badge remain valid. A previously saved heatmap record needs the new fill field before the server can expand it through the updated template.

StatsCard is a short card (header, then the rating when there is one) followed by a scroll rail of stat cards, each as wide as its content and at least 124 (Rail minWidth), so a value or label never wraps, every card keeps the same height and a short one is not tight. The server sets `rating.show` and `showStats`, so a part with no data is not shown.

The updated StatsCard contract adds `rating.fill` and `rating.ink`. These explicit paint tokens preserve the source rating brackets without putting rating thresholds inside either renderer. Saved records need both fields before re-expansion. Previously expanded programs remain valid because new primitive arguments are optional and appended.

Compiler fixtures cover high, mid, low, and unavailable ratings.

Skeleton frames retain Stack padding and Grid row spacing across serialization and both renderers. This preserves the corrected card sections while the response streams.

## Verification limits

Verification passed with `npm run check:all`, a production preview build through `npm --prefix preview run build -- --webpack`, and the native streaming and compiler tests. The app keeps no UI tests, so native rendering geometry is not checked automatically.

The audit compares source code, generated contracts, compiler trees, . A complete screenshot comparison across both platforms and every source option has not been established. The remaining differences above prevent an exact-parity claim.
