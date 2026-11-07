# OpenUI Lang generation

A sports request becomes an OpenUI Lang program: a screen of standard OpenUI statements that the
server writes, checks and streams, and that every client (web preview, SwiftUI) evaluates with the
same component library. This document describes the pipeline, the component library and the native
renderer.

## The pipeline

```text
prompt → plan (Haiku) → answer every question at once (ESPN · Parallel + Sonnet) → dataset (Opus)
       → writer (Opus) + compiler → program + dataset snapshot
```

| Stage | Code | Result |
| --- | --- | --- |
| Plan | `src/sports/plan.ts` `planSports` (`SPORTS_PLAN_MODEL`, Haiku 5.5) | Reads the request once: the subject and 1–5 questions, each routed to an ESPN feed (`standings`, `scoreboard`, `schedule`, `teams`) for the Premier League, LaLiga, Bundesliga and Serie A, or to cited web research with 2–3 search queries. |
| Answer | `src/sports/research.ts` `answerSports` | Every question at once. ESPN feeds (`src/sports/espn.ts`) are read and trimmed directly. Web questions are parallel searches: Parallel's Search and Extract APIs find and read the pages, then Sonnet 5.5 (`SPORTS_SEARCH_MODEL`) turns them into one cited finding. A finding citing no page it read, or a failed question, comes back `unavailable` with a note. |
| Dataset | `src/sports/dataset.ts` `designDataset` (`SPORTS_MODEL`, Opus 5.5) | Designs each answer's fields and values from the data (select, order, derive; never add figures). The server validates every field and value; a design that fails keeps the raw answer with inferred fields. |
| Snapshot | `src/lang/snapshots.ts` | The dataset `{answers}` is stored under the run id. Programs read it through `Query("sports_dataset", {run}, {})`. |
| Compose | `src/lang/compiler.ts` `compileScreen` with `src/sports/screen.ts` `SPORTS_SCREEN` | The writer (Opus 5.5) authors the screen as named statements; the compiler admits each one as it streams. |

Search happens before composition. The writer receives sourced data and references it by path; it
never types a score or a fact. Opus 5.5 and Sonnet 5.5 calls opt into the API's server-side refusal
fallback (`fallbacks: "default"`); Haiku has none.

## The component library

`src/lang/primitives.ts` is the only list of primitives, including `Screen`, `Section`, `Card`, `Stack`,
`Grid`, `Rail`, `Text`, `Number`, and `ColorCell`. Each has zod props whose key order
is the positional order on the wire, a role per prop (`node`, `nodes`, `data`, `copy`, `token`, `style`), and
ground rules the renderer applies (a Card has radius 24 and padding 16; props only choose between
allowed tokens).

`src/lang/library.ts` turns them into an `@openuidev/lang-core` library with `component: null`. That
gives the JSON schema, the prompt signatures and the parser. Clients attach their own renderers by
primitive name:

- web: `preview/components/primitives/openui-render.tsx` expands template calls with
  `expandProgram`, then maps every primitive name to `DesignSystemPrimitive` using
  `@openuidev/react-lang`'s `Renderer`;
- SwiftUI: `OpenUICompiler` and the design system views (see below).

### Components are templates

A sports component is a template: a named composition of primitives the writer calls by name. Each
one is defined once in `src/sports/components.ts` as a typed builder (`build`, using `ui.Card(...)`)
with a data contract, `useWhen` guidance and optional params. `SPORTS_TEMPLATE_DEFS` prints every
`build` once over a `record` parameter, so a template is data: `{name, params, body}`, where the body
is OpenUI text.

The program keeps the call. The compiler expands it only to check it, and the client expands it
before it evaluates. Every client therefore needs the run's templates: the stream sends them first,
and a client without them falls back to its bundled copy of `catalog/openui/sports-components.json`.
`src/lang/templates.ts` is the server and web expander (`expandCall`, `expandProgram`); iOS evaluates a
template's body in its own scope. A component may take params after its record (StatsCard's `header`
flag, MetricBars' `heading`); a null or missing param takes its default.

The sports pack has 18 components: ClubTimeline, MatchCard, TeamDetail, StatBar, Leaderboard,
FixturesHeatmap, StatsCard, TeamPoints, LeagueStanding, MatchTopPlayers, PlayerValue, MetricBars,
PlayerMetrics, PlayersMetric, SeasonPodium, RecordTable, InjuryReport and InjuryList. See
`catalog/sports-parity.md` for source-design coverage and remaining visual differences.

```text
root = Screen([pick1, pick2])
d = Query("sports_dataset", {run: "…"}, {})
pick1 = Section(d.answers.q1.title, [MatchCard(d.answers.q1.match)])
pick2 = Card([Text(d.answers.q2.title, "headline"), Stack("v", 8, @Each(d.answers.q2.rows, "row", Row(...)))])
```

When no component fits, the writer composes primitives, and the two mix freely in one program.

### The component schema index

`npm run openui:export` writes what native clients load:

- `catalog/openui/primitives.json`: every primitive with its positional props and roles, and a
  digest of the lang-core schema. The iOS app bundles it directly.
- `catalog/openui/sports-components.json`: each sports component's contract, `useWhen` and params,
  and its template (`{name, params, body}`). Clients expand calls with these templates.
- `catalog/openui/fixtures.json`: shared compiler fixtures, including full and sparse sports records.

`--check` fails when it is stale.
`catalog/sf-symbols.json` (`npm run sf-symbols`) is the icon allowlist the compiler checks names against.

## The compiler

The writer writes lowercase statements (`peers = Section(...)`, `peers_cards = Rail(...)`). For each
statement the compiler:

- parses it, then expands template calls to check them, but admits the call as written;
- checks components, child slots, data paths and types, SF Symbols and the pack's collection rule
  against the real dataset values (an `@Each` template is checked once per real item);
- links a part once every statement it references is admitted, renames it `pickN`, and records which
  questions it shows from the data it reads.

Writer statements cannot introduce queries, actions, state or references to server statements. After
the writer finishes, one repair round names unfinished parts and uncovered questions. Any question
still not shown gets the template's default part (`fallback`), so a partial or unavailable answer
always shows its note. Recoverable problems are `issue` events; a writer failure still yields a usable
program from fallbacks. The server prints every admitted expression itself; clients never receive raw
writer output.

## Streaming and client behavior

`POST /lang/sports/stream` with `{prompt}` sends:

| Event | Payload |
| --- | --- |
| `templates` | `{templates}`: every component template the program may call, sent first |
| `activity` | stage, status and detail for each step |
| `usage` | one model or search call: its stage, model, tokens, cost and time |
| `data` | the dataset seed `{tool: "sports_dataset", args: {run}, result, fields, asOf, source}` |
| `skeleton` | frames for the planned parts, before content |
| `openui` | `{text}`: complete statements to append; later assignments to an id replace earlier ones, so each finished part also re-sends `root` |
| `issue` | a recoverable problem with its statement id |
| `done` | `{program, templates, issues, holes, timings, model, document: {id, revision}}`, sent after the screen is saved; `templates` are the ones the program uses |
| `failure` | `{error, message}` |

The `data` event warms the client's tool provider. A client without the seed replays the query
through `POST /tools/sports_dataset` with `{run}`. Snapshots live in memory (bounded) and under
`DATA_DIR/openui-snapshots`.

Outside production, `GET /lang/sports/live` streams every run from any client (the iOS app, the
preview, `npm run ask`) as it happens, and `GET /lang/sports/runs` and `/runs/:documentId` replay saved
screens with no model call.

`@Each` output can contain nested child arrays, which renderers flatten before laying out rails, grids
and segmented panels. Data arrays, such as chart points, stay data.

## Follow-ups

A screen is a document (`src/sports/documents.ts`): one JSON file per document under
`DATA_DIR/openui-documents`, holding the latest revision's program, snapshot, subject, routed
questions, parts (printed statements and the questions each shows) and the conversation turns. The
document id is the first run's id.

`POST /lang/sports/:documentId/follow-up` with `{prompt, baseRevision, targets?}`:

1. Haiku reads the turns, the subject, the saved questions and what each part shows, and returns the
   updated plan: every saved id is kept, revised (same id, new text and routing) or removed, and
   new questions get fresh ids. A revision identical to the saved question counts as kept.
2. Kept answers are reused from the saved snapshot. Revised and new questions are researched and
   designed as on a first screen. Saved clubs keep their order in `d.clubs` and new ones are appended.
3. The compiler gets the saved parts as `base`, minus parts that show only removed questions. Parts
   showing a revised or removed question are `editable`: the writer may rewrite them under their id.
   Every other part is kept byte for byte. A base part whose reads no longer resolve is dropped unless
   rewritten, and its questions fall back.
4. The next revision is committed atomically under a per-document lock. Only then does the stream send
   `templates`, `data`, `openui {text, replace: true}` (the whole program) and `done` with
   `document: {id, revision}`. Until then it sends only `activity` and `usage`. A failure sends
   `failure` and commits nothing. 404 for an unknown document, 409 `revision_conflict` when
   `baseRevision` is stale, 400 `unknown_target` for a target that names no part.

## The SwiftUI renderer

The app renders the same OpenUI program as the web. It keeps one set of view objects for the whole conversation and changes only the elements a new revision changes. The code lives in `ios/OpenUIGen/GenUI/` in this repository, in four layers.

### The compiler turns text into elements

`OpenUICompiler` in `GenUI/Core/OpenUI` parses the program and evaluates it against the dataset seeds. The result is a scene: a list of root element ids and, for each element, its kind, evaluated properties and child slots. Arguments map to the catalog's positional args by index: `node` and `nodes` args become slots, the rest become properties.

A call to a name that is not a primitive is a template call. The compiler looks it up in the run's templates (or the bundled `sports-components.json`), binds each argument to its param in a fresh scope, and evaluates the body there, mounted where the call sits. The element ids are the same as the expanded program's, and a caller's `@Each` item cannot collide with the template's own.

```text
program text + seeds → OpenUICompiler → scene {roots, elements by id}
```

The element id is what keeps a view alive across revisions, so the compiler builds it from things that do not change between revisions. It starts with the document id. Then comes the statement name, such as `ref:pick2`. Then the path inside that statement, such as `children/1`. An `@Each` item adds `item:3`. The document id equals the first run id, and later run ids and request ids are never part of it. A statement mounts under its own name, so adding a part before `pick2` does not rename anything inside `pick2`.

### The session keeps the handles

`OpenUISession` in `GenUI/Runtime` owns the program, the seeds, and one handle per element. Views observe handles, not the scene.

```text
program text + seeds → OpenUICompiler → scene
                                          │
                                OpenUISession.commit
                                          │
                     root handle · slot handles · element handles
```

There are three kinds of handle. `OpenUIRootHandle` holds the top-level children. `OpenUISlotHandle` holds the children of one slot, such as a card's `children`. `OpenUIElementHandle` holds one element's properties, plus a fixed set of slot handles.

Each compile ends in one commit on the main actor. For every element in the new scene the commit looks up the handle with the same id. If the kind and slot names match, it keeps that handle and writes `properties` only when the new value differs. Otherwise it makes a new handle. It then sets each slot's children, writing only when the list of handle objects differs. Handles whose ids are gone are dropped. Because a write happens only on a real difference, an element whose props did not change produces no observation event.

### The renderer draws handles

`OpenUISceneView` in `GenUI/Renderer` draws the root handle's children. Each child view receives its handle directly. `PrimitiveProps(handle:)` reads the handle's prepared properties, and `PrimitiveVisual` switches on the kind string to pick the design system view. A kind with no case draws a red outline in debug builds and nothing in release builds. A container reads its slot handle's children and draws each through the same path.

```text
scene → session.commit → handles → OpenUISceneView → design system views
```

No view reads a whole tree or a whole dataset from the environment. A text view observes only its own element handle. A card observes only its own slots. When `pick2`'s summary changes, the commit writes one element handle, and only that text view's body runs again. Its parents keep their state.

### The network layer and the Ask screen

`OpenUIStreamService` in `GenUI/Streaming` posts to `/lang/sports/stream` and decodes the SSE events; a session with a document posts follow-ups to `/lang/sports/:documentId/follow-up` (409 → `staleRevision`).

```text
AskView → AskModel → OpenUISession.ask → OpenUIStreamService → backend
                           │
                     scene → commit → handles → OpenUISceneView
```

`AskModel` keeps one session; once `done` carries a `document`, the next prompt is a follow-up on it.

### What this does not do yet

- The compiler evaluates the whole program on every commit. The savings are in view updates, not in evaluation work.
- `@Each` items are identified by index. A reordered collection rewrites the moved rows' properties instead of moving their views.
- The session can export an `OpenUIArchive`, but History does not store it yet.
- The iOS follow-up path is covered by `OpenUISessionTests` against a fake stream, not yet against the live server.
- The compiler checks only that each primitive exists and has no extra arguments. Token, style and copy values are not validated on the device: the server's compiler is the gate.

The backend derives skeleton frames from the evaluated OpenUI frame; primitive skeleton
descriptions remain strings.
