# QAgent: Port Upstream P0 Fixes

**Source**: Composio agent-orchestrator PRs [#244](https://github.com/ComposioHQ/agent-orchestrator/pull/244) (ps cache) and [#242](https://github.com/ComposioHQ/agent-orchestrator/pull/242) (atomic writes)

**Status**: Implemented

---

## Fix 1: PS Process List Cache (upstream #244)

### Problem

`findClaudeProcess()` in `packages/plugins/agent-claude-code/src/process.ts:39-45` calls `ps -eo pid,tty,args` with a 30s timeout on every invocation. Two call sites trigger this:

1. **lifecycle-manager.ts:177** — `agent.isProcessRunning(handle)` called per-session during polling
2. **session-manager-maintenance.ts:306** — `plugins.agent.isProcessRunning(handle)` in send-or-restart

With 10 tmux sessions polling in parallel, this spawns 10 concurrent `ps` processes. On machines with many processes, this causes 51s+ delays and timeout failures.

### Fix

Add a short-lived cache (5s TTL) so concurrent `isProcessRunning` calls share a single `ps` result.

### Files to Change

| File | Change |
|------|--------|
| `packages/plugins/agent-claude-code/src/process.ts` | Add `getCachedPsList()` with 5s TTL cache; replace raw `execFileAsync("ps", ...)` call with cached version; reduce timeout from 30s to 5s |

### Implementation

```typescript
// At module level in process.ts
let psCache: { promise: Promise<string>; expiry: number } | null = null;

function getCachedPsList(): Promise<string> {
  const now = Date.now();
  if (psCache && now < psCache.expiry) return psCache.promise;
  const promise = execFileAsync("ps", ["-eo", "pid,tty,args"], { timeout: 5_000 })
    .then((r) => r.stdout);
  psCache = { promise, expiry: now + 5_000 };
  return promise;
}
```

Then replace the `execFileAsync("ps", ...)` call at line 39-45 with:

```typescript
const psOut = await getCachedPsList();
```

### Testing

- Existing tests in `agent-claude-code/src/index.test.ts` (lines 248+) mock `execFileAsync` — verify they still pass
- Manually verify with 5+ tmux sessions that polling doesn't spawn redundant `ps` calls

---

## Fix 2: Atomic Metadata Writes (upstream #242)

### Problem

`packages/core/src/metadata.ts` has two write paths that are non-atomic:

1. **writeMetadata() (line 162)** — `writeFileSync(path, ...)` directly to target path. A crash mid-write corrupts the file.
2. **updateMetadata() (lines 169-193)** — read-merge-write with no lock. Two concurrent calls race: both read the old state, merge independently, and the second write overwrites the first's merged result.

Additionally, **deleteMetadata() (line 213)** archives via `writeFileSync` before `unlinkSync` — the archive write should also be atomic.

### Fix

Write-then-rename pattern for all write operations.

### Files to Change

| File | Change |
|------|--------|
| `packages/core/src/metadata.ts` | Add `atomicWriteFileSync()` helper; use it in `writeMetadata()`, `updateMetadata()`, and `deleteMetadata()` archive write |

### Implementation

```typescript
import { renameSync } from "node:fs";  // add to existing imports

/**
 * Write file atomically via tmp + rename.
 * POSIX rename is atomic on the same filesystem.
 */
function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}
```

Replace in three locations:

1. **writeMetadata (line 162)**:
   ```typescript
   // Before
   writeFileSync(path, serializeMetadata(data), "utf-8");
   // After
   atomicWriteFileSync(path, serializeMetadata(data));
   ```

2. **updateMetadata (line 193)**:
   ```typescript
   // Before
   writeFileSync(path, serializeMetadata(existing), "utf-8");
   // After
   atomicWriteFileSync(path, serializeMetadata(existing));
   ```

3. **deleteMetadata archive (line 213)**:
   ```typescript
   // Before
   writeFileSync(archivePath, readFileSync(path, "utf-8"));
   // After
   atomicWriteFileSync(archivePath, readFileSync(path, "utf-8"));
   ```

### Note on updateMetadata Race

The read-merge-write race in `updateMetadata()` remains (two concurrent calls can still lose data). A full fix would require file locking (e.g., `proper-lockfile` or `O_EXLOCK`). However, the atomic write fix prevents corruption (partial writes) which is the higher-severity issue. The merge race is low-probability given metadata updates are infrequent and typically serialized by the lifecycle polling loop.

### Testing

- Existing tests for metadata in `packages/core/src/__tests__/` should still pass (they test logical correctness, not atomicity)
- Add a unit test that verifies `atomicWriteFileSync` doesn't leave `.tmp.*` files on success
- Verify `.tmp.*` cleanup: if `renameSync` fails, the tmp file is leaked — acceptable for this use case (metadata dir, not user-visible)

---

## Execution Order

1. **Fix 1 (ps cache)** first — simpler change, single file, immediate perf win
2. **Fix 2 (atomic writes)** second — broader change, multiple call sites

## Verification

```bash
cd packages/qagent
bun run typecheck
bun run test
```
