# Usage

openui-gen turns one sports prompt into an OpenUI Lang program and a dataset snapshot, and streams both
over SSE. `GENERATION_MODE` decides which transport the Claude stages use. The stages, models, effort
values, token budgets and schemas are the same in both modes.

| | `debug` (default) | `api` |
| --- | --- | --- |
| Claude stages | Local `claude` CLI, on your plan's limits | Anthropic API, billed to `ANTHROPIC_API_KEY` |
| Web search | Parallel, billed | Parallel, billed |
| ESPN and FotMob | Free | Free |
| Keys needed at boot | `PARALLEL_API_KEY` and a Claude Code login | `PARALLEL_API_KEY` and `ANTHROPIC_API_KEY` |

## The pipeline

```text
prompt → plan → answer all questions at once → dataset → writer + compiler → saved screen
```

| Step | Code | Model, effort | What it does | If it fails |
| --- | --- | --- | --- | --- |
| Plan | `src/sports/plan.ts` | Haiku, low | Returns the subject and 1 to 5 questions, each routed to ESPN, FotMob or the web. | The run ends with `failure` and saves nothing. |
| Answer: ESPN, FotMob | `src/sports/espn.ts`, `fotmob.ts` | None | Reads the feed directly. | That question shows as unavailable. |
| Answer: web | `src/research/parallel-research.ts`, `src/sports/research.ts` | Sonnet, medium | Parallel finds and reads pages. Sonnet turns them into one finding, and the server keeps it only if it cites a page that was read. | That question shows as unavailable. |
| Player pick | `src/sports/player-pick.ts` | Haiku, low | Chooses the FotMob player when the name alone doesn't settle it. | The player loses a photo or a market value answer. |
| Dataset | `src/sports/dataset.ts` | Opus, high | Designs fields and values from the answers. | The answers keep their raw values. |
| Writer | `src/sports/ask.ts` | Opus, medium | Writes the screen as named statements, streamed as text. | Unshown questions get fallback parts. |
| Compiler | `src/lang/compiler.ts` | None | Admits each statement as it arrives and sends each part once it's complete. It runs one repair round, then adds a fallback part for each required question still unshown. | The run ends only if the final program is invalid. |

The plan, dataset, extraction and picker calls each regenerate once when the output fails validation.
The model never types scores or facts into the screen, because the program reads them from the
snapshot with `Query("sports_dataset", {run}, {})`.

### Follow-ups

`POST /lang/sports/:documentId/follow-up` edits a saved screen. Haiku puts each saved question in keep,
revise or remove, and can add up to 3, with at most 8 in total. Only changed questions go through
research and the dataset step. The writer rewrites only the parts those questions touch.

The client sees `activity` and `usage` while this runs. It gets `data`, `openui` and `done` only after
the new revision is saved, so a failed follow-up changes nothing.

### What the screen does with awkward data

`settleMissing` and `lockFacts` in `src/sports/components.ts` run after the dataset step, whichever model wrote it.

- A stat or ranking row with no value is dropped, and "—", "N/A" and "unknown" count as no value. A StatsCard shows its rating and stat rail only when they have data, and an empty detail or caption takes no space.
- A player's first StatsCard owns their rating and stats. A later card keeps only what's new, and goes if nothing is.
- A question whose whole answer failed still shows its unavailable note.
- A `Note` and a summary show in full. A long `Row` value on the right wraps at 45% of the width.

A player's photo sits on their club's ESPN colour. With no club found, it sits on a neutral fill.

## Debug mode

Use debug mode for everyday work on prompts, schemas and screens. You need `PARALLEL_API_KEY` in
`.env` and a login from `claude auth login`. The backend stops at boot if either is missing.

```bash
make backend
npm run ask -- "Chelsea stats last season"
```

Every finished debug run appears in the preview's "Replay a previous run" list with its model, and
replaying it makes no model call. Each revision also gets its own file in `data/saved-generations`,
which "Import schema" can open. A failed run saves nothing.

`npm run ask` prints each step, each call's model, tokens, cost and time, and any issues. It ends with
a link to the screen, which needs the preview running on port 3000 (`npm run preview`). It only creates
new screens. The preview and the iOS app use the same backend, so they run in debug mode too.

`src/llm/claude.ts` picks the transport for each call. In debug mode, `src/llm/claude-code.ts` starts
one `claude -p` process per call with the step's model, effort, prompts, schema and output limit. The
process has no tools, MCP servers, settings files or saved session, and it runs outside the repo.

Two checks keep these calls off your API bill. The child process doesn't receive any `ANTHROPIC_*`
variable, because the CLI would otherwise use the key from `.env`. If the CLI still reports an auth
source other than your login, the backend kills the process and the call fails.

### How it differs from `api`

- Claude calls report $0, so a debug run doesn't tell you what the API would cost. Each trace records
  its mode in `run.started`. Only Parallel reports a cost, estimated at up to $0.016 per web question.
- The API's refusal fallback to another model doesn't exist here, so a refusal counts as a failed call.
- The backend kills any call that runs past 5 minutes. The API adapter sets no timeout of its own.
- The API adapter's cache breakpoints don't apply. Claude Code manages its own prompt cache, so cache
  numbers and speed can differ. Measure both in `api` mode before you rely on them.

A hit plan limit doesn't always look like an error. Only the plan step ends the run, and the other
steps fall back as the table above shows. If a screen looks thin, check the issues and activity lines
from `npm run ask`, because a run whose writer failed can still finish with fallback parts.

Debug mode is for your own machine. Nothing in the code enforces that, so don't expose this backend
to other people while it runs on your plan.

## Football data source

`DATA_SOURCE` picks where football data comes from. It works with either generation mode. Set it in `.env` and restart.

| Setting | Tables, matches, leaders, clubs | Players, values, ratings |
| --- | --- | --- |
| `mixed` (default, always in the Docker image) | ESPN | FotMob |
| `fotmob` | FotMob | FotMob |

`src/sports/fotmob-feeds.ts` returns the same fields as `src/sports/espn.ts`, so the rest of the pipeline doesn't change. Web questions, such as bios, still go to Parallel in both.

With `fotmob`:

- A club outside the six competitions, such as Molde or Bryne, gets its crest and colour from a search by name. One screen looks up at most 12 clubs, because each colour needs a full team page.
- `leaders` also answers for a past season.
- Matches have no venue or broadcast.
- Questions still only cover the six competitions, so a lower league's table isn't available yet.

FotMob's terms forbid automated retrieval of its data, so use `fotmob` for personal research at low volume and never in a deployment.

## API mode

Use API mode to check real cost and speed, and for deployments.

```bash
# .env
GENERATION_MODE=api
ANTHROPIC_API_KEY=...
PARALLEL_API_KEY=...
```

Restart the backend after you change the mode. The Docker image sets `GENERATION_MODE=api` because it
has no Claude Code CLI, and a deployment that overrides this fails at boot.

## Check the mode

```bash
curl localhost:8080/health
# {"status":"ok","mode":"debug","dataSource":"mixed"}
```

The backend logs the mode when it starts, and `npm run ask` prints it first.

## Sports and ESPN fixtures

Leagues live in `src/sports/leagues.ts`. Soccer keeps its own presenter in `espn.ts`, and NFL and NBA share `espn-generic.ts`.

`npm run check:feeds` replays recorded ESPN responses from `scripts/fixtures/espn` against the goldens in `scripts/fixtures/goldens`, with no network. After an intended change to a feed's output, run `npm run check:feeds -- --update` and review the diff. To refresh responses from the live API, run `npm run record:espn`, or `npm run record:espn -- nba` for one league's cases.
