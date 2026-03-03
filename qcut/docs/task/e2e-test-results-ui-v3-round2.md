# E2E Test Results — UI-v3 Branch (Round 2)

**Date**: 2026-03-03
**Branch**: `UI-v3`
**Runtime**: 27.8 minutes (1669 seconds)
**Command**: `bun run test:e2e`
**Report source**: Playwright HTML report at `docs/completed/test-results/index.html`

## Summary

| Status | Count |
|--------|-------|
| Passed | 105 |
| Failed | 13 |
| Skipped | 18 |
| Flaky | 0 |
| **Total** | **136** |

**Pass rate**: 77.2% (105/136), or 89.0% excluding skipped (105/118)

---

## Comparison with Round 1

| Metric | Round 1 | Round 2 | Delta |
|--------|---------|---------|-------|
| Passed | 111 | 105 | -6 |
| Failed | 7 | 13 | +6 |
| Skipped | 18 | 18 | 0 |
| Total | 136 | 136 | 0 |
| Pass rate (all) | 81.6% | 77.2% | -4.4% |
| Pass rate (non-skip) | 94.1% | 89.0% | -5.1% |

**Round 1 failures (7)**: All were fixed or skipped:
- 5 visual regression tests — fixed by generating baseline snapshots
- 1 project-folder-sync electronAPI test — skipped (contextBridge limitation)
- 1 Remotion export pipeline indicator test — skipped (UI redesign removed indicator)

**Round 2 regressions**: 13 failures, of which **11 are new regressions** (tests that passed in round 1) and **2 are re-failures** of previously fixed tests.

---

## Failed Tests (13)

### 1. auto-save-export-file-management.e2e.ts — 5B.3 - Test export to custom directories

**Error**:
```
expect(locator).toContainText(expected) failed
Locator: locator('[data-testid="export-status"]')
Expected pattern: /export|process|render|start|prepare|compil/i
Timeout: 10000ms
```

**Analysis**: **New regression**. Export status element exists but doesn't contain expected text. The export workflow may have changed status messaging in recent commits.

---

### 2. auto-save-export-file-management.e2e.ts — 5B.4 - Test export file format and quality options

**Error**:
```
expect(received).toBeGreaterThan(expected)
Expected: > 0
Received: 0
```

**Analysis**: **New regression**. Test expects format/quality options count > 0 but finds none. Export settings UI may have been restructured.

---

### 3. auto-save-export-file-management.e2e.ts — 5B.6 - Test comprehensive export workflow with all features

**Error**:
```
TimeoutError: locator.fill: Timeout 30000ms exceeded.
Locator: locator('[data-testid="export-filename-input"]')
```

**Analysis**: **New regression**. The `export-filename-input` test ID is missing or the element isn't rendered. Export dialog UI was likely redesigned.

---

### 4. simple-navigation.e2e.ts — should navigate to projects page successfully

**Error**:
```
expect(locator).toBeVisible() failed
Locator: getByText('Your Projects')
Expected: visible
Timeout: 10000ms
```

**Analysis**: **New regression**. The text "Your Projects" no longer appears on the projects page. Round 1 report shows this test passed, indicating UI text was changed (the page snapshot in the report data shows "Studio" as the heading, not "Your Projects").

---

### 5. simple-navigation.e2e.ts — should be able to detect project creation button

**Error**:
```
expect(locator).toContainText(expected) failed
Locator: getByTestId('new-project-button').first()
Expected substring: "New project" (lowercase 'p')
Received string:    "New Project" (uppercase 'P')
```

**Analysis**: **New regression**. Case-sensitivity mismatch — the button text was changed from "New project" to "New Project" in UI-v3. The test needs to be updated to match the new casing.

---

### 6. simple-navigation.e2e.ts — should handle project creation button click without crash

**Error**:
```
expect(locator).toBeVisible() failed
Locator: getByText('Your Projects')
Expected: visible
Timeout: 5000ms
```

**Analysis**: **New regression**. Same root cause as #4 — "Your Projects" text no longer exists in the UI.

---

### 7. visual-regression.e2e.ts — projects page empty state

**Error**:
```
expect(page).toHaveScreenshot(expected) failed
39026 pixels (ratio 0.04 of all image pixels) are different.
Snapshot: projects-page.png
```

**Analysis**: **Re-failure**. Round 1 generated baseline snapshots after the UI-v3 redesign. This pixel difference (4%) suggests further UI changes occurred after the baselines were captured. Baselines need to be regenerated.

---

### 8. visual-regression.e2e.ts — editor initial load (empty timeline)

**Error**:
```
expect(page).toHaveScreenshot(expected) failed
16226 pixels (ratio 0.02 of all image pixels) are different.
Snapshot: editor-empty-timeline.png
```

**Analysis**: **Re-failure**. 2% pixel difference from baseline — same issue as #7. Minor UI tweaks since baseline generation.

---

### 9. visual-regression.e2e.ts — editor export dialog

**Error**:
```
expect(page).toHaveScreenshot(expected) failed
14763 pixels (ratio 0.02 of all image pixels) are different.
Snapshot: editor-export-dialog.png
```

**Analysis**: **Re-failure**. 2% pixel difference — consistent with export dialog UI changes that also cause failures #1–3.

---

### 10. audio-video-simultaneous-export.e2e.ts — exports both streams when timeline has separate video and audio tracks

**Error**:
```
Audio + video simultaneous export regression test failed:
Failed to validate exported stream data: Error invoking remote method 'extract-audio':
Error: FFmpeg audio extraction failed with code 4294967274:
ffmpeg: height not divisible by 2 (1520x761)
```

**Analysis**: **New regression**. FFmpeg fails because the Electron window has an odd height (761px). The round 1 report documents a fix adding a `-vf "pad=..."` filter to `electron-helpers.ts`, but this test uses a different FFmpeg code path (`extract-audio` IPC handler) that doesn't have the pad filter applied.

---

### 11. editor-navigation.e2e.ts — should detect existing project on projects page

**Error**:
```
expect(locator).toBeVisible() failed
Locator: getByText('Your Projects')
Expected: visible
Timeout: 10000ms
```

**Analysis**: **New regression**. Same root cause as #4 and #6 — "Your Projects" heading was renamed to "Studio" in UI-v3.

---

### 12. remotion-export-pipeline.e2e.ts — export dialog shows Remotion engine indicator

**Error**:
```
expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
```

**Analysis**: **Pre-existing / unskip regression**. This test was `test.skip()`'d in round 1 fixes but appears to be running again (possibly the skip was reverted or lost). The UI-v3 export dialog doesn't render the Remotion engine indicator text.

---

### 13. sticker-overlay-testing.e2e.ts — should handle sticker panel categories and search

**Error**:
```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Locator: locator('[role="tablist"] button').first()
Resolved to: <button aria-label="Close Claude Code 1" ...>
```

**Analysis**: **New regression**. The `[role="tablist"] button` selector is resolving to a "Close Claude Code 1" tab button instead of a sticker panel category tab. This indicates a Claude Code panel/tab is interfering with the selector, or the sticker panel's tab structure changed.

---

## Skipped Tests (18)

| # | File | Test |
|---|------|------|
| 1 | ai-enhancement-export-integration.e2e.ts | upscale image workflow |
| 2 | project-folder-sync.e2e.ts | should handle missing electronAPI gracefully |
| 3 | remotion-folder-import.e2e.ts | should debug real Remotion project import |
| 4 | remotion-folder-import.e2e.ts | should debug individual compositions |
| 5 | sticker-overlay-export.e2e.ts | should log sticker render failures instead of silent failure |
| 6 | sticker-overlay-export.e2e.ts | should continue export when individual stickers fail |
| 7 | sticker-overlay-export.e2e.ts | should preload sticker images before export starts |
| 8 | sticker-overlay-export.e2e.ts | should handle preload failures gracefully |
| 9 | sticker-overlay-export.e2e.ts | should show sticker without timing for entire video duration |
| 10 | sticker-overlay-export.e2e.ts | should respect sticker timing boundaries during export |
| 11 | sticker-overlay-export.e2e.ts | should provide sticker render summary after export |
| 12 | sticker-overlay-export.e2e.ts | should process multiple stickers during export |
| 13 | sticker-overlay-export.e2e.ts | should render multiple stickers in correct z-order |
| 14 | sticker-overlay-export.e2e.ts | should handle stickers at different time ranges without overlap |
| 15 | sticker-overlay-export.e2e.ts | should complete full sticker workflow: add, position, and export |
| 16 | sticker-overlay-export.e2e.ts | should preserve stickers during auto-save cycle |
| 17 | terminal-paste.e2e.ts | should start and stop shell terminal session |
| 18 | terminal-paste.e2e.ts | should paste text only once in terminal (no double-paste bug) |

The skip list is identical to round 1 (18 tests). The 2 tests that were additionally skipped in round 1 fixes (project-folder-sync electronAPI, Remotion export indicator) are still counted here — project-folder-sync remains skipped (#2), while Remotion export indicator (#12 in failed list) appears to have had its skip reverted.

---

## Test File Summary

| Test File | Tests | Passed | Failed | Skipped |
|-----------|-------|--------|--------|---------|
| ai-enhancement-export-integration.e2e.ts | 8 | 7 | 0 | 1 |
| auto-save-export-file-management.e2e.ts | 6 | 3 | 3 | 0 |
| audio-video-simultaneous-export.e2e.ts | 1 | 0 | 1 | 0 |
| debug-projectid.e2e.ts | 1 | 1 | 0 | 0 |
| editor-navigation.e2e.ts | 3 | 2 | 1 | 0 |
| file-operations-storage-management.e2e.ts | 8 | 8 | 0 | 0 |
| multi-media-management-part1.e2e.ts | 5 | 5 | 0 | 0 |
| multi-media-management-part2.e2e.ts | 7 | 7 | 0 | 0 |
| project-folder-sync.e2e.ts | 24 | 23 | 0 | 1 |
| project-workflow-part1.e2e.ts | 2 | 2 | 0 | 0 |
| project-workflow-part2.e2e.ts | 3 | 3 | 0 | 0 |
| project-workflow-part3.e2e.ts | 4 | 4 | 0 | 0 |
| remotion-export-pipeline.e2e.ts | 4 | 3 | 1 | 0 |
| remotion-folder-import.e2e.ts | 19 | 17 | 0 | 2 |
| remotion-panel-stability.e2e.ts | 3 | 3 | 0 | 0 |
| screen-recording-repro.e2e.ts | 1 | 1 | 0 | 0 |
| simple-navigation.e2e.ts | 3 | 0 | 3 | 0 |
| sticker-overlay-export.e2e.ts | 12 | 0 | 0 | 12 |
| sticker-overlay-testing.e2e.ts | 6 | 5 | 1 | 0 |
| terminal-paste.e2e.ts | 4 | 2 | 0 | 2 |
| text-overlay-testing.e2e.ts | 6 | 6 | 0 | 0 |
| timeline-duration-limit.e2e.ts | 1 | 1 | 0 | 0 |
| visual-regression.e2e.ts | 5 | 2 | 3 | 0 |

---

## Failure Categories

### Category 1: UI Text/Selector Changes (5 tests) — Easy Fix
Tests #4, #5, #6, #11 (simple-navigation + editor-navigation): "Your Projects" → "Studio" rename, "New project" → "New Project" casing change.

**Fix**: Update test selectors to match current UI text.

### Category 2: Export Dialog Redesign (3 tests) — Medium Fix
Tests #1, #2, #3 (auto-save-export-file-management): Export status, format options, and filename input test IDs are missing/changed.

**Fix**: Audit export dialog `data-testid` attributes and update tests to match current UI structure.

### Category 3: Visual Regression Drift (3 tests) — Easy Fix
Tests #7, #8, #9 (visual-regression): Pixel differences 2-4% from baselines.

**Fix**: Regenerate baselines with `bunx playwright test visual-regression --update-snapshots`.

### Category 4: FFmpeg Odd Dimension (1 test) — Medium Fix
Test #10 (audio-video-simultaneous-export): FFmpeg code path in `extract-audio` IPC handler doesn't have the pad filter.

**Fix**: Apply the same `-vf "pad=ceil(iw/2)*2:ceil(ih/2)*2"` filter to the `extract-audio` handler, or ensure the Electron test window uses even dimensions.

### Category 5: Skipped Test Running Again (1 test) — Easy Fix
Test #12 (remotion-export-pipeline): `test.skip()` may have been reverted.

**Fix**: Verify `test.skip()` is still in place. If reverted, re-add it or implement the Remotion indicator UI.

### Category 6: Selector Collision (1 test) — Medium Fix
Test #13 (sticker-overlay-testing): Tab selector picks up Claude Code panel button instead of sticker category tab.

**Fix**: Use a more specific selector (e.g., scope to the sticker panel container) to avoid collision with other `[role="tablist"]` elements.

---

## Recommendations

### Immediate (fix before next test run)

1. **Update "Your Projects" → "Studio"** in `simple-navigation.e2e.ts` and `editor-navigation.e2e.ts` — simple text replacement
2. **Fix case sensitivity** in `simple-navigation.e2e.ts` — change expected "New project" to "New Project"
3. **Regenerate visual regression baselines** — `bunx playwright test visual-regression --update-snapshots`
4. **Re-skip Remotion export indicator test** if `test.skip()` was lost

### Short-term (within sprint)

5. **Audit export dialog test IDs** — update `auto-save-export-file-management.e2e.ts` to match current export UI structure
6. **Fix sticker panel selector** — scope `[role="tablist"] button` selector within sticker panel container
7. **Fix FFmpeg odd-dimension** in `extract-audio` handler — apply pad filter or use even window dimensions

### Expected results after fixes

| Status | Count |
|--------|-------|
| Passed | 117 |
| Failed | 0 |
| Skipped | 19 |
| **Total** | **136** |

**Expected pass rate**: 100% (117/117 non-skipped tests)
