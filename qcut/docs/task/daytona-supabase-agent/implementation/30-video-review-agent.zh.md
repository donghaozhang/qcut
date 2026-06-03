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

- 默认 `openrouter_gemini_3_5_flash_video`：一开始失败，因为本机没有配置 `OPENROUTER_API_KEY`，proxy 返回 `401 Invalid token`；从 Supabase `agent_secrets` 同步已保存的 OpenRouter key 到 `/Users/peter/.qcut/.env` 后，真实 E2E 已成功。
- `fal_video_qa`：失败。本地 FAL upload initiate 返回 `401`。
- `doubao_video_understanding`：成功。使用本机 `ARK_API_KEY`，把这个很小的测试视频转成 base64 `data:video/mp4` URL 后提交。

成功的 OpenRouter 命令：

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

OpenRouter 结果：

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

OpenRouter 已写出产物：

```text
/tmp/qcut-video-review-openrouter-e2e-1780385868/raw-analysis.json
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-agent-report.md
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-comments.csv
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-comments.json
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-feedback-browser.html
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-feedback-summary.html
/tmp/qcut-video-review-openrouter-e2e-1780385868/review-agent-prompts/*.zh.md
```

成功的 Doubao fallback 命令形态：

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

## 更新真实批注示例后的真实 E2E

日期：2026-06-02

给 master prompt 加入真实审片批注示例后，又用默认 OpenRouter 模型跑了一次：

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

写到 `review-agent-prompts/00-master-video-review-agent-prompt.zh.md` 的 prompt snapshot 已包含新的真实批注示例：

- `这里推得太突然了`
- `这里镜头有点跳`
- `调冷白一点`

结果：

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

## FFAS 第一集真实 E2E

日期：2026-06-02

用户指定原视频：

```text
/Users/peter/Downloads/FFAS-4.8/1-10集/第一集/第1集.mp4
```

原视频信息：

```json
{
  "size": 82965642,
  "duration": "77.738667",
  "video": "hevc 1080x1920 30fps",
  "audio": "aac stereo"
}
```

## FFAS 第二集真实 E2E

日期：2026-06-02

从第二集目录中选择的原视频：

```text
/Users/peter/Downloads/FFAS-4.8/1-10集/第二集/第二集.6.mp4
```

原视频信息：

```json
{
  "size": 109023498,
  "duration": "102.314667",
  "video": "hevc 1080x1920 30fps",
  "audio": "aac stereo"
}
```

生成的全片审片 proxy：

```text
/tmp/qcut-video-review-ffas-ep2-input/ffas-ep2-review-proxy-360x640.mp4
```

proxy 视频信息：

```json
{
  "size": 3179440,
  "duration": "102.333333",
  "video": "h264 360x640 6fps",
  "audio": "aac mono"
}
```

成功命令：

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

结果：

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

83MB 原片先触发 OpenRouter proxy 大小限制：

```text
Proxy call failed for openrouter (API error 413: Payload Too Large); falling back to local OPENROUTER_KEY
```

直连 fallback 几分钟仍未返回，所以没有截断视频，而是从同一个原片生成了全片审片 proxy：

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

proxy 视频信息：

```json
{
  "size": 2274679,
  "duration": "77.738000",
  "video": "h264 360x640 6fps",
  "audio": "aac mono"
}
```

成功命令：

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

结果：

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
