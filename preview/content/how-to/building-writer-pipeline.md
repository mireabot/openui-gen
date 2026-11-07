# Building the writer pipeline

The writer is the model that turns a saved dataset into OpenUI Lang statements. This guide follows the writer from its prompt to a finished screen. It lists the rules the writer follows, where each one lives, and which ones the compiler enforces. Most of it covers what happens after the model writes: how the compiler checks each statement, how it decides which questions are shown, how it asks for one repair, and how you verify the result.

The compiler validates the contract. It does not validate relevance. A statement can call the wrong component with a valid record, and the compiler admits it. Relevance is checked by the writer before it answers and by the relevance probe after you change the prompt.

## Follow one statement

1. `compose` in `src/sports/ask.ts:207` calls `compileScreen` (`src/lang/compiler.ts:144`) with the dataset values, the required questions and the writer.
2. `writerMessages` (`src/lang/compiler.ts:671`) builds two turns. The system turn holds the rules, the primitive signatures, the token values and `SPORTS_SCREEN.templates`. The user turn holds the required question ids, the request and the briefing (`src/sports/screen.ts:101`).
3. The writer streams text. `StatementStream` (`src/lang/compiler.ts:703`) splits it into statements at newlines outside brackets and strings.
4. `admit` (`src/lang/compiler.ts:254`) checks each statement as soon as it arrives. A rejected statement is recorded under the writer's own name.
5. A part is emitted once its part statement and every sub-statement it references are admitted. The compiler renames it to `pickN` and writes `root` itself.
6. After the first pass, the compiler looks for unfinished parts, required questions no part shows, and rejected statements. If it finds any, it sends one repair request.
7. `finish` (`src/lang/compiler.ts:322`) adds a default part for each required question that is still not shown.

## Know where the rules live

The writer's rules come from four places. Each one answers a different question.

1. **The system prompt** in `writerMessages` (`src/lang/compiler.ts:671`). These rules apply to every screen in any domain: how to name statements, where data comes from, coverage, text wrapping, tokens and size limits. The primitive signatures and token values are generated from the library. The prompt is the same for every screen and follow-up, so it stays one cache entry.
2. **The pack templates** in `SPORTS_SCREEN.templates` (`src/sports/screen.ts:147`). These are the sports rules: which component fits which data, how players and clubs show, and how much text to write. The sports component signatures follow them.
3. **The briefing** in the user turn (`src/sports/screen.ts:101`). It changes per request. For each answer it says whether the answer must be shown, its status, its note, whether it needs a source footnote, and which components fit its data.
4. **The compiler gate** in `validate` and `parseName` (`src/lang/compiler.ts:534`). It checks each statement as it streams in. A statement that breaks a gate rule never reaches the screen.

A prompt rule asks. A gate rule enforces. Several rules sit in both places: the prompt tells the writer the rule, and the gate rejects the statements that break it anyway.

## Write the reasoning into the prompt

The writer picks a component for each requested fact group. The system prompt tells it how (`src/lang/compiler.ts:685`):

- Choose by the requested subject, facts, time period and comparison, using each component's `useWhen`.
- A data-shape match only identifies a candidate.
- When a record fits a component that directly answers the request, call that component and move to the next fact group.
- Compose from primitives only for requested content that no component can express.

The briefing lists each answer's data-shape candidates with their `useWhen` text, under the heading `data-shape candidates (choose by relevance to the request, not by order)`. `placements` (`src/sports/components.ts:967`) finds the candidates. It matches records against component contracts, so it finds shape only.

Before it answers, the writer runs a silent check (`src/lang/compiler.ts:686`): the selected components answer the original request, every requested available fact is visible, unrelated context is omitted, and every referenced sub-statement is defined and reachable. The check is prompt only. Nothing in the compiler enforces it.

To change how the writer picks a component, edit the component's `useWhen` in `src/sports/components.ts`. Name the boundary against its neighbour in the same sentence, as StatsCard does: "not the game's team result (MatchCard)".

### Same records, different requests

| Request | Records supplied | Selected | Rejected candidate and the `useWhen` clause |
| --- | --- | --- | --- |
| Show only Egor Demin's individual key statistics from his latest game. | `game`, `player` | `StatsCard(d.answers.q1.player)` | MatchCard: "not a specific player's performance (StatsCard)" |
| Where does Egor Demin play now? Name his current team only. | `profile`, `career`, `upcoming` | Primitives reading `profile.team` | ClubTimeline: "not a current-club-only question" |
| Compare Egor Demin's points per game this season versus last season, including games played. | `comparison`, `player` | `MetricBars(d.answers.q1.comparison)` | StatsCard: "not ... comparisons across subjects or seasons (MetricBars)" |
| Show Cole Palmer's goals, assists and chances created by matchweek through this season. | `progression`, `totals` | `PlayerMetrics(d.answers.q1.progression)` | StatsCard: "not ... period-by-period progression (PlayerMetrics)" |
| Who are the top three Premier League goalscorers? Show their ranked order. | `ranking`, `comparison` | `Leaderboard(d.answers.q1.ranking)` | MetricBars: used "whenever the request asks to compare them". This request asks for order. |
| List the supplied honours with their years. Keep it compact. | `honours` | Primitives: icon-led rows | No component fits. |

## Validate each statement

`admit` runs the checks in this order. The first check that fails stops the statement.

1. `parseName` (`src/lang/compiler.ts:431`) checks the name. `root` and `d` give `reserved-name`. A `pickN` that is not editable gives `locked-part`.
2. `parseStatement` parses one complete statement. An unclosed call gives `invalid-statement` with `Incomplete statement`.
3. `validate` (`src/lang/compiler.ts:534`) asks the pack's `refuses` first. Then it expands component calls to primitives with `expandCall` (`src/lang/templates.ts`) to check them, and keeps the call in the program. A call takes its record as a data reference, then only the params the component declares, such as StatsCard's `header` flag.
4. `validate` walks every node, once per `@Each` item. It checks sibling references, the writer's primitive set, slots, argument counts, required props, data references, prop schemas and SF Symbol names.
5. `admit` checks the size limits: 12 parts, 16 statements per part, 600 nodes per part and 2,400 nodes per screen.

| Statement | Code | Message |
| --- | --- | --- |
| `stats = MetricBars({ columns: [] })` | `template` | `MetricBars takes a data reference first (d.<path> or an @Each item)` |
| `stats = Chart(d.answers.q1.comparison)` | `template` | `Chart is neither a primitive nor a template` |
| `stats = StatsCard(d.answers.q1.player, "compact")` | `template` | `StatsCard takes only its data record` |
| `stats = Text(d.answers.q1.player.points, "body")` | `type-mismatch` | `Missing data path d.answers.q1.player.points` |
| `stats = StatsCard(d.answers.q1.player` | `invalid-statement` | `Incomplete statement` |

The rules for every screen below show more gate messages, each with the statement that triggers it.

The `MetricBars({ columns: [] })` row is the failure from the full Demin rerun in `WRITER_RELEVANCE.md`. Dataset shaping timed out, so the writer built records inside component calls. Component calls take only data references.

## Rules for every screen

These rules are in the system prompt for any domain. Most are also gate checks, so a statement that breaks one never reaches the screen.

### Named parts, nothing the server owns

Source: system prompt, enforced by the gate.

Each part is one statement with a lowerCamel label. A large part splits into sub-statements named `label_name`. The writer never writes `root`, `d`, `Screen`, queries, mutations, state or actions, and a part never references another part. The gate rejects these with `reserved-name`, `foreign-ref`, `forbidden-runtime` and an actions error.

Without the rule:

```text
root = Screen([table, scorers])
table = Card([scorers_list])
```

`root is written by the server`. `scorers_list is not a sub-statement of table; parts cannot contain other parts`.

With the rule:

```text
table = Card([table_rows])
table_rows = Stack("v", 12, [...])
```

### Data comes from `d`

Source: system prompt. Data props are enforced by the gate. Copy is prompt only.

A data prop must reference the dataset: `d.<path>` or an `@Each` item. Typed figures are rejected. Copy, such as titles and labels, is plain text, and the writer must not invent figures in it. The gate cannot check copy, so a figure typed into a title gets through.

Without the rule:

```text
haaland = Row("Haaland", null, null, Number(24, "decimal", "body"))
```

`Number.value must reference data (d.<path> or an @Each item)`.

With the rule:

```text
scorers = Stack("v", 12, [@Each(d.answers.q1.rows, "r", Row(r.name, null, null, Number(r.goals, "decimal", "body")))])
```

### Text shows in full

Source: system prompt and pack templates. Prompt only.

A Text that reads a summary or a note has no `lines`. Names, titles and descriptions get `lines` 2, never 1. Use a Stack with Text instead of a Row when the Row's two-line limit would cut a description. Never shorten a sourced sentence with an ellipsis.

Without the rule:

```text
outlook = Text(d.answers.q3.summary, "body", null, null, 1)
```

The summary stops after one line.

With the rule:

```text
outlook = Text(d.answers.q3.summary, "body")
```

### Only the vocabulary the writer is given

Source: system prompt, enforced by the gate.

The writer may use only writer primitives. That list drops root and chrome primitives, anything that needs an action, and input controls that edit data or hold state. Token props accept only the listed token values. Arguments are positional, so a later optional argument needs `null` for each one before it. Icon names must be SF Symbols that exist on iOS 18.

Without the rule:

```text
honours = Icon("trophy.circle.badge", 24, "gold")
```

The symbol is not an SF Symbols name, and `gold` is not an ink token.

With the rule:

```text
honours = Icon("trophy.fill", 24, "yellow")
```

### Size limits

Source: system prompt, enforced by the gate.

A screen has at most 12 parts. A part has at most 16 statements and 600 nodes after `@Each` expansion. A screen has at most 2,400 nodes.

Without the rule, a writer builds a stats table with one sub-statement per row, and the 17th statement is rejected with `At most 16 statements per part`.

With the rule:

```text
stats = RecordTable(d.answers.q2.table)
```

### Follow-ups leave the saved screen alone

Source: system prompt for follow-ups, enforced by the gate and coverage.

On a follow-up, saved parts stay as they are and already show their answers. The writer may rewrite only the parts it is told are editable, by their own `pickN` names. New parts use new labels. A new part that only repeats answers the saved screen shows is dropped.

Without the rule:

```text
pick1 = Card([...])
```

`pick1 is not editable in this turn; name new parts with a lowercase label`.

With the rule:

```text
palmerGoals = Stack("v", 12, [@Each(d.answers.q4.rows, "g", ...)])
```

## Sports rules

These rules come from the sports pack and the briefing. All but TeamPoints are prompt only, so a statement that ignores one is still admitted.

### Match stats use StatBar

Source: pack templates. Prompt only.

Every item of a match's `statBars` renders with StatBar, including shots, corners, saves, fouls and cards. The writer must not substitute Progress or a row of figures.

Without the rule:

```text
stats = Stack("v", 12, [@Each(d.answers.q1.match.statBars, "s", Progress(s.home, "bar", null, s.label))])
```

One side's figure shows as a bar, and the comparison is lost.

With the rule:

```text
stats = Stack("v", 12, [@Each(d.answers.q1.match.statBars, "s", StatBar(s))])
```

### A team's record uses TeamPoints

Source: pack `refuses`, enforced by the gate. This is the one sports rule the compiler enforces.

When an answer fits TeamPoints, a statement that reads its `home` or `away` record by hand is rejected. The code comment gives the reason: the writer's copy loses the card's total and rank.

Without the rule:

```text
record = Grid("8", 4, [Text(d.answers.q2.points.home.won, "footnote"), ...])
```

`This reads the home and away record by hand. Call TeamPoints(d.answers.q2.points) instead`.

With the rule:

```text
record = TeamPoints(d.answers.q2.points)
```

### Each fact appears once

Source: pack templates. Prompt only.

When questions overlap, each figure or record shows once on the screen. A latest match and a list of recent results often contain the same game.

Without the rule, the screen shows Chelsea 2, Arsenal 1 in the match card and again as the first row of recent results.

With the rule, the match card shows it, and the results list starts with the game before.

### Missing data is skipped

Source: pack templates. Prompt only.

If an answer lacks a field, the writer leaves that piece out. It writes no Note or Text saying the data is missing, and it types no figure, name or source of its own. An answer whose status is unavailable still shows its note.

Without the rule:

```text
assists = Note("Assist data is not available for this match.", "neutral")
```

With the rule, there is no statement. The scorer row shows without an assist line.

### Named items are icon-led rows

Source: pack templates. Prompt only.

Prefer compact icon-led rows to tables and plain lists. For named things with a short detail, such as trophies, awards and honours, draw an icon, then the count, name and detail, in a `Stack("v", 16)` with no Card and no dividers. Use RecordTable only when the items share several figures in columns. No column headers.

Without the rule:

```text
honours = RecordTable(d.answers.q4.trophies)
```

With the rule:

```text
honours = Stack("v", 16, [@Each(d.answers.q4.trophies, "x", Stack("h", 12, [Icon("trophy.fill", 24, "yellow"), Stack("v", 0, [Stack("h", 4, [Text(x.count, "body", "semibold"), Text(x.name, "body", null, null, 2)]), Text(x.detail, "body", null, "secondary", 2)])], "start"))])
```

### Every player and club shows its mark

Source: pack templates. Prompt only.

A record with kind `player` or `club` gets an Avatar beside its name wherever the name appears. Goal scorers and assists read `scorerPlayer` and `assistPlayer` for their name and photo. The writer never borrows a photo from another list by position. A missing photo drops the Avatar and keeps the text.

Without the rule:

```text
scorers = Stack("v", 12, [@Each(d.answers.q1.goals, "g", Row(g.scorer, null, Avatar(g.scorer, 40, d.players[0].logo)))])
```

Every scorer gets the first player's photo.

With the rule:

```text
scorers = Stack("v", 12, [@Each(d.answers.q1.goals, "g", Row(g.scorerPlayer.name, null, Avatar(g.scorerPlayer.name, 40, g.scorerPlayer.logo, null, null, g.scorerPlayer.color, g.scorerPlayer.kind)))])
```

### Less text, no repeats

Source: pack templates. Prompt only.

Every text says something new. A Section title and a list title must not say the same thing, and a summary must not restate its title. Prefer a short title and the data. Keep parts in the order the user asked for them.

Without the rule:

```text
scorers = Section("Top scorers", [Text("Top scorers this season", "headline"), scorers_list])
```

With the rule:

```text
scorers = Section("Top scorers", [scorers_list])
```

### Sourced answers show a footnote

Source: briefing. Prompt only.

When an answer has a `source`, the briefing tells the writer to show `d.answers.<id>.source` as a footnote.

With the rule:

```text
outlook_source = Text(d.answers.q3.source, "footnote", null, "tertiary")
```

## Check coverage

A part shows a question when it reads that answer's content. `shows` (`src/sports/screen.ts:20`) decides:

- Reads of `status`, `question`, `title`, `source`, `asOf` and `team` do not count.
- An unavailable answer counts only when a part reads its `note`.

The compiler derives the reads from the statements. It never trusts what the writer says it shows.

## Repair once, then fall back

If the first pass leaves gaps, the compiler appends one user turn to the same messages:

```text
Repair. Write only the statements that finish these parts or show these questions; do not repeat admitted statements.
Unfinished parts:
stats: missing stats_list
Questions not yet shown (read their answer data):
q1: Show only Egor Demin's individual key statistics from his latest game.
Rejected statements. Rewrite each one, changing only what its problems name:
stats = MetricBars({ columns: [] })
Problem: MetricBars takes a data reference first (d.<path> or an @Each item)
```

Each section appears only when it has entries. For a rejected statement, the message adds the argument order of each primitive its problems name.

After repair, `finish` drops unfinished parts with `part-incomplete`. Each required question that is still not shown gets a default part from `fallback` (`src/sports/screen.ts:50`) and a `question-fallback` issue: `q1 was not shown by the writer; the server added its default part`. The default part uses the first fitting component it finds. It does not apply the writer's relevance rules.

## Verify the writer

Run the offline audit. It makes no model calls and is part of `npm run check:all`.

```sh
npm run check:writer-relevance
```

It checks that every component compiles from its catalog sample after player-image enrichment, that no contract repeats a field, and that each probe's expected component has a fitting record.

Run the live probe after you change the writer prompt, a `useWhen` or a contract. It uses the configured model and generation mode.

```sh
npm run probe:writer -- --output=/private/tmp/writer-relevance.json
npm run probe:writer -- --case=player-performance --case=current-team
```

Each probe compiles one request against prepared records. It fails on any of these:

- An expected component is not called.
- A forbidden component is called.
- A required data path is not read.
- An unrequested data path is read.
- The compiler reports any issue.
- A fallback part is added.

The probes use prepared datasets. They do not test the planner, the feed adapters or dataset shaping, and a pass is not a production accuracy estimate.

## Add a boundary

Put a new rule where its scope is:

- A rule for any screen in any domain goes in the system prompt in `writerMessages`. Keep anything that varies out of it, so the cache entry stays shared.
- A sports rule goes in `SPORTS_SCREEN.templates`.
- A rule about one answer's data goes in `briefing`.
- A rule that must never be broken goes in the gate: `validate` for any domain, or the pack's `refuses` for one domain. Its message is what the writer reads in repair, so name the fix in it, as the TeamPoints message does.

Write the rule as an instruction with the exact call when there is one. The icon-led row rule includes the full statement to copy.

## Why it is split this way

Validation proves a screen is well formed. It cannot prove it is the right screen. Every gate check has a test a statement can fail: a name, a path, a type or a count. A wrong component with a valid record passes all of them, so relevance lives in the prompt and is measured by contrast probes.

The code comments give other reasons. The prompt comment says the system prompt is fixed so it stays one cache entry. The `refuses` comment says a hand-built record table loses the card's total and rank.

The evidence for this guide is the working tree and git history. Recorded generation runs were not reviewed.
