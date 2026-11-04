# openui-gen

OpenUI Lang generation for football (soccer): the sports endpoint, the OpenUI component library and
its schema index, a preview page that renders generations, and the native iOS client. One service
serves the API and the preview.

Split from FitnessGin_BE at commit `1844a1c`, keeping only the OpenUI Ask path. The stocks pipeline
(Massive and FMP market data) was retired in favour of sports. Design explorations
live in their own project, `~/Desktop/ui-canvas`; nothing here imports it.

## Run it

```sh
npm install && npm --prefix preview install
cp .env.example .env          # fill in the keys
npm run dev                   # API on :8080
npm run preview               # preview on :3000, calling :8080
```

`make backend` does the same as `npm run dev`, after checking `.env` and installing dependencies.

`npm run preview:build` writes `preview/out/`; the server then serves it at `/` on the same origin.

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

`GENERATION_MODE` picks where the Claude stages run. Stages, models and effort are the same in both.

| Mode | Claude stages | Search |
| --- | --- | --- |
| `debug` (default) | Local `claude` CLI, on your plan's limits. Needs `claude auth login`. | Parallel, billed |
| `api` (always in the Docker image) | Anthropic API, billed to `ANTHROPIC_API_KEY` | Parallel, billed |

Debug calls record a cost of $0, and `GET /health` reports the mode. To run one generation from the
terminal, start the backend and run `npm run ask -- "Chelsea stats last season"`.
See `Usage.md` for the pipeline and both modes.

`OPENUI-LANG.md` explains the pipeline (Haiku plans, ESPN feeds and Parallel searches read by Sonnet
answer every question at once, Opus designs the dataset and writes the screen), the component
library, follow-ups and the native renderer.

## Layout

```text
src/lang/       OpenUI Lang: primitives, library, compiler, printer, snapshots
src/sports/     plan and follow-up plan (Haiku), documents, ESPN client, parallel research (Parallel + Sonnet), dataset (Opus), screen pack
src/research/   Parallel search, citations and dataset schema
src/llm/        Claude by mode (Anthropic API or Claude Code CLI) and structured completion
src/routes/     HTTP routes
preview/        Next.js preview (static export), Kino renderer for OpenUI
catalog/        component schema index for clients (see catalog/README.md)
design/         Kino theme and primitive specs the preview reads at build time
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
