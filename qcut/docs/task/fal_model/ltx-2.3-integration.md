# LTX 2.3 Video Generation Integration

**Date**: 2026-03-07
**Estimated Total**: ~60 minutes (5 subtasks)
**Priority**: High — LTX 2.3 adds 4K, audio-to-video, and up to 20s duration at competitive pricing

---

## Overview

Integrate Lightricks LTX 2.3 video generation models into QCut. LTX 2.3 offers four variants across three modalities:

| Variant | Endpoint | Durations | Max Res | Audio | Price/sec |
|---------|----------|-----------|---------|-------|-----------|
| Text-to-Video (Pro) | `fal-ai/ltx-2.3/text-to-video` | 6, 8, 10s | 2160p | Yes | $0.06-$0.24 |
| Text-to-Video (Fast) | `fal-ai/ltx-2.3/text-to-video/fast` | 6-20s | 2160p | Yes | $0.04-$0.16 |
| Image-to-Video (Fast) | `fal-ai/ltx-2.3/image-to-video/fast` | 6-20s | 2160p | Yes | $0.04-$0.16 |
| Audio-to-Video | `fal-ai/ltx-2.3/audio-to-video` | 6, 8, 10s | 2160p | N/A (input) | $0.10 |

**Key upgrades over LTX v2**: 4K (2160p) support, native audio generation, audio-to-video mode, longer durations (up to 20s fast), 48/50fps options, `end_image_url` for transitions.

---

## Subtask 1: Model Registry & Constants (~10 min)

Register the 4 new LTX 2.3 model variants in the model configuration system.

### Files to modify

**Text-to-Video models:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`
  - Add `ltx23_pro_t2v` and `ltx23_fast_t2v` entries to `T2V_MODELS`
  - Follow existing `ltxv2_pro_t2v` / `ltxv2_fast_t2v` pattern
  - Endpoints: `fal-ai/ltx-2.3/text-to-video` and `fal-ai/ltx-2.3/text-to-video/fast`

- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts`
  - Add `ltx23_pro_t2v` and `ltx23_fast_t2v` to display order (above LTX v2 entries)

- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts`
  - Add capability flags: `audio_generation: true`, `4k: true`, `portrait: true`

**Image-to-Video models:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`
  - Add `ltx23_fast_i2v` with endpoint `fal-ai/ltx-2.3/image-to-video/fast`
  - Include `end_image_url` support flag (transition generation)

**Audio-to-Video model (NEW modality):**
- `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts`
  - Add `ltx23_audio2video` as a new model category or extend existing structure
  - This is the first audio-to-video model — may need a new category

**CLI model registry:**
- `electron/native-pipeline/cli/cli-handlers-media.ts`
  - Add LTX 2.3 model keys to the CLI model list returned by `list-models`

### Model config template

```typescript
ltx23_fast_t2v: {
  id: "ltx23_fast_t2v",
  name: "LTX Video 2.3 Fast",
  description: "Fast text-to-video with 4K support and native audio, up to 20s",
  price: "$0.04/s (1080p), $0.08/s (1440p), $0.16/s (2160p)",
  resolution: "Up to 2160p (4K)",
  max_duration: 20,
  category: "text",
  endpoints: { text_to_video: "fal-ai/ltx-2.3/text-to-video/fast" },
  default_params: {
    duration: 6,
    resolution: "1080p",
    fps: 25,
    generate_audio: true,
  },
  supportedResolutions: ["1080p", "1440p", "2160p"],
  supportedDurations: [6, 8, 10, 12, 14, 16, 18, 20],
  supportedFps: [24, 25, 48, 50],
},
```

### API parameter mapping

| FAL Parameter | QCut Parameter | Notes |
|---------------|----------------|-------|
| `prompt` | `text` / `prompt` | Required for all except audio-to-video with image |
| `duration` | `duration` | Enum: 6,8,10,12,14,16,18,20 (fast) or 6,8,10 (pro/audio) |
| `resolution` | `resolution` | "1080p", "1440p", "2160p" |
| `aspect_ratio` | `aspect_ratio` | "16:9", "9:16" (image-to-video also supports "auto") |
| `fps` | `fps` | 24, 25, 48, 50 |
| `generate_audio` | `generate_audio` | Boolean, default true |
| `image_url` | `image_url` | For I2V and optional A2V |
| `end_image_url` | `end_image_url` | **New** — I2V transition support |
| `audio_url` | `audio_url` | **New** — A2V only, 2-20s audio input |
| `guidance_scale` | `guidance_scale` | A2V only, default 5-9 |

---

## Subtask 2: Validators & Generator Functions (~15 min)

Create validation logic and FAL request generators for LTX 2.3.

### Files to modify

**Validators:**
- `apps/web/src/lib/ai-video/validation/validators/ltxv2-validators.ts`
  - Rename or extend to `ltx-validators.ts` to cover both v2 and v2.3
  - Add `validateLTX23Duration(duration, modelId)` — Pro allows 6/8/10, Fast allows 6-20
  - Add `validateLTX23Resolution(resolution)` — 1080p/1440p/2160p
  - Add `validateLTX23FastExtendedConstraints(duration, resolution, fps)` — durations >10s limited to 1080p + 25fps
  - Add `validateLTX23AudioDuration(audioUrl, duration)` — audio 2-20s constraint
  - Add `isLTX23Model(modelId)` type guard

**Generators:**
- `apps/web/src/lib/ai-video/generators/text-to-video/ltx23-generator.ts` **(NEW)**
  - `generateLTX23TextVideo(request: LTX23T2VRequest): Promise<VideoGenerationResponse>`
  - Payload: `{ prompt, duration, resolution, aspect_ratio, fps, generate_audio }`
  - Uses `makeFalRequest()` from `core/fal-request.ts`
  - Follow pattern from `ltxv2-generator.ts`

- `apps/web/src/lib/ai-video/generators/image-to-video/ltx23-i2v-generator.ts` **(NEW)**
  - `generateLTX23ImageVideo(request: LTX23I2VRequest): Promise<VideoGenerationResponse>`
  - Payload: `{ image_url, end_image_url?, prompt, duration, resolution, aspect_ratio, fps, generate_audio }`

- `apps/web/src/lib/ai-video/generators/audio-to-video/ltx23-a2v-generator.ts` **(NEW)**
  - `generateLTX23AudioVideo(request: LTX23A2VRequest): Promise<VideoGenerationResponse>`
  - Payload: `{ audio_url, image_url?, prompt?, guidance_scale?, resolution?, aspect_ratio?, fps? }`
  - First audio-to-video generator in QCut — may need new directory

### Types to add

```typescript
// In a shared types file or inline
interface LTX23T2VRequest {
  prompt: string;
  duration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
  resolution?: "1080p" | "1440p" | "2160p";
  aspect_ratio?: "16:9" | "9:16";
  fps?: 24 | 25 | 48 | 50;
  generate_audio?: boolean;
}

interface LTX23I2VRequest extends LTX23T2VRequest {
  image_url: string;
  end_image_url?: string;  // transition support
}

interface LTX23A2VRequest {
  audio_url: string;
  image_url?: string;
  prompt?: string;
  guidance_scale?: number;
  duration?: 6 | 8 | 10;
  resolution?: "1080p" | "1440p" | "2160p";
  aspect_ratio?: "16:9" | "9:16";
  fps?: 24 | 25 | 48 | 50;
}
```

---

## Subtask 3: Handler Routing & Cost Calculation (~10 min)

Wire the new models into the generation pipeline's handler router and cost estimation.

### Files to modify

**Handler routing:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts`
  - Add cases to `routeTextToVideoHandler()`:
    - `"ltx23_pro_t2v"` → `handleLTX23ProT2V()`
    - `"ltx23_fast_t2v"` → `handleLTX23FastT2V()`
  - Add to `routeImageToVideoHandler()` (or equivalent):
    - `"ltx23_fast_i2v"` → `handleLTX23FastI2V()`

**Handler implementations:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts`
  - Add `handleLTX23ProT2V(ctx)` and `handleLTX23FastT2V(ctx)` functions
  - Call `generateLTX23TextVideo()` with validated params

- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts`
  - Add `handleLTX23FastI2V(ctx)` function

**Audio-to-video handler (NEW):**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/audio-to-video-handlers.ts` **(NEW)**
  - Add `handleLTX23AudioToVideo(ctx)` function
  - Needs audio file upload via `fal-upload.ts` before generation

**Cost estimation:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/credit-guard.ts` (or equivalent cost calculation file)
  - Add LTX 2.3 pricing tiers:
    - T2V Pro: $0.06/s (1080p), $0.12/s (1440p), $0.24/s (2160p)
    - T2V/I2V Fast: $0.04/s (1080p), $0.08/s (1440p), $0.16/s (2160p)
    - A2V: $0.10/s (all resolutions)

**CLI model handler:**
- `electron/native-pipeline/cli/cli-handlers-media.ts`
  - Add LTX 2.3 model keys to generation command routing
  - Map CLI `--model ltx23_fast_t2v` to correct endpoint

---

## Subtask 4: UI — Settings Components & Audio-to-Video Tab (~15 min)

Build model-specific settings UI and the new audio-to-video input mode.

### Files to modify

**LTX 2.3 T2V settings:**
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-ltx23-t2v-settings.tsx` **(NEW)**
  - Duration selector: dropdown with 6-20s options (fast) or 6/8/10 (pro)
  - Resolution selector: 1080p / 1440p / 2160p
  - FPS selector: 24 / 25 / 48 / 50
  - Audio generation toggle (default on)
  - Aspect ratio: 16:9 / 9:16
  - Constraint warning: durations >10s force 1080p + 25fps

**LTX 2.3 I2V settings:**
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-ltx23-i2v-settings.tsx` **(NEW)**
  - Same as T2V plus:
  - Image upload for start frame (required)
  - Optional end image upload for transitions (`end_image_url`)
  - Aspect ratio defaults to "auto" (inferred from image)

**Audio-to-Video UI (NEW modality):**
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-audio-to-video-panel.tsx` **(NEW)**
  - Audio file upload/drag-drop (2-20s constraint, show duration)
  - Optional image upload for first frame
  - Prompt textarea (required if no image)
  - Guidance scale slider (1-20, default 5-9)
  - Generate button with cost estimate

**Media panel tab integration:**
- `apps/web/src/components/editor/media-panel/views/ai/ai-video-panel.tsx` (or equivalent)
  - If audio-to-video is a new tab in the AI panel, add it to the tab list
  - Or integrate as a sub-mode within existing AI Video panel

**Settings hook:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-settings.ts` (or equivalent)
  - Add LTX 2.3 specific state: `resolution`, `fps`, `generateAudio`, `endImageUrl`, `audioUrl`, `guidanceScale`

### Settings component pattern

Follow existing `ai-ltx-i2v-settings.tsx` pattern:
```tsx
export function AILtx23T2VSettings({ modelId }: { modelId: string }) {
  const isPro = modelId === "ltx23_pro_t2v";
  const durations = isPro ? [6, 8, 10] : [6, 8, 10, 12, 14, 16, 18, 20];
  // ... render duration/resolution/fps/audio selectors
}
```

---

## Subtask 5: Tests & Documentation (~10 min)

### Unit tests

- `apps/web/src/lib/ai-video/validation/__tests__/ltx23-validators.test.ts` **(NEW)**
  - Test duration validation for Pro vs Fast variants
  - Test resolution validation (1080p/1440p/2160p)
  - Test extended duration constraint (>10s → 1080p + 25fps only)
  - Test audio duration constraint (2-20s)
  - Test `isLTX23Model()` type guard

- `apps/web/src/lib/ai-video/generators/__tests__/ltx23-generator.test.ts` **(NEW)**
  - Test payload construction for each variant
  - Test endpoint selection (pro vs fast)
  - Mock `makeFalRequest` and verify correct parameters
  - Test error handling for missing prompt / invalid params

### Documentation

- `docs/technical/media-panel-reference.md`
  - Update AI Video panel section with LTX 2.3 models
  - Document audio-to-video as new capability

- Update model count in any relevant docs

### CLI integration test

```bash
# Verify models appear in listing
bun run pipeline list-models --json | grep ltx23

# Verify cost estimation
bun run pipeline estimate-cost --model ltx23_fast_t2v --duration 10 --resolution 1080p

# Generate (manual E2E)
bun run pipeline editor:generate:start \
  --project-id <id> \
  --model ltx23_fast_t2v \
  --text "A love story in the rain" \
  --poll
```

---

## Architecture Decisions

### Why separate generator files (not extend ltxv2-generator.ts)
- LTX 2.3 uses different FAL endpoints (`ltx-2.3/` vs `ltxv-2/`)
- New parameters (`end_image_url`, `audio_url`, `guidance_scale`)
- New modality (audio-to-video) has fundamentally different input
- Keeps ltxv2 code stable for existing users

### Audio-to-Video: new tab vs sub-mode
- **Recommendation**: Add as a sub-mode within the AI Video panel (new `aiActiveTab` value: `"audio"`)
- Avoids adding a new top-level panel
- Consistent with how text/image/avatar/upscale tabs already work
- Requires update to `apps/web/src/components/editor/media-panel/store.ts` (`aiActiveTab` type)

### Transition support (end_image_url)
- Only available on I2V Fast variant
- Show optional "End Frame" upload in I2V settings when LTX 2.3 is selected
- Hide for other I2V models

---

## Dependency Map

```
Subtask 1 (Registry)
    ↓
Subtask 2 (Validators + Generators)  ←  can start after model IDs are defined
    ↓
Subtask 3 (Handler Routing)  ←  needs generators
    ↓
Subtask 4 (UI Components)  ←  needs handlers + model configs
    ↓
Subtask 5 (Tests)  ←  needs all above
```

Subtasks 1 and 2 can be partially parallelized. Subtask 5 (tests) should run last.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Audio-to-video is a new modality | Keep scope minimal — single model, simple UI, extend later |
| 4K generation may be slow | FAL queue handles this; polling already supports long waits |
| Extended duration constraint (>10s = 1080p only) | Validator enforces at input; UI disables resolution picker |
| `end_image_url` adds complexity to I2V | Optional field, hidden by default, only shown for LTX 2.3 |
| Pricing varies by resolution | Cost estimator must accept resolution parameter |
