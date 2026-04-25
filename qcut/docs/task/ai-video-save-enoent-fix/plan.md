# Plan: Fix `ENOENT` when saving generated AI videos to project media folder

**Issue**: [Quriosity-agent/qcut#290](https://github.com/Quriosity-agent/qcut/issues/290)
**Status**: 🟡 Planned
**Estimated time**: ~100–130 minutes (4 subtasks: refactor + stat-guard+retry + redact + tests)
**Risk**: Low–Medium — touches a critical write path used by every AI video generation, but the surface area is one Electron handler plus one renderer-side error mapper

---

## Background

### The bug this fixes

Saving a generated AI video can fail with an `ENOENT` while writing the `.mp4`
into the project media folder. The user sees:

```text
Failed to save video to disk: Failed to write video file to disk:
ENOENT: no such file or directory, open
'<project-root>\media\generated\videos\AI-Video-<model>-<timestamp>-...-<id>.mp4'
```

This aborts `integrateVideoToMediaStore()` even though generation and download
succeeded. The generated clip never reaches the media store.

### Where the bug lives

- `electron/ai-video-save-handler.ts:131-185` — `saveAIVideoToDisk()`
  - calls `fs.promises.mkdir(projectDir, { recursive: true, mode: 0o755 })` once
  - then calls `fs.promises.writeFile(filePath, buffer, { mode: 0o644 })`
  - has no re-check of the directory between `mkdir` and `writeFile`, no retry on `ENOENT`,
    and no redaction of the local path in the returned error string.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/media-integration.ts:154-181`
  — `integrateVideoToMediaStore()` treats any `saveResult.success === false` as
  fatal and surfaces the raw `error` string straight into a `toast`/`onError` call.
- `electron/project-folder-handler.ts:108-118, 370-407` — already centralizes the
  required project folder structure (`media/generated/videos/` is in `REQUIRED_FOLDERS`)
  via the `project-folder:ensure-structure` IPC. **`saveAIVideoToDisk()` does not
  use this**; it only `mkdir`s the deepest leaf directory.

### Root causes (multiple, ranked by likelihood)

1. **Cloud-synced Documents folders (OneDrive / iCloud)** — the directory entry
   exists as a "online-only" placeholder, `mkdir` returns success, but `writeFile`
   races against rehydration and gets `ENOENT`. This is the dominant cause on
   Windows machines where `Documents\` is OneDrive-mirrored.
2. **Project structure was never created** — the project folder for `projectId`
   may have been created in a prior session that crashed before
   `project-folder:ensure-structure` ran, or may have been deleted out from under
   the running app. `mkdir(projectDir, { recursive: true })` will create the leaf,
   but if a parent (`Documents/QCut/Projects/<id>/media/generated/`) is in a weird
   state on a cloud-synced volume, the leaf creation can succeed-then-disappear.
3. **TOCTOU race** — directory deleted/moved between `mkdir`, `statfs`, and
   `writeFile`.

### Why the current shape is the wrong shape

`saveAIVideoToDisk` independently re-implements directory creation that already
lives in `project-folder-handler.ts`. The two paths can drift (e.g. someone adds
a new required subfolder to `REQUIRED_FOLDERS` and forgets `saveAIVideoToDisk`).
The fix should funnel both through one shared helper so the project structure
contract is enforced in exactly one place.

### Goals

1. **Make AI video save reliable** when the project folder structure is missing,
   partially synced, or transiently unavailable.
2. **Centralize project folder ensure** logic — `saveAIVideoToDisk()` calls the
   same code path as `project-folder:ensure-structure`, not its own ad-hoc
   `mkdir`.
3. **Single retry with full structure recreation** when `writeFile` throws
   `ENOENT`, so cloud-sync placeholder cases self-heal.
4. **Redact full filesystem paths** from user-facing errors (debug log keeps the
   path).
5. **Regression tests** that pin the new behavior so the bug cannot silently
   come back.

### Non-goals (explicitly out of scope)

- Rewriting OneDrive detection / warning the user about cloud-synced Documents.
  (Could be a follow-up if telemetry shows it remains common.)
- Changing the project folder layout or moving away from `Documents/QCut/Projects/`.
- Touching `media-import-handler.ts` / image / audio save paths (they have the
  same anti-pattern but are out of scope for this issue — flagged at the bottom).
- Replacing `console.log` instrumentation with a real logger.

---

## Target architecture

### New shared helper

A new module `electron/lib/project-structure.ts` (extracted from the inline
`REQUIRED_FOLDERS` + ensure logic in `project-folder-handler.ts`) exposes:

```ts
// electron/lib/project-structure.ts

export const REQUIRED_PROJECT_FOLDERS = [
  "media",
  "media/imported",
  "media/generated",
  "media/generated/images",
  "media/generated/videos",
  "media/generated/audio",
  "media/temp",
  "output",
  "cache",
] as const;

export interface EnsureStructureResult {
  created: string[];
  existing: string[];
  projectRoot: string;
}

/**
 * Ensure the full QCut project folder tree exists under
 * Documents/QCut/Projects/<sanitized projectId>/.
 * Idempotent and safe to call repeatedly; safe under concurrent calls
 * because mkdir({ recursive: true }) tolerates EEXIST.
 */
export async function ensureProjectStructure(
  projectId: string
): Promise<EnsureStructureResult>;

/**
 * Resolve the projects base path (Documents/QCut/Projects).
 */
export function getProjectsBasePath(): string;

/**
 * Sanitize a single path component (no separators, no ..).
 */
export function sanitizePathComponent(component: string): string;
```

### Refactored save path

`saveAIVideoToDisk()` becomes:

```ts
// pseudocode — see Subtask 2 for actual diff
const projectDir = getAIVideoDir(projectId);

await ensureProjectStructure(projectId);   // ← replaces ad-hoc mkdir of leaf only

// ... build filePath ...

try {
  await writeFileWithStatGuard(filePath, projectDir, buffer, projectId);
} catch (writeError) {
  return {
    success: false,
    error: redactPath(`Failed to write video file: ${writeError.message}`),
  };
}
```

Where `writeFileWithStatGuard` does the **pre-write stat re-check** plus the
**single ENOENT retry** required by the issue's proposed fix:

```ts
async function writeFileWithStatGuard(
  filePath: string,
  projectDir: string,
  buffer: Buffer,
  projectId: string
): Promise<void> {
  // Step A: immediately before writeFile, confirm projectDir exists AND is a dir.
  // This catches the OneDrive placeholder / TOCTOU case before we even try to write.
  const dirOk = await isExistingDirectory(projectDir);
  if (!dirOk) {
    await ensureProjectStructure(projectId);
  }

  // Step B: write. If ENOENT, retry once after recreating the structure.
  try {
    await fs.promises.writeFile(filePath, buffer, { mode: 0o644 });
    return;
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
    await ensureProjectStructure(projectId);
    await fs.promises.writeFile(filePath, buffer, { mode: 0o644 });
  }
}

async function isExistingDirectory(p: string): Promise<boolean> {
  try {
    const s = await fs.promises.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}
```

Note the two-layer defence: the `stat` guard handles the *predictable* missing-dir
case (cloud-sync placeholder you can detect), and the ENOENT catch handles the
*unpredictable* race (dir disappears between stat and writeFile). Both are
needed because either alone is insufficient against TOCTOU.

### Error redaction (UI **and** logs gated by debug)

The issue requires that full local paths not leak to the UI **or logs unless
debug logging is enabled**. So redaction applies in two places:

```ts
// Debug flag: only when QCUT_DEBUG_PATHS=1 (env), or app.isPackaged === false,
// do we log the unredacted path. Production logs are redacted too.
const PATH_DEBUG =
  process.env.QCUT_DEBUG_PATHS === "1" || !app.isPackaged;

function redactPath(message: string): string {
  if (PATH_DEBUG) return message;
  const base = getProjectsBasePath();
  return message.replaceAll(base, "<project>");
}

// Use it for BOTH logs and IPC return values:
console.error("AI Video Save Error:", redactPath(error));
return { success: false, error: redactPath(error) };
```

This means a developer running `bun run electron:dev` still sees full paths
(`!app.isPackaged` → debug on); a customer running the packaged app sees
`<project>/media/generated/videos/AI-Video-...mp4` in both the UI toast and the
log file shipped with bug reports.

### Renderer-side error message

`media-integration.ts` keeps its current "Failed to save video to disk: …"
prefix, which now wraps the already-redacted server-side error.

---

## Subtasks

### Subtask 1 — Extract `ensureProjectStructure` into a shared module

**Time**: ~20 min
**Files**:

- **NEW** `electron/lib/project-structure.ts` — owns `REQUIRED_PROJECT_FOLDERS`,
  `getProjectsBasePath`, `sanitizePathComponent`, `ensureProjectStructure`.
- **EDIT** `electron/project-folder-handler.ts:99-154, 370-407`
  - Remove inline `REQUIRED_FOLDERS`, `getProjectsBasePath`, `sanitizePathComponent`
    constants/helpers.
  - Import them from `./lib/project-structure`.
  - The `project-folder:ensure-structure` IPC handler now delegates to
    `ensureProjectStructure(projectId)` so behavior is byte-for-byte preserved.
- **EDIT** `electron/preload-integrations.ts:183-184` — no change needed (just
  verify the IPC name `project-folder:ensure-structure` is unchanged).

**Acceptance**: All existing project-folder-handler tests still pass; the
`project-folder:ensure-structure` IPC returns the same shape.

---

### Subtask 2 — Pre-write `stat` guard + ENOENT retry in `saveAIVideoToDisk`

**Time**: ~30 min
**Files**:

- **EDIT** `electron/ai-video-save-handler.ts:130-193`
  - Replace the ad-hoc `mkdir(projectDir, { recursive: true, mode: 0o755 })`
    block at lines 137-146 with a call to `ensureProjectStructure(projectId)`.
  - Add a private `isExistingDirectory(p)` helper.
  - Add a private `writeFileWithStatGuard(filePath, projectDir, buffer, projectId)`
    that:
    1. **Pre-write check** — calls `isExistingDirectory(projectDir)`; if false,
       calls `ensureProjectStructure(projectId)` before attempting `writeFile`.
       This is the explicit "immediately before `writeFile`, re-check that
       `projectDir` exists and is a directory" requirement from the issue.
    2. **ENOENT retry** — on `writeFile` rejecting with `code === "ENOENT"`,
       calls `ensureProjectStructure(projectId)` and retries `writeFile` exactly
       once. Other errors propagate without retry.
  - Replace the existing `writeFile` call site (line 185) with
    `await writeFileWithStatGuard(...)`.
  - Both `ensureProjectStructure` failures and the second `writeFile` failure
    return `{ success: false, error }` with the redacted message.
- **EDIT** `electron/ai-video-save-handler.ts:18-34` — keep `getAIVideoDir`
  signature unchanged; it just composes `getProjectsBasePath()` + `media/generated/videos`.
  Internally rewrite to import `getProjectsBasePath` from the new shared module
  so both helpers agree on the base path.
- **EDIT** `electron/ai-video-save-handler.ts:9-13` — drop the local
  `sanitizeFilename`'s use for project IDs (still used for filenames). Use
  `sanitizePathComponent` from the shared module for project IDs.

**Acceptance**:
- The `stat` guard runs before every `writeFile`, even on the happy path
  (assertable in tests via spy on `fs.promises.stat`).
- ENOENT on first `writeFile` triggers exactly one retry and exactly one extra
  `ensureProjectStructure` call.
- Non-ENOENT errors propagate without a retry (unchanged behavior).
- The directory structure created matches `REQUIRED_PROJECT_FOLDERS`.

---

### Subtask 3 — Redact local paths from BOTH user-facing errors AND production logs

**Time**: ~20 min
**Files**:

- **EDIT** `electron/ai-video-save-handler.ts`
  - Add a module-level `PATH_DEBUG = process.env.QCUT_DEBUG_PATHS === "1" || !app.isPackaged`.
  - Add a private `redactPath(message: string): string` that no-ops when
    `PATH_DEBUG === true` and otherwise replaces `getProjectsBasePath()` with
    `<project>` in the message.
  - Apply `redactPath()` to **both**:
    1. Every `error` string returned from `saveAIVideoToDisk` (lines
       101, 112, 122, 140, 171, 187, 201, 209, 251).
    2. Every `console.error("AI Video Save Error:", ...)` call (same lines).
       This is the issue's "or logs unless debug logging is enabled" clause.
  - Leave `console.log` instrumentation (lines 30-33, 132-134, 240-242, 343, 348)
    untouched — those are explicit dev breadcrumbs and only run when the dev
    starts the app via `bun run electron:dev`. Document this exclusion at the
    top of the file with a one-line comment.
- **EDIT** `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/media-integration.ts:177-181`
  - No content change — confirm the now-redacted error string still composes
    cleanly into the existing toast prefix `"Failed to save video to disk: "`.
  - Leave `console.error("🚨 step 6e: CRITICAL - Save to disk FAILED:", error)`
    in place; the IPC payload is already redacted by the time it reaches the
    renderer.

**Acceptance**:
- In a packaged build with no `QCUT_DEBUG_PATHS=1`, neither IPC return values
  nor `console.error` output contain anything starting with the user's Documents
  folder.
- In `bun run electron:dev` (or with `QCUT_DEBUG_PATHS=1` set), full paths are
  preserved in `console.error` for debugging.
- Test case 6 (Subtask 4) asserts both halves with `app.isPackaged` mocked.

---

### Subtask 4 — Unit tests for ENOENT retry, structure ensure, and redaction

**Time**: ~30 min
**Files**:

- **NEW** `electron/__tests__/ai-video-save-handler.test.ts`
  - Mocks `electron` `app.getPath("documents")` (mirrors
    `electron/__tests__/ai-video-migration.test.ts:11-23` setup).
  - Mocks `fs.promises.writeFile` and `fs.promises.mkdir` selectively.
  - Cases (mapped to the issue's three required regression scenarios):
    1. **happy path** — `writeFile` succeeds first try; `stat(projectDir)`
       returns `isDirectory()=true`. → exactly one `ensureProjectStructure`
       call (the upfront one), one `stat`, one `writeFile`, returns
       `{ success: true, localPath, fileName, fileSize }`.
    2. **issue case A — `media/generated/videos` missing** — `stat(projectDir)`
       initially throws `ENOENT`; `ensureProjectStructure` then creates it;
       `writeFile` succeeds. Asserts the pre-write stat guard triggered an
       extra `ensureProjectStructure` call **before** any `writeFile` attempt.
    3. **issue case B — directory removed between `mkdir` and `writeFile`** —
       `stat(projectDir)` returns `isDirectory()=true` (TOCTOU); first
       `writeFile` rejects with `Object.assign(new Error("ENOENT…"), { code:
       "ENOENT" })`; second `writeFile` (after retry-time
       `ensureProjectStructure`) succeeds. Assert exactly two `writeFile`
       calls and exactly two `ensureProjectStructure` calls.
    4. **ENOENT twice (no infinite retry)** — both `writeFile` calls reject
       with `ENOENT`. Result is `{ success: false, error }`. Assert no more
       than two `writeFile` calls.
    5. **non-ENOENT error** — `writeFile` rejects with `EPERM`. Assert exactly
       one `writeFile` call (no retry) and `{ success: false }`.
    6. **issue case C — redacted user-facing error** — with `app.isPackaged =
       true` and `QCUT_DEBUG_PATHS` unset, both the IPC return value's `error`
       AND the `console.error` spy receive a string containing `"<project>"`
       and **not** containing the mocked `/mock/Documents` path. Then flip
       `app.isPackaged = false`, re-run, assert the full path IS present (debug
       mode passthrough).
- **NEW** `electron/__tests__/project-structure.test.ts`
  - Pure unit test of `ensureProjectStructure`:
    1. All folders missing → returns full `created` array, empty `existing`.
    2. All folders present → returns empty `created`, full `existing`.
    3. `mkdir` rejects on one folder → that folder appears in neither array;
       function still returns (does not throw); other folders still processed.
    4. `sanitizePathComponent` strips `..`, `/`, `\`.
    5. Path traversal in `projectId` is neutered (asserts `..` strings cannot
       escape `getProjectsBasePath()`).

**Acceptance**: `bun run test electron/__tests__/ai-video-save-handler.test.ts`
and `bun run test electron/__tests__/project-structure.test.ts` both pass; total
new coverage ≥ the six handler scenarios + five helper scenarios above.

---

## Verification checklist (before marking issue closed)

Tied to acceptance criteria from the issue:

- [ ] AI video save succeeds when `media/generated/videos` is missing but
      can be created. *(covered by test case 2 in Subtask 4)*
- [ ] AI video save retries once when the directory disappears between `mkdir`
      and `writeFile`. *(covered by test case 3)*
- [ ] User-facing errors do not expose full local filesystem paths.
      *(covered by test case 6, plus a manual `bun run electron:dev`
      smoke-test where you `rmdir` the videos folder mid-generation)*
- [ ] Tests cover the `ENOENT` case and directory recreation behavior.
      *(test cases 3, 4, plus structure test 1)*
- [ ] Manual smoke test on a OneDrive-synced `Documents` folder
      (Windows): trigger an AI video generation, confirm the save succeeds
      end-to-end. *(no automated coverage possible)*

---

## Future considerations (NOT in this PR — long-term direction)

These are noted so the next person touching this area knows they exist; do not
implement them here.

1. **Apply the same retry pattern to image and audio save paths**
   (`electron/ai-pipeline-output.ts`, `electron/media-import-handler.ts`).
   They have the same `mkdir` + `writeFile` shape and almost certainly the same
   latent bug. Track as a follow-up issue once this fix soaks.
2. **Detect cloud-synced Documents (OneDrive/iCloud) at app startup** and warn
   the user once. The signal is the presence of OneDrive-specific reparse points
   (Windows) or `com.apple.icloud` xattr (macOS) under `getPath("documents")`.
3. **Telemetry** — count ENOENT-then-recovered vs ENOENT-then-failed events to
   see whether the retry materially helps in the field. If retry-success rate is
   >95% we know the cloud-sync hypothesis was right; if not, there's another
   root cause to chase.

---

## Out-of-band notes

- Save handler currently logs absolute paths via `console.log` at
  `ai-video-save-handler.ts:30-33, 132-134, 240-242, 343, 348`. Those are dev
  logs and intentionally unredacted; do not redact `console.log` output.
- `getLegacyAIVideoDir` (line 40) and `migrateAIVideosToDocuments` (line 366)
  are used only by the one-shot AppData→Documents migration, not by the
  generation path. Untouched by this plan.
- The plugin layout (`packages/qagent/`, `electron/native-pipeline/`) does not
  duplicate this code path — only `electron/ai-video-save-handler.ts` writes
  generated AI videos in the Electron main process.
