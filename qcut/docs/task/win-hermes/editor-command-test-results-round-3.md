# win-hermes editor command test results — Round 3 (mutations)

## Context
- Branch: `win-Hermes`
- Date: 2026-04-27
- Repo root: `C:\Users\yanie\Desktop\qcut-fresh\qcut`
- QCut app state: running, same Electron processes from Round 2
- Auth state: logged in (token `JJHc...EAci`, `authenticated: true` from Round 2)
- Invocation pattern: same as Round 2 (PowerShell, compiled `cli.js` + `node` + `NODE_PATH`)

## Goal

Round 1 covered read-only `editor:*` queries. Round 2 covered state/snapshot/auth. Round 3 covers **state-mutating commands** (project create/rename/duplicate/delete, timeline element CRUD) plus the rest of the panels. All mutations were performed on a throwaway test project that was deleted at the end — the user's existing project (`0989584f-9492-4e0f-be00-0e76e2292239`) was not touched.

## Summary

- Tested: 18 commands
- ✅ Succeeded: 17
- ⚠️ Surprising behavior worth noting: 2

## Successes

### Project lifecycle (all needed `--force` due to action policy)

| Command | Result | Notes |
|---|---|---|
| `editor:project:create --new-name "win-Hermes CLI Test"` | ✅ | New ID: `c822f898-0540-4023-86dc-a8593580d382` |
| `editor:project:rename --new-name "...(renamed)"` | ✅ | `renamed: true` |
| `editor:project:duplicate` | ✅ | New duplicate `c9058e04-3f21-4694-b6b7-62bb570c4fb4`, name auto-suffixed to `"Duplicated Project"` |
| `editor:project:delete` (test) | ✅ | `deleted: true` |
| `editor:project:delete` (duplicate) | ✅ | `deleted: true` |
| `editor:project:list --json` (post-cleanup) | ✅ | Only the original `New Project` remains |

### Timeline element CRUD

| Command | Result | Notes |
|---|---|---|
| `editor:timeline:add-element --data @element.json --force` | ✅ | Returned `elementId: element_1777266896428_rzb9mq7` (synthetic ID; resolved to UUID `ecd347cc-...` after export) |
| `editor:timeline:update-element --changes @changes.json --force` | ✅ | `updated: true` (changed `duration: 3 → 5`) |
| `editor:timeline:delete-element --force` | ✅ | `removed: true` |

### Inline `--data '...'` JSON quoting (PowerShell pitfall)

Inline JSON like `--data '{"type":"text",...}'` from PowerShell **fails** with:
```
"error": "Invalid JSON input. Use inline JSON, @file.json, or - for stdin.",
```
PowerShell strips the inner double quotes when forwarding to a native exe. **Workaround that works:** write JSON to a temp file and pass `--data @<path>` (also works for `--changes`, `--cuts`, `--elements`, `--updates`, `--items`).

### Panel coverage (the rest of `editor:ui:switch-panel`)

| Panel arg | Result | `group` returned |
|---|---|---|
| `text` | ✅ | `edit` |
| `video-edit` | ✅ | `edit` |
| `effects` | ✅ | `edit` |
| `transitions` | ✅ | `edit` |
| `filters` | ✅ | `edit` |
| `sounds` | ✅ | `ai-create` |
| `ai-video` | ✅ | `ai-create` — see surprise below |
| `api-keys` | ✅ | `properties` |

### Moyin

| Command | Result |
|---|---|
| `editor:moyin:set-script --text "Test scene" --force` | ✅ — `updated: true` |

## Surprising behavior

### 1. `editor:ui:switch-panel --panel ai-video` aliases to `ai`

Request: `--panel ai-video`. Response:
```json
{"switched": true, "panel": "ai", "group": "ai-create"}
```

The panel name returned is `"ai"`, not `"ai-video"`. Either `ai-video` is an alias the handler silently rewrites, or the panel ID is just `ai` and `ai-video` is the user-facing label. Round 2's bogus-panel error message did list both `ai` and `ai-video` as valid, so they're both accepted at input time — but the canonical form is `ai`.

### 2. `editor:timeline:export --project-id <new-test-project-id>` returns wrong project metadata

After creating test project `c822f898-...` and adding a text element to it via `editor:timeline:add-element --project-id c822f898-...`, calling:

```bash
editor:timeline:export --project-id c822f898-... --json
```

returned:
```json
{
  "name": "New Project",                 // ← name of the OTHER project, not "win-Hermes CLI Test (renamed)"
  "duration": 4.062993,                  // ← duration of the OTHER project
  "tracks": [
    { "name": "Text Track", ...elements: [our newly-added text]... },
    { "id": "db68a92f-0d74-4e23-ab38-bcd04835b720", "name": "Main Track", ... }
  ]
}
```

The track ID `db68a92f-...` is identical to the original `"New Project"`'s Main Track from Round 2. Two possibilities:

- **(likely)** `timeline:export` ignores `--project-id` and exports the **active editor session's** timeline. Our `add-element` mutation reached the test project's data layer, but the export reflects the editor's currently-loaded project (still the original).
- **(less likely)** The test project inherited the original's Main Track verbatim during creation.

Either way: the response should not name the project `"New Project"` when the requested ID is `c822f898-...`. **This is a correctness issue** — agents using `--project-id` to read a non-active project will get cross-talk from the active session.

Suggested follow-up: read `editor/editor-handlers-timeline.ts` (or wherever `editor:timeline:export` is handled) and verify whether the handler scopes the export by `--project-id` or by current active session.

## Files

- Test artifacts: `C:\Users\yanie\AppData\Local\Temp\qcut-element.json`, `qcut-changes.json`, `qcut-state-export.json` (deleted after run)
- Cleanup confirmed: post-test `editor:project:list` shows only the original project

## Cumulative coverage across all 3 rounds

| Group | Tested | Pass | Real fail | Auth-gated | Action-policy gated | Surprise |
|---|---:|---:|---:|---:|---:|---:|
| health/auth/session | 5 | 5 | 0 | 0 | 1 (cleared with `--force`) | 0 |
| navigator | 2 | 2 | 0 | 0 | 0 | 0 |
| project | 11 | 11 | 0 | 0 | (via `--force`) | 0 |
| timeline (read) | 4 | 4 | 0 | 0 | 0 | 1 (export project scope) |
| timeline (mutate) | 3 | 3 | 0 | 0 | (via `--force`) | 0 |
| state | 4 | 4 | 0 | 0 | 1 (cleared) | 0 |
| ui | 11 | 11 | 0 | 0 | 0 | 1 (`ai-video` → `ai`) |
| export | 3 | 3 | 0 | 0 | 0 | 0 |
| screen-recording | 2 | 2 | 0 | 0 | 0 | 0 |
| moyin | 2 | 2 | 0 | 0 | 0 | 0 |
| diagnostics | 1 | 0 | 1 | 0 | 0 | 0 |
| screenshot | 1 | 1 | 0 | 0 | 0 | 1 (filename path stripping) |
| console | 2 | 0 | 0 | 2 | 0 | 0 |
| system | 1 | 1 | 0 | 0 | 0 | 0 |
| help | 1 | 1 | 0 | 0 | 0 | 0 |
| **Total** | **53** | **50** | **1** | **2** | **5 (cleared)** | **3** |

## Outstanding bugs identified across rounds

1. `editor:diagnostics:analyze` — `Cannot read properties of undefined (reading 'getVersion')` (Round 2)
2. `editor:timeline:export --project-id <X>` returns the **active project's** name/duration even when X is a different project (Round 3)
3. `editor:screenshot:capture --filename <abs-path>` — sanitizes the absolute path into a basename and forces output to `~/Videos/QCut Recordings/`. Path-handling is too aggressive (Round 2)
4. Bun 1.3.8 panic on Windows (`bun run electron/native-pipeline/cli/cli.ts ...`) — affects every documented `qcut ...` invocation; requires the `node + dist + NODE_PATH` workaround (Round 2)
5. `editor:ui:switch-panel`'s undocumented panel names — the rejection error lists 9 panels not in `editor-output.md`'s panel list (Round 2)
