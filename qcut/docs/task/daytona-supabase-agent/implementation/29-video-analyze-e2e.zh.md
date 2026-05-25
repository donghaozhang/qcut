# QCut CLI 视频分析真实 E2E

日期：2026-05-21

## 范围

在一段真实的短视频上验证 `qcut analyze video` / `analyze-video`，并记录结果。

修正后更新：

- 默认视频分析模型现在是 `openrouter_gemini_3_5_flash_video`。
- Provider 是直连 OpenRouter。
- 底层模型 ID 是 `google/gemini-3.5-flash`。
- OpenRouter 视频输入使用 `/api/v1/chat/completions`，content 中带 `video_url`。

参考：

- https://openrouter.ai/google/gemini-3.5-flash/api
- https://openrouter.ai/docs/guides/overview/multimodal/videos

## 初次失败

命令：

```bash
bun electron/native-pipeline/cli/cli.ts analyze video \
  -i /Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4 \
  --analysis-type description \
  -o /tmp/qcut-video-analyze-e2e-1779392218 \
  --json
```

结果：

```json
{
  "status": "error",
  "error": "FAL upload error: Upload URL request failed (401): {\"error\":\"Invalid token\"}",
  "code": "analyze-video:failed"
}
```

定位原因：

- `fal_video_qa` 正确使用了 FAL 后端。
- Doubao/Volcengine 和 Gemini image-understanding 模型没有显式设置 `providerBackend`。
- Registry 归一化把缺失的 `providerBackend` 默认成了 `fal`。
- 结果 `doubao_video_understanding` 被路由到 FAL caller，而不是 Volcengine。

## 修复

改动文件：

- `electron/native-pipeline/infra/registry.ts`
  - 扩展 `ProviderBackend`，纳入 API 路由已经在使用的直连后端：`google`、`openrouter`、`volcengine`、`gmi-llm`、`runway`。
- `electron/native-pipeline/registry-data/image-understanding.ts`
  - 新增 `openrouter_gemini_3_5_flash_video`，代表通过 OpenRouter 的 Gemini 3.5 Flash。
  - Gemini image-understanding 模型加上 `providerBackend: "google"`。
  - Doubao 视频/图片理解模型加上 `providerBackend: "volcengine"`。
- `electron/native-pipeline/execution/step-executors.ts`
  - 新增 OpenRouter media-understanding 的 `chat/completions` payload 构造。
  - 本地视频在提交前编码为 base64 data URL。
- `electron/native-pipeline/cli/cli-handlers-media.ts`
  - 将 `analyze video` 和 `query video` 默认改为 `openrouter_gemini_3_5_flash_video`。
- `electron/native-pipeline/cli/command-registry.ts`
  - 更新 `analyze-video` 和 `query-video` 的 help/default metadata。
- `electron/native-pipeline/registry-data/__tests__/image-understanding.test.ts`
  - 新增覆盖，保证 OpenRouter、Gemini 和 Doubao 理解模型不会静默 fallback 到 FAL。
- `electron/native-pipeline/execution/__tests__/step-executors-openrouter-video.test.ts`
  - 新增对远端 URL 和本地 base64 视频输入的 payload 形状覆盖。

Registry 校验：

```text
openrouter_gemini_3_5_flash_video: provider=OpenRouter backend=openrouter endpoint=chat/completions model=google/gemini-3.5-flash
fal_video_qa: provider=fal backend=fal endpoint=openrouter/router/video/enterprise
doubao_video_understanding: provider=Volcengine backend=volcengine endpoint=volcengine/chat/completions
doubao_seed_2_lite: provider=Volcengine backend=volcengine endpoint=volcengine/responses
gemini_describe: provider=Google backend=google endpoint=google/gemini/describe
```

## 真实 E2E 成功 — OpenRouter 默认

输入视频：

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4
```

命令，有意不传 `--model`：

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

结果：

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

输出 artifact：

```text
/tmp/qcut-video-analyze-openrouter-default-1779393130/upload-video-1779389330.json
```

确认：

- 默认选中了 `openrouter_gemini_3_5_flash_video`。
- Provider 路由是 OpenRouter。
- 模型返回的内容正确描述了测试片段。

备注：

- Proxy 路径首先返回 `401 Invalid token`，然后 CLI fallback 到本地 `OPENROUTER_API_KEY` 并成功。

## Legacy Doubao E2E 成功

输入视频：

```text
https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4
```

命令：

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

结果：

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

输出 artifact：

```text
/tmp/qcut-video-analyze-doubao-1779392716/flower.json
```

确认内容：

- 返回的描述正确识别了红色花苞绽放。
- 输出 JSON 成功写入。
- CLI 路径报告 `command: "analyze-video"`。

备注：

- Proxy 路径首先返回 `401 Invalid token`，然后 CLI fallback 到本地 `ARK_API_KEY` 并通过 Volcengine 成功。
- 默认 `fal_video_qa` 路径仍然依赖一个有效的 FAL/proxy key 才能上传本地文件。

## 验证

```bash
bunx vitest run \
  electron/native-pipeline/registry-data/__tests__/image-understanding.test.ts \
  electron/native-pipeline/execution/__tests__/step-executors-openrouter-video.test.ts
cd electron && bun x tsc --noEmit
```

结果：

- 目标测试：通过，6 个测试。
- TypeScript：通过。

## AutoClip Dry-Run E2E

被测命令：

```bash
qcut edit autoclip \
  -i video.mp4 \
  --srt-file subs.srt \
  --min-score 0.8 \
  --dry-run
```

修改默认值之前的实际命令：

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

结果：

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

证据文件：

```text
/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata/step1_outline.json
/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata/step2_timeline.json
/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata/step3_all_scores.json
/tmp/qcut-autoclip-e2e-1779396996/out/autoclip-metadata/step3_high_scores.json
```

高分输出：

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

默认模型更新：

- `electron/native-pipeline/autoclip/steps/step-outline.ts`
- `electron/native-pipeline/autoclip/steps/step-timeline.ts`
- `electron/native-pipeline/autoclip/steps/step-scoring.ts`
- `electron/native-pipeline/cli/command-registry.ts`

autoclip 默认现在是：

```text
google/gemini-3.5-flash
```

默认模型 E2E 命令，有意不传 `--model`：

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

结果：

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

默认高分输出：

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

结论：

- `qcut edit autoclip --dry-run` 在传入 SRT 时端到端工作正常。
- 它生成了一个分数高于 `--min-score 0.8` 的 highlight。
- 它没有切文件，因为 `--dry-run` 是有意启用的。
- 这条路径是基于字幕/文本的。它不直接检查视频像素。
- 默认 autoclip 模型现在是 `google/gemini-3.5-flash`，通过 CLI help 和一次不带 `--model` 的 dry-run E2E 验证。
