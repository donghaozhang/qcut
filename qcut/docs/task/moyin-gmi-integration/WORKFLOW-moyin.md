# Moyin (Director Panel) Workflow

> Interactive screenplay → storyboard → videos workflow inside the QCut
> editor. For the headless CLI pipeline, see `WORKFLOW-novel2movie.md`.

## English

### 1. Enter the Director panel

Inside the QCut editor, open the media panel and switch to the
**Director** tab. The panel has three columns:

- **Left**: Script Editor (Import / Create / Novel tabs) + Configuration
- **Middle**: Structure — characters, scenes, episodes, shots
- **Right**: Property inspector for the selected item

### 2. Provide the script

Pick one of the three input tabs:

| Tab | What you give it | What the app does |
| --- | --- | --- |
| **Import** | Paste an existing screenplay | Parses it as-is |
| **Create** | A short idea + genre + duration | Generates a screenplay first, then parses |
| **Novel** | Prose / novel text | Converts to screenplay form, then parses |

### 3. Configure the Parse Model

In the CONFIGURATION section below the script textarea, the
**Parse Model** dropdown defaults to **GMI · GLM-5.1** (the QCut
license-server proxy currently has the GMI key but not OpenRouter; GMI is
the reliably working path).

Other options:

- GMI · Gemini 3.1 Flash Lite (cheaper, faster)
- GMI · Gemini 3.1 Pro (smarter, slower)
- Gemini Flash / Pro (routes via OpenRouter — currently 503 until the
  Worker env is updated)
- MiniMax / Kimi / Claude (same caveat)

The **Image Provider** and **Video Provider** selectors below control
the storyboard generation backend — FAL (Flux Pro + WAN v2.1) or GMI
(Seedream + Veo 3.1 Lite).

### 4. Click Parse Script

Behind the scenes the Director runs a **6-step pipeline**:

1. **Initial parse** — extract characters, scenes, episodes as
   structured JSON (single LLM call)
2. **Title calibration** — refine the title + logline
3. **Synopsis generation** — 2-3 sentence synopsis
4. **Shot calibration** — per episode, generate shot breakdown with
   camera language (size, movement, characters)
5. **Character calibration** — enrich characters with visual identity
   anchors (bone structure, eye shape, clothing etc.) via the
   character-calibrator
6. **Scene calibration** — enrich scenes with art direction (lighting,
   color palette, spatial layout) via the scene-calibrator

The left panel shows progress of each step live. You see partial
results in the middle panel as soon as step 1 completes; later steps
just enrich what's already there.

### 5. Review + edit

- **Characters tab**: click a character to edit name, appearance, role,
  visual prompt, identity anchors
- **Scenes tab**: edit location, time, atmosphere, visual prompt
- **Shots tab**: per-shot camera, characters, image/video prompts

Everything autosaves to `localStorage` on a 1-second debounce, scoped
to the current project ID. Leaving the panel and coming back restores
state exactly.

### 6. Generate images + videos

Select one or more shots, then click **Generate Image** (or Generate
Video for already-imaged shots). The selected `Image Provider` /
`Video Provider` decides the backend.

Persistence: generated URLs are saved per-shot; reloading the project
keeps the imagery.

### 7. Export / send to timeline

When ready, export the storyboard data as JSON (for archival) or push
shots + media to the QCut timeline for final editing. The calibrated
script data feeds into the main editor's track system.

### Alternative: fully automated via CLI

Every step above can be driven from the CLI (useful for QA /
regression / batch):

```bash
bun run pipeline editor:moyin:set-script --text '<script>' --json
bun run pipeline editor:moyin:parse --model gmi-glm-5.1 --json
bun run pipeline editor:moyin:status --json
bun run pipeline editor:moyin:export --json
```

Requires Electron to be running. See `E2E-TEST.md` §C1 for the full
recipe.

---

## 中文

### 1. 进入 Director（导演）面板

在 QCut 编辑器内，打开媒体面板并切换到 **Director** 标签页。
面板分为三列：

- **左列**：Script Editor（Import / Create / Novel 三个子标签）+ Configuration
- **中列**：Structure — 角色、场景、集数、镜头
- **右列**：所选条目的属性检查器

### 2. 提供剧本

从三个输入标签中选一个：

| 标签 | 输入什么 | 程序会做什么 |
| --- | --- | --- |
| **Import** | 粘贴已有的剧本 | 直接解析 |
| **Create** | 简短想法 + 类型 + 时长 | 先生成剧本，再解析 |
| **Novel** | 小说 / 散文文本 | 先转成剧本格式，再解析 |

### 3. 配置 Parse Model（解析模型）

在剧本文本框下方的 CONFIGURATION 区，**Parse Model** 下拉菜单默认为
**GMI · GLM-5.1** —— QCut 许可证服务器代理目前只配置了 GMI 的 key，
没有 OpenRouter 的，所以 GMI 是稳定可用的路径。

其他选项：

- GMI · Gemini 3.1 Flash Lite（更便宜、更快）
- GMI · Gemini 3.1 Pro（更聪明、更慢）
- Gemini Flash / Pro（经 OpenRouter —— 目前会返回 503，除非 Worker
  env 配置更新）
- MiniMax / Kimi / Claude（同样受限）

下方的 **Image Provider** 和 **Video Provider** 选择分镜生成后端 ——
FAL（Flux Pro + WAN v2.1）或 GMI（Seedream + Veo 3.1 Lite）。

### 4. 点击 Parse Script

后台运行 **6 步流水线**：

1. **初始解析** —— 把角色、场景、集数提取为结构化 JSON（单次 LLM 调用）
2. **标题校准** —— 精炼标题 + logline
3. **Synopsis 生成** —— 2-3 句剧情简介
4. **镜头校准** —— 按每一集生成镜头分解（机位、景别、运镜、角色）
5. **角色校准** —— 通过 character-calibrator 丰富角色的视觉身份锚点
   （骨骼结构、眼型、服装等）
6. **场景校准** —— 通过 scene-calibrator 丰富场景的美术指导
   （灯光、色彩、空间布局）

左侧面板实时显示每一步的进度。步骤 1 完成后中间面板就会显示部分结果；
后续步骤只是在丰富已有数据。

### 5. 审阅与编辑

- **Characters 标签**：点击角色编辑名字、外貌、角色定位、视觉 prompt、
  身份锚点
- **Scenes 标签**：编辑地点、时间、氛围、视觉 prompt
- **Shots 标签**：每个镜头的机位、角色、图像/视频 prompt

所有编辑会以 1 秒防抖自动保存到 `localStorage`，按项目 ID 隔离。
离开面板再回来，状态完全恢复。

### 6. 生成图片与视频

选中一个或多个镜头，点击 **Generate Image**（或对于已有图片的镜头点
Generate Video）。所选的 `Image Provider` / `Video Provider` 决定后端。

持久化：每个镜头生成的 URL 独立保存；项目重新加载后图像依然存在。

### 7. 导出 / 推送到时间轴

准备好后，可以把故事板数据导出为 JSON（归档用），或者把镜头 + 媒体
推送到 QCut 时间轴做最终剪辑。校准后的剧本数据会接入主编辑器的轨道系统。

### 备选：完全通过 CLI 自动化

上述每一步都可用 CLI 驱动（适合 QA / 回归 / 批处理）：

```bash
bun run pipeline editor:moyin:set-script --text '<剧本>' --json
bun run pipeline editor:moyin:parse --model gmi-glm-5.1 --json
bun run pipeline editor:moyin:status --json
bun run pipeline editor:moyin:export --json
```

需要 Electron 正在运行。完整示例见 `E2E-TEST.md` §C1。
