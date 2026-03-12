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
| Accessibility Snapshots with Refs | Mostly complete | `editor:snapshot`, `editor:snapshot:click`, and `editor:snapshot:fill` are implemented on 2026-03-12; remaining work is mostly ref stability and deeper live-renderer coverage |
| Console Message & Error Capture | Mostly complete | HTTP + CLI list/clear/stream path implemented on 2026-03-12 |
| Action Policy Engine | Not started | Planned P1 |
| Session State Persistence | Not started | Planned P2 |
| Visual Diff Verification | Not started | Planned P2 |
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
- `electron/claude/handlers/claude-snapshot-handler.ts` — renderer-side DOM traversal, ref assignment, and ref-based click/fill actions via `executeJavaScript`
- `electron/claude/http/claude-http-snapshot-routes.ts` — `/api/claude/snapshot`, `/api/claude/snapshot/click`, and `/api/claude/snapshot/fill`
- `electron/claude/http/claude-http-server.ts` — registers snapshot routes in the direct main-process test server
- `electron/utility/utility-http-server.ts` — exposes snapshot read/write routes in the real utility-process HTTP server
- `electron/utility/utility-bridge.ts` — bridges snapshot read/write requests back to the main process
- `electron/native-pipeline/cli/cli-handlers-snapshot.ts` — CLI handlers for `editor:snapshot`, `editor:snapshot:click`, and `editor:snapshot:fill`
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
8. Added focused tests for handler validation, HTTP route behavior, and CLI query/action routing

**Remaining work**:
1. Decide whether refs need stronger stability guarantees across transient rerenders or forced re-snapshots
2. Add higher-level integration coverage against a live renderer DOM when needed
3. Extend action support beyond text fill if agents need select/checkbox-specific semantics

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
```

**Test files**:
- `electron/claude/__tests__/claude-snapshot-handler.test.ts`
- `electron/claude/__tests__/claude-http-server.test.ts`
- `electron/__tests__/editor-snapshot-cli.test.ts`

---

### Pattern 2: Action Policy Engine (MEDIUM VALUE)

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

**Files to create/modify**:
- `electron/native-pipeline/cli/action-policy.ts` — policy engine (~150 LOC)
- `electron/native-pipeline/cli/cli.ts` — integrate policy check before command dispatch

**Subtasks**:
1. Define default policy with categorized commands (~1h)
2. Add `--policy <path>` flag for custom policy files (~30min)
3. Integrate policy check in `runner.ts` before dispatch (~30min)
4. Add `--force` flag to bypass confirm prompts (~15min)
5. Write tests for policy matching (~30min)

**Test files**: `electron/native-pipeline/__tests__/action-policy.test.ts`

---

### Pattern 3: Session State Persistence (MEDIUM VALUE)

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

**Files to create/modify**:
- `electron/native-pipeline/cli/session-state.ts` — state save/load (~100 LOC)
- `electron/native-pipeline/cli/cli-runner/session.ts` — integrate with REPL

**Subtasks**:
1. Define session state schema and storage location (`~/.qcut/sessions/`) (~30min)
2. Implement save/load with JSON serialization (~1h)
3. Add `--resume <session-name>` flag to CLI (~30min)
4. Add `editor:session:save` and `editor:session:load` commands (~30min)
5. Write tests (~30min)

**Test files**: `electron/native-pipeline/__tests__/session-state.test.ts`

---

### Pattern 4: Visual Diff for Verification (LOW-MEDIUM VALUE)

**What it is**: agent-browser can diff two snapshots or screenshots to verify that an action had the expected effect.

**Why QCut needs it**: After AI agents make timeline edits, they need to verify the result. A diff between pre/post snapshots would catch unintended side effects.

**Implementation**:

```typescript
// electron/native-pipeline/cli/cli-handlers-diff.ts
export async function handleDiff(options: {
  before: string;  // snapshot file path
  after: string;   // snapshot file path
  mode: "snapshot" | "screenshot";
}): Promise<DiffResult> {
  // Compare accessibility trees or pixel-diff screenshots
}
```

**Files to create/modify**:
- `electron/native-pipeline/cli/cli-handlers-diff.ts` — diff engine (~200 LOC)
- `electron/native-pipeline/cli/command-registry-editor.ts` — register diff commands

**Subtasks**:
1. Implement snapshot tree diff (added/removed/changed elements) (~2h)
2. Implement screenshot pixel diff using canvas (~2h)
3. Add `editor:diff:snapshot` and `editor:diff:screenshot` commands (~30min)
4. Write tests with fixture snapshots (~1h)

**Test files**: `electron/native-pipeline/__tests__/diff.test.ts`

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
  timestamp: string;
}

const consoleBuffer: ConsoleEntry[] = [];
const MAX_BUFFER = 500;

export function attachConsoleCapture(window: BrowserWindow) {
  window.webContents.on("console-message", (_event, level, message, line, source) => {
    consoleBuffer.push({
      level: ["log", "warn", "error", "info", "debug"][level] as ConsoleEntry["level"],
      message,
      source,
      line,
      timestamp: new Date().toISOString(),
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

**Implemented files**:
- `electron/claude/handlers/claude-console-handler.ts` — in-memory console buffer, filters, renderer error capture helpers
- `electron/claude/http/claude-http-console-routes.ts` — `/api/claude/console`, `/api/claude/errors`, `/api/claude/console/stream`
- `electron/claude/http/claude-http-server.ts` — registers console routes in the direct main-process test server
- `electron/utility/utility-http-server.ts` — exposes console routes in the real utility-process HTTP server
- `electron/utility/utility-bridge.ts` — bridges `console:list` / `console:clear` back to the main process
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
5. Added renderer-failure capture via `render-process-gone` plus injected `window.error` / `unhandledrejection`
6. Added focused tests for buffer/filtering, HTTP routes, and CLI routing

**Remaining work**:
1. Decide whether debug/info console levels need normalization beyond Electron's `console-message` event
2. Add higher-level integration coverage against the utility-process path if needed

**Example usage by AI agent**:
```bash
# After making a timeline edit, check for errors
bun run pipeline editor:timeline:add-element --project-id my-proj --data '...' --json
bun run pipeline editor:console --level error --since 5s --json
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
| 2 | Action Policy Engine | MEDIUM | ~3h | **P1** |
| 3 | Session State Persistence | MEDIUM | ~3h | **P2** |
| 4 | Visual Diff Verification | LOW-MED | ~5.5h | **P2** |
| 6 | WebSocket Viewport Streaming | LOW | ~8h | **P3 (defer)** |

**Total estimated effort for P0**: ~12.5 hours (with both P0 tracks now mostly delivered)
**Total estimated effort for P0+P1**: ~15.5 hours

---

## Architecture Comparison

```
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

```
electron/native-pipeline/
├── cli/
│   ├── cli-handlers-snapshot.ts    # NEW: Accessibility snapshot with refs
│   ├── cli-handlers-console.ts     # NEW: Console message capture CLI
│   ├── cli-handlers-diff.ts        # NEW: Snapshot/screenshot diffing
│   ├── action-policy.ts            # NEW: Allow/deny/confirm policy
│   ├── session-state.ts            # NEW: Session persistence
│   ├── command-registry-editor.ts  # MODIFY: Add new commands
│   └── cli-runner/
│       ├── runner.ts               # MODIFY: Policy check integration
│       └── session.ts              # MODIFY: State persistence
├── __tests__/
│   ├── editor-snapshot-cli.test.ts # NEW: CLI routing for snapshot query flags
│   ├── editor-console-cli.test.ts  # NEW: CLI routing for console/errors
│   ├── action-policy.test.ts       # NEW
│   ├── session-state.test.ts       # NEW
│   └── diff.test.ts                # NEW
electron/claude/handlers/
│   ├── claude-snapshot-handler.ts  # NEW: Snapshot capture + ref-based actions
│   └── claude-console-handler.ts   # NEW: Console capture + ring buffer
electron/claude/__tests__/
│   ├── claude-snapshot-handler.test.ts # NEW: Snapshot handler + action validation
│   ├── claude-console-handler.test.ts # NEW: Buffer/filtering coverage
│   └── claude-http-server.test.ts     # MODIFY: Console + snapshot route coverage
electron/claude/http/
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
