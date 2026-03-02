# OpenAI Agent Practices — QCut Implementation Plan

> Concrete implementation for the 2 actionable items from [openai-practices-evaluation.md](openai-practices-evaluation.md).
> Item 1 (Structured knowledge base) scored Low priority — skipped.

---

## Feature A: Lint Boundary Enforcement with Fix Instructions

**Estimated effort:** ~30 min
**Approach:** Pre-commit hook script (Biome does not support custom diagnostic messages)

### Why not Biome / ESLint?

| Option | Verdict |
|--------|---------|
| Biome custom diagnostics | Not supported in v2.4 — on roadmap, not shipped |
| Add ESLint at root | Conflicts with Biome; two linters = slower CI, config drift |
| **Pre-commit script** | **Zero dependencies, runs before commit, prints fix instructions** |

### Subtask A1: Create boundary-check script

**File:** `scripts/check-boundaries.ts`
**~80 lines**

```
Checks to implement:
1. process.env in renderer   → "Use import.meta.env.DEV or import.meta.env.VITE_*"
2. import from 'electron'    → "Use window.electronAPI.* via IPC bridge"
3. import { ipcRenderer }    → "Use window.electronAPI.* via IPC bridge"
4. require('fs') in renderer → "Use window.electronAPI.files.* via IPC bridge"
5. File > 800 lines          → "Split into smaller modules (see CLAUDE.md)"
```

**Scan scope:** `apps/web/src/**/*.{ts,tsx}` (renderer only)
**Exclude:** `apps/web/src/test/**`, `apps/web/src/types/**`

**Output format** (agent-friendly):
```
ERROR [ipc-boundary] apps/web/src/lib/ai-clients/fal-ai-client.ts:12
  Found: process.env.FAL_API_KEY
  Fix: Replace with import.meta.env.VITE_FAL_API_KEY
  Docs: See CLAUDE.md "Environment Variables" section

ERROR [file-size] apps/web/src/test/e2e/helpers/electron-helpers.ts
  Found: 1,211 lines (limit: 800)
  Fix: Split into focused modules under helpers/
```

**Relevant files to read:**
- `biome.jsonc` (line 126: `noExplicitAny: "off"`) — know what's already covered
- `apps/web/src/env.ts` — correct pattern for env vars
- `apps/web/src/types/electron/index.ts` — correct IPC pattern
- `electron/preload.ts` — IPC bridge implementation

### Subtask A2: Wire into pre-commit hook

**File:** `.husky/pre-commit`
**Current content:** `npx ultracite format`
**New content:**
```bash
npx ultracite format
bun scripts/check-boundaries.ts --staged
```

The `--staged` flag limits scanning to files in the current commit (fast).

### Subtask A3: Add npm script

**File:** `package.json`
**Add to scripts:**
```json
"check-boundaries": "bun scripts/check-boundaries.ts"
```

### Subtask A4: Fix existing violations

**Known `process.env` violations in renderer (13 files):**

| File | Line | Current | Fix |
|------|------|---------|-----|
| `apps/web/src/config/features.ts` | 67 | `process.env.NODE_ENV` | `import.meta.env.DEV` |
| `apps/web/src/lib/stickers/debug-sticker-overlay.ts` | 120 | `process.env.NODE_ENV` | `import.meta.env.DEV` |
| `apps/web/src/components/editor/stickers-overlay/StickerElement.tsx` | 236 | `process.env.NODE_ENV` | `import.meta.env.DEV` |
| `apps/web/src/stores/ai/text2image-store.ts` | 25 | `process.env.NODE_ENV` | `import.meta.env.DEV` |
| `apps/web/src/lib/project/zip-manager.ts` | 5 | `process.env.NODE_ENV` | `import.meta.env.DEV` |
| `apps/web/src/components/editor/media-panel/views/text2image.tsx` | 60 | `process.env.NODE_ENV` | `import.meta.env.DEV` |
| `apps/web/src/lib/remotion/export-engine-remotion.ts` | multiple | `process.env.*` | `import.meta.env.VITE_*` |
| `apps/web/src/lib/ai-clients/fal-ai-client.ts` | multiple | `process.env.*` | `import.meta.env.VITE_*` |

**No `import from 'electron'` violations found** — boundary is already clean here.

### Subtask A5: Unit tests

**File:** `apps/web/src/test/unit/check-boundaries.test.ts`

```
Test cases:
1. Detects process.env in .ts file         → returns violation
2. Detects process.env in .tsx file         → returns violation
3. Ignores import.meta.env                  → no violation
4. Detects import from 'electron'           → returns violation
5. Ignores window.electronAPI usage         → no violation
6. Detects files over 800 lines             → returns violation
7. Skips files in test/ directory           → no violation
8. Skips files in types/ directory          → no violation
9. Prints fix instruction in error message  → message contains "Fix:"
10. --staged flag filters to staged files   → only checks staged
```

---

## Feature B: Visual Regression Testing with Playwright Screenshots

**Estimated effort:** ~40 min
**Approach:** Level 1 first (Playwright built-in), Level 2 optional (AI verification)

### Subtask B1: Configure Playwright for visual regression

**File:** `playwright.config.ts`

**Add to `expect` block:**
```typescript
expect: {
  timeout: 10_000,
  toHaveScreenshot: {
    maxDiffPixelRatio: 0.01,    // Allow 1% pixel diff (for anti-aliasing)
    animations: "disabled",      // Freeze animations for stable screenshots
    caret: "hide",               // Hide blinking cursor
  },
},
```

**Add to `use` block:**
```typescript
use: {
  trace: "on-first-retry",
  screenshot: "only-on-failure",
  video: "on",
  actionTimeout: 5_000,         // Prevent flaky waits in screenshot tests
},
```

**Relevant files:**
- `playwright.config.ts` — main config (45 lines)
- `apps/web/src/test/e2e/utils/screenshot-helper.ts` — existing helpers (188 lines)
- `apps/web/src/test/e2e/helpers/electron-helpers.ts` — fixture setup (1,211 lines)

### Subtask B2: Create visual regression test helper

**File:** `apps/web/src/test/e2e/utils/visual-regression.ts`
**~60 lines**

```typescript
// Key functions:
assertScreenshot(page, name)
  → page.screenshot() + expect(screenshot).toHaveScreenshot(name + '.png')

assertElementScreenshot(page, selector, name)
  → locator.screenshot() + expect(screenshot).toHaveScreenshot(name + '.png')

// Baseline directory: apps/web/src/test/e2e/screenshots/baselines/
// Diff output: docs/completed/test-results-raw/
```

Builds on existing `screenshot-helper.ts` but adds assertion layer.

### Subtask B3: Add visual regression to key UI flows

**File:** `apps/web/src/test/e2e/visual-regression.e2e.ts`
**~120 lines**

```
Test cases (critical UI states):
1. Projects page — empty state                    → projects-empty.png
2. Projects page — with 1 project                 → projects-with-item.png
3. Editor — initial load (empty timeline)          → editor-empty.png
4. Editor — with media imported                    → editor-with-media.png
5. Editor — export dialog open                     → editor-export-dialog.png
6. Editor — text overlay panel                     → editor-text-panel.png
```

**Why these 6?** They cover the main user-facing views. More can be added incrementally.

**Relevant files:**
- `apps/web/src/test/e2e/simple-navigation.e2e.ts` — existing navigation tests to reference
- `apps/web/src/test/e2e/project-workflow-part1.e2e.ts` — project creation flow
- `apps/web/src/test/e2e/helpers/electron-helpers.ts:557-652` — `createTestProject()` helper

### Subtask B4: Add npm scripts and CI integration

**File:** `package.json`
**Add to scripts:**
```json
"test:e2e:visual": "playwright test visual-regression",
"test:e2e:visual:update": "playwright test visual-regression --update-snapshots"
```

**Baseline workflow:**
1. First run: `bun run test:e2e:visual:update` → generates baseline PNGs
2. Subsequent runs: `bun run test:e2e:visual` → compares against baselines
3. After intentional UI changes: `bun run test:e2e:visual:update` → updates baselines

### Subtask B5: Add .gitattributes for screenshot baselines

**File:** `.gitattributes`
**Add:**
```
apps/web/src/test/e2e/screenshots/baselines/*.png filter=lfs diff=lfs merge=lfs -text
```

Optional — only if baseline PNGs become large. Start without LFS, add later if needed.

### Subtask B6 (Future — Level 2): AI visual verification helper

**File:** `apps/web/src/test/e2e/utils/ai-visual-verify.ts`
**Not implemented now — documented for future reference**

```
Concept:
1. Capture screenshot as base64
2. Send to Gemini Vision / Claude Vision API
3. Prompt: "Does this UI look correct? Check for: overlapping elements,
   missing text, broken layout, empty panels that should have content"
4. Parse response: pass/fail + description of issues

Use case: Catch visual bugs that pixel-diff misses (e.g., wrong content
displayed in correct layout, text truncation, theme issues)

Dependencies: GEMINI_API_KEY or ANTHROPIC_API_KEY
Cost: ~$0.01/screenshot (Gemini), ~$0.02/screenshot (Claude)
Speed: ~2-5s per screenshot
```

---

## Implementation Order

```
Phase 1 — Lint boundaries (Feature A)          ~30 min
  A1. Create scripts/check-boundaries.ts
  A2. Wire into .husky/pre-commit
  A3. Add npm script
  A4. Fix existing process.env violations
  A5. Write unit tests

Phase 2 — Visual regression (Feature B)        ~40 min
  B1. Configure playwright.config.ts
  B2. Create visual-regression.ts helper
  B3. Write visual-regression.e2e.ts tests
  B4. Add npm scripts
  B5. Evaluate .gitattributes for LFS (defer if not needed)
  B6. Document AI verification for future (no code yet)
```

---

## Files Changed Summary

| File | Action | Feature |
|------|--------|---------|
| `scripts/check-boundaries.ts` | **Create** | A |
| `.husky/pre-commit` | Edit | A |
| `package.json` | Edit (scripts) | A, B |
| `apps/web/src/config/features.ts` | Edit | A4 |
| `apps/web/src/lib/stickers/debug-sticker-overlay.ts` | Edit | A4 |
| `apps/web/src/components/editor/stickers-overlay/StickerElement.tsx` | Edit | A4 |
| `apps/web/src/stores/ai/text2image-store.ts` | Edit | A4 |
| `apps/web/src/lib/project/zip-manager.ts` | Edit | A4 |
| `apps/web/src/components/editor/media-panel/views/text2image.tsx` | Edit | A4 |
| `apps/web/src/lib/remotion/export-engine-remotion.ts` | Edit | A4 |
| `apps/web/src/lib/ai-clients/fal-ai-client.ts` | Edit | A4 |
| `apps/web/src/test/unit/check-boundaries.test.ts` | **Create** | A5 |
| `playwright.config.ts` | Edit | B1 |
| `apps/web/src/test/e2e/utils/visual-regression.ts` | **Create** | B2 |
| `apps/web/src/test/e2e/visual-regression.e2e.ts` | **Create** | B3 |

**New files: 4** | **Edited files: 11** | **Total: 15 files**
