# Novel Parse — End-to-End Integration Plan

## Overview

The novel-parser core pipeline is implemented and tests pass (33/33).

### Completed (CLI path)
- HTTP route `/api/claude/novel/parse` wired up
- Main-process novel-parse handler with clip-matching, JSON repair, prompts
- NovelParseResult → ScriptData converter with tests
- CLI command `editor:novel:parse` is end-to-end functional

### Remaining (GUI path)
- No GUI entry point ("Import Novel" button) in the Moyin/Director panel
- No progress UI for novel parsing steps
- Store action `parseNovel` not yet added to moyin-store

**Branch**: `donghao/qur-210-openclaw-cli-v6`

---

## Current State

| Component | Status | File |
|-----------|--------|------|
| Core pipeline | Done | `apps/web/src/lib/moyin/script/novel-parser.ts` |
| Clip matching | Done | `apps/web/src/lib/moyin/script/clip-matching.ts` |
| JSON repair | Done | `apps/web/src/lib/moyin/script/json-repair.ts` |
| Prompt templates | Done | `apps/web/src/lib/moyin/script/novel-prompts.ts` |
| Unit tests | Done (27/27) | `apps/web/src/lib/moyin/script/__tests__/novel-parser.test.ts`, `clip-matching.test.ts` |
| CLI command registration | Done | `electron/native-pipeline/cli/command-registry-editor.ts:608` |
| CLI handler | Done | `electron/native-pipeline/cli/cli-handlers-editor.ts:527` |
| HTTP route | Done | `electron/claude/http/claude-http-shared-routes.ts` |
| Main-process handler | Done | `electron/moyin/novel-parse-handler.ts` |
| NovelParseResult converter | Done | `apps/web/src/lib/moyin/script/novel-to-script.ts` |
| GUI button | **Missing** | Needs: `apps/web/src/components/editor/media-panel/views/moyin/script-input.tsx` |
| Store actions | **Missing** | Needs: `apps/web/src/stores/moyin/moyin-store.ts` or `moyin-parse-actions.ts` |

---

## Subtasks

### Task 1: Add HTTP route `/api/claude/novel/parse`

The CLI handler at `cli-handlers-editor.ts:572` POSTs to `/api/claude/novel/parse`. This route needs to call the renderer-side `parseNovel()` via IPC.

**Files:**
- `electron/claude/http/claude-http-shared-routes.ts` — Add `router.post("/api/claude/novel/parse", ...)` route
- `electron/claude/http/claude-http-generate-routes.ts` — Alternative location if generate-routes handles LLM-dependent endpoints

**Implementation:**
1. Route receives `{ text, language, maxClips }` body
2. Sends IPC to renderer: `webContents.send("novel:parse", { text, language, maxClips })`
3. Renderer runs `parseNovel()` with the Electron LLM adapter
4. Returns result via IPC reply or promise-based `invoke`

**Consideration:** `parseNovel()` is async and long-running (multiple LLM calls). The HTTP route should either:
- (a) Stream SSE progress events back, or
- (b) Return a job ID and let CLI poll, or
- (c) Block until complete with a long timeout (simplest, fine for CLI)

Recommend **(c)** for first pass — the CLI already shows progress via `onProgress` callback which can be wired to stderr.

**Test:** `bun run pipeline editor:novel:parse --input <test-file> --json`

---

### Task 2: Add IPC handler for novel parse

The HTTP route needs to call into the renderer. This requires an IPC channel.

**Files:**
- `electron/preload.ts` — Expose `novelParse` in `window.electronAPI.moyin` (or new namespace)
- `electron/preload-integrations.ts` — Register IPC listener that calls `parseNovel()`
- `apps/web/src/types/electron/api-moyin.ts` — Add type for `novelParse` method

**Implementation:**
1. Main process handler: receives request from HTTP route, forwards to renderer via `webContents.send`
2. Preload bridge: `window.electronAPI.moyin.novelParse(config)` → `ipcRenderer.invoke("moyin:novel-parse", config)`
3. Main process IPC handler: `ipcMain.handle("moyin:novel-parse", ...)` → calls `parseNovel()` with the configured LLM adapter

**Alternative (simpler):** Run `parseNovel()` directly in the main process since it only needs the LLM adapter (HTTP calls), not renderer access. The LLM adapter can use the same `callFeatureAPI()` from the main process.

**Files for alternative approach:**
- `electron/claude/http/claude-http-generate-routes.ts` — Add route that calls `parseNovel()` directly
- `electron/native-pipeline/llm/llm-adapter.ts` or similar — Main-process LLM adapter that routes to configured provider

**Recommendation:** Use the alternative (main process) approach. `parseNovel()` is pure computation + LLM HTTP calls. No DOM/renderer needed.

---

### Task 3: Add "Import Novel" tab/button in ScriptInput

The existing `script-input.tsx` has `import` and `create` tabs. Add a third mode for novel import.

**Files:**
- `apps/web/src/components/editor/media-panel/views/moyin/script-input.tsx` — Add "Novel" tab or dropdown option
- `apps/web/src/stores/moyin/moyin-store.ts` — Add `parseNovel` action
- `apps/web/src/stores/moyin/moyin-parse-actions.ts` — Add `runNovelParsePipeline()` function

**Implementation:**
1. Add tab or button: "Import Novel" alongside existing "Import Script" / "Create"
2. Same textarea input but with different label: "Paste novel/story text"
3. On submit: call `useMoyinStore.getState().parseNovel(text, options)`
4. Store action calls `parseNovel()` from `novel-parser.ts` with the Electron LLM adapter
5. Show progress via existing `ImportProgress` component (reuse `pipelineProgress` state)
6. On completion: convert `NovelParseResult` → `ScriptData` and load into moyin store

**Key conversion:** `NovelParseResult.screenplays` → `ScriptData.scenes/shots`
- Each `ClipScreenplay.screenplay.scenes` → `ScriptScene`
- Characters/locations → `ScriptCharacter[]` / scene metadata
- This bridges novel-parser output into the existing moyin pipeline

---

### Task 4: NovelParseResult to ScriptData converter

Bridge the novel parser output format to the existing moyin store format.

**Files:**
- `apps/web/src/lib/moyin/script/novel-to-script.ts` (new, ~80-120 lines)
- `apps/web/src/lib/moyin/script/__tests__/novel-to-script.test.ts` (new)

**Implementation:**
```typescript
export function novelResultToScriptData(result: NovelParseResult): ScriptData {
  // Map ExtractedCharacter → ScriptCharacter
  // Map ClipScreenplay.scenes → ScriptScene
  // Map dialogue → Shot dialogue/voiceover
  // Preserve clip boundaries for timeline reference
}
```

**Test cases:**
- Full result with multiple clips → correct scene/shot count
- Failed screenplay clips → skipped gracefully
- Character/location deduplication
- Empty result → empty ScriptData

---

### Task 5: Progress UI for novel parsing

Novel parsing is multi-step and slow (3+ LLM calls). Users need feedback.

**Files:**
- `apps/web/src/components/editor/media-panel/views/moyin/import-progress.tsx` — Extend to show novel parse steps
- `apps/web/src/stores/moyin/moyin-store.ts` — Add novel-specific pipeline steps to `PipelineStep` type

**Implementation:**
- Add steps: `novel_characters`, `novel_locations`, `novel_clips`, `novel_screenplay`
- Reuse existing `ImportProgress` component with novel-specific step labels
- Show character/location counts as they're extracted
- Show clip count after splitting
- Show screenplay conversion progress (X/Y clips done)

---

## Implementation Order

1. **Task 4** — Converter (no dependencies, unit-testable) ~15 min
2. **Task 2** — IPC/LLM adapter in main process ~20 min
3. **Task 1** — HTTP route ~10 min
4. **Task 3** — GUI button + store action ~25 min
5. **Task 5** — Progress UI ~15 min

**Total estimate:** ~1.5 hours

---

## Testing Plan

| Test | Method | Command |
|------|--------|---------|
| Converter unit test | Vitest | `bun run test -- novel-to-script` |
| CLI end-to-end | CLI with test novel file | `bun run pipeline editor:novel:parse --input test-novel.txt --json` |
| GUI end-to-end | Manual in Electron | Open editor → Moyin panel → Import Novel tab → paste text → run |
| Existing tests still pass | Vitest | `bun run test -- novel-parser clip-matching` |
