# OpenUI follow-ups and selective native updates

This is the implementation contract for the current chunk. The backend changes extend PR #14. The app implements Design B from `FitnessGin/docs/openui-renderer/DESIGN-B.md`.

## Product behavior

The mobile app consumes OpenUI only. Initial generation streams a screen. A follow-up keeps that screen and edits the relevant content. If the user first asks about NVDA, then says "get the latest report rather than upcoming", the backend resolves the subject as NVDA and replaces the temporal request. It fetches current sourced facts rather than reusing old answers as evidence.

A heading edit updates its Text element. A forecast input updates the dependent values in that calculator. Adding a card changes the parent's child list. Existing controls and unrelated elements keep their identities and local presentation state. Structural or geometry changes may require ancestor layout; selective publication does not promise that SwiftUI performs no layout outside one leaf.

## Backend design

The backend owns persisted conversation turns, resolved requests, datasets, complete admitted programs, part identities and document revisions. OpenRouter calls receive the stored messages plus the new user message. A stable session ID groups routing and observability. It does not replace message replay or store conversation state for this application.

Initial `POST /lang/stocks/stream` retains its existing seed, skeleton, program and completion events. Completion adds `document: {id, revision: 1}`. The initial document id equals the initial run id. Persist the validated result before reporting it as committed.

`POST /lang/stocks/:documentId/follow-up` accepts a prompt, expected `baseRevision`, optional target ids, model and timezone. Missing documents return 404. Stale or concurrent edits fail with 409. A failed generation must not append successful turns or advance the document revision.

Follow-ups may stream activity while preparing. Content remains unchanged until the backend has a complete validated result. It then sends a dataset seed, `openui: {text, replace: true}` with the complete cumulative program, and completion with the same document id and the next revision. A full program on the wire is an authoritative source revision, not an instruction to replace every native view.

Conversation resolution uses actual user/assistant turns and the last resolved subject. The latest instruction wins when it corrects an earlier request. Explicit new tickers replace inherited subjects. Research preserves requested time meaning, including latest versus upcoming earnings. The follow-up planner produces a standalone request and the questions to answer again before any data is fetched.

Composition preserves unrelated prior parts and their statement ids. A part rewritten for a revised question keeps its id; newly added parts receive unused ids. Removed parts leave the root and no longer contribute visible descendants. Merge sourced data needed by retained parts into the new immutable snapshot. Never guess bindings from equal values. Target ids must resolve to known document content.

The document store persists atomically under `DATA_DIR` and reloads after process restart. Per-document mutation serialization and base-revision validation protect commits. Stored history is application data; bound model input size separately without pretending that a routing session is model memory.

## App design

Portable OpenUI code lives below Services in `GenUIPrimitives/OpenUI`. It reads the pinned emitted grammar and exported positional metadata. It supports Query, member/index reads, lexical nested Each, literals, child slots, forward references and later assignments replacing earlier definitions. Reject unsupported constructs explicitly.

`GenUIOpenUIRuntime` owns the session, retained element and slot handles, calculator overlays and effective-property commits. `FitnessGinNetworking` owns HTTP/SSE and snapshot replay. `GenUIPrimitiveRenderer` reuses existing Kino views with prepared properties and direct child handles. Features own presentation and request tasks. Networking does not import the renderer.

Each element handle exposes prepared properties. Each slot handle exposes its ordered children. A view receives its handle directly. The root observes root membership and presentation state only. The registry is private and nonobservable. Do not inject a replaced tree or dataset as an environment value on this path.

Source changes compile into semantic changes. The session compares effective properties and child membership before writing observable state. Surviving handles remain the same objects. A correct first compiler may reevaluate the program internally, but it must publish only changed elements and slots. Record whether evaluation itself is incremental; do not equate targeted publication with incremental CPU work.

Document identity survives follow-ups. Request ids and immutable Query snapshot runs do not define view identity. Element ids use stable statement/mount/item identity. Initial copy fills preserve ids. For collection reorder, stable keys must come from explicit contract metadata. Where no keys exist, collection replacement is local and explicit; do not infer that a field named ticker or id is universally a key.

The session is the only owner of calculator edit overlays and effective props. Controls send typed source/input addresses. Recompute outputs for the correct calculator occurrence, including two calculators with equal initial values. An incidental seed refresh retains overrides. An explicit server input write reconciles that input; newer local edits remain visible and need a conflict indication. Disclosure and ordinary selection can remain view-local behind stable identity.

Initial program events may publish accepted fills as they arrive. Follow-up events remain staged until completion validates document identity, revision, source and seeds. Apply one non-suspending main-actor commit. Cancellation, stale results or malformed content retain the last accepted screen. Do not restore the initial skeleton for a follow-up.

Persist final program, complete seed results, received provenance, document/revision, origin and theme in an OpenUI archive. Restore offline. Missing-seed tool replay returns raw results only; it cannot reconstruct absent provenance. Keep old user records stored, with explicit unsupported-format handling or import migration instead of a hidden legacy renderer.

## Sequence and verification

1. Publish this backend/app contract and the generated OpenUI metadata and fixture format.
2. Implement durable context, revisioned follow-up routing and identity-preserving composition. Test the NVDA latest-report correction, subject changes, restart, stale/concurrent edits and failure atomicity.
3. Implement the native compiler, transport and retained session. Compare every exported template variant (`catalog/openui/fixtures.json`) against backend-evaluated expected results. Test replacement, nested Each, source bindings and nullable values.
4. Connect the native views, stock Ask, stocks-scoped generator and OpenUI history. Test independent calculators, copy-fill/follow-up state preservation, per-slot changes and cancellation.
5. Prove selective publication with observation tests and native tracing where available. Run backend baseline checks, native checks and project tooling. Document actual behavior and remaining limits, then update PR #14.

Static stock detail uses a separate nonstream response and does not block the first OpenUI stream screen. Moving it to one unified format needs a deterministic program/seed response later. General generation needs a general Lang route; until then the app generator must state its stocks scope.

## OpenRouter references

The [chat completion request](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) supplies the messages for each model call. [Prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching) describes routing/cache behavior. This implementation stores context itself and replays messages; caching and routing identity are separate concerns.
