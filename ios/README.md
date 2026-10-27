# OpenUIGen (iOS)

The native client for the openui-gen backend. Every command runs from the repo root through the
`Makefile`; `make help` lists them.

## Setup

Requires macOS, Xcode 26 and [Homebrew](https://brew.sh).

```sh
make bootstrap
make backend     # in another terminal
make open
```

`bootstrap` installs `mint`, the Swift tools pinned in `Mintfile` (XcodeGen, SwiftFormat,
SwiftLint), copies `Secrets.xcconfig.example` to `Secrets.xcconfig`, and generates the project.
It is safe to re-run.

## The project is generated

`OpenUIGen.xcodeproj` is generated from `project.yml` and is not tracked in git. Change the YAML,
then run `make project`. Remote Swift packages go in the `packages:` section of `project.yml`.

## Backend address

`API_BASE_URL` in `OpenUIGen/Application/Resources/Secrets.xcconfig` reaches the app as
`APIBaseURL` in Info.plist. It defaults to `http://127.0.0.1:8080`, which the simulator resolves to
your Mac. On a device, use the Mac's LAN address (`ipconfig getifaddr en0`).

## Layout

```text
OpenUIGen/Application/      app entry point, xcconfigs
OpenUIGen/Networking/       APIClient (JSON GET/POST), HTTPFailure, HealthService
OpenUIGen/GenUI/Core/       OpenUI parser and compiler, node model, DesignTheme (design tokens)
OpenUIGen/GenUI/Runtime/    OpenUISession: streams a screen, recompiles, keeps follow-ups on one document
OpenUIGen/GenUI/Streaming/  OpenUIStreamService: SSE client for /lang/sports/stream (follow-ups when the backend has them)
OpenUIGen/GenUI/Renderer/   OpenUISceneView and the primitives; Tokens/ holds metrics, type roles, palette
OpenUIGen/Views/            AskView: prompt bar over the rendered screen
OpenUIGenTests/             unit tests (Swift Testing); Support/ holds the shared fakes
```

## Rendering engine

The server streams OpenUI Lang (`event: openui`) over SSE. `OpenUISession` appends each chunk,
compiles it against `primitives.json` and publishes only the elements that changed, which
`OpenUISceneView` draws with the primitives. No native OpenUI renderer exists upstream (the
official ones are React, Vue and Svelte), so this is the engine ported from FitnessGin.

The app bundles three files straight from the repo, so client and server never drift:
`design/atomize/design.json` and `design/kino/theme.json` (tokens; Kino is the default brand,
merged as the preview does) and `catalog/openui/primitives.json` (the component schema).

`OpenUIFixtureTests` keeps the Swift compiler in step with the server. It compiles every program in
`catalog/openui/fixtures.json` over that fixture's dataset and compares the result with the tree the
server evaluated. Rerun it after `npm run openui:export`.

