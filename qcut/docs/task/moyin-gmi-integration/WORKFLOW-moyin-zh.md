# Moyin（导演面板）工作流

> 在 QCut 编辑器中，交互式地把剧本 → 故事板 → 视频生成出来。
> 无头 CLI 流程见 `WORKFLOW-novel2movie-zh.md`。
> English: [WORKFLOW-moyin-en.md](./WORKFLOW-moyin-en.md)

## 1. 进入 Director（导演）面板

在 QCut 编辑器内，打开媒体面板并切换到 **Director** 标签页。
面板分为三列：

- **左列**：Script Editor（Import / Create / Novel 三个子标签）+ Configuration
- **中列**：Structure — 角色、场景、集数、镜头
- **右列**：所选条目的属性检查器

## 2. 提供剧本

从三个输入标签中选一个：

| 标签 | 输入什么 | 程序会做什么 |
| --- | --- | --- |
| **Import** | 粘贴已有的剧本 | 直接解析 |
| **Create** | 简短想法 + 类型 + 时长 | 先生成剧本，再解析 |
| **Novel** | 小说 / 散文文本 | 先转成剧本格式，再解析 |

## 3. 配置 Parse Model（解析模型）

在剧本文本框下方的 CONFIGURATION 区，**Parse Model** 下拉菜单默认为
**GMI · GLM-5.1** —— QCut 许可证服务器代理目前只配置了 GMI 的 key,
没有 OpenRouter 的，所以 GMI 是稳定可用的路径。

其他选项：

- GMI · Gemini 3.1 Flash Lite（更便宜、更快）
- GMI · Gemini 3.1 Pro（更聪明、更慢）
- Gemini Flash / Pro（经 OpenRouter —— 目前会返回 503，除非 Worker
  env 配置更新）
- MiniMax / Kimi / Claude（同样受限）

下方的 **Image Provider** 和 **Video Provider** 选择分镜生成后端 ——
FAL（Flux Pro + WAN v2.1）或 GMI（Seedream + Veo 3.1 Lite）。

## 4. 点击 Parse Script

后台运行 **6 步流水线**（所有步骤都经 `callLLM` 发往所选 Parse Model；
每一步前端实时更新进度条，中间面板在步骤 1 完成后就显示部分数据，后续
步骤只是在丰富已有数据）：

### 1. 初始解析（Initial parse）

**代码**：`electron/moyin-handler.ts` → `PARSE_SYSTEM_PROMPT`
**参数**：`temperature: 0.7`，`maxTokens: 16384`（长剧本 JSON 很大，
4K 会被截断，后续 `JSON.parse` 就会在位置 1 报错）。

LLM 收到整份剧本，返回一个结构化 JSON，包含：

- `title`、`logline`、`genre`、`language`、`targetDuration`
- `characters[]`：每个含 `id`（如 `char_1`）、`name`、`gender`、
  `age`、`role`（主角 / 配角 / 反派）、`appearance`
- `scenes[]`：每个含 `id`（如 `scene_1`）、`location`、`time`、
  `atmosphere`、简短描述
- `episodes[]`：每集含 `id`（`ep_1`、`ep_2`…）、所包含的 scene ID 列表

主进程会做一次防御性清洗：剥掉 markdown 代码围栏、按字符串感知的方式
匹配最外层大括号、去掉多余的尾逗号；解析失败会把原始响应的前 400
字符打到 electron-log，方便线上排查。

### 2. 标题校准（Title calibration）

**代码**：`apps/web/src/stores/moyin/moyin-calibration.ts::calibrateTitleLLM`
**参数**：`temperature: 0.5`，`maxTokens: 256`。

把原标题、原 logline、类型和剧本前 500 字符丢给 LLM，要求它返回
`{title, logline}`。系统 prompt 明确说"如果原版已经够强，就保留原版"——
不是每次都改。refined logline 要求是一句话、有吸引力的概述。

### 3. Synopsis 生成（Synopsis generation）

**代码**：`generateSynopsisLLM`
**参数**：`temperature: 0.7`（更有创造性），`maxTokens: 512`。

输入包括标题、类型、logline、前 5 位主角的名字、场景总数、剧本前 800
字符。输出是 2-3 句的纯文本剧情简介（不包 JSON），会直接写到
`scriptData.synopsis`。

### 4. 镜头校准（Shot calibration）

**代码**：`apps/web/src/stores/moyin/moyin-generation.ts::generateShotsForEpisodeAction`
**参数**：`temperature: 0.5`，`maxTokens: 8192`。**按每一集分别调用**
—— 如果有 3 集就会触发 3 次 LLM 调用。

关键细节：**镜头预算是按 `targetDuration` 算的**，平均每个镜头约 10 秒
AI 视频。例如 5 分钟剧本 ≈ 30 个镜头，系统 prompt 会明确告诉 LLM
"本集总镜头数必须接近 N 个"。

每个镜头输出：

- `id`（`shot_001`）、`sceneRefId`、`index`
- `actionSummary`：这一镜头发生了什么
- `shotSize`：`MS`/`CU`/`WS` 等（中景 / 特写 / 远景）
- `cameraMovement`：`pan`/`tilt`/`static` 等（摇 / 俯仰 / 固定）
- `characterIds[]`、`characterVariations`（特定镜头下角色的临时变化）
- 初始 `imageStatus: idle` / `videoStatus: idle`、进度 0

### 5. 角色校准（Character calibration）

**代码**：`enhanceCharactersLLM`，**走两条路径之一**。

**优先路径 —— character-calibrator**：
`apps/web/src/lib/moyin/script/character-calibrator.ts`，用分集剧本和
项目背景（两者由 `getCalibrationContext` 从原始剧本 + scriptData 推
导）做更有上下文的校准。失败时会打警告、回退到下面的 legacy 路径。

**Legacy 路径**（**参数**：`temperature: 0.5`，`maxTokens: 4096`）：
输入包括项目标题、类型、所有角色的 `{id, name, role, gender, age,
appearance}` 简表。LLM 为每个角色补齐：

- `visualPromptEn`：供 AI 图像模型使用的详细英文 prompt（面部、发型、
  体型、服装、标志性特征）
- `appearance`：一行精炼的外貌概述
- `identityAnchors`（身份锚点 —— 保持跨镜头一致性的关键）：
  - `boneStructure`（骨骼结构，如"鹅蛋脸、高颧骨"）
  - `eyeShape`（眼型，如"杏仁眼、深陷"）
  - `noseShape`、`lipShape`（鼻型、唇型）
  - `hairStyle`（发型，如"齐肩黑色波浪卷"）
  - `skinTexture`（肤质，如"光滑、阳光亲吻过的肤色"）
  - `uniqueMarks[]`（标志性特征，如"左脸疤痕"、"美人痣"）

这套身份锚点随后会被故事板 prompt 拼接进去，避免同一个角色在不同镜头
看起来像换了个人。

### 6. 场景校准（Scene calibration）

**代码**：`enhanceScenesLLM`，结构和角色校准完全对称。

**优先路径 —— scene-calibrator**：
`apps/web/src/lib/moyin/script/scene-calibrator.ts`，带项目背景和分集剧本。

**Legacy 路径**（**参数**：`temperature: 0.5`，`maxTokens: 4096`）：
LLM 为每个场景补齐完整的美术指导数据：

- `visualPrompt` / `visualPromptEn`：中英文视觉 prompt
- `lightingDesign`（灯光设计，如"冷调月光 + 室内暖黄灯"）
- `architectureStyle`（建筑风格，如"明代园林"、"包豪斯"）
- `colorPalette`（色彩基调，逗号分隔，如"暖琥珀、深蓝、柔白"）
- `keyProps`（关键道具，解析时拆成数组）
- `spatialLayout`（空间布局描述）
- `eraDetails`（年代 / 历史细节）

这套数据后面会喂给图像生成，保证同一场景的不同镜头在色彩 / 氛围上
保持一致。

左侧面板实时显示每一步的进度。步骤 1 完成后中间面板就会显示部分结果；
后续步骤只是在丰富已有数据。

## 5. 审阅与编辑

- **Characters 标签**：点击角色编辑名字、外貌、角色定位、视觉 prompt、
  身份锚点
- **Scenes 标签**：编辑地点、时间、氛围、视觉 prompt
- **Shots 标签**：每个镜头的机位、角色、图像/视频 prompt

所有编辑会以 1 秒防抖自动保存到 `localStorage`，按项目 ID 隔离。
离开面板再回来，状态完全恢复。

## 6. 生成图片与视频

选中一个或多个镜头，点击 **Generate Image**（或对于已有图片的镜头点
Generate Video）。所选的 `Image Provider` / `Video Provider` 决定后端。

持久化：每个镜头生成的 URL 独立保存；项目重新加载后图像依然存在。

## 7. 导出 / 推送到时间轴

准备好后，可以把故事板数据导出为 JSON（归档用），或者把镜头 + 媒体
推送到 QCut 时间轴做最终剪辑。校准后的剧本数据会接入主编辑器的轨道系统。

## 备选：完全通过 CLI 自动化

上述每一步都可用 CLI 驱动（适合 QA / 回归 / 批处理）：

```bash
bun run pipeline editor:moyin:set-script --text '<剧本>' --json
bun run pipeline editor:moyin:parse --model gmi-glm-5.1 --json
bun run pipeline editor:moyin:status --json
bun run pipeline editor:moyin:export --json
```

需要 Electron 正在运行。完整示例见 `E2E-TEST.md` §C1。
