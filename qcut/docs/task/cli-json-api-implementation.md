# CLI Unified JSON API Implementation

## Summary

Added unified JSON output helpers and new editor/pipeline commands to the QCut CLI. All `--json` output now uses a consistent envelope format with `status` field (`ok`, `error`, `pending`).

## Changes

### 1. JSON Output Helper (`electron/native-pipeline/cli/json-output.ts`)

New module providing three functions:

- **`jsonOk(data)`** — prints `{ "status": "ok", "data": ... }`
- **`jsonError(msg, code)`** — prints `{ "status": "error", "error": "...", "code": "..." }`
- **`jsonPending(jobId)`** — prints `{ "status": "pending", "jobId": "..." }`

### 2. New Commands

| Command | Method | Endpoint | Description |
|---------|--------|----------|-------------|
| `editor:project:list` | GET | `/api/claude/projects` | List all projects |
| `editor:project:info` | GET | `/api/claude/project/:id/settings` | Get project info |
| `editor:timeline:info` | GET | `/api/claude/timeline/:id` | Get timeline state |
| `editor:timeline:add-clip` | POST | `/api/claude/timeline/:id/elements` | Add media clip to timeline |
| `editor:timeline:trim` | PATCH | `/api/claude/timeline/:id/elements/:eid` | Trim element start/end |
| `pipeline:status` | GET | `/api/claude/pipeline/jobs/:jobId` | Get pipeline job status |

### 3. Unified JSON Wrapping

All existing command outputs now route through `jsonOk`/`jsonError` when `--json` is passed:

- **`cli.ts` main function** — success → `jsonOk(...)`, failure → `jsonError(...)`
- **Session mode** (`session.ts`) — same unified wrapping per command result

### 4. Files Modified

| File | Change |
|------|--------|
| `electron/native-pipeline/cli/json-output.ts` | **New** — JSON output helpers |
| `electron/native-pipeline/cli/cli.ts` | Added new commands to COMMANDS, help text, `--format` flag, unified JSON wrapping |
| `electron/native-pipeline/cli/cli-runner/types.ts` | Added `format` field |
| `electron/native-pipeline/cli/cli-runner/runner.ts` | Added `pipeline:status` case |
| `electron/native-pipeline/cli/cli-runner/handler-pipeline-status.ts` | **New** — pipeline:status handler |
| `electron/native-pipeline/cli/cli-runner/session.ts` | Unified JSON wrapping in session mode |
| `electron/native-pipeline/editor/editor-handlers-media.ts` | Added `project:list`, `project:info` handlers |
| `electron/native-pipeline/editor/editor-handlers-timeline.ts` | Added `timeline:info`, `timeline:add-clip`, `timeline:trim` handlers |
| `.claude/skills/native-cli/references/REFERENCE.md` | Documented all new commands and updated JSON format docs |

### 5. JSON Envelope Format

```json
Success:  { "status": "ok",      "data": { ... } }
Error:    { "status": "error",   "error": "message", "code": "command:failed" }
Pending:  { "status": "pending", "jobId": "abc-123" }
```

The `data` field for success responses includes the existing `schema_version`, `command`, and result fields for backward compatibility.
