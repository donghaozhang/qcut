# Veo 3.1 Lite Integration (T2V + I2V + F2V)

**Branch**: `wan27`
**Date**: 2026-04-02
**Estimated effort**: ~35 minutes (4 subtasks)

## Overview

Add Veo 3.1 Lite — Google's budget tier for Veo 3.1. Three new FAL.ai endpoints that mirror the existing Fast/Standard pattern:

| Model | Endpoint | Type |
|-------|----------|------|
| Veo 3.1 Lite T2V | `fal-ai/veo3.1/lite` | Text-to-Video |
| Veo 3.1 Lite I2V | `fal-ai/veo3.1/lite/image-to-video` | Image-to-Video |
| Veo 3.1 Lite F2V | `fal-ai/veo3.1/lite/first-last-frame-to-video` | Frame-to-Video |

### Pricing Comparison (per second)

| Tier | 720p | 1080p | 8s total (720p) |
|------|------|-------|------------------|
| **Lite** | $0.05/s | $0.08/s | $0.40 |
| **Fast** | ~$0.15/s | ~$0.15/s | $1.20 |
| **Standard** | ~$0.40/s | ~$0.40/s | $3.20 |

Lite is **3x cheaper than Fast** and **8x cheaper than Standard**.

## API Specification

### Shared Parameters (all 3 endpoints)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Text prompt (max 20,000 chars) |
| `resolution` | enum | No | `"720p"` | `720p`, `1080p` |
| `negative_prompt` | string | No | - | Guidance against unwanted content |
| `seed` | integer | No | - | Reproducibility seed |
| `auto_fix` | boolean | No | varies | Auto-rewrite prompts failing validation |

### T2V-specific

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `aspect_ratio` | enum | `"16:9"` | `16:9`, `9:16` (no `1:1`) |
| `duration` | enum | `"8s"` | `4s`, `6s`, `8s` |
| `auto_fix` | default | `true` | |

### I2V-specific

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `image_url` | string (required) | - | Input image URL |
| `aspect_ratio` | enum | `"auto"` | `auto`, `16:9`, `9:16` |
| `duration` | enum | `"8s"` | `4s`, `6s`, `8s` |
| `auto_fix` | default | `false` | |

### F2V-specific

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `first_frame_url` | string (required) | - | Starting frame |
| `last_frame_url` | string (required) | - | Ending frame |
| `aspect_ratio` | enum | `"auto"` | `auto`, `16:9`, `9:16` |
| `auto_fix` | default | `false` | |

### Output (all 3)

```json
{ "video": { "url": "string", "content_type": "video/mp4", "file_name": "string", "file_size": 0 } }
```

### Key Differences from Fast/Standard
- **No `generate_audio` param** — audio is always generated (mandatory)
- **No `1:1` aspect ratio** — only `16:9`, `9:16` (and `auto` for I2V/F2V)
- **No `enhance_prompt`** — not exposed for Lite
- **Per-second pricing** — vs flat per-video pricing on Fast/Standard
- **F2V has no `duration` param** — fixed at 8s

---

## Subtask 1: Add Model Configs

**~5 min** | Files to modify:

### 1a. T2V Config — `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`

Add `veo31_lite_text_to_video`:

```typescript
veo31_lite_text_to_video: {
  id: "veo31_lite_text_to_video",
  name: "Veo 3.1 Lite Text-to-Video",
  description: "Google's Veo 3.1 Lite — budget text-to-video with audio (4-8s)",
  price: "0.05-0.08/s",
  resolution: "720p / 1080p",
  supportedResolutions: ["720p", "1080p"],
  max_duration: 8,
  category: "text",
  endpoints: { text_to_video: "fal-ai/veo3.1/lite" },
  default_params: {
    duration: 8,
    resolution: "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
    auto_fix: true,
  },
  perSecondPricing: { "720p": 0.05, "1080p": 0.08 },
}
```

Add to `T2V_MODEL_ORDER`.

### 1b. I2V Config — `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`

Add `veo31_lite_image_to_video` and `veo31_lite_frame_to_video`:

```typescript
veo31_lite_image_to_video: {
  id: "veo31_lite_image_to_video",
  name: "Veo 3.1 Lite Image-to-Video",
  description: "Google's Veo 3.1 Lite — budget image animation with audio",
  price: "0.05-0.08/s",
  resolution: "720p / 1080p",
  supportedResolutions: ["720p", "1080p"],
  max_duration: 8,
  category: "image",
  endpoints: { image_to_video: "fal-ai/veo3.1/lite/image-to-video" },
  default_params: {
    duration: 8,
    resolution: "720p",
    aspect_ratio: "auto",
    generate_audio: true,
  },
  perSecondPricing: { "720p": 0.05, "1080p": 0.08 },
}

veo31_lite_frame_to_video: {
  id: "veo31_lite_frame_to_video",
  name: "Veo 3.1 Lite Frame-to-Video",
  description: "Google's Veo 3.1 Lite — budget first+last frame animation",
  price: "0.05-0.08/s",
  resolution: "720p / 1080p",
  supportedResolutions: ["720p", "1080p"],
  max_duration: 8,
  category: "image",
  requiredInputs: ["firstFrame", "lastFrame"],
  endpoints: { image_to_video: "fal-ai/veo3.1/lite/first-last-frame-to-video" },
  default_params: {
    duration: 8,
    resolution: "720p",
    aspect_ratio: "auto",
    generate_audio: true,
  },
  perSecondPricing: { "720p": 0.05, "1080p": 0.08 },
}
```

Add both to `I2V_MODEL_ORDER`.

---

## Subtask 2: Add Generator Functions

**~10 min** | File to modify:

### `apps/web/src/lib/ai-clients/fal-ai-client-veo31.ts`

Add 3 new functions following the existing Fast/Standard pattern:

```typescript
export async function veo31LiteTextToVideo(delegate, params): Promise<VideoGenerationResponse>
export async function veo31LiteImageToVideo(delegate, params): Promise<VideoGenerationResponse>
export async function veo31LiteFrameToVideo(delegate, params): Promise<VideoGenerationResponse>
```

Key differences from Fast variants:
- Endpoints use `fal-ai/veo3.1/lite*` prefix
- No `enhance_prompt` parameter
- Audio is always generated (no `generate_audio` toggle needed, always true)
- Job IDs: `veo31_lite_*`
- Log prefixes: `VEO31_LITE_*`

Also register in:
- `apps/web/src/lib/ai-clients/fal-ai-client.ts` — add 3 public methods
- No separate request types needed — reuse existing `Veo31TextToVideoInput`, `Veo31ImageToVideoInput`, `Veo31FrameToVideoInput` from `apps/web/src/types/ai-generation.ts`

---

## Subtask 3: Add Handlers & Routing

**~10 min** | Files to modify:

### 3a. T2V Handler — `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts`

Add `handleVeo31LiteT2V()` — follow `handleVeo31FastT2V()` pattern, call `veo31LiteTextToVideo()`.

### 3b. I2V Handlers — `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts`

Add `handleVeo31LiteI2V()` and `handleVeo31LiteF2V()` — follow `handleVeo31FastI2V()` / `handleVeo31FastF2V()` patterns.

### 3c. Router — `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts`

Add 3 new cases:
```typescript
case "veo31_lite_text_to_video":   return handleVeo31LiteT2V(ctx, settings);
case "veo31_lite_image_to_video":  return handleVeo31LiteI2V(ctx, settings);
case "veo31_lite_frame_to_video":  return handleVeo31LiteF2V(ctx, settings);
```

### 3d. Update Settings UI — `apps/web/src/components/editor/media-panel/views/ai/settings/ai-veo-settings.tsx`

Add Lite pricing row to the dynamic pricing display:
```typescript
"4s": { withAudio: "$0.20 Lite / $0.60 Fast / $1.60 Std" },
"6s": { withAudio: "$0.30 Lite / $0.90 Fast / $2.40 Std" },
"8s": { withAudio: "$0.40 Lite / $1.20 Fast / $3.20 Std" },
```

Also add `VEO31_FRAME_MODELS` set update for the Lite F2V model in `model-handlers.ts`.

---

## Subtask 4: Native Pipeline, Tests, Update MD

**~10 min** | Files to modify:

### 4a. Native Pipeline — `electron/native-pipeline/registry-data/image-to-video.ts`

Register `veo_3_1_lite` (I2V only, matching the existing `veo_3_1_fast` pattern).

### 4b. Update Tests

- `handlers/__tests__/handler-exports.test.ts` — T2V handler count 10 → 11, I2V handler count 17 → 19, total 37 → 40
- `__tests__/model-handlers-routing.test.ts` — no changes needed (existing tests cover generic routing)

### 4c. Run Tests

```bash
npx tsc --noEmit --project apps/web/tsconfig.json  # 0 errors
bun run test                                         # Affected tests pass
```

---

## Testing

### Manual Testing
1. Open QCut editor > Media Panel
2. **T2V tab**: Select Veo 3.1 Lite, enter prompt, generate at 720p/4s — verify video + audio
3. **Image tab**: Select Veo 3.1 Lite I2V, upload image, generate — verify animation
4. **Image tab**: Select Veo 3.1 Lite F2V, upload first+last frames, generate — verify transition
5. Test 1080p resolution for all 3
6. Verify pricing display in Veo settings panel shows Lite tier

### Architecture Notes

- **Reuses all existing Veo 3.1 infrastructure** — types, settings UI, state hook
- **No new type definitions needed** — Lite uses same input/output types as Fast/Standard
- **Audio always on** — Lite doesn't expose `generate_audio` toggle, but the param is still sent as `true` for compatibility
- **No `enhance_prompt`** — Lite API doesn't support this, so handlers should not send it
- **No `1:1` aspect ratio on Lite** — settings UI already handles 16:9/9:16 per model; no change needed since "1:1" is only shown for T2V which auto-converts to "16:9" for endpoints that don't support it
