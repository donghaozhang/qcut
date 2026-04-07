# Director Panel: Model Selection + Streaming Output

Added model selection and live streaming output to the Director panel's Parse Script feature. Users can now choose which LLM provider to use and see streaming tokens in the PTY terminal while parsing.

**Implemented**: 2026-03-01

## What Changed

### Model Selection Dropdown

The Director panel's Import tab now has a **Parse Model** dropdown with:

| Option | Provider | Notes |
|--------|----------|-------|
| Gemini Flash | OpenRouter (`google/gemini-2.5-flash`) | Default, fastest, cheapest |
| Gemini Pro | OpenRouter (`google/gemini-2.5-pro`) | Higher quality, slower |
| Kimi K2.5 | OpenRouter (`moonshotai/kimi-k2.5`) | Best for Chinese scripts |
| MiniMax M2.5 | OpenRouter (`minimax/minimax-m2.5`) | Fast, good structured output |
| Claude (no key) | Claude CLI fallback | Zero-config, no API key needed |

### Streaming Output in Terminal

When the user clicks **Parse Script**, the system:

1. Saves the script to a temp file via IPC
2. Switches to the **PTY Terminal** tab automatically
3. Runs the CLI command with `--stream` and the selected `--model`
4. User sees raw LLM tokens streaming live in the terminal (xterm.js)
5. CLI pushes parsed result to editor via HTTP API (`/api/claude/moyin/parse-result`)
6. Store receives data via `onParsed` listener and runs calibration pipeline

### Inline Progress in Director Panel

The Import Progress section now shows:
- **Provider name** during parsing (e.g., "Parsing with Gemini Flash")
- **"View in Terminal"** link to switch back to the PTY tab

### IPC Fallback

If the PTY terminal is unavailable (e.g., Claude Code is running in it), the system falls back to the original IPC path (`moyin:parse-script`) with no streaming.

## Data Flow

```text
[Parse Button] → Save temp file (moyin:save-temp-script IPC)
               → Switch to PTY terminal tab
               → Run: bun run pipeline moyin:parse-script --script /tmp/... --model gemini --stream
               → User sees streaming tokens in terminal
               → CLI pushes result to POST /api/claude/moyin/parse-result
               → claude-http-server forwards via "claude:moyin:parsed" IPC event
               → onParsed listener in moyin-store receives data
               → runCalibrationPipeline() — 5 steps:
                   1. Title Calibration
                   2. Synopsis Generation
                   3. Shot Calibration
                   4. Character Calibration
                   5. Scene Calibration
               → parseStatus: "ready"
```

Fallback (PTY unavailable):
```text
[Parse Button] → IPC moyin:parse-script → moyin-handler.ts callLLM() → result → calibration
```

## PTY Session Conflict Strategy

| PTY State | Behavior |
|-----------|----------|
| Disconnected | Spawn shell, run command |
| Connected + shell | Write command to existing session |
| Connected + Claude/Gemini/Codex | Fall back to IPC (never kill user's agent) |

## Files Modified

| File | Change |
|------|--------|
| `electron/moyin-handler.ts` | Added `moyin:save-temp-script` and `moyin:cleanup-temp-script` IPC handlers; returns `projectRoot` for CLI command |
| `electron/preload-integrations.ts` | Added `saveTempScript`, `cleanupTempScript` to `createMoyinAPI()` |
| `electron/preload-types/electron-api.ts` | Added type definitions for new IPC methods |
| `apps/web/src/types/electron/api-moyin.ts` | Added type definitions for new IPC methods |
| `apps/web/src/stores/moyin/moyin-parse-actions.ts` | **New file** — `runCalibrationPipeline()`, `attemptPtyParse()`, `MODEL_OPTIONS`, `getModelLabel()` |
| `apps/web/src/stores/moyin/moyin-store.ts` | Added `parseModel`, `parseProvider`, `_pendingTempScriptPath` state; `setParseModel` action; refactored `parseScript()` (PTY first → IPC fallback); updated `onParsed` to run full calibration pipeline |
| `apps/web/src/components/.../script-input.tsx` | Added Parse Model dropdown using existing Select pattern |
| `apps/web/src/components/.../import-progress.tsx` | Added provider name display + "View in Terminal" link |

## Bug Fix: EPIPE Crash

Also fixed a pre-existing `EPIPE` crash in `ai-video-save-handler.ts`:

| File | Change |
|------|--------|
| `electron/ai-video-save-handler.ts` | Added `safeLog()` wrapper that catches EPIPE errors from broken stdout during shutdown |
| `electron/main.ts` | Wrapped migration result logging in try-catch |

**Root cause**: `console.log` in `migrateAIVideosToDocuments()` writing to stdout after the pipe was disconnected during Electron lifecycle events.

## Architecture Notes

### Why PTY instead of IPC streaming?

The CLI (`cli-handlers-moyin.ts`) already has full streaming infrastructure with SSE parsing for OpenRouter and Gemini. Rather than duplicating this in `moyin-handler.ts`, we reuse the CLI via the PTY terminal:

- **One LLM call** (no duplication)
- **Existing streaming** renders beautifully in xterm.js
- **Data flows back** through existing HTTP push infrastructure
- **No new IPC event channels** needed for streaming chunks

### Calibration Pipeline Extraction

`runCalibrationPipeline()` was extracted from `moyin-store.ts` (lines 308-404) into `moyin-parse-actions.ts` so both the `parseScript()` action and the `onParsed` listener can reuse it. Previously, `onParsed` only set raw data without running calibration.

### Timeout Handling

- PTY path: 3-minute timeout — if `onParsed` never fires, shows error message
- Temp file cleanup: 5-minute `setTimeout` + cleanup on `onParsed` receive
- OS temp directory handles ultimate cleanup

## Testing

1. `bun run build` — passes, no type errors
2. `bun run electron` — starts cleanly, no EPIPE crash
3. Director panel → Import tab → model dropdown visible
4. Select model, click Parse → PTY terminal opens, CLI runs with `--stream`
5. Streaming tokens visible in terminal
6. After CLI finishes → data populates Characters/Scenes tabs
7. Calibration pipeline runs (6-step progress shown)
8. Fallback: if Claude Code running in PTY → IPC path used instead
