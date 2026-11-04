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
`Grid`, `Rail`, `Text`, `Number`, `ColorCell`, `PriceChart`, and `Calculation`. Each has zod props whose key order
is the positional order on the wire, a role per prop (`node`, `nodes`, `data`, `copy`, `token`), and
ground rules the renderer applies (a Card has radius 24 and padding 16; props only choose between
allowed tokens).

`src/lang/library.ts` turns them into an `@openuidev/lang-core` library with `component: null`. That
gives the JSON schema, the prompt signatures and the parser. Clients attach their own renderers by
primitive name:

- web: `preview/components/primitives/openui-render.tsx` maps every name to `KinoPrimitive`
  (`Calculation` to `KinoCalculation`), using `@openuidev/react-lang`'s `Renderer`;
- SwiftUI: `OpenUICompiler` and the Kino views (see below).

Templates are server-side compositions the writer may call, as typed builders (`ui.Card(...)`) that
expand to primitives when admitted, so clients never learn a template, only primitives. The
sports pack includes MatchCard, TeamDetail, StatBar, Leaderboard, FixturesHeatmap, StatsCard, TeamPoints, LeagueStanding, MatchTopPlayers, PlayerValue, and SeasonPodium.
Their contracts live in `src/sports/components.ts`. See `catalog/sports-parity.md` for source-design coverage and remaining visual differences.

```text
root = Screen([pick1, pick2])
d = Query("sports_dataset", {run: "…"}, {})
pick1 = Section("Premier League table", [Stack("v", 8, @Each(d.answers.q1.table, "row", Row(...)))])
pick2 = Card([Text(d.answers.q2.title, "headline"), ...])
```

### The component schema index

`npm run openui:export` writes what native clients load:

- `catalog/openui/primitives.json`: every primitive with its positional props and roles, and a
  digest of the lang-core schema. The iOS app bundles it directly.
- `catalog/openui/sports-components.json`: the sports template contracts and usage guidance.
- `catalog/openui/fixtures.json`: shared compiler fixtures, including full and sparse sports records.

`--check` fails when it is stale.
`catalog/sf-symbols.json` (`npm run sf-symbols`) is the icon allowlist the compiler checks names against.

## The compiler

The writer writes lowercase statements (`peers = Section(...)`, `peers_cards = Rail(...)`). For each
statement the compiler:

- parses it and expands template calls into primitives;
- checks components, child slots, data paths and types, SF Symbols and the pack's collection rule;
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
| `activity` | stage, status and detail for each step |
| `data` | the dataset seed `{tool: "sports_dataset", args: {run}, result}` |
| `skeleton` | frames for the planned parts, before content |
| `openui` | `{text}`: complete statements to append; later assignments to an id replace earlier ones |
| `issue` | a recoverable problem with its statement id |
| `done` | `{program, issues, holes, timings, model, document: {id, revision: 1}}`, sent after the screen is saved |
| `failure` | `{error, message}` |

The `data` event warms the client's tool provider. A client without the seed replays the query
through `POST /tools/sports_dataset` with `{run}`. Snapshots live in memory (bounded) and under
`DATA_DIR/openui-snapshots`.

`@Each` output can contain nested child arrays, which renderers flatten before laying out rails, grids
and segmented panels. Data arrays, such as chart points, stay data. Calculators are special:
evaluated numbers no longer carry their binding paths, so the `Calculation` renderer reads its source
subtree by statement id. This keeps local slider and choice edits independent per calculator.

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
   `data`, `openui {text, replace: true}` and `done` with `document: {id, revision}`. A failure sends
   `failure` and commits nothing. 404 for an unknown document, 409 `revision_conflict` when
   `baseRevision` is stale, 400 `unknown_target` for a target that names no part.

## The SwiftUI renderer

The app renders the same OpenUI program as the web. It keeps one set of view objects for the whole conversation and changes only the elements a new revision changes. The code lives in `ios/OpenUIGen/GenUI/` in this repository (ported from FitnessGin), in four layers.

### The compiler turns text into elements

`OpenUICompiler` in `GenUI/Core/OpenUI` parses the program and evaluates it against the dataset seeds. The result is a scene: a list of root element ids and, for each element, its kind, evaluated properties, child slots, and the data path each property read.

```text
program text + seeds → OpenUICompiler → scene {roots, elements by id}
```

The element id is what keeps a view alive across revisions, so the compiler builds it from things that do not change between revisions. It starts with the document id. Then comes the statement name, such as `ref:pick2`. Then the path inside that statement, such as `children/1`. An `@Each` item adds `item:3`. The document id equals the first run id, and later run ids and request ids are never part of it. A statement mounts under its own name, so adding a part before `pick2` does not rename anything inside `pick2`.

The compiler also handles calculators. When a `Calculation` reads its input record, the compiler overlays the user's local edits on that record and computes the outputs with `GrowthCalculation`. A slider's `value` property records which calculator input it edits.

### The session keeps the handles

`OpenUISession` in `GenUI/Runtime` owns the program, the seeds, the local edits, and one handle per element. Views observe handles, not the scene.

```text
program text + seeds → OpenUICompiler → scene
                                          │
                                OpenUISession.commit
                                          │
                     root handle · slot handles · element handles
```

There are three kinds of handle. `OpenUIRootHandle` holds the top-level children. `OpenUISlotHandle` holds the children of one slot, such as a card's `children`. `OpenUIElementHandle` holds one element's properties and calculator bindings, plus a fixed set of slot handles.

Each compile ends in one commit on the main actor. For every element in the new scene the commit looks up the handle with the same id. If the kind and slot names match, it keeps that handle and writes `properties` only when the new value differs. Otherwise it makes a new handle. It then sets each slot's children, writing only when the list of handle objects differs. Handles whose ids are gone are dropped. Because a write happens only on a real difference, an element whose props did not change produces no observation event.

### The renderer draws handles

`OpenUISceneView` in `GenUI/Renderer` draws the root handle's children. Each child view receives its handle directly. `PrimitiveProps(handle:)` reads the handle's prepared properties, and `PrimitiveVisual` sends the kind to the same Kino views the old renderer used. A container reads its slot handle's children and draws each through the same path.

```text
scene → session.commit → handles → OpenUISceneView → Kino views
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
- Calculator edits stay with their calculator across follow-ups only while the calculator keeps its id. There is no conflict marker when the server changes an input the user edited.
- The session can export an `OpenUIArchive`, but History does not store it yet.
- The OpenUI Ask answer shows the progress checklist before content, not the skeleton.
- The iOS follow-up path is covered by `OpenUISessionTests` against a fake stream, not yet against the live server.

The backend derives skeleton frames from the evaluated OpenUI frame; primitive skeleton
descriptions remain strings.
