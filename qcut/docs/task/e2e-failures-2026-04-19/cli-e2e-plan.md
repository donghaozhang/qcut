# CLI-driven parallel E2E suite — plan

This is an **additional** test suite, not a replacement for `apps/web/src/test/e2e/*.e2e.ts`. The Playwright e2e tests stay as-is. This suite exercises the same user flows through the `qcut editor:*` CLI against a running QCut (either `bun run electron:dev` or a headless auto-spawned instance, depending on the command).

## Why

The Playwright suite catches UI regressions (DOM, visual, event wiring). The CLI suite catches API regressions in the editor HTTP server at `http://127.0.0.1:8765/api/claude` — schema drift, store action breakage, engine-recommendation logic, project persistence, timeline invariants. Two orthogonal layers; both are useful.

## Prerequisites

- QCut editor must be reachable. Every `editor:*` command talks to the HTTP server; most require the UI app to be running. The `editor:screen-recording:*` commands auto-spawn a headless instance if needed.
- Optional: `QCUT_API_HOST` / `QCUT_API_PORT` env vars, or `--host` / `--port` flags, to point at a non-default endpoint.
- Optional: auth token via `qcut editor:auth:token --set <val>` if your instance enforces one.
- `bun` on `PATH`, repo built at least once (`bun run build`) so the `qcut` binary picks up the latest CLI handlers. Per project memory: always rebuild before running `qcut …` — the binary is a compiled snapshot.

## Where the new tests live

```
apps/web/src/test/cli-e2e/
├── run-all.sh                       — bash driver (uses set -euo pipefail)
├── lib.sh                           — helpers (assert_eq, with_project, json_field, …)
└── suites/
    ├── 01-project-lifecycle.sh      — covers Category A / D editor-navigation
    ├── 02-timeline-and-export.sh    — covers Category D project-workflow-part3, remotion, audio-video
    ├── 03-ui-panel-state.sh         — covers Category D sticker-overlay
    └── 04-screen-recording.sh       — covers Category C (will skip if TCC permission missing)
```

Each suite file is an ordered sequence of CLI invocations that assert on the JSON output. Scripts use `set -euo pipefail` so any non-zero exit or unexpected field causes the whole suite to fail. Keeping them as bash is deliberate — it mirrors how a user would drive the CLI.

**Alternative**: one-file TypeScript driver using `execa`/`bun shell` if cross-platform (Windows) matters. For the initial pass, bash is faster to write and Windows CI already skips these scripts.

## Mapping — each originally-failing Playwright test → CLI equivalent

Only flows that are observable through the HTTP API are replicable via CLI. Pure pixel-diff (Category B) cannot be — that's why Playwright exists. Listed in priority order.

| Playwright test | CLI equivalent | Status |
|---|---|---|
| `simple-navigation.e2e.ts:10` — projects page loads | `qcut editor:project:list --json` → expect `projects: []` then create + re-list → expect 1 | **Replicable** |
| `simple-navigation.e2e.ts:37` — "New Project" button present | Covered by `project:create` succeeding | **Replicable** |
| `simple-navigation.e2e.ts:62` — "New Project" click doesn't crash | `qcut editor:project:create --new-name "CLI Nav"` → `editor:project:list` → assert created id present | **Replicable** |
| `editor-navigation.e2e.ts:15` — detect existing project | Same as above — `project:list` after `project:create` | **Replicable** |
| `project-workflow-part3.e2e.ts:36` — export functionality is reachable | `qcut editor:export:presets --json` (no project) + `editor:export:recommend --project-id X --target youtube --json` | **Replicable** |
| `project-workflow-part3.e2e.ts:102` — export configuration | Same endpoint, check preset list includes expected entries (`youtube-1080p`, `tiktok`, …) | **Replicable** |
| `remotion-export-pipeline.e2e.ts:161` — Remotion engine auto-select | 1. `project:create` 2. `timeline:add-element --data '{"type":"remotion","componentId":"HelloWorld","duration":5,"trackId":...}'` 3. `export:recommend` → assert `engineType === "remotion"` | **Replicable — and directly verifies the bug fixed in `use-export-settings.ts` and `export-engine-factory.ts`** |
| `audio-video-simultaneous-export.e2e.ts:326` — simultaneous AV export | 1. `project:create` 2. `media:import` both video + audio fixtures 3. `timeline:add-element` on media + audio tracks 4. `export:start --poll --timeout 600` 5. external `ffprobe` on output path → assert both streams present | **Replicable — directly verifies the validation-drop bug fixed in `export-engine-cli-validation.ts`** |
| `sticker-overlay-testing.e2e.ts:252` — sticker panel reachable | `qcut editor:ui:switch-panel --panel stickers` then `editor:state:snapshot --include editor --json` → assert active panel is stickers | **Replicable (minus the actual tab-click behavior, which is UI-only)** |
| `screen-recording-repro.e2e.ts:11` — start/stop cycle | 1. `editor:screen-recording:status` → expect `recording: false` 2. `editor:screen-recording:start --project-id X` 3. sleep 2 4. `editor:screen-recording:stop --project-id X` → expect file on disk | **Replicable — permission-gated, see below** |
| `screen-recording-telemetry.e2e.ts:30` — sidecar written | Same as above + assert `.cursor.json` exists next to the video | **Replicable** |
| `screen-recording-advanced/render-test/v2` | Combine record + `qcut editor:export:start --cursor-sway … --auto-zoom …` + ffprobe the export | **Partially replicable** — CLI can drive the record + enhanced-export path, but doesn't verify pixel output |
| `visual-regression.e2e.ts:*` (×5) | `qcut editor:screenshot:capture --filename …` gives a single PNG per step | **Not replicable as pixel-diff**; could be a smoke screenshot but no ratio-based compare without extra tooling (pngdiff / Playwright's `toHaveScreenshot` without Playwright) |

## Permission & environment gating

The screen-recording suite needs the same macOS TCC permission the Playwright tests do. Add the same gate: call `qcut editor:screen-recording:status` once at the top; if the error message contains `permission not granted`, mark the suite as `SKIP` (stdout `[skip] …`, exit 0). On non-macOS platforms the commands just work.

## Assertion helpers

Most `editor:*` commands already accept `--json` and print a structured response. Assertions use `jq`:

```bash
# lib.sh
assert_json_eq() {
  local actual expected
  actual=$(jq -r "$2" <<<"$1")
  expected=$3
  [ "$actual" = "$expected" ] || { echo "❌ $4: got '$actual', want '$expected'"; exit 1; }
}

# usage
result=$(qcut editor:export:recommend --project-id "$PID" --target youtube --json)
assert_json_eq "$result" '.engineType' 'remotion' 'engine should be remotion with a remotion element on the timeline'
```

## Running the suite

```bash
# One-shot (requires editor to be running)
bash apps/web/src/test/cli-e2e/run-all.sh

# Single suite
bash apps/web/src/test/cli-e2e/suites/02-timeline-and-export.sh

# With explicit endpoint
QCUT_API_HOST=127.0.0.1 QCUT_API_PORT=8765 bash apps/web/src/test/cli-e2e/run-all.sh
```

Add a package.json entry (no replacement of existing scripts):

```json
"test:cli-e2e": "bash apps/web/src/test/cli-e2e/run-all.sh"
```

## Out of scope for this plan

- Pixel-diff replacement for `visual-regression.e2e.ts` — needs either a renderer like `pixelmatch` or Playwright's image-comparator. Leaving as pure-UI Playwright territory.
- Windows CI wiring — bash-only for now. TypeScript driver is the upgrade path when Windows matters.
- Auto-launching QCut when the server isn't reachable (beyond what `editor:screen-recording:*` already does via the headless recorder). The driver will simply fail fast with a clear "editor not reachable" message.

## Proposed execution order for implementation

1. Land `lib.sh` + `run-all.sh` skeleton with a single passing health-check (`editor:health`, exit non-zero on failure).
2. Land suite 01 (project lifecycle) — smallest scope, no media needed.
3. Land suite 02 (timeline + export) — exercises the two real bugs this PR fixed, gives us regression coverage.
4. Land suite 03 (UI panel state).
5. Land suite 04 (screen recording, TCC-gated).

Each suite merges as its own commit under `test(cli-e2e): …` so bisection stays tight.
