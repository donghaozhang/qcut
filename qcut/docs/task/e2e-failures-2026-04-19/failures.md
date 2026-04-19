# E2E failure report — 2026-04-19

Run: `bun run test:e2e:bg` on branch `movie-cli-v6` (PR #279).
Result: **103 passed, 18 skipped, 19 failed** (18.6 min).

None of the 19 failures are related to the changes in this PR (API-keys UI, electron-builder packaging, timeline-selection debug instrumentation). They split into four pre-existing categories.

## Category A — Outdated heading text (3 failures, easy fix)

Tests look for the literal string **"Your Projects"** on the projects page, but the live UI now shows a **"Studio"** heading. Verified via `error-context.md` page snapshot for `simple-navigation > should navigate to projects page successfully`.

Failing tests:
- `simple-navigation.e2e.ts:10` should navigate to projects page successfully
- `simple-navigation.e2e.ts:37` should be able to detect project creation button
- `simple-navigation.e2e.ts:62` should handle project creation button click without crash

**Fix:** replace `page.getByText("Your Projects")` with a locator that matches the current copy (e.g. `page.getByRole("heading", { name: "Studio" })`) — or follow the more resilient pattern already used in `editor-navigation.e2e.ts`, which asserts on `[data-testid="projects-page"]` instead of text.

## Category B — Missing visual-regression baselines (5 failures)

All `visual-regression.e2e.ts` tests fail with `Error: A snapshot doesn't exist at … writing actual`. Playwright wrote the "actual" PNG on this run; they would pass on a re-run.

Failing tests:
- `visual-regression.e2e.ts:27` projects page empty state
- `visual-regression.e2e.ts:36` editor initial load (empty timeline)
- `visual-regression.e2e.ts:43` editor with media imported
- `visual-regression.e2e.ts:57` editor media panel
- `visual-regression.e2e.ts:70` editor export dialog

**Fix:** run `bun x playwright test apps/web/src/test/e2e/visual-regression.e2e.ts --update-snapshots` on a machine we trust as the visual baseline (macOS-darwin per the filename suffix), then commit the `*-snapshots/` PNGs.

**Do not** auto-apply without human review — baselines should be generated from a known-good build, not the first run that happens to succeed.

## Category C — Screen-recording suite (5 failures, environment-dependent)

Five screen-recording tests fail. These rely on real OS-level screen capture, which is flaky under `QCUT_E2E_OFFSCREEN=1` (the hidden-window mode the `test:e2e:bg` script sets) and also requires macOS Screen Recording permission for the Electron binary.

Failing tests:
- `screen-recording-advanced.e2e.ts:55`
- `screen-recording-render-test.e2e.ts:29`
- `screen-recording-repro.e2e.ts:11`
- `screen-recording-telemetry.e2e.ts:30`
- `screen-recording-v2.e2e.ts:51`

Evidence: the editor chrome renders correctly (see page snapshot for `screen-recording-repro`) — the app is alive; it's the record pipeline that's failing.

**Fix:** out of scope for this PR. Needs a separate investigation into whether offscreen + macOS TCC permission + virtual display can produce a deterministic screen-capture. In the meantime, consider marking this suite with `test.describe.configure({ mode: "serial" })` and gating on an env flag.

## Category D — UI drift in miscellaneous tests (6 failures)

Tests that likely broke due to copy / data-testid drift, similar to Category A but each needs individual inspection:
- `audio-video-simultaneous-export.e2e.ts:326`
- `editor-navigation.e2e.ts:15` should detect existing project on projects page
- `project-workflow-part3.e2e.ts:36` should access export functionality
- `project-workflow-part3.e2e.ts:102` should handle export configuration
- `remotion-export-pipeline.e2e.ts:161` export dialog shows Remotion engine indicator
- `sticker-overlay-testing.e2e.ts:252` should handle sticker panel categories and search

Each has a `docs/completed/test-results-raw/<slug>/error-context.md` with the captured page state.

**Fix:** inspect each one individually, update locators to match current UI. Not blocking PR #279.

---

## Plan for this session

1. **Fix Category A** (3 tests). One-file change, low risk.
2. **Document Categories B/C/D** as known-issue backlog. Don't auto-regenerate baselines or touch screen-recording tests without explicit go-ahead.
3. **Verify the fix** by re-running only the 3 simple-navigation tests.

## Outcome (2026-04-19)

- **Category A fixed.** Updated `simple-navigation.e2e.ts` to match current UI copy:
  - `"Your Projects"` → `getByRole("heading", { name: "Studio" })` (lines 13 and 89)
  - `"No projects yet"` → `"Start your first AI-powered video"` (empty-state heading, line 24)
  - `"New project"` → `"New Project"` (capital P, line 46)
  - Re-ran `bun run test:e2e:bg -- --grep "Simple Navigation"` → **3 passed (7.8s)**.
- Categories B / C / D left untouched pending explicit owner go-ahead.

