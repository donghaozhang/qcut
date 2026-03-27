# Recordly Feature Parity — Implementation Overview

Reference: [QCut vs Recordly comparison](../recordly-feature-comparison.md)
Source: [github.com/webadderall/Recordly](https://github.com/webadderall/Recordly) (AGPL 3.0)

## Implementation Order

Each feature has its own plan file. Ordered by priority and dependency chain.

| # | Feature | Plan | Est. | Priority |
|---|---------|------|------|----------|
| 1 | [Microphone + System Audio](./01-audio-capture.md) | Capture mic/system audio during recording | Large | P0 |
| 2 | [GIF Export](./02-gif-export.md) | Export timeline as animated GIF | Medium | P0 |
| 3 | [Webcam Overlay](./03-webcam-overlay.md) | Picture-in-picture webcam bubble | Large | P0 |
| 4 | [Speed Regions](./04-speed-regions.md) | Per-region speed ramps on timeline | Medium | P1 |
| 5 | [Custom Background Upload](./05-custom-backgrounds.md) | Upload custom wallpaper images | Small | P1 |
| 6 | [Cursor Sway](./06-cursor-sway.md) | Natural wobble during cursor movement | Small | P2 |
| 7 | [Cursor Loop Mode](./07-cursor-loop.md) | Smooth cursor return for looping exports | Small | P2 |
| 8 | [Figure Annotations](./08-figure-annotations.md) | Arrow, circle, rectangle drawing tools | Medium | P2 |

## Reuse Strategy

Recordly is Electron + React + TypeScript + PixiJS — same stack as QCut. Key reusable patterns:

| Recordly Pattern | QCut Equivalent | Reuse Approach |
|-----------------|-----------------|----------------|
| `squircle.ts` geometry | — | Port directly (pure math) |
| `cursorSway.ts` algorithm | `motion-smoothing.ts` | Port algorithm, integrate into existing spring physics |
| `cursorLoopTelemetry.ts` | `auto-zoom-analyzer.ts` | Port algorithm, adapt to QCut telemetry format |
| `gifExporter.ts` pipeline | `export-engine.ts` | Add GIF as new export format, reuse frame renderer |
| `SpeedRegion` data model | `BaseTimelineElement` | New element type on timeline |
| `webcamOverlay.ts` positioning | `stickers-overlay-store.ts` | Clone store pattern, add webcam-specific fields |
| WASAPI loopback capture | — | Too platform-specific; use browser `getUserMedia` + Electron first |
| ScreenCaptureKit audio | — | Future native backend; start with browser API fallback |

## Architecture Principles

1. **Browser APIs first, native later** — Use `getUserMedia`/`getDisplayMedia` audio before investing in native Swift/C++ backends
2. **Extend existing stores** — Follow Zustand patterns from `stickers-overlay-store.ts` and `export-store.ts`
3. **Export engine integration** — All visual features must render in both preview and export via `export-engine-renderer.ts`
4. **IPC boundary** — File operations and native APIs go through Electron IPC handlers; renderer stays pure
