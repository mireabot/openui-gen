# How the data gets to the writer

This document explains how OpenUI Sports turns a user request into the saved dataset that the screen writer uses. A request becomes questions. Each question takes a route. The answers become one saved dataset.

## The pipeline

1. **Plan.** The planner in `src/sports/plan.ts` identifies the subject and creates 1 to 5 questions. Each question gets a stable ID (`q1`, `q2`) and keeps the club, competition, time period and count the user asked for. Web questions get 2 or 3 keyword queries at this stage, before research starts.
2. **Route.** The planner selects one of three routes for each question: structured football, player market values or web research. All questions start concurrently. The configured provider decides who supplies the structured feed (`src/sports/football.ts`).
3. **Collect.** The server waits for the group of questions and stores each result under `answers.q1`, `answers.q2` and so on (`src/sports/research.ts`). Each answer carries its status and source attribution. If one question fails, it becomes unavailable and the other answers remain.
4. **Prepare.** The designer shapes eligible complete answers into component fields and values (`src/sports/dataset.ts`). The server validates them, attaches player photos and club marks, and removes repeated facts. Market value charts and recent-scorer records already have a prepared shape, so they skip model shaping.
5. **Hand off.** The server saves the final dataset as a snapshot first. The writer then receives the request, the required question IDs and a compact preview of the values (`src/sports/ask.ts`). It composes the screen with references to that dataset. The writer does not run research.

## Routing

Coverage decides the route during planning. The provider setting decides who answers structured football questions.

- **Structured football** covers tables, fixtures, results, match reports, leaders and recent scorers within supported competitions. ESPN answers in `mixed` mode, which is the default. FotMob answers in `fotmob` mode. Normalized values go straight to collection, and a match may also receive FotMob ratings.
- **Player market value history** is a dedicated player question. FotMob answers it. A prepared chart enters collection, and player identities and images also come from FotMob.
- **Context and uncovered data** covers injuries, transfers, news, unsupported competitions and statistics beyond feed coverage. Parallel search plus a reader answers it. Search and page excerpts become a cited finding, then an answer record.

Provider selection happens before the call. Missing match ratings leave the base match intact. A failed structured feed becomes unavailable. It does not switch to another provider or start a web search.

The internal tag `source: "espn"` means the structured football route, even when FotMob answers it. The snapshot source label is similarly coarse. Read the configured route and the answer attribution to identify the actual provider.

## Inside one web question

Questions run in parallel, and each web question runs two searches in parallel. The plan is bounded. No loop keeps inventing new searches.

1. Both Search calls receive the same 2 or 3 keyword queries and the same objective.
2. The preferred-domain search returns up to 5 pages from sources such as ESPN, BBC, official leagues and established football data sites.
3. The open search returns up to 8 pages.
4. Preferred results lead, exact duplicate URLs are removed, and readable pages become excerpts.
5. One Extract batch reads richer excerpts from up to 3 preferred pages and 3 other pages.
6. The web reader, Sonnet by default, produces one structured finding with a summary, table or facts, a date and source attribution.

Failures behave differently at each step:

- If the preferred search fails, the error is caught and open results continue.
- If Extract fails or times out, the search excerpts remain and the reader can still produce a cited answer.
- If the open search fails, this question becomes unavailable, even when the preferred search succeeded. Other questions keep running.
- If a finding has no matching source URL, it becomes unavailable. This checks source identity, not the truth of every claim.

A normal web question makes two Search HTTP requests, each containing all of its queries, plus up to one Extract request. URL deduplication happens inside each question. A structured-output retry can regenerate a finding, but it does not rerun the searches.

## The data contract

All routes meet in one saved dataset, called `sports_dataset`:

```
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

Full values stay in the snapshot. Club and player lists are present when available. The writer receives the user request, the required question IDs and statuses, a compact preview of the answer values, and component contracts with source footnote rules. It reads saved values through paths such as `d.answers.q1`. The compiler supplies `Query("sports_dataset", ...)`. Web attribution reaches the writer as source text, not as the full list of article URLs.

The compiler admits valid streamed statements, checks which questions their data references cover, and can request one repair round (`src/lang/compiler.ts`). It adds deterministic fallback parts for uncovered questions. An unavailable question must show its note. This is a presentation fallback, not another source lookup.

## Failure and recovery

Recovery depends on the stage:

- **Research:** one question fails. Keep the other answers and mark the failed question unavailable with a note. An empty but valid feed can still be a complete answer.
- **Enrichment:** ratings are missing. Keep the match, because FotMob ratings are optional.
- **Dataset:** a design is rejected. Keep the raw answer with inferred fields where it validates.
- **Composition:** a question is uncovered. Let the writer repair it, then use a deterministic fallback part if needed.

## Why this shape

The dataset code states that a schema mistake should cost polish, not the screen. The research code states that a failed or uncited answer should report a gap instead of inventing data. Per-question routing appears to let one screen combine structured statistics with web context while containing most failures to one question. That last point is an inference from the implementation. The repository does not explain why `mixed` is the default or why the search limits have their values.
