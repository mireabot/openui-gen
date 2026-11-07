# How the data gets to the writer

Data aggregation collects the facts a screen needs into one saved dataset. OpenUI Sports uses the same pipeline for soccer, NFL, and NBA requests. League settings determine which feeds and presentation rules apply.

This guide describes the local changes on `unified-sports-aggregation`. Code references name files in the working tree. The new adapter and registry are not in the earlier published revision.

## One request becomes a dataset

1. The planner in `src/sports/plan.ts` identifies the subject and creates 1 to 5 questions. Each question gets an ID such as `q1`. It keeps the team, competition, period, and count the user requested. Web questions get 2 or 3 keyword queries before research starts.
2. `src/sports/feeds.ts` selects the structured provider for each league. `src/sports/research.ts` starts all questions concurrently. Each uses a structured feed, a soccer market value lookup, or web research.
3. The server collects each result under `answers.q1`, `answers.q2`, and so on. Answers carry a status and source attribution. A failed question becomes unavailable while the others continue.
4. The designer in `src/sports/dataset.ts` shapes complete answers into component fields and values. Prepared soccer market value charts and recent-scorer records skip this model step. The server validates each answer and enriches the dataset.
5. `src/sports/ask.ts` saves a `sports_dataset` snapshot and emits it before the writer starts. The writer composes a screen with references to saved values. It makes no research calls.

For example, a Chiefs request can use the match feed for the latest game, the gamelog feed for Mahomes' recent games, and web research for playoff outlook. Those answers use the same question IDs and snapshot format as a soccer request.

## What the league registry controls

`src/sports/leagues.ts` holds `LEAGUE_CONFIG`. Each entry specifies the ESPN URL path, supported feeds, season naming, competition format, default time zone, preferred statistics, research domains, and photo source.

The planner derives league routing instructions and missing-feed lists from this registry. NFL and NBA share `src/sports/espn-generic.ts`. Soccer retains its existing presenter in `src/sports/espn.ts` and its FotMob adapter. The shared result is an answer envelope with `values` and `source`. The values inside it depend on the feed.

Team identities include their sport when the directory removes duplicates. ESPN can reuse a numeric team ID across sports. Soccer clubs that appear in both a domestic league and a cup still appear once in the planner's directory.

## Which provider answers

`DATA_SOURCE=mixed` is the default. This setting changes soccer feeds. NFL and NBA always use ESPN.

The route diagram follows each planned question through the league decision:

- Soccer uses ESPN for structured feeds in `mixed` mode. FotMob supplies player values, photos, and optional match ratings. In `fotmob` mode, FotMob also supplies the structured feeds.
- Other supported leagues, currently NFL and NBA, use the shared ESPN adapter in either mode.
- Each API layer returns normalized values under the question's ID. Questions outside feed coverage use web research and join the same answer output.

| Question | Provider | Result |
| --- | --- | --- |
| Soccer tables, fixtures, results, match reports, leaders, and recent scorers | ESPN in `mixed` mode. FotMob in `fotmob` mode. | Normalized values. Soccer matches can receive optional FotMob ratings. |
| NFL and NBA games, standings, leaders, rosters, injuries, team statistics, player statistics, and game logs | ESPN through the generic adapter in either mode. | Records, statistics, and tables. Player headshots come from ESPN. |
| Soccer player market value history | FotMob in either mode. | A prepared chart. Soccer identity and photo lookups also use FotMob. |
| News, transfers, unsupported competitions, playoff champions, and facts beyond feed coverage | Parallel Search and Extract, then a reader. | A finding with a citation matched to a retrieved source. |

NFL and NBA add `roster`, `injuries`, `teamStats`, `athlete`, and `gamelog` to the shared feed choices. They have no soccer `scorers` feed. The planner rejects unsupported feeds and missing required arguments. Soccer injuries still need web research. NFL and NBA reported injuries have a structured feed.

Provider selection happens before the call. A failed structured feed becomes unavailable. It does not switch providers or start a web search. Missing optional soccer match ratings leave the base match intact.

The internal tag `source: "espn"` identifies a structured question. For soccer, FotMob can answer that question in `fotmob` mode. The snapshot source label is also coarse. Read each answer's `source` attribution to identify its provider.

## Seasons, clocks, and winners

ESPN uses different numeric years for different leagues:

| League | Value of `season` | Default game display time zone |
| --- | --- | --- |
| Soccer | Start year. `2025` means `2025/26`. | `Europe/London` |
| NBA | End year. `2026` means `2025-26`. | `America/New_York` |
| NFL | Season year. `2025` means the 2025 season. | `America/New_York` |

The planner uses the request's time zone for today's date, with UTC as the fallback. Game cards use the requested time zone or the league default. Web research's as-of date still uses UTC. A scoreboard date is `YYYYMMDD`. An NFL scoreboard can instead select a regular-season week.

A domestic soccer table can answer who won that league season. NFL and NBA standings show regular-season records. Their champions come from playoff results, so the planner sends champion questions to web research. Knockout soccer cups also need web research for their winners.

## How NFL and NBA values fit the screen

The generic adapter reads box-score and game-log cells by column position. Labels can repeat. In an NFL log, two `YDS` columns can mean passing yards and rushing yards.

The adapter selects at most 7 statistic columns for `RecordTable`. It keeps scores by period and separates box scores by statistic group. It also prepares leaderboard entries, season results for `FixturesHeatmap`, injury records, and athlete career records for `ClubTimeline`.

The dataset designer receives component contracts for the sports in the plan. NFL and NBA keep their record-based standings and ESPN headshots. Their player records keep `athleteId`, and the photo step preserves those feed images. Soccer player resolution uses FotMob. An NFL or NBA-only screen skips those FotMob player lookups.

A schedule includes the latest 20 completed games, the next 5 games, and compact result rows for the whole season. Game logs prefer the regular-season section and fall back to the first season type when that section is absent. They default to 10 rows when no count is given.

## Inside one web question

Questions run concurrently. Each web question also starts two searches together. The plan is bounded. No loop invents further searches.

1. Both Search calls receive the same objective and the same 2 or 3 keyword queries.
2. A preferred-domain search requests up to 5 pages. The subject's league selects the domains. NBA prefers ESPN, NBA, and Basketball Reference. NFL prefers ESPN, NFL, and Pro Football Reference. Soccer uses its football source list. An unknown subject league uses the soccer defaults.
3. The open search requests up to 8 pages.
4. Preferred results lead. The server removes exact duplicate URLs and keeps readable excerpts.
5. One Extract batch requests richer excerpts from up to 3 preferred pages and 3 other pages.
6. The reader, Sonnet by default, produces a structured finding with a summary, table, or facts, plus a date and citations.

The league for web research comes from the plan's subject. A web question has no league field of its own.

A failed preferred search leaves the open results available. A failed or timed-out Extract request leaves the original Search excerpts available. An open-search failure makes the question unavailable even if the preferred search succeeded. A finding without a citation matching a retrieved URL also becomes unavailable. This checks source identity. It does not verify every claim.

A normal web question makes two Search HTTP requests and up to one Extract request. Each Search request contains the whole query bundle. URL deduplication happens within that question. A reader retry can regenerate a finding without rerunning the searches.

## The saved data and the writer

All routes meet in `sports_dataset`. Its shape is:

```text
{
  values: {
    answers: { q1, q2, q3 },
    clubs: [...],
    players: [...]
  },
  fields: [...],
  asOf: "...",
  source: "mixed"
}
```

The snapshot holds the prepared values. The `clubs` and `players` lists appear when available. A rejected design keeps a validated raw answer, subject to raw-list limits. The fallback preserves season `results`, keeps the newest 40 `matches`, and limits other top-level raw lists to 40 items. Designed lists allow up to 120 items.

The writer receives the request, required question IDs and statuses, a compact preview of values, and component contracts with source footnote rules. It reads paths such as `d.answers.q1`. The compiler supplies `Query("sports_dataset", ...)`. Web attribution reaches the writer as source text rather than the full article URL list.

On a follow-up, the planner keeps, revises, removes, or adds questions. `editSports` researches and prepares only revised or added questions. Kept questions retain their saved answers and screen parts. Club lists keep their order so existing indexed references still identify the same team.

## Failure and recovery

Recovery depends on the stage:

- A failed research question keeps its ID and receives an unavailable status with a note. Other answers remain. An empty but valid feed can still count as complete.
- Missing optional soccer ratings leave the base match intact.
- The dataset step repairs small schema slips in place. It can replace null text with an empty string or convert a numeric string to a number. A design that still fails keeps only that question's validated raw answer. If none of the returned designs is usable, the stage can regenerate once. Raw values that fail validation make the question unavailable.
- The compiler checks streamed statements and question coverage. It can ask for one repair round, then add deterministic fallback parts for uncovered questions. An unavailable question must show its note. Composition recovery makes no new source calls.

## Why the stages are separate

The registry comment states that league differences belong in configuration. The planner comment says its routing text comes from that registry so adding a league does not require another prompt. Soccer still has its own presenter, so support for an arbitrary new sport is not automatic.

The dataset code states that a schema mistake should cost polish, not the screen. The research code states that failed or uncited answers should report a gap instead of inventing data. Per-question routing lets one screen combine feed statistics and web context, and most failures stay with their own question.

The repository does not explain why `mixed` is the default or why the search limits have their exact values. The evidence for this guide is the working tree, repository documentation, recorded-response checks, and git history. External discussions and telemetry were not consulted.

## Checks for this change

`npm run check:all` includes `check:feeds`, `check:team-sports`, and `openui:export -- --check`, whose parity fixtures include NBA and NFL component records built from the same recorded responses. The feed checks compare 8 soccer cases and 24 NFL and NBA cases with saved outputs. The team-sports checks drive those 24 cases through saved datasets and compiled screens with recorded ESPN responses and scripted model replies. They also check that those runs never call FotMob.

These checks use no live provider or model calls. They verify the recorded cases and pipeline behavior. They do not establish current provider coverage or live model routing quality.
