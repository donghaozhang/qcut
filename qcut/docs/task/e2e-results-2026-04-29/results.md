---
date: 2026-04-29
branch: win-Hermes
pr: 293
runner: bun run test:e2e:bg
duration: 11.7m
total: 142
passed: 118
skipped: 24
failed: 0
---

# E2E run — 2026-04-29 (branch `win-Hermes`, PR #293)

```
Running 142 tests using 1 worker
  24 skipped
  118 passed (11.7m)
exit=0
```

**Result: green.** 118 passed, 24 skipped, **0 failed.** No fixes required.

Compare to the prior run on `movie-cli-v6` / 2026-04-19 (`docs/task/e2e-failures-2026-04-19/failures.md`), which had 19 failures across "Studio" heading drift + missing visual-regression baselines. Those have all been resolved — visual snapshots now exist and `simple-navigation.e2e.ts` was updated.

## Reproduction

```bash
git checkout win-Hermes
bun run build           # tests launch from dist/electron/main.js
bun run test:e2e:bg     # invisible / offscreen mode
```

- HTML report: `docs/completed/test-results/index.html` (gitignored)
- Raw artifacts: `docs/completed/test-results-raw/` (gitignored)

## Coverage

29 spec files exercised:

```
ai-enhancement-export-integration.e2e.ts   project-workflow-part2.e2e.ts
api-keys-precedence.e2e.ts                 project-workflow-part3.e2e.ts
audio-video-simultaneous-export.e2e.ts     remotion-export-pipeline.e2e.ts
auto-save-export-file-management.e2e.ts    remotion-folder-import.e2e.ts
debug-projectid.e2e.ts                     remotion-panel-stability.e2e.ts
editor-navigation.e2e.ts                   screen-recording-advanced.e2e.ts
file-operations-storage-management.e2e.ts  screen-recording-render-test.e2e.ts
multi-media-management-part1.e2e.ts        screen-recording-repro.e2e.ts
multi-media-management-part2.e2e.ts        screen-recording-telemetry.e2e.ts
project-folder-sync.e2e.ts                 screen-recording-v2.e2e.ts
project-workflow-part1.e2e.ts              simple-navigation.e2e.ts
sticker-overlay-export.e2e.ts              sticker-overlay-testing.e2e.ts
terminal-paste.e2e.ts                      text-overlay-testing.e2e.ts
timeline-context-menu.e2e.ts               timeline-duration-limit.e2e.ts
visual-regression.e2e.ts
```

## Skipped tests (24)

All skips are deliberate `test.skip(...)` calls gated on environment / permissions / feature availability — not regressions:

| Spec | Skip reason (from source) |
|---|---|
| `api-keys-precedence.e2e.ts` (×3) | "No existing project or project creation control found", "Electron page did not initialize", env-gated path |
| `screen-recording-repro.e2e.ts`, `screen-recording-telemetry.e2e.ts`, `screen-recording-render-test.e2e.ts`, `screen-recording-advanced.e2e.ts`, `screen-recording-v2.e2e.ts` | macOS screen-recording permission not granted to the test runner |
| `sticker-overlay-export.e2e.ts` (×12) | "Sticker canvas not available" — DOM probe gate |
| `terminal-paste.e2e.ts` | environment-gated |
| `project-folder-sync.e2e.ts` | "should handle missing electronAPI gracefully" — only runs when API is unmocked |
| `ai-enhancement-export-integration.e2e.ts`, `remotion-folder-import.e2e.ts` | feature-gated `test.skip(...)` |

These match `git grep "test\.skip"` in `apps/web/src/test/e2e/` (24 hits, 1:1 with the skip count). To enable the screen-recording specs locally: System Settings → Privacy & Security → Screen Recording → grant access to whichever Electron binary Playwright launches.

## Console noise (not failures)

The renderer log emits `[RENDERER REQUEST FAILED] blob:app://… - net::ERR_ABORTED` lines. These are aborted blob fetches during teardown — Playwright does not treat them as test failures and they appear in passing runs. Safe to ignore.
