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

