# Kling V3 Text-to-Video & Image-to-Video via GMI Cloud

Add Kling V3 T2V and I2V as GMI Cloud provider alternatives. These models already exist
via FAL (`kling_v3_pro_t2v`, `kling_v3_standard_t2v`, `kling_v3_pro_i2v`, `kling_v3_standard_i2v`).
The GMI versions offer different pricing and use the provider router for transparent switching.

## GMI Model Details

### kling-v3-text-to-video

| Field | Value |
|-------|-------|
| GMI Model ID | `kling-v3-text-to-video` |
| Type | Text-to-Video |
| Resolution | 720p |
| Duration | 3-15 seconds |
| Aspect Ratios | 16:9, 9:16, 1:1 |
| Sound | Optional (`sound: "on"` / `"off"`) |
| Pricing | $0.168/s (no sound), $0.252/s (with sound) |

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Video scene description |
| `negative_prompt` | string | No | - | Elements to exclude |
| `duration` | string | No | `"5"` | `"3"` through `"15"` |
| `aspect_ratio` | string | No | `"16:9"` | `"16:9"`, `"9:16"`, `"1:1"` |
| `sound` | string | No | - | `"on"` or `"off"` |

### kling-v3-image-to-video

| Field | Value |
|-------|-------|
| GMI Model ID | `kling-v3-image-to-video` |
| Type | Image-to-Video |
| Resolution | 720p |
| Duration | 3-15 seconds |
| Aspect Ratio | Derived from input image |
| Sound | Optional (`sound: "on"` / `"off"`) |
| Pricing | $0.168/s (no sound), $0.252/s (with sound) |

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Motion and action description (max 2500 chars) |
| `image` | string | Yes | - | Starting frame (Base64 or URL) |
| `image_tail` | string | No | - | End frame image for guided conclusion |
| `negative_prompt` | string | No | - | Elements to exclude |
| `duration` | string | No | `"5"` | `"3"` through `"15"` |
| `sound` | string | No | - | `"on"` or `"off"` |

**Note:** No `aspect_ratio` parameter — output matches input image dimensions.

---

## Key Differences from FAL Versions

| Feature | FAL Kling V3 | GMI Kling V3 |
|---------|-------------|-------------|
| Duration range | 5, 10 seconds | 3-15 seconds (continuous) |
| Sound | Not supported | Native audio generation |
| End frame (I2V) | Not supported | `image_tail` parameter |
| Negative prompt | Supported | Supported |
| Aspect ratios (T2V) | 16:9, 9:16, 1:1, 4:3, 3:4 | 16:9, 9:16, 1:1 |
| Resolution | 720p | 720p |
| Pricing (T2V) | ~$0.10/s (FAL) | $0.168/s (no sound) |

The GMI versions have **broader duration support** and **native audio** but are
**more expensive** than FAL. These are distinct enough to warrant separate model entries
rather than just being alternative providers for the same model.

---

## Subtasks

### Subtask 1: Request Types (~3 min)

**File to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts`

```typescript
/** Kling V3 T2V via GMI Cloud. */
export interface KlingV3GmiT2VRequest {
	prompt: string;
	negative_prompt?: string;
	duration?: string; // "3" through "15"
	aspect_ratio?: "16:9" | "9:16" | "1:1";
	sound?: "on" | "off";
}

/** Kling V3 I2V via GMI Cloud. */
export interface KlingV3GmiI2VRequest {
	prompt: string;
	image: string;
	image_tail?: string;
	negative_prompt?: string;
	duration?: string; // "3" through "15"
	sound?: "on" | "off";
}
```

### Subtask 2: Generators (~10 min)

**File to modify:**
- `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` — Add `generateKlingV3GmiTextVideo()`
- `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts` — Add `generateKlingV3GmiImageVideo()`

Follow existing pattern: call `providerRouter.submit()` with model ID `kling-v3-text-to-video`
or `kling-v3-image-to-video` and the appropriate payload.

### Subtask 3: UI Model Config (~10 min)

**Files to modify:**

T2V:
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` — Add `gmi_kling_v3_t2v`
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` — Add capabilities
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` — Add to display order

```typescript
gmi_kling_v3_t2v: {
	id: "gmi_kling_v3_t2v",
	name: "Kling V3 T2V (GMI)",
	description: "Kling V3 text-to-video via GMI Cloud with native audio and 3-15s duration",
	price: "$0.168/s",
	resolution: "720p",
	max_duration: 15,
	category: "text",
	endpoints: { text_to_video: "kling-v3-text-to-video" },
	default_params: { duration: "5", aspect_ratio: "16:9" },
	supportedDurations: [3, 5, 8, 10, 15],
	supportedAspectRatios: ["16:9", "9:16", "1:1"],
},
```

I2V:
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — Add `gmi_kling_v3_i2v`

```typescript
gmi_kling_v3_i2v: {
	id: "gmi_kling_v3_i2v",
	name: "Kling V3 I2V (GMI)",
	description: "Kling V3 image-to-video via GMI Cloud with audio and end-frame guidance",
	price: "$0.168/s",
	resolution: "720p",
	max_duration: 15,
	category: "image",
	endpoints: { image_to_video: "kling-v3-image-to-video" },
	default_params: { duration: "5" },
	supportedDurations: [3, 5, 8, 10, 15],
},
```

### Subtask 4: Handlers & Router (~10 min)

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` — Add `handleGmiKlingV3T2V()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` — Add `handleGmiKlingV3I2V()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` — Add switch cases:
  - `case "gmi_kling_v3_t2v": return handleGmiKlingV3T2V(ctx, settings);`
  - `case "gmi_kling_v3_i2v": return handleGmiKlingV3I2V(ctx, settings);`

### Subtask 5: Registry (~5 min)

**Files to modify:**
- `electron/native-pipeline/registry-data/text-to-video.ts` — Register `gmi_kling_v3_t2v` with `providerBackend: "gmi"`
- `electron/native-pipeline/registry-data/image-to-video.ts` — Register `gmi_kling_v3_i2v` with `providerBackend: "gmi"`

### Subtask 6: Export & Tests (~5 min)

**Files to modify:**
- `apps/web/src/lib/ai-video/index.ts` — Export new generators
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handler-exports.test.ts` — Update handler counts
- `electron/__tests__/cli-commands-phase4.test.ts` — Verify new models registered

---

## Implementation Order

```
Subtask 1 (types)
    ↓
Subtask 2 (generators)
    ↓
Subtask 3 (UI config) + Subtask 4 (handlers) + Subtask 5 (registry)  ← parallel
    ↓
Subtask 6 (exports & tests)
```

**Estimated total:** ~40 minutes
