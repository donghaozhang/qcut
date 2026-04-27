# win-hermes editor command test results — Round 2

## Context
- Branch: `win-Hermes`
- Date: 2026-04-27
- Repo root: `C:\Users\yanie\Desktop\qcut-fresh\qcut`
- QCut app state during test: desktop app running (multiple `electron` processes, HTTP server up on `127.0.0.1:8765`)
- App version: `2026.04.26.2` (per `editor:health`)
- API version: `1.1.0`
- Active project: `0989584f-9492-4e0f-be00-0e76e2292239` ("New Project", 1920x1080@30fps)

## Invocation environment

This round did **not** use `bun run qcut ...` because that path is broken on Windows native (see "Blocker findings"). Working invocation:

```powershell
$env:NODE_PATH = "C:\Users\yanie\AppData\Local\Temp\qcut-cli-test\node_modules"
node C:\Users\yanie\Desktop\qcut-fresh\qcut\dist\electron\native-pipeline\cli\cli.js <subcommand> [flags]
```

Where the temp `node_modules` contains a flat `npm install js-yaml` (the bundled `node_modules` uses Bun symlinks that `node` cannot follow on Windows).

## Summary

- Tested: 30 commands across 12 groups
- ✅ Succeeded: 25
- ❌ Failed (real bug): 1
- 🔒 Blocked by `QCUT_API_TOKEN` requirement: 2
- 🔒 Blocked by action policy (cleared with `--force`): 3 (3/3 succeeded after `--force`)
- ⚠️ Partial / unexpected behavior: 2

## Successes

### State control (gap from Round 1 closed)

| Command | Result | Notes |
|---|---|---|
| `editor:state:snapshot --json` | ✅ | Full state: `timeline`, `selection`, `playhead`, `media`, `editor`, `project` |
| `editor:state:snapshot --include timeline,playhead --json` | ✅ | Filtered output, only requested sections |
| `editor:undo --force --json` | ✅ | `applied: false, undoCount: 0` (no history yet) |
| `editor:redo --force --json` | ✅ | `applied: false, redoCount: 0` |

> Round 1 reported `editor:snapshot` returning empty elements. That command is the **accessibility snapshot** (different intent). The **state snapshot** under `editor:state:snapshot` returns full timeline data correctly.

### Project commands

| Command | Result | Notes |
|---|---|---|
| `editor:project:list --json` | ✅ | Lists 1 project, includes `activeProjectId` |
| `editor:project:settings --json` | ✅ | Returns `width/height/fps/aspectRatio/backgroundColor/exportFormat/exportQuality` |
| `editor:project:stats --json` | ✅ | `totalDuration`, `mediaCount`, `trackCount`, `elementCount` |
| `editor:project:summary` | ✅ | Markdown summary (non-JSON output) |
| `editor:project:info --project-id ... --full --json` | ✅ | Full envelope (~2000 tokens) |
| `editor:project:export-state --project-id ... --output state.json` | ✅ | Wrote 747-byte file to disk |
| `editor:project:report --project-id ... --output-dir ... --json` | ✅ | Empty pipeline report (no recorded operations yet) |

### Timeline commands

| Command | Result |
|---|---|
| `editor:timeline:info --json` | ✅ |
| `editor:timeline:export --json` | ✅ |
| `editor:timeline:get-selection --json` | ✅ — empty selection |

### Export

| Command | Result | Notes |
|---|---|---|
| `editor:export:presets --json` | ✅ | YouTube 4K/1080p, TikTok, Instagram, Twitter, etc. |
| `editor:export:recommend --target tiktok --json` | ✅ | Returns preset + warnings + suggestions |
| `editor:export:list-jobs --json` | ✅ | Empty list |

### Screen recording

| Command | Result |
|---|---|
| `editor:screen-recording:sources --json` | ✅ — 2 screens + multiple windows |
| `editor:screen-recording:status --json` | ✅ — `state: idle` |

### Auth (with `--force` for `--reveal`)

| Command | Result | Notes |
|---|---|---|
| `editor:auth:token --json` | ✅ | Masked: `JJHc...EAci` |
| `editor:auth:token --reveal --force --json` | ✅ | Full token revealed |

### Navigator / UI / sessions

| Command | Result |
|---|---|
| `editor:navigator:projects --json` | ✅ |
| `editor:navigator:open --project-id ... --json` | ✅ |
| `editor:ui:switch-panel --panel media --json` | ✅ |
| `editor:ui:switch-panel --panel ai --json` | ✅ |
| `editor:ui:switch-panel --panel properties --json` | ✅ |
| `editor:session:list --json` | ✅ |

### Other

| Command | Result | Notes |
|---|---|---|
| `editor:moyin:status --json` | ✅ | All steps `pending`, `parseStatus: idle` |
| `system models --json` | ✅ | Lists model registry — does **not** require editor running |
| `--help --json` | ✅ | Level-1 progressive help works |

## Failures

### 1. `editor:diagnostics:analyze` — actual bug

```bash
node cli.js editor:diagnostics:analyze --message "CLI test" --json
```

Result:

```json
{
  "status": "error",
  "error": "Cannot read properties of undefined (reading 'getVersion')",
  "code": "editor:diagnostics:analyze:failed"
}
```

**Interpretation:** the handler reads `something.getVersion()` from a value that is `undefined` in this code path. Likely an `app` reference in the wrong process context. Reproducible.

### 2 & 3. Console-route auth gating (already known; reproduced)

| Command | Status | Error |
|---|---|---|
| `editor:console --json` | 🔒 403 | `Console routes require QCUT_API_TOKEN to be configured and sent as a bearer token.` |
| `editor:errors --json` | 🔒 403 | Same |

Confirmed source of the gate: `electron/claude/http/claude-http-auth.ts:25-31`. Strict-auth path set:

```ts
const STRICT_LOCAL_AUTH_PATHS = new Set([
  "/api/claude/console",
  "/api/claude/console/stream",
  "/api/claude/errors",
]);
```

To unblock these, `QCUT_API_TOKEN` must be set in the env of the **Electron main process at startup**, not just in the CLI's env. Restart of QCut required.

## Action-policy gating (security feature, working as designed)

These commands return `error: Command requires confirmation by action policy ... Re-run with --force` until `--force` is added:

- `editor:undo`
- `editor:redo`
- `editor:auth:token --reveal`

All three succeeded immediately after appending `--force`.

## Partial / unexpected behavior

### `editor:ui:switch-panel --panel bogus-panel` — correctly rejected

Returns a clear error listing all valid panels. **Validation works.**
Note: full panel list reported by the error includes panels not documented in `editor-output.md`: `ai-chat`, `terminal`, `skills`, `library`, `ai-video`, `ai-images`, `audio-studio`, `smart-speech`, `project`. Skill docs may be stale.

### `editor:screenshot:capture --filename <absolute-path>` — path ignored

Requested:
```
--filename C:\Users\yanie\AppData\Local\Temp\qcut-shot.png
```

Actual saved location:
```
C:\Users\yanie\Videos\QCut Recordings\C__Users_yanie_AppData_Local_Temp_qcut-shot.png
```

The handler treats the entire absolute path as a sanitized basename and forces it into `~/Videos/QCut Recordings/`. Returned `width: 0, height: 0` (suspicious — image likely empty). Documented behavior was just `--filename`, no path semantics; this matches but is surprising for absolute paths.

### `node` libuv shutdown assertion (cosmetic)

Several runs printed:

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

This appears **after** the JSON envelope has been written and exit code has been set. It's a node 24 + libuv shutdown race on Windows; output is intact. Not a CLI bug.

## Blocker findings (environment, not the CLI)

### `bun run qcut ...` panics on Windows with Bun 1.3.8

Every invocation of the CLI through Bun crashes the runtime, not the script:

```
Bun v1.3.8 (b64edcb4) Windows x64
panic(main thread): invalid enum value
oh no: Bun has crashed. This indicates a bug in Bun, not your code.
```

Reproduced with:
- `bun run qcut --version`
- `bun run qcut editor:health --status-only --json`
- `bun electron/native-pipeline/cli/cli.ts --help`
- `bun _wrapper.mjs` where the wrapper only `import()`s `cli.ts`
- WSL invocation of the same Windows `bun.exe` (`/mnt/c/Users/yanie/.bun/bin/bun.exe`)

Bun runs **fine** for trivial scripts (`bun -e "console.log('hi')"`), so the crash is during TS transform of the CLI's import graph.

WSL Linux `bun 1.3.10` runs `cli.ts` successfully but cannot reach the editor server (`127.0.0.1:8765`) because `electron/claude/http/claude-http-server.ts:440` binds to `127.0.0.1` only — WSL2's NAT can't traverse this.

### Workaround that works

```powershell
# One-time setup — flat js-yaml install for node's resolver
npm init -y; npm install js-yaml
$env:NODE_PATH = "<path-to-flat-node_modules>"

# Run any qcut subcommand
node C:\Users\yanie\Desktop\qcut-fresh\qcut\dist\electron\native-pipeline\cli\cli.js <subcommand> [flags]
```

Why a flat `node_modules` is needed: the project's bundled `node_modules` is laid out by Bun with junctions/symlinks (`node_modules/js-yaml -> node_modules/.bun/js-yaml@4.1.1/...`). `node` on Windows cannot resolve these symlinks during CJS lookup. This affects only the compiled `dist/.../cli.js` — when running through Bun the issue does not arise (Bun has its own resolver).

## Useful next checks
1. File a bug for `editor:diagnostics:analyze` — `getVersion` on undefined object
2. Set `QCUT_API_TOKEN` and restart Electron, then verify `editor:console` / `editor:errors` succeed
3. Update `editor-output.md` with the missing panel names (`ai-chat`, `terminal`, `skills`, `library`, `ai-video`, `ai-images`, `audio-studio`, `smart-speech`, `project`)
4. File a Bun bug or repo-side issue for the Windows-native `bun run cli.ts` panic — currently blocks the documented workflow in the native-cli skill
5. Test mutation commands: `editor:media:import`, `editor:timeline:add-element`, `editor:project:create` (Round 3)
