# Task: Add CLI Wrappers for Core State Control Commands

## Context

`editor-state-control.md` documents ~16 HTTP endpoints for state automation (snapshots, events, transactions, capabilities, notifications, undo/redo, correlation tracking). None have CLI wrappers — they're raw `curl` calls only.

Most are advanced plumbing rarely needed. Three are high-value and deserve CLI wrappers for consistency with the existing `editor:*` command pattern.

## Scope

### Add 3 CLI commands

| Command | HTTP equivalent | Why |
|---------|----------------|-----|
| `editor:undo` | `POST /api/claude/undo` | Common operation, one-liner |
| `editor:redo` | `POST /api/claude/redo` | Common operation, one-liner |
| `editor:state:snapshot` | `GET /api/claude/state` | Useful before multi-step edits |

#### `editor:undo` / `editor:redo`

- No required flags
- `--json` returns `{ "status": "ok", "data": { "undoCount": N, "redoCount": N } }`
- Human output: `Undo successful (4 remaining)`

#### `editor:state:snapshot`

- Optional `--include <sections>` — comma-separated: `timeline,selection,playhead,media,editor,project`
- Without `--include`: returns full snapshot
- `--json` returns the state envelope as-is from the HTTP API
- Human output: pretty-printed summary (track count, element count, playhead position, etc.)

### Trim `editor-state-control.md`

After adding the CLI wrappers, update the skill doc:

1. Remove "All New HTTP Endpoints" summary table (duplicates the sections above it)
2. Remove "Common Automation Workflows" section (LLM can compose these from individual docs)
3. Condense JSON response examples to key fields only
4. Remove "Key Source Files" table (move to SKILL.md or drop — LLM can find files via search)

Expected savings: ~40% token reduction (~1,500 tokens).

### Leave as HTTP-only

These remain documented in `editor-state-control.md` as `curl` examples, no CLI wrappers:

- Transactions (`begin`, `commit`, `rollback`) — niche, multi-call workflow
- Event streaming (SSE) — doesn't map to CLI invocation
- Capability negotiation — defensive check, rarely needed
- Notification bridge — session-specific setup
- Correlation / command lifecycle — advanced async tracking

## Files to modify

| File | Change |
|------|--------|
| `electron/native-pipeline/cli/command-registry-editor.ts` | Register 3 new commands |
| `electron/native-pipeline/cli/cli-handlers-editor.ts` | Add handler functions |
| `.claude/skills/native-cli/editor-state-control.md` | Trim redundant sections |
| `.claude/skills/native-cli/editor-core.md` | Add undo/redo/snapshot to command table |

## Acceptance criteria

- [ ] `bun run pipeline editor:undo --json` returns correct envelope
- [ ] `bun run pipeline editor:redo --json` returns correct envelope
- [ ] `bun run pipeline editor:state:snapshot --json` returns full state
- [ ] `bun run pipeline editor:state:snapshot --include timeline,playhead --json` returns partial state
- [ ] `bun run pipeline editor:undo --help --json` returns structured help
- [ ] `editor-state-control.md` token count reduced by ~40%
- [ ] All existing native-cli tests still pass
