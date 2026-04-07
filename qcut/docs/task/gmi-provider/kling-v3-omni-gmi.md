# Kling V3 Omni via GMI Cloud

Add the **kling-v3-omni** unified video generation model from GMI Cloud. This is a single model
that supports text-to-video, image-to-video, video editing, element-driven generation, and
multi-shot storyboards — all through one API endpoint with different parameter combinations.

## GMI Model ID: `kling-v3-omni`

### Capabilities Overview

| Capability | How to Trigger |
|-----------|---------------|
| Text-to-Video | `prompt` only (no images/video) |
| Image-to-Video | `image_list` with `first_frame` type |
| Start + End Frame | `image_list` with both `first_frame` and `end_frame` |
| Video Editing | `video_list` with `refer_type: "base"` |
| Style/Motion Reference | `video_list` with `refer_type: "feature"` |
| Element-Driven | `element_list` with element IDs or inline images/videos |
| Multi-Shot Storyboard | `multi_shot: true` with `multi_prompt` array |
| Audio Generation | `sound: "on"` (not available when `video_list` is set) |

### Pricing (per second of output video)

| Mode | No Video Input | With Video | No Video + Sound |
|------|---------------|-----------|-----------------|
| Standard (`std`) — 720p | $0.084/s | $0.126/s | $0.112/s |
| Professional (`pro`) — 1080p | $0.112/s | $0.168/s | $0.14/s |

**Note:** When `video_list` is provided, `sound` must be `"off"`.

---

## Core Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Conditional | - | Max 2500 chars. Supports `<<<element_1>>>`, `<<<image_1>>>`, `<<<video_1>>>` references. Required when `multi_shot` is false. |
| `mode` | string | No | `"pro"` | `"std"` (720p) or `"pro"` (1080p) |
| `duration` | string | No | `"5"` | `"3"` through `"15"`. Ignored for video editing. |
| `aspect_ratio` | string | No | - | `"16:9"`, `"9:16"`, `"1:1"`. Required when not using first-frame or video editing. |
| `sound` | string | No | `"off"` | `"on"` or `"off"`. Must be `"off"` with `video_list`. |

## Image Input: `image_list`

JSON array of reference images as start/end frames.

```json
[
  { "image": "<url>", "type": "first_frame" },
  { "image": "<url>", "type": "end_frame" }
]
```

- End frame requires a first frame
- Formats: .jpg/.jpeg/.png, max 10MB, min 300px
- Aspect ratio: 1:2.5 to 2.5:1

## Video Input: `video_list`

JSON array with one reference video.

```json
[
  {
    "video": "<url>",
    "refer_type": "base",
    "keep_original_sound": "yes"
  }
]
```

| Field | Values | Description |
|-------|--------|-------------|
| `refer_type` | `"base"` / `"feature"` | `base` = video editing, `feature` = style/motion reference |
| `keep_original_sound` | `"yes"` / `"no"` | Preserve original audio |

- Formats: .mp4/.mov, 3-10s, 720-2160px, 24-60fps, max 200MB

## Element Input: `element_list`

JSON array referencing reusable elements (characters, objects) for consistency.

**Three modes:**

| Mode | Fields | Description |
|------|--------|-------------|
| By ID | `element_id` | Reference pre-created element |
| Inline image | `frontal_image`, `refer_images[]` | Auto-create element from images |
| Inline video | `refer_videos[]` | Auto-create element from video |

Optional fields: `element_name`, `element_description`, `tag_list`, `element_voice_id`

**Reference in prompt:** Use `<<<element_1>>>`, `<<<element_2>>>` etc.

### Reference Limits

| Scenario | Max images + elements |
|----------|----------------------|
| No reference video | 7 |
| With reference video | 4 (no video elements) |
| With first/last frame video | 3 elements |
| More than 2 images | No end frame |

## Multi-Shot Storyboard

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `multi_shot` | boolean | No | Enable storyboard mode |
| `shot_type` | string | No | `"customize"` (required when `multi_shot: true`) |
| `multi_prompt` | JSON | Conditional | Per-shot array: up to 6 shots, 512 chars each. Durations must sum to total. |

```json
{
  "multi_shot": true,
  "shot_type": "customize",
  "duration": "10",
  "multi_prompt": [
    { "prompt": "A woman walks through a forest", "duration": "5" },
    { "prompt": "She discovers a hidden waterfall", "duration": "5" }
  ]
}
```

## Other Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `watermark_info` | JSON | `{"enabled": true}` for watermarked results |

## Response

```json
{
  "status": "success",
  "outcome": {
    "media_urls": [{ "id": "...", "url": "..." }],
    "thumbnail_image_url": "..."
  }
}
```

---

## Companion Model: `kling-create-element`

Creates reusable elements for consistent characters/objects across Omni generations.

| Field | Value |
|-------|-------|
| GMI Model ID | `kling-create-element` |
| Purpose | Create reusable elements (characters, animals, items, costumes, scenes, effects) |

**Two creation methods:**

| Method | `reference_type` | Input | Notes |
|--------|-----------------|-------|-------|
| Multi-Image | `"image_refer"` | 1 frontal + 1-3 reference images | Broader availability |
| Video | `"video_refer"` | 1 reference video (3-8s) | Voice customization if human voice detected |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element_name` | string | Yes | Max 20 characters |
| `element_description` | string | Yes | Max 100 characters |
| `reference_type` | string | Yes | `"image_refer"` or `"video_refer"` |
| `frontal_image` | image | Conditional | Required for image_refer. .jpg/.jpeg/.png, max 10MB |
| `refer_images` | image[] | Conditional | 1-3 images for image_refer |
| `refer_video` | video | Conditional | Required for video_refer. .mp4/.mov, 1080P, 3-8s, max 200MB |
| `element_voice_id` | string | No | Bind voice from library |
| `tag_list` | JSON | No | Tags: `o_101` Hottest, `o_102` Character, `o_103` Animal, `o_104` Item, `o_105` Costume, `o_106` Scene, `o_107` Effect, `o_108` Others |

---

## Subtasks

### Subtask 1: Request Types (~5 min)

**File to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts`

```typescript
/** Kling V3 Omni unified request via GMI Cloud. */
export interface KlingV3OmniRequest {
	prompt?: string;
	mode?: "std" | "pro";
	duration?: string;
	aspect_ratio?: "16:9" | "9:16" | "1:1";
	sound?: "on" | "off";
	image_list?: Array<{ image: string; type: "first_frame" | "end_frame" }>;
	video_list?: Array<{
		video: string;
		refer_type: "base" | "feature";
		keep_original_sound?: "yes" | "no";
	}>;
	element_list?: Array<{
		element_id?: string;
		frontal_image?: string;
		refer_images?: string[];
		refer_videos?: string[];
		element_name?: string;
		element_description?: string;
	}>;
	multi_shot?: boolean;
	shot_type?: "customize";
	multi_prompt?: Array<{ prompt: string; duration: string }>;
	watermark_info?: { enabled: boolean };
}

/** Kling Create Element request via GMI Cloud. */
export interface KlingCreateElementRequest {
	element_name: string;
	element_description: string;
	reference_type: "image_refer" | "video_refer";
	frontal_image?: string;
	refer_images?: string[];
	refer_video?: string;
	element_voice_id?: string;
	tag_list?: string[];
}
```

### Subtask 2: GMI Omni Generator (~15 min)

**File to create:**
- `apps/web/src/lib/ai-video/generators/gmi-omni.ts`

Implement:
- `generateKlingOmniVideo(request: KlingV3OmniRequest)` — Routes through `providerRouter.submit("kling-v3-omni", payload)`
- `createKlingElement(request: KlingCreateElementRequest)` — Element creation

The Omni generator should handle all capability modes (T2V, I2V, video edit, element, multi-shot)
through a single function — the mode is determined by which parameters are present.

### Subtask 3: UI Model Config (~10 min)

**Phase 1 — T2V and I2V entries only.** Multi-shot and video editing can be added in a future UI pass.

T2V:
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` — Add `gmi_kling_v3_omni_t2v`
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` — Add capabilities
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` — Add to order

```typescript
gmi_kling_v3_omni_t2v: {
	id: "gmi_kling_v3_omni_t2v",
	name: "Kling V3 Omni (GMI)",
	description: "Unified Kling V3 Omni with native audio, std/pro modes, 3-15s",
	price: "$0.084-0.14/s",
	resolution: "720p / 1080p",
	supportedResolutions: ["720p", "1080p"],
	max_duration: 15,
	category: "text",
	endpoints: { text_to_video: "kling-v3-omni" },
	default_params: { duration: "5", mode: "pro", aspect_ratio: "16:9" },
	supportedDurations: [3, 5, 8, 10, 15],
	supportedAspectRatios: ["16:9", "9:16", "1:1"],
},
```

I2V:
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — Add `gmi_kling_v3_omni_i2v`

```typescript
gmi_kling_v3_omni_i2v: {
	id: "gmi_kling_v3_omni_i2v",
	name: "Kling V3 Omni I2V (GMI)",
	description: "Kling V3 Omni image-to-video with end-frame, audio, and element support",
	price: "$0.084-0.14/s",
	resolution: "720p / 1080p",
	supportedResolutions: ["720p", "1080p"],
	max_duration: 15,
	category: "image",
	endpoints: { image_to_video: "kling-v3-omni" },
	default_params: { duration: "5", mode: "pro" },
	supportedDurations: [3, 5, 8, 10, 15],
},
```

### Subtask 4: Handlers & Router (~10 min)

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` — Add `handleGmiKlingOmniT2V()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` — Add `handleGmiKlingOmniI2V()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` — Add switch cases

T2V handler builds payload with `prompt`, `mode`, `duration`, `aspect_ratio`, `sound`.
I2V handler builds `image_list` with `first_frame` from selected image, plus optional `end_frame`.

### Subtask 5: Registry (~5 min)

**Files to modify:**
- `electron/native-pipeline/registry-data/text-to-video.ts` — Register `gmi_kling_v3_omni_t2v`
- `electron/native-pipeline/registry-data/image-to-video.ts` — Register `gmi_kling_v3_omni_i2v`

Both with `providerBackend: "gmi"`.

### Subtask 6: Exports & Tests (~5 min)

**Files to modify:**
- `apps/web/src/lib/ai-video/index.ts` — Export `generateKlingOmniVideo`, `createKlingElement`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handler-exports.test.ts` — Update counts
- `electron/__tests__/cli-commands-phase4.test.ts` — Verify models registered

---

## Implementation Order

```text
Subtask 1 (types)
    ↓
Subtask 2 (omni generator)
    ↓
Subtask 3 (UI config) + Subtask 4 (handlers) + Subtask 5 (registry)  ← parallel
    ↓
Subtask 6 (exports & tests)
```

**Estimated total:** ~50 minutes

## Future Work (Out of Scope)

- Multi-shot storyboard UI (requires new panel/workflow)
- Video editing mode UI (requires video input selection)
- Element management UI (create, list, reuse elements)
- `kling-create-element` full integration with element library
- Feature reference mode (style/motion transfer from video)

---

## Implementation Summary (2026-04-07)

**Status:** Complete (T2V + I2V modes; multi-shot, video editing, elements deferred)

### Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` | Add `KlingV3OmniRequest`, `KlingCreateElementRequest` |
| `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` | Add `generateKlingOmniTextVideo()` |
| `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts` | Add `generateKlingOmniImageVideo()` |
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` | Add `gmi_kling_v3_omni_t2v` |
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` | Add capabilities |
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` | Add to order |
| `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` | Add `gmi_kling_v3_omni_i2v` |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` | Add `handleGmiKlingOmniT2V()` |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` | Add `handleGmiKlingOmniI2V()` |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` | Add switch cases |
| `electron/native-pipeline/registry-data/text-to-video.ts` | Register `gmi_kling_v3_omni_t2v` |
| `electron/native-pipeline/registry-data/image-to-video.ts` | Register `gmi_kling_v3_omni_i2v` |
| `apps/web/src/lib/ai-video/index.ts` | Export `generateKlingOmniTextVideo`, `generateKlingOmniImageVideo` |

### Tests

| File | Changes |
|------|---------|
| `handler-exports.test.ts` | Counts updated as part of batch |
| `cli-commands-phase4.test.ts` | Add `gmi_kling_v3_omni_t2v`, `gmi_kling_v3_omni_i2v` assertions |

### Notes
- Omni I2V uses `image_list` with `JSON.stringify()` to pass first frame (and optional end frame)
- Mode maps to resolution: `std` = 720p, `pro` = 1080p — handler uses `settings.resolution` to pick
- `KlingCreateElementRequest` type defined but `createKlingElement()` generator deferred to future work
