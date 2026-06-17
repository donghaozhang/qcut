# 角色一致性检测 — 实施方案（中文）

> 配套文档：[IMPLEMENTATION-PLAN.en.md](./IMPLEMENTATION-PLAN.en.md) · [TASKS.zh.md](./TASKS.zh.md) · [TASKS.en.md](./TASKS.en.md)

## 1. 目标

在 QCut 原生管线 CLI 中新增一个功能：通过把视频与一张或多张**参考图片**对比，检测视频里的**角色一致性问题**。

要解决的典型问题：角色在不同场景中莫名其妙地**变高 / 变矮 / 比例不对**，或在外观上发生漂移（人物身份/面部、服装、肢体结构）。

- **输入**：一张或多张参考图片 **+** 一段待检测视频。
- **输出**：具体的时间步（Time Step）—— 问题出现在**第几帧到第几帧**（frame X → frame Y，并附 `HH:MM:SS` 时间戳）、**分类**（例如 `proportion/height` —— "人物比例不对"）、严重程度、真人风格的说明，以及修改建议。
- **判定策略**：刻意保持**保守 / 大概的判法**。只有当画面对普通观众来说**确实特别有问题**时才上报；不确定就**不报**。这样能把误报噪声压到最低（身高是相对量，会被机位距离、焦段、角度、姿势严重干扰 —— 见 §6）。

## 2. 为什么是这个方案（背景）

这是在评估了四种方案后选定的（完整分析见生成本文档的对话记录）：

| 方案 | 跨场景对比 | 空间精度 | 成本 | 结论 |
|---|---|---|---|---|
| 直接复用现有 `analyze-video --analysis-type review` | ❌ 切片审片会破坏跨段对比 | 低（视频采样帧） | 中 | 不可行 |
| 在视频片头拼一段参考片 | ⚠️ 仅单次调用内有效，切片即失效 | 低 | 中 | 权宜之计 |
| 多输入：多段**视频** | ✅（需 Gemini 2.5+） | 中（仍是采样帧） | **高** | 次优 |
| **多输入：参考图 + 抽取的关键帧图** | ✅ 完全控制对比对象 | **高（全分辨率静帧）** | **低** | **选定** |

模型层面已确认的事实：
- Gemini 支持**一个请求多张图片**（专为 before/after、批量对比设计）。内联载荷必须**总计 < 20 MB**，更大需走 File API。
- Gemini 多段**视频**仅在 **2.5+** 支持（每请求最多 10 段），且官方建议一个 prompt 一段视频效果最佳。

因此实现思路是：从视频**抽取关键帧**、缩放后，把 `参考图 + 一批关键帧` 作为**多图请求**发给模型，让它逐帧把关键帧里的角色与参考图对比。

## 3. 驱动本次开发的现状约束

当前执行器一次只发**一个**媒体 part。见 [electron/native-pipeline/execution/step-executors.ts:1832](../../../electron/native-pipeline/execution/step-executors.ts)（`executeOpenRouterMediaUnderstanding`）：`content` 数组是 `[ {text}, {video_url | image_url} ]`，只支持单媒体。

OpenRouter / Gemini 的 chat-completions 协议**本身**支持多个 part（`content: [ {text}, {image_url}, {image_url}, ... ]`），所以核心工程任务是：在**不破坏现有单媒体路径**的前提下，新增一条**多图执行路径**。

## 4. 架构

新增一个模块目录，沿用现有 `video-review/` 的布局：

```
electron/native-pipeline/character-consistency/
├── types.ts                  # 共享类型（输入选项、Finding、输出 schema）
├── frame-extractor.ts        # ffprobe（fps/时长）+ ffmpeg 抽关键帧 + 缩放
├── consistency-prompts.ts    # 中英文 prompt 集、分类、JSON 输出 schema
├── consistency-runner.ts     # 编排：抽帧 → 分批 → 调用 → 合并 → 过滤
├── consistency-normalize.ts  # 解析模型 JSON → 规范化 Finding[]（含帧范围）
├── consistency-artifacts.ts  # 写 JSON / CSV / HTML / Markdown 报告
└── __tests__/                # 单元测试
```

外加接线：
- `cli/cli-handlers-character-consistency.ts` —— CLI handler。
- `execution/step-executors.ts` —— 新增 `executeMultiImageUnderstanding`（多图 content 构造）。
- `cli/command-registry.ts` —— 注册 `analyze-consistency` 命令。
- `cli/cli-runner/handler-map.ts` —— 命令 → handler 映射。

### 端到端流程

```
qcut analyze consistency \
  --ref ref1.jpg --ref ref2.jpg \
  --input scene.mp4 \
  --language zh --min-severity high

1. 解析 & 校验
   ├─ ≥1 张参考图存在；视频存在 / URL 合法
   └─ 解析模型（默认 openrouter_gemini_2_5_flash_video，可切换到 3.5）

2. 探测视频（frame-extractor.ts）
   ├─ ffprobe → fps（r_frame_rate）、时长、总帧数
   └─ 用于时间戳 ⇄ 帧号互转

3. 抽取关键帧（frame-extractor.ts）
   ├─ ffmpeg 采样：fps=N（默认 1）或 场景切换 select
   ├─ 缩放到长边 ~768px 的 JPEG（控制载荷）
   └─ 每帧标注：{ index, frameNumber, timeSeconds, path }

4. 分批（consistency-runner.ts）
   ├─ 参考图在每个批次都带上（标注 REFERENCE）
   └─ 关键帧每批 K 张（默认 6），控制在 20MB / 图片数 上限内

5. 多图模型调用（executeMultiImageUnderstanding）
   ├─ content = [ prompt, 参考图…, 关键帧图（标注 #帧号 @ 时间） ]
   └─ 模型按批返回 JSON 数组形式的 findings

6. 规范化（consistency-normalize.ts）
   ├─ 去 markdown 围栏、解析 JSON、校验 category/severity
   └─ 把每个被标记的关键帧 → 帧范围 [startFrame, endFrame]

7. 合并 & 过滤（consistency-runner.ts）
   ├─ 把连续的同分类标记合并成一个范围
   ├─ 丢弃低于 --min-severity 的项（默认仅 high）
   └─ 跨批次去重

8. 产物（consistency-artifacts.ts）
   └─ consistency-findings.json / .csv / .html / report.md
```

## 5. 数据契约

### CLI 选项（加入 `CLIRunOptions`）
| 参数 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `--ref`（可重复） | `string[]` | —（≥1 必填） | 参考图路径 |
| `--input` / `-i` | `string` | —（必填） | 视频路径或 URL |
| `--model` / `-m` | `string` | `openrouter_gemini_2_5_flash_video` | 模型 key（默认 2.5；换成 `openrouter_gemini_3_5_flash_video` 即用 3.5） |
| `--language` | `string` | `zh` | Prompt 语言（`zh` \| `en`） |
| `--fps` | `number` | `1` | 关键帧采样率 |
| `--scene-detect` | `boolean` | `false` | 用场景切换选帧替代固定 fps |
| `--batch-size` | `number` | `6` | 每个模型请求的关键帧数 |
| `--min-severity` | `string` | `high` | 上报阈值（`low` \| `medium` \| `high`） |
| `--max-tokens` | `number` | `8000` | 每请求最大输出 token |
| `--output-dir` / `-o` | `string` | 视频目录 / cwd | 产物写入位置 |

### 输出 JSON（`consistency-findings.json`）
```json
{
  "video": "scene.mp4",
  "model": "openrouter_gemini_2_5_flash_video",
  "videoFps": 30,
  "totalFrames": 4500,
  "referenceImages": ["ref1.jpg"],
  "samplingFps": 1,
  "minSeverity": "high",
  "findings": [
    {
      "startFrame": 120,
      "endFrame": 168,
      "startTime": "00:00:04.000",
      "endTime": "00:00:05.600",
      "category": "proportion/height",
      "severity": "high",
      "comment": "角色明显比参考图矮一截，头身比相对前后镜头突变。",
      "fix": "按参考图比例重生该镜头，或把角色缩放到与上一场一致。"
    }
  ]
}
```

### 分类（聚焦"一致性"，与审片的 9 大分类不同）
- `proportion/height`（人物比例/身高）
- `identity/face`（人物身份/面部）—— 看着像换了个人
- `clothing/appearance`（服装/外观）—— 服装/发型/颜色突变
- `body/limb`（肢体结构）—— 多/缺/畸形肢体
- `other`（其他）

## 6. 保守判定策略（正确性的核心）

通过 prompt + 后置过滤双重克制：
- **Prompt** 要求：只标记普通观众在正常播放下能察觉的不一致；**明确忽略**可由机位距离、焦段、角度、裁切、姿势解释的差异；不确定就该帧不返回任何内容。
- **后置过滤**只保留 `>= --min-severity` 的 finding（默认 `high`）。
- 文档里写明现实预期：身高是**相对量**且受多重干扰 —— 本工具**圈出可疑帧范围交人复核**，**不是**精确测量。要逐帧硬指标需上姿态估计（每帧头身像素比），不在本期范围（§9）。

## 7. 集成点（精确引用）

| 内容 | 文件 | 锚点 |
|---|---|---|
| 待扩展的单媒体执行器 | [execution/step-executors.ts:1793](../../../electron/native-pipeline/execution/step-executors.ts) | `executeOpenRouterMediaUnderstanding` |
| 按 step 分类分发 | [execution/step-executors.ts:958](../../../electron/native-pipeline/execution/step-executors.ts) | `image_understanding` 分支 |
| 模型定义（参照 3.5 条目新增一个 2.5 条目） | [registry-data/image-understanding.ts:114](../../../electron/native-pipeline/registry-data/image-understanding.ts) | 新增 `openrouter_gemini_2_5_flash_video` → `google/gemini-2.5-flash`；现有 3.5 条目为 `openrouter_gemini_3_5_flash_video` |
| 可镜像的命令结构 | [cli/command-registry.ts:577](../../../electron/native-pipeline/cli/command-registry.ts) | `analyze-video` 条目 |
| flag 辅助函数 / `FlagDef` | [cli/command-registry-types.ts:10](../../../electron/native-pipeline/cli/command-registry-types.ts) | `f()` + `FlagDef` |
| handler 分发表 | [cli/cli-runner/handler-map.ts:172](../../../electron/native-pipeline/cli/cli-runner/handler-map.ts) | `"analyze-video": mediaHandleAnalyzeVideo` |
| 可复用的 ffmpeg/ffprobe 写法 | [video-review/review-split-runner.ts:243](../../../electron/native-pipeline/video-review/review-split-runner.ts) | `execFileAsync("ffprobe"/"ffmpeg", …)` |
| 可镜像的产物写法 | [video-review/review-artifacts.ts](../../../electron/native-pipeline/video-review/review-artifacts.ts) | `writeReviewArtifacts` |
| handler 签名 | [cli/cli-runner/handler-map.ts:103](../../../electron/native-pipeline/cli/cli-runner/handler-map.ts) | `CommandHandler` 类型 |
| 测试范式 | [cli/__tests__/cli-handlers-media-review.test.ts](../../../electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts) | vitest + stub executor |

## 8. 关键决策与权衡

1. **用多图，不用多视频。** 空间保真更高、成本低得多、不锁死特定版本，且能精确控制对比哪些帧。（见 §2）
2. **新增执行函数，而非改动单媒体路径。** 保留经过验证的旧路径不动；长期可维护性优先于就地的"聪明"改法。新的 step 输入形态 `{ images: MediaPart[] }` 走新的 `executeMultiImageUnderstanding`。
3. **参考图每批重复带上。** 每个请求都是独立调用，基准必须出现在每个请求里。
4. **缩放帧（~768px）+ 分批（K=6）。** 不走 File API 也能让典型片段的内联载荷低于 Gemini 20 MB 上限；两者都是 flag，大任务可调。
5. **fps 取自 `ffprobe r_frame_rate`。** 这是满足"上报第几帧到第几帧"的前提。`frameNumber = round(timeSeconds * fps)`。
6. **默认保守（`--min-severity high`）。** 对应用户"只有特别有问题才上报"的要求。
7. **默认 Gemini 2.5 Flash，可切换 3.5。** 默认模型 key 为 `openrouter_gemini_2_5_flash_video`（→ `google/gemini-2.5-flash`）；`--model openrouter_gemini_3_5_flash_video` 即切到 3.5。这需要**新增一个 OpenRouter 2.5 注册条目**，参照现有的 3.5 条目（目前这条路径上只注册了 3.5；现有的 2.5 `fal_video_qa` 走的是另一个 FAL endpoint，不是多图 chat-completions 路径）。方案本身与版本无关 —— 多图在两者上都能用。

## 9. 明确不做的范围

- 像素级精确身高测量 / 姿态估计（逐帧头身比）。可作为未来的 `--metric` 模式。
- 编辑器 / 时间线 UI 集成（本期先做 CLI + 产物）。
- 原生（非 OpenRouter）Gemini 直连。若 OpenRouter 多图受限，作为后续项（见风险）。

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 选定的 Gemini 模型在 OpenRouter 路由下多图可能传不干净 | 在子任务 3 早期用「2 张图」冒烟验证；必要时记录回退到原生 Gemini provider 条目 |
| 长视频 / 多帧导致内联载荷 > 20 MB | 缩放 + 分批；仍超则调低 `--fps` 或 `--batch-size`；未来：File API 上传 |
| 机位/姿势混淆导致误报 | 保守 prompt + 默认 `--min-severity high` + 文档定位为"供人复核" |
| 打包后的 app 里 ffmpeg/ffprobe 不在 PATH | 复用现有 review-split-runner 的调用写法；缺失时给出清晰报错（与现有审片功能一致） |
| 帧范围映射 off-by-one | `consistency-normalize.test.ts` 用单测锁定时间戳→帧号的换算 |

## 11. 验证

- `bun run test` —— 所有新单测通过（见 [TASKS.zh.md](./TASKS.zh.md)）。
- `bun check-types` —— 无错。
- `bun lint:clean` —— 无错（提交前先跑 biome）。
- 手动冒烟：对一段「故意把角色缩放过」的短片跑 `analyze consistency`，确认坏的帧范围被报出来、带帧号且分类为 `proportion/height`；对干净片段应得到 `findings: []`。
