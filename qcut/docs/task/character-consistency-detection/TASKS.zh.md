# 角色一致性检测 — 任务拆解（中文）

> 配套文档：[TASKS.en.md](./TASKS.en.md) · [IMPLEMENTATION-PLAN.zh.md](./IMPLEMENTATION-PLAN.zh.md) · [IMPLEMENTATION-PLAN.en.md](./IMPLEMENTATION-PLAN.en.md)

本功能远超 20 分钟，因此拆成有序子任务。每个子任务都列出要新建/修改的文件以及对应的单元测试。按顺序做；任务 1–6 基本独立于 CLI 接线，完成任务 0 后可并行。

**总预估：约 6–9 小时**（单人）。

---

## 任务 0 — 类型与模块脚手架
**目标：** 先定好共享类型，让后续任务能各自独立编译。
**约 20 分钟**

- **新建** `electron/native-pipeline/character-consistency/types.ts`
  - `ConsistencyCategory = "proportion/height" | "identity/face" | "clothing/appearance" | "body/limb" | "other"`
  - `Severity = "low" | "medium" | "high"`
  - `Keyframe = { index: number; frameNumber: number; timeSeconds: number; path: string }`
  - `ConsistencyFinding = { startFrame; endFrame; startTime; endTime; category; severity; comment; fix }`
  - `ConsistencyRunOptions`（refs[]、videoInput、model、language、fps、sceneDetect、batchSize、minSeverity、maxTokens、outputDir）
  - `ConsistencyResult = { video; model; videoFps; totalFrames; referenceImages; samplingFps; minSeverity; findings: ConsistencyFinding[] }`

**验收：** `bun check-types` 通过；暂无行为。

---

## 任务 1 — 抽帧（ffmpeg/ffprobe）
**目标：** 探测 fps/时长，抽取带帧号的缩放关键帧。
**约 1.5 小时**

- **新建** `electron/native-pipeline/character-consistency/frame-extractor.ts`
  - `probeVideoMeta(input): Promise<{ fps; durationSeconds; totalFrames }>` —— `ffprobe -show_entries stream=r_frame_rate,duration`。复用 [video-review/review-split-runner.ts:243](../../../electron/native-pipeline/video-review/review-split-runner.ts) 里的 `execFileAsync("ffprobe", …)` 写法。
  - `extractKeyframes({ input, fps, sceneDetect, outputDir, maxLongEdge=768 }): Promise<Keyframe[]>` —— `ffmpeg -vf "fps=N,scale='min(768,iw)':-2"`（`sceneDetect` 时用 `select='gt(scene,0.4)'`），把 JPEG 写到 `<outputDir>/consistency-frames/`，计算 `frameNumber = round(timeSeconds * videoFps)`。
- **新建测试** `electron/native-pipeline/character-consistency/__tests__/frame-extractor.test.ts`
  - 用 vitest `vi.mock` mock 掉 `child_process.execFile`，断言 ffmpeg/ffprobe argv 正确；验证 `r_frame_rate` 解析（`"30000/1001"` → `29.97`）、帧号换算、JPEG 命名。CI 不跑真 ffmpeg。

**验收：** 单测通过；给定假时长，关键帧列表的时间戳+帧号正确。

---

## 任务 2 — Prompt 集与 schema
**目标：** 落实保守判定策略的中英文 prompt。
**约 1 小时**

- **新建** `electron/native-pipeline/character-consistency/consistency-prompts.ts`
  - `getConsistencyPromptSet({ language }): { language; system: string }`，结构参照 [video-review/review-prompts.ts](../../../electron/native-pipeline/video-review/review-prompts.ts)。
  - Prompt 内容（双语）：角色 = "角色一致性检查员"；最前面的图是该角色标准比例/外观的 REFERENCE；后续每张图是带标注的帧；**只**报明显问题；**忽略**可由机位距离/角度/姿势/裁切解释的差异；只输出 `{ frameNumber, category, severity, comment, fix }` 的 JSON 数组；没问题就空数组。
  - 后续可支持类似 `--review-prompt-dir` 的覆盖（可选；本期先内置）。
- **新建测试** `electron/native-pipeline/character-consistency/__tests__/consistency-prompts.test.ts`
  - 断言中英文都返回非空 prompt，且包含分类列表与"只标记明显问题"的指令。

**验收：** 中英文字符串断言通过。

---

## 任务 3 — 多图执行路径
**目标：** 让执行器在不动单媒体路径的前提下，一次请求发 `参考图 + N 帧`。
**约 1.5 小时**

- **修改** `electron/native-pipeline/execution/step-executors.ts`
  - 在 [executeOpenRouterMediaUnderstanding:1793](../../../electron/native-pipeline/execution/step-executors.ts) 附近新增 `executeMultiImageUnderstanding(model, input, payload, options)`。构造 `content = [ {type:"text", text}, ...images.map(u => ({ type:"image_url", image_url:{ url:u } })) ]`，并像现有函数那样调用 `callModelApi(... provider:"openrouter")`。
  - 新增 `StepInput.images?: string[]`（data URL / 路径 → 复用 `toOpenRouterMediaUrl`）。当 `input.images?.length` 有值时走多图函数；否则保持现有行为。
- **修改** step 输入类型（同文件或 `execution/types.ts`）加上 `images?: string[]`。
- **新建测试** `electron/native-pipeline/execution/__tests__/multi-image-understanding.test.ts`
  - mock `callModelApi`；断言外发 `content` 数组按序含 1 个 text + K 个 `image_url`，且单媒体调用不受影响（回归）。

**验收：** 新测 + 现有执行器测试全绿。

---

## 任务 4 — 响应规范化 → 帧范围
**目标：** 把模型 JSON 解析成干净的、带帧范围的 `ConsistencyFinding[]`。
**约 1 小时**

- **新建** `electron/native-pipeline/character-consistency/consistency-normalize.ts`
  - `parseConsistencyResponse({ response, batchKeyframes, samplingFps, videoFps }): ConsistencyFinding[]` —— 去围栏、解析数组、校验 `category`/`severity`（中英文同义词），把每个被标记的 `frameNumber` 映射成范围：`startFrame = round(t*videoFps)`、`endFrame = round((t + 1/samplingFps)*videoFps) - 1`，填充 `HH:MM:SS.mmm` 字符串。
  - 丢弃畸形项；遇到不完整 JSON 绝不抛错（参照 [video-review/review-normalize.ts](../../../electron/native-pipeline/video-review/review-normalize.ts)）。
- **新建测试** `electron/native-pipeline/character-consistency/__tests__/consistency-normalize.test.ts`
  - 覆盖：干净 JSON、带围栏 JSON、截断 JSON、中文 category/severity 映射、**帧范围换算（锁定 off-by-one）**、空数组。

**验收：** 所有边界用例通过；帧换算精确。

---

## 任务 5 — 编排 runner
**目标：** 串起 抽帧 → 分批 → 执行器 → 合并 → 过滤。
**约 1.5 小时**

- **新建** `electron/native-pipeline/character-consistency/consistency-runner.ts`
  - `runConsistencyCheck({ options, executor, onProgress, signal }): Promise<ConsistencyResult>`：
    1. `probeVideoMeta` + `extractKeyframes`
    2. 参考图编码一次（data URL）
    3. 把关键帧按 `batchSize` 切批；每批构造 `StepInput.images = [...refs, ...frameImgs]` + 标注每帧帧号/时间的 prompt
    4. 每批调 `executor.executeStep`（多图 step），顺序执行以控并发（参照 `reviewPartsSequentially`）
    5. 每批 `parseConsistencyResponse` → 合并连续同分类范围 → 过滤 `>= minSeverity` → 去重
  - **合并辅助** `mergeAdjacentFindings(findings)` —— 把帧范围相接/重叠的同分类 finding 合并。
- **新建测试** `electron/native-pipeline/character-consistency/__tests__/consistency-runner.test.ts`
  - stub executor（记录 step、按批返回预设 JSON）+ mock frame-extractor；断言分批（参考图每批都在）、相邻范围合并、`--min-severity high` 能把 `medium` 过滤掉。

**验收：** runner 测试通过；分批 + 过滤行为验证无误。

---

## 任务 6 — 产物写出
**目标：** 输出 JSON / CSV / HTML / Markdown 报告。
**约 1 小时**

- **新建** `electron/native-pipeline/character-consistency/consistency-artifacts.ts`
  - `writeConsistencyArtifacts({ outputDir, result }): { jsonPath; csvPath; htmlPath; reportPath }`，参照 [video-review/review-artifacts.ts](../../../electron/native-pipeline/video-review/review-artifacts.ts)。
  - 文件：`consistency-findings.json`、`consistency-findings.csv`（startFrame、endFrame、startTime、endTime、category、severity、comment、fix）、`consistency-report.html`（可排序表格）、`consistency-report.md`。
- **新建测试** `electron/native-pipeline/character-consistency/__tests__/consistency-artifacts.test.ts`
  - 写到 `mkdtempSync` 目录；断言四个文件都存在，且 CSV 表头/行数与 `findings` 匹配。

**验收：** 文件写出；内容断言通过。

---

## 任务 7 — CLI handler
**目标：** 接线 选项 → runner → 产物 → `CLIResult`。
**约 45 分钟**

- **新建** `electron/native-pipeline/cli/cli-handlers-character-consistency.ts`
  - `export async function handleAnalyzeConsistency(options, onProgress, executor, signal): Promise<CLIResult>` —— 校验 `≥1 个 --ref` + `--input`，用 `ModelRegistry.has` 校验模型，调用 `runConsistencyCheck`、`writeConsistencyArtifacts`，返回 `{ success, outputPath: reportPath, data, duration }`。结构参照 [cli/cli-handlers-media.ts:90](../../../electron/native-pipeline/cli/cli-handlers-media.ts)（`handleAnalyzeVideo`）。
- **新建测试** `electron/native-pipeline/cli/__tests__/cli-handlers-character-consistency.test.ts`
  - 参照 [cli-handlers-media-review.test.ts](../../../electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts)：注册测试模型、stub executor、mock frame-extractor、跑 handler、断言产物文件 + `CLIResult.outputPath`。同时断言缺少 `--ref` 的报错路径。

**验收：** handler 测试通过（含校验报错）。

---

## 任务 8 — 命令注册与分发
**目标：** 让 `qcut analyze consistency` 可运行。
**约 30 分钟**

- **修改** `electron/native-pipeline/cli/command-registry.ts`
  - 往 `CORE_COMMANDS` 加 `"analyze-consistency"`（参照 [577 行](../../../electron/native-pipeline/cli/command-registry.ts) 的 `analyze-video`），flags 取自方案文档里的选项表；加到 `analysis` 分类。
- **修改** `electron/native-pipeline/cli/cli-runner/handler-map.ts`
  - 导入 handler，在 `HANDLER_MAP` 里加 `"analyze-consistency": handleAnalyzeConsistency`（[172 行](../../../electron/native-pipeline/cli/cli-runner/handler-map.ts) 附近）。
- **修改** CLI 选项类型（`CLIRunOptions`），若未覆盖则补 `refs?: string[]`、`language?`、`fps?`、`sceneDetect?`、`batchSize?`、`minSeverity?`，并确保 `--ref` 解析为可重复的 `string[]`。
- **新建/扩展测试** `electron/native-pipeline/cli/__tests__/command-registry.test.ts`（若已存在）—— 断言命令 + flags 已注册，且 `--ref` 为 `string[]`。

**验收：** `qcut analyze consistency --help` 列出 flags；arg-parse 测试通过。

---

## 任务 9 — 文档与手动验证
**目标：** 写清用法并端到端冒烟。
**约 30 分钟**

- **更新** 本文件夹文档，补一段最终"用法"片段及实现中发现的偏差。
- **可选：** 若 `docs/` 下有 native-pipeline CLI 参考文档，补一小节。
- **手动冒烟**（非 CI）：对一段「故意缩放过角色」的真实短片运行；确认坏的帧范围被报出、带帧号 + `proportion/height`，干净片段得到 `findings: []`。

**验收：** 文档更新；手动冒烟符合预期。

---

## 提交前检查清单
- [ ] `bun run test` —— 所有新单测通过
- [ ] `bun check-types` —— 无错
- [ ] `bun lint:clean` —— 无错（先跑 `npx @biomejs/biome format --write`）
- [ ] 没有文件超过 800 行（超了就拆 —— CLAUDE.md 规则）
- [ ] 未违反渲染进程边界规则（本功能全在 Electron 主进程 / native-pipeline，故不适用，但 pre-commit 仍会跑 `bun scripts/check-boundaries.ts`）

## 文件汇总（新增 vs 修改）
**新增**
- `electron/native-pipeline/character-consistency/types.ts`
- `electron/native-pipeline/character-consistency/frame-extractor.ts`
- `electron/native-pipeline/character-consistency/consistency-prompts.ts`
- `electron/native-pipeline/character-consistency/consistency-normalize.ts`
- `electron/native-pipeline/character-consistency/consistency-runner.ts`
- `electron/native-pipeline/character-consistency/consistency-artifacts.ts`
- `electron/native-pipeline/cli/cli-handlers-character-consistency.ts`
- `electron/native-pipeline/character-consistency/__tests__/*.test.ts`（5 个文件）
- `electron/native-pipeline/cli/__tests__/cli-handlers-character-consistency.test.ts`
- `electron/native-pipeline/execution/__tests__/multi-image-understanding.test.ts`

**修改**
- `electron/native-pipeline/execution/step-executors.ts`（+ step 输入类型）
- `electron/native-pipeline/cli/command-registry.ts`
- `electron/native-pipeline/cli/cli-runner/handler-map.ts`
- `CLIRunOptions` 类型（`cli/` 下定义处）
