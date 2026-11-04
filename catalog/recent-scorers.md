# Recent player goalscorer rankings

The request "Who are top scorers in Chelsea for the past 5 games?" now uses the ESPN `scorers` feed. The question carries `lastGames: 5` and `allCompetitions: true`.

Previously, the planner chose either a season schedule without player goals or web research containing season totals. The original schedule run was `019a924f-2fd3-45cd-868d-84c35d6118ef`. The reproduced web run was `55fdb840-83d1-4b83-9f21-254c7cdeee5c`. Both returned a screen while failing to provide the requested player ranking.

## Data contract

The feed selects exactly the requested number of completed fixtures and reads each match report. It counts the first participant of each scoring event for the requested club. Assists and shootout penalties do not count. Own goals are tracked separately. Duplicate fixtures and goal events count once.

Each match's attributed goals plus own goals must equal the final team score. Missing reports, unidentified scorers, unpublished scores, and insufficient fixtures produce an unavailable answer. A verified scoreless window remains a complete empty ranking.

The answer retains `scorers`, `requestedGames`, `gamesCounted`, `scope`, `period`, and the included `matches`. Each scorer has `name`, `team`, `espnId`, and `goals`. Existing player enrichment adds the verified `fotmobId`, `imageUrl`, and `logo`.

The server also constructs a Leaderboard record directly from those counts. This feed bypasses dataset redesign, so the model cannot replace the requested window with season totals. The writer still composes the screen from the resulting primitives.

An unspecified competition uses all competitions returned by ESPN, including friendlies. A named league or cup restricts the schedule to that competition. The response labels its scope explicitly.

## Verified request

Run `db2af932-3a33-43ef-9b5c-8ceaa42365d9` completed through the local HTTP API with no validation issues. The trace is `traces/2026-10-27T15-20-52-815-db2af932-3a33-43ef-9b5c-8ceaa42365d9.json`.

Its five completed fixtures span September 12 through October 24, 2026. Their nine Chelsea goals produce this ranking:

| Player | Goals |
| --- | ---: |
| João Pedro | 3 |
| Jordan Henderson | 2 |
| Morgan Rogers | 2 |
| Pedro Neto | 2 |

All four scorer records in the saved API response contain verified portrait URLs. Cole Palmer has no goals in this window.

`npm run check:recent-scorers` covers match selection, scorer counting, penalties, own goals, duplicates, incomplete reports, blank scores, zero-goal windows, deterministic ranking, and portrait binding. The check is included in `npm run check:all`.
