# QCut 可编辑 Compose 工程实施任务书

日期：2026-08-31  
状态：Phase A–C 完成（滤镜栈真实桌面门禁通过），Phase D 未开始  
依赖：PR #441 `feat: complete Compose resource labs` 及其性能/CI 收尾  
建议执行者：Claude（完成当前 Compose Export Performance Hardening 后开始）

## 1. 一句话目标

让一份 QCut Compose 配方既能走现有无头渲染，也能创建并重新打开一个真正可编辑的 QCut 工程：多个视频按顺序进入主轨道，每个片段保留独立滤镜栈，片段之间保留转场，贴纸和音效以独立轨道存在，用户之后可以在 QCut UI 中继续修改、保存和导出。

这不是“先把所有效果烤进一个 MP4 再导入编辑器”。验收对象是可编辑时间线和最终导出，两者都必须成立。

## 2. 当前事实基线

开始编码前必须重新确认本节；如果代码已经变化，先更新本文档再实现。

### 2.1 已经存在且应复用

- `qcut compose validate --config ...`：校验 `ComposeManifest v1`。
- `qcut compose render --config ...`：无头合成多个 clips、Filter Lab、crossfade、sticker 和 sound effect。
- `qcut compose project --config ...`：复制用户媒体并生成可重渲染的 portable bundle。
- `qcut compose snapshot/plan/validate/apply/render` 的 snapshot + patch 编辑器路径。
- `ComposePatch` 的 fingerprint、operation id、幂等 merge 和结构化 validation issue。
- `timelineManifestFromComposePatch` 到 `editor timeline apply` 的转换。
- `editor-timeline-apply.ts` 的原子 apply、rollback 和 read-back verification。
- Sticker Lab 真实素材导入、Sound Effects Lab 物化、Transition Lab 与 Jianying-local transition 解析。
- 重叠贴纸和音效通过 lane partition 分配到平行轨道。
- `MediaElement.color`、`AdjustmentElement.color`、Filter Lab LUT、dual LUT、multi-pass/native-local 数据模型。
- QCut editor project create/open、media import、timeline batch apply 和 export API。

### 2.2 现在没有的能力

当前 `ComposePatchOperation` 只能表达：

- `add-caption`
- `add-text-overlay`
- `add-sticker`
- `add-sound-effect`
- `update-media-zoom`
- `upsert-transition`

它不能表达：

- 导入并插入多个主视频/图片片段。
- 对新插入片段设置 trim、顺序、播放速度、音量和 fit mode。
- 把一个或多个 Filter Lab 效果作为可编辑状态绑定到指定片段。
- 从 `ComposeManifest v1` 直接编译出 editor patch。
- 从配方创建一个新的真实 QCut project，并在失败时完整清理。

当前 portable `compose project` 的 `project.json` 明确包含：

```json
{
  "kind": "qcut-compose-v1",
  "editorTimelineImportSupported": false
}
```

因此它是“可重渲染配方包”，不是“QCut 可编辑草稿”。不能把现状描述成已经支持可编辑工程。

### 2.3 Filter Lab 的现有语义

- 普通 Filter Library 会写入选中 `MediaElement.color.filter`。
- 当前 Filter Lab UI 默认通过 `useAdjustmentLut` 创建或更新 `AdjustmentElement.color`。
- `ComposeManifest v1.clips[].filters[]` 是逐片段、有顺序的 Filter Lab 列表。
- 无头 renderer 已经能解析 Filter Lab backend，但 editor patch 尚未保存这套逐片段语义。

新实现必须明确区分：

1. `clip` scope：滤镜只作用于一个源片段，转场重叠时仍不能污染另一个片段。
2. `timeline-range` scope：滤镜作为调节层作用于该时间范围内所有下方画面。

不能用一个跨片段的 adjustment layer 假装完成逐片段滤镜，否则转场区间会产生错误的合成语义。

## 3. 产品契约

### 3.1 保持现有命令兼容

以下命令的默认行为不能改变：

```bash
qcut compose validate --config edit.qcut-compose.json --json
qcut compose render --config edit.qcut-compose.json --output final.mp4 --json
qcut compose project --config edit.qcut-compose.json \
  --project-dir ./portable-compose --json
```

未指定新 target 时，`compose project` 仍生成 `qcut-compose-v1` portable bundle。

### 3.2 新增 editor project 模式

建议命令契约：

```bash
qcut compose validate \
  --config edit.qcut-compose.json \
  --target editor \
  --json

qcut compose project \
  --config edit.qcut-compose.json \
  --target editor \
  --name "Compose Demo" \
  --open \
  --verify \
  --json
```

可选能力：

```bash
qcut compose project \
  --config edit.qcut-compose.json \
  --target editor \
  --project-id existing-project-id \
  --verify \
  --json
```

参数规则：

- `--target editor` 要求运行中的 QCut Desktop。
- `--name` 用于创建新项目；`--project-id` 用于写入已有项目，两者互斥。
- `--project-dir` 只属于 portable bundle 模式，与 `--target editor` 冲突。
- `--open` 创建后打开项目并等待 ready。
- `--verify` 做 apply read-back、保存/重开 read-back 和可选导出验证。
- 所有冲突必须返回结构化错误，不能静默忽略参数。

### 3.3 统一入口，但保留两种 compiler

```text
ComposeManifest
  -> parse + normalize + resolve + lock
  -> Canonical Compose Plan
       -> Headless compiler -> MP4
       -> Editor compiler   -> ComposePatch -> QCut timeline/project
```

不要让 editor compiler 调用 headless renderer 先烤片，也不要让 headless compiler 依赖正在运行的编辑器。

## 4. 协议设计

### 4.1 升级原则

- 保留 `COMPOSE_PROTOCOL_VERSION = 1` 的读取兼容。
- 新 operation 需要 bump 到 version 2，或为 v1 parser 增加严格向后兼容的 discriminated union；二选一后必须写 migration tests。
- `electron/native-pipeline/compose/compose-protocol.ts` 与 `packages/editor-core/src/compose/compose-types.ts` 必须继续镜像，并由 mirror test 锁定。
- operation id 同时是创建元素的确定性 identity，幂等 replay 不能生成重复元素。

### 4.2 新增 media asset 类型

`ComposeAssetType` 增加 `media`，并用 provenance 记录：

- 原始路径或 provider identity。
- 文件 sha256、size、duration、video/audio stream 信息。
- 是否复制到 QCut project 私有目录。
- 是否为生成素材。
- license/availability/capabilities。

绝不能把 secret、signed URL query 或可恢复 token 写进 project。

### 4.3 新增插入片段 operation

建议类型：

```ts
interface ComposeInsertMediaClipOperation extends ComposeBasePatchOperation {
  kind: "insert-media-clip";
  asset: ComposeAssetReference;
  mediaKind: "video" | "image";
  trackRole: "main-video" | "overlay-video";
  trackId?: string;
  trimStart: number;
  trimEnd: number;
  sourceDuration: number;
  volume?: number;
  playbackRate?: number;
  fitMode?: "contain" | "cover" | "fill";
}
```

约束：

- `operation.id` 确定性映射为目标 timeline element id。
- 同一 `main-video` 轨道的片段不可非法重叠。
- `startTime` 是 timeline 时间；`sourceDuration - trimStart - trimEnd` 经 playback rate 换算后必须等于 timeline duration。
- 图片必须有明确 duration。
- 媒体导入和时间线创建必须在同一个补偿事务内。

### 4.4 新增逐片段滤镜栈 operation

建议不要只增加一个字符串 `filterId`。需要保留顺序、版本、强度和 backend identity：

```ts
interface ComposeFilterStep {
  id: string;
  asset: ComposeAssetReference;
  intensity: number;
  enabled: boolean;
}

interface ComposeSetMediaFilterStackOperation
  extends ComposeBasePatchOperation {
  kind: "set-media-filter-stack";
  trackId: string;
  elementId: string;
  filters: ComposeFilterStep[];
}
```

`elementId` 可以引用：

- snapshot 中已经存在的 media element。
- 同一个 patch 内 `insert-media-clip` 的 operation id。

validator 应先建立“现有 + 待创建”symbol table，再检查引用，不能依赖 JSON 中 operation 的偶然顺序。

### 4.5 新增调节层滤镜 operation

为了保留 Filter Lab UI 的调节层语义，再提供：

```ts
interface ComposeAddFilterLayerOperation extends ComposeBasePatchOperation {
  kind: "add-filter-layer";
  trackRole: "adjustment";
  filters: ComposeFilterStep[];
  name?: string;
}
```

它作用于 timeline range 内的下方画面。不要把它用于从 `clips[].filters` 编译出来的逐片段滤镜，除非配方显式要求 `timeline-range`。

### 4.6 编辑器内部滤镜栈

一个片段可能包含 2 到 16 个有序 Filter Lab cards。现有单一 `MediaColorSettings.lut/multiPass` 不足以无损表达混合 backend 的有序栈。

建议新增聚焦的数据结构：

```ts
interface MediaFilterEffect {
  id: string;
  enabled: boolean;
  resourceId: string;
  version: string;
  intensity: number;
  implementation: string;
  fidelity: "lut" | "structural" | "native-local" | "safe-passthrough";
  color: Pick<MediaColorSettings, "lut" | "multiPass">;
}

interface MediaFilterStack {
  enabled: boolean;
  effects: MediaFilterEffect[];
}
```

将 `filterStack?: MediaFilterStack` 放在 `MediaElement`，不要把数组塞进无类型的 `Record<string, unknown>`。

要求：

- UI、preview、export 和 project persistence 共享这一结构。
- effects 顺序就是渲染顺序。
- 一个 effect 的 intensity 修改不应重建整个媒体元素。
- 普通 Filter Library 的现有 `color.filter` 保持兼容。
- Filter Lab 单效果也通过 stack 表达，避免单效果和多效果两条分叉路径。
- 旧工程没有 `filterStack` 时行为完全不变。

如果实测证明现有 color compositor 无法安全串联 native-local 与 FFmpeg effects，应返回 `unsupported-filter-stack`，而不是偷偷预烤或调整顺序。

## 5. Manifest 到 Patch 编译器

新增单一职责模块：

```text
electron/native-pipeline/compose/compose-manifest-to-patch.ts
```

输入：

- 已解析并 resolve/lock 的 `ResolvedComposeProject`。
- 新项目或现有项目的 `ComposeSnapshot`。

输出：

- 确定性 `ComposePatch`。
- 编译 warning。
- manifest clip id 到 timeline element id 的映射。

编译规则：

1. 按 `clips[]` 顺序计算每个 clip 的 timeline start。
2. 减去相邻 transition overlap，保证 headless 和 editor 总时长一致。
3. 每个 clip 生成一个 `insert-media-clip`。
4. 每个非空 `clip.filters` 生成一个 `set-media-filter-stack`。
5. 每个 transition 将 manifest clip id 映射为确定性 element id，再生成 `upsert-transition`。
6. sticker 生成 `add-sticker`，保留 transform、opacity 和 fade/animation。
7. sound effect 生成 `add-sound-effect`，保留 trim、volume、fade 和 playback rate。
8. 同一输入、同一 lock、同一 snapshot 必须生成相同 operation ids 和相同语义 patch。

不能直接使用随机 UUID 作为 operation id。建议从下列内容 hash：

```text
manifestSha256 + operation kind + stable manifest path + target project id
```

## 6. Filter Lab editor resolver

新增聚焦模块：

```text
electron/native-pipeline/compose/compose-filter-stack-resolver.ts
```

职责：

- 对每个 filter step 调用现有 Filter Lab catalog/package/render-plan 解析。
- 锁定 resource id、version、package hash、implementation、backend 和 fidelity。
- 把 LUT、dual LUT、multi-pass/native-local 结果转换为 editor 的 `MediaFilterEffect`。
- 同一个 resource/version/intensity 在一次任务中只解析一次。
- 有界并发，默认最多 4；不得把 native runtime 初始化并发到不安全状态。
- QCut 私有快照存在时优先使用私有快照；不直接依赖 UI 当前是否打开剪映。
- 不把剪映 app binary、framework、模型或滤镜二进制提交进 Git。

错误分类至少包括：

- `filter-not-catalogued`
- `filter-package-missing`
- `filter-version-changed`
- `filter-runtime-unavailable`
- `filter-stack-backend-conflict`
- `filter-preview-unsupported`
- `filter-export-unsupported`

`safe-passthrough` 必须作为 warning 出现在 CLI 结果和 project record，不能被报告成真实滤镜已应用。

## 7. Editor timeline manifest 扩展

扩展 `timelineManifestFromComposePatch`：

- `insert-media-clip` 生成 `manifest.media[]` 和 main video track element。
- 同一主轨顺序写入，轨道 identity 稳定。
- `set-media-filter-stack` 生成对目标 media element 的 update。
- `add-filter-layer` 创建 adjustment track/element。
- transition 可引用同一 manifest 中刚创建的 clip element。
- 原有 caption/text/sticker/audio lane 行为保持不变。

不要继续让 `compose-timeline-manifest.ts` 无限增长。建议提取：

```text
compose-timeline-media.ts
compose-timeline-overlays.ts
compose-timeline-transitions.ts
compose-timeline-manifest.ts      # 只负责编排
```

单文件接近 500 行或承担两种以上主要职责时必须拆分。

## 8. Editor bridge 与 read-back

### 8.1 Apply 所需字段

timeline batch bridge 必须能创建/更新并持久化：

- media id
- start/duration/trimStart/trimEnd
- playbackRate、volume、fitMode
- color/filterStack
- adjustment color/filter stack
- sticker runtime、geometry、animations
- audio trim、fade、rate
- transition engine、package hash、tuning

### 8.2 Read-back verification

现有 `MEDIA_VERIFY_KEYS` 尚不足以证明滤镜落盘。应验证：

- `color`
- `filterStack`
- `trimStart`
- `trimEnd`
- `mediaId`
- `startTime`
- `duration/timelineDuration`

adjustment element 需要独立 verify keys，不能误用 text/media key 集合。

比较规则：

- number 使用已有 tolerance。
- LUT cube/large pass payload 使用 canonical digest，避免日志输出巨型数组。
- effect order 必须逐项一致。
- native resource identity 必须核对 resource id + version + package hash。

## 9. 真正的 QCut project 创建事务

新增 orchestrator：

```text
electron/native-pipeline/compose/compose-editor-project.ts
```

建议流程：

```text
validate config for editor
  -> create/open project
  -> wait ready
  -> capture empty/current snapshot
  -> resolve and lock all assets
  -> compile manifest to patch
  -> prepare imports/resources
  -> atomic timeline apply
  -> read-back verify
  -> save project
  -> close/reopen when --verify
  -> capture second snapshot and verify
  -> optional export and evidence
```

### 9.1 补偿事务

时间线 rollback 不能覆盖 project/media side effects。需要 transaction journal：

```ts
interface ComposeEditorTransactionJournal {
  createdProjectId?: string;
  importedMediaIds: string[];
  materializedPaths: string[];
  preApplySnapshotId?: string;
  appliedOperationIds: string[];
}
```

失败清理顺序：

1. timeline apply 自己 rollback。
2. 删除本轮导入且未被其他元素引用的媒体。
3. 删除 scratch materialization。
4. 如果本轮创建的是新项目，删除新项目。
5. 如果写入已有项目，恢复 pre-apply timeline 并保留项目本身。

清理失败必须返回原始错误与 cleanup error，不能覆盖根因。

### 9.2 幂等 replay

- 同一个 patch 再次 apply，不产生重复 media、tracks、elements 或 transitions。
- 如果 media 已导入，以 sha256 + source identity 复用。
- `mode = duplicate` 才允许创建第二套元素，并需派生新的 identity namespace。
- 重开项目后 replay 仍应识别已经应用的 operation ids。

## 10. Portable 与离线语义

明确区分两个输出：

### 10.1 Portable compose bundle

- 现有 `qcut-compose-v1`。
- 包含用户媒体、manifest、lock 和 render command。
- 可在有兼容 Filter Lab runtime/cache 的机器重渲染。
- 不是 editor timeline。

### 10.2 Editable QCut project

- QCut project store 中有真实 media、tracks、elements、transitions 和 effects。
- 用户可在 UI 中移动片段、改滤镜强度、替换转场、删贴纸、改音效。
- `project record` 保存 manifest hash、patch id、operation mapping 和 asset provenance。
- 关闭 QCut 再打开仍保持相同时间线。

### 10.3 严格离线

增加 `--strict-offline` 时：

- 所有用户媒体、贴纸和音效必须在 QCut-owned path 或 project bundle 中。
- 所有 Filter/Transition runtime 必须通过 QCut 私有快照 doctor。
- 任何 `downloadable/reference-only` asset 都直接失败。
- 禁止运行时回落到剪映 app 安装目录而不报告。

由于许可和体积限制，剪映 Framework/模型/效果包仍不能提交 Git。项目只保存 identity/digest；本机私有快照由独立缓存流程管理。

## 11. Preview 与 Export

### 11.1 共享渲染顺序

每个 media clip 的像素管线顺序必须由一个共享函数定义，preview 和 export 都调用它。建议顺序：

```text
decode
-> source trim/speed
-> crop/transform
-> built-in color/filter
-> ordered Filter Lab stack
-> clip masks/enhancements
-> transition composition
-> timeline adjustment layers
-> stickers/text/captions
-> audio mix
-> output color management
```

如果现有 renderer 的真实顺序不同，以当前已验证的 preview/export parity 为准，但必须记录并由测试锁定；不要在两个 renderer 中各写一套顺序。

### 11.2 Native-local 生命周期

- 同一导出 job 复用 runtime/context，不要每帧初始化。
- 同一个 effect 跨连续帧保留必要的时序状态。
- 素材切换时执行明确 reset。
- 不在线程间搬运不允许跨线程的 GL/native context。
- crash 或 timeout 返回具体 effect id 和 frame/timestamp。

### 11.3 不允许的“成功”

以下任何一个单独发生，都不算完成：

- CLI 返回 `success: true`，但 timeline 没有真实元素。
- timeline 有元素，但 reopen 后丢失。
- preview 有效果，但 export 没效果。
- export 有 MP4，但滤镜是 passthrough。
- 贴纸/音效文件已下载，但没有出现在 timeline。
- transition 被选择，但 read-back engine/preset 不一致。

## 12. Validation 规则

除现有规则外，增加：

- clip id 唯一且映射 element id 唯一。
- source file 存在、不是目录、不是危险 symlink，sha256 可读。
- trim 范围在 source duration 内。
- timeline duration 与 trim/rate 一致。
- main-video 片段顺序和 transition 邻接一致。
- transition duration 不超过任一相邻片段可用 handle。
- filter intensity 为 0..100，filter stack 为 1..16。
- 每个 filter 具备 editor preview + editor export capability。
- patch 内 pending element references 可解析。
- timeline-range adjustment 不越出 project duration。
- sticker/audio 不越出 project duration，除非显式 truncate policy。
- 音效 fade 总长不超过实际 timeline duration。
- 目标 project fingerprint 过期时拒绝 apply。
- 同一目标有冲突 update 时返回明确 issue，而不是 last-write-wins。

所有 issue 必须含：

- severity
- stable code
- JSON path
- message
- operation id（如适用）
- fix hint（如能确定）

## 13. CLI JSON 结果

成功时至少返回：

```json
{
  "success": true,
  "data": {
    "target": "editor",
    "projectId": "...",
    "projectName": "...",
    "snapshotId": "...",
    "patchId": "...",
    "manifestSha256": "...",
    "importedMediaIds": [],
    "createdTrackIds": [],
    "createdElementIds": [],
    "createdTransitionIds": [],
    "appliedOperationIds": [],
    "alreadyAppliedOperationIds": [],
    "filterEvidence": [],
    "warnings": [],
    "reopenVerified": true,
    "exportVerification": null
  }
}
```

不要在 JSON 中输出完整 LUT cube、二进制 payload 或 secret URL。

## 14. 测试矩阵

### 14.1 Unit tests

- v1/v2 protocol parse/migration。
- operation count/merge 对新 kind 的穷尽覆盖。
- manifest clip timing 编译，包括 transition overlap。
- stable operation ids。
- pending element symbol table。
- trim/rate/duration validation。
- filter stack order、version lock、unsupported backend。
- timeline manifest media/adjustment/update 生成。
- read-back canonical digest。
- transaction cleanup 顺序与双错误报告。
- CLI flag conflict 和 backwards compatibility。

### 14.2 Integration tests

- 两个本地视频导入同一 main track。
- 一个图片 clip 带 duration。
- per-clip Filter Lab stack 写入 `MediaElement.filterStack`。
- timeline-range Filter Lab 写入 adjustment layer。
- transition 引用本 patch 新建的元素。
- Sticker Lab 动态贴纸和 Sound Effects Lab 音效 materialization。
- apply 失败后媒体库无孤儿资源。
- idempotent replay。
- close/reopen 后 operation ids 与 filter stack 仍在。

### 14.3 真实桌面 E2E

必须使用真实 QCut Desktop 和真实本机实验室资源，不以 store injection、fixture-only 或 unit mock 代替。

测试配方至少包含：

- 3 个真实视频片段，来源与视觉内容不同。
- 每个片段 5 到 10 秒，总时长控制在 30 秒左右用于功能门禁。
- clip A：1 个可验证单 LUT。
- clip B：2 个有序 filters，至少一个 multi-pass 或 native-local。
- clip C：1 个不同类别 filter。
- A/B、B/C 两个不同 transition，其中至少一个来自 Transition Lab/Jianying-local。
- 2 个同时出现的贴纸，其中至少一个为动画素材。
- 3 个音效，覆盖 trim、fade、volume、playbackRate 和重叠 lane。
- 至少一个 caption/text operation，防止旧 Compose 功能回归。

真实执行：

1. `compose validate --target editor`。
2. `compose project --target editor --open --verify`。
3. 截图完整 timeline，能看到 3 clips、transitions、stickers、audio tracks 和滤镜状态。
4. 保存并关闭项目。
5. 重新打开项目并再次截图。
6. 通过 CLI snapshot 读取时间线，核对 operation mapping。
7. 导出 MP4。
8. `ffprobe` 验证 duration、fps、分辨率、video/audio streams。
9. 在每个 clip 中段、两个 transition 中点、贴纸出现时刻提取无损帧。
10. 验证音效真实存在，可用音频分段能量或 spectrogram 证明，不只检查 audio stream。
11. 对相同 patch replay，证明元素数量不变。
12. 制造一个缺失 filter/sound asset，证明 rollback 后项目和媒体库恢复。

### 14.4 Headless 与 editor 对照

同一 manifest 分别走：

- headless render
- editable project export

对每个验证 timestamp 输出：

- PNG frames
- pixel dimensions
- non-blank check
- SSIM/PSNR 或 MAE
- 差异热图
- backend/fidelity 说明

不同 backend 不要求虚假的逐像素一致，但必须定义门限并解释差异来源。相同 FFmpeg/LUT 路径应采用更严格门限。

### 14.5 性能门禁

- 功能门禁用 30 秒配方，避免每次 CI/E2E 都跑 80 秒重任务。
- 另保留 80 秒、1080p benchmark，与 PR #441 当前 baseline 可比较。
- editor project export 相对同一 timeline 的直接 editor export 不得无解释下降超过 10%。
- 每帧不得重复解析 filter package 或重复初始化 native runtime。
- 记录总耗时及 parse/resolve/import/apply/save/reopen/export/verify 各阶段耗时。
- 记录 peak RSS、renderer CPU、输出 fps 和 realtime factor。

## 15. 证据目录

真实运行统一写入：

```text
docs/task/qcut-compose-editable-project/evidence/<date>/
  commands.log
  environment.json
  compose-config.json
  compose-lock.json
  snapshot-before.json
  patch.json
  apply-result.json
  snapshot-after.json
  snapshot-reopened.json
  export-result.json
  ffprobe.json
  timing.json
  frame-comparison.json
  screenshots/
  frames/
  diffs/
  README.zh-CN.md
```

大视频不要提交 Git。README 记录本机绝对路径、sha256、大小和复现命令；小型 JSON/PNG 证据可按仓库政策选择性提交。

## 16. 文件级实施地图

预计修改或新增：

```text
packages/editor-core/src/compose/compose-types.ts
packages/editor-core/src/compose/compose-validation.ts
packages/editor-core/src/compose/compose-patch-merge.ts
packages/editor-core/src/types/timeline.ts
packages/editor-core/src/types/color.ts

electron/native-pipeline/compose/compose-protocol.ts
electron/native-pipeline/compose/compose-manifest-to-patch.ts
electron/native-pipeline/compose/compose-filter-stack-resolver.ts
electron/native-pipeline/compose/compose-editor-project.ts
electron/native-pipeline/compose/compose-editor-transaction.ts
electron/native-pipeline/compose/compose-timeline-media.ts
electron/native-pipeline/compose/compose-timeline-overlays.ts
electron/native-pipeline/compose/compose-timeline-transitions.ts
electron/native-pipeline/compose/compose-timeline-manifest.ts
electron/native-pipeline/compose/compose-editor-asset-preparer.ts

electron/native-pipeline/cli/command-registry.ts
electron/native-pipeline/cli/command-groups.ts
electron/native-pipeline/cli/cli-handlers-compose.ts
electron/native-pipeline/cli/cli-handlers-compose-editor.ts

electron/native-pipeline/editor/editor-timeline-apply.ts
electron/native-pipeline/editor/editor-api-client.ts

apps/web/src/lib/claude-bridge/claude-timeline-bridge-batch.ts
apps/web/src/lib/claude-bridge/claude-timeline-bridge-elements.ts
apps/web/src/components/editor/preview-panel/*
apps/web/src/lib/export/*
```

这不是必须一次全部修改的清单。先通过 `rg` 确认现有责任边界；能复用的模块不要复制。新增文件保持单一职责，避免继续扩大 500 行以上的多职责文件。

## 17. 分阶段交付

### Phase A：协议和 compiler

- 新 operations/types/mirror。
- validation/merge/count。
- manifest-to-patch deterministic compiler。
- 全部 unit tests。

门禁：不启动 QCut 也能完成 parse/compile/validate，v1 命令不回归。

**状态：✅ 完成（2026-08-31，分支 `codex/compose-editable-project-v2`，commits `d35b11f56..b856f3ab6`，11 个单文件 commit）**

- 类型与 mirror：`insert-media-clip` / `set-media-filter-stack` / `add-filter-layer` + `ComposeFilterStep`、assetType `media`、patch source `manifest-compiler`，editor-core 与 `electron/native-pipeline/compose/compose-protocol.ts` 双侧一致（mirror 等价测试锁定）。
- 校验：挂起引用符号表（transition/filter-stack 可引用同 patch 内 pending clip op id；filter stack 的 trackId 必须重复 insert op id；transition 禁止 pending/snapshot 混用、pending 端点必须 main-video、trackId 用 `"main-video"` 标记）；主轨 clip 重叠冲突；trim/sourceDuration/duration 一致性（|duration−(source−trims)/rate|≤0.05）；滤镜栈 1..16、intensity 0..100、step id 唯一、同元素重复栈冲突；out-of-bounds 视野随 pending clips 延展。
- 编译器：`electron/native-pipeline/compose/compose-manifest-to-patch.ts` — 时间语义为「相邻排布 + 每个转场切口两侧各 trim t/2」，总时长 = Σclips − Σtransitions 与无头渲染一致；操作 id = sha256(manifestSha256+projectId+稳定路径) 前 24 hex，同输入同输出；overlays/audio 映射到 add-sticker/add-sound-effect；错误（缺 probe、非相邻转场、trim 吃空片段、图片缺时长）抛 `ComposeManifestCompileError`。
- v1 安全网：`compose-timeline-manifest.ts` 对新 kind 显式进 `skipped`（含引用 pending clip 的 transition），杜绝静默丢弃式 passthrough。
- 证据：新增/扩展测试 57 个全绿（compose-manifest-to-patch 8、mirror 5、editor-core compose-protocol 30、timeline-manifest 6 等）；electron 套件 3145 通过（唯一失败是 worktree 缺 staged ffmpeg 的环境问题，符号链接后归零）；editor-core 842 通过；`tsc --noEmit` editor-core/electron/apps-web 三处 0 错；biome 11 个改动文件干净。

### Phase B：media import 和真实时间线

- editor project create/open。
- insert media clips。
- transition 引用 pending clips。
- atomic cleanup/idempotent replay。

门禁：3 个无滤镜 clips 可创建、保存、重开、导出。

**状态：✅ 完成（2026-08-31，分支 `codex/compose-editable-project-v2`）**

- `compose project --target editor`（新增，portable 模式不受影响；`--name`/`--project-id` 互斥、`--project-dir` 冲突报结构化错误）。
- 传输复用 `editor timeline apply`：`insert-media-clip` → `manifest.media[]`（按名+大小去重导入）+ isMain 主轨元素（元素 id = op id，duration 用**源时长**语义）；pending 转场经元素别名解析落库；`set-media-filter-stack`/`add-filter-layer` 显式 skipped 且 `compose project` 视 skipped 为失败。
- 事务：apply 原子回滚 + 新导入媒体清理（既有）；编排层补偿 —— 本轮创建的项目在任何后续失败时删除，根因错误保留（真实触发验证过一次）。
- 幂等：`ELEMENT_CREATING_KINDS` 纳入 `insert-media-clip`；replay 实测 applied={}、5 op 全 alreadyApplied、无重复。
- 重开校验：导航去另一项目再回来 + 元素轮询（水合竞态修复），期望集只含 element-creating op。
- 真实桌面 E2E 门禁通过：3 个异源 10s 片段 + 2 个 crossfade → 29.0s 时间线精确、导出 29.021s 1080p30、转场中点真实溶解帧（SSIM 0.53–0.71 双侧）、三窗口音频 RMS 各异。证据：`evidence/2026-08-31-phase-b/`。

### Phase C：Filter Lab stack

- resolver 到 typed editor filter stack。
- preview/export/persistence/read-back。
- 单 LUT、多 Pass、native-local 各至少一个真实测试。

门禁：夸张强度帧与 neutral 帧有可量化差异，reopen 后仍一致。

**状态：✅ 完成（2026-08-31，分支 `codex/compose-editable-project-v2`）**

- 类型：`MediaFilterEffect`/`MediaFilterStack`（editor-core color.ts，`filterStack?` 上 `MediaElement`），UI/preview/export/持久化共享；旧工程无栈行为不变（归一化守卫 + 快照 key 白名单）。
- 渲染：`color-filter-stack.ts` 把栈解析为有序 `BrowserColorGradeLayer`；preview 3 个挂点 + canvas export 换用 `drawColorGradedSourceStack` —— 两端共用同一层链，顺序即渲染顺序，强度复用既有 lut/multiPass 语义。
- 引擎策略双保险：renderer factory + 服务端 `timelineRequiresRendererFilterStackExport` 都把含栈时间线强制到 canvas muxer（CLI FFmpeg 路径不渲染栈，绝不静默丢滤镜）。
- 解析：`compose-filter-stack-resolver.ts`（catalog+render-plan 同源，锁 id/version/implementation/fidelity；单 LUT 带原始 cube、多 Pass 直传 renderer 结果、native 系合成 nativeEffect；safe-passthrough 只出 warning；错误分类 filter-not-catalogued/-package-missing/-version-changed/-runtime-unavailable；并发≤4 + 去重 + bun 安全目录加载）。
- 桥接：`parseClaudeMediaFilterStack` 严格校验（畸形栈抛错不静默丢）、update 通道、读回序列化、`MEDIA_VERIFY_KEYS` 读回校验；HTTP 批量路由 body 上限 64MiB。
- 编排：`set-media-filter-stack`（含 pending 目标）→ 元素更新；`add-filter-layer` → adjustment 元素（单效果原样、纯 LUT 链合成 multiPass、混合多效果显式 skipped）。
- 真实门禁通过：单 LUT / native multi-pass / native-local dual-lut 各一，有序 2 效果栈；夸张 vs neutral SSIM 0.80–0.89（B 通道最低 0.686，native 空 passes 反证原生真实渲染）；reopen 后栈 sha256 逐字节一致；replay 幂等；坏资源回滚。证据：`evidence/2026-08-31-phase-c/`。
- 修复三个真实缺陷：bun 并发失败 import 挂死（catalog memo 化）、1MiB body 上限 destroy socket（413 都发不出）、服务端 auto 引擎丢滤镜。

### Phase D：全实验室组合

- Sticker/Sound/Transition 复用现有 preparer。
- captions/text 回归。
- 完整组合 E2E、headless/editor 对照和 rollback。

门禁：本文 14.3 的完整配方通过。

### Phase E：性能和 CI

- 30 秒功能门禁。
- 80 秒 benchmark。
- 三平台 CI。
- PR comments 全部 triage；合理意见修复，不合理意见带证据 resolve。

## 18. Git 与 PR 约束

- 当前 PR #441 的性能/CI 收尾完成并 push 后再开始本任务，不中断正在运行的 benchmark。
- 本任务使用新 worktree 和新 branch：`codex/compose-editable-project-v2`。
- 如果 PR #441 尚未合并，可从 `origin/codex/compose-labs-complete` 建 stacked branch；合并后 rebase/retarget 到最新 `origin/master`。
- 不把本任务继续堆进已经很大的 PR #441。
- 尽量一文件一 commit；source 与 test 分开提交时，后一个 commit 必须让分支恢复 green。
- 每次只 stage 明确路径，提交后用 `git diff-tree --no-commit-id --name-only -r HEAD` 证明 scope。
- 不提交剪映二进制、Framework、模型、私有缓存、大视频、API key 或 signed URL。
- 不 force push，除非用户明确授权。
- 推送前 fetch，确认 divergence；处理并保留其他 agent 的并发改动。

## 19. Definition of Done

只有同时满足以下条件才能报告完成：

- 现有 portable `compose project` 行为兼容。
- 新 editor target 能创建真实 QCut project。
- 多个视频是独立可编辑 timeline elements，不是单个 baked MP4。
- per-clip Filter Lab effects 是 typed、ordered、可调整、可保存的状态。
- transitions、stickers、sound effects、caption/text 同时存在且可编辑。
- apply 具有完整补偿事务和幂等 replay。
- save/close/reopen 后状态不丢。
- preview 与 export 都真实生效。
- headless/editor 对照报告存在，并诚实区分 fidelity。
- 30 秒真实桌面 E2E 通过并保留截图/帧/JSON 证据。
- 80 秒 benchmark 没有无法解释的性能回归。
- targeted tests、typecheck、lint、build 和三平台 CI 通过。
- PR 已推送，review comments 已处理，所有 Git scope 可证明。

## 20. 给执行者的开始指令

1. 先完成当前 Compose export performance hardening、修复 PR #441 CI 并 push。
2. 不要中断正在运行的真实导出 benchmark。
3. 重新读取本文档和当前代码；核对“当前事实基线”。
4. 在新 worktree/branch 实现 Phase A，再逐门禁推进，不能先写一大批代码最后一起测。
5. 每个 phase 完成后更新本文档的状态、命令、耗时、失败和证据路径。
6. 遇到 Filter Lab backend 不支持时返回结构化错误，不允许静默 passthrough 后宣称成功。
7. 最终汇报必须把“协议通过、时间线写入、重开、preview、export、像素/音频证据、CI”分开列出。
