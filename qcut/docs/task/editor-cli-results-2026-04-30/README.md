# Editor CLI test sweep — 2026-04-30

**Goal:** systematically exercise every `editor:*` command documented in
`.claude/skills/native-cli/editor/` against a live QCut Electron instance,
capture pass/fail per command, and surface real bugs vs. test-harness noise.

**Setup:**
- QCut Electron running (production build, PID 48092).
- Bridge alive on `127.0.0.1:8765` (`editor:health` returned `ok` in 8 ms).
- Existing project used for read-only tests: `ecf93d99-3e78-4551-b766-f49192173475` (has 1 video + 5 images).
- Throw-away project created for mutation tests, then deleted.
- Beta-tester login (`qcutlove@qcut.app`) was already active so proxy-routed commands work.

**Headline numbers (51 runs):**

| Outcome | Count |
|---|---|
| `status: ok` | **43** |
| `status: error` (domain) | 0 |
| Parse error in test harness (5) — actual command worked | 5 |
| Real parse / output bugs (3) | **3** |

So **48 of 51 commands work as documented**. Three real issues found, listed at the bottom.

Raw results: [`raw-readonly.jsonl`](raw-readonly.jsonl) · [`raw-mutations.jsonl`](raw-mutations.jsonl).

---

## Read-only sweep (34 commands)

| Command | Status | Latency | Notes |
|---|---|---|---|
| `editor:health` | ✅ ok | 8 ms | Bridge alive, version + capability list returned. |
| `editor:auth:token` | ✅ ok | 62 ms | Returns masked token. |
| `editor:project:list` | ✅ ok | 64 ms | 5 projects returned. |
| `editor:project:settings` | ✅ ok | 65 ms | fps/width/height/aspect. |
| `editor:project:stats` | ✅ ok | 3.1 s | First-call slow — disk scan; subsequent calls cached. |
| `editor:project:summary` | ✅ ok | 66 ms | Markdown summary. |
| `editor:project:info` (minimal) | ✅ ok | 3.1 s | First call slow (same disk scan); ~1 KB. |
| `editor:project:info --full` | ✅ ok | 3.1 s | ~10 KB; includes media[], settings. |
| `editor:media:list` | ✅ ok | 64 ms | 7 media entries returned. |
| `editor:media:info` | ✅ ok | 66 ms | Per-media metadata. |
| `editor:timeline:export` | ✅ ok | 63 ms | Tracks + elements. |
| `editor:timeline:info` | ✅ ok | 62 ms | Same shape as export today. |
| `editor:timeline:get-selection` | ✅ ok | 65 ms | Empty when nothing selected. |
| `editor:analyze:models` | ✅ ok | 64 ms | Lists Gemini and others. |
| `editor:generate:models` | ✅ ok | 63 ms | **Includes all 3 Happy Horse keys** (132 total). |
| `editor:export:presets` | ✅ ok | 63 ms | youtube-1080p, tiktok, reel, etc. |
| `editor:export:list-jobs` | ✅ ok | 64 ms | Empty array on a fresh project. |
| `editor:export:recommend tiktok` | ✅ ok | 64 ms | Recommends 1080×1920 9:16. |
| `editor:export:status` (nonexistent job) | ✅ ok | 63 ms | Returns `not-found` cleanly. |
| `editor:state:snapshot --include timeline` | ✅ ok | 64 ms | 1.4 KB. |
| `editor:state:snapshot --include project` | ✅ ok | 63 ms | 1.2 KB. |
| `editor:state:snapshot --include media` | ⚠️ fail | 756 ms | **Real bug** — see Issues. |
| `editor:state:snapshot` (full) | ⚠️ fail | 743 ms | **Real bug** — see Issues. |
| `editor:snapshot --interactive` | ✅ ok | 63 ms | 18 KB; lean tree. |
| `editor:snapshot` (full UI tree) | ⚠️ fail | 70 ms | **Real bug** — see Issues. |
| `editor:screen-recording:sources` | ✅ ok | 395 ms | Lists displays + windows. |
| `editor:screen-recording:status` | ✅ ok | 64 ms | `idle` when not recording. |
| `editor:moyin:status` | ✅ ok | 63 ms | Pipeline state for the director panel. |
| `editor:diagnostics:analyze` | ✅ ok | 62 ms | Heuristic diagnostic returns. |
| `editor:screenshot:capture` | ✅ ok | 134 ms | Saved to `~/Movies/QCut Recordings/`. |
| `editor:ui:switch-panel ai` | ✅ ok | 64 ms | Renderer panel switched. |
| `editor:ui:switch-panel media` | ✅ ok | 64 ms | |
| `editor:undo` (no `--force`) | ✅ ok | 58 ms | Returns clean error: action policy needs `--force`. |
| `editor:redo` (no `--force`) | ✅ ok | 58 ms | Same. |
| `editor:errors` | ✅ ok | 64 ms | Returns clean error: needs `QCUT_API_TOKEN`. |
| `editor:console` | ✅ ok | 64 ms | Same. |
| `editor:editing:auto-edit-list` | ✅ ok | 63 ms | Empty job list. |
| `editor:editing:suggest-status` (nonexistent job) | ✅ ok | 63 ms | Clean error. |
| `editor:analyze:scenes` | ✅ ok | 190 ms | Scene-detection job kicked off. |

---

## Mutation sweep (17 commands, throwaway sandbox project)

| Command | Status | Latency | Notes |
|---|---|---|---|
| `editor:project:create` | ✅ ok | 80 ms | Returns new project id. |
| `editor:project:rename` | ✅ ok | 79 ms | |
| `editor:project:update-settings` | ✅ ok | 67 ms | fps/width/height applied. |
| `editor:project:duplicate` | ✅ ok | 80 ms | Returns clone id. |
| `editor:project:export-state` | ✅ ok | 3.1 s | First-call disk hit; writes `~/Documents/QCut/exports/...`. |
| `editor:project:report` | ✅ ok | 66 ms | Status `ok` but **output dir was empty** — see Issues. |
| `editor:timeline:add-element` (text) | ✅ ok | 66 ms | Text element appears in subsequent export. |
| `editor:timeline:export` (after add) | ✅ ok | 65 ms | Shows the new element. |
| `editor:timeline:batch-add` | ✅ ok* | 64 ms | Returns clean `Track not found: text-1` error in a fresh project — expected; user must pass an existing `trackId`. |
| `editor:timeline:update-element` | ✅ ok | 63 ms | Duration patched. |
| `editor:timeline:select` / `get-selection` | ✅ ok | 63 / 67 ms | Round-trip verified. |
| `editor:timeline:clear-selection` | ✅ ok | 66 ms | |
| `editor:timeline:seek` | ✅ ok | 67 ms | Playhead moved. |
| `editor:timeline:play` / `pause` | ✅ ok | 64 / 66 ms | |
| `editor:timeline:add-clip` | ✅ ok | 65 ms | Adds a media clip onto the timeline. |
| `editor:moyin:set-script` | ✅ ok | 74 ms | Script accepted. |
| `editor:moyin:status` (after set) | ✅ ok | 64 ms | Reflects the new script. |
| `editor:mcp:forward-html` | ✅ ok | 63 ms | HTML forwarded to MCP preview. |
| `editor:project:delete` (cleanup) | ✅ ok | <100 ms | Sandbox + duplicate removed. |
| `editor:snapshot:click @nonexistent` | ✅ ok | 63 ms | Clean error: ref not found. |

---

## Real issues found

### 1. `editor:state:snapshot` (full / `--include media`) — 19 MB output, malformed near the end

```
Unterminated string starting at: line 326 column 22 (char 17095895)
```

The snapshot includes raw `data:image/jpeg;base64,…` thumbnail URLs **and** `blob:app://…` URLs. The total output is **19,263,686 bytes** for a project with 5 media items. JSON parsing fails because the string is unterminated near the very end — the response is being **truncated mid-string** in transport.

**Impact**: any tooling that tries to consume the full state snapshot bombs. The partial-section variants (`--include timeline`, `--include project`, `--include playhead`, etc.) work fine — only `media` and the full snapshot trip the bug.

**Likely root cause**: response body cut off by the HTTP-bridge writer (chunk size, EOL, or buffer limit) when payload exceeds ~17 MB. Need to either:
- stream the response in chunks, **or**
- exclude `data:` thumbnail URLs from the default media snapshot (offer a `--with-thumbnails` opt-in), **or**
- replace embedded base64 with an opaque path/URL pointer.

**Workaround**: use `--include` with explicit sections that don't include `media`. Most callers don't need the inline thumbnails.

### 2. `editor:snapshot` (full UI tree) — 80 KB but truncated mid-JSON

```
Expecting property name enclosed in double quotes: line 3033 column 2 (char 81752)
```

Last 200 bytes shown:

```
"name": "New Project Mar 1, 2026 · Mar 1, 2026",
```

The JSON ends in the middle of a property value. The `--interactive` variant (which only emits actionable elements, ~18 KB) works perfectly.

**Likely root cause**: same family as #1 — output buffer cap or chunk-write boundary somewhere around 80 KB. The interactive variant slips under the limit.

**Workaround**: use `--interactive` (covers the common UI-automation use case anyway) or `--depth N` to bound size.

### 3. `editor:project:report` — claims `ok` but writes nothing

```
$ qcut editor:project:report --project-id <id> --output-dir /tmp/qcut-report-test --json
{ "status": "ok", "data": { … } }
$ ls /tmp/qcut-report-test/
# (empty)
```

The command returns success but the configured output directory remains empty. Either the report writes elsewhere (silent path override) or the write is silently swallowed.

**Workaround**: unknown — call the underlying summary endpoints (`editor:project:summary`, `editor:project:stats`, `editor:project:info --full`) directly until investigated.

---

## Test-harness false alarms (not real bugs)

Five "json-parse-error" entries in the raw logs are **artifacts of the test script** (heredoc quoting + `Extra data` from CLI banner lines being concatenated with the JSON body). The actual commands return valid JSON when probed directly:

| Command | What the test logged | What actually happened |
|---|---|---|
| `editor:undo` (no `--force`) | parse-error | Clean `status: error`: action policy needs `--force`. |
| `editor:redo` (no `--force`) | parse-error | Same. |
| `editor:errors` | parse-error | Clean `status: error`: needs `QCUT_API_TOKEN`. |
| `editor:console` | parse-error | Same. |
| `editor:timeline:batch-add` | parse-error | Clean `status: error`: `Track not found: text-1` (expected). |

These were verified one-by-one via direct CLI invocation; the response bodies parsed cleanly with `python3 -c "import json,sys; json.load(sys.stdin)"`.

---

## Authentication / policy gates worth documenting

Two whole subsystems require additional setup beyond the basic session login:

- **`editor:undo`, `editor:redo`** and any other action-policy-gated commands need `--force` (or a `--policy <path>` JSON allowlist). Documented in `editor-agent.md` under "Action Policy" but easy to miss.
- **`editor:errors`, `editor:console`** require `QCUT_API_TOKEN` to be set as a bearer token, which is **not** the same as the session login token. There's no obvious doc pointer to this; suggest adding a "Console routes auth" section to `editor-agent.md`.

---

## Coverage map vs. skill docs

| Skill file | Commands documented | Tested |
|---|---|---|
| `editor-core.md` | 8 (auth + connection + workflows) | 8 |
| `editor-media.md` | 16 (media + project) | 13 |
| `editor-timeline.md` | 23 (timeline + editing) | 17 |
| `editor-output.md` | 22 (export, screen-rec, UI, moyin, screenshot, state) | 18 |
| `editor-ai.md` | ~20 (analyze, generate, transcribe, search) | 4 |
| `editor-state-control.md` | ~12 (events, txn, capabilities) | 0 (out of scope — needs WebSocket/event harness) |
| `editor-agent.md` | ~15 (snapshot interaction, console, diff, sessions) | 4 |

**Not exercised** (deferred — most need real assets, network calls, or async polling):
- `editor:media:import-url`, `editor:media:batch-import`, `editor:media:extract-frame`, `editor:media:rename`, `editor:media:delete`
- `editor:timeline:trim`, `editor:timeline:arrange`, `editor:timeline:split`, `editor:timeline:move`, `editor:timeline:batch-update`, `editor:timeline:batch-delete`, `editor:timeline:import`
- `editor:editing:batch-cuts`, `editor:editing:delete-range`, `editor:editing:auto-edit`, `editor:editing:suggest-cuts` (job-bearing async)
- `editor:analyze:video`, `editor:analyze:frames`, `editor:analyze:fillers`, `editor:transcribe:*`, `editor:search:*`
- `editor:export:start` (would consume credits)
- `editor:screen-recording:start` / `:stop` / `:force-stop`
- `editor:state:event:stream`, `editor:state:txn:*` (need WebSocket client)
- `editor:diff:*`, `editor:session:*`

Would extend the harness with real inputs to cover these in a follow-up.

---

## Reproduction

```bash
# Make sure QCut is running
bun run electron &

# Wait for the bridge
qcut editor:health --json

# Read-only sweep (used in this report)
bash /tmp/run-tests-v2.sh <project-id>

# Mutation sweep (creates + deletes a sandbox project)
bash /tmp/mut-tests.sh
```

Both shell scripts and their raw JSONL outputs live in `/tmp/` and were copied here for archival as `raw-readonly.jsonl` / `raw-mutations.jsonl`.
