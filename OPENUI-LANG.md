# OpenUI Lang generation

A stocks request becomes an OpenUI Lang program: a screen of standard OpenUI statements that the
server writes, checks and streams, and that every client (web preview, SwiftUI) evaluates with the
same component library. This document describes the pipeline, the component library, follow-ups and
the native renderer.

## The pipeline

```text
prompt → plan questions → answer them → writer + compiler → program + dataset snapshot
```

| Stage | Code | Result |
| --- | --- | --- |
| Plan | `src/stocks/questions.ts` `planQuestions` | Haiku reads the request once and breaks it into independent questions, each routed to a lookup (`peers`, `stats`, `earnings`, `consensus`, `quarters`, `web`, `basket`, `expectation`, …) plus the subject. |
| Answer | `src/stocks/answers.ts` `answerQuestions` | Every question runs at once against Massive (FMP fallback) and cited web research. Each answer carries `status` (complete, partial, unavailable) and the note to show when it is not complete. Nothing throws for a provider failure except the subject's own prices. |
| Snapshot | `src/lang/snapshots.ts` | The dataset `{subject, answers}` is stored under the run id. Programs read it through `Query("stocks_dataset", {run}, {})`. |
| Compose | `src/lang/compiler.ts` `compileScreen` with `src/stocks/lang/screen.ts` `STOCKS_SCREEN` | The writer authors the screen as named statements; the compiler admits each one as it streams. |

Search happens before composition. The writer receives sourced data and references it by path; it
never types a price or a fact.

## The component library

`src/lang/primitives.ts` is the only list of primitives (42: `Screen`, `Section`, `Card`, `Stack`,
`Grid`, `Rail`, `Text`, `Number`, `PriceChart`, `Calculation`, …). Each has zod props whose key order
is the positional order on the wire, a role per prop (`node`, `nodes`, `data`, `copy`, `token`), and
ground rules the renderer applies (a Card has radius 24 and padding 16; props only choose between
allowed tokens).

`src/lang/library.ts` turns them into an `@openuidev/lang-core` library with `component: null`. That
gives the JSON schema, the prompt signatures and the parser. Clients attach their own renderers by
primitive name:

- web: `preview/components/primitives/openui-render.tsx` maps every name to `KinoPrimitive`
  (`Calculation` to `KinoCalculation`), using `@openuidev/react-lang`'s `Renderer`;
- SwiftUI: `OpenUICompiler` and the Kino views (see below).

Templates are server-side compositions the writer may call: `StockCard`, `PeerCards`,
`EarningsCard`, `ConsensusSet`, `BasketCard`, `InvestmentExpectation`, `FindingCard`, `PeriodTable`
and others in `src/stocks/lang/`. They are typed builders (`ui.Card(...)`) that expand to primitives
when admitted, so clients never learn a template, only the 42 primitives.

```text
root = Screen([pick1, pick2])
d = Query("stocks_dataset", {run: "…"}, {})
pick1 = Stack("v", 16, [...d.subject...])
pick2 = Section("NVDA competitors", [Rail(12, @Each(d.answers.q1.items, "p", Card([...])), 170)])
```

### The component schema index

`npm run openui:export` writes what native clients load:

- `catalog/openui/primitives.json`: every primitive with its positional props and roles, and a
  digest of the lang-core schema;
- `catalog/openui/fixtures.json`: one program per template variant, compiled by the real compiler over
  the recorded datasets in `eval/fixtures/`, with the element tree a renderer must produce.

`--check` fails when either is stale; `--ios <dir>` also writes them into the app's Resources.
`catalog/sf-symbols.json` (`npm run sf-symbols`) is the icon allowlist the compiler checks names against.

## The compiler

The writer writes lowercase statements (`peers = Section(...)`, `peers_cards = Rail(...)`). For each
statement the compiler:

- parses it and expands template calls into primitives;
- checks components, child slots, data paths and types, SF Symbols and the collection rule (a list
  shows 1–5 items, a rail 6 or more, unless the user asked for a layout);
- links a part once every statement it references is admitted, renames it `pickN`, and records which
  questions it shows from the data it reads.

Writer statements cannot introduce queries, actions, state or references to server statements. After
the writer finishes, one repair round names unfinished parts and uncovered questions. Any question
still not shown gets the template's default part (`fallback`), so a partial or unavailable answer
always shows its note. Recoverable problems are `issue` events; a writer failure still yields a usable
program from fallbacks. The server prints every admitted expression itself; clients never receive raw
writer output.

## Streaming and client behavior

`POST /lang/stocks/stream` with `{prompt, model?, timeZone?}` sends:

| Event | Payload |
| --- | --- |
| `activity` | stage, status and detail for each step |
| `data` | the dataset seed `{tool: "stocks_dataset", args: {run}, result}` |
| `skeleton` | frames for the planned parts, before content |
| `openui` | `{text}`: complete statements to append; later assignments to an id replace earlier ones |
| `issue` | a recoverable problem with its statement id |
| `done` | `{program, issues, holes, timings, model, ticker, document: {id, revision: 1}}` |
| `failure` | `{error, message}` |

The `data` event warms the client's tool provider. A client without the seed replays the query
through `POST /tools/stocks_dataset` with `{run}`. Snapshots live in memory (bounded) and under
`DATA_DIR/openui-snapshots`.

`@Each` output can contain nested child arrays, which renderers flatten before laying out rails, grids
and segmented panels. Data arrays, such as chart points, stay data. Calculators are special:
evaluated numbers no longer carry their binding paths, so the `Calculation` renderer reads its source
subtree by statement id. This keeps local slider and choice edits independent per calculator.

## Follow-ups edit the saved screen

When the first stream finishes, the server saves a document under `DATA_DIR/openui-documents`: the
program, the snapshot, the subject, every question, the parts with the questions each shows, and the
conversation turns. Its id is the first run id. Writes are atomic (temp file, then rename) and survive
restarts.

`POST /lang/stocks/:documentId/follow-up` takes `{prompt, baseRevision, targets?, model?, timeZone?}`.

1. Haiku reads the follow-up against the saved questions and parts (`planFollowUp`) and returns new
   questions (each may `replace` a saved one), parts to `restyle`, parts to remove, and the
   standalone request.
2. Only the new questions are answered. Answers are write-once under new ids, so the new snapshot is
   the union of saved and fresh answers.
3. The compiler runs with the saved parts as its base. Parts that read a replaced question or are
   restyled may be rewritten; every other part is kept byte for byte with its id.

While it works the route sends only `activity`. After the new revision is stored it sends `data`,
`openui {text, replace: true}` with the complete program, and `done` with `document: {id, revision}`.
A missing document is 404, a stale `baseRevision` 409, an unknown target 400, and a document saved
before question planning 410. A failure appends no turns and leaves the revision unchanged.

The full program is a new source revision, not an instruction to rebuild the view. Clients identify
elements by statement id, position under that statement and `@Each` item, compare evaluated props,
and publish only what changed. `OPENUI-FOLLOWUPS.md` has the native contract.

## The SwiftUI renderer

The app renders the same OpenUI program as the web. It keeps one set of view objects for the whole conversation and changes only the elements a new revision changes. The code lives in the FitnessGin app repository, in four layers.

### The compiler turns text into elements

`OpenUICompiler` in `GenUIPrimitives/OpenUI` parses the program and evaluates it against the dataset seeds. The result is a scene: a list of root element ids and, for each element, its kind, evaluated properties, child slots, and the data path each property read.

```text
program text + seeds → OpenUICompiler → scene {roots, elements by id}
```

The element id is what keeps a view alive across revisions, so the compiler builds it from things that do not change between revisions. It starts with the document id. Then comes the statement name, such as `ref:pick2`. Then the path inside that statement, such as `children/1`. An `@Each` item adds `item:3`. The document id equals the first run id, and later run ids and request ids are never part of it. A statement mounts under its own name, so adding a part before `pick2` does not rename anything inside `pick2`.

The compiler also handles calculators. When a `Calculation` reads its input record, the compiler overlays the user's local edits on that record and computes the outputs with `GrowthCalculation`. A slider's `value` property records which calculator input it edits.

### The session keeps the handles

`OpenUISession` in `GenUIOpenUIRuntime` owns the program, the seeds, the local edits, and one handle per element. Views observe handles, not the scene.

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

`OpenUISceneView` in `GenUIPrimitiveRenderer` draws the root handle's children. Each child view receives its handle directly. `PrimitiveProps(handle:)` reads the handle's prepared properties, and `PrimitiveVisual` sends the kind to the same Kino views the old renderer used. A container reads its slot handle's children and draws each through the same path.

```text
scene → session.commit → handles → OpenUISceneView → Kino views
```

No view reads a whole tree or a whole dataset from the environment. A text view observes only its own element handle. A card observes only its own slots. When `pick2`'s summary changes, the commit writes one element handle, and only that text view's body runs again. Its parents keep their state.

### The network layer and the Ask screen

`OpenUIStreamService` in `FitnessGinNetworking` posts to `/lang/stocks/stream` for a first question and to `/lang/stocks/:documentId/follow-up` for later ones. It decodes the SSE events and turns a 409 into `staleRevision`.

```text
StockDetailView Ask → OpenUISession.ask → OpenUIStreamService → backend
                           │
                     scene → commit → handles → OpenUISceneView
```

The stock Ask tray creates one session per stock page. `session.ask` starts a document the first time and sends a follow-up after that, with the saved document id and revision. The first question carries the ticker as a cashtag. Follow-ups go as typed, because the backend resolves the subject from the conversation.

### A follow-up on the device

The first answer streams. Each `openui` event appends statements, and the session recompiles and commits as they arrive, so the screen fills in.

A follow-up is staged. While the backend works, the session records activity and the answer stays on screen, with a small badge showing the current step. Seeds and the replacement program are held until `done`. The session then checks that `done` names the same document and the next revision. It adds the new seed, compiles the new program, and commits once. If compiling fails, it restores the previous program and seeds and keeps the screen as it was.

For "NVDA upcoming earnings" followed by "get the latest report rather than upcoming", the commit keeps the earnings card's handles. It writes new values into the texts that show the period, date, and summary. Nothing else on the screen gets a write.

### What this does not do yet

- The compiler evaluates the whole program on every commit. The savings are in view updates, not in evaluation work.
- `@Each` items are identified by index. A reordered collection rewrites the moved rows' properties instead of moving their views.
- Calculator edits stay with their calculator across follow-ups only while the calculator keeps its id. There is no conflict marker when the server changes an input the user edited.
- The session can export an `OpenUIArchive`, but History does not store it yet.
- The OpenUI Ask answer shows the progress checklist before content, not the skeleton.
- Nothing has proven the native follow-up on a device. The app builds with SwiftLint, and `FitnessGinUITests` drives the NVDA question and follow-up against a live backend. In the simulator the expanded Ask tray lays its content out below the screen, on `main` as well as on this branch, so the test cannot reach the input yet. There are no unit tests for the commit yet.

The backend derives skeleton frames from the evaluated OpenUI frame; primitive skeleton
descriptions remain strings.
