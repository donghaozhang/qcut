# Subtask 2 — Generator Functions

Add a UI-facing generator (React app) and confirm the ViMax adapter
path works without changes.

## Files

- `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` — new function
- `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts` — new function
- `apps/web/src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts` — test (subtask 5)
- `apps/web/src/lib/ai-video/generators/__tests__/gmi-image-to-video.test.ts` — test (subtask 5)
- `electron/native-pipeline/vimax/adapters/video-adapter.ts` — **no change**; registry-driven routing (see video-adapter.ts:72-87) handles this automatically.

## Payload shape (critical)

Seedance 260128 does **not** share any field names with Kling Omni:

| Our param          | GMI field           | Notes |
|--------------------|---------------------|-------|
| `prompt`           | `prompt`            | required |
| `duration` (number)| `duration`          | int 4–15 |
| `resolution`       | `resolution`        | `"480p" | "720p" | "1080p"` |
| `aspectRatio`      | `ratio`             | NOT `aspect_ratio` |
| `seed`             | `seed`              | uint32 |
| `watermark`        | `watermark`         | bool |
| `generateAudio`    | `generate_audio`    | bool, default `true` server-side |
| `webSearch`        | `web_search`        | bool |
| `firstFrame`       | `first_frame`       | URL |
| `lastFrame`        | `last_frame`        | URL |
| `referenceImages`  | `reference_images`  | `string[]` |
| `referenceVideos`  | `reference_videos`  | `string[]` |
| `referenceAudios`  | `reference_audios`  | `string[]` |
| `referenceAssetIds`| `reference_asset_ids`| `string[]` |

Omit undefined keys; do not coerce to empty strings / empty arrays
(the server rejects some empty-array inputs).

## `gmi-text-to-video.ts` — append

```ts
/** Shared param typing so UI + pipelines stay honest. */
export interface Seedance260128Params {
  prompt: string;
  duration?: number;                           // 4–15
  resolution?: "480p" | "720p" | "1080p";
  ratio?: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive";
  seed?: number;
  watermark?: boolean;
  generateAudio?: boolean;
  webSearch?: boolean;
  referenceImages?: string[];
  referenceVideos?: string[];
  referenceAudios?: string[];
  referenceAssetIds?: string[];
}

export async function generateSeedance260128TextVideo(
  params: Seedance260128Params
): Promise<VideoGenerationResponse> {
  const jobId = generateJobId();
  const payload: Record<string, unknown> = { prompt: params.prompt };

  if (params.duration != null) payload.duration = params.duration;
  if (params.resolution) payload.resolution = params.resolution;
  if (params.ratio) payload.ratio = params.ratio;
  if (params.seed != null) payload.seed = params.seed;
  if (params.watermark != null) payload.watermark = params.watermark;
  if (params.generateAudio != null) payload.generate_audio = params.generateAudio;
  if (params.webSearch != null) payload.web_search = params.webSearch;
  if (params.referenceImages?.length) payload.reference_images = params.referenceImages;
  if (params.referenceVideos?.length) payload.reference_videos = params.referenceVideos;
  if (params.referenceAudios?.length) payload.reference_audios = params.referenceAudios;
  if (params.referenceAssetIds?.length) payload.reference_asset_ids = params.referenceAssetIds;

  const submit = await providerRouter.submit(
    "seedance-2-0-260128",
    payload,
    "gmi"
  );
  const poll = await providerRouter.poll(submit.requestId, submit.provider);
  if (poll.status === "failed") {
    throw new Error(poll.error ?? "GMI Seedance 2.0 260128 text-to-video failed");
  }
  return {
    job_id: jobId,
    status: "completed",
    message: "Video generated with GMI Seedance 2.0 260128",
    estimated_time: 0,
    video_url: poll.videoUrl,
    video_data: poll,
  };
}
```

## `gmi-image-to-video.ts` — append

```ts
export interface Seedance260128ImageParams extends Seedance260128Params {
  firstFrame: string;            // required — I2V anchor
  lastFrame?: string;
}

export async function generateSeedance260128ImageVideo(
  params: Seedance260128ImageParams
): Promise<VideoGenerationResponse> {
  const jobId = generateJobId();
  const payload: Record<string, unknown> = {
    prompt: params.prompt,
    first_frame: params.firstFrame,
  };
  if (params.lastFrame) payload.last_frame = params.lastFrame;
  // ...copy the same optional-field mapping as T2V...

  const submit = await providerRouter.submit(
    "seedance-2-0-260128",
    payload,
    "gmi"
  );
  const poll = await providerRouter.poll(submit.requestId, submit.provider);
  if (poll.status === "failed") {
    throw new Error(poll.error ?? "GMI Seedance 2.0 260128 image-to-video failed");
  }
  return {
    job_id: jobId,
    status: "completed",
    message: "Video generated with GMI Seedance 2.0 260128 (I2V)",
    estimated_time: 0,
    video_url: poll.videoUrl,
    video_data: poll,
  };
}
```

Extract the optional-field mapping into a small private helper in one
of the files (don't duplicate between T2V and I2V). Keep it in the
same module — do not create a new file just for the helper.

## ViMax adapter — zero code change

`resolveVideoModelSpec` already returns `providerBackend: "gmi"` from
the registry entry; `buildImageField(imagePath, "gmi")` already emits
the right field name. Seedance's first-frame field is `first_frame`,
not `image`, so the adapter's generic `{ prompt, image, duration }`
payload would be wrong — but the ViMax video adapter only runs for
standard image-to-video flows; Seedance-specific flows go through the
new generator above.

If ViMax needs Seedance support later, add a narrow branch inside
`VideoGeneratorAdapter.generate` that checks
`spec.canonicalKey === "gmi_seedance_2_0_260128_i2v"` and maps the
payload accordingly. Defer until there's a caller.

## Acceptance

- `bun check-types` passes.
- A direct call to `generateSeedance260128TextVideo({ prompt: "..." })`
  with `GMI_API_KEY` set submits, polls, and returns a `video_url`.
- Mock mode (no key) still falls back cleanly via the provider router's
  existing mock path.
