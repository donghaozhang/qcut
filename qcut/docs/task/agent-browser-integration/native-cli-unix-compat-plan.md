# Native CLI: Unix Compatibility & Structured Debug Stream

**Status**: Planning
**Priority**: High
**Estimated effort**: ~3-4 hours (8 subtasks)

## Overview

Upgrade QCut Native CLI with Unix-compatible defaults and a structured debug event stream. The CLI already has strong foundations (command registry, exit codes, JSON output, session mode). This plan layers portable Unix conventions and machine-consumable debug events on top — no rewrites.

**Two layers:**
1. **Compatibility layer** (portable) — stable exit codes, `--help --json`, stdout/stderr separation, `duration_ms`
2. **QCut customization layer** (product) — domain `error_code`, `command_id`/`project_id`/`job_id`, pipeline phase states

---

## Current State Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Exit codes | **Done** | `ExitCode` enum in `output/errors.ts:14-26` (11 codes) |
| `--help --json` | **Done** | 3-level help in `cli-help.ts:166-221` |
| stdout/stderr separation | **Mostly done** | `CLIOutput` class in `cli-output.ts`, but some handlers may mix |
| `--json` envelope | **Done** | `jsonOk/jsonError/jsonPending` in `json-output.ts` |
| Stream events | **Partial** | `StreamEmitter` in `infra/stream-emitter.ts` — pipeline only |
| `duration_ms` | **Partial** | `elapsed_seconds` in StreamEvent, `duration` in CLIResult |
| `command_id` | **Missing** | Only `sessionId = cli-${Date.now()}` for pipelines |
| Recovery hints in errors | **Missing** | Errors are formatted but no actionable hints |
| `run(command)` unified entrypoint | **Missing** | Commands dispatched via switch in `runner.ts:205-412` |
| `[exit:N | Xs]` metadata | **Missing** | Exit code set but not echoed to stderr |

---

## Subtasks

### 1. Unified `run(command)` entrypoint
**Files**: `electron/native-pipeline/cli/cli-runner/runner.ts`
**Tests**: `electron/__tests__/cli-run-entrypoint.test.ts` (new)

Add a `run(command: string): Promise<CLIResult>` function that:
- Parses a command string into `CLIRunOptions` (reuse `parseSessionLine`)
- Calls the existing `CLIPipelineRunner.run()`
- Returns structured `CLIResult` with `exit_code`, `duration_ms`, `command_id`

This reduces invocation complexity for agents — one entrypoint, no tool-schema overhead.

```typescript
// electron/native-pipeline/cli/cli-runner/run.ts (new, ~60 lines)
export async function run(command: string): Promise<CLIResult & { exit_code: number; duration_ms: number; command_id: string }> {
  const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const start = performance.now();
  const opts = parseSessionLine(command);
  // ... dispatch via runner, capture result
  return { ...result, exit_code, duration_ms: Math.round(performance.now() - start), command_id: commandId };
}
```

### 2. Standardize `duration_ms` as integer field
**Files**: `electron/native-pipeline/infra/stream-emitter.ts`, `electron/native-pipeline/cli/json-output.ts`
**Tests**: `electron/__tests__/cli-output-format.test.ts` (new)

- Replace `elapsed_seconds: number` with `duration_ms: number` (integer) in `StreamEvent`
- Add `duration_ms` to `jsonOk()` and `jsonError()` envelopes
- Keep `elapsed_seconds` as deprecated alias for one release cycle

### 3. Append `[exit:N | Xs]` metadata to stderr on completion
**Files**: `electron/native-pipeline/cli/cli.ts`
**Tests**: update `electron/__tests__/editor-session-cli.test.ts`

After every command execution in `main()` (line ~663-681), emit to stderr:
```
[exit:0 | 1.2s]
```

Only in non-JSON mode. In JSON mode, the envelope already carries this info.

### 4. Add `command_id` to all command executions
**Files**: `electron/native-pipeline/cli/cli-runner/types.ts`, `electron/native-pipeline/cli/cli-runner/runner.ts`
**Tests**: update existing runner tests

- Add `commandId: string` to `CLIRunOptions`
- Generate in `cli.ts` before dispatch: `cmd-${Date.now()}-${randomSuffix}`
- Include in JSON output envelope, stream events, and error responses
- Enables correlation across streamed events and async job polling

### 5. Error messages with recovery hints
**Files**: `electron/native-pipeline/output/errors.ts`, `electron/native-pipeline/cli/cli-output.ts`
**Tests**: `electron/__tests__/cli-error-hints.test.ts` (new)

Add a `hint?: string` field to `AIPlatformError` and map common errors:

| Error | Hint |
|-------|------|
| `API_KEY_MISSING` | `Set the key with: qcut keys set <provider> <key>` |
| `FILE_NOT_FOUND` | `Check path exists: ls <path>` |
| `MODEL_NOT_FOUND` | `List available models: qcut list-models --provider <p>` |
| `TIMEOUT` | `Retry with longer timeout: --timeout <ms>` |
| `API_CALL_FAILED` | `Check API status or retry with --model <alt>` |

Format: `Error: <message>\nHint: <hint>` on stderr.

### 6. Structured debug event stream
**Files**: `electron/native-pipeline/infra/debug-stream.ts` (new, ~120 lines)
**Tests**: `electron/__tests__/debug-stream.test.ts` (new)

JSONL event stream to stderr when `--verbose` or `--stream` is active:

```jsonl
{"event":"command:start","session_id":"s-123","command_id":"cmd-456","command":"generate-image --model flux","timestamp":"2026-03-12T10:00:00Z"}
{"event":"command:stdout","command_id":"cmd-456","data":"Generating image...","timestamp":"..."}
{"event":"command:stderr","command_id":"cmd-456","data":"Warning: falling back to default model","timestamp":"..."}
{"event":"command:end","command_id":"cmd-456","exit_code":0,"duration_ms":3200,"timestamp":"..."}
```

Wire into `CLIPipelineRunner.run()` — emit `command:start` before dispatch, `command:end` after.

Extends the existing `StreamEmitter` pattern (pipeline events) to all commands.

### 7. Audit stdout/stderr separation
**Files**: `electron/native-pipeline/cli/cli-runner/handler-*.ts` (all handler files)
**Tests**: manual audit + grep

Grep all handlers for raw `console.log` / `console.error` calls that bypass `CLIOutput`. Replace with `CLIOutput` methods to maintain clean separation:
- **stdout**: final results, JSON output, piped data
- **stderr**: progress, warnings, errors, debug events

### 8. Chain/pipeline execution via `run()`
**Files**: `electron/native-pipeline/cli/cli-runner/run.ts`
**Tests**: `electron/__tests__/cli-chain-execution.test.ts` (new)

Add `runChain(commands: string[]): Promise<CLIResult[]>` that:
- Executes commands sequentially
- Passes previous output path as next input (if applicable)
- Stops on first failure (unless `--continue-on-error`)
- Returns array of results with individual `command_id` and `duration_ms`

---

## File Impact Summary

| File | Change Type |
|------|-------------|
| `electron/native-pipeline/cli/cli-runner/run.ts` | **New** (~100 lines) |
| `electron/native-pipeline/infra/debug-stream.ts` | **New** (~120 lines) |
| `electron/native-pipeline/cli/cli-runner/runner.ts` | Modify (add commandId, wire debug events) |
| `electron/native-pipeline/cli/cli-runner/types.ts` | Modify (add commandId field) |
| `electron/native-pipeline/cli/cli.ts` | Modify (generate commandId, emit exit metadata) |
| `electron/native-pipeline/infra/stream-emitter.ts` | Modify (add duration_ms, deprecate elapsed_seconds) |
| `electron/native-pipeline/cli/json-output.ts` | Modify (add duration_ms, command_id to envelopes) |
| `electron/native-pipeline/output/errors.ts` | Modify (add hint field) |
| `electron/native-pipeline/cli/cli-output.ts` | Modify (add hint formatting) |
| `electron/native-pipeline/cli/cli-runner/handler-*.ts` | Audit (replace raw console calls) |

## Implementation Order

1. `command_id` (subtask 4) — foundation for correlation
2. `duration_ms` standardization (subtask 2) — used by everything after
3. Error recovery hints (subtask 5) — standalone, no deps
4. `[exit:N | Xs]` metadata (subtask 3) — needs duration_ms
5. Structured debug stream (subtask 6) — needs command_id + duration_ms
6. Unified `run()` (subtask 1) — ties it all together
7. Chain execution (subtask 8) — builds on run()
8. stdout/stderr audit (subtask 7) — cleanup pass, do last

## Testing Strategy

- Unit tests for `run()`, `runChain()`, debug stream formatting
- Existing session/snapshot tests updated for new fields
- Grep-based audit for raw console usage in handlers
- Manual smoke test: `bun run pipeline generate-image --verbose --json` to verify JSONL debug stream
