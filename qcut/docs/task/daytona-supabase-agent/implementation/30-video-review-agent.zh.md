# Video Review Agent CLI 实现记录

## 改动内容

QCut CLI 现在有了产品化的视频审片路径：

```bash
qcut analyze video \
  -i /tmp/qcut-input/sample.mp4 \
  --analysis-type review \
  --review-language zh \
  --json \
  -o /tmp/qcut-output
```

它复用现有视频分析模型链路，但会切换到审片 Agent prompt contract，并把用户需要下载的产物写到指定输出目录。

## Prompt 来源

Prompt 模板现在放在 NexusAI website submodule：

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

运行时会按顺序查找 `--review-prompt-dir`、`QCUT_VIDEO_REVIEW_PROMPT_DIR`、默认仓库路径。如果 prompt 文件不可用，CLI 会回退到内置 prompt 文本，这样打包环境或 sandbox 环境也能运行。

## 输出约定

`--analysis-type review` 会写出：

| 文件 | 作用 |
| --- | --- |
| `review-comments.json` | 规范化结构化审片意见。 |
| `review-comments.csv` | 表格友好的导出文件。 |
| `review-feedback-browser.html` | 完整意见浏览页。 |
| `review-feedback-summary.html` | 分类汇总页。 |
| `review-agent-report.md` | 人类可读运行总结。 |
| `review-agent-prompts/` | 本次运行实际使用的 prompt markdown。 |
| `raw-analysis.json` | 解析后和原始模型输出，方便调试。 |

如果模型没有返回合法 JSON，CLI 不会直接丢掉整次运行。它会保留 `raw-analysis.json`，输出空 comments，并把解析错误写入调试产物。

## 验证

已运行：

```bash
bunx vitest run electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts
bun x tsc -p electron/tsconfig.json --noEmit
bunx biome check electron/native-pipeline/video-review electron/native-pipeline/cli/cli-handlers-media.ts electron/native-pipeline/cli/cli.ts electron/native-pipeline/cli/command-registry.ts electron/native-pipeline/cli/cli-runner/types.ts electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts packages/nexusai-website/prompts/video-review-agent
```

## 真实 E2E Smoke

日期：2026-06-02

真实模型 smoke 使用了已有的短视频：

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4
```

Provider 尝试结果：

- 默认 `openrouter_gemini_3_5_flash_video`：失败。本机没有配置 `OPENROUTER_API_KEY`，proxy 返回 `401 Invalid token`。
- `fal_video_qa`：失败。本地 FAL upload initiate 返回 `401`。
- `doubao_video_understanding`：成功。使用本机 `ARK_API_KEY`，把这个很小的测试视频转成 base64 `data:video/mp4` URL 后提交。

成功命令形态：

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

结果：

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

已写出产物：

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

这次真实 smoke 还暴露了一个 data URL 输入的显示名问题。CLI 现在会把 `data:video/*` 输入显示为 `inline-video.mp4`，不会再把 base64 片段写进 `review-agent-report.md` 和 HTML 页面。
