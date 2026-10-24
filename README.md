# openui-gen

OpenUI Lang generation for stocks, funds and positions: the endpoints, the OpenUI component library
and its schema index, and a preview page that renders generations. One service serves the API and
the preview.

Split from FitnessGin_BE at commit `1844a1c`, keeping only the OpenUI Ask path. Design explorations
live in their own project, `~/Desktop/ui-canvas`; nothing here imports it.

## Run it

```sh
npm install && npm --prefix preview install
cp .env.example .env          # fill in the keys
npm run dev                   # API on :8080
npm run preview               # preview on :3000, calling :8080
```

`npm run preview:build` writes `preview/out/`; the server then serves it at `/` on the same origin.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /lang/stocks/stream` | A new screen: SSE `activity`, `data`, `skeleton`, `openui`, `issue`, `done`, `failure`. |
| `POST /lang/stocks/:documentId/follow-up` | Edit a saved screen; responds with a new revision. |
| `POST /tools/stocks_dataset` | Replay a run's dataset snapshot (`{run}`), for `Query("stocks_dataset", …)`. |
| `GET /media/logos/:ticker` · `GET /stocks/:ticker/assets` | Company logos for generated UI. |
| `GET /health` | Liveness. |
| `GET /` | The preview (when `preview/out` exists). |

`OPENUI-LANG.md` explains the pipeline, the component library and follow-ups.
`OPENUI-FOLLOWUPS.md` is the native client contract.

## Layout

```text
src/lang/       OpenUI Lang: primitives, library, compiler, printer, snapshots, documents
src/stocks/     planner, lookups and market data; lang/ holds the screen templates
src/research/   cited web research and dataset schema
src/llm/        Anthropic and OpenRouter clients
src/routes/     HTTP routes
preview/        Next.js preview (static export), Kino renderer for OpenUI
catalog/        component schema index for clients (see catalog/README.md)
design/         Kino theme and primitive specs the preview reads at build time
eval/fixtures/  recorded datasets for checks and fixtures
```

## Checks

`npm run check:all` runs the typecheck, the closure guard (no legacy imports), the compiler, screen,
Anthropic, lang, schema, fetch-scope and asset checks, and the export freshness check. None of them
call a provider.

## Deploy

One Docker image (`Dockerfile`): it builds the preview, compiles the server and runs
`node dist/src/server.js`. Railway uses `railway.json` (health check `/health`). Mount a volume at
`/app/data` to keep snapshots, documents and the market cache across deploys.
