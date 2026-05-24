# QCut CLI Video Analyze Real E2E

Date: 2026-05-21

## Scope

Verify `qcut analyze video` / `analyze-video` on a short real video and record the result.

Update after correction:

- Default video analysis model is now `openrouter_gemini_3_5_flash_video`.
- Provider is direct OpenRouter.
- Underlying model ID is `google/gemini-3.5-flash`.
- OpenRouter video input uses `/api/v1/chat/completions` with `video_url` content.

Reference:

- https://openrouter.ai/google/gemini-3.5-flash/api
- https://openrouter.ai/docs/guides/overview/multimodal/videos

## Initial Failure

Command:

```bash
bun electron/native-pipeline/cli/cli.ts analyze video \
  -i /Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4 \
  --analysis-type description \
  -o /tmp/qcut-video-analyze-e2e-1779392218 \
  --json
```

Result:

```json
{
  "status": "error",
  "error": "FAL upload error: Upload URL request failed (401): {\"error\":\"Invalid token\"}",
  "code": "analyze-video:failed"
}
```

Cause found:

- `fal_video_qa` correctly uses the FAL backend.
- Doubao/Volcengine and Gemini image-understanding models did not explicitly set `providerBackend`.
- Registry normalization defaulted missing `providerBackend` to `fal`.
- As a result, `doubao_video_understanding` was routed through the FAL caller instead of Volcengine.

## Fix

Files changed:

- `electron/native-pipeline/infra/registry.ts`
  - Extended `ProviderBackend` to include the direct execution backends already used by API routing: `google`, `openrouter`, `volcengine`, `gmi-llm`, and `runway`.
- `electron/native-pipeline/registry-data/image-understanding.ts`
  - Added `openrouter_gemini_3_5_flash_video` for Gemini 3.5 Flash via OpenRouter.
  - Added `providerBackend: "google"` for Gemini image-understanding models.
  - Added `providerBackend: "volcengine"` for Doubao video/image-understanding models.
- `electron/native-pipeline/execution/step-executors.ts`
  - Added OpenRouter media-understanding payload shaping for `chat/completions`.
  - Local videos are encoded as base64 data URLs before submit.
- `electron/native-pipeline/cli/cli-handlers-media.ts`
  - Changed `analyze video` and `query video` defaults to `openrouter_gemini_3_5_flash_video`.
- `electron/native-pipeline/cli/command-registry.ts`
  - Updated help/default metadata for `analyze-video` and `query-video`.
- `electron/native-pipeline/registry-data/__tests__/image-understanding.test.ts`
  - Added coverage so OpenRouter, Gemini, and Doubao understanding models cannot silently fall back to FAL.
- `electron/native-pipeline/execution/__tests__/step-executors-openrouter-video.test.ts`
  - Added payload-shape coverage for remote URLs and local base64 video inputs.

Registry verification:

```text
openrouter_gemini_3_5_flash_video: provider=OpenRouter backend=openrouter endpoint=chat/completions model=google/gemini-3.5-flash
fal_video_qa: provider=fal backend=fal endpoint=openrouter/router/video/enterprise
doubao_video_understanding: provider=Volcengine backend=volcengine endpoint=volcengine/chat/completions
doubao_seed_2_lite: provider=Volcengine backend=volcengine endpoint=volcengine/responses
gemini_describe: provider=Google backend=google endpoint=google/gemini/describe
```

## Real E2E Success — OpenRouter Default

Input video:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4
```

Command, intentionally no `--model`:

```bash
set -a
source /Users/peter/.qcut/.env
set +a

OUT="/tmp/qcut-video-analyze-openrouter-default-1779393130"
VIDEO="/Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4"

bun /Users/peter/Desktop/code/qcut/qcut/electron/native-pipeline/cli/cli.ts analyze video \
  -i "$VIDEO" \
  --analysis-type description \
  -o "$OUT" \
  --json
```

Result:

```json
{
  "status": "ok",
  "data": {
    "schema_version": "1",
    "command": "analyze-video",
    "outputPath": "/tmp/qcut-video-analyze-openrouter-default-1779393130/upload-video-1779389330.json",
    "data": {
      "type": "description",
      "video": "upload-video-1779389330.mp4",
      "model": "openrouter_gemini_3_5_flash_video",
      "duration": 8.331,
      "content": "This video features a young woman with curly auburn hair in a cozy, softly lit bedroom..."
    },
    "duration": 8.331
  },
  "duration_ms": 8333
}
```

Output artifact:

```text
/tmp/qcut-video-analyze-openrouter-default-1779393130/upload-video-1779389330.json
```

Confirmed:

- Default selected `openrouter_gemini_3_5_flash_video`.
- The provider route was OpenRouter.
- The model returned a correct description of the test clip.

Note:

- The proxy path first returned `401 Invalid token`, then the CLI fell back to local `OPENROUTER_API_KEY` and succeeded.

## Legacy Doubao E2E Success

Input video:

```text
https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4
```

Command:

```bash
set -a
source /Users/peter/.qcut/.env
set +a

OUT="/tmp/qcut-video-analyze-doubao-1779392716"
VIDEO_URL="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"

bun /Users/peter/Desktop/code/qcut/qcut/electron/native-pipeline/cli/cli.ts analyze video \
  -i "$VIDEO_URL" \
  --model doubao_video_understanding \
  --analysis-type description \
  -o "$OUT" \
  --json
```

Result:

```json
{
  "status": "ok",
  "data": {
    "schema_version": "1",
    "command": "analyze-video",
    "outputPath": "/tmp/qcut-video-analyze-doubao-1779392716/flower.json",
    "data": {
      "type": "description",
      "video": "flower.mp4",
      "model": "doubao_video_understanding",
      "duration": 17.769,
      "content": "The video captures a close-up, time-lapse view of a red flower bud blooming..."
    },
    "duration": 17.769
  },
  "duration_ms": 17772
}
```

Output artifact:

```text
/tmp/qcut-video-analyze-doubao-1779392716/flower.json
```

Confirmed content:

- The returned description correctly identifies a red flower bud blooming.
- The output JSON was written successfully.
- The CLI path reports `command: "analyze-video"`.

Note:

- The proxy path first returned `401 Invalid token`, then the CLI fell back to the local `ARK_API_KEY` and succeeded through Volcengine.
- The default `fal_video_qa` route is still dependent on a valid FAL/proxy key for local-file upload.

## Verification

```bash
bunx vitest run \
  electron/native-pipeline/registry-data/__tests__/image-understanding.test.ts \
  electron/native-pipeline/execution/__tests__/step-executors-openrouter-video.test.ts
cd electron && bun x tsc --noEmit
```

Results:

- Targeted tests: passed, 6 tests.
- TypeScript: passed.

## AutoClip Dry-Run E2E

Command under test:

```bash
qcut edit autoclip \
  -i video.mp4 \
  --srt-file subs.srt \
  --min-score 0.8 \
  --dry-run
```

Real command before changing the default:

```bash
set -a
source /Users/peter/.qcut/.env
set +a

TMP="/tmp/qcut-autoclip-e2e-1779396996"

bun /Users/peter/Desktop/code/qcut/qcut/electron/native-pipeline/cli/cli.ts edit autoclip \
  -i "$TMP/video.mp4" \
  --srt-file "$TMP/subs.srt" \
  --min-score 0.8 \
  --model google/gemini-3.5-flash \
  --dry-run \
  -o "$TMP/out" \
  --json
```

Result:

```json
{
  "status": "ok",
  "data": {
    "schema_version": "1",
    "command": "autoclip",
    "data": {
      "dryRun": true,
      "topics": 2,
      "segments": 1,
      "highScore": 1,
      "threshold": 0.8,
      "metadataDir": "/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata"
    }
  },
  "duration_ms": 19895
}
```

Evidence files:

```text
/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata/step1_outline.json
/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata/step2_timeline.json
/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata/step3_all_scores.json
/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata/step3_high_scores.json
```

High-score output:

```json
{
  "id": "1",
  "outline": "Morning Routine Setup, Playful Reveal and Wrap-up",
  "startTime": "00:00:00,000",
  "endTime": "00:02:05,000",
  "finalScore": 0.82,
  "recommendReason": "Strong visual hooks and clear structure make this lifestyle routine highly engaging. The before-and-after transition offers great viral potential for social media platforms."
}
```

Default model update:

- `electron/native-pipeline/autoclip/steps/step-outline.ts`
- `electron/native-pipeline/autoclip/steps/step-timeline.ts`
- `electron/native-pipeline/autoclip/steps/step-scoring.ts`
- `electron/native-pipeline/cli/command-registry.ts`

The autoclip default is now:

```text
google/gemini-3.5-flash
```

Default-model E2E command, intentionally no `--model`:

```bash
TMP="/tmp/qcut-autoclip-default-35-e2e-1779398240"

bun /Users/peter/Desktop/code/qcut/qcut/electron/native-pipeline/cli/cli.ts edit autoclip \
  -i "$TMP/video.mp4" \
  --srt-file "$TMP/subs.srt" \
  --min-score 0.8 \
  --dry-run \
  -o "$TMP/out" \
  --json
```

Result:

```json
{
  "status": "ok",
  "data": {
    "schema_version": "1",
    "command": "autoclip",
    "data": {
      "dryRun": true,
      "topics": 2,
      "segments": 1,
      "highScore": 1,
      "threshold": 0.8,
      "metadataDir": "/tmp/qcut-autoclip-default-35-e2e-1779398240/out/autoclip-metadata"
    }
  },
  "duration_ms": 19803
}
```

Default high-score output:

```json
{
  "id": "1",
  "outline": "Morning Routine Setup, Playful Reveal, and Wrap-up",
  "startTime": "00:00:00,000",
  "endTime": "00:02:05,000",
  "finalScore": 0.8,
  "recommendReason": "Strong aesthetic appeal with a clear visual hook and a satisfying before-and-after reveal, making it highly shareable for lifestyle and wellness audiences."
}
```

Conclusion:

- `qcut edit autoclip --dry-run` works end-to-end with a supplied SRT.
- It produced one highlight above `--min-score 0.8`.
- It did not cut a file because `--dry-run` was intentionally enabled.
- This path is subtitle/text driven. It does not inspect video pixels directly.
- Default autoclip model is now `google/gemini-3.5-flash`, verified by CLI help and a no-`--model` dry-run E2E.
