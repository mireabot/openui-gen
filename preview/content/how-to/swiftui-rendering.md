# How an OpenUI program becomes SwiftUI

This document explains how the iOS app renders OpenUI lang. The server sends program text. The device compiles that text into elements with finished values. SwiftUI draws those elements from `@Observable` handles that the next compile reuses.

## How a primitive is established

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

## The contract between TypeScript and Swift

The catalog holds more than Swift uses. Primitive names, argument order and the slot role change behavior on the device. Token values, enums and data shapes are enforced only on the server.

- A token that does not exist, such as `Text("Top scorers", "huge")`, fails on the server with `type-mismatch` on `Text/role`. The device receives an `issue` event and never sees the statement. If the text did reach a device, Swift would use the body role with no error.
- A primitive newer than the app makes compile throw `unknownPrimitive`. The whole commit stops, and the screen stays at its last good state.
- A catalog entry with no Swift case compiles into an element, then draws `UnknownPrimitive`.
- An argument moved after the app shipped lands in the wrong prop with no error.

Design tokens take three routes. Token names and validation live in `src/primitives/tokens.ts` and stay on the server. Spacing values travel as plain numbers in the program. Type sizes are copied by hand into `PrimitiveTokens.swift` and `render.tsx`. Colors and component anatomy skip TypeScript, because the app bundles `design_system.json` directly.

## Layout composition

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

## Streaming

The server never sends a tree. It sends text in chunks of complete statements, and the device parses and evaluates all of its text after each chunk.

Events arrive in this order for a new screen:

1. `activity` and `usage` report progress during research.
2. `data` carries the whole saved snapshot. The session stores it and adopts the run as its document key.
3. `skeleton` carries predicted frames, built from fallback parts for each question, just before the writer starts.
4. `openui` carries the opening text: `d = Query(...)` and `root = Screen([])`.
5. More `openui` events each carry one finished part with a new root line. `issue` events may appear between them.
6. `done` carries the canonical program and the document version. A strict compile runs, then `finish()` removes the skeleton.

The server holds a part until every statement it references has passed validation (`src/lang/compiler.ts`). A part and all its children land in one event and one synchronous commit, so a card never appears half built. The cost is silence, because a long part shows nothing until its last statement passes.

The parser keeps the last assignment for each name, so a growing `root` line replaces the old one. Evaluation is lazy from `root`, so statement order does not matter.

Each finished part removes one skeleton frame by count. The last frame stays until the stream ends, because the writer may have more parts than the plan had questions. `OpenUISceneView` draws remaining frames in a second `ForEach` under the real blocks.

Here are the commit counts for a two-part example, measured by running the real `OpenUISession`. The opening creates 1 element. Part 1, a `Stack` with two `Text` children, creates 3 elements and writes 2 slots. Part 2, a `Stack` with an `@Each` over three rows, creates 4 elements and writes 2 slots, and part 1 receives no writes. `done` writes nothing when the elements match.

Failures behave as follows:

- If a statement is rejected, the server drops it and sends an `issue` event. Its text never reaches the device. The writer gets one repair round. Questions still uncovered get a fallback part, which appears only in `done.program`.
- If the connection ends without `done`, the service throws `incompleteStream`. A session with content calls `finish()` and rethrows, so visible parts stay and `AskModel` shows the error.
- If compile fails during streaming, the session logs the error and keeps the last good commit. A later chunk or `done` can recover the screen.

## Node identity

Each chunk produces a whole new scene, and SwiftUI must not rebuild the screen for it. An element id is the document key plus a mount path. A statement mounts under its own name the first time it appears, so `pick1` stays at `ref:pick1` when the root grows or reorders.

`commit` reuses a handle when the id, the kind and the slot names all match, and it writes only values that differ. A reused handle keeps its SwiftUI identity and `@State`.

- A changed value reuses the handle: `updated 1`, and `@State` stays.
- An unchanged program writes nothing.
- A root that gains a part creates elements only for the new part.
- A changed kind creates a new handle: `created 1`, `slots 1`, and `@State` resets.
- Reordered `@Each` rows reuse their handles, because ids come from the row index and not from the data. Two swapped rows give `updated 2`, and local state stays at its old row.

## Data binding at the Swift level

A reference like `d.answers.q1.rows` never reaches a SwiftUI view. `OpenUICompiler` resolves it and stores the result in the element:

1. `query` finds the last dataset whose tool and args match the `Query`.
2. `access` walks the path one step at a time. A missing step gives null.
3. The value lands in `element.properties`.
4. The view reads it through `PrimitiveProps`, which treats null as nil.

`@Each` copies the evaluation context and adds an alias for each row, so `r.name` is a lookup in that copy. It is a compile-time alias and not a runtime scope.

Missing data behaves as follows:

- A missing field draws a dash in `TextPrimitive`. An empty string draws no line.
- A missing list makes `@Each` produce no nodes. The container exists with an empty slot, and no error is raised.
- No matching dataset throws `missingQuery`. While streaming, the session logs it and retries on the next chunk. At `done` it ends the run, and content already on screen stays.

New data takes the same path as the first compile. A follow-up holds the new dataset and program until `done` confirms the next revision, then compiles once. The document key stays the same, so element ids match. In a measured run, changing one player's goals from 24 to 25 gave `updated 1` with the other handles untouched. `@Observable` tells SwiftUI which handle changed.

There are two kinds of state:

- **Evaluated props** live in `handle.properties`. Only `commit` writes them.
- **Local UI state** lives in `@State` inside a primitive: `Toggle`, `Stepper`, `Chip`, `SegmentedControl` and an open `Section`. Only that view can read it. Once set, it ignores later prop updates for that handle.

No SwiftUI binding connects two primitives. The language has no variables, so a `Toggle` cannot drive a `Show`. To change what another view shows, the program or the dataset has to change.

`registry` and `lastCommit` are marked `@ObservationIgnored`. `update` assigns only when a value differs, and a slot's `set` assigns only when the list differs by object identity. `OpenUIElementView` tracks properties, a container tracks its own slot, and the scene tracks root membership. These rules limit which writes happen. Whether each redraw stops at the changed view has not been measured.

## Known gaps

- Swift decodes the catalog digest and never reads it, and the server does not send one. An app and a newer server have no way to agree on a contract.
- `OpenUIFixtureTests` compares compiled trees and tests no view code. It runs with `make test` and not in CI. A typo in a prop name read by a view passes every check.
- `check:sports-catalog` looks for a Swift case for each kind in the sports fixtures. A new primitive outside those fixtures gets no renderer check on either side.
- `Button`, `IconButton` and row actions call `PrimitiveActionDispatcher` through the `primitiveContext` environment value. It does nothing until a host sets one, so these taps are inert today. Actions can be wired when a screen needs them.

## Evidence

This document comes from reading the code and from running example programs through the real `OpenUICompiler` and `OpenUISession` in a scratch macOS harness. SwiftUI views were not run for it. The stream order comes from the server code, not from a captured live run.
