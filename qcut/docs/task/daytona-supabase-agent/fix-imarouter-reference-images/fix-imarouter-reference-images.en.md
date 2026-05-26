# Fix IMA Router Ref2V `--reference-images`

## Problem

`qcut gen video -m imarouter_seedance_2_0_ref2v --reference-images <local.png>` currently accepts the CLI argument, but the image is not actually sent to IMA Router as a video reference.

The generated sidecar JSON may show:

```json
"inputs": {
  "reference_images": ["/tmp/qcut-output/example.png"]
},
"params": {
  "duration": 5,
  "aspect_ratio": "16:9",
  "resolution": "720p"
}
```

That means the CLI recorded the input option, but the final payload did not contain `images: ["asset://..."]`.

## Root Cause

`--reference-images` is parsed into `options.referenceImages`, but for `create-video` the CLI only maps that list for:

- `happy_horse_ref2v` -> `params.image_urls`
- `happy_horse_video_edit` -> `params.reference_image_urls`

IMA Router Ref2V models are not handled there:

- `imarouter_seedance_2_0_ref2v`
- `imarouter_seedance_2_0_cn_ref2v`

The IMA Router asset upload path currently runs only when `input.imageUrl` is set. That path:

1. Uploads/registers the image with IMA Router asset APIs.
2. Waits for review approval.
3. Sends `payload.images = ["asset://..."]`.

When the user passes `--reference-images`, `input.imageUrl` is empty, so this IMA asset flow is skipped.

## Recommended Fix

Fix this in `electron/native-pipeline/execution/step-executors.ts`, inside `executeImageToVideo`, before `reshapeForImaRouter(payload)` and before `callModelApi`.

Add a branch for IMA Router Ref2V payload references:

```ts
const isImaRouterRef2V =
  provider === "imarouter" &&
  (model.key === "imarouter_seedance_2_0_ref2v" ||
    model.key === "imarouter_seedance_2_0_cn_ref2v");

if (isImaRouterRef2V && Array.isArray(payload.image_urls)) {
  const raw = (payload.image_urls as string[]).slice(0, 14);
  const { channelFor, ensureGroup, uploadAsset } = await import(
    "../infra/imarouter-assets.js"
  );
  const { envApiKeyProvider } = await import("../infra/api-caller.js");
  const apiKey = await envApiKeyProvider("imarouter");
  if (!apiKey) {
    return {
      success: false,
      error: "IMAROUTER_API_KEY not configured",
      duration: 0,
    };
  }

  const channel = channelFor(model.key);
  const groupId = await ensureGroup(channel, { apiKey });
  const assets: string[] = [];

  for (const entry of raw) {
    if (/^asset:\/\//i.test(entry)) {
      assets.push(entry);
      continue;
    }

    const sourceUrl = /^https?:\/\//i.test(entry)
      ? entry
      : (await uploadToFalStorage(entry)).url;

    if (!sourceUrl) {
      return {
        success: false,
        error: `Failed to upload reference image: ${entry}`,
        duration: 0,
      };
    }

    assets.push(
      await uploadAsset(sourceUrl, channel, groupId, {
        apiKey,
        signal: options.signal,
      })
    );
  }

  payload.images = assets;
  delete payload.image_urls;
}
```

Also update `electron/native-pipeline/cli/cli-runner/handler-generate.ts` so IMA Router Ref2V models stage `--reference-images` under `params.image_urls`:

```ts
if (
  options.model === "imarouter_seedance_2_0_ref2v" ||
  options.model === "imarouter_seedance_2_0_cn_ref2v"
) {
  params.image_urls = options.referenceImages.slice(0, 14);
}
```

## Better Long-Term Refactor

Create a shared resolver for video reference images:

```ts
resolveVideoReferenceImages({
  entries,
  provider,
  modelKey,
  signal,
  onProgress,
})
```

It should return provider-ready references:

- FAL / GMI: HTTPS URLs or provider-specific arrays.
- IMA Router: `asset://...` references.
- Existing `asset://...`: pass through unchanged.

This avoids having separate upload logic for `--image-url`, `--reference-images`, Happy Horse, Vidu, Seedance, and IMA Router.

## Test Plan

Run a local command:

```bash
QCUT_OUTPUT_DIR=/tmp/qcut-output qcut gen video \
  -m imarouter_seedance_2_0_ref2v \
  --reference-images /tmp/qcut-output/example.png \
  -t "5 second video using the reference character, not as first frame" \
  -d 5s \
  --aspect-ratio 16:9 \
  --resolution 720p \
  --json
```

Expected sidecar:

```json
"params": {
  "images": ["asset://..."]
}
```

or equivalent final payload evidence showing `images` was sent to IMA Router.

Also test:

- `--image-url <local.png>` still works for I2V.
- `happy_horse_ref2v --reference-images <local.png>` still uploads through the FAL path.
- CN model `imarouter_seedance_2_0_cn_ref2v` uses the CN upload channel.

## Immediate Workaround

For a single reference image, use:

```bash
qcut gen video \
  -m imarouter_seedance_2_0_ref2v \
  --image-url /path/to/reference.png \
  ...
```

That path already triggers IMA Router asset upload and sends `images: ["asset://..."]`.
