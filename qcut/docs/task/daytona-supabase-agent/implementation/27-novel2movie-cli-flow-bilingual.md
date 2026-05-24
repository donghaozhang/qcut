# QCut Novel-to-Movie CLI Flow / 小说到影视 CLI 流程

Date: 2026-05-21

This document explains the intended command sequence for QCut's novel-to-movie workflow in both Chinese and English. It is a usage guide, not an implementation note.

本文档用中英文说明 QCut 从小说到影视生成的 CLI 顺序。它是使用说明，不是代码实现说明。

## Overview / 总览

Full one-shot command:

完整一键命令：

```bash
qcut flow novel2movie --novel story.txt --max-scenes 20 --max-clips 5
```

中文：从小说文件开始，自动抽人物、生成角色图、切场景和镜头、生成 storyboard 图片、生成 video clips，最后合成 final movie。

English: Start from a novel file, automatically extract characters, generate portraits, segment scenes and shots, generate storyboard images, generate video clips, then concatenate the final movie.

Recommended model defaults:

推荐默认模型：

- LLM: `google/gemini-3.5-flash` or the configured Gemini Flash model
- Image: `gpt_image_2_ima`
- Video: `imarouter_seedance_2_0_ref2v`
- Video reference mode: `storyboard+references`

## Step 1: Novel Input / 小说输入

Use this when you only want script chunks, with no image or video generation:

如果只想把小说拆成影视脚本，不生图、不生视频：

```bash
qcut flow novel2movie --novel story.txt --scripts-only
```

中文：读取小说，只生成 `scripts/chunk_*.json`。适合先验证小说切分和脚本结构。

English: Read the novel and only generate `scripts/chunk_*.json`. This is useful for validating segmentation and screenplay structure first.

More explicit decomposed command:

更拆分的命令：

```bash
qcut flow novel2script --novel story.txt --project my-story --max-scenes 20
```

中文：把小说拆成项目里的影视脚本、场景、镜头结构。

English: Convert the novel into project screenplay chunks with scenes and shots.

## Step 2: Extract Characters / 抽取角色

Standalone character extraction:

单独抽人物：

```bash
qcut flow characters \
  --novel /tmp/qcut-input/novel.txt \
  --llm-model google/gemini-3.5-flash \
  -o /tmp/qcut-output \
  --json
```

中文：从小说文本中抽出角色名字、外貌、性格、身份、服装、人物关系等信息，输出 `characters.json`。

English: Extract character names, appearance, personality, identity, clothing, and relationships from the novel, then write `characters.json`.

Alternative lightweight model example:

轻量模型示例：

```bash
qcut flow characters \
  --novel /tmp/qcut-input/novel.txt \
  --llm-model gemini-3.1-flash-lite \
  -o /tmp/qcut-output \
  --json
```

## Step 3: Generate Character Portraits / 生成人物 Portraits

Generate front-view portraits from `characters.json`:

从 `characters.json` 生成正面人物图：

```bash
qcut flow portraits \
  --input /tmp/qcut-output/characters.json \
  --max-characters 3 \
  --views front \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/portraits \
  --json
```

中文：为角色生成正面人物图，并输出 portrait 图片和 registry。后续 storyboard 和 video 可以用这些图片作为角色 reference。

English: Generate front-view character portraits plus a portrait registry. Later storyboard and video steps can use these images as character references.

Multiple views:

多视角：

```bash
qcut flow portraits \
  --input /tmp/qcut-output/characters.json \
  --max-characters 3 \
  --views front,side,back \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/portraits \
  --json
```

中文：如果后续镜头角度比较多，可以生成 front、side、back 多视角，提高角色一致性。

English: If later shots need multiple camera angles, generate front, side, and back views to improve character consistency.

## Step 4: Extract Scenes and Shots / 抽取场景和镜头

Scene extraction command:

场景抽取命令：

```bash
qcut flow scenes \
  --novel /tmp/qcut-input/novel.txt \
  --llm-model google/gemini-3.5-flash \
  -o /tmp/qcut-output/scenes \
  --json
```

中文：把小说拆成 scenes，每个 scene 里包含 shots、人物、地点、动作、时间等信息。

English: Split the novel into scenes. Each scene contains shots, characters, location, action, time, and related metadata.

In the full pipeline, this step is usually handled automatically by:

完整流程中，这一步通常由下面的命令自动完成：

```bash
qcut flow novel2movie --novel story.txt
```

or:

或者：

```bash
qcut flow novel2script --novel story.txt --project my-story
```

## Step 5: Generate Storyboard Images / 生成 Storyboard 图片

Generate storyboard images from script, with portraits as references:

从 script 生成 storyboard 图片，并使用 portraits 做人物参考：

```bash
qcut flow storyboard \
  --script /tmp/qcut-output/scripts/chunk_001.json \
  --portraits /tmp/qcut-output/portraits/registry.json \
  --image-model gpt_image_2_ima \
  --style "cinematic Chinese fashion drama, K-pop lighting" \
  -o /tmp/qcut-output/storyboard \
  --json
```

中文：把每个 shot 变成 storyboard image，并尽量使用 portraits 保持人物一致。

English: Turn each shot into a storyboard image while using portraits to keep characters visually consistent.

Preview mode with limited images:

只生成少量图的 preview 模式：

```bash
qcut flow novel2movie --novel story.txt --max-images 5
```

中文：最多生成 5 张 storyboard 图片，不生视频。适合省钱快速检查视觉方向。

English: Generate at most 5 storyboard images and no videos. This is good for quickly checking visual direction with lower cost.

Storyboard-only mode:

只生成全部 storyboard，不生视频：

```bash
qcut flow novel2movie --novel story.txt --storyboard-only
```

中文：生成全部 storyboard images，但停止在视频之前。

English: Generate all storyboard images, then stop before video generation.

## Step 6: Provide Extra Reference Images / 上传或传入额外 Reference 图片

Use extra reference images when you want to guide the video model with real people, costumes, style frames, or other visual references.

如果想用真人图、服装图、风格图、角色图等额外 reference 来影响视频模型，可以传入：

```bash
qcut flow novel2movie \
  --novel story.txt \
  --max-scenes 20 \
  --max-clips 5 \
  --video-reference-images /Users/peter/Downloads/ref1.png \
  --video-reference-images /Users/peter/Downloads/ref2.png
```

中文：这些图片会作为额外 video reference，和 storyboard image、portrait references 一起传给视频模型。

English: These images are passed as extra video references together with the storyboard image and portrait references.

Video reference modes:

视频 reference 模式：

```bash
--video-reference-mode storyboard
--video-reference-mode references
--video-reference-mode storyboard+references
```

Chinese meaning:

中文含义：

- `storyboard`: 只使用 storyboard 图
- `references`: 只使用 portrait / extra reference，不使用 storyboard 作为 source image
- `storyboard+references`: 使用 storyboard + portraits + extra references，通常是默认推荐

English meaning:

英文含义：

- `storyboard`: only use the storyboard image
- `references`: only use portrait / extra references, without storyboard as the source image
- `storyboard+references`: use storyboard plus portraits plus extra references, usually the recommended default

## Step 7: Generate Video Clips / 生成视频 Clips

Full video generation:

完整视频生成：

```bash
qcut flow novel2movie \
  --novel story.txt \
  --max-scenes 20 \
  --max-clips 5 \
  --video-model imarouter_seedance_2_0_ref2v \
  --video-reference-mode storyboard+references
```

中文：选择最多 5 个 shot 生成 video clips，然后合成 final movie。当前逻辑会优先选择较短的 clips，以控制时间和成本。

English: Select up to 5 shots, generate video clips, then concatenate the final movie. The current logic favors shorter clips to control time and cost.

Parallel video trial:

视频并发测试：

```bash
qcut flow novel2movie \
  --novel story.txt \
  --max-scenes 20 \
  --max-clips 5 \
  --video-concurrency 2
```

中文：同时跑最多 2 个 video clips。默认是 `1`，更稳；最高 hard cap 是 `6`。并发可以更快提交任务，但 provider 仍可能排队，成本和限流风险也更高。

English: Run up to 2 video clips in parallel. The default is `1` for stability, and the hard cap is `6`. Parallelism can submit jobs faster, but the provider may still queue jobs, and cost/rate-limit risk is higher.

## Recommended Test Order / 推荐测试顺序

Use this sequence when validating the pipeline step by step:

建议按这个顺序一步一步验证：

### 1. Characters / 先抽人物

```bash
qcut flow characters \
  --novel story.txt \
  --llm-model google/gemini-3.5-flash \
  -o /tmp/qcut-output \
  --json
```

中文：确认小说能被 LLM 正确理解，人物能抽出来。

English: Confirm the LLM can understand the novel and extract characters correctly.

### 2. Portraits / 再生人物图

```bash
qcut flow portraits \
  --input /tmp/qcut-output/characters.json \
  --max-characters 3 \
  --views front \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/portraits \
  --json
```

中文：确认角色图能生成，并且 registry 可用于后续 reference。

English: Confirm portraits can be generated and the registry is ready for later references.

### 3. Storyboard Preview / 小量 Storyboard 预览

```bash
qcut flow novel2movie --novel story.txt --max-images 5
```

中文：低成本检查视觉方向，不生成视频。

English: Check visual direction at lower cost, without generating video.

### 4. Small Video E2E / 小规模视频端到端测试

```bash
qcut flow novel2movie \
  --novel story.txt \
  --max-scenes 20 \
  --max-clips 2 \
  --video-concurrency 2
```

中文：只跑 2 个 clips，验证 storyboard + portraits + video references + final concat 全链路是否好使。

English: Generate only 2 clips to validate the full chain: storyboard, portraits, video references, and final concatenation.

### 5. Larger Video Run / 扩大视频生成规模

```bash
qcut flow novel2movie \
  --novel story.txt \
  --max-scenes 20 \
  --max-clips 5 \
  --video-concurrency 2
```

中文：确认小规模成功后，再扩大到 5 个 clips。真实 provider 可能排队，所以耗时不一定线性下降。

English: After the small run succeeds, expand to 5 clips. Real providers may queue jobs, so total time may not decrease linearly.

## Output Expectations / 输出产物

Typical output files:

常见输出文件：

- `characters.json`: extracted character profiles / 抽取出来的人物信息
- `portraits/registry.json`: portrait reference registry / 人物图 reference 注册表
- `portraits/<character>/front.png`: generated portrait image / 角色正面图
- `scripts/chunk_*.json`: screenplay chunks / 影视脚本分块
- `storyboard/.../*.png`: storyboard images / 分镜图片
- `videos/<title>/SHOT_*.mp4`: video clips / 分镜视频片段
- `videos/<title>/video_reference_audit.json`: video reference audit / 视频 reference 使用记录
- `final_movie.mp4`: final concatenated movie / 最终合成视频
- `summary.json`: run summary, cost, errors, and timing boundaries / 运行摘要、成本、错误和起止时间

## Practical Notes / 实用注意点

中文：

- 先跑 `--scripts-only` 或 `--max-images 5`，不要一开始就全量生视频。
- 需要角色一致性时，优先生成 portraits，并用 `storyboard+references`。
- `--video-concurrency 2` 可以测试并发，但默认 `1` 更稳。
- `video_reference_audit.json` 是确认 reference 是否真正传入视频模型的关键证据。
- 如果某个 provider 排队很久，不一定是本地 CLI 卡住，可能是远端视频生成任务还在处理。

English:

- Start with `--scripts-only` or `--max-images 5`; do not start with full video generation.
- For character consistency, generate portraits first and use `storyboard+references`.
- `--video-concurrency 2` is useful for testing parallel submission, but default `1` is safer.
- `video_reference_audit.json` is the key evidence for confirming which references were sent to the video model.
- If a provider takes a long time, the local CLI may not be stuck; the remote video job may still be processing.
