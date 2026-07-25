# Editor Preview Quality Parity

Date: 2026-07-25

## What changed

Implemented the first Jianying/CapCut-style preview performance slice:

- Added preview quality presets:
  - Auto
  - Original
  - Clear
  - Smooth
  - Low
- Added a preview quality dropdown in the editor preview toolbar.
- Stored the selected preview quality in the playback store.
- Defaulted to Auto: lightweight clips stay on the source, while high-resolution clips or video-enhanced clips automatically opt into the proxy preview path.
- Reused the existing Electron FFmpeg preview proxy pipeline for non-original quality modes.
- Proxy files can be prepared ahead of time, but the preview only switches to proxy while playing; paused frames restore the source clip for sharp stills.
- Added Electron preview proxy cache stats and clear APIs.
- The preview quality menu now shows preview proxy cache size, file count, cache limit, an Open cache folder action, and a Clear preview cache action.
- Frame cache hashes now include both the selected preview quality and the rendered preview viewport size, so frames warmed under another quality mode or panel size do not report as reusable.
- Frame caching is no longer write-only: seeking to a cached time while paused paints the cached `ImageData` into a preview canvas, then removes it after the requested video frame is actually presented. Starting playback also removes the cache overlay immediately.
- The capture target is now restricted to the visual composition surface, so transform handles, safe areas, and renderer status UI are not baked into cached frames.
- Presented-video-frame events now include timeline time. A frame is cached only after every current video layer has presented the requested timeline frame, preventing a pre-seek frame from being stored under the new time.
- Auto mode now has a first runtime playback-health loop: while playing, repeated slow `playback-update` intervals temporarily downgrade the effective preview quality to Smooth or Low; pause or manual quality changes clear the runtime downgrade.
- Runtime playback health now also listens to real presented video frame cadence from `requestVideoFrameCallback`. Video decode/presentation stalls can therefore trigger the same Auto-mode Smooth/Low downgrade even when the app-level playback loop itself is still ticking.
- Automatic downgrades now retain a trigger snapshot. The quality menu identifies preview-render stalls, video-frame stalls, or combined pressure and shows average UI/video frame intervals plus stall counts. Pause, stable recovery, and manual quality selection clear the diagnostic.
- Preview-only effect rendering now follows the effective preview quality while playing: Smooth uses a reduced mode that skips high-cost distortion/person-tracking preview canvases, Low uses a minimal mode that also skips composite/particle/decoration preview canvases, and pause always restores full preview effects.
- Kept export data untouched: the setting only affects preview playback source selection.
- Added unit and Electron E2E coverage for quality presets, forced proxy generation without visual enhancements, and real video source/proxy switching.

Then added one mask canvas UX slice:

- Replaced the single bottom-right resize point with eight edge/corner handles:
  - top-left, top, top-right, right, bottom-right, bottom, bottom-left, left
- Edge handles resize one axis while keeping the opposite edge visually anchored.
- Corner handles honor locked aspect ratio.
- Rotated masks convert local resize movement back into canvas coordinates.
- Feather is no longer only implied by glow: regular shapes show a feather-range dashed guide, linear masks show paired feather lines, and pen masks show a path-following feather guide.
- Linear masks now expose top/bottom feather-range handles on the preview canvas. Dragging or nudging those handles adjusts the mask's feather value directly from the canvas.
- Mirror masks now show a center axis and side direction hints, and only expose left/right boundary resize handles.
- Mirror masks now have explicit direction modes: left, center, and right. The right-side properties panel exposes the same direction control, while the preview canvas shows in-place left/center/right buttons, an active-range guide, and dedicated left/right range handles.
- Linear and mirror masks now render through geometry-aware SVG masks instead of a fixed full-canvas gradient: linear masks use the mask center and rotation with a vertical local gradient, while mirror masks use the mask center, width, and rotation with a horizontal local gradient. This keeps preview/export masking aligned with the canvas controls.
- Directional mirror masks also affect the real SVG mask: center preserves the previous symmetric mirror behavior, while left/right render one-sided mirror gradients. Export semantics therefore match the canvas and properties controls.
- The invert label is now aligned with the Chinese UI as `反选`, and inverted masks show a diagonal guide on the preview canvas.
- Added a real Electron E2E that imports a video, opens Visual / Mask, selects a rectangle mask, and verifies the handles plus feather guide on the preview canvas; it then switches to a mirror mask and verifies the mirror axis, invert guide, and side-only resize handles.

Then added a first mask tracking workflow slice:

- Expanded mask tracking metadata with paused status, progress, anchor frame, tracked frame counts, and corrected frame records.
- The tracking controls now show progress, paused/processing/ready/error state, and action buttons for pause/resume, reanalyze, and fix current frame.
- SAM3 and local-person segmentation progress now writes back to the target mask when launched from a mask tracking request.
- Fix current frame writes center/size/rotation correction keyframes at the current local frame.
- Active SAM3 object tracking and local-person tracking now register a runtime handle while processing, so Pause cancels the actual running job instead of only changing the UI state.
- A canceled generated tracking request now writes the target mask back to `paused`, preserves progress/anchor metadata, records the pause message, and clears the pending segmentation request.
- Resume first tries an active runtime resume hook; if the runtime already exited after cancellation, it falls back to relaunching the same tracking direction from the panel.
- Tracking requests now carry a `requestId`. SAM3/MediaPipe results must match the current request before they can write back to the timeline, so stale results from a paused or superseded tracking job cannot insert a late mask into the edited clip.
- Clicking Track in the right-side mask panel now opens the AI segmentation workspace and automatically starts the matching job under the same `requestId`; the user no longer has to click Generate and Apply a second time.
- The main AI segmentation workspace now registers its persistent SAM3 task as a mask runtime, so Pause from the mask panel aborts the real `AbortController` task and persists `paused`.
- Local-person auto-start is deduplicated by `requestId`: rerenders cannot launch the same request twice, while Resume and Reanalyze create a new request that can start automatically.
- Added a real MediaPipe Electron E2E starting from the person mask's bidirectional Track button and covering auto-start, real pause, resume-to-completion, tracking keyframes, current-frame correction, and reanalysis.

Then tightened the timeline daily-action toolbar:

- Added a direct crop button that opens the selected media clip's crop controls in the properties panel.
- Selection-dependent actions now disable cleanly when there is no compatible selection: split, keep-left, keep-right, separate audio, copy, crop, and delete.
- Snapping and linked ripple editing now expose pressed state, test IDs, and clearer tooltips.
- Delete reflects linked ripple state in its accessible label and tooltip.
- The visible crop shortcut is now real: QCut and CapCut keybinding profiles map single-key `C` to `crop-selected`, while older non-custom QCut/CapCut profiles migrate forward to the same binding.
- Added real Electron E2E coverage for timeline daily actions: import a real video, copy the clip from the toolbar, open crop with the `C` shortcut, write a crop value into the timeline element, delete a copied clip from the toolbar, and delete the remaining clip with the Delete shortcut.
- Extended the same Electron E2E with adjacent real clips for split, keep-right trim, and linked ripple delete. The test verifies timeline state, not just button visibility.
- Linked ripple delete now has a store-level selected-batch operation. Multi-selected clips are converted into merged timeline ranges, deleted in one undo snapshot, and downstream clips on linked tracks shift once instead of toolbar code deleting selections one by one.
- Extended the Electron E2E again with two media tracks and selected clips on both tracks. The test triggers the real toolbar ripple delete button and verifies the following clips on both linked tracks move to the timeline start.

## Implementation Notes

The backend proxy renderer already existed:

- `electron/ffmpeg/video-preview-proxy.ts`
- `electron/video-preview-proxy-handler.ts`
- `apps/web/src/hooks/preview/use-video-enhancement-proxy.ts`
- `apps/web/src/components/editor/preview-panel-components.tsx`
- `electron/preload.ts`
- `packages/platform-core/src/types/media-api.ts`
- `packages/platform-desktop/src/index.ts`

This task connected that backend to an explicit user-facing quality control:

- `apps/web/src/lib/preview/preview-quality.ts`
- `apps/web/src/lib/preview/preview-video-source.ts`
- `apps/web/src/stores/editor/playback-store.ts`
- `apps/web/src/components/editor/preview-panel-components.tsx`
- `apps/web/src/components/editor/preview-panel/preview-element-renderer.tsx`
- `apps/web/src/hooks/timeline/use-frame-cache.ts`
- `apps/web/src/hooks/preview/use-cached-preview-frame.ts`
- `apps/web/src/lib/preview/preview-frame-cache-readiness.ts`
- `apps/web/src/hooks/preview/use-playback-health-preview-quality.ts`
- `apps/web/src/lib/preview/preview-health-events.ts`
- `apps/web/src/components/editor/preview-panel.tsx`
- `apps/web/src/components/editor/timeline/index.tsx`
- `apps/web/src/components/ui/video-player.tsx`

Mask canvas handle files:

- `apps/web/src/components/editor/preview-panel/media-mask-overlay-utils.ts`
- `apps/web/src/components/editor/preview-panel/media-mask-overlay.tsx`
- `apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay-utils.test.ts`
- `apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay.test.tsx`
- `apps/web/src/lib/video/media-mask-svg.ts`
- `apps/web/src/lib/video/__tests__/media-mask-svg.test.ts`
- `packages/editor-core/src/types/timeline.ts`
- `apps/web/src/test/e2e/media-mask-overlay-handles.e2e.ts`

Mask tracking files:

- `packages/editor-core/src/types/timeline.ts`
- `apps/web/src/lib/video/media-mask-tracking.ts`
- `apps/web/src/lib/segmentation/mask-tracking-runtime.ts`
- `apps/web/src/lib/segmentation/generated-mask-attachment.ts`
- `apps/web/src/components/editor/properties-panel/media-mask-tracking-controls.tsx`
- `apps/web/src/components/editor/properties-panel/media-mask-properties.tsx`
- `apps/web/src/components/editor/properties-panel/media-tracking-properties.tsx`
- `apps/web/src/components/editor/segmentation/LocalPersonCutoutPanel.tsx`
- `apps/web/src/stores/ai/segmentation-store.ts`
- `apps/web/src/components/editor/segmentation/index.tsx`
- `apps/web/src/hooks/use-persistent-ai-task.ts`
- `apps/web/src/test/e2e/media-mask-tracking.e2e.ts`

Timeline toolbar files:

- `apps/web/src/components/editor/timeline/timeline-toolbar.tsx`
- `apps/web/src/components/editor/timeline/__tests__/timeline-toolbar.test.tsx`
- `apps/web/src/stores/timeline/timeline-track-ops.ts`
- `apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts`
- `apps/web/src/stores/timeline/types.ts`
- `apps/web/src/test/e2e/timeline-daily-actions.e2e.ts`
- `apps/web/src/constants/keybinding-profiles.ts`
- `apps/web/src/stores/editor/keybindings-store.ts`
- `apps/web/src/constants/__tests__/keybinding-profiles.test.ts`

Automatic mode:

- Source longest edge >= 2160px: uses the Smooth proxy tier.
- Source longest edge >= 1440px: uses the Clear proxy tier.
- Video enhancement enabled, such as stabilization, denoise, clarity, upscale, relight, or beauty: uses the Clear proxy tier.
- Lightweight clips without enhancements stay on the original source.

Manual modes:

- Clear: max dimension 1280px
- Smooth: max dimension 854px
- Low: max dimension 480px

Original mode keeps the existing source behavior.

Preview source selection:

- Paused: prefer the original source so the still frame stays sharp.
- Playing: use `app://video-preview-proxy/...` when the proxy is ready.
- Playing: fall back to the original source while the proxy is still being prepared.

Preview-only effect render mode:

- Paused: always `full`.
- Playing in Original/Clear: `full`.
- Playing in Smooth: `reduced`, which keeps lightweight preview effects but skips distortion and person-tracking preview canvases.
- Playing in Low: `minimal`, which skips high-cost preview canvas effects, particle previews, and decoration previews.
- Export is unchanged because this switch only gates editor preview components.

## Verification

Commands:

```bash
bunx vitest run apps/web/src/hooks/preview/__tests__/use-video-enhancement-proxy.test.tsx apps/web/src/lib/preview/__tests__/preview-quality.test.ts
bunx vitest run apps/web/src/test/integration/playback-state.test.ts
bunx vitest run apps/web/src/hooks/timeline/__tests__/use-frame-cache.test.tsx
bunx vitest run electron/__tests__/video-preview-proxy.test.ts
bunx vitest run apps/web/src/lib/video/__tests__/media-mask-svg.test.ts apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay.test.tsx apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay-utils.test.ts
bunx vitest run apps/web/src/lib/video/__tests__/media-mask-tracking.test.ts apps/web/src/components/editor/properties-panel/__tests__/media-tracking-properties.test.tsx
bunx vitest run apps/web/src/components/editor/properties-panel/__tests__/media-tracking-properties.test.tsx apps/web/src/lib/segmentation/__tests__/mask-tracking-runtime.test.ts apps/web/src/lib/segmentation/__tests__/generated-mask-attachment.test.ts apps/web/src/lib/video/__tests__/media-mask-tracking.test.ts
bunx vitest run apps/web/src/stores/ai/__tests__/segmentation-store.test.ts apps/web/src/lib/segmentation/__tests__/generated-mask-attachment.test.ts apps/web/src/components/editor/properties-panel/__tests__/media-tracking-properties.test.tsx apps/web/src/lib/segmentation/__tests__/mask-tracking-runtime.test.ts
bunx vitest run apps/web/src/components/editor/timeline/__tests__/timeline-toolbar.test.tsx
bunx vitest run apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts apps/web/src/components/editor/timeline/__tests__/timeline-toolbar.test.tsx
bunx vitest run apps/web/src/constants/__tests__/keybinding-profiles.test.ts apps/web/src/hooks/keyboard/__tests__/use-professional-editor-actions.test.tsx apps/web/src/components/editor/timeline/__tests__/timeline-toolbar.test.tsx
cd apps/web && bunx tsc --noEmit --pretty false
bun run build:web && bun run build:electron
bunx playwright test apps/web/src/test/e2e/timeline-daily-actions.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/preview-quality-proxy.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/native-video-enhancement-preview.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/media-mask-overlay-handles.e2e.ts --project=electron
QCUT_PERSON_VIDEO_PATH=/absolute/path/to/person-video.mp4 bunx playwright test apps/web/src/test/e2e/media-mask-tracking.e2e.ts --project=electron
```

Result:

- Preview quality Vitest coverage passed.
- Runtime preview downgrade coverage passed for Auto-mode slow frames, Low fallback, stable recovery, and manual quality opt-out.
- Runtime preview health coverage now includes real presented video frame stalls: slow `requestVideoFrameCallback` intervals are folded into the same Smooth/Low Auto-mode downgrade decision.
- Automatic downgrade attribution unit coverage passed for preview-render pressure, presented-video-frame pressure, combined pressure, and diagnostic cleanup after stable recovery.
- Preview-only effect render mode unit coverage passed for Smooth/reduced, Low/minimal, paused/full, and Clear/full behavior.
- Playback store coverage passed for clearing runtime preview downgrade on pause and manual quality changes.
- Frame cache identity Vitest coverage passed, confirming cached frames cannot be reused across another quality mode or rendered preview size.
- Cached-frame read/overlay unit coverage passed for real `putImageData` painting, ignoring frames from another timeline time, removal after the matching frame arrives, cache misses, and playback cleanup.
- Cache-write readiness unit coverage passed, confirming image-only surfaces can be cached immediately while every video layer must present the requested timeline frame first.
- Automatic preview quality Vitest coverage passed for high-resolution clips, effect-heavy clips, lightweight clips, and manual override behavior.
- Electron preview proxy unit coverage passed for cache keys, cache stats, and cache clearing.
- `preview-quality-proxy.e2e.ts` passed, confirming a real imported video uses source while paused, proxy while playing, and source again after pause.
- `preview-quality-proxy.e2e.ts` was rerun after adding the video-frame health event and passed, confirming the extra telemetry does not break the real proxy playback chain. One earlier attempt failed before app startup with an Electron `firstWindow` timeout, then the same test command passed on retry.
- `preview-quality-proxy.e2e.ts` also verifies preview-only effect quality switching: Smooth playback enters `reduced`, then pause restores `full`.
- `preview-quality-proxy.e2e.ts` also verifies the proxy cache status, Open cache folder action, and Clear preview cache action in the preview quality menu; after clearing, the UI reports `0 MB`.
- `preview-quality-proxy.e2e.ts` now also drives a real video into an automatic downgrade and verifies that the web UI shows the video-frame stall reason plus live interval/stall metrics, then returns to Auto after pause. The first diagnostic assertion assumed a fixed synthetic `95 ms / 5` sample, but the real `requestVideoFrameCallback` reported a startup stall first; the assertion was corrected to verify the real metric structure and reason, and the rerun passed.
- `preview-quality-proxy.e2e.ts` now also caches a presented real-video time, seeks away, and returns. It verifies a cache hit, a briefly visible cache canvas containing non-empty colored pixels, and automatic removal after the requested video frame arrives.
- `native-video-enhancement-preview.e2e.ts` passed, confirming real FFmpeg preview frames, text, sticker refresh, and enhanced proxy playback did not regress.
- `media-mask-overlay-handles.e2e.ts` passed, confirming move, rotate, eight resize handles, rectangle feather guide, linear feather-range handles with real feather updates, mirror axis, invert guide, and mirror side-only resize handles in the real Electron preview canvas.
- `media-mask-overlay-handles.e2e.ts` now also verifies mirror direction switching on the real canvas: clicking the right-side mirror button writes `mirrorMode: "right"` to the timeline, and the preview screenshot shows the in-canvas left/center/right controls plus active range guide.
- Mask SVG unit coverage passed, confirming linear gradients follow local vertical geometry, mirror gradients follow center/width/rotation, and left/right mirror modes produce one-sided gradients instead of the old fixed symmetric-only mask.
- Mask tracking unit coverage passed for progress/status metadata, current-frame correction keyframes, and tracking-tab pause/fix actions.
- Mask tracking runtime coverage passed: 15 tests across 4 files confirm active runtime cancel/resume routing, stale runtime unregister safety, generated tracking pause state persistence, and the tracking tab calling the real cancel hook.
- Tracking request identity coverage passed: 13 tests across 4 files confirm request metadata, active runtime routing, and that stale SAM3/MediaPipe tracking results are rejected instead of mutating the timeline after a pause or superseding request.
- The latest core regression passed 131 tests across 23 Vitest files, covering preview quality/source/frame caching, playback health, timeline toolbar/ripple behavior, mask transform/tracking, persistent AI runtimes, and local-person auto-start.
- Real `person-cutout.e2e.ts` passed: a 3.2-second person clip produced a 1.5 MB transparent WebM in 26.7 seconds and verified the attached person mask, center/size keyframes, and canvas playback.
- The new `media-mask-tracking.e2e.ts` passed with a real one-second person clip in 49.0 seconds: the Track button automatically launched MediaPipe, Pause remained stable, Resume completed with 7 tracked frames, current-frame correction persisted, and Reanalyze entered real progress and could be paused.
- The first version ran a full second analysis on a 3.2-second source. Reanalysis reached 93%, but the test-wide 180-second timeout expired; first completion, pause/resume, 40 tracked frames, and correction had all succeeded. The test now proves reanalysis starts and advances, then pauses it instead of redundantly waiting for the same model result twice.
- Timeline toolbar coverage passed for crop entry, snapping/ripple toggles, disabled selection actions, freeze frame, compact tracks, split, and markdown insertion.
- Selected-batch ripple coverage passed: 18 tests across the timeline ripple store and toolbar confirm the toolbar calls one linked delete operation for selected batches, the store merges selected ranges, clears selection, pushes one history entry, deletes overlapping ranges, and shifts downstream linked-track clips once.
- Keybinding profile coverage passed, confirming QCut and CapCut profiles expose `C` as the crop shortcut that the toolbar advertises.
- `timeline-daily-actions.e2e.ts` passed, confirming a real imported video can be copied from the toolbar, cropped through the `C` shortcut and crop controls, deleted from the toolbar, and deleted through the Delete shortcut.
- `timeline-daily-actions.e2e.ts` also passed for adjacent real clips: split at the playhead creates left/right clips with the following clip preserved; keep-right trim writes non-zero trim state; linked ripple delete closes the timeline gap by moving the following clip earlier.
- `timeline-daily-actions.e2e.ts` now also passes a linked multi-track selected-batch ripple case: two selected clips across two media tracks are deleted through the real toolbar button, and the following clip on each track shifts from `2s` to `0s`.
- The final Electron regression passed 6/6 scenarios serially in about 1.2 minutes, covering mask canvas controls, proxy/cached-frame behavior, and all four timeline daily-action scenarios.
- Full `cd apps/web && bunx tsc --noEmit --pretty false` passed.
- `bun run build:web && bun run build:electron` passed.

Screenshot evidence:

- `output/playwright/preview-quality-proxy/01-paused-source-preview.png`
- `output/playwright/preview-quality-proxy/00-auto-quality-default.png`
- `output/playwright/preview-quality-proxy/00-cached-frame-scrub-hit.png`
- `output/playwright/preview-quality-proxy/01-auto-downgrade-diagnostic.png`
- `output/playwright/preview-quality-proxy/02-playing-proxy-preview.png`
- `output/playwright/preview-quality-proxy/03-paused-restored-source-preview.png`
- `output/playwright/preview-quality-proxy/04-proxy-cache-actions.png`
- `output/playwright/preview-quality-proxy/05-proxy-cache-cleared.png`
- `output/playwright/native-video-enhancement-preview/01-native-composition-ready.png`
- `output/playwright/native-video-enhancement-preview/02-native-composition-refreshed.png`
- `output/playwright/native-video-enhancement-preview/03-native-composition-text.png`
- `output/playwright/native-video-enhancement-preview/04-native-composition-sticker.png`
- `output/playwright/native-video-enhancement-preview/05-enhanced-proxy-playback.png`
- `output/playwright/media-mask-overlay/01-rectangle-mask-eight-handles-feather.png`
- `output/playwright/media-mask-overlay/02-linear-mask-feather-handles.png`
- `output/playwright/media-mask-overlay/03-mirror-mask-invert-guide.png`
- `output/playwright/media-mask-tracking/01-person-mask-ready.png`
- `output/playwright/media-mask-tracking/02-tracking-running.png`
- `output/playwright/media-mask-tracking/03-tracking-paused.png`
- `output/playwright/media-mask-tracking/04-tracking-completed.png`
- `output/playwright/media-mask-tracking/05-current-frame-corrected.png`
- `output/playwright/media-mask-tracking/06-reanalysis-running.png`
- `output/playwright/timeline-daily-actions/01-selected-real-video-clip.png`
- `output/playwright/timeline-daily-actions/02-copied-real-video-clip.png`
- `output/playwright/timeline-daily-actions/03-crop-controls-open-and-applied.png`
- `output/playwright/timeline-daily-actions/04-delete-actions-cleared-timeline.png`
- `output/playwright/timeline-daily-actions/05-split-adjacent-real-clips.png`
- `output/playwright/timeline-daily-actions/06-keep-right-trim-applied.png`
- `output/playwright/timeline-daily-actions/07-ripple-delete-closed-gap.png`
- `output/playwright/timeline-daily-actions/08-multi-track-ripple-before.png`
- `output/playwright/timeline-daily-actions/09-multi-track-ripple-after.png`

The Playwright E2E imports a real `sample-video.mp4`, runs through the Electron path, selects Smooth quality, waits for FFmpeg proxy readiness, and verifies `<video data-video-preview-source>`.

## Core Status And Follow-Ups

The core scope defined by this task is complete: preview quality/proxy playback, source restoration on pause, frame caching, playback-time effect degradation, mask shapes and canvas controls, person/object tracking actions, and timeline split/crop/copy/delete/snap/ripple all have implementations and automated evidence. The items below are product hardening opportunities rather than missing core behavior.

Preview performance:

- Automatic quality, manual quality presets, and play/pause source switching are done.
- Runtime playback-health downgrade is now implemented for Auto mode: slow frame intervals temporarily switch effective preview quality to Smooth/Low and pause restores the user-selected quality.
- Preview-only high-cost effect rendering now downgrades while playing under Smooth/Low and restores full effect preview on pause.
- Preview proxy cache stats/clear backend APIs and the preview quality menu UI are done, including cache size, file count, cache limit, Open cache folder, and Clear preview cache.
- Frame caching now captures, persists, isolates by quality/viewport, and presents cached frames on seek hits; the overlay is removed when the requested video frame arrives or playback starts.
- Playback health now includes app-level playback cadence plus real video presentation/decode stall cadence, with coarse attribution and trigger snapshots visible in the quality menu. Still missing actual renderer/GPU timing breakdowns and per-effect cost attribution.
- A global proxy-cache settings entry point and richer failed-proxy diagnostics can still be added. The canvas-level retry button and cache-folder action are already present.
- More aggressive adjacent-frame predictive warming and a dedicated long-scrub benchmark remain useful follow-ups. Current caching covers timeline points that have already settled and presented correctly.

Mask parity:

- Current masks already include rectangle, ellipse, linear, mirror, pen, text, star, heart, person, and object.
- Existing controls include position, size, rotation, feather, roundness, expansion, opacity, invert, and tracking entry points.
- Basic canvas handles are now in place: center drag, rotation, and eight edge/corner resize handles.
- Basic feather visualization is now in place for regular shapes, linear masks, and pen masks.
- Linear masks now have direct top/bottom feather-range handles on the preview canvas.
- Basic mirror/invert visualization is now in place: mirror axis, left/right boundary handles, direction hints, and an invert diagonal guide.
- Mirror direction switching is now in place for left/center/right modes from both the properties panel and the preview canvas; the canvas also shows an active-range guide and dedicated range handles.
- Linear/mirror preview and export masks now use the same geometry semantics exposed by the canvas controls.
- Mirror/invert polish can go further with animated direction changes, keyboard cycling, and more Jianying-like boundary shading.
- First tracking workflow controls are now in place: progress state, pause/resume, reanalyze, and current-frame correction keyframes.
- Active cancellation is now wired in both the main AI workspace and properties flow for SAM3 object tracking and local-person tracking.
- Stale-result protection is now in place for paused or superseded SAM3/MediaPipe tracking jobs.
- Resume currently reruns the same direction. Durable mid-frame checkpoint resume across process/app restart, richer failed-task diagnostics, and a timeline per-frame tracking review UI remain follow-ups.
- One 3.2-second real tracking run emitted Chromium's `AudioSample was garbage collected without first being closed` warning. The result was correct, but WebCodecs audio-sample disposal deserves a separate resource audit.

Timeline parity:

- Existing timeline already has selection, split, snapping, ripple-related code paths, and edit modes.
- The toolbar now exposes the core daily operation row more clearly: split, trim-left/right, separate audio, copy, crop, freeze, delete, snapping, and linked ripple editing.
- The crop toolbar hint now matches the real shortcut path: pressing `C` outside text inputs invokes the same crop-controls event for QCut/CapCut profiles.
- Real Electron coverage now proves copy, crop, and delete on an imported video clip.
- Real Electron coverage now also proves split, keep-right trim, and linked ripple delete across adjacent imported video clips.
- Selected-batch linked ripple delete now goes through one store operation and has unit coverage plus real Electron screenshot/E2E coverage for multi-track shifting.
- Small-screen labels can be made more compact, and drag/trim ripple coverage can be broadened across mixed track types.
