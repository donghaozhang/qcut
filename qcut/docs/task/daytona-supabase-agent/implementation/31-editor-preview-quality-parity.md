# Editor Preview Quality Parity

Date: 2026-07-25

## What changed

Implemented the first Jianying/CapCut-style preview performance slice:

- Added preview quality presets:
  - Original
  - Clear
  - Smooth
  - Low
- Added a preview quality dropdown in the editor preview toolbar.
- Stored the selected preview quality in the playback store.
- Reused the existing Electron FFmpeg preview proxy pipeline for non-original quality modes.
- Proxy files can be prepared ahead of time, but the preview only switches to proxy while playing; paused frames restore the source clip for sharp stills.
- Kept export data untouched: the setting only affects preview playback source selection.
- Added unit and Electron E2E coverage for quality presets, forced proxy generation without visual enhancements, and real video source/proxy switching.

Then added one mask canvas UX slice:

- Replaced the single bottom-right resize point with eight edge/corner handles:
  - top-left, top, top-right, right, bottom-right, bottom, bottom-left, left
- Edge handles resize one axis while keeping the opposite edge visually anchored.
- Corner handles honor locked aspect ratio.
- Rotated masks convert local resize movement back into canvas coordinates.
- Feather is no longer only implied by glow: regular shapes show a feather-range dashed guide, linear masks show paired feather lines, and pen masks show a path-following feather guide.
- Added a real Electron E2E that imports a video, opens Visual / Mask, selects a rectangle mask, and verifies the handles plus feather guide on the preview canvas.

## Implementation Notes

The backend proxy renderer already existed:

- `electron/ffmpeg/video-preview-proxy.ts`
- `electron/video-preview-proxy-handler.ts`
- `apps/web/src/hooks/preview/use-video-enhancement-proxy.ts`

This task connected that backend to an explicit user-facing quality control:

- `apps/web/src/lib/preview/preview-quality.ts`
- `apps/web/src/lib/preview/preview-video-source.ts`
- `apps/web/src/stores/editor/playback-store.ts`
- `apps/web/src/components/editor/preview-panel-components.tsx`
- `apps/web/src/components/editor/preview-panel/preview-element-renderer.tsx`

Mask canvas handle files:

- `apps/web/src/components/editor/preview-panel/media-mask-overlay-utils.ts`
- `apps/web/src/components/editor/preview-panel/media-mask-overlay.tsx`
- `apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay-utils.test.ts`
- `apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay.test.tsx`
- `apps/web/src/test/e2e/media-mask-overlay-handles.e2e.ts`

Non-original preview modes force proxy generation even when no visual enhancement is enabled:

- Clear: max dimension 1280px
- Smooth: max dimension 854px
- Low: max dimension 480px

Original mode keeps the existing source behavior.

Preview source selection:

- Paused: prefer the original source so the still frame stays sharp.
- Playing: use `app://video-preview-proxy/...` when the proxy is ready.
- Playing: fall back to the original source while the proxy is still being prepared.

## Verification

Commands:

```bash
bunx vitest run apps/web/src/hooks/preview/__tests__/use-video-enhancement-proxy.test.tsx apps/web/src/lib/preview/__tests__/preview-quality.test.ts
bun run build:web && bun run build:electron
bunx playwright test apps/web/src/test/e2e/preview-quality-proxy.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/native-video-enhancement-preview.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/media-mask-overlay-handles.e2e.ts --project=electron
```

Result:

- Preview quality Vitest coverage passed.
- `preview-quality-proxy.e2e.ts` passed, confirming a real imported video uses source while paused, proxy while playing, and source again after pause.
- `native-video-enhancement-preview.e2e.ts` passed, confirming real FFmpeg preview frames, text, sticker refresh, and enhanced proxy playback did not regress.
- `media-mask-overlay-handles.e2e.ts` passed, confirming move, rotate, eight resize handles, and feather guide in the real Electron preview canvas.
- `bun run build:web && bun run build:electron` passed.
- Current full `cd apps/web && bunx tsc --noEmit --pretty false` is still blocked by an existing test type issue in `src/lib/audio/__tests__/timeline-beats.test.ts`, where `speedKeyframes.easing` is inferred as `string`; this was not introduced by the preview/mask changes.

Screenshot evidence:

- `output/playwright/preview-quality-proxy/01-paused-source-preview.png`
- `output/playwright/preview-quality-proxy/02-playing-proxy-preview.png`
- `output/playwright/preview-quality-proxy/03-paused-restored-source-preview.png`
- `output/playwright/native-video-enhancement-preview/01-native-composition-ready.png`
- `output/playwright/native-video-enhancement-preview/02-native-composition-refreshed.png`
- `output/playwright/native-video-enhancement-preview/03-native-composition-text.png`
- `output/playwright/native-video-enhancement-preview/04-native-composition-sticker.png`
- `output/playwright/native-video-enhancement-preview/05-enhanced-proxy-playback.png`
- `output/playwright/media-mask-overlay/01-rectangle-mask-eight-handles-feather.png`

The Playwright E2E imports a real `sample-video.mp4`, runs through the Electron path, selects Smooth quality, waits for FFmpeg proxy readiness, and verifies `<video data-video-preview-source>`.

## Still Missing

Preview performance:

- Manual quality presets and play/pause source switching are done.
- Still missing automatic policy, such as temporarily downgrading when the timeline is heavy, source resolution is high, or playback is struggling.
- Still missing proxy cache management UI: cache size, clear cache, and failed proxy retry messaging.
- Frame cache policy still needs to become quality-aware so original and low-resolution frames do not contaminate each other.

Mask parity:

- Current masks already include rectangle, ellipse, linear, mirror, pen, text, star, heart, person, and object.
- Existing controls include position, size, rotation, feather, roundness, expansion, opacity, invert, and tracking entry points.
- Basic canvas handles are now in place: center drag, rotation, and eight edge/corner resize handles.
- Basic feather visualization is now in place for regular shapes, linear masks, and pen masks.
- Still needed: mirror/invert UX polish for direction, range, and boundary preview.
- Still needed: tracking progress UX, reanalysis, and fix-keyframe workflow.

Timeline parity:

- Existing timeline already has selection, split, snapping, ripple-related code paths, and edit modes.
- Still needed: tighten the toolbar around common Jianying-style operations, make linked editing visible, and add more E2E coverage for daily shortcuts.
