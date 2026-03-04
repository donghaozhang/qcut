# CLI JSON Output Full Audit Plan

**Date**: 2026-03-04
**Branch**: `json`
**Goal**: Make ALL QCut CLI commands use the unified JSON output format via `jsonOk`/`jsonError`/`jsonPending` from `json-output.ts`.

---

## 1. Architecture Overview

The CLI has a two-level output architecture:

```text
Handler (returns CLIResult) → Runner (cli.ts main / session.ts) → jsonOk/jsonError envelope
```

- **Handler level**: Each handler returns a `CLIResult` object (`{success, data?, error?, outputPath?, cost?, duration?}`).
- **Top level**: `cli.ts main()` and `session.ts runSession()` wrap CLIResult with `jsonOk()`/`jsonError()` when `--json` is passed.
- **TTY level**: `cli-output-formatters.ts` formats human-readable output via `console.log` (only when `--json` is NOT set).

The `jsonOk`/`jsonError` helpers from `json-output.ts` are **only called in 2 places**: `cli.ts:820-832` and `session.ts:304-315`.

### Current Envelope Shape

```json
// Success
{"status": "ok", "data": {"schema_version": "1", "command": "...", "success": true, "data": {...}, ...}}

// Error
{"status": "error", "error": "...", "code": "command:failed"}
```

---

## 2. Command Audit Table

### Legend
- **Yes**: Properly returns structured data in CLIResult; JSON output works correctly
- **Partial**: Returns CLIResult but data field is incomplete or missing meaningful content
- **No**: Has issues (stray stdout writes, missing data, etc.)

| # | Command | Handler File | JSON Status | Issue |
|---|---------|-------------|-------------|-------|
| **Admin Commands** | | `cli-handlers-admin.ts` | | |
| 1 | `setup` | admin | Yes | — |
| 2 | `set-key` | admin | Yes | `console.error` warning (stderr, OK) |
| 3 | `get-key` | admin | Yes | — |
| 4 | `delete-key` | admin | Yes | — |
| 5 | `check-keys` | admin | Yes | — |
| 6 | `list-models` | admin | Yes | — |
| 7 | `estimate-cost` | admin | Yes | — |
| 8 | `init-project` | admin | Yes | — |
| 9 | `organize-project` | admin | Yes | — |
| 10 | `structure-info` | admin | Yes | — |
| 11 | `create-examples` | admin | Yes | — |
| 12 | `list-avatar-models` | admin (alias) | Yes | Reuses `list-models` with category filter |
| 13 | `list-video-models` | admin (alias) | Yes | Same |
| 14 | `list-motion-models` | admin (alias) | Yes | Same |
| 15 | `list-speech-models` | admin (alias) | Yes | Same |
| **Generation Commands** | | `cli-runner/handler-generate.ts` | | |
| 16 | `generate-image` | handler-generate | Yes | — |
| 17 | `create-video` | handler-generate | Yes | — |
| 18 | `generate-avatar` | handler-generate | Yes | — |
| **Pipeline Commands** | | `cli-runner/handler-pipeline.ts` | | |
| 19 | `run-pipeline` | handler-pipeline | Partial | `console.error` for cost/summary (stderr, OK). Stream mode writes progress JSON to stderr. Data field lacks step details. |
| **Media Analysis Commands** | | `cli-handlers-media.ts` | | |
| 20 | `analyze-video` | cli-handlers-media | Yes | Writes JSON file too (correct behavior) |
| 21 | `query-video` | cli-handlers-media | Yes | Writes JSON file too (correct behavior) |
| 22 | `transcribe` | cli-handlers-media | Yes | — |
| **Remotion Commands** | | `cli-handlers-remotion.ts` | | |
| 23 | `generate-remotion` | cli-handlers-remotion | Yes | `process.stderr.write` for info (OK) |
| **Moyin Commands** | | `cli-handlers-moyin.ts` | | |
| 24 | `moyin:parse-script` | cli-handlers-moyin | Yes | Stream chunks go to stderr (OK) |
| **Other Pipeline Commands** | | `cli-runner/handler-*.ts` | | |
| 25 | `transfer-motion` | handler-transfer | Yes | — |
| 26 | `generate-grid` | handler-grid | Yes | — |
| 27 | `upscale-image` | handler-upscale | Yes | — |
| 28 | `pipeline:status` | handler-pipeline-status | Yes | — |
| **ViMax Commands** | | `vimax-cli-handlers/*.ts` | | |
| 29 | `vimax:idea2video` | pipeline-handlers | Yes | — |
| 30 | `vimax:script2video` | pipeline-handlers | Yes | — |
| 31 | `vimax:novel2movie` | pipeline-handlers | Yes | — |
| 32 | `vimax:extract-characters` | character-handlers | Yes | — |
| 33 | `vimax:generate-script` | script-handlers | Yes | — |
| 34 | `vimax:generate-storyboard` | script-handlers | Yes | — |
| 35 | `vimax:generate-portraits` | character-handlers | Yes | — |
| 36 | `vimax:create-registry` | registry-handlers | Yes | — |
| 37 | `vimax:show-registry` | registry-handlers | Yes | — |
| 38 | `vimax:list-models` | model-handlers | Yes | — |
| **Editor Commands** | | `cli-handlers-editor.ts` → `editor-handlers-*.ts` | | |
| 39 | `editor:health` | editor-handlers-media | Yes | — |
| 40-49 | `editor:media:*` (10 cmds) | editor-handlers-media | Yes | All return API response as `data` |
| 50-64 | `editor:project:*` (15 cmds) | editor-handlers-media | Yes | All return API response as `data` |
| 65-85 | `editor:timeline:*` (21 cmds) | editor-handlers-timeline | Yes | All return API response as `data` |
| 86-92 | `editor:editing:*` (7 cmds) | editor-handlers-timeline | Yes | Polling async jobs return final result |
| 93-97 | `editor:analyze:*` (5 cmds) | editor-handlers-analysis | Yes | — |
| 98-102 | `editor:transcribe:*` (5 cmds) | editor-handlers-analysis | Yes | — |
| 103-108 | `editor:generate:*` (6 cmds) | editor-handlers-generate | Yes | — |
| 109-113 | `editor:export:*` (5 cmds) | editor-handlers-generate | Yes | — |
| 114 | `editor:diagnostics:analyze` | editor-handlers-generate | Yes | — |
| 115 | `editor:mcp:forward-html` | editor-handlers-generate | Yes | — |
| 116-117 | `editor:navigator:*` (2 cmds) | cli-handlers-editor | Yes | — |
| 118-122 | `editor:screen-recording:*` (5 cmds) | cli-handlers-editor | Yes | — |
| 123 | `editor:ui:switch-panel` | cli-handlers-editor | Yes | — |
| 124-126 | `editor:moyin:*` (3 cmds) | cli-handlers-editor | Yes | — |
| 127 | `editor:screenshot:capture` | cli-handlers-editor | Yes | — |
| 128-131 | `editor:remotion:*` (4 cmds) | editor-handlers-remotion | Yes | — |

**Total commands**: ~131
**Already working with JSON**: ~130 (via top-level wrapping)
**Partial**: 1 (`run-pipeline` — data field could be richer)

---

## 3. Identified Issues & Improvements

### Issue 1: Redundant `success` field in JSON envelope — DONE

The current `jsonOk()` wrapping spreads the entire CLIResult into `data`:

```json
{"status": "ok", "data": {"success": true, "command": "...", "data": {...}}}
```

Problems:
- `status: "ok"` and `data.success: true` are redundant
- `data.data` nesting is confusing for consumers

**Recommendation**: Flatten the envelope. Strip `success` from CLIResult before wrapping.

**Files to change**: `cli.ts` (lines 820-832), `session.ts` (lines 304-315)
**Estimated LOC**: ~20 lines

**Resolution**: Added `emitJsonResult()` helper in `json-output.ts` that strips `success` before wrapping. Both `cli.ts` and `session.ts` now call `emitJsonResult()`.

### Issue 2: `jsonError` loses CLIResult metadata on failure — DONE

When a command fails, only the error message and code are emitted:

```json
{"status": "error", "error": "...", "code": "command:failed"}
```

But some failures include useful metadata (`duration`, `data` with partial results). These are lost.

**Recommendation**: Add optional `data` field to `JsonErrorEnvelope` for partial results.

**Files to change**: `json-output.ts` (interface + function), `cli.ts`, `session.ts`
**Estimated LOC**: ~15 lines

**Resolution**: Added optional `data?: Record<string, unknown>` to `JsonErrorEnvelope` and `jsonError()`. The `emitJsonResult()` helper passes remaining CLIResult fields (duration, data, etc.) to error envelopes.

### Issue 3: `run-pipeline` data field lacks step details — DONE

The `handler-pipeline.ts` returns `data: { stepsCompleted, totalSteps }` but doesn't include per-step output paths or costs.

**Recommendation**: Include `steps` array with per-step results.

**Files to change**: `cli-runner/handler-pipeline.ts`
**Estimated LOC**: ~15 lines

**Resolution**: Added `steps` array mapped from `result.stepResults` with per-step `{ step, success, outputPath, duration, cost, error }`.

### Issue 4: `cli-output-formatters.ts` uses `console.log` (stdout) in non-JSON mode

This is **correct behavior** (only runs when `--json` is false), but if the check were ever bypassed, it would corrupt JSON output. The `formatCommandOutput()` function is called inside the `else if (result.success)` branch (line 843), not inside the `if (options.json)` branch.

**Status**: No change needed. Architecture is correct.

### Issue 5: `CLIOutput.result()` uses a different envelope format — DONE

The `CLIOutput` class has its own `createEnvelope()` function (`cli-output.ts:94-109`) that creates a different JSON shape than `jsonOk()`. This class is instantiated in `cli.ts` but its `.result()` method is never called — only `.success()`, `.info()`, `.cost()`, `.error()` are used.

**Recommendation**: Remove unused `JsonEnvelope` and `createEnvelope()` from `cli-output.ts` to prevent confusion. Or consolidate with `json-output.ts`.

**Files to change**: `cli-output.ts`
**Estimated LOC**: ~20 lines (removal)

**Resolution**: Removed `SCHEMA_VERSION`, `JsonEnvelope` interface, `createEnvelope()`, `result()`, and `table()` from `cli-output.ts`. All were unused.

### Issue 6: No `jsonPending` usage yet — DONE

The `jsonPending()` helper exists in `json-output.ts` but is never used. Commands with async polling (auto-edit, transcribe:start, generate:start, export:start) could emit a pending envelope before polling begins.

**Recommendation**: Use `jsonPending(jobId)` in polling commands when `--json` is passed.

**Files to change**: `editor-handlers-timeline.ts` (auto-edit, suggest-cuts), `editor-handlers-analysis.ts` (transcribe:start), `editor-handlers-generate.ts` (generate:start, export:start)
**Estimated LOC**: ~30 lines

**Resolution**: Added `if (opts.json) jsonPending(startResult.jobId)` before polling in all 5 async handlers: auto-edit, suggest-cuts, transcribe:start, generate:start, export:start.

### Issue 7: Session mode mirrors main() JSON wrapping — keep in sync — DONE

Both `cli.ts main()` and `session.ts runSession()` independently wrap results with `jsonOk`/`jsonError`. They should stay in sync.

**Recommendation**: Extract the wrapping logic into a shared `emitJsonResult(options, result)` function.

**Files to change**: `json-output.ts` (new function), `cli.ts`, `session.ts`
**Estimated LOC**: ~25 lines

**Resolution**: Added `emitJsonResult(command, result, extra?)` in `json-output.ts`. Both `cli.ts` and `session.ts` now call this single shared helper.

---

## 4. Per-File Change Summary

| File | Changes Needed | Est. LOC |
|------|---------------|----------|
| `json-output.ts` | Add `data` to error envelope, add `emitJsonResult()` helper, add `schema_version` constant | ~25 |
| `cli.ts` | Replace inline JSON wrapping with `emitJsonResult()`, flatten envelope | ~15 |
| `session.ts` | Replace inline JSON wrapping with `emitJsonResult()` | ~10 |
| `cli-output.ts` | Remove unused `JsonEnvelope`/`createEnvelope`, or mark deprecated | ~20 (deletion) |
| `cli-runner/handler-pipeline.ts` | Enrich `data` field with per-step results | ~15 |
| `editor-handlers-timeline.ts` | Emit `jsonPending` for async polling commands | ~10 |
| `editor-handlers-analysis.ts` | Emit `jsonPending` for transcribe:start polling | ~5 |
| `editor-handlers-generate.ts` | Emit `jsonPending` for generate:start, export:start polling | ~10 |
| **Total** | | **~110 lines** |

---

## 5. Priority Order

1. **P0 — Consolidate JSON wrapping** (Issues 1, 2, 7) — DONE
   - `json-output.ts`, `cli.ts`, `session.ts`
   - Fixes the redundant `success`/`data.data` nesting
   - Adds partial-result data to error envelopes
   - Single source of truth for envelope creation

2. **P1 — Remove duplicate envelope code** (Issue 5) — DONE
   - `cli-output.ts`
   - Eliminates confusion between two envelope formats

3. **P2 — Enrich pipeline data** (Issue 3) — DONE
   - `cli-runner/handler-pipeline.ts`
   - Better programmatic consumption of pipeline results

4. **P3 — Use jsonPending for async commands** (Issue 6) — DONE
   - Editor handler files
   - Progressive output for long-running jobs

---

## 6. Before/After Code Examples

### Example 1: Flattened JSON envelope (`cli.ts`)

**Before** (`cli.ts:820-832`):
```typescript
if (options.json) {
    if (result.success) {
        jsonOk({
            schema_version: "1",
            command: options.command,
            ...result,  // spreads success:true, data:{...}, outputPath, cost, duration
        });
    } else {
        jsonError(
            result.error || "Unknown error",
            `${options.command}:failed`
        );
    }
}
```

Output: `{"status":"ok","data":{"schema_version":"1","command":"generate-image","success":true,"data":{...},"outputPath":"..."}}`

**After** (using shared helper):
```typescript
if (options.json) {
    emitJsonResult(options.command, result);
}
```

In `json-output.ts`:
```typescript
export function emitJsonResult(command: string, result: CLIResult): void {
    if (result.success) {
        const { success: _, ...rest } = result;
        jsonOk({ schema_version: SCHEMA_VERSION, command, ...rest });
    } else {
        const { success: _, error, ...rest } = result;
        jsonError(error || "Unknown error", `${command}:failed`, rest);
    }
}
```

Output: `{"status":"ok","data":{"schema_version":"1","command":"generate-image","data":{...},"outputPath":"..."}}`

Removes redundant `success: true` from envelope data.

---

### Example 2: Error envelope with partial data (`json-output.ts`)

**Before**:
```typescript
export function jsonError(msg: string, code: string): void {
    const envelope: JsonErrorEnvelope = { status: "error", error: msg, code };
    console.log(JSON.stringify(envelope, null, 2));
}
```

Output for a failed analyze-video with partial duration:
```json
{"status": "error", "error": "Model timeout", "code": "analyze-video:failed"}
// duration: 45.2s is lost
```

**After**:
```typescript
export function jsonError(msg: string, code: string, data?: Record<string, unknown>): void {
    const envelope: JsonErrorEnvelope = { status: "error", error: msg, code };
    if (data && Object.keys(data).length > 0) {
        envelope.data = data;
    }
    console.log(JSON.stringify(envelope, null, 2));
}
```

Output:
```json
{"status": "error", "error": "Model timeout", "code": "analyze-video:failed", "data": {"duration": 45.2}}
```

---

### Example 3: Async polling with jsonPending (`editor-handlers-generate.ts`)

**Before** (generate:start with `--poll`):
```typescript
case "start": {
    const body = buildGenerateBody(options);
    const startResult = await client.post(`/api/claude/generate/${projectId}/start`, body);
    if (options.poll) {
        const jobId = (startResult as { jobId?: string }).jobId;
        if (jobId) {
            const final = await client.pollJob(`/api/claude/generate/${projectId}/status/${jobId}`, ...);
            return { success: true, data: final };
        }
    }
    return { success: true, data: startResult };
}
```

**After** (emit pending before polling):
```typescript
case "start": {
    const body = buildGenerateBody(options);
    const startResult = await client.post(`/api/claude/generate/${projectId}/start`, body);
    const jobId = (startResult as { jobId?: string }).jobId;
    if (options.poll && jobId) {
        if (options.json) jsonPending(jobId);  // immediate feedback
        const final = await client.pollJob(`/api/claude/generate/${projectId}/status/${jobId}`, ...);
        return { success: true, data: final };
    }
    return { success: true, data: startResult };
}
```

Note: This requires the handler to be aware of `options.json`, which breaks the current separation. Alternative: emit pending from the top-level wrapper instead, or return a `{ pending: true, jobId }` in CLIResult and let the wrapper call `jsonPending()`.

---

## 7. Total Effort Estimate

| Priority | Scope | Lines | Risk |
|----------|-------|-------|------|
| P0 | Consolidate JSON wrapping | ~50 | Low — refactor, no behavior change for consumers |
| P1 | Remove duplicate envelope | ~20 | Low — deletion only |
| P2 | Enrich pipeline data | ~15 | Low — additive only |
| P3 | jsonPending for async | ~30 | Medium — adds new output lines, needs docs |
| **Total** | | **~115 lines** | |

All changes are backward-compatible. The P0 change removes `data.success` from the OK envelope data, but since `status: "ok"` already conveys success, consumers should not break. **Note**: This is potentially breaking for consumers that rely on `data.success` being present. To migrate, check `status === "ok"` at the envelope level instead of `data.success`.

---

## 8. Testing Strategy

1. Run `bun run test` after each priority tier
2. E2E test key commands with `--json` flag and validate envelope shape:
   ```bash
   bun run pipeline list-models --json | jq '.status'
   bun run pipeline check-keys --json | jq '.data.command'
   bun run pipeline editor:health --json | jq '.status'
   ```
3. Verify no stray stdout output corrupts JSON (pipe through `jq .` and check exit code)
4. Session mode: test multi-command session with `--json` flag

---

## 9. Key Finding

**The current architecture is already well-designed.** All 131 commands return structured `CLIResult` objects, and the top-level wrapping in `cli.ts`/`session.ts` provides JSON output for every command. There are no stray `console.log` calls in handlers that would corrupt JSON output.

The remaining work is refinement:
- Cleaner envelope shape (no redundancy)
- Error envelopes with partial data
- Remove unused duplicate code
- Progressive output for async commands
