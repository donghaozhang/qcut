# 17 — CLI Flag → Export Engine Wiring

**Priority**: P1
**Estimate**: Medium (~20 min)
**Status**: DONE (verified — CLI flags fully wired through HTTP body → ResolvedExportSettings → cursor-composite.ts)

## Goal

Ensure CLI flags (`--cursor-sway`, `--cursor-blur`, `--cursor-loop`, `--auto-zoom`, `--zoom-blur`, `--gif-*`) are forwarded from flag → HTTP body → export engine → compositor.

## Subtasks

### 17.1 — HTTP Body Construction (~10 min)

Verify and fix flag-to-body mapping in the editor export handler.

**Files**:
- `electron/native-pipeline/editor/editor-handlers-generate.ts` (lines 305-342) — builds HTTP request body
- `electron/claude/handlers/claude-export-handler/export-engine.ts` — reads body fields

**Verify each flag maps correctly**:
| CLI Flag | Body Field | Compositor Config |
|----------|-----------|-------------------|
| `--cursor-sway` | `cursorConfig.sway` | `cursorConfig.sway` |
| `--cursor-blur` | `cursorConfig.motionBlur` | `cursorConfig.motionBlur` |
| `--cursor-loop` | `cursorConfig.loopMode` | `cursorConfig.loopMode` |
| `--auto-zoom` | `zoomConfig.autoZoom` | triggers `analyzeForZoomSuggestions()` |
| `--zoom-blur` | `zoomConfig.motionBlur` | `zoomConfig.motionBlur` |
| `--gif-fps` | `gifConfig.frameRate` | GIF conversion pass |
| `--gif-loop` | `gifConfig.loop` | GIF conversion pass |
| `--gif-quality` | `gifConfig.quality` | GIF conversion pass |

### 17.2 — Export Engine Config Passthrough (~10 min)

Ensure `export-engine.ts` reads all body fields and passes to compositor.

**Files**:
- `electron/claude/handlers/claude-export-handler/export-engine.ts` (lines 48-115) — `resolveExportSettings()`

**Tests**:
- `electron/__tests__/cli-screen-recording-args.test.ts` — existing CLI arg parsing tests
- `electron/__tests__/editor-screen-recording-cli.test.ts` — existing CLI integration tests
- Add test: each flag value arrives in compositor config
- Add test: `--auto-zoom true` triggers zoom region generation from cursor telemetry

## Dependencies

- Task 14 (export compositor wiring) should be done first — otherwise flags reach the compositor but fields are still ignored
