# Luma Ray 3.2 Multi-Keyframe Support Plan

## Goal

Support Ray 3.2 multi-frame direction as a first-class QCut CLI feature, instead of stretching the existing two-frame `start_frame` / `end_frame` path. The implementation should preserve existing commands while exposing the newer official `video.keyframes` surface for long-term storyboard and reference-driven workflows.

## Official API Shape

Ray 3.2 supports two image-to-video control surfaces:

- Legacy anchors: `video.start_frame` and `video.end_frame`.
- Multi-keyframes: `video.keyframes` plus `video.keyframe_indexes`.

The multi-keyframe form pins each image reference to a specific output-frame index. It accepts the same image reference shapes as other Luma media refs: `url`, base64 `data` with `media_type`, uploaded `file_id`, or prior `generation_id`.

Important constraints:

- `video.keyframes` is only for `model: "ray-3.2"` with `type: "video"`.
- `video.keyframes` is mutually exclusive with `video.start_frame`, `video.end_frame`, and `video.loop`.
- `video.keyframes.length` must match `video.keyframe_indexes.length`.
- For 24fps output, 5s maps to frame range `0..120`; 10s maps to `0..240`.
- Luma's API reference currently says 1-64 anchors. Keep QCut's internal validation aligned with the API surface but use small counts in smoke tests.

## CLI Design

Keep old commands stable:

```bash
qcut-pipeline create-video \
  -m luma_ray_3_2 \
  -t "A character turns toward camera" \
  --reference-images start.png \
  --reference-images end.png
```

This continues to map to `start_frame` / `end_frame`.

Add explicit multi-keyframe flags:

```bash
qcut-pipeline create-video \
  -m luma_ray_3_2 \
  -t "A cinematic walk across three storyboard beats" \
  --duration 5s \
  --keyframe-images frame-1.png \
  --keyframe-images frame-2.png \
  --keyframe-images frame-3.png \
  --keyframe-indexes 0 \
  --keyframe-indexes 60 \
  --keyframe-indexes 120
```

If `--keyframe-indexes` is omitted, QCut evenly distributes indexes across the duration:

- 1 image, 5s: `[0]`
- 3 images, 5s: `[0, 60, 120]`
- 5 images, 10s: `[0, 60, 120, 180, 240]`

## Implementation Boundaries

Files to update:

- `electron/native-pipeline/cli/command-registry.ts`
  - Expose `--keyframe-images` and `--keyframe-indexes` in create-video help.
- `electron/native-pipeline/cli/cli.ts`
  - Parse both flags as repeatable strings.
- `electron/native-pipeline/cli/cli-runner/types.ts`
  - Add `keyframeImages` and `keyframeIndexes`.
- `electron/native-pipeline/cli/cli-runner/handler-generate.ts`
  - Stage the explicit CLI fields into stable executor params.
  - Include them in sidecar JSON inputs.
- `electron/native-pipeline/execution/step-executors.ts`
  - Convert local keyframe images to Luma `ImageRef` values using the same path as start/end frames.
  - Validate frame count, index count, integer indexes, range, uniqueness, and mutual exclusions.
- Tests:
  - CLI staging tests for the new flags.
  - Executor payload tests for auto indexes, explicit indexes, local image encoding, and validation failures.

## Verification

Local verification should include:

```bash
npx vitest run electron/native-pipeline/execution/__tests__/step-executors-luma.test.ts
npx vitest run electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-duration.test.ts
```

The target evidence is not a real Luma spend test; it is deterministic verification that QCut emits the official payload shape and rejects invalid combinations before the request leaves the CLI.
