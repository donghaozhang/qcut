# 02 — GIF Export

**Priority**: P0 — Common sharing format for short clips (Slack, GitHub, docs)
**Estimate**: Medium (3 subtasks)
**Status**: PARTIALLY IMPLEMENTED (2.2 types done, 2.1 engine + 2.3 UI pending)

## Goal

Export timeline as animated GIF with configurable frame rate, loop toggle, and size presets.

## Implementation Summary

### 2.2 Export Types — DONE

**Modified**: `apps/web/src/types/export.ts`
- Added `GIF: "gif"` to `ExportFormat` const object
- Added `GifFrameRate` type: `15 | 20 | 25 | 30`
- Added `GifSizePreset` type: `"medium" | "large" | "original"`
- Added `GifExportConfig` interface: `{ frameRate, loop, sizePreset, quality }`
- Added `DEFAULT_GIF_CONFIG`: 20 FPS, loop on, medium size, quality 10
- Added `GIF_SIZE_PRESETS`: medium (720p), large (1080p), original
- Added `GIF_FRAME_RATES`: 4 options with labels
- Added `isValidGifFrameRate()` type guard
- Added `calculateGifDimensions()` — aspect-preserving scale with even pixel counts
- Added `GIF_FORMAT_INFO` constant

**Tests**: `apps/web/src/types/__tests__/export-gif.test.ts` — 12 tests, all passing
- ExportFormat includes GIF, preserves existing formats
- isValidGifFrameRate: accepts valid, rejects invalid
- calculateGifDimensions: within preset, scales down, original preset, even pixels, aspect ratio
- Constants: size presets, frame rate count, defaults

### 2.1 GIF Export Engine — PENDING

**TODO**:
- `bun add gif.js` (or `gif.js.optimized`)
- Create `apps/web/src/lib/export/gif-export-engine.ts`
- Reuse existing `ExportEngine` frame renderer, swap MediaRecorder for gif.js encoder
- Worker count: `Math.min(navigator.hardwareConcurrency || 4, 8)`
- Route `format: "gif"` in `export-engine-factory.ts`

### 2.3 GIF Options UI — PENDING

**TODO**:
- Frame rate selector (15/20/25/30 FPS)
- Loop toggle checkbox
- Size preset selector (medium/large/original)
- Quality slider (1–20)
- Show GIF-specific controls when format === "gif"

## Dependencies

- **New**: `gif.js` (MIT, ~50KB) — Web Worker-based GIF encoder
- **Existing**: Reuse `export-engine-renderer.ts` frame rendering pipeline entirely
