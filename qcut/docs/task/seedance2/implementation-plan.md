# Seedance 2.0 Implementation Plan

## Overview

Add **Seedance 2.0** (ByteDance) support to QCut with three generation modes:

| Mode | FAL Endpoint | Category |
|------|-------------|----------|
| Text-to-Video | `fal-ai/bytedance/seedance-2.0/text-to-video` | text |
| Image-to-Video | `fal-ai/bytedance/seedance-2.0/image-to-video` | image |
| Reference-to-Video | `fal-ai/bytedance/seedance-2.0/reference-to-video` | image/avatar |

**New in 2.0**: Reference-to-video mode (character/subject consistency via reference image). Native audio output. Enhanced camera control and physics simulation.

**Note**: Early access API — requires `end_user_id` in payload. Geographic restriction (non-US B2B only).

---

## Subtask 1: Model Configs & Type Definitions

**Estimated time**: 15 min

### 1a. Add Seedance 2.0 T2V model config

**File**: `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`

Add two new entries after existing `seedance_pro`:

```typescript
seedance2: {
  id: "seedance2",
  name: "Seedance 2.0",
  description: "ByteDance's most advanced video gen — cinematic output with native audio (2-12s)",
  price: "0.30",
  resolution: "720p / 1080p",
  max_duration: 12,
  category: "text",
  endpoints: {
    text_to_video: "fal-ai/bytedance/seedance-2.0/text-to-video",
  },
  default_params: {
    duration: 5,
    resolution: "1080p",
    aspect_ratio: "16:9",
  },
  supportedResolutions: ["720p", "1080p"],
  supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  supportedAspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
}
```

### 1b. Add Seedance 2.0 I2V model config

**File**: `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`

Add after existing Seedance v1 entries:

```typescript
seedance2_i2v: {
  id: "seedance2_i2v",
  name: "Seedance 2.0 I2V",
  description: "Cinematic image-to-video with native audio and physics (2-12s)",
  price: "0.50",
  resolution: "720p / 1080p",
  max_duration: 12,
  category: "image",
  endpoints: {
    image_to_video: "fal-ai/bytedance/seedance-2.0/image-to-video",
  },
  default_params: {
    duration: 5,
    resolution: "1080p",
    aspect_ratio: "16:9",
    camera_fixed: false,
    enable_safety_checker: false,
  },
  supportedResolutions: ["720p", "1080p"],
  supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  supportedAspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
}
```

### 1c. Add Seedance 2.0 Reference-to-Video model config

**File**: `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`

```typescript
seedance2_ref2v: {
  id: "seedance2_ref2v",
  name: "Seedance 2.0 Ref2V",
  description: "Character-consistent video from reference image + prompt (2-12s)",
  price: "0.60",
  resolution: "720p / 1080p",
  max_duration: 12,
  category: "image",
  endpoints: {
    image_to_video: "fal-ai/bytedance/seedance-2.0/reference-to-video",
  },
  default_params: {
    duration: 5,
    resolution: "1080p",
    aspect_ratio: "16:9",
    enable_safety_checker: false,
  },
  supportedResolutions: ["720p", "1080p"],
  supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  supportedAspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  requiredInputs: ["referenceImage"],
}
```

### 1d. Add T2V capabilities

**File**: `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts`

Add after existing Seedance capabilities:

```typescript
seedance2: {
  supportsAspectRatio: true,
  supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  supportsResolution: true,
  supportedResolutions: ["720p", "1080p"],
  supportsDuration: true,
  supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  supportsNegativePrompt: false,
  supportsPromptExpansion: false,
  supportsSeed: true,
  supportsSafetyChecker: false,
  defaultAspectRatio: "16:9",
  defaultResolution: "1080p",
  defaultDuration: 5,
}
```

### 1e. Add model ordering

**File**: `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts`

Add `"seedance2"` near the top (premium tier, above v1 models).

**File**: `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` (model order section)

Add `"seedance2_i2v"` and `"seedance2_ref2v"` near top of I2V order.

### 1f. Add request types

**File**: `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts`

```typescript
/** Seedance 2.0 image-to-video request */
export interface Seedance2I2VRequest {
  model: string;
  prompt: string;
  image_url: string;
  duration?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  resolution?: "720p" | "1080p";
  aspect_ratio?: "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  camera_fixed?: boolean;
  seed?: number;
  enable_safety_checker?: boolean;
  end_image_url?: string;
}

/** Seedance 2.0 reference-to-video request */
export interface Seedance2Ref2VRequest {
  model: string;
  prompt: string;
  reference_image_url: string;
  duration?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  resolution?: "720p" | "1080p";
  aspect_ratio?: "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  seed?: number;
  enable_safety_checker?: boolean;
}
```

### 1g. Add Seedance 2.0 type aliases

**File**: `apps/web/src/components/editor/media-panel/views/ai/constants/ai-model-options.ts`

Reuse existing `SeedanceDuration`, `SeedanceResolution`, `SeedanceAspectRatio` — no changes needed since Seedance 2.0 uses the same value ranges.

---

## Subtask 2: Generator Functions (GUI)

**Estimated time**: 15 min

### 2a. Add Seedance 2.0 I2V generator

**File**: `apps/web/src/lib/ai-video/generators/misc-generators.ts`

Add `generateSeedance2Video()` after existing `generateSeedanceVideo()`. Follow the same pattern but with the 2.0 endpoint. Key differences from v1:
- Uses `Seedance2I2VRequest` type
- Supports both `seedance2_i2v` and `seedance2_ref2v` via model config lookup
- No `camera_fixed` for ref2v mode

```typescript
export async function generateSeedance2Video(
  request: Seedance2I2VRequest
): Promise<VideoGenerationResponse> {
  // Same pattern as generateSeedanceVideo
  // - Validate FAL key, prompt, image_url
  // - Get model config + endpoint
  // - Build payload (duration, resolution, aspect_ratio, camera_fixed, seed, end_image_url)
  // - makeFalRequest(endpoint, payload)
  // - Return VideoGenerationResponse
}
```

### 2b. Add Seedance 2.0 Ref2V generator

**File**: `apps/web/src/lib/ai-video/generators/misc-generators.ts`

```typescript
export async function generateSeedance2RefVideo(
  request: Seedance2Ref2VRequest
): Promise<VideoGenerationResponse> {
  // - Validate FAL key, prompt, reference_image_url
  // - Get model config (seedance2_ref2v)
  // - Build payload with reference_image_url instead of image_url
  // - makeFalRequest(endpoint, payload)
  // - Return VideoGenerationResponse
}
```

### 2c. Export new generators

**File**: `apps/web/src/lib/ai-video/generators/image-to-video.ts` (barrel re-export)

Add exports for `generateSeedance2Video` and `generateSeedance2RefVideo`.

**File**: `apps/web/src/lib/ai-video/index.ts`

Add to the image-to-video export block:
```typescript
generateSeedance2Video,
generateSeedance2RefVideo,
```

---

## Subtask 3: GUI Model Handlers

**Estimated time**: 15 min

### 3a. Add I2V handler

**File**: `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts`

Add `handleSeedance2I2V()` following the pattern of `handleSeedanceProI2V()`:
- Upload image via `settings.uploadImageToFal()`
- Optionally upload end frame (for `seedance2_i2v`)
- Call `generateSeedance2Video()`
- Support `seedanceDuration`, `seedanceResolution`, `seedanceAspectRatio`, `seedanceCameraFixed` settings

### 3b. Add Ref2V handler

**File**: `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts`

Add `handleSeedance2Ref2V()`:
- Upload reference image via `settings.uploadImageToFal()`
- Call `generateSeedance2RefVideo()` with `reference_image_url`
- Use duration/resolution/aspect_ratio settings

### 3c. Register handlers in router

**File**: `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts`

Add to `routeImageToVideoHandler()` switch:
```typescript
case "seedance2_i2v":
  return handleSeedance2I2V(ctx, settings);
case "seedance2_ref2v":
  return handleSeedance2Ref2V(ctx, settings);
```

Add to duration resolver (~line 176):
```typescript
if (["seedance2_i2v", "seedance2_ref2v"].includes(modelId)) {
  return settings.seedanceDuration;
}
```

### 3d. T2V handler — no dedicated handler needed

Seedance 2.0 T2V (`seedance2`) will use `handleGenericT2V` via the default case in `routeTextToVideoHandler()`, same as Seedance v1 T2V. The generic handler calls `generateVideo()` which looks up model config and endpoints automatically.

---

## Subtask 4: GUI Settings & UI

**Estimated time**: 20 min

### 4a. Update Seedance settings component for 2.0

**File**: `apps/web/src/components/editor/media-panel/views/ai/components/ai-seedance-settings.tsx`

The existing component already supports all needed settings (duration, resolution, aspect ratio, camera lock, end frame). Two options:

**Option A (recommended)**: Reuse as-is for `seedance2_i2v`. For `seedance2_ref2v`, hide camera_fixed and end_frame controls.

Add prop: `isRef2V?: boolean` to conditionally hide irrelevant controls:
- Hide "Camera Fixed" toggle when `isRef2V` is true
- Hide "End Frame" upload when `isRef2V` is true
- Update helper text for ref2v mode

### 4b. Update image tab to detect Seedance 2.0

**File**: `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-image-tab.tsx`

Update the Seedance selection detection (~line 290):
```typescript
const seedanceSelected = selectedModels.some(m =>
  ["seedance_pro_fast_i2v", "seedance_pro_i2v", "seedance2_i2v", "seedance2_ref2v"].includes(m)
);
const seedanceProSelected = selectedModels.some(m =>
  ["seedance_pro_i2v", "seedance2_i2v"].includes(m)
);
const seedanceRef2VSelected = selectedModels.includes("seedance2_ref2v");
```

Pass `isRef2V={seedanceRef2VSelected}` to `<AiSeedanceSettings>`.

### 4c. Reference image upload for ref2v

The ref2v model uses the same image upload as I2V (the "selected image" in the image tab acts as the reference image). The prompt describes the desired scene/action. No additional UI needed — the existing image upload + prompt flow works.

### 4d. Cost calculator update

**File**: `apps/web/src/components/editor/media-panel/views/ai/utils/ai-cost-calculators.ts`

Extend `calculateSeedanceCost()` to handle Seedance 2.0 model IDs:
```typescript
// Add pricing tiers for 2.0
if (modelId === "seedance2") pricePerMillionTokens = 1.2;
if (modelId === "seedance2_i2v") pricePerMillionTokens = 2.0;
if (modelId === "seedance2_ref2v") pricePerMillionTokens = 2.5;
```

---

## Subtask 5: Native Pipeline CLI

**Estimated time**: 15 min

### 5a. Register Seedance 2.0 T2V model

**File**: `electron/native-pipeline/registry-data/text-to-video.ts`

```typescript
ModelRegistry.register({
  key: "seedance_2_0",
  name: "ByteDance Seedance 2.0",
  provider: "ByteDance",
  endpoint: "fal-ai/bytedance/seedance-2.0/text-to-video",
  categories: ["text_to_video"],
  description: "Cinematic video with native audio, physics, and camera control",
  pricing: { type: "per_video", cost: 0.30 },
  durationOptions: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  resolutions: ["720p", "1080p"],
  defaults: { duration: 5, resolution: "1080p", aspect_ratio: "16:9" },
  features: ["native_audio", "camera_control", "physics", "seed"],
  maxDuration: 12,
  costEstimate: 0.30,
  processingTime: 120,
});
```

### 5b. Register Seedance 2.0 I2V model

**File**: `electron/native-pipeline/registry-data/image-to-video.ts`

```typescript
ModelRegistry.register({
  key: "seedance_2_0_i2v",
  name: "ByteDance Seedance 2.0 I2V",
  provider: "ByteDance",
  endpoint: "fal-ai/bytedance/seedance-2.0/image-to-video",
  categories: ["image_to_video"],
  description: "Cinematic image-to-video with native audio and physics",
  pricing: 0.50,
  durationOptions: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  resolutions: ["720p", "1080p"],
  defaults: { duration: 5, resolution: "1080p", aspect_ratio: "16:9" },
  features: ["native_audio", "camera_control", "physics", "end_frame", "seed"],
  maxDuration: 12,
  costEstimate: 0.50,
  processingTime: 120,
});
```

### 5c. Register Seedance 2.0 Ref2V model

**File**: `electron/native-pipeline/registry-data/image-to-video.ts`

```typescript
ModelRegistry.register({
  key: "seedance_2_0_ref2v",
  name: "ByteDance Seedance 2.0 Ref2V",
  provider: "ByteDance",
  endpoint: "fal-ai/bytedance/seedance-2.0/reference-to-video",
  categories: ["image_to_video"],
  description: "Character-consistent video from reference image",
  pricing: 0.60,
  durationOptions: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  resolutions: ["720p", "1080p"],
  defaults: { duration: 5, resolution: "1080p", aspect_ratio: "16:9" },
  features: ["reference_image", "character_consistency", "native_audio", "seed"],
  maxDuration: 12,
  costEstimate: 0.60,
  processingTime: 150,
});
```

### 5d. Update command registry

**File**: `electron/native-pipeline/cli/command-registry.ts`

Add `"seedance_2_0"` to the T2V model list (~line 242).

### 5e. Add CLI handler

**File**: `electron/native-pipeline/cli/vimax-cli-handlers/`

Create handler or add to existing file following the pattern of other FAL-based handlers. The handler should:
- Accept prompt, duration, resolution, aspect_ratio, seed, image_url (for I2V), reference_image_url (for ref2v)
- Call the appropriate FAL endpoint via `makeFalRequest`
- Return the video URL

---

## Subtask 6: Testing

**Estimated time**: 15 min

### 6a. Unit tests for generators

**File**: Create `apps/web/src/lib/ai-video/generators/__tests__/seedance2-generators.test.ts`

Test cases:
- `generateSeedance2Video` with valid params returns response
- `generateSeedance2Video` throws on missing prompt
- `generateSeedance2Video` throws on missing image_url
- `generateSeedance2RefVideo` with valid params returns response
- `generateSeedance2RefVideo` throws on missing reference_image_url
- Payload construction (verify correct fields sent to FAL)

### 6b. Unit tests for cost calculator

**File**: Extend existing test file or add to `apps/web/src/components/editor/media-panel/views/ai/utils/__tests__/`

Test cases:
- `calculateSeedanceCost("seedance2", "1080p", 5)` returns expected value
- `calculateSeedanceCost("seedance2_i2v", "720p", 10)` returns expected value
- `calculateSeedanceCost("seedance2_ref2v", "1080p", 5)` returns expected value

### 6c. Model config validation

Verify all three model IDs resolve correctly via `getModelConfig()`.

---

## File Change Summary

| File | Action | Subtask |
|------|--------|---------|
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` | Add `seedance2` config | 1a |
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` | Add `seedance2` capabilities | 1d |
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` | Add `seedance2` to order | 1e |
| `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` | Add `seedance2_i2v` + `seedance2_ref2v` configs + order | 1b, 1c, 1e |
| `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` | Add `Seedance2I2VRequest` + `Seedance2Ref2VRequest` | 1f |
| `apps/web/src/lib/ai-video/generators/misc-generators.ts` | Add `generateSeedance2Video` + `generateSeedance2RefVideo` | 2a, 2b |
| `apps/web/src/lib/ai-video/generators/image-to-video.ts` | Re-export new generators | 2c |
| `apps/web/src/lib/ai-video/index.ts` | Add barrel exports | 2c |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` | Add `handleSeedance2I2V` + `handleSeedance2Ref2V` | 3a, 3b |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` | Register new handlers + duration resolver | 3c |
| `apps/web/src/components/editor/media-panel/views/ai/components/ai-seedance-settings.tsx` | Add `isRef2V` prop for conditional controls | 4a |
| `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-image-tab.tsx` | Detect Seedance 2.0 selection + pass ref2v prop | 4b |
| `apps/web/src/components/editor/media-panel/views/ai/utils/ai-cost-calculators.ts` | Add Seedance 2.0 pricing tiers | 4d |
| `electron/native-pipeline/registry-data/text-to-video.ts` | Register `seedance_2_0` | 5a |
| `electron/native-pipeline/registry-data/image-to-video.ts` | Register `seedance_2_0_i2v` + `seedance_2_0_ref2v` | 5b, 5c |
| `electron/native-pipeline/cli/command-registry.ts` | Add to model list | 5d |
| `electron/native-pipeline/cli/vimax-cli-handlers/` | Add CLI handler | 5e |
| `apps/web/src/lib/ai-video/generators/__tests__/seedance2-generators.test.ts` | New test file | 6a |

---

## Execution Order

1. **Subtask 1** (configs + types) — foundation, no dependencies
2. **Subtask 2** (generators) — depends on types from subtask 1
3. **Subtask 3** (handlers) — depends on generators from subtask 2
4. **Subtask 4** (UI) — depends on configs from subtask 1, handlers from subtask 3
5. **Subtask 5** (CLI) — independent of GUI, can run in parallel with subtasks 2-4
6. **Subtask 6** (tests) — depends on all above

## Notes

- **API is early access**: Endpoint paths and parameters are inferred from v1 patterns + fal.ai conventions. Verify against actual API docs when access is granted.
- **`end_user_id`**: May need to be added to `makeFalRequest` for Seedance 2.0 endpoints specifically. Check if fal.ai enforces this at the API level.
- **Pricing**: Token-based costs are estimates. Update when official pricing is confirmed.
- **Native audio**: Seedance 2.0 outputs video with audio. Ensure the video import pipeline handles audio tracks correctly (existing FFmpeg pipeline should handle this).
