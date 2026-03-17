# Plan: Camera Motion Presets — IMPLEMENTED

Add 8 camera motion options to AI video generation, following LTX-Desktop's pattern. Most FAL models accept these as parameters.

> **Status**: Implemented
> **Files created**: `apps/web/src/types/generation.ts` (CAMERA_MOTION_PRESETS)
> **Files modified**: `apps/web/src/stores/timeline/gap-store.ts` (gapCameraMotion state), `apps/web/src/components/editor/timeline/gap-generation-modal.tsx` (dropdown UI), `apps/web/src/hooks/timeline/use-gap-generation.ts` (pass to generation)

**LTX source**: `SettingsPanel.tsx` (lines 208-222)
**Estimated time**: ~8 minutes (1 subtask)

---

## Subtask 1: Add camera motion selector to generation UI (~8 min)

**Camera motion options** (from LTX):

| Value | Label | Effect |
|-------|-------|--------|
| `none` | None | No camera movement |
| `static` | Static | Locked/tripod camera |
| `focus_shift` | Focus Shift | Rack focus between subjects |
| `dolly_in` | Dolly In | Push forward |
| `dolly_out` | Dolly Out | Pull backward |
| `dolly_left` | Dolly Left | Lateral left tracking |
| `dolly_right` | Dolly Right | Lateral right tracking |
| `jib_up` | Jib Up | Crane upward |
| `jib_down` | Jib Down | Crane downward |

**What to copy from LTX** (`SettingsPanel.tsx` lines 208-222):
- `<select>` with 9 `<option>` elements
- Value strings match what FAL/LTX models expect

**Files to modify**:
- `apps/web/src/stores/timeline/gap-store.ts` — add `gapCameraMotion: string` to store state, default `"none"`
- `apps/web/src/components/editor/timeline/gap-generation-modal.tsx` — add camera motion dropdown after model selector:
  ```tsx
  <div className="space-y-1.5">
    <label className="text-xs text-muted-foreground uppercase font-semibold">
      Camera Motion
    </label>
    <select value={cameraMotion} onChange={...} className="...">
      <option value="none">None</option>
      <option value="static">Static</option>
      <option value="dolly_in">Dolly In</option>
      <!-- etc -->
    </select>
  </div>
  ```
- `apps/web/src/hooks/timeline/use-gap-generation.ts` — pass `cameraMotion` in the generation request
- `apps/web/src/types/generation.ts` — add `cameraMotion?: string` to `GenerationParams`

**FAL model support**: LTX 2.3 and WAN 2.6 accept `camera_motion` parameter directly. Other models may ignore it. No harm passing it.

**Test file**: `apps/web/src/stores/__tests__/gap-store.test.ts` (extend existing)
- Test: default camera motion is "none"
- Test: camera motion included in generation params

---

## Reuse Summary

| LTX Code | Lines | Reuse |
|---|---|---|
| Camera motion `<select>` JSX | 12 | Copy verbatim, restyle |
| Motion value constants | 9 | Copy as-is (strings match FAL API) |
| Settings integration | 5 | Adapt to gap store |
| **Total** | **~26 lines** | ~90% direct copy |
