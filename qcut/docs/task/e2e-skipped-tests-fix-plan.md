# E2E Skipped Tests Fix Plan

**Branch**: UI-v3
**Date**: 2026-03-03
**Total skipped tests**: 18

## Summary Table

| # | File | Test Name | Skip Reason | Category | Difficulty |
|---|------|-----------|-------------|----------|------------|
| 1 | `sticker-overlay-export.e2e.ts` | should log sticker render failures instead of silent failure | `addStickerToCanvas()` returns false → "Sticker canvas not available" | Sticker Canvas | Medium |
| 2 | `sticker-overlay-export.e2e.ts` | should continue export when individual stickers fail | Same as above | Sticker Canvas | Medium |
| 3 | `sticker-overlay-export.e2e.ts` | should preload sticker images before export starts | Same as above | Sticker Canvas | Medium |
| 4 | `sticker-overlay-export.e2e.ts` | should handle preload failures gracefully | Same as above | Sticker Canvas | Medium |
| 5 | `sticker-overlay-export.e2e.ts` | should show sticker without timing for entire video duration | Same as above | Sticker Canvas | Medium |
| 6 | `sticker-overlay-export.e2e.ts` | should respect sticker timing boundaries during export | Same as above | Sticker Canvas | Medium |
| 7 | `sticker-overlay-export.e2e.ts` | should provide sticker render summary after export | Same as above | Sticker Canvas | Medium |
| 8 | `sticker-overlay-export.e2e.ts` | should process multiple stickers during export | Same as above | Sticker Canvas | Medium |
| 9 | `sticker-overlay-export.e2e.ts` | should render multiple stickers in correct z-order | Same as above | Sticker Canvas | Medium |
| 10 | `sticker-overlay-export.e2e.ts` | should handle stickers at different time ranges without overlap | Same as above | Sticker Canvas | Medium |
| 11 | `sticker-overlay-export.e2e.ts` | should complete full sticker workflow: add, position, and export | Same as above | Sticker Canvas | Medium |
| 12 | `sticker-overlay-export.e2e.ts` | should preserve stickers during auto-save cycle | Same as above | Sticker Canvas | Medium |
| 13 | `ai-enhancement-export-integration.e2e.ts` | should upscale images via SeedVR panel | Upscale API unavailable (requires FAL.ai API key) | External API | Low |
| 14 | `editor-navigation.e2e.ts` | should attempt to open existing project without crash | No existing projects to test with (conditional) | Test Data | Low |
| 15 | `project-folder-sync.e2e.ts` | should handle missing electronAPI gracefully | Electron contextBridge makes electronAPI non-configurable | Test Infeasibility | N/A |
| 16 | `remotion-export-pipeline.e2e.ts` | export dialog shows Remotion engine indicator | UI-v3 export dialog redesign removed Remotion engine indicator text | UI Redesign | Easy |
| 17 | `terminal-paste.e2e.ts` | PTY Terminal Session: start/stop + paste test (2 tests in describe block) | PTY not available in CI (env `PTY_AVAILABLE!=true`) | Environment | Low |
| 18 | `remotion-folder-import.e2e.ts` | Real Remotion Project Debug (2 tests in describe block) | `REMOTION_PROJECT_PATH` env var not set | Environment | N/A |

> **Note**: Items 17 and 18 are `describe`-level skips that each cover 2 tests, bringing the total to 18 individual test skips.

---

## Root Cause Analysis

### Category 1: Sticker Canvas (12 tests)

**Root cause: Async initialization race condition in `sticker-test-helper.ts`**

The tldraw migration did **NOT** break stickers. Stickers use a completely separate system (`StickerCanvas.tsx` in `stickers-overlay/`) from the draw canvas (`tldraw-canvas.tsx` in `draw/`). The tldraw migration only touched files in `components/editor/draw/`.

The actual problem is a race condition in the E2E test infrastructure:

1. `sticker-test-helper.ts` is imported in `editor.$project_id.lazy.tsx` (line 17)
2. It calls `setupStickerTest()` on module load, which starts an async `setupTestEnvironment()` function
3. **The async function is not awaited** — it fires and forgets
4. The function does dynamic `await import(...)` calls for stores
5. By the time E2E tests call `page.evaluate()` to access `window.stickerTest`, the async setup hasn't completed
6. `window.stickerTest` is `undefined` → test returns `false` → test skips

**Key files**:
- `apps/web/src/lib/stickers/sticker-test-helper.ts` — the broken initialization
- `apps/web/src/test/e2e/helpers/electron-helpers.ts` lines 1023-1034 — the check that fails
- `apps/web/src/components/editor/stickers-overlay/StickerCanvas.tsx` — the actual canvas (works fine)
- `apps/web/src/stores/stickers-overlay-store.ts` — the store (works fine)

### Category 2: UI Redesign (1 test)

**Root cause: UI-v3 export dialog refactoring removed Remotion engine indicator UI**

Commit `246003ad` refactored the export dialog into card components. The `DetailsCard` component receives `engineRecommendation` as a prop but doesn't render it. The old UI showed:
- An "Engine: Remotion Engine" label in the details section
- A blue badge: "Timeline contains Remotion elements — Remotion Engine will be used"

The computation logic is intact in `use-export-settings.ts` and `export-engine-factory.ts`.

**Key files**:
- `apps/web/src/components/export-dialog/export-settings-cards.tsx` — `DetailsCard` receives but ignores `engineRecommendation`
- `apps/web/src/hooks/export/use-export-settings.ts` — still computes `engineRecommendation`

### Category 3: External API (1 test)

**Root cause: Test requires FAL.ai API key that isn't available in CI**

The upscale test tries to call the SeedVR upscale API. When the API is unreachable or the key is missing, it conditionally skips. This is intentional — the test works when `VITE_FAL_API_KEY` is configured.

### Category 4: Test Data (1 test)

**Root cause: Conditional skip when no projects exist**

`editor-navigation.e2e.ts` checks if existing projects are available before testing project opening. After database cleanup in `beforeEach`, there are no projects. This is expected behavior — the test is designed to only run when projects exist.

### Category 5: Test Infeasibility (1 test)

**Root cause: Electron contextBridge security prevents test scenario**

`project-folder-sync.e2e.ts` tries to test graceful degradation when `window.electronAPI` is missing. But Electron's contextBridge exposes it as non-configurable/non-writable, making it impossible to override in E2E. The comment explicitly says this should be a unit test instead.

### Category 6: Environment (3 tests)

**Root cause: Environment-specific features not available in CI**

- **PTY tests** (2): Require `PTY_AVAILABLE=true` env var — PTY terminal support may not be available in CI environments
- **Real Remotion project** (2): Require `REMOTION_PROJECT_PATH` env var pointing to a local Remotion project — debug-only tests for manual use

These are intentional gating mechanisms, not bugs.

---

## Concrete Fix Plan

### Fix 1: Sticker Canvas Race Condition (12 tests)

**Approach**: Fix the async initialization in `sticker-test-helper.ts` and add a readiness wait in the E2E helper.

**Step A — Fix `sticker-test-helper.ts`**:
```typescript
// Before (broken): fire-and-forget async
export function setupStickerTest() {
  const setupTestEnvironment = async () => { ... };
  setupTestEnvironment(); // ← not awaited, promise lost
}
setupStickerTest();

// After (fixed): signal readiness via a resolvable promise
let resolveReady: () => void;
const stickerTestReady = new Promise<void>((r) => { resolveReady = r; });

export function setupStickerTest() {
  const setupTestEnvironment = async () => {
    // ... existing dynamic imports and window.stickerTest setup ...
    resolveReady(); // signal completion
  };
  setupTestEnvironment().catch(console.error);
}

// Expose readiness promise on window
(window as any).stickerTestReady = stickerTestReady;
setupStickerTest();
```

**Step B — Update E2E helper `addStickerToCanvas()`** (electron-helpers.ts):
```typescript
// Add before accessing window.stickerTest:
await page.waitForFunction(
  () => (window as any).stickerTestReady instanceof Promise,
  { timeout: 5000 }
);
await page.evaluate(() => (window as any).stickerTestReady);
```

**Estimated effort**: 1-2 hours
**Risk**: Low — only changes test infrastructure, no production code

### Fix 2: Remotion Engine Indicator (1 test)

**Approach**: Restore the engine recommendation display in `DetailsCard`.

Add `engineRecommendation` rendering back to `export-settings-cards.tsx`:
```tsx
// In DetailsCard's grid, add:
{engineRecommendation && (
  <div className="col-span-2 text-blue-600 dark:text-blue-400">
    Engine: {engineRecommendation}
  </div>
)}
```

**Estimated effort**: 30 minutes
**Risk**: Low — the prop is already passed, just needs rendering

### Fix 3: Upscale API Test (1 test)

**Approach**: No code fix needed. This is working as designed — test runs when API key is available. Add to CI docs that `VITE_FAL_API_KEY` enables this test.

**Estimated effort**: N/A (documentation only)

### Fix 4: Editor Navigation (1 test)

**Approach**: Modify the test to create a project first, then test opening it, rather than relying on pre-existing projects.

```typescript
test("should attempt to open existing project without crash", async ({ page }) => {
  // Create a project first so we have something to open
  await createTestProject(page, "Navigation Test Project");
  // Navigate back to projects list
  await navigateToProjects(page);
  // Now open the project
  const projectCards = page.getByTestId("project-list-item");
  // ... rest of test
});
```

**Estimated effort**: 30 minutes
**Risk**: Low

### Fix 5: Missing electronAPI Test (1 test)

**Approach**: Convert to unit test. Delete the E2E test and create a unit test that mocks `window.electronAPI` as `undefined`.

**Estimated effort**: 1 hour
**Risk**: Low

### Fix 6: PTY and Remotion Debug Tests (3 tests)

**Approach**: No fix needed. These are intentionally gated behind environment variables for manual/local testing.

**Estimated effort**: N/A

---

## Priority Order

| Priority | Category | Tests Fixed | Value | Effort | Rationale |
|----------|----------|-------------|-------|--------|-----------|
| **P0** | Sticker Canvas Race Condition | 12 | High | Medium (1-2h) | Fixes 67% of all skipped tests with one infrastructure change |
| **P1** | Remotion Engine Indicator | 1 | Medium | Low (30min) | Simple UI restoration, validates engine recommendation system |
| **P2** | Editor Navigation | 1 | Low | Low (30min) | Easy fix, improves test self-sufficiency |
| **P3** | Missing electronAPI | 1 | Low | Low (1h) | Convert to unit test for proper coverage |
| **—** | Upscale API | 1 | — | — | Working as designed (API-gated) |
| **—** | PTY / Remotion Debug | 3 | — | — | Working as designed (env-gated) |

**Impact summary**: Fixing P0 alone unblocks 12/18 tests (67%). Fixing P0+P1+P2 unblocks 14/18 tests (78%). The remaining 4 tests are intentionally gated by environment/API availability and don't need fixes.

---

## Implementation Results (2026-03-03)

### Fixes Applied

| Fix | Tests Unskipped | Status | Files Changed |
|-----|----------------|--------|---------------|
| **P0: Sticker Canvas Race Condition** | 12 | Done | `sticker-test-helper.ts`, `electron-helpers.ts` |
| **P1: Remotion Engine Indicator** | 1 | Done | `export-settings-cards.tsx`, `remotion-export-pipeline.e2e.ts` |
| **P2: Editor Navigation** | 1 | Done | `editor-navigation.e2e.ts` |

**Total tests unskipped: 14/18 (78%)**

### Fix Details

#### P0: Sticker Canvas Race Condition (12 tests)
- **`sticker-test-helper.ts`**: Added a readiness promise (`stickerTestReady`) that resolves after async store imports complete. Exposed on `window.stickerTestReady` so E2E tests can await it. Also added `.catch()` error handling on the setup call — on failure, the promise still resolves (tests fail on missing stores instead of hanging).
- **`electron-helpers.ts`**: Added `waitForFunction` + `evaluate` calls in `addStickerToCanvas()` to await `window.stickerTestReady` before accessing `window.stickerTest`.
- **`remotion-export-pipeline.e2e.ts`**: Added same readiness wait in `addRemotionElementToTimeline()` since it also accesses `window.stickerTest`.

#### P1: Remotion Engine Indicator (1 test)
- **`export-settings-cards.tsx`**: Added conditional rendering of `engineRecommendation` in `DetailsCard`'s grid — displays as `"Engine: Remotion Engine (X Performance)"` in blue text when present.
- **`remotion-export-pipeline.e2e.ts`**: Unskipped the test. Simplified assertion to only check for `/Remotion Engine/` text (removed the old `/Timeline contains Remotion elements/` badge check which was from the pre-v3 UI).

#### P2: Editor Navigation (1 test)
- **`editor-navigation.e2e.ts`**: Replaced conditional skip with proactive setup — test now creates a project via `createTestProject()`, navigates back to projects list via `navigateToProjects()`, then proceeds with the open-project test. Added `createTestProject` and `navigateToProjects` to imports.

### Tests Remaining Skipped (4 — intentional)

| # | Test | Reason | Action |
|---|------|--------|--------|
| 1 | AI upscale (1 test) | Requires `VITE_FAL_API_KEY` | Working as designed |
| 2 | Missing electronAPI (1 test) | Electron contextBridge prevents override | Should be unit test (future) |
| 3 | PTY terminal (2 tests) | Gated by `PTY_AVAILABLE=true` | Working as designed; node-pty is installed, set env var to run locally |
| 4 | Remotion debug (2 tests) | Gated by `REMOTION_PROJECT_PATH` | Debug-only, manual use |
