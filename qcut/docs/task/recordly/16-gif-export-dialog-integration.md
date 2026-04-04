# 16 — GIF Export Dialog Integration

**Priority**: P1
**Estimate**: Small (~15 min)
**Status**: DONE

## Goal

GIF export engine (`gif-convert.ts`) and options card (`GifOptionsCard`) exist but are not wired into the export dialog. Users cannot configure GIF settings from the UI.

## Implementation

### File: Export dialog component

Integrate `GifOptionsCard` into the export dialog when format is `GIF`.

**Files**:
- `apps/web/src/components/export/export-settings-cards.tsx` — `GifOptionsCard` already exists
- Export dialog component (find via store's export flow) — add conditional render of GIF card
- `apps/web/src/types/export.ts` — `GIF` format type already defined

**Behavior**:
- When user selects GIF format, show GIF options (fps, loop, quality)
- Pass `gifConfig` to export engine alongside standard settings
- Default: 20fps, loop=true, quality=10

### File: Export engine GIF conversion

Wire `gif-convert.ts` into the export pipeline after MP4 rendering.

**Files**:
- `electron/claude/handlers/claude-export-handler/gif-convert.ts` — two-pass FFmpeg conversion exists
- `electron/claude/handlers/claude-export-handler/export-engine.ts` — add post-render GIF step

**Tests**:
- `apps/web/src/lib/export/__tests__/gif-export-engine.test.ts` — 7 tests exist, verify integration
- Add test: GIF config flows from dialog to export engine
- Add test: format selection toggles GIF options visibility

## Dependencies

- FFmpeg binary available at runtime (already bundled)
- `electron/claude/handlers/claude-export-handler/presets.ts` — `gif-medium`, `gif-large` presets exist
