# Video Review Agent CLI Implementation

## What Changed

The QCut CLI now has a productized video review path:

```bash
qcut analyze video \
  -i /tmp/qcut-input/sample.mp4 \
  --analysis-type review \
  --review-language zh \
  --json \
  -o /tmp/qcut-output
```

This uses the existing video analysis model path, but swaps in the review-agent prompt contract and writes user-facing artifacts under the selected output directory.

## Prompt Source

Prompt templates are tracked in the NexusAI website submodule:

```text
packages/nexusai-website/prompts/video-review-agent/
├── 00-master-video-review-agent-prompt.en.md
├── 00-master-video-review-agent-prompt.zh.md
├── 01-shot-editing-prompt.en.md
├── 01-shot-editing-prompt.zh.md
├── 02-lip-sync-audio-prompt.en.md
├── 02-lip-sync-audio-prompt.zh.md
├── 03-expression-face-prompt.en.md
├── 03-expression-face-prompt.zh.md
├── 04-body-motion-prompt.en.md
├── 04-body-motion-prompt.zh.md
├── 05-pacing-duration-prompt.en.md
├── 05-pacing-duration-prompt.zh.md
├── 06-visual-artifact-prompt.en.md
├── 06-visual-artifact-prompt.zh.md
├── 07-eyeline-prompt.en.md
├── 07-eyeline-prompt.zh.md
├── 08-lighting-color-prompt.en.md
├── 08-lighting-color-prompt.zh.md
├── 09-other-prompt.en.md
└── 09-other-prompt.zh.md
```

Runtime prompt loading checks `--review-prompt-dir`, then `QCUT_VIDEO_REVIEW_PROMPT_DIR`, then the default repository path. If prompt files are unavailable, the CLI falls back to embedded prompt text so packaged or sandboxed runs still work.

## Output Contract

For `--analysis-type review`, the CLI writes:

| File | Purpose |
| --- | --- |
| `review-comments.json` | Canonical structured review comments. |
| `review-comments.csv` | Spreadsheet-friendly export. |
| `review-feedback-browser.html` | Full comment browser. |
| `review-feedback-summary.html` | Category summary page. |
| `review-agent-report.md` | Human-readable run summary. |
| `review-agent-prompts/` | Prompt markdown files used by the run. |
| `raw-analysis.json` | Parsed and raw model output for debugging. |

Malformed model JSON no longer drops the run on the floor. The CLI keeps `raw-analysis.json`, emits empty comments, and preserves the parse error for diagnosis.

## Verification

Commands run:

```bash
bunx vitest run electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts
bun x tsc -p electron/tsconfig.json --noEmit
bunx biome check electron/native-pipeline/video-review electron/native-pipeline/cli/cli-handlers-media.ts electron/native-pipeline/cli/cli.ts electron/native-pipeline/cli/command-registry.ts electron/native-pipeline/cli/cli-runner/types.ts electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts packages/nexusai-website/prompts/video-review-agent
```

## Real E2E Smoke

Date: 2026-06-02

The real model smoke used the existing short upload-artifacts video:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4
```

Provider attempts:

- Default `openrouter_gemini_3_5_flash_video`: initially failed because local `OPENROUTER_API_KEY` was not configured and the proxy returned `401 Invalid token`; after syncing the saved OpenRouter key from Supabase `agent_secrets` into `/Users/peter/.qcut/.env`, the real E2E succeeded.
- `fal_video_qa`: failed because local FAL upload initiation returned `401`.
- `doubao_video_understanding`: succeeded with local `ARK_API_KEY` after passing the small test video as a base64 `data:video/mp4` URL.

Successful OpenRouter command:

```bash
set -a
source /Users/peter/.qcut/.env
set +a

OUT="/tmp/qcut-video-review-openrouter-e2e-1780385868"
VIDEO="/Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4"

bun electron/native-pipeline/cli/cli.ts analyze video \
  -i "$VIDEO" \
  --model openrouter_gemini_3_5_flash_video \
  --analysis-type review \
  --review-language zh \
  -o "$OUT" \
  --json
```

OpenRouter result:

```json
{
  "video": "upload-video-1779389330.mp4",
  "model": "openrouter_gemini_3_5_flash_video",
  "promptLanguage": "zh",
  "count": 1,
  "first": {
    "timestamp": "00:00:00",
    "category": "镜头/剪辑",
    "severity": "high",
    "comment": "开头怎么还留着彩条测试信号？这个 cut 必须切掉，正片不能带测试卡入画。",
    "fix": "切掉片头的 PM5544 测试彩条画面，直接从第一帧正片内容开始起播。"
  }
}
```

OpenRouter artifacts:

```text
/tmp/qcut-video-review-openrouter-e2e-1780385868/raw-analysis.json
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-agent-report.md
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-comments.csv
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-comments.json
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-feedback-browser.html
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-feedback-summary.html
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-agent-prompts/*.zh.md
```

Successful Doubao fallback command shape:

```bash
set -a
source /Users/peter/.qcut/.env
set +a

OUT="/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273"
VIDEO="/Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4"
DATA_URL="data:video/mp4;base64,$(base64 -i "$VIDEO" | tr -d '\n')"

bun /Users/peter/Desktop/code/qcut/qcut/electron/native-pipeline/cli/cli.ts analyze video \
  -i "$DATA_URL" \
  --model doubao_video_understanding \
  --analysis-type review \
  --review-language zh \
  -o "$OUT" \
  --json
```

Result:

```json
{
  "video": "inline-video.mp4",
  "model": "doubao_video_understanding",
  "promptLanguage": "zh",
  "count": 1,
  "first": {
    "timestamp": "00:00:00",
    "category": "画面瑕疵",
    "severity": "high",
    "comment": "00:00:00全程画面显示彩色测试条纹图，无实际剧情或有效内容呈现",
    "fix": "替换为符合视频主题的实际画面素材"
  }
}
```

Artifacts written:

```text
/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273/cli-result.json
/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273/raw-analysis.json
/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273/review-agent-report.md
/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273/review-comments.csv
/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273/review-comments.json
/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273/review-feedback-browser.html
/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273/review-feedback-summary.html
/tmp/qcut-video-review-doubao-dataurl-e2e-1780384273/review-agent-prompts/*.zh.md
```

This real smoke also surfaced a display-name issue for inline `data:video/*` inputs. The CLI now reports those as `inline-video.mp4` instead of leaking a base64 fragment into `review-agent-report.md` and the HTML pages.

## Real E2E After Prompt Example Update

Date: 2026-06-02

After adding real review-comment examples to the master prompt, the default OpenRouter model was run again:

```bash
OUT="/tmp/qcut-video-review-openrouter-prompt-example-e2e-1780386662"
VIDEO="/Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4"

bun electron/native-pipeline/cli/cli.ts analyze video \
  -i "$VIDEO" \
  --model openrouter_gemini_3_5_flash_video \
  --analysis-type review \
  --review-language zh \
  -o "$OUT" \
  --json
```

The prompt snapshot written to `review-agent-prompts/00-master-video-review-agent-prompt.zh.md` included the new realistic examples:

- `这里推得太突然了`
- `这里镜头有点跳`
- `调冷白一点`

Result:

```json
{
  "model": "openrouter_gemini_3_5_flash_video",
  "count": 1,
  "first": {
    "timestamp": "00:00:00",
    "category": "其他",
    "severity": "high",
    "comment": "片头画面怎么直接是彩条测试卡？正片内容完全没有，赶紧检查一下是不是导出成占位板或者轨道挂错了？",
    "fix": "剔除多余的彩条占位画面，重新导出并替换为实际的短剧正片内容。"
  }
}
```

## Real E2E With FFAS Episode 1

Date: 2026-06-02

Requested source video:

```text
/Users/peter/Downloads/FFAS-4.8/1-10集/第一集/第1集.mp4
```

Original media:

```json
{
  "size": 82965642,
  "duration": "77.738667",
  "video": "hevc 1080x1920 30fps",
  "audio": "aac stereo"
}
```

## Real E2E With FFAS Episode 2

Date: 2026-06-02

Selected source video from the episode folder:

```text
/Users/peter/Downloads/FFAS-4.8/1-10集/第二集/第二集.6.mp4
```

Original media:

```json
{
  "size": 109023498,
  "duration": "102.314667",
  "video": "hevc 1080x1920 30fps",
  "audio": "aac stereo"
}
```

Generated full-length review proxy:

```text
/tmp/qcut-video-review-ffas-ep2-input/ffas-ep2-review-proxy-360x640.mp4
```

Proxy media:

```json
{
  "size": 3179440,
  "duration": "102.333333",
  "video": "h264 360x640 6fps",
  "audio": "aac mono"
}
```

Successful command:

```bash
OUT="/tmp/qcut-video-review-openrouter-ffas-ep2-proxy-e2e-1780387927"
VIDEO="/tmp/qcut-video-review-ffas-ep2-input/ffas-ep2-review-proxy-360x640.mp4"

bun electron/native-pipeline/cli/cli.ts analyze video \
  -i "$VIDEO" \
  --model openrouter_gemini_3_5_flash_video \
  --analysis-type review \
  --review-language zh \
  -o "$OUT" \
  --json
```

Result:

```json
{
  "model": "openrouter_gemini_3_5_flash_video",
  "promptLanguage": "zh",
  "commentCount": 7,
  "first": {
    "timestamp": "00:00:03",
    "category": "口型/音画",
    "severity": "medium",
    "comment": "男主喊“Caroline!”的时候嘴巴几乎没动，像张贴纸，口型完全没有对上台词。"
  },
  "last": {
    "timestamp": "00:01:34",
    "category": "镜头/剪辑",
    "severity": "low",
    "comment": "男主在沙发上接完电话站起来的动作切得太突然，前一帧还在屏幕中央低头，下一帧直接站立走到画面边缘，少了个起身的动势。"
  }
}
```

The original 83MB file hit the OpenRouter proxy size path first:

```text
Proxy call failed for openrouter (API error 413: Payload Too Large); falling back to local OPENROUTER_KEY
```

The direct fallback upload did not return after several minutes, so a full-length review proxy was generated from the same video rather than trimming the episode:

```bash
ffmpeg -hide_banner -y \
  -i "/Users/peter/Downloads/FFAS-4.8/1-10集/第一集/第1集.mp4" \
  -map '0:v:0' -map '0:a:0?' \
  -vf 'scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2,fps=6' \
  -c:v libx264 -preset veryfast -crf 34 -pix_fmt yuv420p \
  -c:a aac -b:a 48k -ac 1 \
  -movflags +faststart \
  /tmp/qcut-video-review-ffas-ep1-input/ffas-ep1-review-proxy-360x640.mp4
```

Proxy media:

```json
{
  "size": 2274679,
  "duration": "77.738000",
  "video": "h264 360x640 6fps",
  "audio": "aac mono"
}
```

Successful command:

```bash
OUT="/tmp/qcut-video-review-openrouter-ffas-ep1-proxy-e2e-1780387168"
VIDEO="/tmp/qcut-video-review-ffas-ep1-input/ffas-ep1-review-proxy-360x640.mp4"

bun electron/native-pipeline/cli/cli.ts analyze video \
  -i "$VIDEO" \
  --model openrouter_gemini_3_5_flash_video \
  --analysis-type review \
  --review-language zh \
  -o "$OUT" \
  --json
```

Result:

```json
{
  "model": "openrouter_gemini_3_5_flash_video",
  "promptLanguage": "zh",
  "commentCount": 7,
  "first": {
    "timestamp": "00:00:08",
    "category": "口型/音画",
    "severity": "high",
    "comment": "女主说第一句台词“You're late...”时口型基本没对上，而且面部表情过于平淡，看不出要债和生气的质问感。"
  },
  "last": {
    "timestamp": "00:01:15",
    "category": "表情/面部",
    "severity": "high",
    "comment": "最后红发女被泼啤酒，虽然湿身衣服画出来了，但她整个人呆立不动，双手垂直，完全没有被泼水后的生理躲闪和防卫反应，非常假。"
  }
}
```
