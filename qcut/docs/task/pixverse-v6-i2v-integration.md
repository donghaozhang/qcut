# PixVerse v6 Image-to-Video Integration

**Branch**: `wan27`
**Date**: 2026-04-02
**Estimated effort**: ~30 minutes (4 subtasks)

## Overview

Add PixVerse v6 image-to-video model to QCut. Single new FAL.ai endpoint:

| Model | Endpoint | Type |
|-------|----------|------|
| PixVerse v6 I2V | `fal-ai/pixverse/v6/image-to-video` | Image-to-Video |

## API Specification

### Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Video generation description |
| `image_url` | string | Yes | - | Starting frame URL |
| `resolution` | enum | No | `"720p"` | `360p`, `540p`, `720p`, `1080p` |
| `duration` | integer | No | `5` | Video length in seconds (1-15) |
| `negative_prompt` | string | No | `""` | Unwanted elements to avoid |
| `style` | enum | No | - | `anime`, `3d_animation`, `clay`, `comic`, `cyberpunk` |
| `seed` | integer | No | - | Reproducibility control |
| `generate_audio_switch` | boolean | No | - | Enable audio generation (BGM, SFX, dialogue) |
| `generate_multi_clip_switch` | boolean | No | - | Enable dynamic camera changes |
| `thinking_type` | enum | No | `"auto"` | Prompt optimization: `enabled`, `disabled`, `auto` |

### Output Schema

```json
{
  "video": {
    "url": "string",
    "content_type": "video/mp4",
    "file_name": "output.mp4",
    "file_size": 0
  }
}
```

### Pricing (per second)

| Resolution | No Audio | With Audio |
|------------|----------|------------|
| 360p | $0.025 | $0.035 |
| 540p | $0.035 | $0.045 |
| 720p | $0.045 | $0.060 |
| 1080p | $0.090 | $0.115 |

### Notable Features
- **Style presets** — unique to PixVerse (anime, 3D animation, clay, comic, cyberpunk)
- **Audio generation** — built-in BGM/SFX/dialogue via `generate_audio_switch`
- **Multi-clip** — dynamic camera changes via `generate_multi_clip_switch`
- **Thinking mode** — prompt optimization control
- **Flexible duration** — 1-15 seconds (continuous, not fixed increments)
- **4 resolutions** — 360p through 1080p

---

## Subtask 1: Add I2V Model Config

**~5 min** | File to modify:

### `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`

Add `pixverse_v6_i2v` entry to `I2V_MODELS` and `I2V_MODEL_ORDER`:

```typescript
pixverse_v6_i2v: {
  id: "pixverse_v6_i2v",
  name: "PixVerse v6",
  description: "Stylized image-to-video with audio generation and multi-clip support (1-15s)",
  price: "0.045/s",
  resolution: "1080p",
  max_duration: 15,
  category: "image",
  endpoints: {
    image_to_video: "fal-ai/pixverse/v6/image-to-video",
  },
  default_params: {
    duration: 5,
    resolution: "720p",
    thinking_type: "auto",
  },
  supportedDurations: [5, 8, 10, 15],
  supportedResolutions: ["360p", "540p", "720p", "1080p"],
  perSecondPricing: {
    "360p": 0.025,
    "540p": 0.035,
    "720p": 0.045,
    "1080p": 0.09,
  },
},
```

Add `"pixverse_v6_i2v"` to `I2V_MODEL_ORDER` (mid-tier, after the badged picks).

---

## Subtask 2: Add Request Type & Validator

**~5 min** | Files to modify:

### 2a. `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts`

Add request type:

```typescript
export interface PixverseV6I2VRequest {
  model: string;
  prompt: string;
  image_url: string;
  duration?: number;           // 1-15
  resolution?: "360p" | "540p" | "720p" | "1080p";
  negative_prompt?: string;
  style?: "anime" | "3d_animation" | "clay" | "comic" | "cyberpunk";
  seed?: number;
  generate_audio_switch?: boolean;
  generate_multi_clip_switch?: boolean;
  thinking_type?: "enabled" | "disabled" | "auto";
}
```

### 2b. `apps/web/src/lib/ai-video/validation/validators/pixverse-validators.ts` (new file)

```typescript
import { ERROR_MESSAGES } from "../../constants";

export function validatePixverseDuration(duration: number): void {
  if (duration < 1 || duration > 15) {
    throw new Error(ERROR_MESSAGES.PIXVERSE_INVALID_DURATION);
  }
}

export function validatePixverseResolution(resolution: string): void {
  if (!["360p", "540p", "720p", "1080p"].includes(resolution)) {
    throw new Error(ERROR_MESSAGES.PIXVERSE_INVALID_RESOLUTION);
  }
}

export function validatePixverseStyle(style: string): void {
  if (!["anime", "3d_animation", "clay", "comic", "cyberpunk"].includes(style)) {
    throw new Error(ERROR_MESSAGES.PIXVERSE_INVALID_STYLE);
  }
}
```

### 2c. `apps/web/src/lib/ai-video/validation/validators/index.ts`

Add `export * from "./pixverse-validators";`

### 2d. Add error messages

Check where `ERROR_MESSAGES` is defined (likely `ai-constants.ts` or a dedicated constants file) and add:

```typescript
PIXVERSE_INVALID_DURATION: "PixVerse duration must be between 1 and 15 seconds",
PIXVERSE_INVALID_RESOLUTION: "PixVerse resolution must be 360p, 540p, 720p, or 1080p",
PIXVERSE_INVALID_STYLE: "PixVerse style must be anime, 3d_animation, clay, comic, or cyberpunk",
```

---

## Subtask 3: Add Generator & Handler

**~15 min** | Files to create/modify:

### 3a. `apps/web/src/lib/ai-video/generators/pixverse-generators.ts` (new file)

Follow the pattern from `wan-generators.ts` / `vidu-generators.ts`:

```typescript
export async function generatePixverseImageVideo(
  request: PixverseV6I2VRequest
): Promise<VideoGenerationResponse> {
  return withErrorHandling("PixVerse v6 I2V", async () => {
    const apiKey = await getFalApiKeyAsync();
    if (!apiKey) throw new Error("FAL API key not configured");
    if (!request.prompt) throw new Error("Prompt is required");
    if (!request.image_url) throw new Error("Image URL is required");

    const config = getModelConfig(request.model);
    const endpoint = config?.endpoints?.image_to_video;
    if (!endpoint) throw new Error("PixVerse endpoint not found");

    const duration = request.duration ?? 5;
    const resolution = request.resolution ?? "720p";

    if (request.duration) validatePixverseDuration(duration);
    if (request.resolution) validatePixverseResolution(resolution);
    if (request.style) validatePixverseStyle(request.style);

    const payload: Record<string, unknown> = {
      prompt: request.prompt,
      image_url: request.image_url,
      duration,
      resolution,
    };

    if (request.negative_prompt) payload.negative_prompt = request.negative_prompt;
    if (request.style) payload.style = request.style;
    if (request.seed !== undefined) payload.seed = request.seed;
    if (request.generate_audio_switch !== undefined)
      payload.generate_audio_switch = request.generate_audio_switch;
    if (request.generate_multi_clip_switch !== undefined)
      payload.generate_multi_clip_switch = request.generate_multi_clip_switch;
    if (request.thinking_type) payload.thinking_type = request.thinking_type;

    return makeFalRequest(endpoint, payload);
  });
}
```

### 3b. `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts`

Add handler function following existing pattern:

```typescript
export async function handlePixverseV6I2V(
  ctx: ModelHandlerContext,
  settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
  if (!settings.selectedImage) {
    return { response: undefined, shouldSkip: true, skipReason: "No image selected" };
  }

  const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

  const response = await generatePixverseImageVideo({
    model: ctx.modelId,
    prompt: ctx.prompt,
    image_url: imageUrl,
    duration: settings.duration as number | undefined,
    resolution: settings.resolution as "360p" | "540p" | "720p" | "1080p" | undefined,
    negative_prompt: settings.negativePrompt,
    style: settings.style as PixverseV6I2VRequest["style"],
    seed: settings.seed,
    generate_audio_switch: settings.generateAudio,
    thinking_type: "auto",
  });

  return { response };
}
```

Wire the handler in the main I2V dispatch (likely a switch/if-else on model ID).

---

## Subtask 4: Register in Native Pipeline

**~5 min** | File to modify:

### `electron/native-pipeline/registry-data/image-to-video.ts`

```typescript
ModelRegistry.register({
  key: "pixverse_v6",
  name: "PixVerse v6",
  provider: "PixVerse",
  endpoint: "fal-ai/pixverse/v6/image-to-video",
  categories: ["image_to_video"],
  description: "Stylized image-to-video with audio and multi-clip support",
  pricing: { type: "per_second", cost_720p: 0.045, cost_1080p: 0.09 },
  durationOptions: ["5", "8", "10", "15"],
  resolutions: ["360p", "540p", "720p", "1080p"],
  defaults: { duration: "5", resolution: "720p" },
  features: ["audio_generation", "style_presets", "negative_prompt", "seed_control"],
  maxDuration: 15,
  extendedFeatures: {
    start_frame: true,
    end_frame: false,
    ref_images: false,
    audio_input: false,
    audio_generate: true,
    ref_video: false,
  },
  costEstimate: 0.23,
  processingTime: 45,
});
```

---

## Testing

### Manual Testing
1. Open QCut editor > Media Panel > Image tab
2. Select PixVerse v6 from model list
3. Upload an image, enter prompt
4. Test with default settings (720p, 5s)
5. Test with style preset (e.g., `anime`)
6. Test with audio generation enabled
7. Test 1080p + 15s duration (max settings)
8. Verify video downloads and plays in timeline

### Automated
```bash
bun run test          # Unit tests pass
bun check-types       # No type errors
```

---

## Architecture Notes

- **New provider** — PixVerse is not in the codebase yet, so this is a fresh integration
- **Style presets** — unique feature not present in other I2V models; may need UI support for style selection dropdown
- **Continuous duration** — Unlike most models (fixed 5/10/15), PixVerse supports 1-15s continuously. `supportedDurations` lists common presets but the generator accepts any value in range
- **Audio generation** — built-in via `generate_audio_switch`, similar to LTX 2.3's `generate_audio` pattern
- **Response format** — returns `{ video: { url } }` (single video object, not array), same as most FAL video endpoints
- **Output extraction** — existing `extractVideoUrl()` in `base-generator.ts` should handle `result.video.url`

---

## Implementation Summary (2026-04-02)

**Status**: Complete

### Files Created
| File | Purpose |
|------|---------|
| `apps/web/src/lib/ai-video/generators/pixverse-generators.ts` | `generatePixverseImageVideo()` generator |
| `apps/web/src/lib/ai-video/validation/validators/pixverse-validators.ts` | Duration, resolution, style validators |

### Files Modified
| File | Changes |
|------|---------|
| `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` | Add `pixverse_v6_i2v` to `I2V_MODELS` and `I2V_MODEL_ORDER` |
| `apps/web/src/components/editor/media-panel/views/ai/constants/error-messages.ts` | Add 4 PixVerse error messages |
| `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` | Add `PixverseV6I2VRequest` interface |
| `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/index.ts` | Export `PixverseV6I2VRequest` |
| `apps/web/src/lib/ai-video/validation/validators/index.ts` | Barrel export pixverse validators |
| `apps/web/src/lib/ai-video/generators/image-to-video.ts` | Re-export `generatePixverseImageVideo` |
| `apps/web/src/lib/ai-video/index.ts` | Add `generatePixverseImageVideo` to I2V exports |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` | Add `handlePixverseV6I2V()` handler |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` | Import handler + add `pixverse_v6_i2v` case in router switch |
| `electron/native-pipeline/registry-data/image-to-video.ts` | Register `pixverse_v6` in native pipeline |

### Tests Updated
| File | Changes |
|------|---------|
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handler-exports.test.ts` | I2V handler count 16 → 17, total 36 → 37 |

### Test Results
```
bun run test (2 affected files) — 11/11 passed
npx tsc --noEmit — 0 errors
```
