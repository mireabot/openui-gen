# Creating boundaries

The writer is the model that turns a saved sports dataset into a screen. It writes OpenUI Lang statements, one per line. Boundaries are the rules it must follow while it writes. Some are instructions in its prompt. Others are checks in the compiler that reject a statement outright.

This guide lists the boundaries in the current working tree, says what each one covers, and shows a short statement written without the rule and with it.

## Where the rules live

The writer's rules come from four places. Each one answers a different question.

1. **The system prompt** in `writerMessages` (`src/lang/compiler.ts:663`). These rules apply to every screen in any domain: how to name statements, where data comes from, coverage, text wrapping, tokens and size limits. The primitive signatures and token values are generated from the library. The prompt is the same for every screen and follow-up, so it stays one cache entry.
2. **The pack templates** in `SPORTS_SCREEN.templates` (`src/sports/screen.ts:151`). These are the sports rules: which component fits which data, how players and clubs show, and how much text to write. The sports component signatures follow them.
3. **The briefing** in the user turn (`src/sports/screen.ts:99`). It changes per request. For each answer it says whether the answer must be shown, its status, its note, whether it needs a source footnote, and which components fit its data.
4. **The compiler gate** in `validate` and `parseName` (`src/lang/compiler.ts:526`). It checks each statement as it streams in. A statement that breaks a gate rule never reaches the screen.

A prompt rule asks. A gate rule enforces. Several rules sit in both places: the prompt tells the writer the rule, and the gate rejects the statements that break it anyway.

## What happens when the writer breaks a rule

1. The compiler rejects the statement and records the problem in the writer's own statement name.
2. After the first pass, the compiler makes one repair request. It lists unfinished parts, questions no part shows yet, and each rejected statement with its problems and the argument order of the components it names.
3. After repair, every required question that is still not shown gets a default part built by the server (`fallback` in `src/sports/screen.ts:48`).

A prompt-only rule has no such path. If the writer ignores it, the statement is admitted and the screen shows the result.

## Rules for every screen

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

### Every required question is shown

Source: system prompt and briefing, enforced by coverage.

A question counts as shown when a part reads its answer content under `d.answers.<id>`. An answer marked unavailable counts only when a part reads its `note`. Reading only `title` or `status` does not count.

Without the rule, the writer shows the match and the market value chart but skips unavailable injury news in `q3`. Repair asks for `q3`. If the writer still skips it, the server adds its default warning note.

With the rule:

```text
injuries = Note(d.answers.q3.note, "warn", d.answers.q3.title)
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

## Adding a boundary

Put a new rule where its scope is:

- A rule for any screen in any domain goes in the system prompt in `writerMessages`. Keep anything that varies out of it, so the cache entry stays shared.
- A sports rule goes in `SPORTS_SCREEN.templates`.
- A rule about one answer's data goes in `briefing`.
- A rule that must never be broken goes in the gate: `validate` for any domain, or the pack's `refuses` for one domain. Its message is what the writer reads in repair, so name the fix in it, as the TeamPoints message does.

Write the rule as an instruction with the exact call when there is one. The icon-led row rule includes the full statement to copy.

## Why it is split this way

The code comments give some reasons. The compiler never throws for writer behaviour: it rejects statements, drops unfinished parts and fills gaps with default parts. The prompt comment says the system prompt is fixed so it stays one cache entry. The `refuses` comment says a hand-built record table loses the card's total and rank.

The repository does not say why most sports rules are prompt-only rather than gate checks. A likely reason is that rules about taste, such as less text or icon-led rows, have no clear test a statement can fail. That is an inference from the code. The evidence for this guide is the working tree and git history. Recorded generation runs were not reviewed.
