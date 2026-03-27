# Recordly Feature Parity — Implementation Overview

Reference: [QCut vs Recordly comparison](../recordly-feature-comparison.md)
Source: [github.com/webadderall/Recordly](https://github.com/webadderall/Recordly) (AGPL 3.0)

## Implementation Status

All 8 features have core logic implemented. UI components and export integration remain as follow-up work.

| # | Feature | Plan | Status | Tests |
|---|---------|------|--------|-------|
| 1 | [Audio Capture](./01-audio-capture.md) | Mic + system audio | Service done, IPC/UI pending | 9 |
| 2 | [GIF Export](./02-gif-export.md) | Animated GIF export | Types done, engine/UI pending | 12 |
| 3 | [Webcam Overlay](./03-webcam-overlay.md) | PiP webcam bubble | Store + squircle done, capture/render pending | 20 |
| 4 | [Speed Regions](./04-speed-regions.md) | Per-region speed ramps | Model + store done, timeline UI/export pending | 23 |
| 5 | [Custom Backgrounds](./05-custom-backgrounds.md) | Upload wallpapers | Types + utilities done, IPC/UI pending | 19 |
| 6 | [Cursor Sway](./06-cursor-sway.md) | Natural wobble | Algorithm + renderer done, UI slider pending | 13 |
| 7 | [Cursor Loop](./07-cursor-loop.md) | Seamless loop cursor | Algorithm done, UI toggle pending | 11 |
| 8 | [Figure Annotations](./08-figure-annotations.md) | Arrows/shapes | Paths + store done, render pending | 9 |
| | **Total** | | | **116** |

## Files Created

### New source files (8)
| File | Feature |
|------|---------|
| `apps/web/src/lib/screen-recording/cursor-sway.ts` | Cursor sway algorithm |
| `apps/web/src/lib/screen-recording/cursor-loop.ts` | Cursor loop telemetry builder |
| `apps/web/src/lib/screen-recording/audio-capture.ts` | Audio capture service |
| `apps/web/src/lib/screen-recording/speed-regions.ts` | Speed region model + utilities |
| `apps/web/src/lib/screen-recording/squircle.ts` | Squircle geometry |
| `apps/web/src/lib/screen-recording/figure-paths.ts` | Arrow/circle/rectangle paths |
| `apps/web/src/stores/webcam-overlay-store.ts` | Webcam overlay store |
| `apps/web/src/stores/figure-annotations-store.ts` | Figure annotations store |

### Modified source files (4)
| File | Changes |
|------|---------|
| `apps/web/src/lib/screen-recording/cursor-renderer.ts` | Added `sway` to config, spring rotation, swayRotation rendering |
| `apps/web/src/lib/screen-recording/canvas-cursor-renderer.ts` | Added `swayRotation` parameter, rotation transform |
| `apps/web/src/lib/screen-recording/wallpapers.ts` | Added `"wallpaper"` type, filename utilities |
| `apps/web/src/stores/screen-recording-store.ts` | Added speed regions state + actions |
| `apps/web/src/types/export.ts` | Added `GIF` format, GIF types/presets/utilities |

### New test files (9)
| File | Tests |
|------|-------|
| `__tests__/cursor-sway.test.ts` | 13 |
| `__tests__/cursor-loop.test.ts` | 11 |
| `__tests__/audio-capture.test.ts` | 9 |
| `__tests__/speed-regions.test.ts` | 23 |
| `__tests__/squircle.test.ts` | 8 |
| `__tests__/figure-paths.test.ts` | 9 |
| `__tests__/wallpapers.test.ts` | 19 (12 new) |
| `__tests__/export-gif.test.ts` | 12 |
| `__tests__/webcam-overlay-store.test.ts` | 12 |

## Remaining Work (UI + Integration)

All features have their core logic, data models, and algorithms implemented. What remains is:

1. **UI components** — Settings panels, timeline rows, controls
2. **Export engine integration** — Wiring new features into the frame rendering pipeline
3. **IPC handlers** — Electron handlers for file operations (wallpapers, audio devices)
4. **gif.js dependency** — `bun add gif.js` + GIF export engine class

## Reuse Summary

| Recordly Source | What Was Ported | Lines |
|----------------|-----------------|-------|
| `cursorSway.ts` | Rotation algorithm + slider conversion | ~30 |
| `cursorLoopTelemetry.ts` | Loop telemetry builder (adapted to QCut format) | ~100 |
| `squircle.ts` | Superellipse geometry (no PixiJS dep) | ~80 |
| `ArrowSvgs.tsx` | 8 arrow SVG path strings + canvas renderer | ~50 |
| `wallpapers.ts` | Filename-to-ID/label utilities | ~30 |
| `types.ts` | GIF export types, size presets, frame rates | ~40 |
| `gifExporter.ts` | Architecture pattern (not code — QCut has different engine) | — |

## Architecture Principles Followed

1. **Browser APIs first** — Audio capture uses `getUserMedia`/`AudioContext`, not native binaries
2. **Extend existing stores** — Speed regions in `screen-recording-store`, new stores follow stickers pattern
3. **Pure math modules** — Sway, loop, squircle, speed calculations are side-effect-free and fully testable
4. **No new dependencies yet** — Only `gif.js` needed (for GIF export engine, not yet added)
5. **Backward compatible** — All changes are additive, existing configs get new optional fields with defaults
