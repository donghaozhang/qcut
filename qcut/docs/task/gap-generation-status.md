# Gap Generation Feature — Current Status

**Date**: 2026-03-17
**Branch**: `record-v2`

---

## What's Done (code written, builds, tests pass)

### Core Infrastructure (fully implemented)
- `apps/web/src/stores/timeline/gap-store.ts` — Gap detection, close gap, segment planning, Zustand store
- `apps/web/src/types/generation.ts` — Shared types: GenerationParams, MediaTake, CAMERA_MOTION_PRESETS, COLOR_LABELS
- `apps/web/src/hooks/timeline/use-gap-generation.ts` — FAL.ai generation orchestrator with chained generation
- `apps/web/src/stores/__tests__/gap-store.test.ts` — 19 unit tests, all passing

### UI Components (built, rendering correctly)
- `apps/web/src/components/editor/timeline/gap-indicator.tsx` — Dashed blue box between clips showing gap duration
- `apps/web/src/components/editor/timeline/gap-popover.tsx` — "Fill with Video / Fill with Image / Close Gap" menu
- `apps/web/src/components/editor/timeline/gap-generation-modal.tsx` — Radix Dialog with frame strip, AI prompt suggestion, model/camera motion selectors

### Gemini IPC (implemented)
- `electron/gemini-chat-handler.ts` — `gemini:suggest-gap-prompt` + `gemini:describe-frame` handlers
- `electron/preload.ts` + `electron/preload-types/api-types/ai-services-api.ts` — Bridge exposed

### Additional LTX Features (implemented)
- **Takes system**: `addTake/deleteTake/setActiveTake` on media store
- **AI context menu**: Regenerate Shot + Take navigation on AI-generated clips
- **Camera motion presets**: 9 options in gap generation modal
- **Color labels**: `colorLabel` on BaseTimelineElement + submenu + visual dot
- **Generation params persistence**: Stored on MediaItem.metadata
- **Auto prompt from frame**: `gemini:describe-frame` IPC handler

### Validation
- TypeScript: 0 new errors
- Tests: 332/332 pass (21 test files)
- Build: `bun run build` succeeds
- Lint: 0 new errors in modified files

---

## What's Broken — Gap Indicator Click Not Working

### Symptom
The gap indicator (dashed blue box with "6.1s" label) **renders correctly** between clips on the timeline. However, **clicking or right-clicking it does nothing** — the popover menu never appears.

### Root Cause (diagnosed)
The `onPointerDown` handler on the timeline tracks area container (`timeline-tracks-area.tsx` line 130) fires **before** the gap indicator's `onClick`/`onContextMenu` handler. This handler starts:
1. `pinchHandlers.onPointerDown` — pinch zoom tracking
2. `handleTimelineMouseDown` — click-to-seek tracking
3. `handleSelectionPointerDown` — lasso selection box

These intercept the pointer and prevent the gap indicator's event from ever firing. Console logging confirmed the gap indicator's `openMenu` handler **never executes**.

### Partial Fix Applied (not yet verified)
Added `[data-gap-indicator]` exclusions to:
- `timeline-tracks-area.tsx` — skip `onPointerDown` handlers for gap clicks
- `hooks/use-timeline-click-handler.ts` — skip seek-on-click for gap targets
- `hooks/timeline/use-selection-box.ts` — skip selection box for gap targets
- `timeline-track.tsx` — skip `clearSelectedElements` for gap targets

### What Still Needs Testing
After the exclusion fix, rebuild and verify:
1. Right-click on gap → popover menu appears with "Fill with Video / Fill with Image / Close Gap"
2. Left-click on gap → same popover
3. Click "Fill with Video" → GapGenerationModal opens with frame strip + prompt
4. Click "Close Gap" → ripple delete closes the gap
5. Normal timeline interactions still work (drag clips, click-to-seek, selection box, right-click clips)

### If Click Still Doesn't Work
The `onPointerDown` may be capturing the pointer via `setPointerCapture`. Check:
1. Whether `pinchHandlers.onPointerDown` calls `e.target.setPointerCapture(e.pointerId)`
2. If so, the capture prevents any child from receiving subsequent events
3. Fix: call `e.target.releasePointerCapture(e.pointerId)` when target is a gap indicator, OR restructure so gap indicators are siblings (not children) of the tracks container

### Alternative Approach If Needed
Instead of relying on DOM click events through the timeline container hierarchy, use a **Radix ContextMenu** directly on the gap indicator (same pattern as timeline elements). This would bypass the pointer capture issue entirely since Radix manages its own event handling.

---

## Files Changed (complete list)

### New Files
| File | Purpose |
|---|---|
| `apps/web/src/stores/timeline/gap-store.ts` | Gap detection, close gap, segment planning, store |
| `apps/web/src/types/generation.ts` | Shared GenerationParams, MediaTake, presets, color labels |
| `apps/web/src/components/editor/timeline/gap-indicator.tsx` | Gap visual indicator on timeline |
| `apps/web/src/components/editor/timeline/gap-popover.tsx` | Gap action menu (Fill/Close) |
| `apps/web/src/components/editor/timeline/gap-generation-modal.tsx` | Full generation modal |
| `apps/web/src/hooks/timeline/use-gap-generation.ts` | Generation orchestrator + chained generation |
| `apps/web/src/stores/__tests__/gap-store.test.ts` | 19 unit tests |

### Modified Files
| File | Change |
|---|---|
| `apps/web/src/components/editor/timeline/timeline-track.tsx` | Gap indicator rendering + useMemo detection |
| `apps/web/src/components/editor/timeline/timeline-tracks-area.tsx` | Skip pointer handlers for gap targets |
| `apps/web/src/components/editor/timeline/timeline-element.tsx` | AI Tools menu + Color Labels + visual dot |
| `apps/web/src/components/editor/timeline/index.tsx` | GapPopover + GapGenerationModal mounted |
| `apps/web/src/hooks/timeline/use-selection-box.ts` | Skip selection for gap targets |
| `apps/web/src/components/editor/timeline/hooks/use-timeline-click-handler.ts` | Skip seek for gap targets |
| `apps/web/src/routes/editor.$project_id.lazy.tsx` | useGapGeneration hook wired |
| `apps/web/src/stores/media/media-store.ts` | addTake/deleteTake/setActiveTake actions |
| `apps/web/src/stores/media/media-store-types.ts` | Take action types |
| `packages/editor-core/src/types/timeline.ts` | colorLabel on BaseTimelineElement |
| `electron/gemini-chat-handler.ts` | suggest-gap-prompt + describe-frame handlers |
| `electron/preload.ts` | suggestGapPrompt + describeFrame bridge |
| `electron/preload-types/api-types/ai-services-api.ts` | describeFrame type |
| `apps/web/src/types/electron/api-gemini-pty-mcp.ts` | suggestGapPrompt + describeFrame types |
| `apps/web/src/test/mocks/electron.ts` | Mock updates |

---

## Plan Docs
All in `docs/task/ltx-gap-generation/`:
- `README.md` — LTX-Desktop gap generation reference
- `qcut-implementation-plan.md` — Main gap generation plan (IMPLEMENTED)
- `ltx-other-learnable-features.md` — 9 other features overview
- `plan-takes-system.md` — IMPLEMENTED
- `plan-ai-context-menu.md` — IMPLEMENTED
- `plan-generation-params-persistence.md` — IMPLEMENTED
- `plan-auto-prompt-from-frame.md` — IMPLEMENTED
- `plan-camera-motion-presets.md` — IMPLEMENTED
- `plan-color-labels.md` — IMPLEMENTED

## Resume Command
```bash
# Rebuild and test after fixing the click issue:
bun run build && pkill -f Electron; sleep 2; QCUT_API_TOKEN=debug123 bun run electron &
# Then right-click on the gap between clips to verify popover appears
```
