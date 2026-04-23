# `qcut flow idea2video` Workflow

> Fully-automated, headless CLI pipeline that turns a one-sentence idea
> into a finished short video (script + storyboard + videos + final
> concat). For long-form novels, see `WORKFLOW-novel2movie.md`. For
> pre-written screenplays, see `WORKFLOW-script2video.md`.

## English

### One-line example

```bash
bun run pipeline flow idea2video --idea 'A short film about a robot learning to paint'
```

### What it does

Takes a short idea/concept as input, writes a screenplay from it, then
goes through the same image + video generation stages as the other
flow pipelines — all in one command, no Electron, no UI.

Implemented in `electron/native-pipeline/vimax/pipelines/idea2video.ts`.

### 5-stage pipeline

1. **Screenwriter** — expand the idea into a full screenplay
   (target duration default 60 seconds)
2. **Character extraction** — identify the cast from the generated
   script
3. **Character portraits** — generate a reference portrait image for
   each character. Skipped when `--no-portraits` is passed
4. **Storyboard generation** — one still image per shot in the script,
   using the portrait registry for character consistency.
   `--no-references` disables the consistency pass
5. **Video generation + concat** — turn each still into a clip, then
   concatenate every clip into one final movie file

### Flags

| Flag | Purpose | Default |
| --- | --- | --- |
| `--idea <string>` | The idea/concept (required) | — |
| `--title <name>` | Project title (used in output paths) | auto |
| `--max-scenes <n>` | Cap total scenes | 0 (unlimited) |
| `--scripts-only` | Stop after stage 1 | false |
| `--storyboard-only` | Stop after stage 4 (stills, no video) | false |
| `--no-portraits` | Skip stage 3 | false |
| `--no-references` | Skip reference-image conditioning in stage 4 | false |
| `--llm-model <id>` | Override the LLM (e.g. `gmi-glm-5.1`) | `google/gemini-3-flash-preview` |
| `--image-model <id>` | Override the image model | `gmi_gemini_3_pro_image` |
| `--video-model <id>` | Override the video model | `kling` |

### Target duration

Default **60 seconds**. Controlled inside the Screenwriter config
(`target_duration: 60.0`). Unlike `novel2movie` which derives length
from the novel's size, `idea2video` has a fixed target and the
Screenwriter picks a shot count that fits.

### Outputs

```
media/generated/vimax/idea2video/<project>/
├── scripts/                 # generated screenplay JSON
├── characters.json          # extracted cast
├── portraits/               # per-character reference images (PNG)
├── storyboards/             # per-shot still images (PNG)
├── clips/                   # per-shot video clips (MP4)
└── final.mp4                # concatenated output
```

Intermediate artifacts stay on disk by default
(`save_intermediate: true`) so a failed late stage doesn't force a
rewind to stage 1.

### When to use

- **Ad prototypes** — 15-60s concept films from a pitch sentence
- **Quick concept reels** — explore a visual idea before committing
  to a full screenplay
- **Batch ideation** — script the same command with different
  `--idea` values to spawn many variants overnight
- **Demo content** — you need footage fast, don't need pixel-perfect
  authorial control

### When NOT to use

- You already have a screenplay → use `flow script2video` (skips the
  Screenwriter stage, faster and cheaper)
- You have a novel → use `flow novel2movie` (chunks long prose
  correctly)
- You need fine per-shot editing → use the Moyin Director panel
  (see `WORKFLOW-moyin.md`)

### Decomposed stages (advanced)

For more control, run each stage as its own CLI command:

```bash
bun run pipeline flow script       --idea 'robot learns to paint'
bun run pipeline flow characters   --script script.json
bun run pipeline flow portraits    --characters characters.json
bun run pipeline flow storyboard   --script script.json --portraits portraits/
# then stitch videos with the video-generation adapter directly
```

---

## 中文

### 一行命令示例

```bash
bun run pipeline flow idea2video --idea '一个机器人学画画的短片'
```

### 它做什么

以一句话想法/概念作为输入，先写成完整剧本，再经过与其他 flow 流水线
相同的图像 + 视频生成阶段 —— 一条命令全部完成，无需 Electron、无需
界面。

实现见 `electron/native-pipeline/vimax/pipelines/idea2video.ts`。

### 5 阶段流水线

1. **Screenwriter（编剧）** —— 把想法扩展成完整剧本（默认目标时长 60 秒）
2. **角色提取** —— 从生成的剧本中识别演员表
3. **角色立绘** —— 为每个角色生成一张参考立绘。传 `--no-portraits`
   可跳过
4. **故事板生成** —— 为剧本中每个镜头生成一张静帧，使用立绘注册表
   保持角色一致性。`--no-references` 可关闭一致性通道
5. **视频生成 + 拼接** —— 把每张静帧变成视频片段，再拼接成一个最终
   电影文件

### 参数说明

| 参数 | 用途 | 默认值 |
| --- | --- | --- |
| `--idea <string>` | 想法/概念（必填） | — |
| `--title <name>` | 项目标题（用于输出路径） | 自动 |
| `--max-scenes <n>` | 场景总数上限 | 0（无限制） |
| `--scripts-only` | 第 1 阶段后停止 | false |
| `--storyboard-only` | 第 4 阶段后停止（只要静帧，不生成视频） | false |
| `--no-portraits` | 跳过第 3 阶段 | false |
| `--no-references` | 关闭第 4 阶段的参考图像调节 | false |
| `--llm-model <id>` | 覆盖 LLM（如 `gmi-glm-5.1`） | `google/gemini-3-flash-preview` |
| `--image-model <id>` | 覆盖图片模型 | `gmi_gemini_3_pro_image` |
| `--video-model <id>` | 覆盖视频模型 | `kling` |

### 目标时长

默认 **60 秒**。在 Screenwriter 配置里控制（`target_duration: 60.0`）。
与 `novel2movie` 从小说体量推导长度不同，`idea2video` 有固定目标，
由 Screenwriter 选择适合的镜头数。

### 输出

```
media/generated/vimax/idea2video/<project>/
├── scripts/                 # 生成的剧本 JSON
├── characters.json          # 提取出的演员表
├── portraits/               # 每角色的参考立绘（PNG）
├── storyboards/             # 每镜头的静帧（PNG）
├── clips/                   # 每镜头的视频片段（MP4）
└── final.mp4                # 拼接后的成片
```

中间产物默认保留在磁盘上（`save_intermediate: true`），后段阶段失败
时不必从第 1 阶段重跑。

### 什么时候用

- **广告原型** —— 从一句推销词做成 15-60 秒的概念片
- **概念短片** —— 在投入完整剧本前先探索一个视觉想法
- **批量构思** —— 用不同的 `--idea` 多次运行同一命令，一夜之间
  生成多个变体
- **演示素材** —— 快速拿到画面，不需要像素级作者控制

### 什么时候**不**用

- 已经有剧本 → 用 `flow script2video`（跳过编剧阶段，更快更便宜）
- 有小说 → 用 `flow novel2movie`（能正确地切分长篇散文）
- 需要按镜头精修 → 用 Moyin 导演面板（见 `WORKFLOW-moyin.md`）

### 分解流程（进阶）

需要更细粒度控制时，可以把每个阶段拆成独立 CLI 命令：

```bash
bun run pipeline flow script       --idea '机器人学画画'
bun run pipeline flow characters   --script script.json
bun run pipeline flow portraits    --characters characters.json
bun run pipeline flow storyboard   --script script.json --portraits portraits/
# 之后用视频生成适配器把片段拼起来
```
