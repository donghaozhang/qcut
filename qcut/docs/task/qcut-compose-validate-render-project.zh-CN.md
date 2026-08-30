# QCut Compose / Validate / Render / Project 架构记录

> 日期：2026-08-30
>
> 范围：最近 Smart Speech、Smart Packaging、CLI timeline apply、Media Lab / video enhancement 相关改动
>
> 目标：把“滤镜、转场、音效、贴纸、字幕、文本包装一起使用”抽象成更高层的 QCut Compose 协议，而不是继续把逻辑堆在某个单点功能里。

## 当前结论

QCut 现在已经有三套相似但还没统一的机制：

1. **Smart Packaging 协议雏形**：已有 `SmartPackagingSnapshot`、`SmartPackagingCloudJob`、`SmartPackagingTimelinePatch`，能表达云端/本地 heuristic 返回的字幕、文本、贴纸、音效、转场、缩放 patch。
2. **CLI timeline manifest apply**：`editor:timeline:apply` 已经能把声明式 manifest 应用到真实编辑器，包含 media import、track/element/transition 创建、atomic rollback 和 read-back verify。
3. **Render composition**：预览/导出侧已经有 timeline layer composition、FFmpeg filter graph、text/sticker/effect/audio source extraction。它解决的是“怎么渲染”，不是“怎么生成一组编辑决策”。

因此下一层应叫 **QCut Compose**，职责是：

`project/timeline snapshot -> compose intent -> validate -> cloud/local job -> timeline patch -> apply -> render/export verify -> project persistence`

它不能只服务“智能包装”，也不能只输出剪映式素材 ID。它应该是 QCut 自己的 provider-neutral 协议。

## 最近已提交改动

### Smart Speech 到字幕实验室

最近提交把智能口播/字幕能力接到 Caption Lab：

- 云端调用通过 QCut proxy，不再把模型细节散在前端。
- OpenRouter 作为 filler / analysis 的优先 fallback。
- WordTimeline 能把识别结果转成 QCut caption preset。
- 重叠字幕做了保护。
- 中文 token UI 做了短语级显示合并，底层 word timing 仍保留。

这证明字幕链条的正确边界是：

`ASR/word timing -> display grouping -> caption preset/style -> timeline element`

其中 `display grouping` 是 UI/交互层优化，不应该破坏底层逐词时间。

### 剪映智能包装研究

剪映“智能包装”研究已经记录到 `docs/task/jianying-subtitle-reference/smart-packaging-cloud-flow.zh-CN.md`。关键学习是：

- 剪映智能包装不是单个滤镜或模板，而是多个字幕、花字、贴纸、音效、转场、运镜的编排流程。
- 用户触发后会读取当前草稿、字幕和素材上下文，生成任务，再把结果写回草稿。
- UI 上看是一个入口，底层更接近“云端/本地 job 返回 timeline patch”。
- QCut 应学习流程和协议形态，不复制剪映私有接口、素材 ID 或缓存结构。

### Smart Packaging 协议基础

已提交的 `SmartPackagingTimelinePatch` 是 ComposePatch 的第一版原型。它已经包含：

- snapshot fingerprint，避免过期 patch 应用到错误 timeline。
- cloud job lifecycle。
- provider 字段，可接 QCut 云端、OpenRouter、FAL 或本地 heuristic。
- patch operation id，用于幂等合并。
- `add-caption`、`add-text-overlay`、`add-sticker`、`add-sound-effect`、`update-media-zoom`、`upsert-transition` 等操作。

不足是命名还绑定 `SmartPackaging`。下一步应把它提升到通用 `ComposeSnapshot / ComposeJob / ComposePatch`，再让 Smart Packaging 成为 `ComposeIntent.kind = "smart-packaging"`。

## 当前未提交改动的架构信号

当前工作区还有未提交的 Media Lab / video enhancement / color label 改动。它们不能当作已经合并事实，但从代码形态看，方向和 Compose 高度相关：

- `MediaEnhancements` 增加实验性 `labDeflicker`、`labOpticalFlowMotionBlur`、`labEyeCorrection`、`labLocalSuperResolution`。
- `video-enhancement-filter` 把 Media Lab 参数转成 FFmpeg 本地 filter。
- `frame-interpolation-filter` 用 cloned lookahead 解决 `minterpolate` 尾帧丢失。
- `media-lab-eye-correction` 把眼部修正映射到本地 portrait adjustment，而不是宣称实现真实 gaze redirection。
- `editor-timeline-apply` 开始把 `colorLabel` 纳入 read-back verify。

这些信号说明：Compose 不能只处理“加几个素材”。它必须能描述并验证素材级处理、派生媒体、可编辑关键帧和渲染能力。

## CLI 侧已有能力

CLI 目前缺少 `compose` 命令族，但已有可复用骨架：

- `electron/native-pipeline/cli/command-groups.ts`：支持 `qcut <group> <action>` 的分组命令。
- `electron/native-pipeline/cli/command-registry.ts`：集中声明命令、flags、examples。
- `electron/native-pipeline/cli/cli-runner/handler-map.ts`：非 editor 命令 handler map。
- `electron/native-pipeline/editor/editor-handlers-timeline.ts`：`editor:timeline:*` dispatch。
- `electron/native-pipeline/editor/editor-timeline-apply.ts`：声明式 timeline manifest apply backend。
- `electron/native-pipeline/editorial/edit-plan.ts`：`edit plan` 已经会从分析 index 和口播脚本生成 EDL + `timeline.json`。

现有链条已经接近：

`qcut analyze index -> qcut edit plan -> qcut editor timeline apply -> qcut editor export start`

它的问题是：`edit plan` 输出的是特定 editorial manifest，不是通用 ComposePatch；`timeline apply` 接受的是最终 timeline manifest，不保留 provider、job、reason、asset provenance、snapshot fingerprint。

## 建议的命令族

第一版 CLI 可以这样设计：

```text
qcut compose snapshot --project-id <id> --output snapshot.json
qcut compose plan --snapshot @snapshot.json --intent @intent.json --provider qcut --output patch.json
qcut compose validate --snapshot @snapshot.json --patch @patch.json --json
qcut compose apply --project-id <id> --patch @patch.json --atomic --verify --json
qcut compose render --project-id <id> --patch @patch.json --verify-frames 0,3,6 --json
qcut compose project --project-id <id> --include compose-jobs,patches --json
```

实现上不要一开始引入全新 transport。`compose apply` 可以先把 ComposePatch 转成现有 timeline manifest 或直接调用现有 editor timeline endpoints；等协议稳定后再做专用 `/api/compose/*`。

## Compose Validate 应覆盖什么

`compose validate` 是关键，不是可选项。至少要检查：

- snapshot fingerprint 是否匹配当前项目。
- patch operation id 是否重复，是否可幂等重放。
- track type 和 element type 是否兼容。
- caption/text/sticker/sound/filter/transition 时间范围是否合法。
- transition 的 from/to 是否相邻、是否在同一媒体 track。
- sticker、font、text-template、sound-effect、filter、transition asset 是否存在、可缓存、可商用。
- 本地功能是否需要本地 runtime、模型、FFmpeg filter、Jianying bridge 或云端 provider。
- preview 和 export 是否都支持该组合。
- 多个操作一起用时是否会互相覆盖，例如同一元素的 zoom/filter/enhancement/keyframes。
- 离线、取消、重试、缓存命中和派生媒体复用是否有明确状态。

## 建议实现顺序

1. 新建 `packages/editor-core/src/compose/`，定义通用 `ComposeSnapshot`、`ComposeIntent`、`ComposeJob`、`ComposePatch`、`ComposeValidationIssue`、`ComposeProjectRecord`。
2. 把当前 `SmartPackagingTimelinePatch` 映射到通用 `ComposePatch`，保留兼容导出。
3. 增加纯函数 validator，先覆盖字幕、文本、贴纸、音效、转场、zoom、filter、media enhancement。
4. 在 CLI registry 增加 `compose` group 和 `compose:*` 命令定义。
5. `compose snapshot` 从现有 project/timeline/media endpoints 构建 snapshot。
6. `compose apply` 先复用 `editor:timeline:apply` 的 transaction/read-back verification。
7. `compose render` 调现有 export/render path，补 frame/media probe evidence。
8. 再接 OpenRouter、FAL、QCut 云端模型做素材匹配和包装建议。

## 不应该做的事

- 不要让 Smart Packaging 吸收所有滤镜、转场、音效、贴纸能力。
- 不要让 CLI `edit plan` 继续扩成万能入口。
- 不要复制剪映私有云接口、素材 ID 或缓存协议。
- 不要把 render composition 和 AI compose protocol 混成一个概念。
- 不要只做 UI 开关；必须能被 snapshot、validate、apply、render、project persistence 证明。

## 最小可交付

下一步最小 PR 可以只做协议和 CLI 空壳，不接真实云端：

- `packages/editor-core/src/compose/*`：类型、fingerprint、validation、patch merge。
- `electron/native-pipeline/cli/command-registry-compose.ts`：`compose:*` 命令定义。
- `electron/native-pipeline/cli/cli-handlers-compose.ts`：`snapshot/validate/apply` 的最小 handler。
- tests：validator、patch merge、CLI parse/help、apply conversion。

这会让后续接 QCut 云端、OpenRouter、FAL 时有稳定落点，也能避免每个智能功能各自发明一套“snapshot/job/patch/apply”。
