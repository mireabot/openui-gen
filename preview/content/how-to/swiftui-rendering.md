# From DSL to SwiftUI

This guide explains how the iOS app renders OpenUI Lang, the DSL the writer produces. The server sends program text, with the component templates the program calls. The device compiles that text into elements with finished values. SwiftUI draws those elements from `@Observable` handles that the next compile reuses.

## Follow one primitive

1. **Define.** Every primitive is one entry in `PRIMITIVES` in `src/lang/primitives.ts`. The key order of its props is the argument order in the language, so moving a prop changes the language.
2. **Export.** `npm run openui:export` writes `catalog/openui/primitives.json`. It keeps each primitive name and its arguments. Intent, rules and skeleton notes stay behind. XcodeGen adds the file to the app bundle through `ios/project.yml`. No build step runs the export.
3. **Compile.** `OpenUICompiler` in `GenUI/Core/OpenUI/OpenUICompiler.swift` walks the catalog arguments by index. Arguments with the role `node` or `nodes` become slots. Every other argument becomes a property.
4. **Retain.** `OpenUISession.commit` in `GenUI/Runtime/GenUIOpenUIRuntime.swift` stores each element in an `OpenUIElementHandle`. Each slot has its own `OpenUISlotHandle`.
5. **Draw.** `OpenUIElementView` passes the kind and props to `PrimitiveVisual`, which switches on the kind string in `GenUI/Renderer/Node/PrimitiveNodeView.swift`. A kind with no case draws a red outline in debug builds and nothing in release builds.

For example, this statement:

```
pick1_title = Text(d.answers.q1.title, "title2", "semibold")
```

compiles to an element with id `r1:ref:pick1_title`, kind `Text`, the properties `content: "Top scorers"`, `role: "title2"` and `weight: "semibold"`, and no slots.

## The catalog carries positions

The catalog holds more than Swift uses. Primitive names, argument order and the slot role change behavior on the device. Token values, enums and data shapes are enforced only on the server. Component templates are not in the primitive catalog. They arrive with each run.

- A component call, such as `MatchCard(d.answers.q1.match)`, passes on the server, because `validate` expands it with the pack's templates and checks every primitive. The program keeps the call. On the device, `MatchCard` is not a primitive, so the compiler looks up its template from the run's `templates` event, or from the copy bundled with the app.

- A token that does not exist, such as `Text("Top scorers", "huge")`, fails on the server with `type-mismatch` on `Text/role`. The device receives an `issue` event and never sees the statement. If the text did reach a device, Swift would use the body role with no error.
- A primitive newer than the app, or a name that is neither a primitive nor a template, makes compile throw `unknownPrimitive`. The whole commit stops, and the screen stays at its last good state.
- A catalog entry with no Swift case compiles into an element, then draws `UnknownPrimitive`.
- An argument moved after the app shipped lands in the wrong prop with no error.

Design tokens take three routes. Token names and validation live in `src/primitives/tokens.ts` and stay on the server. Spacing values travel as plain numbers in the program. Type sizes are copied by hand into `PrimitiveTokens.swift` and `render.tsx`. Colors and component anatomy skip TypeScript, because the app bundles `design_system.json` directly.

## Props choose the container

A layout is a tree of primitives that hold slots. Nothing in the program describes a frame or a position. `StackPrimitive` reads `axis`, `gap` and `justify`, then chooses a SwiftUI container:

- `Stack("v", 8, children)` becomes a `VStack` whose children fill the width.
- `Stack("h", 8, children)` becomes an `HStack`.
- `Stack("h", 8, children, null, "between")` becomes an `HStack` with spacing 0 and `Spacer(minLength: 8)` between the children. The spacers are siblings, so text can still wrap.
- `Stack("wrap", 8, children)` becomes `FlowLayout`, a custom `Layout`. Children keep their own width and flow into rows.
- `Grid("2", 12, children)` becomes `ColumnsLayout`, a custom `Layout` with equal-width columns.

The render loop for one level of the tree is:

1. `OpenUISceneView` removes `Screen` and lays its children out with the screen inset. `Screen` has no case in the switch.
2. `OpenUIElementView` reads properties from the handle and builds `PrimitiveProps`.
3. `PrimitiveVisual` returns the matching primitive view.
4. A container view reads its child slot with `childReferences`, so it tracks that one list.
5. `PrimitiveNodeView` wraps each child handle and returns to step 2.

Layout context travels through the SwiftUI environment. `primitiveStackAxis` tells `Spacer` which way to grow. `primitiveBleed` gives full-bleed children their reach, and a `Card` resets it to its own padding. `primitiveRailWidth` sizes items in a rail.

## A component travels by name and expands on the device

The writer calls Sports components by name, and the program keeps the call on the wire. Each component's template, an OpenUI Lang body over its parameters, travels as data. The device expands the call before it builds elements, so it still draws only primitives. Most templates are a tree of primitives inside a `Card` or a `Stack`. `PlayerValue`'s template is a single data primitive, `StepTimeline`, and its complexity lives in one Swift view.

`PlayerValue` reaches the screen in six stages:

1. **Record.** `playerValueChart` in `src/sports/fotmob.ts` turns FotMob's market values into one record. It starts a new stretch whenever the club changes. It takes `lineColor` from the club's dark-mode colour and `tagColor` from its light-mode colour. The answer stores the record under `chart`.
2. **Call.** The briefing lists `PlayerValue` as a candidate, because the record fits its contract. The writer passes one data reference: `palmerValue = PlayerValue(d.answers.q1.chart)`. Other components take params after the record. `StatsCard(record, false)` hides the header card.
3. **Check.** The template is the component's `build` in `src/sports/components.ts`, printed once by `npm run openui:export` into `catalog/openui/sports-components.json`:

	```
	{ name: "PlayerValue", params: [{ name: "record", role: "data" }],
	  body: "StepTimeline(record.value, record.segments, record.ticks, record.caption)" }
	```

	`validate` in `src/lang/compiler.ts` expands the call with `expandCall` and checks every primitive in the expansion against the real data. It admits the statement as the writer wrote it. The expansion is used only for checking and for coverage, and it is never sent.
4. **Wire.** Before any data or program text, a `templates` event carries every component's template. The compiler renames the part to `pick1` and sends `pick1 = PlayerValue(d.answers.q1.chart)`. `done` and the saved document carry the templates the program uses, so a saved screen replays with the templates it was drawn with.
5. **Expand.** `OpenUICompiler` finds no primitive named `PlayerValue`, so it looks up the template. It evaluates the argument in the caller's scope, binds the result to `record` in a fresh scope, and evaluates the body there. The body mounts where the call sits, so the id is `r1:ref:pick1`, the same as for the expanded program. The fresh scope holds only the template's parameters, so a caller's `@Each` item never collides with the template's own.
6. **Draw.** The device has one element with kind `StepTimeline`, four properties and no slots. `PrimitiveVisual` returns `StepTimelinePrimitive` in `GenUI/Renderer/Primitives/StepTimelinePrimitive.swift`. That view turns `segments` into stretches, then draws the header, the stepped lines, the crests, the dot and the price axis. The scrub selection is `@State` inside the view, so a commit with new values keeps it.

The server and the web preview expand calls with `expandProgram` in `src/lang/templates.ts`. It substitutes the arguments as text, so it renames the template's own `@Each` items first (`e` becomes `eLeaderboard`) to keep an outer item from being captured.

Each record field lands in one part of the view:

| Field | Read by | Draws |
| --- | --- | --- |
| `value` | `header` | The current value at the top left. With fewer than two points, the view draws only this text. |
| `caption` | `header` | One footnote line under the value. An empty caption draws nothing. |
| `segments[].name` | `stretches` | The club name at the top right, only while the finger scrubs that stretch. |
| `segments[].lineColor` | `stretches` | The stretch's line, its dot and its name while scrubbing. A value that does not start with `#` falls back to primary ink. |
| `segments[].tagColor` | `stretches` | The tag behind the scrubbed value, with white text. |
| `segments[].logo` | `crest` | A 20-point crest centred on its stretch. A stretch narrower than 20 points gets no crest. |
| `points[].x` | `stretches` | The horizontal position, in milliseconds. The scrub snaps to the nearest point in time. |
| `points[].label` | `header` | The date while scrubbing. The chart has no date axis. |
| `points[].value` | `plot` | The height of the line. The y axis starts at zero, and the highest value sets the top. |
| `points[].display` | `header` | The scrubbed value, on the tag colour. |
| `ticks[]` | `axis` | Price labels at the trailing edge, level with their values. |

To add a complex element, decide where its complexity lives. If existing primitives can draw it, write the component as a `build` that returns a tree. `npm run openui:export` prints the build as its template, and the template reaches devices with the next run, with no app release. If it needs new drawing or gestures, add a primitive to `PRIMITIVES`, run `npm run openui:export` and add a Swift case to `PrimitiveVisual`. The component then becomes a thin template over that primitive.

## The wire carries program text

The server never sends a tree. It sends text in chunks of complete statements, and the device parses and evaluates all of its text after each chunk.

Events arrive in this order for a new screen:

1. `templates` carries every component's template. The session compiles with them from now on, in place of the copy bundled with the app.
2. `activity` and `usage` report progress during research.
3. `data` carries the whole saved snapshot. The session stores it and adopts the run as its document key.
4. `skeleton` carries predicted frames, built from fallback parts for each question, just before the writer starts.
5. `openui` carries the opening text: `d = Query(...)` and `root = Screen([])`.
6. More `openui` events each carry one finished part with a new root line. `issue` events may appear between them.
7. `done` carries the canonical program, the templates it uses and the document version. A strict compile runs, then `finish()` removes the skeleton.

A follow-up stages `templates`, `data` and `openui` and commits them together after `done`.

The server holds a part until every statement it references has passed validation (`src/lang/compiler.ts`). A part and all its children land in one event and one synchronous commit, so a card never appears half built. The cost is silence, because a long part shows nothing until its last statement passes.

The parser keeps the last assignment for each name, so a growing `root` line replaces the old one. Evaluation is lazy from `root`, so statement order does not matter.

Each finished part removes one skeleton frame by count. The last frame stays until the stream ends, because the writer may have more parts than the plan had questions. `OpenUISceneView` draws remaining frames in a second `ForEach` under the real blocks.

Running the real `OpenUISession` on a two-part example gives these commit counts. The opening creates 1 element. Part 1, a `Stack` with two `Text` children, creates 3 elements and writes 2 slots. Part 2, a `Stack` with an `@Each` over three rows, creates 4 elements and writes 2 slots, and part 1 receives no writes. `done` writes nothing when the elements match.

When something fails:

- If a statement is rejected, the server drops it and sends an `issue` event. Its text never reaches the device. The writer gets one repair round. Questions still uncovered get a fallback part, which appears only in `done.program`.
- If the connection ends without `done`, the service throws `incompleteStream`. A session with content calls `finish()` and rethrows, so visible parts stay and `AskModel` shows the error.
- If compile fails during streaming, the session logs the error and keeps the last good commit. A later chunk or `done` can recover the screen.

## A view lives as long as its handle

Each chunk produces a whole new scene, and SwiftUI must not rebuild the screen for it. An element id is the document key plus a mount path. A statement mounts under its own name the first time it appears, so `pick1` stays at `ref:pick1` when the root grows or reorders.

`commit` reuses a handle when the id, the kind and the slot names all match, and it writes only values that differ. A reused handle keeps its SwiftUI identity and `@State`.

- A changed value reuses the handle: `updated 1`, and `@State` stays.
- An unchanged program writes nothing.
- A root that gains a part creates elements only for the new part.
- A changed kind creates a new handle: `created 1`, `slots 1`, and `@State` resets.
- Reordered `@Each` rows reuse their handles, because ids come from the row index and not from the data. Two swapped rows give `updated 2`, and local state stays at its old row.

## Swift views receive values, not paths

A reference like `d.answers.q1.rows` never reaches a SwiftUI view. `OpenUICompiler` resolves it and stores the result in the element:

1. `query` finds the last dataset whose tool and args match the `Query`.
2. `access` walks the path one step at a time. A missing step gives null.
3. The value lands in `element.properties`.
4. The view reads it through `PrimitiveProps`, which treats null as nil.

`@Each` copies the evaluation context and adds an alias for each row, so `r.name` is a lookup in that copy. It is a compile-time alias and not a runtime scope. A template call works the other way round: it starts from an empty context that holds only the template's parameters.

When data is missing:

- A missing field draws a dash in `TextPrimitive`. An empty string draws no line.
- A missing list makes `@Each` produce no nodes. The container exists with an empty slot, and no error is raised.
- No matching dataset throws `missingQuery`. While streaming, the session logs it and retries on the next chunk. At `done` it ends the run, and content already on screen stays.

New data takes the same path as the first compile. A follow-up holds the new dataset and program until `done` confirms the next revision, then compiles once. The document key stays the same, so element ids match. In a measured run, changing one player's goals from 24 to 25 gave `updated 1` with the other handles untouched. `@Observable` tells SwiftUI which handle changed.

A primitive has two kinds of state:

- **Evaluated props** live in `handle.properties`. Only `commit` writes them.
- **Local UI state** lives in `@State` inside a primitive: `Toggle`, `Stepper`, `Chip`, `SegmentedControl` and an open `Section`. Only that view can read it. Once set, it ignores later prop updates for that handle.

No SwiftUI binding connects two primitives. The language has no variables, so a `Toggle` cannot drive a `Show`. To change what another view shows, the program or the dataset has to change.

`registry` and `lastCommit` are marked `@ObservationIgnored`. `update` assigns only when a value differs, and a slot's `set` assigns only when the list differs by object identity. `OpenUIElementView` tracks properties, a container tracks its own slot, and the scene tracks root membership. These rules limit which writes happen. Whether each redraw stops at the changed view has not been measured.

## What the bridge does not check

- Swift decodes the catalog digest and never reads it, and the server does not send one. Templates travel with each run, but a primitive newer than the app still fails the compile.
- `OpenUIFixtureTests` compares compiled trees, for each expanded sample and for the same sample called by name. It tests no view code. It runs with `make test` and not in CI. A typo in a prop name read by a view passes every check.
- `check:sports-catalog` looks for a Swift case for each kind in the sports fixtures. A new primitive outside those fixtures gets no renderer check on either side.
- `Button`, `IconButton` and row actions call `PrimitiveActionDispatcher` through the `primitiveContext` environment value. It does nothing until a host sets one, so these taps are inert today. Actions can be wired when a screen needs them.

## Evidence

This guide comes from reading the code and from running example programs through the real `OpenUICompiler` and `OpenUISession` in a scratch macOS harness. SwiftUI views were not run for it. The stream order comes from the server code, not from a captured live run. The template stages come from `OpenUIFixtureTests` and `check:templates`, which compile every catalog sample both expanded and called by name.
