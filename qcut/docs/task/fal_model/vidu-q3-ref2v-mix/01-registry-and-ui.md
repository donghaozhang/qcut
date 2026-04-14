# Subtask 1 — Registry + UI Model Config

Register `vidu_q3_ref2v_mix` so the pipeline executor and the
editor's model picker both see it. Mirror the existing `vidu_q3_i2v`
entry, swap endpoint + audio field name + add `requiredInputs`.

## Files

- `electron/native-pipeline/registry-data/image-to-video.ts` — new
  registry entry
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — UI
  config + `I2V_MODEL_ORDER` slot

## Registry entry (`registry-data/image-to-video.ts`)

Add immediately after the existing `vidu_q3_i2v` block (or anywhere
in the FAL section — order doesn't matter for runtime):

```ts
ModelRegistry.register({
  key: "vidu_q3_ref2v_mix",
  name: "Vidu Q3 Ref2V (mix)",
  provider: "Vidu (via FAL)",
  endpoint: "fal-ai/vidu/q3/reference-to-video/mix",
  categories: ["image_to_video"],
  description:
    "Character-consistent video from 1–4 reference images with native audio. " +
    "Vidu's mix variant — keeps subjects/scenes coherent across the shot.",
  pricing: {
    type: "per_second",
    cost_360p: 0.07,
    cost_540p: 0.07,
    cost_720p: 0.154,
    cost_1080p: 0.154,
  },
  durationOptions: [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
    "11", "12", "13", "14", "15", "16",
  ],
  aspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1"],
  resolutions: ["360p", "540p", "720p", "1080p"],
  defaults: {
    duration: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
    audio: true,                 // NOTE: field is `audio`, not `generate_audio`
  },
  features: [
    "character_consistency",
    "multi_reference",            // up to 4 reference images
    "audio_generation",
    "seed_control",
  ],
  maxDuration: 16,
  inputRequirements: {
    required: ["prompt", "reference_image_urls"],
    optional: ["duration", "seed", "aspect_ratio", "resolution", "audio"],
  },
  extendedFeatures: {
    start_frame: false,
    end_frame: false,
    ref_images: true,             // up to 4
    audio_input: false,
    audio_generate: true,
    ref_video: false,
  },
  costEstimate: 0.62,             // 4s × $0.154/720p, conservative
  processingTime: 180,
  // providerBackend defaults to "fal" — no override needed
});
```

## UI model entry (`image2video-models-config.ts`)

Add after `vidu_q3_i2v`:

```ts
vidu_q3_ref2v_mix: {
  id: "vidu_q3_ref2v_mix",
  name: "Vidu Q3 Ref2V (mix)",
  description:
    "Character-consistent video from up to 4 reference images, with native audio",
  price: "$0.07-0.154/s",
  resolution: "720p",
  max_duration: 16,
  category: "image",
  requiredInputs: ["referenceImage"],
  endpoints: {
    image_to_video: "fal-ai/vidu/q3/reference-to-video/mix",
  },
  default_params: {
    duration: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
    audio: true,
  },
  supportedResolutions: ["360p", "540p", "720p", "1080p"],
  supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  supportedAspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1"],
  perSecondPricing: {
    "360p": 0.07,
    "540p": 0.07,
    "720p": 0.154,
    "1080p": 0.154,
  },
},
```

Append the new key to `I2V_MODEL_ORDER` next to `vidu_q3_i2v`:

```ts
"vidu_q3_i2v",
"vidu_q3_ref2v_mix",
```

`validateModelOrderInvariant` will fail loudly at module load if the
order list and the model map disagree — easy safety net.

## Validation

- `bunx tsc -p apps/web/tsconfig.json --noEmit` passes.
- `qcut system models --category image_to_video --json` lists
  `vidu_q3_ref2v_mix`.
- `ModelRegistry.get("vidu_q3_ref2v_mix").endpoint` equals
  `"fal-ai/vidu/q3/reference-to-video/mix"`.
- Editor model picker shows "Vidu Q3 Ref2V (mix)" entry under FAL.

## Acceptance

- Both registries (CLI + UI) recognize the new key.
- Type-check + existing model-config tests still green.
- Manual smoke: open `bun dev` → AI media panel → I2V dropdown lists
  the model.
