# Native CLI: Unix Compatibility & Structured Debug Stream

**Status**: Implemented (2026-03-12)
**Priority**: High

## Overview

Upgraded QCut Native CLI with Unix-compatible defaults and a structured debug event stream. Built on existing foundations (command registry, exit codes, JSON output, session mode) — no rewrites.

**Two layers:**
1. **Compatibility layer** (portable) — stable exit codes, `--help --json`, stdout/stderr separation, `duration_ms`
2. **QCut customization layer** (product) — domain `error_code`, `command_id`/`project_id`/`job_id`, pipeline phase states

---

## Feature Status

| Feature | Status | Location |
|---------|--------|----------|
| Exit codes | **Done** | `output/errors.ts` — `ExitCode` enum (11 codes) |
| `--help --json` | **Done** | `cli-help.ts` — 3-level help |
| stdout/stderr separation | **Done** | `cli-output.ts` — audited, all handlers compliant |
| `--json` envelope | **Done** | `json-output.ts` — `command_id` + `duration_ms` in envelopes |
| Stream events | **Done** | `infra/stream-emitter.ts` + `infra/debug-stream.ts` |
| `duration_ms` | **Done** | Integer field in `StreamEvent`, JSON envelopes; `elapsed_seconds` kept as deprecated |
| `command_id` | **Done** | `generateCommandId()` in `types.ts`, wired in `cli.ts` |
| Recovery hints | **Done** | `RECOVERY_HINTS` map in `errors.ts`, `hint` field on `AIPlatformError` |
| `run(command)` entrypoint | **Done** | `cli-runner/run.ts` — `run()` + `runChain()` |
| `[exit:N \| Xs]` metadata | **Done** | Appended to stderr in non-JSON mode after every command |

---

## What Was Built

### 1. `command_id` correlation
- `generateCommandId()` produces `cmd-{timestamp}-{random}` IDs
- Generated in `cli.ts` before dispatch, stored in `options.commandId`
- Included in JSON envelopes (`command_id` field) and debug stream events
- **Files**: `cli-runner/types.ts`, `cli.ts`, `json-output.ts`

### 2. `duration_ms` standardization
- Added `duration_ms: number` (integer) to `StreamEvent` interface
- `elapsed_seconds` kept as deprecated alias for backward compatibility
- JSON envelopes (`jsonOk`, `jsonError`) accept optional `duration_ms`
- **Files**: `infra/stream-emitter.ts`, `json-output.ts`

### 3. Error recovery hints
- `RECOVERY_HINTS` map: `ExitCode` → actionable hint string
- `AIPlatformError.hint` field auto-populated from map, overridable via constructor
- `getRecoveryHint(exitCode)` exported for external use
- `formatErrorForCli()` returns `hint` alongside `message` and `exitCode`
- `CLIOutput.error()` prints hint in cyan below the error

| Exit Code | Hint |
|-----------|------|
| `API_KEY_MISSING` | `Set the key with: qcut-pipeline set-key --name <provider> --value <key>` |
| `FILE_NOT_FOUND` | `Check the path exists and is accessible` |
| `MODEL_NOT_FOUND` | `List available models: qcut-pipeline list-models --category <type>` |
| `TIMEOUT` | `Retry with a longer timeout: --timeout <ms>` |
| `API_CALL_FAILED` | `Check API status or retry with a different model: --model <alt>` |
| `INVALID_ARGS` | `Run with --help for usage information` |

- **Files**: `output/errors.ts`, `cli-output.ts`, `cli.ts`

### 4. `[exit:N | Xs]` metadata
- Appended to stderr after every command in non-JSON mode
- Suppressed in `--quiet` mode
- Format: `[exit:0 | 1.2s]`
- **File**: `cli.ts`

### 5. Structured debug event stream
- New `DebugStream` class emits JSONL to stderr when `--verbose` or `--stream` is active
- Events: `command:start`, `command:end`
- Fields: `command_id`, `command`, `timestamp`, `session_id` (optional), `exit_code`, `duration_ms`
- Wired into `cli.ts` main execution flow

```jsonl
{"event":"command:start","command_id":"cmd-1741830000-a1b2c3","command":"generate-image","timestamp":"2026-03-12T10:00:00.000Z"}
{"event":"command:end","command_id":"cmd-1741830000-a1b2c3","command":"generate-image","timestamp":"2026-03-12T10:00:03.200Z","exit_code":0,"duration_ms":3200}
```

- **File**: `infra/debug-stream.ts`

### 6. Unified `run(command)` entrypoint
- `run(command, baseOptions?, onProgress?)` — parse + dispatch + return `RunResult`
- `runChain(commands, options?)` — sequential execution with output piping
  - Passes previous `outputPath` as next `--input` automatically
  - Stops on first failure unless `continueOnError: true`
- Each result includes `exit_code`, `duration_ms`, `command_id`
- Exported from `cli-runner/index.ts` barrel
- **File**: `cli-runner/run.ts`

### 7. stdout/stderr audit
- Grepped all `cli-handlers-*.ts` and `cli-runner/` for raw `console.log`/`console.error`
- All existing usage was already compliant (data→stdout, warnings/errors→stderr)
- No fixes needed

---

## Files Changed

| File | Type | Lines |
|------|------|-------|
| `electron/native-pipeline/cli/cli-runner/run.ts` | **New** | ~120 |
| `electron/native-pipeline/infra/debug-stream.ts` | **New** | ~80 |
| `electron/__tests__/cli-unix-compat.test.ts` | **New** | ~160 |
| `electron/native-pipeline/cli/cli-runner/types.ts` | Modified | +6 (`commandId`, `generateCommandId`) |
| `electron/native-pipeline/cli/cli-runner/index.ts` | Modified | +3 (barrel exports) |
| `electron/native-pipeline/cli/cli.ts` | Modified | +20 (commandId, timing, debug stream, exit metadata, hints) |
| `electron/native-pipeline/cli/json-output.ts` | Modified | +25 (`command_id`, `duration_ms` in envelopes) |
| `electron/native-pipeline/cli/cli-output.ts` | Modified | +3 (hint parameter on `error()`) |
| `electron/native-pipeline/output/errors.ts` | Modified | +30 (`RECOVERY_HINTS`, `hint` field, `getRecoveryHint`) |
| `electron/native-pipeline/infra/stream-emitter.ts` | Modified | +6 (`duration_ms` field) |

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| `electron/__tests__/cli-unix-compat.test.ts` | 15 | All passing |
| `electron/__tests__/editor-session-cli.test.ts` | 10 | All passing |
| `electron/__tests__/editor-snapshot-cli.test.ts` | 9 | All passing |
| Type check (`tsc --noEmit`) | — | 0 errors in changed files |

### Test Coverage

- `generateCommandId` — format and uniqueness
- `getRecoveryHint` — all mapped exit codes + unmapped returns undefined
- `AIPlatformError.hint` — auto-populated from map + custom override
- `formatErrorForCli` — hint inclusion for typed and plain errors
- `DebugStream` — start/end events, session_id, disabled no-op
- `StreamEmitter` — `duration_ms` present as integer alongside `elapsed_seconds`
