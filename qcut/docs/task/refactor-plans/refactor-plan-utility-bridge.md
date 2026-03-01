# Refactor Plan: utility-bridge.ts

**File**: `electron/utility/utility-bridge.ts`
**Current Lines**: 959
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Header & docs | 1-12 | Module documentation |
| Imports | 14-91 | Electron, path, handlers, types |
| Logger setup | 93-105 | electron-log fallback |
| Global state | 107-116 | utilityChild, stoppingUtility, sessionToWebContentsId, pendingPtySpawns |
| Session persistence | 118-138 | PtySessionMetadata interface, sessionRegistry |
| Health heartbeat | 140-200 | startHeartbeat, stopHeartbeat, forceRestartUtility |
| Message queue | 202-230 | sendToUtility, flushMessageQueue |
| Utility functions | 232-303 | writeToPtySessionOutput, configureNotificationBridgeWriter, getWindow, resolveQcutMcpServerEntry |
| **handleMainRequest** | **305-541** | **17 case branches (~237 lines)** |
| Session respawn | 543-623 | respawnSessions for crash recovery |
| **Lifecycle management** | **625-809** | **startUtilityProcess, stopUtilityProcess (~185 lines)** |
| **PTY IPC setup** | **811-944** | **setupUtilityPtyIPC - 5 ipcMain handlers (~134 lines)** |
| Cleanup | 946-959 | cleanupUtilityProcess |

---

## Proposed Split

```text
electron/utility/
├── utility-bridge.ts                   (~80 lines)  Barrel re-export + public API
├── utility-lifecycle.ts                (~220 lines) Process start/stop/cleanup
├── utility-heartbeat.ts                (~70 lines)  Health check & heartbeat
├── utility-session-manager.ts          (~280 lines) PTY sessions, respawn, IPC handlers
├── utility-messaging.ts               (~180 lines) Message queue, routing, data handlers
├── utility-main-request-handler.ts     (~210 lines) 17-case request dispatcher
└── utility-helpers.ts                  (~100 lines) Notification bridge, getWindow, MCP entry
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `utility-bridge.ts` (refactored) | 80 | Public API re-exports, global state |
| `utility-lifecycle.ts` | 220 | Logger, startUtilityProcess, stopUtilityProcess, cleanupUtilityProcess, child process event handlers |
| `utility-heartbeat.ts` | 70 | Constants, heartbeat timer state, startHeartbeat, stopHeartbeat, forceRestartUtility |
| `utility-session-manager.ts` | 280 | PtySessionMetadata, sessionRegistry, respawnSessions, setupUtilityPtyIPC (pty:spawn/write/resize/kill/kill-all) |
| `utility-messaging.ts` | 180 | QueuedMessage, messageQueue, sendToUtility, flushMessageQueue, writeToPtySessionOutput, message handlers (pty:data, pty:exit, spawn-result, kill-result) |
| `utility-main-request-handler.ts` | 210 | handleMainRequest with 17 case branches (events, notifications, timeline, transactions, projects, screen recording, UI, state) |
| `utility-helpers.ts` | 100 | configureNotificationBridgeWriter, getWindow, resolveQcutMcpServerEntry |
| **Total** | **~1,140** | Includes import/export overhead |

## Shared State

Global state variables shared across modules via `utility-bridge.ts`:

```typescript
export let utilityChild: Electron.UtilityProcess | null = null;
export let stoppingUtility = false;
export const sessionToWebContentsId = new Map<string, number>();
export const pendingPtySpawns = new Map<string, { resolve, reject, timeout }>();
```

## Migration Steps

1. Extract `utility-helpers.ts` (standalone utilities, no dependencies)
2. Extract `utility-heartbeat.ts` (standalone, uses global state)
3. Extract `utility-main-request-handler.ts` (depends on helpers, stores)
4. Extract `utility-messaging.ts` (depends on global state)
5. Extract `utility-session-manager.ts` (depends on messaging, global state)
6. Extract `utility-lifecycle.ts` (depends on heartbeat, messaging, sessions)
7. Refactor `utility-bridge.ts` as barrel with global state
8. Verify utility process IPC flow still works end-to-end
