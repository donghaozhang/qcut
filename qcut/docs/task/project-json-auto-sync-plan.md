# Project.json Auto-Sync Plan

> Auto-update `project.json` whenever project state changes — from GUI, CLI, or MCP.

## 1. Architecture: Event-Driven Auto-Sync

All three mutation paths converge on a single write mechanism:

```
┌─────────────────────────────────────────────────────────────┐
│                   Mutation Sources                          │
│                                                             │
│  GUI click ──→ Zustand store.setState() ──┐                │
│  CLI cmd   ──→ HTTP API ──→ store.setState() ──┤           │
│  MCP call  ──→ HTTP API ──→ store.setState() ──┘           │
│                                            │                │
│                              zustand.subscribe()            │
│                                            │                │
│                                   debounce (1000ms)         │
│                                            │                │
│                                  writeProjectJson()         │
│                                            │                │
│                              <projectDir>/project.json      │
└─────────────────────────────────────────────────────────────┘
```

**Key insight**: CLI and MCP operations already go through the HTTP API (`claude-http-server.ts`), which calls store actions on the renderer side via IPC events. So all three paths already mutate the Zustand stores. We only need **one subscriber** on the store side.

### Why One Unified Hook

- GUI operations (drag, add media, change settings) → directly mutate stores
- CLI operations (`--project-id`) → HTTP `POST /api/claude/timeline/batch/add` etc. → IPC → store mutations
- MCP operations → same HTTP API → same IPC → same store mutations

All roads lead to Zustand. One `subscribe()` catches them all.

## 2. Implementation Plan

### A. Zustand Store Subscription Hook (~30 LOC)

**File**: `apps/web/src/hooks/use-project-json-sync.ts` (new file)

```typescript
// useProjectJsonSync() — called once in the editor layout
// Subscribes to projectStore, timelineStore, mediaStore, exportStore
// On any change: debounce 1s → writeProjectJson()

import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useExportStore } from "@/stores/export-store";

export function useProjectJsonSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const debouncedWrite = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const project = useProjectStore.getState().activeProject;
        if (!project) return;
        window.electronAPI?.projectJson?.write(project.id);
      }, 1000);
    };

    const unsubs = [
      useProjectStore.subscribe(
        (s) => [s.activeProject?.name, s.activeProject?.updatedAt],
        debouncedWrite
      ),
      useTimelineStore.subscribe(
        (s) => s._tracks,
        debouncedWrite
      ),
      useMediaStore.subscribe(
        (s) => s.mediaItems.length,
        debouncedWrite
      ),
      useExportStore.subscribe(
        (s) => s.settings,
        debouncedWrite
      ),
    ];

    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, []);
}
```

**Where to mount**: In `apps/web/src/routes/editor.$project_id.tsx`, alongside existing `useSaveOnVisibilityChange()`.

**Note**: `projectStore` and `exportStore` do NOT currently use `subscribeWithSelector` middleware. Two options:
1. Add `subscribeWithSelector` middleware to those stores (minor refactor, ~2 lines each)
2. Use the basic `subscribe()` without selectors and compare manually

Option 1 is cleaner. The existing pattern is already used by `adjustment-store` and `remotion-store`.

### B. writeProjectJson() — Electron IPC Handler (~50 LOC)

**File**: `electron/project-json-handler.ts` (new IPC handler)

```typescript
// Receives: projectId
// 1. Calls existing HTTP API endpoints to gather state
//    (reuses project-json-builder.ts logic)
// 2. Writes JSON to <projectDir>/project.json
// 3. Returns success/error

import { buildProjectJSON } from "./native-pipeline/cli/project-json-builder.js";
import { EditorApiClient } from "./native-pipeline/editor/editor-api-client.js";

ipcMain.handle("project-json:write", async (_event, projectId: string) => {
  const client = new EditorApiClient("http://127.0.0.1:8765");
  const json = await buildProjectJSON(client, projectId);
  const projectDir = getProjectDir(projectId); // from existing storage utils
  await fs.writeFile(path.join(projectDir, "project.json"), JSON.stringify(json, null, 2));
  return { ok: true };
});
```

**Reuse**: The `buildProjectJSON()` function in `project-json-builder.ts` already:
- Fetches settings, stats, media from the HTTP API
- Builds a clean `ProjectJSON` object
- Handles type coercion with `str()`, `num()`, `parseMediaType()`

We reuse it as-is. No duplication.

**Alternative approach** (simpler, avoids HTTP round-trip): Read directly from stores via IPC instead of going through the HTTP API. But the builder already works with the HTTP API and is tested — reuse is cheaper.

### C. Preload Bridge (~5 LOC)

**File**: `electron/preload.ts` (add to existing bridge)

```typescript
projectJson: {
  write: (projectId: string) => ipcRenderer.invoke("project-json:write", projectId),
}
```

**File**: `apps/web/src/types/electron.d.ts` (add type)

```typescript
projectJson: {
  write: (projectId: string) => Promise<{ ok: boolean }>;
}
```

### D. CLI Post-Command Hook (~20 LOC)

CLI commands already go through the HTTP API. Two options:

**Option 1 (Recommended)**: No extra code needed. CLI → HTTP API → store mutation → subscriber fires → writeProjectJson(). The existing flow handles it.

**Option 2 (For offline/closed project)**: Add a `--sync-json` flag to CLI commands that triggers `buildProjectJSON()` directly and writes to disk without needing the editor open.

```typescript
// In electron/native-pipeline/cli/cli.ts, after command execution:
if (opts.syncJson && projectId) {
  const json = await buildProjectJSON(client, projectId);
  await fs.writeFile(path.join(projectDir, "project.json"), JSON.stringify(json, null, 2));
}
```

### E. Startup Regeneration (~10 LOC)

**Where**: In `project-store.ts` → `loadProject()`, after all stores are loaded.

```typescript
// After loading all stores successfully:
window.electronAPI?.projectJson?.write(id);
```

This ensures project.json is always fresh when a project opens, catching any changes made while the project was closed.

## 3. What Already Exists

| Component | File | What It Does |
|-----------|------|--------------|
| Auto-save debounce | `stores/timeline/timeline-store-autosave.ts` | 50ms debounced timeline save. Uses module-level `setTimeout` with project-switch guard. Pattern to follow. |
| Visibility save | `hooks/use-save-on-visibility-change.ts` | Immediate save on page hide. Saves both timeline and project metadata. Mount point example. |
| Storage service | `lib/storage/storage-service.ts` | Singleton with adapter chain (Electron IPC → IndexedDB → localStorage). Handles serialization, blob URL stripping. |
| ProjectJSON builder | `electron/native-pipeline/cli/project-json-builder.ts` | `buildProjectJSON()` and `buildProjectJSONMinimal()`. Fetches from HTTP API, builds typed JSON. Ready to reuse. |
| ProjectJSON types | `electron/native-pipeline/cli/project-json-types.ts` | Full TypeScript interfaces: `ProjectJSON`, `ProjectJSONMinimal`, `ProjectSettings`, `MediaEntry`, `ApiKeyStatus`. |
| Store subscribe pattern | `stores/adjustment-store.ts` | `subscribeWithSelector` middleware + `.subscribe(selector, callback)`. Existing pattern to copy. |
| HTTP API | `electron/claude/http/claude-http-server.ts` | REST endpoints at `127.0.0.1:8765` for project settings, stats, media, timeline CRUD. CLI and MCP use this. |
| Editor API client | `electron/native-pipeline/editor/editor-api-client.ts` | `EditorApiClient` class wrapping fetch calls to the HTTP API. Used by builder. |
| Cross-store coordination | `stores/project-store.ts` | Dynamic imports to avoid circular deps: `await import("./timeline-store")`. Follow this pattern. |
| IPC handler registration | `electron/main.ts` | All handlers registered in main process init. Add new handler here. |

## 4. Edge Cases

### Concurrent Writes
**Problem**: Rapid GUI changes could queue multiple writes.
**Solution**: 1000ms debounce ensures only the last change triggers a write. The debounce timer resets on each change, so rapid edits batch into one write. This matches the existing auto-save pattern (which uses 50ms).

### Large Projects
**Problem**: Building full ProjectJSON for a 500-media project could be slow.
**Solution**:
- `buildProjectJSONMinimal()` already exists (~200 tokens vs ~2000). Use minimal for frequent auto-sync, full only on explicit request.
- The HTTP API calls are local (127.0.0.1), so latency is negligible.
- JSON.stringify + fs.writeFile for a typical project.json (~5KB) takes <1ms.
- If needed later: diff-based writes (compare before writing) — but premature optimization for now.

### Project Not Open (CLI on Closed Project)
**Problem**: CLI runs `qcut project show --project-id X` but no editor window is open.
**Solution**: CLI's `buildProjectJSON()` calls the HTTP API, which requires the editor running. Two paths:
1. **Editor running**: Works via HTTP API → store → subscriber → write. Normal flow.
2. **Editor not running**: CLI already errors with "Editor not running" message. For offline support, add Option 2 from section D: read directly from storage files on disk (future enhancement, not MVP).

### Startup Stale Data
**Problem**: project.json could be stale if the project was modified externally.
**Solution**: Regenerate project.json on every `loadProject()` call (Section E). This is cheap (<10ms) and guarantees freshness.

### Project Switch Race Condition
**Problem**: User opens Project A, then quickly switches to Project B. A pending debounced write for Project A fires after Project B is loaded.
**Solution**: Capture `projectId` at debounce-schedule time (not at write time), and guard: if `activeProject.id !== capturedProjectId`, skip the write. This is the exact pattern used by `timeline-store-autosave.ts`.

### File System Permissions
**Problem**: project.json write could fail if the directory is read-only.
**Solution**: Wrap in try/catch, log warning, don't crash. project.json is informational (agent-readable), not critical to editor operation.

## 5. Effort Estimates

| Component | Files Changed | New LOC | Effort |
|-----------|---------------|---------|--------|
| **A. Zustand subscription hook** | 1 new + 1 edit (editor route) | ~30 | Small — follows existing subscribe pattern |
| **B. IPC handler + write logic** | 1 new handler + 1 edit (main.ts) | ~50 | Small — reuses `buildProjectJSON()` |
| **C. Preload bridge + types** | 2 edits (preload.ts, electron.d.ts) | ~5 | Trivial |
| **D. CLI post-command hook** | 0 (auto via store subscribe) | 0 | Free — CLI already goes through HTTP → stores |
| **E. Startup regeneration** | 1 edit (project-store.ts) | ~5 | Trivial |
| **F. Add subscribeWithSelector to stores** | 2-3 edits (project-store, export-store) | ~6 | Trivial |
| **Total** | ~4 new/edited files | ~96 LOC | **~2 hours** |

### Implementation Order

1. **B + C first**: IPC handler + preload bridge (backend plumbing)
2. **F**: Add `subscribeWithSelector` middleware to stores that need it
3. **A**: Subscription hook (frontend wiring)
4. **E**: Startup regeneration (one-liner in loadProject)
5. **D**: Verify CLI flow works end-to-end (should work automatically)

### Testing Strategy

- **Unit test**: Mock stores, verify `writeProjectJson()` is called with correct projectId after debounce
- **Manual E2E**: Open project → add media → verify project.json updates within ~1.5s
- **CLI E2E**: Run `qcut timeline add` → verify project.json reflects new element
- **Race condition**: Open project A, quickly switch to B, verify project.json contains B's data (not A's)
