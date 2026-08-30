# QCut Compose 实现计划

日期：2026-08-30

## 结论

当前代码已经完成了 `qcut compose validate/render/project` 的本地 MVP，但它还是一条 manifest 驱动的无头合成链路，不是完整的 QCut Compose 协议。

现在已有：

- `electron/native-pipeline/compose/compose-manifest.ts`：定义 `ComposeManifest v1`，覆盖 clips、Filter Lab 滤镜、crossfade 转场、sticker overlay、sound-effect audio。
- `electron/native-pipeline/compose/compose-resolver.ts`：解析素材路径，probe 媒体，锁定 sha256，解析 Filter Lab 计划，校验 transition 邻接、贴纸和音效时间范围。
- `electron/native-pipeline/compose/compose-render.ts`：本地 FFmpeg 无头渲染，包含 clip normalize、Filter Lab、timeline join、sticker/audio finishing、输出验证、lock/report。
- `electron/native-pipeline/compose/compose-project.ts`：复制素材并生成 portable `compose.json`、`compose-lock.json`、`project.json`。
- `packages/editor-core/src/templates/smart-packaging-protocol.ts`：已有 `SmartPackagingSnapshot`、`SmartPackagingCloudJob`、`SmartPackagingTimelinePatch`，接近通用 Compose 协议的原型。
- `apps/web/src/lib/templates/smart-packaging-application.ts`：已有 Smart Packaging patch 到编辑器 timeline tracks 的应用逻辑。
- `electron/native-pipeline/editor/editor-timeline-apply.ts`：已有声明式 timeline manifest 的 atomic apply、rollback 和 read-back verification。

因此下一步不是重写，而是把三条已有链路接起来：

```text
Editor Snapshot
  -> Compose Intent
  -> Local/Cloud Compose Job
  -> Compose Patch
  -> Validate
  -> Apply to QCut editor
  -> Render/export verify
  -> Project persistence
```

## 现在差什么

### 1. 缺通用 Compose Core（已完成 2026-08-30）

状态：已在 `packages/editor-core/src/compose/` 落地——`compose-types.ts`、
`compose-fingerprint.ts`（免 locale 的确定性 sha256）、`compose-validation.ts`（结构化
issue，收编 smart-packaging 错误码）、`compose-patch-merge.ts`（按 operation id 幂等）、
`smart-packaging-adapter.ts`（snapshot/patch/issue 三个转换器），入口已接进包导出，
19 个单测覆盖阶段 1 全部验收项。以下为当时的设计记录。

`SmartPackagingTimelinePatch` 已经能表达字幕、文字、贴纸、音效、转场和 zoom，但它的命名和入口仍绑定 Smart Packaging。`ComposeManifest v1` 能渲染本地多资源编辑，但它不理解当前编辑器工程、snapshot fingerprint、cloud job、provider provenance、patch merge。

需要新增通用协议层：

```text
packages/editor-core/src/compose/
  compose-types.ts
  compose-fingerprint.ts
  compose-validation.ts
  compose-patch-merge.ts
  smart-packaging-adapter.ts
```

第一版类型应包含：

- `ComposeSnapshot`：当前项目、时间线、媒体、字幕、beats、shots、可用资源、渲染能力。
- `ComposeIntent`：用户要什么，例如 `smart-packaging`、`subtitle-style`、`resource-match`、`full-compose`。
- `ComposeJob`：本地或云端任务生命周期，包含 provider、remote task id、upload ids、progress、retry/cancel/error。
- `ComposePatch`：可幂等合并和重放的 timeline operation 列表。
- `ComposeValidationIssue`：validate 输出的结构化问题。
- `ComposeProjectRecord`：保存到工程里的 job、patch、资产 provenance 和验收结果。

Smart Packaging 应成为 `ComposeIntent.kind = "smart-packaging"` 的一个调用方，而不是继续扩成所有智能编辑能力的总入口。

`smart-packaging-protocol.ts` 已有 `"empty-snapshot"`、`"snapshot-mismatch"` 等失败枚举；
`ComposeValidationIssue.code` 必须收编这套枚举（由 adapter 负责映射），不允许长出两套平行的
错误分类。

### 2. 缺 snapshot

现在 `qcut compose validate/render/project` 读的是用户手写或外部生成的 `compose.json`，不是从 QCut 当前项目抓取状态。

需要实现：

```bash
qcut compose snapshot --project-id <id> --output snapshot.json --json
```

实现方式：

1. 复用现有 editor API 获取 active project、timeline tracks、media library、project settings。
2. 从 timeline 中提取 media、caption、text、sticker、audio、transition、filter/enhancement 状态。
3. 为每个可引用对象生成稳定 `sourceFingerprint`，至少包含 project id、timeline element ids、media source identity、duration、trim、fps、canvas。
4. 输出 `ComposeSnapshot`，供本地 heuristic 和云端模型共同使用。

运行时前提：现有 editor API 是 `127.0.0.1:8765` 的 `/api/claude/*` HTTP 桥（见
`editor-timeline-apply.ts`），要求 QCut 正在运行；QCut 有单实例锁，CLI 不能自行拉起第二个
实例。因此 snapshot/apply 第一版明确为"驱动运行中的编辑器"，app 未运行时返回结构化错误，
而不是回退去解析磁盘工程。新增 `/api/claude` 路由必须同时注册进 `claude-http-server.ts`
与 `utility-http-server.ts`，否则 CLI 探活可用但新路由 404。

验收：

- 空项目返回结构化错误。
- 同一项目同一 timeline 多次 snapshot fingerprint 一致。
- timeline 有变更后 fingerprint 改变。
- snapshot 不包含本地隐私绝对路径，除非命令显式要求调试模式。

### 3. 缺云端 Job 真实链条

类型里已有 provider 概念，但 CLI 和 native pipeline 还没有实际 job adapter。需要把 QCut 云端作为主路径，OpenRouter/FAL 作为补齐 provider。

需要实现：

```bash
qcut compose plan \
  --snapshot snapshot.json \
  --intent intent.json \
  --provider qcut \
  --output patch.json \
  --json
```

Provider adapter 形态：

```text
electron/native-pipeline/compose/providers/
  compose-provider.ts
  qcut-compose-provider.ts
  openrouter-compose-provider.ts
  fal-compose-provider.ts
  local-compose-provider.ts
```

接口职责：

- `createJob(snapshot, intent)`：创建 job，返回本地 job id 和 remote task id。
- `uploadAssets(job, snapshot)`：上传必要代理文件或摘要，不上传不需要的原始媒体。
- `pollJob(job)`：查询 queued/uploading/running/completed/failed/canceled。
- `downloadPatch(job)`：拿到 provider 返回的 `ComposePatch`。
- `cancelJob(job)`：取消远端任务。

第一版 provider 优先级：

1. `qcut`：我们的云端接口，负责主智能包装和素材匹配。
2. `openrouter`：补齐文本理解、结构化建议、素材检索 query、字幕/口播语义分段。
3. `fal`：补齐视觉模型或生成型素材任务。
4. `local`：无 key、离线或调试时使用 deterministic heuristic。

验收：

- provider 返回 patch 前必须绑定 `snapshotId` 和 `sourceFingerprint`。
- completed job 必须带 result patch。
- retry 不得重复创建相同 operation。
- 失败要区分 retryable、quota、auth、unsupported、unsafe-content。
- job 记录不能保存 API key 或可恢复 secret。

### 4. 缺 Patch Validate

当前 validate 检查的是本地 compose manifest 能否渲染，不是云端/本地 patch 能否安全应用到当前编辑器工程。

需要实现：

```bash
qcut compose validate \
  --snapshot snapshot.json \
  --patch patch.json \
  --json
```

注意：`compose validate --config`（manifest 校验）已随 v2026.08.30.1 发布，patch 校验不得改变已发布语义：

- 模式判定：出现 `--config` 走 manifest 模式；出现 `--snapshot` 与 `--patch` 走 patch 模式；两组参数同时出现时直接报错。
- `--config` 形态保持向后兼容，`--output` 继续受"禁止覆盖输入"防护约束。
- 第 7 节的 `compose render --target` 与第 8 节的 `compose project --project-id` 同理：实现时先落模式判定与冲突报错，再加新参数。

必须检查：

- snapshot id 和 fingerprint 是否匹配。
- operation id 是否唯一，可幂等重放。
- track type、element type、asset type 是否兼容。
- caption、text、sticker、sound、filter、transition、zoom 的时间范围是否合法。
- transition 的 from/to 是否相邻、是否在同一视频 track。
- asset 是否可解析到 QCut 资源、用户本地文件、缓存包或 cloud artifact。
- 字体、文字模板、文字动画、花字是否能接上 QCut 字幕实验室。
- filter、transition、sticker、sound effect 是否有本地 render 和 editor preview 能力。
- 多个操作作用在同一 element 时是否冲突，例如 zoom、filter、enhancement、speed keyframes。
- patch 是否会覆盖用户最近修改；如果 fingerprint 过期，必须拒绝或要求 rebase。

输出应是结构化 issue，而不是只返回一段错误字符串：

```ts
interface ComposeValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  path: string;
  message: string;
  operationId?: string;
  fixHint?: string;
}
```

### 5. 缺 Apply 桥

现在 Smart Packaging web 端可以直接改 store，`editor:timeline:apply` 可以应用 timeline manifest，但 `ComposePatch` 还不能通过 CLI 原子写回真实编辑器。

需要实现：

```bash
qcut compose apply \
  --project-id <id> \
  --snapshot @snapshot.json \
  --patch @patch.json \
  --atomic \
  --verify \
  --json
```

第一版实现不要新增复杂 transport。先做纯函数转换：

```text
ComposePatch -> TimelineManifest -> editor:timeline:apply
```

转换器位置：

```text
electron/native-pipeline/compose/compose-timeline-manifest.ts
```

要点：

- caption/text/sticker/sound effect 创建为对应 track element。
- transition 转为现有 timeline transition payload。
- media zoom、filter、enhancement 转为现有 media element 字段或 keyframes。
- asset reference 先通过 resolver 转成 editor 可导入 media id 或已存在 asset id。
- 幂等重放依赖确定性 id：converter 必须从 `operationId` 确定性推导 element/track id
  （沿用 claude-bridge 确定性 `media_` 前缀的做法），否则 read-back verify 无法识别重复应用。
- apply 前必须跑 `compose validate`。
- apply 后复用 `editor-timeline-apply.ts` 的 read-back verify。
- 失败时复用 transaction rollback。

验收：

- 应用成功后返回 applied operation ids、created track ids、created element ids、created transition ids。
- read-back 不一致时 rollback。
- 重放同一个 patch 不应重复生成同一批元素，除非 patch 显式 `mode = "duplicate"`。
- fingerprint 过期时不 apply。

### 6. 缺资源 Resolver

当前 compose manifest 中：

- filter 使用 Filter Lab `resourceId`。
- sticker 使用本地图片路径。
- sound effect 使用本地音频路径。
- transition 只有 `crossfade`。

需要统一为 asset reference：

```ts
interface ComposeAssetReference {
  provider: "qcut" | "openrouter" | "fal" | "local";
  assetType:
    | "font"
    | "text-template"
    | "text-animation"
    | "fancy-word"
    | "sticker"
    | "sound-effect"
    | "filter"
    | "transition"
    | "generated-media";
  assetId: string;
  cacheKey?: string;
  localPath?: string;
  license?: "commercial-ok" | "personal-only" | "unknown";
  provenance?: Record<string, unknown>;
}
```

需要补：

- Sticker Lab resource ID -> 本地缓存包 -> 可预览/可渲染素材。
- Sound Effects Lab resource ID -> 本地缓存音频 -> waveform/duration/license。
- Transition Lab/Jianying-local preset -> QCut transition preset 或 headless render plan。
- Text Lab 字体、花字、文字动画 -> caption/text element style。
- FAL/OpenRouter/QCut cloud artifact -> 本地 media library artifact。

验收：

- `compose validate` 能解释每个 asset 是 cached、downloadable、cloud-only、missing、unsupported。
- portable project 能保留 asset digest 和 resolver evidence。
- 不把 cached 当 verified；lock/report 中要区分 cache status、backend、fidelity、verification。
- Transition Lab / Jianying-local preset 的 resolver 输出必须遵守"不做什么"的剪映红线：
  portable project 只保留 QCut 侧 identity 与 digest。

### 7. 缺 Render 与 Apply 的统一验证

`compose render` 已经能本地输出 MP4，但它和编辑器 preview/export 不是同一条验证链。下一阶段要明确两个 render 目标：

- `headless-render`：用于 CLI 快速验证、批量任务、portable project 重渲染。
- `editor-render`：用于真实 QCut timeline apply 后，通过现有 export path 导出并验证。

需要实现：

```bash
qcut compose render \
  --project-id <id> \
  --patch @patch.json \
  --target editor \
  --verify-frames 0,3,6 \
  --json
```

验收：

- render report 包含 snapshot id、patch id、job id、provider、operation counts。
- 输出视频 probe 验证 width、height、fps、duration、hasAudio。
- 关键帧截图或 perceptual hash 验证重要贴纸/字幕/转场存在。
- headless render 和 editor export 的差异要记录，不强行假装完全一致。

### 8. 缺 Project Persistence

现在 portable `project.json` 明示 `editorTimelineImportSupported: false`，所以它只是可重渲染包，不是 QCut 可继续编辑工程。

需要实现：

```bash
qcut compose project \
  --project-id <id> \
  --include compose-jobs,patches,assets,render-reports \
  --json
```

QCut 工程内应保存：

```text
.qcut/compose/
  snapshots/<snapshot-id>.json
  jobs/<job-id>.json
  patches/<patch-id>.json
  locks/<patch-id>.lock.json
  reports/<render-id>.json
```

或者接入现有 project metadata store。第一版可以先文件化，等协议稳定后再收进正式项目结构。

验收：

- 打开项目后能看到上次智能包装 job 和 patch。
- 能重新 validate 历史 patch。
- 能重新 render 历史 patch。
- 能知道某个 timeline element 来源于哪个 compose operation。

## 推荐实现顺序

这份文档描述的是一个连续实现路线，不要求按文档章节拆成多个文档 PR。文档、调研和方案记录可以合并在一个较大的 docs PR 里；真正进入代码实现时，再按功能边界、风险和可验证性拆小。

### 阶段 1：Compose Core 类型与验证（已完成 2026-08-30）

目标：把协议落在 `packages/editor-core/src/compose/`。

包含：

- `ComposeSnapshot`
- `ComposeIntent`
- `ComposeJob`
- `ComposePatch`
- `ComposeAssetReference`
- `ComposeValidationIssue`
- fingerprint 计算
- patch merge
- Smart Packaging adapter

测试：

- snapshot fingerprint deterministic。
- patch merge 按 operation id 幂等覆盖。
- snapshot mismatch 拒绝。
- SmartPackaging patch 能转换成 ComposePatch。

### 阶段 2：CLI snapshot/validate/apply

目标：让 ComposePatch 能从 CLI 进入真实编辑器 timeline。

包含：

- `qcut compose snapshot`
- `qcut compose validate --snapshot --patch`
- `qcut compose apply --snapshot --patch`
- `ComposePatch -> TimelineManifest` 转换器
- 复用 `editor:timeline:apply` transaction/read-back verify

测试：

- CLI parse/help。
- validate issue 快照。
- apply conversion unit tests。
- editor timeline apply 集成测试。

### 阶段 3：资源 Resolver

目标：把贴纸、音效、转场、文字资产从本地路径升级成 QCut resource identity。

包含：

- Sticker Lab resolver。
- Sound Effects Lab resolver。
- Transition Lab resolver。
- Text Lab resolver。
- asset lock 和 portable project evidence。

测试：

- cached/missing/unsupported/downloadable 分类。
- license policy。
- portable project asset digest。

### 阶段 4：Cloud Job Adapter

目标：打通真实云端调用。

包含：

- QCut cloud provider。
- OpenRouter provider。
- FAL provider。
- local fallback provider。
- upload/poll/download/cancel/retry。
- job persistence。

测试：

- provider contract tests。
- mock cloud lifecycle。
- retry/cancel/idempotency。
- secret redaction。

### 阶段 5：Render/Export 验证闭环

目标：把 patch apply 后的真实编辑器导出纳入 compose 验收。

包含：

- `compose render --target headless|editor`
- frame probe / screenshot evidence。
- render report 与 job/patch/snapshot 关联。
- headless 与 editor render 差异记录。

测试：

- short talking-head 中文/英文 E2E。
- subtitles + text template + sticker + sound + transition 混合 E2E。
- portable project rerender。
- apply -> export -> probe -> screenshot artifact。

## 最小可做版本（已被阶段 1 实现覆盖）

如果先做一小步，建议只做：

1. `packages/editor-core/src/compose/compose-types.ts`
2. `packages/editor-core/src/compose/compose-validation.ts`
3. `packages/editor-core/src/compose/smart-packaging-adapter.ts`
4. 单元测试覆盖 Smart Packaging 到 ComposePatch 的转换和 snapshot mismatch。

这个最小版本不需要接真实云端、不需要渲染、不需要 UI。它的价值是把后续所有“智能包装、字幕实验室、素材匹配、滤镜转场音效贴纸组合”都放到同一个协议里。

## 不做什么

- 不复制剪映私有接口、素材 ID、缓存结构。
- 不把 Smart Packaging 做成所有智能编辑能力的最终抽象。
- 不让 `compose render` 取代编辑器 export。
- 不把云端模型返回值直接写 timeline；必须先变成 patch，再 validate，再 apply。
- 不保存 API key、用户隐私路径或不可公开的私有缓存路径到 portable project。
- 不把本地 cache 命中当作渲染 verified。

## 当前判断

QCut 现在已经有三块很好用的积木：

1. Smart Packaging 的 snapshot/job/patch 原型。
2. Editor timeline apply 的事务和 read-back verify。
3. Native compose 的本地多资源 render/project MVP。

真正缺的是中间的统一协议和桥：

```text
SmartPackagingPatch
  -> ComposePatch
  -> validate
  -> editor apply
  -> render/export verify
  -> persistent compose record
```

先把这座桥搭好，再接 QCut 云端、OpenRouter、FAL，会比直接在每个功能里单独接云端稳定得多。
