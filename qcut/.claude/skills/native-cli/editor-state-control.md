# QCut Editor — State Control & Automation (HTTP-first)

Advanced editor state control via HTTP API. For basic state operations, prefer the CLI:

```bash
bun run pipeline editor:undo --json              # Undo last action
bun run pipeline editor:redo --json              # Redo last undone action
bun run pipeline editor:state:snapshot --json    # Full state snapshot
bun run pipeline editor:state:snapshot --include timeline,playhead --json  # Partial
```

The endpoints below have no CLI wrappers — use `curl` directly. Requires QCut running.

> **Note:** In curl examples below, `...` is shorthand for `http://127.0.0.1:8765/api/claude`.

---

## Event Streaming

```bash
curl .../events                              # Last 100 events
curl ".../events?category=timeline&limit=50" # Filtered
curl -N .../events/stream                    # SSE real-time
```

**Query params**: `limit` (max 1000), `category` (prefix match), `source` (exact match), `after` (event ID cursor)

**Event categories**: `timeline.*` (elementAdded/Removed/Updated), `media.*` (imported/deleted), `export.*` (started/progress/completed/failed), `project.*` (settingsChanged), `editor.*` (selectionChanged/playheadMoved)

---

## Notification Bridge (QCut → Claude Terminal)

One-way bridge: forwards user actions from QCut into an active Claude PTY session as `[QCut] HH:MM:SS - description` context lines.

```bash
curl .../notifications/status                                              # Check status
curl -X POST .../notifications/enable -d '{"sessionId":"pty-123abc"}'     # Enable
curl -X POST .../notifications/disable                                     # Disable
curl ".../notifications/history?limit=20"                                  # Recent history
```

---

## Correlation IDs & Command Lifecycle

Every API response includes `correlationId` (header + body) for tracking.

```bash
curl .../commands/<correlationId>       # Command status
curl .../commands/<correlationId>/wait  # Long-poll (29s timeout)
```

**States**: `pending` → `accepted` → `applying` → `applied` | `failed`

---

## Transactions (Undo Groups)

Group multiple operations into a single undo entry.

```bash
curl -X POST .../transaction/begin -d '{"label":"Add intro","timeoutMs":30000}'  # → transactionId
curl -X POST .../transaction/<id>/commit                                          # Commit
curl -X POST .../transaction/<id>/rollback                                        # Rollback
curl .../transaction/<id>                                                         # Status
```

**Rules**: One active transaction at a time (409 if nested). Auto-rollback after timeout (default 30s, max 5min). Undo/redo blocked during active transaction.

---

## Capability Negotiation

```bash
curl .../capabilities                              # Full manifest
curl .../capabilities/timeline.batch               # Check specific
curl .../commands/registry                         # All commands + schemas
```

**Capability categories**: `STATE`, `MEDIA`, `TIMELINE`, `PROJECT`, `ANALYSIS`, `EXPORT`, `EVENTS`, `TRANSACTIONS`

---

## Undo/Redo History (HTTP)

```bash
curl .../history    # { undoCount, redoCount, entries[] }
```
