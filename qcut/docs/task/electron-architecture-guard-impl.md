# Electron Architecture Guard Implementation Plan

Based on: QCut Electron Architecture Layer Violation Audit (2026-03-02)

**Goal**: Enforce Electron main/renderer boundaries with automated guards so violations are caught at lint-time, commit-time, and CI — not just by code review.

**Status**: In progress on branch `openai-practices-impl`

---

## Already Completed (PR #191)

These items from the audit are already done:

- [x] **Violation 2 fixed**: All 6 `process.env.NODE_ENV` usages replaced with `import.meta.env.DEV`
  - `apps/web/src/components/editor/media-panel/views/text2image.tsx`
  - `apps/web/src/components/editor/stickers-overlay/StickerElement.tsx`
  - `apps/web/src/config/features.ts`
  - `apps/web/src/lib/project/zip-manager.ts`
  - `apps/web/src/lib/remotion/export-engine-remotion.ts`
  - `apps/web/src/lib/stickers/debug-sticker-overlay.ts`
- [x] **Removed** `window.process.env.FAL_API_KEY` fallback in `apps/web/src/lib/ai-clients/fal-ai-client.ts`
- [x] **Removed** `process.env.TEMP/TMP/TMPDIR` usage in `apps/web/src/lib/remotion/export-engine-remotion.ts`
- [x] **Boundary check script** created: `scripts/check-boundaries.ts`
- [x] **Pre-commit hook** wired: `.husky/pre-commit` runs `bun scripts/check-boundaries.ts --staged`

---

## Remaining Tasks

### Task 1: Fix blog.tsx direct electron access

**Priority**: High (security risk + bad pattern for AI agents to copy)
**Files**:
- `apps/web/src/routes/blog.tsx:14-18` — remove `window.require("electron")`
- `electron/preload-integrations.ts` — add `shell.openExternal` to preload bridge (if not already exposed)
- `apps/web/src/types/electron/` — add type for `openExternal` if needed

**What to do**:
1. Check if `window.electronAPI` already exposes a `shell.openExternal` or equivalent
2. If not, add an IPC handler in `electron/` that calls `shell.openExternal(url)`
3. Expose it through `electron/preload-integrations.ts` via `contextBridge`
4. Add the type to the renderer-side electron types
5. Replace `blog.tsx` usage:
   ```tsx
   // Before (WRONG)
   const { shell } = window.require("electron");
   shell.openExternal(url);

   // After (CORRECT)
   window.electronAPI?.shell?.openExternal(url);
   ```
6. Verify boundary check passes: `bun scripts/check-boundaries.ts`

---

### Task 2: Add `window.require` detection to boundary checker

**Priority**: Medium
**Files**:
- `scripts/check-boundaries.ts:35-71` — add rule to RULES array

**What to do**:
Add a new rule to catch `window.require(...)` calls:
```ts
{
  pattern: /\bwindow\.require\b/,
  rule: "no-window-require",
  fix: "Do not use window.require(). Use window.electronAPI.* via preload bridge",
  docs: 'See CLAUDE.md "Electron API Best Practices" section',
}
```

The script already catches `require("electron")` imports, but not the `window.require` pattern used in blog.tsx.

---

### Task 3: Add Biome noRestrictedGlobals rule for process.env

**Priority**: Medium
**Files**:
- `biome.jsonc` — add rule under `linter.rules.suspicious` or `nursery`

**What to do**:
Biome supports `noRestrictedGlobals` (nursery). Add it to catch future `process.env` usage in renderer code:

```jsonc
"nursery": {
  "noRestrictedGlobals": {
    "level": "error",
    "options": {
      "deniedGlobals": ["process"]
    }
  }
}
```

Note: Biome applies file-level, not directory-level overrides. Since electron/ and scripts/ legitimately use `process`, this needs an override section that only applies to `apps/web/src/**`. Check Biome v2 docs for `includes`-scoped rule overrides.

If Biome doesn't support per-directory rule scoping, skip this task — the boundary checker script already covers it.

---

### Task 4: Update CLAUDE.md with explicit boundary rules

**Priority**: Medium (high impact for AI agents)
**Files**:
- `CLAUDE.md` — add section under "Architecture Guidelines"

**What to do**:
Add an explicit "Electron Boundary Rules" subsection with correct/incorrect examples:

```markdown
### Electron Boundary Rules

**NEVER do this in renderer code** (`apps/web/src/`):
- `window.require("electron")` — bypasses preload, security risk
- `process.env.NODE_ENV` — use `import.meta.env.DEV` instead
- `process.env.ANYTHING` — use `import.meta.env.VITE_*` or Electron IPC
- `import { ipcRenderer } from "electron"` — use `window.electronAPI.*`
- `import fs from "fs"` — use `window.electronAPI.files.*` via IPC

**Always do this**:
- Access Electron APIs through `window.electronAPI.*`
- Check availability: `if (window.electronAPI?.sounds)`
- Use `import.meta.env.DEV` for dev-only code
- Use `import.meta.env.VITE_*` for environment variables
```

Keep it short — AI agents scan this quickly.

---

### Task 5: Add CI workflow for architecture boundary check

**Priority**: Low (pre-commit hook catches most cases)
**Files**:
- `.github/workflows/` — new or existing CI workflow

**What to do**:
Add a step to an existing CI workflow (or create a lightweight one):

```yaml
- name: Check Electron boundaries
  run: bun scripts/check-boundaries.ts
```

This ensures violations caught even if someone skips the pre-commit hook.

---

## Current Violations Output

Running `bun scripts/check-boundaries.ts` today shows:

| Rule | File | Status |
|------|------|--------|
| no-electron-import | `apps/web/src/routes/blog.tsx:16` | **Fix in Task 1** |
| file-size | 6 files over 800 lines | Tracked in `files-over-800-lines.md` |

All `process.env` violations are resolved.

---

## Task Dependencies

```
Task 1 (fix blog.tsx) ─── no deps, do first
Task 2 (window.require rule) ─── do after Task 1 (validates the fix)
Task 3 (Biome rule) ─── independent, research needed
Task 4 (CLAUDE.md) ─── do after Task 1 (reference the fix as example)
Task 5 (CI workflow) ─── do last, optional
```

---

## Success Criteria

- `bun scripts/check-boundaries.ts` exits 0 (excluding file-size warnings)
- No `window.require` calls in `apps/web/src/`
- No `process.env` in renderer code (outside tests/types)
- CLAUDE.md has explicit boundary rules
- Pre-commit hook blocks future violations
