# Subtask 1 — Model Registry Entries

Register `seedance-2-0-260128` under both `text_to_video` and
`image_to_video` categories so it's discoverable from the ViMax CLI,
the editor UI, and the provider router.

## Files

- `electron/native-pipeline/registry-data/text-to-video.ts`
- `electron/native-pipeline/registry-data/image-to-video.ts`
- `electron/native-pipeline/infra/registry.ts` (no code change — read
  to confirm `ModelDefinition` schema covers all fields used)

## T2V entry (`registry-data/text-to-video.ts`)

Append after `seedance_2_0` (keep the GMI block cohesive):

```ts
ModelRegistry.register({
  key: "gmi_seedance_2_0_260128_t2v",
  name: "ByteDance Seedance 2.0 260128 T2V (GMI)",
  provider: "ByteDance (via GMI)",
  endpoint: "seedance-2-0-260128",
  categories: ["text_to_video"],
  description:
    "Next-gen Seedance with native audio, reference assets, " +
    "and 4–15s durations via GMI Cloud.",
  pricing: { per_second: 0.052 },
  durationOptions: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
  aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
  resolutions: ["480p", "720p", "1080p"],
  defaults: {
    duration: 5,
    resolution: "720p",
    ratio: "16:9",
    generate_audio: true,
    watermark: false,
    web_search: false,
  },
  features: [
    "audio_generation",
    "reference_images",
    "reference_videos",
    "reference_audios",
    "seed_control",
    "web_search",
    "watermark_toggle",
    "flexible_duration",
    "multiple_aspect_ratios",
  ],
  maxDuration: 15,
  costEstimate: 0.26, // 5s × $0.052
  processingTime: 120,
  providerBackend: "gmi",
});
```

## I2V entry (`registry-data/image-to-video.ts`)

Append to the GMI Cloud block (after `gmi_kling_motion_control`):

```ts
ModelRegistry.register({
  key: "gmi_seedance_2_0_260128_i2v",
  name: "ByteDance Seedance 2.0 260128 I2V (GMI)",
  provider: "ByteDance (via GMI)",
  endpoint: "seedance-2-0-260128",
  categories: ["image_to_video"],
  description:
    "Seedance 2.0 image-to-video with first/last-frame anchoring, " +
    "reference assets, and native audio.",
  pricing: { per_second: 0.052 },
  durationOptions: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
  aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
  resolutions: ["480p", "720p", "1080p"],
  defaults: {
    duration: 5,
    resolution: "720p",
    ratio: "16:9",
    generate_audio: true,
    watermark: false,
    web_search: false,
  },
  features: [
    "audio_generation",
    "end_frame",
    "reference_images",
    "reference_videos",
    "reference_audios",
    "seed_control",
    "flexible_duration",
  ],
  maxDuration: 15,
  inputRequirements: {
    required: ["prompt", "first_frame"],
    optional: [
      "last_frame",
      "reference_images",
      "reference_videos",
      "reference_audios",
      "reference_asset_ids",
      "duration",
      "resolution",
      "ratio",
      "seed",
      "generate_audio",
      "watermark",
      "web_search",
    ],
  },
  extendedFeatures: {
    start_frame: true,
    end_frame: true,
    ref_images: true,
    audio_input: true,   // reference_audios
    audio_generate: true,
    ref_video: true,
  },
  costEstimate: 0.26,
  processingTime: 120,
  providerBackend: "gmi",
});
```

## Validation

- Run `bun check-types` — the `ModelDefinition` type must accept both
  entries without casts.
- Run `ModelRegistry.keysForCategory("text_to_video")` / `"image_to_video"`
  from a one-off script or REPL and confirm both new keys appear.
- `resolveVideoModelSpec("gmi_seedance_2_0_260128_i2v")` in the ViMax
  video adapter must return `providerBackend: "gmi"` and
  `costPerSecond: 0.052`.

## Acceptance

- `bun run pipeline` → `qcut system models --category image_to_video --json`
  lists both keys with `providerBackend: "gmi"`.
- `bun check-types` passes.
