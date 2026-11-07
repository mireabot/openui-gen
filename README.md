# openui-gen

This repo shows how to use the OpenUI Lang protocol for generative UI in a native iOS app, with
SwiftUI as the rendering engine. A user asks a question. The server gathers the data, a model
writes the answer as an OpenUI program, and the iOS app renders that program as SwiftUI views while
it streams in.

Sports (soccer, NFL and NBA) is the demo domain. The repo holds the generation server, the OpenUI
component library and its schema index, a web preview that renders the same programs, and the native
iOS client. One service serves the API and the preview.

## Run it

```sh
cp .env.example .env          # fill in the keys
make backend                  # API on :8080
```

`make backend` checks that `.env` exists, installs dependencies when `node_modules` is missing,
checks that the port is free, prints the endpoint URLs, and then starts the server with
`npm run dev`. Set `PORT` in the environment or in `.env` to use another port:
`PORT=8099 make backend`.

To run the web preview against the backend:

```sh
npm --prefix preview install
npm run preview               # preview on :3000, calling :8080
```

`npm run preview:build` writes `preview/out/`. The server then serves it at `/` on the same origin.

For a site with no generation backend, `npm run preview:build:landing` builds the same pages with a
landing page at `/` in place of the live preview. It links to the components and the docs.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /lang/sports/stream` | A new screen (`{prompt}`): SSE `activity`, `data`, `skeleton`, `openui`, `issue`, `done`, `failure`. |
| `POST /lang/sports/:documentId/follow-up` | A follow-up on a saved screen (`{prompt, baseRevision}`): SSE `activity`, then `data`, `openui {replace: true}` and `done` with the next revision. 404 unknown document, 409 stale revision. |
| `POST /lang/sports/:documentId/save` | Keep a copy of a revision (`{revision}`) under `DATA_DIR/saved-generations`: program, dataset, plan and prompts. 404 unknown document, 409 not the current revision. |
| `GET /lang/sports/runs`, `GET /lang/sports/runs/:documentId` | Saved screens the preview replays with no model call. Off when `NODE_ENV` is `production`. |
| `POST /tools/sports_dataset` | Replay a run's dataset snapshot (`{run}`), for `Query("sports_dataset", …)`. |
| `GET /health` | Liveness. |
| `GET /` | The preview (when `preview/out` exists). |

## Generation modes

`GENERATION_MODE` picks the model runner. The feed, dataset, and compiler pipeline stays the same.

| Mode | Model stages | Search |
| --- | --- | --- |
| `debug` (default) | Local `claude` CLI, on your plan's limits. Needs `claude auth login`. | Parallel, billed |
| `api` (always in the Docker image) | Anthropic API, billed to `ANTHROPIC_API_KEY` | Parallel, billed |
| `codex` | Local Codex CLI using `gpt-6.1-sol` at High effort for every stage. Needs `codex login`. | Parallel, billed |

Local CLI calls record a cost of $0, and `GET /health` reports the mode. To run one generation from the
terminal, start the backend with `make backend` and run `npm run ask -- "Chelsea stats last season"`.
Set `GENERATION_MODE=codex` to select Codex. `CODEX_MODEL` and `CODEX_EFFORT` override its defaults.
See `Usage.md` for the pipeline and all modes.

`OPENUI-LANG.md` explains the pipeline (Haiku plans, ESPN feeds and Parallel searches read by Sonnet
answer every question at once, Opus designs the dataset and writes the screen), the component
library, follow-ups and the native renderer.

## Layout

```text
src/lang/       OpenUI Lang: primitives, library, compiler, printer, snapshots
src/sports/     plan and follow-up plan (Haiku), documents, ESPN client, parallel research (Parallel + Sonnet), dataset (Opus), screen pack
src/research/   Parallel search, citations and dataset schema
src/llm/        model runners by mode (Anthropic API, Claude Code CLI or Codex CLI) and structured completion
src/routes/     HTTP routes
preview/        Next.js preview (static export), design system renderer for OpenUI
catalog/        component schema index for clients (see catalog/README.md)
design/         Design system themes and primitive specs the preview reads at build time
ios/            native iOS client (XcodeGen), see ios/README.md
```

## iOS app

`ios/` holds the native client. The Xcode project is generated from `ios/project.yml` and is not
tracked. From the repo root:

```sh
make bootstrap   # mint tools, Secrets.xcconfig, generate ios/OpenUIGen.xcodeproj
make backend     # server on :8080
make open        # Xcode; run on a simulator
```

`make help` lists the rest: `project`, `format`, `lint`, `preflight`, `build`, `test`, `clean`,
`bump-patch`/`minor`/`major`.

## Checks

`npm run check:all` runs the typecheck, the closure guard (no legacy imports), the compiler,
Anthropic, lang and sports checks, and the export freshness check. None of them call a provider or
ESPN.

## Deploy

One Docker image (`Dockerfile`): it builds the preview, compiles the server and runs
`node dist/src/server.js`. Railway uses `railway.json` (health check `/health`). Mount a volume at
`/app/data` to keep snapshots and documents across deploys.
