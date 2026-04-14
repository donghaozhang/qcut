# Subtask 3 — UI Model Config (T2V + I2V)

Surface the model in the AI media panel dropdowns and dialog controls.

## Files

### T2V
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts`
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts`

### I2V
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`

## T2V — `models.ts`

Append in the `// --- GMI Cloud models ---` block:

```ts
gmi_seedance_2_0_260128_t2v: {
  id: "gmi_seedance_2_0_260128_t2v",
  name: "Seedance 2.0 260128 (GMI)",
  description:
    "Next-gen ByteDance Seedance via GMI — 4–15s, native audio, " +
    "reference images/videos/audios.",
  price: "$0.052/s",
  resolution: "480p / 720p / 1080p",
  supportedResolutions: ["480p", "720p", "1080p"],
  max_duration: 15,
  category: "text",
  endpoints: {
    text_to_video: "seedance-2-0-260128",
  },
  default_params: {
    duration: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
  },
  supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supportedAspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
},
```

> **Aspect-ratio caveat.** The GMI payload uses `"ratio"` (not
> `"aspect_ratio"`); UI still uses `aspect_ratio` internally. The
> handler in subtask 4 is responsible for the rename at dispatch time.

> **`adaptive` ratio.** Do not expose `adaptive` in the UI dropdown
> yet — the current `AspectRatioPicker` enumerates explicit ratios
> only. Add a follow-up if users request it.

## T2V — `capabilities.ts`

Append to `T2V_MODEL_CAPABILITIES`:

```ts
gmi_seedance_2_0_260128_t2v: {
  supportsAspectRatio: true,
  supportedAspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
  supportsResolution: true,
  supportedResolutions: ["480p", "720p", "1080p"],
  supportsDuration: true,
  supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supportsNegativePrompt: false,
  supportsPromptExpansion: false,
  supportsSeed: true,
  supportsSafetyChecker: false,
  defaultAspectRatio: "16:9",
  defaultResolution: "720p",
  defaultDuration: 5,
},
```

## T2V — `order.ts`

Append to the `// GMI Cloud` block (after `gmi_kling_v3_omni_t2v`):

```ts
"gmi_seedance_2_0_260128_t2v",
```

`validateModelOrderInvariant` will fail the module load if the key is
missing from `T2V_MODELS` — good safety net, no extra wiring needed.

## I2V — `image2video-models-config.ts`

Read the file first to find the GMI I2V block; add a matching entry:

```ts
gmi_seedance_2_0_260128_i2v: {
  id: "gmi_seedance_2_0_260128_i2v",
  name: "Seedance 2.0 260128 I2V (GMI)",
  description:
    "Seedance image-to-video with first/last-frame anchors and " +
    "reference assets.",
  price: "$0.052/s",
  resolution: "480p / 720p / 1080p",
  supportedResolutions: ["480p", "720p", "1080p"],
  max_duration: 15,
  category: "image",
  endpoints: { image_to_video: "seedance-2-0-260128" },
  default_params: {
    duration: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
  },
  supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supportedAspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
},
```

Follow the file's existing order / capability pattern (mirror how
`gmi_kling_v3_omni_i2v` is declared).

## Acceptance

- `bun check-types` passes.
- `bun dev` → AI media panel → T2V dropdown shows "Seedance 2.0 260128
  (GMI)" under the GMI Cloud group.
- Selecting it shows the correct duration / resolution / aspect-ratio
  options; negative-prompt field hidden.
