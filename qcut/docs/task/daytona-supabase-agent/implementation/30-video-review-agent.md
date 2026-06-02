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

- Default `openrouter_gemini_3_5_flash_video`: failed because local `OPENROUTER_API_KEY` was not configured and the proxy returned `401 Invalid token`.
- `fal_video_qa`: failed because local FAL upload initiation returned `401`.
- `doubao_video_understanding`: succeeded with local `ARK_API_KEY` after passing the small test video as a base64 `data:video/mp4` URL.

Successful command shape:

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
