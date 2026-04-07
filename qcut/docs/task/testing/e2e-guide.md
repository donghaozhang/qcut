# QCut E2E Testing Guide

End-to-end tests for QCut using Playwright + Electron.

## Quick Start

```bash
bun run build                    # Build first (tests run from dist/)
bun run test:e2e                 # Run all tests (visible window)
bun run test:e2e:bg              # Run all tests (invisible window)
```

## Commands

| Command | Window | Use case |
|---------|--------|----------|
| `bun run test:e2e` | Visible | Default — debugging, watching tests |
| `bun run test:e2e:bg` | Invisible | Background runs, no focus stealing |
| `bun run test:e2e:record` | Visible | Run tests + collect videos + combine highlight reel |
| `bun run test:e2e:ui` | Visible | Playwright interactive test explorer |
| `bun run test:e2e:headed` | Visible | Same as default, explicit |
| `bun run test:e2e:workflow` | Visible | Only project-workflow tests |
| `bun run test:e2e:combine` | — | Re-combine videos from a previous run |

### Passing Arguments

```bash
bun run test:e2e -- --grep "timeline"          # Filter by test name
bun run test:e2e -- project-workflow            # Run specific file
bun run test:e2e:bg -- --grep "navigation"     # Filter in invisible mode
```

## Why Not Headless?

QCut requires a real Electron window (not headless Chromium) because the editor uses:
- HTML5 Canvas compositing (timeline, waveforms)
- Remotion preview (React video rendering)
- Hardware video decode (Electron media pipeline)
- Screen recording via MediaRecorder

Headless mode disables or stubs these APIs, causing test failures.

## Invisible Mode

`bun run test:e2e:bg` runs tests without any visible window on screen.

**How it works:** Sets `QCUT_E2E_OFFSCREEN=1` so Electron calls `setOpacity(0)` + `setIgnoreMouseEvents(true)`. The window still renders everything — Playwright can screenshot and interact with it — but it's invisible on all monitors.

**Why not offscreen positioning?** macOS clamps window positions to keep them on-screen, which fails on multi-monitor setups. Transparency works reliably regardless of display configuration.

**Linux CI:** `bun run test:e2e:bg` also wraps Playwright with `xvfb-run` if available, creating a virtual X11 framebuffer.

**Key files:**
- `scripts/e2e-virtual-display.ts` — Sets env var and launches Playwright
- `electron/main.ts` — Reads `QCUT_E2E_OFFSCREEN`, applies opacity=0
- `apps/web/src/test/e2e/helpers/electron-helpers.ts` — Forwards env to `electron.launch()`

## Video Recording

Every test is automatically recorded as an MP4 via screenshot capture (2fps). This works in both visible and invisible mode because `page.screenshot()` captures renderer content regardless of window opacity.

### How It Works

1. The test fixture captures screenshots every 500ms during each test
2. After each test, ffmpeg encodes the frames into `screen-recording.mp4`
3. Videos are saved alongside other test artifacts in `docs/completed/test-results-raw/`

### Highlight Reel

`bun run test:e2e:record` runs three steps:

1. **Playwright tests** — Runs all `*.e2e.ts` files, recording each test
2. **Video collector** (`scripts/collect-e2e-videos.ts`) — Copies videos to `docs/completed/e2e-videos/run-<timestamp>/` with a `manifest.json`
3. **Video combiner** (`scripts/combine-e2e-videos.ts`) — Stitches all recordings into a single `combined.mp4` with intro cards per test

```bash
# Re-combine from a specific run
bun run test:e2e:combine -- --run-dir docs/completed/e2e-videos/run-2026-02-21T10-30-00-000Z

# Custom output
bun run test:e2e:combine -- --output ./highlight-reel.mp4
```

### Known Limitation

QCut's **screen recording button** (which uses `desktopCapturer`) produces black frames at opacity=0. This only affects the E2E test that tests QCut's own recording feature (`screen-recording-repro.e2e.ts`) — it still passes because it checks file creation and byte count, not visual content. All other video recording via Playwright works fine.

## Test Files

| # | File | Tests | Description |
|---|------|-------|-------------|
| 1 | `simple-navigation.e2e.ts` | 3 | Basic app launch and navigation |
| 2 | `editor-navigation.e2e.ts` | 3 | Editor page navigation |
| 3 | `project-workflow-part1.e2e.ts` | 2 | Project creation, media import |
| 4 | `project-workflow-part2.e2e.ts` | 3 | Timeline operations |
| 5 | `project-workflow-part3.e2e.ts` | 4 | Export, persistence |
| 6 | `multi-media-management-part1.e2e.ts` | 5 | Multiple media import |
| 7 | `multi-media-management-part2.e2e.ts` | 7 | Multi-media timeline |
| 8 | `text-overlay-testing.e2e.ts` | 6 | Text overlays |
| 9 | `sticker-overlay-testing.e2e.ts` | 6 | Sticker overlays |
| 10 | `ai-transcription-caption-generation.e2e.ts` | 6 | AI transcription (skipped — panel removed) |
| 11 | `ai-enhancement-export-integration.e2e.ts` | 8 | AI enhancement & export |
| 12 | `file-operations-storage-management.e2e.ts` | 8 | File operations & storage |
| 13 | `auto-save-export-file-management.e2e.ts` | 6 | Auto-save & export |
| 14 | `terminal-paste.e2e.ts` | 4 | Terminal UI (2 skipped — PTY required) |
| 15 | `remotion-panel-stability.e2e.ts` | 3 | Remotion panel stability |
| 16 | `project-folder-sync.e2e.ts` | 24 | Project folder sync |
| 17 | `debug-projectid.e2e.ts` | 1 | Debug/utility |
| 18 | `screen-recording-repro.e2e.ts` | 1 | Screen recording pipeline |

## Test Helpers

Common utilities in `apps/web/src/test/e2e/helpers/electron-helpers.ts`:

| Helper | Purpose |
|--------|---------|
| `createTestProject(page, name)` | Create a new project |
| `importTestVideo(page)` | Import sample video |
| `importTestAudio(page)` | Import sample audio |
| `importTestImage(page)` | Import sample image |
| `uploadTestMedia(page, path)` | Import any media file |
| `ensureMediaTabActive(page)` | Navigate to Library > Media tab |
| `ensureTextTabActive(page)` | Navigate to Edit > Manual Edit > Text |
| `ensureStickersTabActive(page)` | Navigate to Edit > Manual Edit > Stickers |
| `ensurePanelTabActive(page, opts)` | Navigate to any group/tab combo |
| `navigateToProjects(page)` | Go to projects page |
| `cleanupDatabase(page)` | Clean up test data between tests |
| `startScreenRecordingForE2E(page)` | Start QCut's screen recording |
| `stopScreenRecordingForE2E(page)` | Stop QCut's screen recording |

## Configuration

**File:** `playwright.config.ts`

| Setting | Value | Notes |
|---------|-------|-------|
| `video` | `"on"` | Config-level setting (actual recording is via screenshot frames) |
| `workers` | `1` | Sequential — Electron uses a fixed port |
| `screenshot` | `"only-on-failure"` | Failure screenshots |
| `trace` | `"on-first-retry"` | Trace on retry (CI has 2 retries) |
| `timeout` | `60000` | 60s per test |
| `expect.timeout` | `10000` | 10s per assertion |

## Debugging

```bash
# Watch test live in visible window
bun run test:e2e -- simple-navigation

# Playwright UI for interactive debugging
bun run test:e2e:ui

# Step-through debug mode
PWDEBUG=1 bunx playwright test simple-navigation

# View HTML test report
bunx playwright show-report docs/completed/test-results
```

## Troubleshooting

**Tests fail to start / port conflict**
- Kill stray Electron processes: `pkill -f "electron"` then retry

**No video recordings**
- Check `docs/completed/test-results-raw/` for `screen-recording.mp4` files
- Ensure `ffmpeg-static` is installed (`bun install`)

**Tests timeout**
- Rebuild: `bun run build` before testing
- Increase timeout in `playwright.config.ts` if needed

## Key Source Files

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright configuration |
| `apps/web/src/test/e2e/helpers/electron-helpers.ts` | Test fixtures and helpers |
| `scripts/e2e-virtual-display.ts` | Invisible mode launcher |
| `scripts/run-e2e-record.ts` | Record orchestrator (test + collect + combine) |
| `scripts/collect-e2e-videos.ts` | Video artifact collector |
| `scripts/combine-e2e-videos.ts` | Video combiner (ffmpeg) |
| `electron/main.ts` | Reads `QCUT_E2E_OFFSCREEN` env var |
