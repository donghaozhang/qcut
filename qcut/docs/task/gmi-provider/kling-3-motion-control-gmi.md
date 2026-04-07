# Kling 3 Motion Control via GMI Cloud

Add **kling-3-motion-control** from GMI Cloud. This model transfers motion from a reference
video to a character image — upload a still image and a motion reference video (3-30s),
and the model animates the character following the reference motion while preserving appearance.

This is a **new modality** not currently in QCut — it requires a video + image input.

## GMI Model ID: `kling-3-motion-control`

### Specifications

| Field | Value |
|-------|-------|
| Type | Image + Video → Video (motion transfer) |
| Input | Character image + motion reference video (3-30s) |
| Resolution | Derived from inputs |
| Pricing (std) | $0.126/s |
| Pricing (pro) | $0.168/s |

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_url` | string | Yes | - | Character image (JPG/PNG/WebP, max 10MB) |
| `video_url` | string | Yes | - | Motion reference video (MP4/MOV/MKV, 3-30s, max 100MB) |
| `character_orientation` | string | Yes | `"video"` | `"video"` (up to 30s output) or `"image"` (up to ~10s) |
| `mode` | string | Yes | `"std"` | `"std"` or `"pro"` |
| `keep_original_sound` | string | No | `"yes"` | `"yes"` or `"no"` |
| `prompt` | string | No | - | Background, lighting, style guidance (max 2500 chars). Does NOT control motion. |

### Character Orientation

| Value | Behavior | Max Output Duration |
|-------|----------|-------------------|
| `"video"` | Output follows the orientation of the reference video | Up to 30s |
| `"image"` | Output follows the orientation of the character image | Up to ~10s |

### Response

```json
{
  "status": "success",
  "outcome": {
    "video_url": "...",
    "thumbnail_image_url": "..."
  }
}
```

---

## Architecture Considerations

Motion control is a **new modality** — it doesn't fit cleanly into T2V or I2V categories.
It's closest to I2V (image input drives the character) but also requires a video reference.

**Options:**
1. **Add to I2V handlers** with special handling for video reference — simplest, but stretches I2V semantics
2. **New "motion-transfer" category** — cleanest abstraction, but requires new handler infrastructure
3. **Add to avatar/reference handlers** — Kling O1 already has video-to-video handlers in avatar-handlers.ts

**Recommended: Option 3** — The avatar handler infrastructure already supports video + image inputs
(see `handleKlingO1V2V()` and `handleKlingO1Ref2Video()` in `avatar-handlers.ts`). Motion control
is conceptually similar to reference-to-video generation.

---

## Subtasks

### Subtask 1: Request Types (~3 min)

**File to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts`

```typescript
/** Kling 3 Motion Control request via GMI Cloud. */
export interface KlingMotionControlRequest {
	image_url: string;
	video_url: string;
	character_orientation?: "video" | "image";
	mode?: "std" | "pro";
	keep_original_sound?: "yes" | "no";
	prompt?: string;
}
```

### Subtask 2: Generator (~10 min)

**File to create:**
- `apps/web/src/lib/ai-video/generators/gmi-motion-control.ts`

```typescript
export async function generateKlingMotionControlVideo(
	request: KlingMotionControlRequest
): Promise<VideoGenerationResponse> {
	// Use providerRouter.submit("kling-3-motion-control", payload)
	// Map response: outcome.video_url → standard VideoGenerationResponse
}
```

**Key:** The video reference must be uploaded/accessible via URL. The handler will need to
handle video file → URL conversion (similar to how `handleKlingO1V2V` handles `sourceVideo`).

### Subtask 3: UI Model Config (~10 min)

Register as an avatar/reference model since it requires both image and video inputs.

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — Add `gmi_kling_motion_control`

```typescript
gmi_kling_motion_control: {
	id: "gmi_kling_motion_control",
	name: "Kling 3 Motion Control (GMI)",
	description: "Transfer motion from a reference video to a character image",
	price: "$0.126-0.168/s",
	resolution: "720p",
	max_duration: 30,
	category: "image",
	endpoints: { image_to_video: "kling-3-motion-control" },
	default_params: {
		mode: "std",
		character_orientation: "video",
		keep_original_sound: "yes",
	},
	supportedDurations: [5, 10, 15, 20, 30],
},
```

**Note:** This model needs a **video reference selector** in the UI in addition to the image
selector. If the current I2V UI doesn't support video reference input, this may need to be
deferred to the avatar panel or a dedicated motion-control panel.

### Subtask 4: Handler & Router (~10 min)

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts`
  — Add `handleGmiKlingMotionControl()`
  — Or alternatively add to `avatar-handlers.ts` if using the avatar panel
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts`
  — Add switch case

The handler needs to:
1. Get selected image URL (character image)
2. Get reference video URL (motion source) — **requires video upload or URL input**
3. Build payload with `image_url`, `video_url`, `character_orientation`, `mode`
4. Call `generateKlingMotionControlVideo()`

### Subtask 5: Registry (~5 min)

**File to modify:**
- `electron/native-pipeline/registry-data/image-to-video.ts` — Register `gmi_kling_motion_control`

```typescript
ModelRegistry.register({
	key: "gmi_kling_motion_control",
	name: "Kling 3 Motion Control (GMI)",
	provider: "Kling (via GMI)",
	endpoint: "kling-3-motion-control",
	categories: ["image_to_video", "motion_transfer"],
	description: "Transfer motion from a reference video to a character image",
	pricing: { std: 0.126, pro: 0.168 },
	durationOptions: ["5", "10", "15", "20", "30"],
	defaults: { mode: "std", character_orientation: "video" },
	features: ["motion_transfer", "keep_audio", "prompt_style_guide"],
	maxDuration: 30,
	inputRequirements: {
		required: ["image_url", "video_url"],
		optional: ["character_orientation", "mode", "keep_original_sound", "prompt"],
	},
	extendedFeatures: {
		start_frame: true,
		end_frame: false,
		ref_images: false,
		audio_input: false,
		audio_generate: false,
		ref_video: true,
	},
	costEstimate: 1.26,
	processingTime: 120,
	providerBackend: "gmi",
});
```

### Subtask 6: Exports & Tests (~5 min)

**Files to modify:**
- `apps/web/src/lib/ai-video/index.ts` — Export `generateKlingMotionControlVideo`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handler-exports.test.ts` — Update counts
- `electron/__tests__/cli-commands-phase4.test.ts` — Verify model registered

---

## Implementation Order

```
Subtask 1 (types)
    ↓
Subtask 2 (generator)
    ↓
Subtask 3 (UI config) + Subtask 4 (handler) + Subtask 5 (registry)  ← parallel
    ↓
Subtask 6 (exports & tests)
```

**Estimated total:** ~45 minutes

## Dependencies & Blockers

- **Video reference input UI** — The current I2V panel supports image input but may not have
  a video reference selector. If not, the motion control model can initially be CLI-only
  (via native pipeline) and UI support added when the video reference input is built.
- **Video upload** — Need to confirm how video files are uploaded to get a URL for the GMI API.
  Check if existing avatar handlers (`handleKlingO1V2V`) have solved this already.

## Notes

- The `prompt` parameter controls background/lighting/style only — motion is entirely driven
  by the reference video. Make this clear in the UI tooltip.
- `character_orientation: "video"` allows up to 30s output, `"image"` only ~10s.
  Default to `"video"` for maximum flexibility.
- The model preserves the character's appearance from the image while adopting motion from
  the video — this is motion transfer, not video-to-video editing.
