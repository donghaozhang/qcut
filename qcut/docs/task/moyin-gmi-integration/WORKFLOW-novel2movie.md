# `qcut flow novel2movie` Workflow

> Fully-automated, headless CLI pipeline that turns a novel text file
> into a finished movie (images + videos + final concat). For the
> interactive editor workflow, see `WORKFLOW-moyin.md`.

## English

### One-line example

```bash
bun run pipeline flow novel2movie --novel book.txt --max-scenes 20
```

### What it does

Reads `book.txt`, processes the prose through a 5-stage pipeline, and
writes images + videos + a final concatenated movie to
`media/generated/vimax/novel2movie/`.

No Electron, no UI, no clicks. All LLM + image + video calls go
through the `callModelApi` abstraction, which means they use local
API keys (`.qcut/.env`) OR the license-server proxy if you're signed
in with no local key. Credits are deducted server-side when using the
proxy.

### 5-stage pipeline

Implemented in `electron/native-pipeline/vimax/pipelines/novel2movie.ts`.

1. **Character extraction** — read the full novel, extract the cast
   (up to `max_characters`, default 5) with per-character descriptions.
2. **Character portraits** — generate a reference portrait image for
   each character so later shots can keep a consistent face/look.
   Skipped when `--no-portraits` is passed.
3. **Novel segmentation** — split the novel into overlapping chunks
   (default 2000 char chunks, 200 char overlap), then segment each
   chunk directly into ~15-second shots (no intermediate "scene" layer;
   zero information loss).
4. **Storyboard generation** — for each shot, generate a still image
   using the character-portrait registry as reference. Capped by
   `--max-images` if set.
5. **Video generation + concat** — turn each still into a ~15s video
   clip, then concatenate every clip into one final movie file.
   Capped by `--max-clips`.

### Flags

| Flag | Purpose | Default |
| --- | --- | --- |
| `--novel <path>` | Novel text file | bundled demo |
| `--title <name>` | Project title (used in output paths) | auto |
| `--max-scenes <n>` | Cap total scenes across all chunks | 0 (unlimited) |
| `--max-images <n>` | Cap storyboard image count (implies no video) | 0 |
| `--max-clips <n>` | Cap shot-video count | 0 |
| `--scripts-only` | Stop after stage 3 | false |
| `--storyboard-only` | Stop after stage 4 (stills, no video) | false |
| `--no-portraits` | Skip stage 2 | false |
| `--llm-model <id>` | Override the LLM (e.g. `gmi-glm-5.1`) | `google/gemini-3-flash-preview` |
| `--image-model <id>` | Override the image model | `gmi_gemini_3_pro_image` |
| `--video-model <id>` | Override the video model | `kling` |

### Size limits

The pipeline enforces a maximum novel size (see
`NOVEL_MAX_THRESHOLD` in the source). If your book exceeds the cap,
the pipeline auto-splits it into smaller files under a
`split-<timestamp>/` directory and exits with instructions to re-run
per split file.

For novels that fit but are still large (~20K+ words), expect
processing time to be measured in **hours**, dominated by the video
generation stage.

### Outputs

```
media/generated/vimax/novel2movie/<project>/
├── scripts/                 # per-chunk segmented Script JSON
├── characters.json          # extracted cast
├── portraits/               # per-character reference images (PNG)
├── storyboards/             # per-shot still images (PNG)
├── clips/                   # per-shot video clips (MP4)
└── final.mp4                # concatenated output
```

All intermediate artifacts stay on disk by default
(`save_intermediate: true`) so a failed late stage can resume without
re-spending credits on earlier stages.

### Resumability

If stage 5 fails halfway through (e.g. the 42nd clip errors), the
earlier stills and clips in `storyboards/` + `clips/` are preserved.
Re-running with the same `--title` and using `--storyboard-only` or
`--max-clips` can pick up where it left off. Full resume orchestration
is left to the caller — the pipeline itself writes atomically.

### Fully decomposed flow (advanced)

For fine-grained control, run each stage as its own CLI command:

```bash
bun run pipeline flow characters    --novel book.txt
bun run pipeline flow portraits     --characters characters.json
bun run pipeline flow novel2script  --novel book.txt --max-scenes 20
bun run pipeline flow novel2video   --scripts scripts/ --portraits portraits/
```

This is what `novel2movie` runs internally, just stage-by-stage so you
can inspect/edit intermediate artifacts.

---

## 中文

### 一行命令示例

```bash
bun run pipeline flow novel2movie --novel book.txt --max-scenes 20
```

### 它做什么

读取 `book.txt`，通过 5 阶段流水线处理正文，输出图片 + 视频 + 最终
拼接的电影到 `media/generated/vimax/novel2movie/`。

不需要 Electron、不需要界面、不需要点击。所有 LLM + 图片 + 视频调用
都通过 `callModelApi` 抽象层，会使用本地 API key（`.qcut/.env`）或
在登录状态下无本地 key 时使用许可证服务器代理。走代理时服务端会扣
除 credits。

### 5 阶段流水线

实现见 `electron/native-pipeline/vimax/pipelines/novel2movie.ts`。

1. **角色提取** —— 读取整本小说，提取演员表（最多 `max_characters`
   个，默认 5 个），附角色描述。
2. **角色立绘** —— 为每个角色生成一张参考立绘，使后续镜头能保持
   一致的脸/外观。传 `--no-portraits` 可跳过。
3. **小说分段** —— 按重叠块拆分小说（默认每块 2000 字、200 字重叠），
   再把每块直接切成 ~15 秒的镜头（没有中间的"场景"层，零信息损失）。
4. **故事板生成** —— 为每个镜头生成静帧图片，使用角色立绘注册表
   做参考。`--max-images` 可以封顶。
5. **视频生成 + 拼接** —— 把每张静帧变成 ~15 秒的视频片段，再把所有
   片段拼接成一个最终电影文件。`--max-clips` 可以封顶。

### 参数说明

| 参数 | 用途 | 默认值 |
| --- | --- | --- |
| `--novel <path>` | 小说文本文件 | 内置示例 |
| `--title <name>` | 项目标题（用于输出路径） | 自动 |
| `--max-scenes <n>` | 所有块内场景总数上限 | 0（无限制） |
| `--max-images <n>` | 故事板图片数上限（隐含不生成视频） | 0 |
| `--max-clips <n>` | 镜头视频数上限 | 0 |
| `--scripts-only` | 第 3 阶段后停止 | false |
| `--storyboard-only` | 第 4 阶段后停止（只要静帧，不生成视频） | false |
| `--no-portraits` | 跳过第 2 阶段 | false |
| `--llm-model <id>` | 覆盖 LLM（如 `gmi-glm-5.1`） | `google/gemini-3-flash-preview` |
| `--image-model <id>` | 覆盖图片模型 | `gmi_gemini_3_pro_image` |
| `--video-model <id>` | 覆盖视频模型 | `kling` |

### 体量限制

流水线有小说体量上限（见源码中的 `NOVEL_MAX_THRESHOLD`）。如果书本
超出上限，流水线会自动拆分到 `split-<timestamp>/` 目录下的更小文件，
并退出提示按拆分后文件分别重跑。

即便体量合规但偏大（~2 万字以上），处理时间会以**小时**计，主要耗
在视频生成阶段。

### 输出

```
media/generated/vimax/novel2movie/<project>/
├── scripts/                 # 每块切分后的 Script JSON
├── characters.json          # 提取出的演员表
├── portraits/               # 每角色的参考立绘（PNG）
├── storyboards/             # 每镜头的静帧（PNG）
├── clips/                   # 每镜头的视频片段（MP4）
└── final.mp4                # 拼接后的成片
```

所有中间产物默认保留在磁盘上（`save_intermediate: true`），这样后段
阶段失败时早段产物不会丢失，可以避免重复消耗 credits。

### 可续跑性

如果第 5 阶段在中途失败（例如第 42 个片段出错），`storyboards/` 和
`clips/` 里的早期静帧和片段会保留。使用相同的 `--title` 搭配
`--storyboard-only` 或 `--max-clips` 可以从中断处继续。完整的断点续
跑编排留给调用方做 —— 流水线本身以原子方式写入。

### 完全分解流程（进阶）

需要细粒度控制时，可以把每个阶段当作独立 CLI 命令运行：

```bash
bun run pipeline flow characters    --novel book.txt
bun run pipeline flow portraits     --characters characters.json
bun run pipeline flow novel2script  --novel book.txt --max-scenes 20
bun run pipeline flow novel2video   --scripts scripts/ --portraits portraits/
```

这正是 `novel2movie` 内部所执行的，只不过是按阶段拆出来的，便于你检
查/编辑中间产物。
