# Moyin (Director Panel) vs. `flow novel2movie` CLI

> Two paths from text to video in QCut. This doc explains when to use
> which, what they share, and where they diverge.

## English

### At-a-glance

| | **Moyin (Director Panel)** | **`flow novel2movie` CLI** |
| --- | --- | --- |
| **Runs in** | Electron UI | Headless `bun run pipeline` |
| **User interaction** | Click + edit every step | Fire one command, walk away |
| **Input shape** | Screenplay / short idea / prose | Long-form prose (novel) |
| **Scene model** | Explicit Episode → Scene → Shot hierarchy | Flat shots segmented directly from prose |
| **Duration target** | Per-project `targetDuration` (15s–5min) | Hours (novel length × 15s/shot) |
| **Editing after generation** | Live — change prompts, regenerate a single shot | None — re-run with different flags |
| **Character consistency** | Visual identity anchors + style presets | Character-portrait reference registry |
| **LLM dispatch** | `moyin-llm.ts` + `moyin-handler.ts` IPC | Shared `callModelApi` abstraction |
| **Image provider** | FAL (Flux Pro) or GMI (Seedream) per-shot toggle | One provider per run (`--image-model` flag) |
| **Video provider** | FAL (WAN v2.1) or GMI (Veo 3.1 Lite) per-shot toggle | One provider per run (`--video-model` flag) |
| **Credits / auth** | Uses signed-in license-server proxy | Same proxy when signed in, else local key |
| **Failure recovery** | Per-step retry; store persists across restarts | Intermediate artifacts on disk, resumable via flags |
| **Best for** | Shortform: ads, music videos, 1-5 min narratives | Longform: novels, book adaptations, multi-hour output |

### When to choose Moyin

- You need **per-shot control** — different characters, camera
  language, prompt tweaks
- Total length is **under ~10 minutes**
- You want to **iterate visually** — regenerate one shot, swap
  a character's outfit, adjust pacing in the timeline
- You're **converting an existing screenplay** or have a concrete
  idea in mind
- You need to **end in the QCut timeline** with other tracks
  (music, voiceover, transitions)

### When to choose `flow novel2movie`

- You have a **long prose source** (chapter / short story / novel)
  and want a rough video of the whole thing
- You're OK with **flat shot pacing** (~15s per shot, no author-chosen
  scene boundaries)
- You want a **fire-and-forget** run — kick it off, come back hours
  later to a finished `final.mp4`
- You're running **batch conversions** (multiple books, unattended)
- You don't need fine editing after the pipeline completes

### What they share

Both pipelines:

- Call LLMs through the same provider layer (OpenRouter, Gemini, GMI,
  Claude CLI, or license-server proxy).
- Route images through FAL or GMI providers via `callModelApi`.
- Respect the same `.qcut/.env` keys (`GMI_API_KEY`, `FAL_KEY`,
  `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `QCUT_AUTH_TOKEN`).
- Deduct credits server-side when proxied.
- Produce artifacts compatible with the QCut project format (you can
  drag outputs from the novel2movie pipeline into the editor).

### What they don't share

- **Scene model**: Moyin builds Episode → Scene → Shot. novel2movie
  skips the Scene layer and cuts prose directly into shots — closer to
  the source text, no author-imposed scene seams.
- **Calibration pipeline**: Moyin runs 5 enrichment stages (title,
  synopsis, shot, character, scene calibration). novel2movie has a
  single character-extraction stage and relies on shot-level prompts.
- **Persistence model**: Moyin persists to `localStorage` per project.
  novel2movie persists to a disk output directory and is re-entered
  via flags, not state.
- **Model defaults**: Moyin defaults to `gmi-glm-5.1` for LLM calls
  (because the license-server proxy has the GMI key).
  novel2movie defaults to `google/gemini-3-flash-preview`
  (OpenRouter-routed), which currently fails unless you override with
  `--llm-model gmi-glm-5.1`.

### Practical cheat sheet

- Short ad? → Moyin, Create tab, 60s target, FAL provider
- Book adaptation? → `novel2movie`, `--max-scenes` to cap length
- Music video? → Moyin, Import the lyrics as a "script", GMI image +
  FAL video
- Educational long-form lesson? → `novel2movie --storyboard-only` to
  see the boards first, then re-run without that flag when approved

---

## 中文

### 一览表

| | **Moyin（导演面板）** | **`flow novel2movie` 命令行** |
| --- | --- | --- |
| **运行环境** | Electron 界面 | 无头 `bun run pipeline` |
| **用户交互** | 每一步都可点击 + 编辑 | 一条命令跑完就离开 |
| **输入形态** | 剧本 / 短想法 / 散文 | 长篇散文（小说） |
| **场景模型** | 明确的 集数 → 场景 → 镜头 层级 | 扁平镜头，直接从散文切出来 |
| **目标时长** | 项目级 `targetDuration`（15 秒–5 分钟） | 小时级（小说长度 × 每镜头 15 秒） |
| **生成后编辑** | 实时 —— 改 prompt、重生成单镜头 | 无 —— 用不同参数重跑 |
| **角色一致性** | 视觉身份锚点 + 风格预设 | 角色立绘参考注册表 |
| **LLM 调度** | `moyin-llm.ts` + `moyin-handler.ts` IPC | 共享 `callModelApi` 抽象层 |
| **图片后端** | 按镜头切换 FAL（Flux Pro）或 GMI（Seedream） | 每次运行一个后端（`--image-model` 参数） |
| **视频后端** | 按镜头切换 FAL（WAN v2.1）或 GMI（Veo 3.1 Lite） | 每次运行一个后端（`--video-model` 参数） |
| **Credits / 认证** | 登录状态下走许可证服务器代理 | 登录时同走代理，否则用本地 key |
| **失败恢复** | 每步重试；状态跨重启持久化 | 中间产物存盘，通过参数恢复 |
| **适合场景** | 短片：广告、MV、1-5 分钟叙事 | 长片：小说、书籍改编、多小时产出 |

### 什么时候用 Moyin

- 需要**按镜头控制** —— 不同角色、镜头语言、prompt 微调
- 总时长在 **10 分钟以内**
- 想要**可视化迭代** —— 单镜头重生成、换角色服装、在时间轴上调节奏
- 在**转换已有剧本**或心里已有具体想法
- 希望最后**落回 QCut 时间轴**与其他轨道（音乐、配音、转场）组合

### 什么时候用 `flow novel2movie`

- 有**长篇散文源**（章节 / 短篇 / 小说）想快速出整片
- 能接受**扁平镜头节奏**（每镜头约 15 秒，不由作者选定场景边界）
- 想要**启动就不管** —— 跑起来后几小时后回来拿到 `final.mp4`
- 做**批量转换**（多本书、无人值守）
- 跑完后不需要精细剪辑

### 二者共同点

两条流水线都：

- 通过同一套 provider 层调用 LLM（OpenRouter、Gemini、GMI、Claude CLI
  或许可证服务器代理）。
- 图片生成经 `callModelApi` 走 FAL 或 GMI。
- 读取相同的 `.qcut/.env` key（`GMI_API_KEY`、`FAL_KEY`、
  `OPENROUTER_API_KEY`、`GEMINI_API_KEY`、`QCUT_AUTH_TOKEN`）。
- 走代理时在服务端扣 credits。
- 产物格式兼容 QCut 项目（novel2movie 的输出可以拖进编辑器）。

### 二者不同点

- **场景模型**：Moyin 构建 集数 → 场景 → 镜头。novel2movie 跳过场景
  层，把散文直接切成镜头 —— 更贴近原文，不引入作者强加的场景接缝。
- **校准流水线**：Moyin 跑 5 个丰富化阶段（标题、synopsis、镜头、
  角色、场景校准）。novel2movie 只有一个角色提取阶段，依赖镜头级
  prompt 做细节。
- **持久化模型**：Moyin 按项目存到 `localStorage`。novel2movie 存到
  磁盘输出目录，靠参数重新进入，不靠状态。
- **模型默认值**：Moyin 的 LLM 默认 `gmi-glm-5.1`（因为许可证服务器代
  理有 GMI 的 key）。novel2movie 默认 `google/gemini-3-flash-preview`
  （走 OpenRouter），目前会失败，除非用 `--llm-model gmi-glm-5.1` 覆盖。

### 实用对照

- 短广告？→ Moyin，Create 标签，60s 目标时长，FAL 后端
- 小说改编？→ `novel2movie`，用 `--max-scenes` 封顶长度
- 音乐 MV？→ Moyin，把歌词作为"剧本"导入，GMI 图片 + FAL 视频
- 长篇教学课？→ `novel2movie --storyboard-only` 先看故事板，确认无
  误后去掉此参数重跑
