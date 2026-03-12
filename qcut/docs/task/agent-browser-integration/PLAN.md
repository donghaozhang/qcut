# Agent-Browser Integration for QCut Native CLI

**Source**: [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)
**Target**: QCut Native CLI (`electron/native-pipeline/`)
**Date**: 2026-03-12

---

## Executive Summary

agent-browser is a headless browser automation CLI designed for AI agents. It uses a **Rust CLI + Node.js daemon + Playwright** architecture with AI-optimized accessibility snapshots (deterministic `@ref` system). QCut's native CLI is a video processing pipeline with 155+ commands that orchestrates the QCut editor via HTTP on port 8765.

**Verdict: Do NOT use agent-browser directly as a dependency.** Instead, borrow specific architectural patterns and implement a lightweight browser automation layer natively within QCut's existing CLI infrastructure.

## Implementation Status

| Pattern | Status | Notes |
|--------|--------|-------|
| Accessibility Snapshots with Refs | Mostly complete | `editor:snapshot`, `editor:snapshot:click`, `editor:snapshot:fill`, `editor:snapshot:select`, and `editor:snapshot:check` are implemented on 2026-03-12; refs reuse stable renderer keys across re-snapshots |
| Console Message & Error Capture | Mostly complete | HTTP + CLI list/clear/stream path implemented on 2026-03-12 |
| Action Policy Engine | Mostly complete | Default allow/confirm/deny policy, flag-sensitive matching, `--policy`, runner enforcement, and tests implemented on 2026-03-12 |
| Session State Persistence | Mostly complete | Named session files, `--resume`, sticky project/panel hydration, autosave, and `editor:session:save/load/list/delete` commands are implemented on 2026-03-12 |
| Visual Diff Verification | Mostly complete | `editor:diff:snapshot` and `editor:diff:screenshot` landed on 2026-03-12 |
| WebSocket Viewport Streaming | Deferred | No immediate product need |

---

## Why Not Use Directly

| Reason | Detail |
|--------|--------|
| **Rust binary dependency** | agent-browser ships a Rust CLI that manages a Node.js daemon — QCut is pure TypeScript/Bun |
| **Heavy deps** | Pulls in full Playwright + Chromium (~400MB), WebDriverIO, iOS tooling |
| **Redundant daemon** | QCut already has an HTTP server on port 8765 — a second daemon adds complexity |
| **Wrong abstraction level** | agent-browser controls external websites; QCut needs to control its own Electron renderer |
| **Electron already has CDP** | QCut's Electron main process can use `webContents.debugger` for CDP directly — no external browser needed |
| **License concerns** | Apache-2.0 is fine, but bundling a Rust binary + Chromium into an Electron app is heavy |

---

## What to Borrow

### Pattern 1: Accessibility Snapshot with Refs (HIGH VALUE)

**Status (2026-03-12)**: Mostly implemented.

**What it is**: agent-browser's core innovation — generates an accessibility tree where each interactive element gets a deterministic ref (`@e1`, `@e2`). AI agents use these refs instead of fragile CSS selectors.

**Why QCut needs it**: The native CLI currently controls the editor via HTTP endpoints that require knowing exact element IDs, media IDs, and timeline structure. An accessibility snapshot would let AI agents discover and interact with UI elements they can't reach through the HTTP API (dialogs, settings panels, context menus).

**Implementation**:

```typescript
// electron/native-pipeline/cli/cli-handlers-snapshot.ts
export async function handleSnapshot(options: SnapshotOptions): Promise<SnapshotResult> {
  // Use Electron's webContents accessibility API
  const tree = await mainWindow.webContents.executeJavaScript(`
    // Build accessibility tree from DOM
    // Assign @eN refs to interactive elements
  `);
  return { tree, refs: refMap };
}
```

**Implemented files**:
- `electron/types/claude-snapshot-api.ts` — shared request/result types and depth limits
- `electron/claude/handlers/claude-snapshot-handler.ts` — renderer-side DOM traversal, stable ref reuse, and ref-based click/fill actions via `executeJavaScript`
- `electron/claude/http/claude-http-snapshot-routes.ts` — `/api/claude/snapshot`, `/api/claude/snapshot/click`, `/api/claude/snapshot/fill`, `/api/claude/snapshot/select`, and `/api/claude/snapshot/check`
- `electron/claude/http/claude-http-server.ts` — registers snapshot routes in the direct main-process test server
- `electron/utility/utility-http-server.ts` — exposes snapshot read/write routes in the real utility-process HTTP server
- `electron/utility/utility-bridge.ts` — bridges snapshot read/write requests back to the main process
- `electron/native-pipeline/cli/cli-handlers-snapshot.ts` — CLI handlers for `editor:snapshot`, `editor:snapshot:click`, `editor:snapshot:fill`, `editor:snapshot:select`, and `editor:snapshot:check`
- `electron/native-pipeline/cli/cli-handlers-editor.ts` — routes snapshot commands
- `electron/native-pipeline/cli/cli-runner/types.ts` — snapshot CLI option types
- `electron/native-pipeline/cli/cli.ts` — parses `--interactive`, `--depth`, and `--ref`
- `electron/native-pipeline/cli/command-registry-editor.ts` — registers command metadata and examples

**Completed subtasks**:
1. Implemented read-only `editor:snapshot` returning a ref-based visible UI tree
2. Added deterministic `@eN` refs, parent relationships, bounds, role/tag/name metadata, and actionable-state flags
3. Added `--interactive` filtering for actionable elements only
4. Added `--depth N` to clamp DOM traversal depth
5. Persisted the latest snapshot refs into the live DOM so follow-up actions can resolve them
6. Implemented `editor:snapshot:click --ref @eN` through the HTTP and utility-process path
7. Implemented `editor:snapshot:fill --ref @eN --text "..."` for text inputs and contenteditable targets
8. Reused stable refs across repeated snapshots by keeping a renderer-side stable-key map instead of renumbering everything on every capture
9. Added ref-recovery fallback for click/fill so actions can recover a target after transient rerenders when the stable key still matches
10. Added focused tests for handler validation, HTTP route behavior, and CLI query/action routing
11. Implemented `editor:snapshot:select --ref @eN --value "option"` for `<select>`, combobox, and listbox elements
12. Implemented `editor:snapshot:check --ref @eN --checked` for checkboxes, radio buttons, and switch roles
13. Added HTTP routes, utility bridge, and CLI handlers for select and check across the full IPC stack

**Remaining work**:
1. Add higher-level integration coverage against a live renderer DOM when needed
2. Tune stable-key heuristics further only if complex list reordering or virtualized UIs expose collisions

**Example usage by AI agent**:
```bash
bun run pipeline editor:snapshot --interactive --depth 2 --json
# → { "status": "ok", "data": {
#     "elements": [
#       { "ref": "@e1", "role": "button", "name": "Export", "actionable": true }
#     ],
#     "summary": { "total": 1, "actionable": 1 }
#   }}

bun run pipeline editor:snapshot:click --ref @e1 --json
# → clicks the element tagged with @e1 from the latest snapshot

bun run pipeline editor:snapshot:fill --ref @e2 --text "Updated title" --json
# → fills a text input or contenteditable target tagged with @e2

bun run pipeline editor:snapshot:select --ref @e3 --value "720p" --json
# → selects an option from a <select> or combobox tagged with @e3

bun run pipeline editor:snapshot:check --ref @e4 --checked --json
# → checks a checkbox/switch tagged with @e4

bun run pipeline editor:snapshot:check --ref @e4 --no-checked --json
# → unchecks a checkbox/switch tagged with @e4
```

**Test files**:
- `electron/claude/__tests__/claude-snapshot-handler.test.ts`
- `electron/claude/__tests__/claude-http-server.test.ts`
- `electron/__tests__/editor-snapshot-cli.test.ts`

---

### Pattern 2: Action Policy Engine (MEDIUM VALUE)

**Status (2026-03-12)**: Mostly implemented.

**What it is**: agent-browser has an `action-policy.ts` that categorizes actions into allow/deny/confirm buckets. This prevents AI agents from performing destructive actions without confirmation.

**Why QCut needs it**: The native CLI exposes destructive operations (`editor:project:delete`, `editor:timeline:batch-delete`, `editor:media:delete`). An action policy would add a safety layer when AI agents drive the CLI.

**Implementation**:

```typescript
// electron/native-pipeline/cli/action-policy.ts
interface ActionPolicy {
  allow: string[];   // Commands that run without confirmation
  confirm: string[]; // Commands that require confirmation
  deny: string[];    // Commands that are blocked
}

const DEFAULT_POLICY: ActionPolicy = {
  allow: ["editor:media:list", "editor:timeline:export", "editor:project:info"],
  confirm: ["editor:project:delete", "editor:timeline:batch-delete"],
  deny: []
};
```

**Implemented files**:
- `electron/native-pipeline/cli/action-policy.ts` — policy parsing, wildcard matching, flag-sensitive subject matching, default policy, and JSON file loading
- `electron/native-pipeline/cli/cli-runner/runner.ts` — policy enforcement before command dispatch using the resolved command+flag subject
- `electron/native-pipeline/cli/cli.ts` — parses `--policy` and documents `--force`
- `electron/native-pipeline/cli/cli-runner/session.ts` — carries policy settings through session mode and per-line parsing
- `electron/native-pipeline/cli/command-registry.ts` — exposes global policy metadata in registry help
- `electron/native-pipeline/cli/cli-runner/types.ts` — adds policy option typing

**Completed subtasks**:
1. Defined a default action policy with allow/confirm/deny buckets for editor commands
2. Added `--policy <path>` support for custom JSON policy files
3. Integrated policy checks in `runner.ts` before command dispatch
4. Reused `--force` to bypass confirm-tier policy prompts, while still blocking deny-tier commands
5. Added flag-sensitive policy matching so rules can target subjects like `editor:auth:token --set` instead of only bare command names
6. Tightened default confirm-tier coverage for sensitive auth mutations and other riskier flag combinations such as `editor:console --clear`
7. Added focused tests for pattern matching, policy loading, one-shot/session arg parsing, and runner enforcement

**Remaining work**:
1. Revisit the default confirm list as more editor mutations and UI automation flows are added
2. Add richer policy schema options only if a concrete product need emerges
3. Expand the sensitive-flag list only when a real command needs policy distinctions beyond the current coverage

**Example usage by AI agent**:
```bash
# Default policy blocks destructive editor commands unless --force is supplied
bun run pipeline editor:timeline:batch-delete --project-id my-proj --json

# Bypass confirm-tier actions explicitly
bun run pipeline editor:timeline:batch-delete --project-id my-proj --force --json

# Replace the default policy with a custom JSON file
bun run pipeline editor:snapshot:click --ref @e1 --policy ./agent-policy.json --json

# Match a sensitive variant of an otherwise read-only command
# Example custom policy entry: "confirm": ["editor:auth:token --reveal"]
bun run pipeline editor:auth:token --reveal --policy ./agent-policy.json --json
```

**Test files**:
- `electron/__tests__/action-policy.test.ts`

---

### Pattern 3: Session State Persistence (MEDIUM VALUE)

**Status (2026-03-12)**: Mostly implemented.

**What it is**: agent-browser saves/restores browser state (cookies, localStorage) between sessions with optional encryption.

**Why QCut needs it**: The native CLI's `--session` REPL mode already maintains a sticky project ID, but doesn't persist broader session state (last panel, recent commands, undo history checkpoint). Persisting session state would let agents resume complex multi-step workflows.

**Implementation**:

```typescript
// electron/native-pipeline/cli/session-state.ts
interface SessionState {
  projectId: string;
  lastPanel: string;
  commandHistory: string[];
  undoCheckpoint: string;
  savedAt: string;
}
```

**Implemented files**:
- `electron/native-pipeline/cli/session-state.ts` — named session files, state hydration, and autosave updates
- `electron/native-pipeline/cli/cli-handlers-session.ts` — explicit local session save/load commands
- `electron/native-pipeline/cli/cli.ts` — parses `--resume`, `--session-name`, and session-mode state directory flags
- `electron/native-pipeline/cli/cli-runner/runner.ts` — hydrates one-shot commands from resumed session state and autosaves after execution
- `electron/native-pipeline/cli/cli-runner/session.ts` — loads resumed state into REPL defaults, persists updates, and switches sticky context after explicit session loads
- `electron/native-pipeline/cli/cli-handlers-editor.ts` — routes `editor:session:*` commands and skips live editor health for local session operations
- `electron/native-pipeline/cli/command-registry-editor-extra.ts` — registers `editor:session:save`, `editor:session:load`, `editor:session:list`, and `editor:session:delete`
- `electron/native-pipeline/cli/command-registry.ts` — documents `--resume` in global flag metadata
- `electron/native-pipeline/cli/cli-runner/types.ts` — adds session resume and explicit session command typing

**Completed subtasks**:
1. Defined a local session state schema and stored named session files under the CLI state directory (`.../sessions/`)
2. Implemented JSON save/load helpers with sticky `projectId`, `lastPanel`, `lastTab`, and command history
3. Added `--resume <session-name>` for one-shot commands and session mode
4. Integrated resume hydration and autosave into both `runner.ts` and REPL session handling
5. Added explicit `editor:session:save` and `editor:session:load` commands for manual checkpoints and context restore
6. Added focused tests for round-trip persistence, arg parsing, sticky defaults, explicit session commands, and autosave behavior
7. Implemented `editor:session:list` to enumerate all saved sessions sorted by most recent
8. Implemented `editor:session:delete --session-name <name>` to remove a saved session file
9. Added `listSessions()` and `deleteSession()` helpers to `session-state.ts`

**Remaining work**:
1. Expand stored state beyond project/panel/history if there is a concrete need for undo checkpoints or richer editor context
2. Decide whether command history should capture fuller CLI invocations instead of compact summaries

**Example usage by AI agent**:
```bash
# Resume a sticky session for one-shot commands
bun run pipeline editor:timeline:export --resume my-edit-session --json

# Resume and autosave across an interactive REPL session
bun run pipeline --session --resume my-edit-session

# Save the current sticky context under a named checkpoint
bun run pipeline editor:session:save --session-name my-edit-session --project-id my-proj --json

# Load a named checkpoint and inspect or activate it in session mode
bun run pipeline editor:session:load --session-name my-edit-session --json

# List all saved sessions
bun run pipeline editor:session:list --json
# → { "status": "ok", "data": { "sessions": [...], "count": 3 } }

# Delete a session
bun run pipeline editor:session:delete --session-name my-edit-session --json
```

**Test files**:
- `electron/__tests__/session-state.test.ts`
- `electron/__tests__/editor-session-cli.test.ts`

---

### Pattern 4: Visual Diff for Verification (LOW-MEDIUM VALUE)

**Status (2026-03-12)**: Mostly implemented.

**What it is**: agent-browser can diff two snapshots or screenshots to verify that an action had the expected effect.

**Why QCut needs it**: After AI agents make timeline edits, they need to verify the result. A diff between pre/post snapshots would catch unintended side effects.

**Implementation**:

```typescript
// electron/native-pipeline/cli/cli-handlers-diff.ts
export async function handleDiff(options: {
  before: string;  // snapshot or screenshot file path
  after: string;   // snapshot or screenshot file path
  mode: "snapshot" | "screenshot";
}): Promise<DiffResult> {
  // Compare accessibility trees or pixel-diff screenshots
}
```

**Implemented files**:
- `electron/native-pipeline/cli/cli-handlers-diff.ts` — local snapshot diff engine for saved snapshot JSON files + pixel-level screenshot diff using sharp
- `electron/native-pipeline/cli/cli-handlers-editor.ts` — routes `editor:diff:*` commands and skips live editor health for local diffs
- `electron/native-pipeline/cli/cli.ts` — parses `--before`, `--after`, and `--threshold` and documents diff commands
- `electron/native-pipeline/cli/cli-runner/types.ts` — shared CLI option typing for diff file paths and threshold
- `electron/native-pipeline/cli/cli-runner/session.ts` — session-mode parsing for `--before`, `--after`, and `--threshold`
- `electron/native-pipeline/cli/command-registry-editor-extra.ts` — registers `editor:diff:snapshot` and `editor:diff:screenshot`

**Completed subtasks**:
1. Implemented `editor:diff:snapshot` for saved accessibility snapshots
2. Added local tree diff output with `added`, `removed`, `changed`, and summary totals
3. Matched elements semantically instead of by raw `@eN` refs to reduce noise from ref renumbering
4. Added focused CLI tests for parsing, diff execution, and missing-flag validation
5. Implemented `editor:diff:screenshot` for pixel-level PNG comparison using sharp
6. Added per-channel threshold support (`--threshold`, default 10) to control diff sensitivity
7. Generates a diff image (changed pixels in red, unchanged dimmed) saved alongside the before file
8. Handles mismatched dimensions by resizing the after image to match before for comparison
9. Reports `changePercent`, `changedPixels`, `totalPixels`, and dimension info in the summary

**Remaining work**:
1. Expand verification coverage if agents need richer diff output or artifact generation

**Example usage by AI agent**:
```bash
bun run pipeline editor:diff:snapshot --before before.json --after after.json --json
# → { "status": "ok", "data": {
#     "mode": "snapshot",
#     "same": false,
#     "summary": { "beforeTotal": 14, "afterTotal": 15, "added": 1, "removed": 0, "changed": 2 }
#   }}

bun run pipeline editor:diff:screenshot --before before.png --after after.png --json
# → { "status": "ok", "data": {
#     "mode": "screenshot",
#     "same": false,
#     "summary": {
#       "beforeDimensions": { "width": 1920, "height": 1080 },
#       "afterDimensions": { "width": 1920, "height": 1080 },
#       "dimensionsMatch": true,
#       "totalPixels": 2073600,
#       "changedPixels": 15420,
#       "changePercent": 0.74
#     },
#     "diffImagePath": "/path/to/diff-1710288000000.png"
#   }}

bun run pipeline editor:diff:screenshot --before a.png --after b.png --threshold 20 --json
# → adjusts per-channel sensitivity (0-255, default 10)
```

**Test files**:
- `electron/__tests__/editor-diff-cli.test.ts`

---

### Pattern 5: Console Message & Error Capture (HIGH VALUE)

**Status (2026-03-12)**: Mostly implemented.

**What it is**: agent-browser exposes `console` and `errors` commands that capture all browser console output (log, warn, error, info, debug) and uncaught page errors. AI agents use this to debug issues, verify actions succeeded, and understand runtime behavior without needing DevTools open.

**Why QCut needs it**: When AI agents drive the QCut editor via the native CLI, they're blind to what's happening inside the renderer. Console messages reveal:
- **Runtime errors** — React errors, failed API calls, FFmpeg failures, broken imports
- **State transitions** — Zustand store updates, timeline mutations, export progress
- **Warnings** — deprecation notices, missing assets, performance issues
- **Debug output** — developer `console.log()` statements that explain internal behavior
- **Network failures** — failed fetches to FAL, Gemini, ElevenLabs APIs

Without console capture, agents can only infer problems from HTTP API responses. With it, they get the same visibility a developer has with DevTools open.

**Implementation**:

```typescript
// electron/claude/handlers/claude-console-handler.ts
import { BrowserWindow } from "electron";

interface ConsoleEntry {
  level: "log" | "warn" | "error" | "info" | "debug";
  message: string;
  source: string;
  line: number;
  timestamp: number;
}

const consoleBuffer: ConsoleEntry[] = [];
const MAX_BUFFER = 500;

export function attachConsoleCapture(window: BrowserWindow) {
  window.webContents.on("console-message", (_event, level, message, line, source) => {
    consoleBuffer.push({
      level:
        level === 3 ? "error" :
        level === 2 ? "warn" :
        level === 1 ? "info" :
        "log",
      message,
      source,
      line,
      timestamp: Date.now(),
    });
    if (consoleBuffer.length > MAX_BUFFER) consoleBuffer.shift();
  });
}

// GET /api/claude/console — return buffered messages
// GET /api/claude/console/stream — SSE real-time stream
// GET /api/claude/errors — return only errors
```

```typescript
// CLI commands
// editor:console              — get last N console messages (default 50)
// editor:console --level error — filter by level
// editor:console --since 30s  — messages from last 30 seconds
// editor:console --clear      — clear the buffer
// editor:console --stream     — real-time SSE stream until interrupted
// editor:errors               — shortcut for --level error
```

The shipped renderer error capture is injected from the main process via `webContents.executeJavaScript()` on `did-finish-load`; it is not a preload-based hook. Console entries are redacted before storage, capture can be disabled with `QCUT_ENABLE_CONSOLE_CAPTURE=0`, and the HTTP console routes now require a configured `QCUT_API_TOKEN` plus a matching bearer token instead of being default-open.

**Implemented files**:
- `electron/claude/handlers/claude-console-handler.ts` — in-memory console buffer, filters, renderer error capture helpers
- `electron/claude/http/claude-http-auth.ts` — shared auth policy that hardens console/error routes
- `electron/claude/http/claude-http-console-routes.ts` — `/api/claude/console`, `/api/claude/errors`, `/api/claude/console/stream`
- `electron/claude/http/claude-http-server.ts` — registers console routes in the direct main-process test server
- `electron/utility/utility-http-server.ts` — exposes console routes in the real utility-process HTTP server
- `electron/utility/utility-bridge.ts` — bridges `console:list` / `console:clear` back to the main process
- `electron/main.ts` — attaches console capture when the main editor window is created
- `electron/native-pipeline/editor/editor-api-client.ts` — SSE client for CLI streaming
- `electron/native-pipeline/cli/cli-handlers-console.ts` — CLI handlers for `editor:console` and `editor:errors`
- `electron/native-pipeline/cli/cli-handlers-editor.ts` — routes `editor:console` / `editor:errors`
- `electron/native-pipeline/cli/cli-runner/runner.ts` — threads abort signal into editor commands
- `electron/native-pipeline/cli/command-registry-editor.ts` — registers command metadata

**Completed subtasks**:
1. Implemented `console-message` capture with an in-memory ring buffer in the Electron-side handler
2. Added `GET /api/claude/console`, `GET /api/claude/errors`, and `DELETE /api/claude/console`
3. Added `GET /api/claude/console/stream` SSE support at the HTTP layer
4. Implemented CLI commands `editor:console` and `editor:errors` for list/filter/clear/stream
5. Added renderer-failure capture via `render-process-gone` plus `window.error` / `unhandledrejection` listeners injected with `webContents.executeJavaScript()`
6. Redacted sensitive console fields before buffering them and added an opt-out capture flag via `QCUT_ENABLE_CONSOLE_CAPTURE=0`
7. Required `QCUT_API_TOKEN` plus bearer auth for console/error HTTP routes so local web pages cannot read or clear logs by default
8. Added focused tests for buffer/filtering, HTTP routes, and CLI routing

**Remaining work**:
1. Add higher-level integration coverage against the utility-process path if agents need end-to-end live-server validation
2. Broaden redaction heuristics only if real logs show additional sensitive patterns worth masking

**Example usage by AI agent**:
```bash
# After making a timeline edit, check for errors
QCUT_API_TOKEN=local-secret bun run pipeline editor:timeline:add-element --project-id my-proj --data '...' --token local-secret --json
bun run pipeline editor:console --token local-secret --level error --since 5s --json
# → { "status": "ok", "data": { "messages": [], "count": 0 } }  # No errors = success

# Debug a failing export
bun run pipeline editor:export:start --project-id my-proj --preset youtube --json
bun run pipeline editor:console --level error --json
# → { "status": "ok", "data": { "messages": [
#     { "level": "error", "message": "FFmpeg: codec not found", "source": "export-service.ts", "line": 142 }
#   ]}}

# Real-time monitoring during long operations
bun run pipeline editor:console --stream
# → streams live console entries until interrupted
```

**Test files**:
- `electron/claude/__tests__/claude-console-handler.test.ts`
- `electron/claude/__tests__/claude-http-server.test.ts`
- `electron/__tests__/editor-console-cli.test.ts`

---

### Pattern 6: WebSocket Streaming for Real-time Viewport (LOW VALUE)

**What it is**: agent-browser streams browser viewport via WebSocket + CDP screencast for remote viewing and input injection.

**Why QCut needs it**: Could enable remote monitoring of AI agent workflows — watch the editor as the agent makes edits. However, QCut already has screen recording via Electron APIs.

**Recommendation**: Defer. The existing `editor:screenshot:capture` and `editor:screen-recording:*` commands are sufficient for now. Implement only if there's a concrete use case for real-time remote viewing.

---

## Implementation Priority

| # | Pattern | Value | Effort | Priority |
|---|---------|-------|--------|----------|
| 1 | Accessibility Snapshots with Refs | HIGH | ~6h | **P0 (mostly complete)** |
| 5 | Console Message & Error Capture | HIGH | ~6.5h | **P0 (mostly complete)** |
| 2 | Action Policy Engine | MEDIUM | ~3h | **P1 (mostly complete)** |
| 3 | Session State Persistence | MEDIUM | ~3h | **P1 (mostly complete)** |
| 4 | Visual Diff Verification | LOW-MED | ~5.5h | **P2 (mostly complete)** |
| 6 | WebSocket Viewport Streaming | LOW | ~8h | **P3 (defer)** |

**Total estimated effort for P0**: ~12.5 hours (with both P0 tracks now mostly delivered)
**Total estimated effort for P0+P1**: ~15.5 hours (with P1 now largely delivered)

---

## Architecture Comparison

```text
agent-browser                          QCut Native CLI (proposed)
─────────────                          ──────────────────────────
Rust CLI ──→ Unix Socket ──→ Daemon    bun CLI ──→ HTTP ──→ Electron
                  │                                   │
            Playwright                     webContents.executeJavaScript()
                  │                          webContents.debugger (CDP)
            Chromium (external)                       │
                                             Electron Renderer (internal)
```

Key difference: QCut doesn't need an external browser. The Electron renderer IS the browser. This makes the implementation significantly simpler — we can use `webContents` APIs directly instead of managing a separate Playwright instance.

---

## File Structure (Current + Planned)

```text
electron/native-pipeline/
├── cli/
│   ├── cli-handlers-snapshot.ts    # NEW: Accessibility snapshot with refs (click, fill, select, check)
│   ├── cli-handlers-console.ts     # NEW: Console message capture CLI
│   ├── cli-handlers-diff.ts        # NEW: Snapshot tree diff + pixel-level screenshot diff (sharp)
│   ├── cli-handlers-session.ts     # NEW: Explicit local session save/load commands
│   ├── action-policy.ts            # NEW: Allow/deny/confirm policy
│   ├── session-state.ts            # NEW: Session persistence
│   ├── command-registry-editor-extra.ts # NEW: Split-out editor command definitions
│   ├── cli.ts                      # MODIFY: Parse --policy/--resume and document session behavior
│   ├── command-registry.ts         # MODIFY: Expose global policy/session metadata
│   ├── command-registry-editor.ts  # MODIFY: Core editor command definitions
│   └── cli-runner/
│       ├── runner.ts               # MODIFY: Policy checks + one-shot session resume/autosave
│       └── session.ts              # MODIFY: Session parsing, sticky defaults, and autosave
├── __tests__/
│   ├── editor-snapshot-cli.test.ts # NEW: CLI routing for snapshot query flags
│   ├── editor-console-cli.test.ts  # NEW: CLI routing for console/errors
│   ├── editor-session-cli.test.ts  # NEW: Explicit session save/load CLI coverage
│   ├── action-policy.test.ts       # NEW: Policy parsing and enforcement coverage
│   ├── session-state.test.ts       # NEW: Session persistence coverage
│   └── editor-diff-cli.test.ts     # NEW: Snapshot diff parsing and execution coverage
electron/claude/handlers/
│   ├── claude-snapshot-handler.ts  # NEW: Snapshot capture + ref-based actions
│   └── claude-console-handler.ts   # NEW: Console capture + ring buffer
electron/claude/__tests__/
│   ├── claude-snapshot-handler.test.ts # NEW: Snapshot handler + action validation
│   ├── claude-console-handler.test.ts # NEW: Buffer/filtering coverage
│   └── claude-http-server.test.ts     # MODIFY: Console + snapshot route coverage
electron/claude/http/
│   ├── claude-http-auth.ts          # NEW: Shared auth rules for sensitive local routes
│   ├── claude-http-snapshot-routes.ts # NEW: Snapshot read/write route registration
│   ├── claude-http-console-routes.ts # NEW: Console routes + SSE stream
│   └── claude-http-server.ts         # MODIFY: Register console + snapshot endpoints
electron/utility/
│   ├── utility-http-server.ts      # MODIFY: Expose console + snapshot read/write endpoints in the live server
│   └── utility-bridge.ts           # MODIFY: Bridge console + snapshot read/write requests to main process
electron/types/
│   └── claude-snapshot-api.ts      # NEW: Snapshot request/result schema
electron/
│   └── main.ts                     # MODIFY: Attach console capture on window creation
```

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Don't use agent-browser as npm dep | Rust binary + Chromium bundle is too heavy; QCut already has Electron |
| Borrow snapshot pattern, not code | agent-browser's snapshot.ts is tightly coupled to Playwright locators; QCut needs DOM-based approach |
| Use `webContents.executeJavaScript` | Simpler than CDP for accessibility tree; can fall back to CDP if needed |
| Skip iOS support | agent-browser's iOS features are irrelevant to a desktop video editor |
| Skip domain filtering | QCut controls its own renderer; no need for domain allowlists |
| Skip auth vault | QCut has its own key management in `~/.qcut/.env` |
