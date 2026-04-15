# Subtask 4 — Model Handler Wiring

Route the UI-selected model through to the new generator, mapping
UI-level fields (`aspect_ratio`, `generate_audio`, etc.) to the
Seedance payload contract.

## Files

- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers-gmi.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts`

## T2V handler

In `text-to-video-handlers.ts`, add:

```ts
export async function handleSeedance260128T2V(
  ctx: ModelHandlerContext,
  s: TextToVideoSettings
): Promise<ModelHandlerResult> {
  await enforceCreditRequirement(ctx, {
    modelKey: "gmi_seedance_2_0_260128_t2v",
    params: { duration: s.duration ?? 5 },
  });

  const result = await generateSeedance260128TextVideo({
    prompt: s.prompt,
    duration: s.duration ?? 5,
    resolution: s.resolution as "480p" | "720p" | "1080p" | undefined,
    ratio: s.aspectRatio as Seedance260128Params["ratio"] | undefined,
    generateAudio: s.generateAudio,
    seed: s.seed,
  });

  return { videoUrl: result.video_url, raw: result };
}
```

Import `generateSeedance260128TextVideo` and `Seedance260128Params`
from `@/lib/ai-video/generators/gmi-text-to-video`.

## I2V handler

In `image-to-video-handlers-gmi.ts`, add:

```ts
export async function handleSeedance260128I2V(
  ctx: ModelHandlerContext,
  s: ImageToVideoSettings
): Promise<ModelHandlerResult> {
  if (!s.imageUrl) {
    throw new Error("Seedance 2.0 260128 I2V requires a first-frame image");
  }
  await enforceCreditRequirement(ctx, {
    modelKey: "gmi_seedance_2_0_260128_i2v",
    params: { duration: s.duration ?? 5 },
  });

  const result = await generateSeedance260128ImageVideo({
    prompt: s.prompt,
    firstFrame: s.imageUrl,
    lastFrame: s.endImageUrl,
    duration: s.duration ?? 5,
    resolution: s.resolution,
    ratio: s.aspectRatio,
    generateAudio: s.generateAudio,
    seed: s.seed,
    referenceImages: s.referenceImages,
  });

  return { videoUrl: result.video_url, raw: result };
}
```

## Router wiring

In `model-handlers.ts`, add to the T2V switch:

```ts
case "gmi_seedance_2_0_260128_t2v":
  return handleSeedance260128T2V(ctx, settings);
```

And the I2V switch:

```ts
case "gmi_seedance_2_0_260128_i2v":
  return handleSeedance260128I2V(ctx, settings);
```

Update the import lists at the top of `model-handlers.ts`
(`handleSeedance260128T2V` in the text-to-video-handlers group,
`handleSeedance260128I2V` in the image-to-video-handlers-gmi group).

## Defensive mapping notes

- The UI's `aspectRatio` holds values like `"16:9"`; forward verbatim
  (they match the GMI `ratio` enum). Assert the type narrowly.
- `s.duration` comes through as a number; pass as-is. Do **not**
  stringify — Seedance expects `integer`.
- `s.resolution` from the capability map is already one of the three
  allowed values. Cast narrowly, don't runtime-validate.
- `generateAudio` / `seed` / `endImageUrl` are optional — pass through
  only when present.

## Acceptance

- `bun check-types` passes.
- `bun dev` → submit a Seedance T2V request end-to-end with a real
  `GMI_API_KEY`; the request appears in the GMI console with
  `model: "seedance-2-0-260128"` and the correct payload.
- Credit guard fires before the request (confirms the model key is
  recognised in the credit cost map from subtask 6 / credit-costs).
