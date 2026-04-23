# `qcut flow script2video` Workflow

> Fully-automated, headless CLI pipeline that turns a pre-written
> screenplay into a finished video (storyboard + videos + final
> concat). For an idea-to-video flow, see `WORKFLOW-idea2video.md`.
> For novel adaptation, see `WORKFLOW-novel2movie.md`.

## English

### One-line example

```bash
bun run pipeline flow script2video --script screenplay.txt
```

### What it does

Takes an **existing screenplay** (as text or JSON) and runs only the
image + video stages — skipping screenwriting, character extraction,
and optional portrait generation that the other pipelines do. This is
the fastest and cheapest of the three `flow` pipelines because you
provide the authorial work up front.

Implemented in `electron/native-pipeline/vimax/pipelines/script2video.ts`.

### 4-stage pipeline

1. **Parse script** — read the screenplay from text / dict / JSON file
   and normalize it into the internal `Script` shape
2. **Storyboard generation** — one still image per shot, optionally
   using a `CharacterPortraitRegistry` for character consistency
3. **Video generation** — turn each still into a video clip
4. **Concat** — stitch every clip into a single final movie file

Note the absence of a Screenwriter stage (you already wrote the
script) and a Character-extraction stage (screenplay shots already
declare character IDs).

### Flags

| Flag | Purpose | Default |
| --- | --- | --- |
| `--script <path>` | Screenplay file (text or JSON) — **required** | — |
| `--title <name>` | Project title (used in output paths) | auto |
| `--storyboard-only` | Stop after stage 2 (stills, no video) | false |
| `--no-portraits` | Do not use a portrait registry even if one exists | false |
| `--no-references` | Skip reference-image conditioning in stage 2 | false |
| `--image-model <id>` | Override the image model | `gmi_gemini_3_pro_image` |
| `--video-model <id>` | Override the video model | `kling` |

Note: no `--llm-model` flag because this pipeline doesn't call an LLM
— the script is already written.

### Expected input format

`--script` accepts:

- A **plain-text screenplay** (the pipeline parses it lightly)
- A **JSON file** produced by `flow script` / `flow novel2script` /
  the Director panel export
- In-memory `Script` objects when invoked programmatically

JSON is the most reliable input because shot IDs, character IDs, and
camera metadata are already structured.

### Character portraits (optional)

If you ran `flow portraits` separately and have a portraits directory,
the pipeline can re-use those reference images for consistency. Drop
a `CharacterPortraitRegistry` file alongside your script, and the
storyboard stage will automatically pick it up unless `--no-portraits`
or `--no-references` is set.

### Outputs

```
media/generated/vimax/script2video/<project>/
├── storyboards/             # per-shot still images (PNG)
├── clips/                   # per-shot video clips (MP4)
└── final.mp4                # concatenated output
```

No `scripts/` or `characters.json` in the output — you already
provided those.

### When to use

- **You wrote the script** — you have a polished screenplay and just
  want the visuals
- **You exported from the Director panel** — Moyin's JSON export
  drops straight into `--script`
- **You're iterating on the visual pass** — tweak character portraits
  or image-model choice without re-running the whole pipeline
- **Budget-sensitive runs** — skips LLM stages entirely, so credit
  usage is bounded by shot count × image model + shot count × video
  model

### When NOT to use

- You only have an idea, no script → use `flow idea2video`
- You have prose / a novel → use `flow novel2movie` (handles chunking)
- You need interactive per-shot editing → use the Moyin Director panel

### Comparison to the other flow pipelines

| Pipeline | Input | Stages | Typical duration | Cost profile |
| --- | --- | --- | --- | --- |
| `idea2video` | 1 sentence | 5 | ~60s output | LLM + image + video |
| `novel2movie` | Long prose | 5 (chunked) | Hours | LLM + image + video × many |
| `script2video` | Screenplay | 4 | Matches script length | Image + video only |

### Decomposed stages (advanced)

```bash
bun run pipeline flow storyboard  --script screenplay.json --portraits portraits/
# then hand the storyboard output into a video-generation adapter
```

---

## 中文

### 一行命令示例

```bash
bun run pipeline flow script2video --script screenplay.txt
```

### 它做什么

接收**已有剧本**（文本或 JSON），只跑图像 + 视频阶段 —— 跳过编剧、
角色提取、可选立绘生成。这是三个 `flow` 流水线里最快也最便宜的，
因为作者部分的工作你已经做完了。

实现见 `electron/native-pipeline/vimax/pipelines/script2video.ts`。

### 4 阶段流水线

1. **解析剧本** —— 从文本/字典/JSON 文件读取剧本，规整到内部 `Script`
   结构
2. **故事板生成** —— 为每个镜头生成一张静帧，可选用
   `CharacterPortraitRegistry` 保持角色一致性
3. **视频生成** —— 把每张静帧变成视频片段
4. **拼接** —— 把所有片段缝成一个最终电影文件

注意没有 Screenwriter 阶段（剧本你已经写了），也没有角色提取阶段
（剧本镜头里已经声明了 character IDs）。

### 参数说明

| 参数 | 用途 | 默认值 |
| --- | --- | --- |
| `--script <path>` | 剧本文件（文本或 JSON）—— **必填** | — |
| `--title <name>` | 项目标题（用于输出路径） | 自动 |
| `--storyboard-only` | 第 2 阶段后停止（只要静帧，不生成视频） | false |
| `--no-portraits` | 即使有立绘也不使用注册表 | false |
| `--no-references` | 关闭第 2 阶段的参考图像调节 | false |
| `--image-model <id>` | 覆盖图片模型 | `gmi_gemini_3_pro_image` |
| `--video-model <id>` | 覆盖视频模型 | `kling` |

注：没有 `--llm-model` 参数，因为此流水线不调用 LLM —— 剧本已经写好。

### 预期的输入格式

`--script` 接收：

- **纯文本剧本**（流水线做轻量解析）
- 由 `flow script` / `flow novel2script` / Director 面板导出产生的
  **JSON 文件**
- 作为代码内 API 调用时的 `Script` 对象

JSON 输入最可靠，因为镜头 ID、角色 ID 和机位元数据已经结构化。

### 角色立绘（可选）

如果你之前单独跑了 `flow portraits` 并有一个立绘目录，流水线可以
复用这些参考图做一致性。把 `CharacterPortraitRegistry` 文件放在剧本
旁边，故事板阶段会自动采用 —— 除非传了 `--no-portraits` 或
`--no-references`。

### 输出

```
media/generated/vimax/script2video/<project>/
├── storyboards/             # 每镜头的静帧（PNG）
├── clips/                   # 每镜头的视频片段（MP4）
└── final.mp4                # 拼接后的成片
```

输出里没有 `scripts/` 也没有 `characters.json` —— 那些由你提供。

### 什么时候用

- **自己写了剧本** —— 剧本已定稿，只想要画面
- **从 Director 面板导出了剧本** —— Moyin 的 JSON 导出可直接传给
  `--script`
- **在做视觉迭代** —— 调整角色立绘或换图片模型，不必把整条流水线重
  跑
- **预算敏感** —— 完全跳过 LLM 阶段，credits 消耗仅为镜头数 × 图片
  模型 + 镜头数 × 视频模型

### 什么时候**不**用

- 只有想法没有剧本 → 用 `flow idea2video`
- 有散文/小说 → 用 `flow novel2movie`（能处理切块）
- 需要按镜头交互式精修 → 用 Moyin 导演面板

### 与其他 flow 流水线对比

| 流水线 | 输入 | 阶段数 | 典型成片长度 | 成本特征 |
| --- | --- | --- | --- | --- |
| `idea2video` | 一句话 | 5 | 约 60 秒 | LLM + 图 + 视频 |
| `novel2movie` | 长篇散文 | 5（分块） | 小时级 | LLM + 图 + 视频 × N |
| `script2video` | 剧本 | 4 | 与剧本一致 | 仅图 + 视频 |

### 分解阶段（进阶）

```bash
bun run pipeline flow storyboard  --script screenplay.json --portraits portraits/
# 再把故事板输出交给视频生成适配器
```
