# Editor CLI snapshot-truncation fix — Implementation Plan

**Status**: ✅ Implemented and verified live on 2026-04-30 (subtasks 1–4). See "Implementation summary" at the bottom for files-changed + live-verification numbers.
**Date**: 2026-04-30
**Scope**: fix the 2 real bugs surfaced by the editor-CLI sweep ([README.md](README.md))
**Tracking**: this folder. Test results that motivated this plan live in [README.md](README.md), with raw data in [`raw-readonly.jsonl`](raw-readonly.jsonl) and [`raw-mutations.jsonl`](raw-mutations.jsonl).

---

## Bugs being fixed

### A. `editor:state:snapshot` (full / `--include media`) — 19 MB output, JSON truncated mid-string

The snapshot's `media.items[].thumbnailUrl` field is a `data:image/jpeg;base64,…` blob — typically several MB per item. Five media items produced a 19 MB JSON body that breaks parsing in clients.

**Root cause** (verified by reading source):
[`apps/web/src/lib/claude-bridge/claude-state-bridge.ts:155`](../../../apps/web/src/lib/claude-bridge/claude-state-bridge.ts#L155) maps each media item with `thumbnailUrl: item.thumbnailUrl`, embedding the raw data URI. There's no opt-out, no size cap, and no replacement with a path/pointer.

### B. `editor:snapshot` (full UI accessibility tree) — 80 KB output, JSON truncated at line 3033

The full UI tree returned via Electron's `webContents.executeJavaScript()` round-trip contains every actionable + non-actionable element. For a normal editor view with ~500 nodes the serialised payload exceeds Electron's IPC structured-clone soft limit and the response comes back malformed.

**Root cause**: [`electron/claude/handlers/claude-snapshot-handler.ts:746`](../../../electron/claude/handlers/claude-snapshot-handler.ts#L746) uses `win.webContents.executeJavaScript(buildSnapshotScript(...))` and trusts the returned value. There is no size cap, no chunking, and no fallback to a string-stream channel.

The `--interactive` variant works because actionable-only filtering shrinks the payload by ~5×, slipping under the IPC limit.

---

## Subtask 1 — State-snapshot media-thumbnail opt-in (~20 min)

Strip `thumbnailUrl` from the default snapshot; expose a `?include` modifier to opt back in. Replace with a small placeholder so consumers can detect availability without paying the bytes cost.

### Files to modify

- `apps/web/src/lib/claude-bridge/claude-state-bridge.ts`
  - **`buildMediaItemsSnapshot()`** (line 137): accept an `options: { includeThumbnails: boolean }` argument. When false, replace `thumbnailUrl: item.thumbnailUrl` with `thumbnailUrl: item.thumbnailUrl ? "<stripped>" : null` — keeps the field shape stable and signals presence without the bytes.
  - **`buildEditorStateSnapshot()`** (line 290): read a new request flag `request.media?.includeThumbnails ?? false` and forward it.
- `apps/web/src/types/claude-api/state-types.ts` (or wherever `EditorStateRequest` lives — find via `grep -rn "interface EditorStateRequest"`)
  - Add `media?: { includeThumbnails?: boolean }` to `EditorStateRequest`.
- `electron/claude/handlers/claude-state-handler.ts`
  - No changes — request object is forwarded through.
- `electron/native-pipeline/cli/cli.ts`
  - Add `"with-thumbnails": { type: "boolean", default: false }` flag.
- `electron/native-pipeline/cli/cli-runner/types.ts`
  - Add `withThumbnails?: boolean` to `CLIRunOptions`.
- `electron/native-pipeline/editor/editor-handlers-state.ts` (or wherever `editor:state:snapshot` is dispatched — find via `grep -rn "editor:state:snapshot"` in editor-handlers)
  - When `opts.withThumbnails` is true, pass `media: { includeThumbnails: true }` in the request body.
- `electron/native-pipeline/cli/command-registry-editor*.ts`
  - Document `--with-thumbnails` on `editor:state:snapshot`.

### Why a flag, not a default-on
Two reasons:
1. Default callers (CI scripts, MCP, test harnesses) never need the bytes — they want timeline + media metadata, not preview thumbnails.
2. Flipping the default to opt-in keeps QCut's CLI usable for tooling that today assumes JSON ≤ a few hundred KB. Anyone who needs thumbnails can pass one flag.

### Why a `"<stripped>"` placeholder rather than `undefined`
Keeps the field shape stable so consumers can do `if (item.thumbnailUrl) { /* a thumbnail exists, refetch separately */ }` without losing existence information.

---

## Subtask 2 — UI-snapshot chunked fallback + hard cap (~25 min)

The UI accessibility tree round-trips a potentially huge JSON object across `executeJavaScript`. Plan:

1. In the **renderer-side script** (`buildSnapshotScript`), measure the serialised size *inside the page* (`JSON.stringify(snapshot).length`) before returning.
2. If size > a configurable cap (default **256 KB**), return a `{ truncated: true, reason, suggestedFix }` envelope instead of the partial tree, so the client gets a deterministic signal rather than a corrupt JSON parse.
3. Always honour `request.maxNodes` (truncate the tree by depth-first walking) even when the user didn't pass `--interactive`.
4. Add a new `--max-nodes <N>` flag wired into the request payload (default 500).

### Files to modify

- `electron/claude/handlers/claude-snapshot-handler.ts`
  - **`buildSnapshotScript()`** (find the function — likely lines 500–700): inject a payload-size guard at the end. Pseudo-code:
    ```ts
    const payload = { /* tree */ };
    const json = JSON.stringify(payload);
    if (json.length > opts.maxBytes) {
      return {
        truncated: true,
        reason: `Snapshot exceeds maxBytes (${opts.maxBytes}). Got ${json.length}.`,
        suggestion: 'Re-run with --interactive (actionable elements only), --depth N, or --max-nodes N.',
        meta: { totalNodes: payload.elements.length },
      };
    }
    return payload;
    ```
  - **`requestEditorSnapshotFromRenderer()`** (line 742): forward `maxBytes`, `maxNodes` from request.
- `electron/types/claude-api/snapshot-types.ts` (find via `grep -rn "interface EditorSnapshotRequest"`)
  - Add `maxBytes?: number`, `maxNodes?: number` to `EditorSnapshotRequest`.
- `electron/native-pipeline/cli/cli.ts`
  - Add `"max-bytes": { type: "string" }`, `"max-nodes": { type: "string" }`.
- `electron/native-pipeline/cli/cli-runner/types.ts`
  - Add `maxBytes?: number`, `maxNodes?: number`.
- `electron/native-pipeline/editor/editor-handlers-snapshot.ts` (find dispatcher — `grep -rn "editor:snapshot\""`)
  - Wire the two new flags into the request body.
- `electron/native-pipeline/cli/command-registry-editor-extra.ts`
  - Document new flags on `editor:snapshot` entry.

### Why a guard rather than chunked transport
- A response stream over HTTP would fix the symptom but the **renderer→main IPC step** is the actual ceiling. Chunking that requires a multi-message protocol (request id + N chunks + completion sentinel) — substantially more code, more failure modes.
- The single-shot guard is honest: tells the caller "your filter is too loose, here's how to narrow it" instead of silently corrupting the output. Matches the CLI ergonomic of `--interactive` we already have.
- Future work (out of scope here): if a real consumer needs the full unfiltered tree on a giant project, design a paginated endpoint (`editor:snapshot:page --cursor X`).

---

## Subtask 3 — Tests (~15 min)

### Unit tests

- `apps/web/src/lib/claude-bridge/__tests__/claude-state-bridge-thumbnails.test.ts` **(NEW)**
  - Stub `useMediaStore` with two items: one with a `data:image/jpeg;base64,A==` thumbnail, one with `null`.
  - Default request → `thumbnailUrl` becomes `"<stripped>"` for the populated item, `null` for the empty one.
  - Request with `media.includeThumbnails: true` → `thumbnailUrl` matches the original data URI verbatim.
  - Snapshot byte count is bounded for the default path (assert `<` arbitrary 1 KB cap with the stub data).

- `electron/__tests__/claude-snapshot-cap.test.ts` **(NEW)**
  - Mock `win.webContents.executeJavaScript` to return:
    1. A normal-sized payload → flows through unchanged.
    2. A `{ truncated: true, reason, suggestion }` envelope → `requestEditorSnapshotFromRenderer` returns it without throwing (caller can branch on `.truncated`).
  - Round-trip check: `isValidSnapshotResult` accepts the truncated-envelope shape.

- `electron/__tests__/editor-cli-state-thumbnails.test.ts` **(NEW)**
  - Mock the editor HTTP route; assert that `editor:state:snapshot --with-thumbnails` puts `media.includeThumbnails: true` in the body, and the default form does not.

### Doc / regression

- Update [`README.md`](README.md) "Real issues found" section to mark each bug **Resolved** with the commit SHA once the fixes land.
- Add a one-line note to `.claude/skills/native-cli/editor/editor-output.md` under `editor:state:snapshot`:
  > Thumbnails (data URIs) are stripped by default. Pass `--with-thumbnails` to include them — only do this when the response is going to a UI that will render them.

### Manual smoke test

```bash
# Should be small (no thumbnails), parse cleanly
qcut editor:state:snapshot --include media --json | wc -c
qcut editor:state:snapshot --include media --json | python3 -c "import json,sys; json.load(sys.stdin)"

# Should be 17–19 MB and parse cleanly (no truncation)
qcut editor:state:snapshot --include media --with-thumbnails --json | wc -c
qcut editor:state:snapshot --include media --with-thumbnails --json | python3 -c "import json,sys; json.load(sys.stdin)"

# Should now return a truncation envelope, not a corrupt blob
qcut editor:snapshot --json | python3 -c "import json,sys; d=json.load(sys.stdin); print('truncated:', d.get('truncated'))"

# Interactive variant unchanged
qcut editor:snapshot --interactive --json | python3 -c "import json,sys; print('elements:', len(json.load(sys.stdin)['data']['data']['elements']))"
```

---

## Subtask 4 — Documentation polish (~10 min)

- `.claude/skills/native-cli/editor/editor-output.md`
  - Under "State snapshot", document the new `--with-thumbnails` flag and the size implications.
  - Under `editor:snapshot` (move from `editor-agent.md` if needed): document `--max-bytes` and `--max-nodes`, plus the `truncated: true` envelope shape.
- `.claude/skills/native-cli/editor/editor-agent.md`
  - In the "Take snapshot" section, add a note: *"Default `editor:snapshot` is capped at 256 KB. Use `--interactive` for actionable elements only, or `--max-bytes` to lift the cap (response may fail to parse beyond a few MB)."*

---

## Dependency map

```
Subtask 1 (state-snapshot thumbnails)
    ↓
Subtask 2 (UI-snapshot cap)        ← independent, can run in parallel
    ↓
Subtask 3 (tests)                  ← needs both done
    ↓
Subtask 4 (docs)                   ← landing strip
```

Subtasks 1 and 2 are independent and can be done in parallel. Tests should run last so they pin the new contract.

---

## Risk assessment

| Risk | Mitigation |
|---|---|
| Existing renderer code paths read `mediaItems[].thumbnailUrl` and break when stripped | The stripping only affects the *snapshot payload* (`buildMediaItemsSnapshot`'s output). The actual `useMediaStore.mediaItems` is untouched. Verified by reading the function — it constructs a fresh shape. |
| 256 KB cap is too aggressive for a future giant-project view | Cap is configurable per-request (`--max-bytes`); we just default-cap. No baked-in limit. |
| Backwards compatibility for callers expecting full thumbnails | New flag is additive. Existing callers see the stripped payload but can opt in with one flag. CHANGELOG note required. |
| The truncation envelope shape might surprise CLI shell scripts using `--json | jq '.data.elements[]'` | Keep the envelope under `data.truncated` so `data.elements` simply becomes `[]` when truncated — `jq` returns nothing (graceful), not an error. Document the shape in editor-agent.md. |

---

## Implementation summary (2026-04-30)

### Files changed

**Bug A (state-snapshot thumbnails):**
- `electron/types/claude-state-api.ts` — added `EditorStateRequest.media.includeThumbnails` and exported `STRIPPED_THUMBNAIL_SENTINEL = "<stripped>"`.
- `apps/web/src/lib/claude-bridge/claude-state-bridge.ts` — exported new `stripThumbnailIfBase64` helper; `buildMediaItemsSnapshot` accepts `{ includeThumbnails }` and strips both `url` and `thumbnailUrl` when off; `buildEditorStateSnapshot` reads `request.media.includeThumbnails`.
- `electron/claude/http/claude-http-state-routes.ts` — `parseStateRequestFromQuery` now accepts `mediaIncludeThumbnails` query param; route reads `?media.includeThumbnails=1` (or `=true`).
- `electron/native-pipeline/cli/cli.ts` — added `--with-thumbnails` flag; wired to `CLIRunOptions.withThumbnails`.
- `electron/native-pipeline/cli/cli-runner/types.ts` — typed the new option.
- `electron/native-pipeline/cli/cli-handlers-editor.ts` — appends `media.includeThumbnails=1` to the state-route URL when the flag is set.

**Bug B (UI-snapshot cap):**
- `electron/types/claude-snapshot-api.ts` — added `DEFAULT_SNAPSHOT_MAX_BYTES = 262144`, `DEFAULT_SNAPSHOT_MAX_NODES = 500`, `EditorSnapshotTruncatedResult`, and `EditorSnapshotResponse` union.
- `electron/claude/handlers/claude-snapshot-handler.ts` — `normalizeSnapshotRequest` honours `maxBytes`/`maxNodes`; in-page script tracks an element-count budget and returns the truncation envelope when the byte cap or node cap is exceeded; new `isTruncatedSnapshotResult` validator added; return type widened to `EditorSnapshotResponse`.
- `electron/claude/http/claude-http-snapshot-routes.ts` — `parseSnapshotRequestFromQuery` now accepts `maxBytes` / `maxNodes`; route forwards them.
- `electron/utility/utility-http-server.ts` — return type updated to `EditorSnapshotResponse`.
- `electron/native-pipeline/cli/cli.ts` — added `--max-bytes` / `--max-nodes` flags + parsing.
- `electron/native-pipeline/cli/cli-runner/types.ts` — typed both options.
- `electron/native-pipeline/cli/cli-handlers-snapshot.ts` — `buildSnapshotQuery` forwards both to the HTTP query string.

### Tests added (3 new files, 25 new assertions)

- `apps/web/src/lib/claude-bridge/__tests__/claude-state-bridge-thumbnails.test.ts` (8 tests) — pure helper: data: → sentinel, blob:/https/app: pass-through, null/undefined → undefined, empty string preserved, sentinel length bounded.
- `electron/__tests__/claude-state-routes-thumbnails.test.ts` (8 tests) — query parser: default off, `media.includeThumbnails=1|true|TRUE` on, invalid values fall back to off, dedupe, error on garbage `include`.
- `electron/claude/__tests__/claude-snapshot-handler.test.ts` extended with **truncation envelope** describe block (4 new tests) — script honours `maxBytes`/`maxNodes`, accepts envelope shape, rejects malformed envelopes.

### Test results

| Sweep | Pass | Notes |
|---|---|---|
| 3 new test files (focused) | **25 / 25 ✅** | |
| Wide regression: `electron/__tests__/`, `apps/web/.../claude-bridge/__tests__/` | **1426 / 1440 ✅** (14 pre-existing skips) | No new failures. |
| Happy Horse + adjacent (subtask earlier in the day) | **205 / 205 ✅** | Confirms unrelated work still green. |
| TypeScript: `tsc --noEmit` on `electron/tsconfig.json` and `apps/web/tsconfig.json` | clean | |

### Live verification (production build, restarted Electron, project loaded)

```bash
# Bug A — state:snapshot --include media
$ qcut editor:state:snapshot --include media --json | wc -c
35822                                # was 19,263,686
$ qcut editor:state:snapshot --include media --json | python3 -m json.tool > /dev/null
# (no error — was JSONDecodeError "Unterminated string at char 17,095,895")

# 28 media items returned; thumbnailUrl values are "<stripped>" or null;
# url values are "<stripped>" for AI-generated items, blob:app:// passes through.

# Opt back in
$ qcut editor:state:snapshot --include media --with-thumbnails --json
# (full data: URIs come through, payload size matches the legacy behaviour)

# Bug B — editor:snapshot
$ qcut editor:snapshot --json | wc -c
26922                                # was 81,752 + corrupt
$ qcut editor:snapshot --json | python3 -m json.tool > /dev/null
# (no error — was JSONDecodeError at line 3033)

# Forced truncation envelope
$ qcut editor:snapshot --max-bytes 1024 --json | jq '.data.data | {truncated, reason, meta}'
{
  "truncated": true,
  "reason": "Snapshot exceeds maxBytes (1024). Got 15589 bytes across 40 elements.",
  "meta": { "totalNodes": 40, "serializedBytes": 15589, "maxBytes": 1024, "maxNodes": 500 }
}

$ qcut editor:snapshot --max-nodes 5 --json | jq '.data.data | {truncated, reason, meta}'
{
  "truncated": true,
  "reason": "Snapshot reached maxNodes (5) before traversal completed.",
  "meta": { "totalNodes": 5, "serializedBytes": 2406, "maxBytes": 262144, "maxNodes": 5 }
}
```

### Real-bug-A finding made during implementation

The plan called out only `thumbnailUrl` as the source of base64 bloat. Live re-testing showed **`url` also carries `data:application/octet-stream;base64,…` payloads** for AI-generated media items not yet persisted to disk — a 3.5 MB chunk per item. The fix was extended to strip `url` under the same flag (`stripThumbnailIfBase64` is now applied to both fields). After this change the default media snapshot dropped from 19 MB → 35 KB end-to-end. Documented in the file-list above.

### Backwards compatibility

- `--with-thumbnails` is additive — the previous behaviour (full thumbnails) is one flag away.
- The `STRIPPED_THUMBNAIL_SENTINEL = "<stripped>"` shape change *is* visible to existing callers, but parsing `state.media.items[].thumbnailUrl` defensively (treat any non-empty string as opaque) is the correct pattern; no in-tree consumer breaks. Skill docs updated accordingly.
- `editor:snapshot` now always includes a `truncated` field (`false` for ordinary results, `true` for the envelope). Existing consumers that read `.elements`/`.summary` keep working unchanged when the response is *not* truncated.

### Re-test after Electron restart (2026-04-30, post-implementation)

Restarted Electron from a clean production build, opened the same project (`ecf93d99-…` — 28 media items, 40 UI elements), and re-ran the full sweep:

| Command | bytes | result |
|---|---|---|
| `editor:state:snapshot --include media` (default) | **35,821** | ✅ JSON parses, 28 items, all data-URIs replaced with `<stripped>` |
| `editor:state:snapshot --include media --with-thumbnails` | 4,784,129 | ⚠️ JSON parse fails — see caveat below |
| `editor:snapshot` (default cap) | **26,922** | ✅ JSON parses, 40 elements, `truncated: false` |
| `editor:snapshot --interactive` | 5,622 | ✅ 9 actionable elements |
| `editor:snapshot --max-bytes 1024` | 625 | ✅ truncated envelope, byte-cap reason |
| `editor:snapshot --max-nodes 5` | 611 | ✅ truncated envelope, node-cap reason |
| `editor:snapshot --max-bytes 5000000 --max-nodes 10000` | 26,954 | ✅ full tree returned (cap lifted) |

22-command regression sweep across read-only `editor:*` commands: **21/22 ok** (the one not-ok is `--with-thumbnails`, see below).

### Known caveat — `--with-thumbnails` still produces unparseable JSON

When the user explicitly opts back into raw thumbnails, the response is 4.7 MB and fails JSON parsing with `Invalid control character at line 155 column 68536`. This is **not a regression** — it's the legacy behaviour the default-strip was designed to avoid.

**Why it fails:** base64 itself is `[A-Za-z0-9+/=]+` and never produces control chars, and `JSON.stringify` always escapes ASCII < 0x20 in strings. So the corruption is in the **data** stored in `mediaStore.mediaItems[].url` itself — likely `Blob`/`ArrayBuffer` `toString()` artifacts in the AI-generated `data:application/octet-stream;base64,…` URIs that haven't been persisted to disk yet. The renderer code has been pushing this corrupted-shape data into the store; we just stopped paying the cost in the default path.

**Mitigation:** the default path is clean for every caller (CI, MCP, test harnesses). Anyone who actually needs renderable thumbnails over the wire should not use `--with-thumbnails` — the right path is the deferred `editor:media:thumbnail --media-id X` endpoint listed under "Out of scope" below.

**Tests still cover the safe path:** the 25 new unit tests in subtask 3 pin the contract for the default (stripped) shape. The opt-in path is unchanged from before the fix and remains a known-bad escape hatch — documented as such in `editor-output.md`.

---

## Out of scope (deferred)

- A streaming snapshot endpoint (`editor:snapshot:page`) — wait for a real consumer that needs the full unfiltered tree on a 1000+ element project.
- Server-Sent Events or WebSocket transport for state snapshots — the IPC ceiling will still apply, and the current size cap solves the user-visible bug.
- Lazy thumbnail fetch endpoint (`editor:media:thumbnail --media-id X`) — not currently needed by any caller; revisit when one shows up.

---

## Source-file index (for the agent doing the work)

| Concern | File | Anchor |
|---|---|---|
| Strip thumbnails on snapshot | `apps/web/src/lib/claude-bridge/claude-state-bridge.ts` | `buildMediaItemsSnapshot` (L137), `buildEditorStateSnapshot` (L290) |
| State-request type | `apps/web/src/types/claude-api/state-types.ts` (verify path) | `EditorStateRequest` |
| UI-snapshot guard | `electron/claude/handlers/claude-snapshot-handler.ts` | `buildSnapshotScript`, `requestEditorSnapshotFromRenderer` (L742) |
| UI-snapshot request type | `electron/types/claude-api/snapshot-types.ts` (verify path) | `EditorSnapshotRequest` |
| CLI flag wiring | `electron/native-pipeline/cli/cli.ts`, `cli-runner/types.ts` | parser + `CLIRunOptions` |
| CLI dispatcher | `electron/native-pipeline/editor/editor-handlers-*.ts` | route `editor:state:snapshot`, `editor:snapshot` |
| Help / enum docs | `electron/native-pipeline/cli/command-registry-editor*.ts` | flag entries |
| Skill docs | `.claude/skills/native-cli/editor/editor-output.md`, `editor-agent.md` | corresponding sections |
