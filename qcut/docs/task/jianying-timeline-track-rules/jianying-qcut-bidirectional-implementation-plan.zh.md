# 剪映与 QCut 双向草稿兼容具体实现方案

<!-- markdownlint-disable MD013 -->

**状态：** 实施设计，尚未全部实现  
**日期：** 2026-08-04  
**最后核验代码：** `ab384a5bc`

**依赖文档：** [剪映时间线轨道规则核验](./timeline-track-rules.zh.md)、[QCut 时间线规则差距与修复计划](./qcut-timeline-rule-gap-analysis.zh.md)

## 目标

建立可长期维护的双向链路：

```text
剪映/CapCut 草稿
  -> 安全只读扫描
  -> 版本 profile 识别
  -> 原始引用图解析
  -> 语义中间层
  -> 素材与资源重定位计划
  -> QCut 原子导入
  -> QCut 编辑
  -> profile 驱动导出
  -> 剪映/CapCut 打开、保存、导出
  -> 结构和视听验证
```

最终成功标准不是“JSON 能解析”或“剪映能打开”，而是：支持范围内的工程可以双向往返、继续编辑、未知数据不会被静默破坏，并且 QCut 与剪映导出的画面和音频满足明确的误差阈值。

## 当前基础与缺口

### 已有基础

- [`QCutDraftExportSnapshotV1`](../../../packages/editor-core/src/jianying-draft/types.ts) 已把 renderer 状态转换成可序列化导出快照。
- [`buildJianyingDraft()`](../../../packages/editor-core/src/jianying-draft/build.ts) 已支持 synthetic plaintext 5.9 基线，并按 issue severity 决定 `canWrite`。
- [`buildCapCut81Draft()`](../../../packages/editor-core/src/jianying-draft/capcut-8-1-build.ts) 已有 CapCut 8.1 profile、LUT、静态蒙版、字体和原生叠化处理。
- [`StandaloneJianyingDraftExportSession`](../../../packages/jianying-draft-export/src/export-session.ts) 已采用受信任的 `plan → commit` 两阶段写出。
- [`writer.ts`](../../../packages/jianying-draft-export/src/writer.ts) 已实现路径校验、素材探测、哈希、临时目录和原子 rename。
- [`scripts/capcut-e2e/`](../../../scripts/capcut-e2e) 已有受控素材、草稿安装、真实 App 重开、保存、视觉 oracle 和证据清单。
- [`storage-service.ts`](../../../apps/web/src/lib/storage/storage-service.ts) 已有项目、场景、timeline、媒体元数据和 OPFS 文件存储。

### 当前缺口

- 仓库没有正式的剪映/CapCut → QCut 导入器。
- 导出模型是单向 snapshot，不是可保存原始来源和未知字段的双向中间层。
- profile 目前以 5.9 和 CapCut 8.1 写出为主，没有统一 detection/migration registry。
- 素材 staging 面向导出，没有导入侧的重定位、去重、许可和缺失资源决策。
- 复杂文字、调色、蒙版、关键帧、转场仍有大量 blocked 或 warning 映射。
- 视觉 E2E 已有框架，但许多 GUI preview/reopen/export 检查仍是 `unverified`。
- QCut 项目存储没有完整的导入 journal、checkpoint 和启动恢复协议。

## 架构原则

1. **解析与写入分离。** `inspect` 永远只读；`plan` 生成确定性方案；`commit` 才允许创建 QCut 项目或目标草稿。
2. **语义模型与原始格式分离。** QCut timeline 不能直接承载每个剪映未知字段，原始证据也不能污染编辑器核心类型。
3. **严格 profile，不猜版本。** 识别不确定时允许 inspect，但禁止可写 round-trip。
4. **支持、降级、保留、阻止四态。** 不能把“保留了 JSON”冒充“QCut 能编辑”。
5. **未知字段有所有权。** 只在父节点未被相关编辑修改时保留；发生结构变化后必须重新验证或阻止写出。
6. **资源只在本机解析。** 剪映二进制、缓存包、字体和专有资源不得提交到 Git，也不得默认复制到发布包。
7. **同一命令服务 UI、CLI 和 AI。** UI 只是 plan/commit 的呈现层，不复制导入或迁移逻辑。
8. **每个阶段可恢复、可重试、幂等。** 崩溃后不能留下半个 QCut 项目或污染用户现有剪映草稿。

## 建议模块边界

### Core：纯数据与纯函数

保留 `packages/editor-core/src/jianying-draft/` 作为映射核心，并增加以下子目录：

```text
packages/editor-core/src/draft-interop/
  document.ts              # 双向语义中间层 DraftInteropDocumentV1
  capability.ts            # exact/downgrade/opaque/blocked 判定
  provenance.ts            # 来源 profile、文件哈希、原始节点绑定
  dirty-domains.ts          # geometry/timing/style/resource/structure 脏域
  issues.ts                 # 稳定 issue code 和严重级别
  import-bundle.ts          # runtime 与 renderer 共享的纯数据 bundle schema

packages/editor-core/src/jianying-draft/import/
  raw-types.ts              # 最小原始结构，不宣称覆盖所有字段
  profile-detection.ts      # 版本证据和置信度
  graph-reader.ts           # tracks/segments/materials/ref 图
  normalize.ts              # 原始图 -> DraftInteropDocumentV1
  qcut-mapping.ts           # Interop -> QCut project/timeline plan
  validation.ts             # 引用、时间、资源和不变量

packages/editor-core/src/jianying-draft/profiles/
  registry.ts
  plaintext-5-9.ts
  capcut-8-1.ts
  jianying-11-readonly.ts   # 只在有证据时加入；默认不可写
```

Core 不读取用户目录、不调用 Electron、不创建 Blob，也不访问剪映缓存。

### Runtime：受限文件系统与导入 bundle

新增与现有 exporter 对称的 package：

```text
packages/jianying-draft-import/
  src/discovery.ts          # 安全定位候选文件和 sidecar
  src/snapshot-reader.ts    # 限大小读取、哈希、文件身份验证
  src/asset-resolver.ts     # 路径/ID/哈希候选解析
  src/import-session.ts     # inspect/plan/commit 生命周期
  src/import-plan-artifact.ts # 可持久化、可过期、绑定来源的 plan
  src/qcut-import-bundle-builder.ts # 生成 bundle 和 staging manifest
  src/runtime-validation.ts # IPC/CLI 输入白名单
  src/__tests__/
```

该 package 只能通过 main process 或 CLI 调用。安全要求复用 exporter 的绝对路径、realpath、symlink、TOCTOU、大小限制和 bounded concurrency 模式。它负责来源 snapshot、解析、资源计划和 `QCutImportBundle`，但**不得直接写入 QCut 的 IndexedDB 或 OPFS**。

### Renderer：QCut 存储事务

QCut 的 project registry 可以走 Electron storage adapter，但 timeline、media metadata 和 media bytes 仍由 renderer 中的 IndexedDB/OPFS adapter 管理。因此，Node runtime 的 filesystem rename 不能代表整个 QCut 项目的原子提交。新增 renderer 事务边界：

```text
apps/web/src/lib/jianying-draft/qcut-import-transaction.ts
apps/web/src/lib/storage/import-staging-adapter.ts
apps/web/src/lib/storage/import-journal.ts
apps/web/src/lib/storage/import-recovery.ts
```

事务层接收已经验证的 `QCutImportBundle`，将 project、scene、timeline、media metadata、OPFS bytes 和 foreign envelope 写入隔离 namespace，重新读取验证后，再用单一 registry publish 使项目可见。最小 journal、rollback 和启动恢复必须与首个可写 commit 同时交付，不能推迟到性能阶段。

### Web/Electron 集成

```text
electron/jianying-draft-import-contract.ts
electron/jianying-draft-import-handler.ts
electron/preload-types/api-types/jianying-draft-import-api.ts

apps/web/src/hooks/import/use-jianying-draft-import.ts
apps/web/src/components/import-dialog/jianying-draft-import-card.tsx

electron/native-pipeline/cli/command-registry-editor-jianying.ts
electron/native-pipeline/cli/cli-handlers-editor.ts
electron/jianying-draft-import-inbox.ts
```

UI 不直接解析草稿。它只显示 profile、问题、素材决策、预计磁盘占用和 commit 结果。CLI 不另写一套存储实现：QCut 正在运行时通过 Electron bridge 发送 bundle；未运行时只允许写入受验证的 desktop import inbox，由 QCut 下次启动后调用同一个 renderer 事务层消费。

## 双向语义中间层

### DraftInteropDocumentV1

建议引入独立的中间层，而不是直接把 raw JianYing JSON 映射成 `TimelineTrack[]`：

```ts
interface DraftInteropDocumentV1 {
  schemaVersion: 1;
  source: DraftSourceDescriptor;
  project: InteropProject;
  timelines: InteropTimeline[];
  resources: InteropResource[];
  links: InteropLink[];
  foreignEnvelope: ForeignDraftEnvelope;
  issues: InteropIssue[];
}
```

关键字段：

- `source`：产品、profile、app/schema 版本、平台、文件清单和哈希。
- `timelines`：轨道、片段、source/target range、层级、转场和子时间线。
- `resources`：视频、音频、图片、字体、LUT、滤镜、特效、转场包和状态。
- `links`：音视频、字幕归属、特效目标、组合、复合片段和语义场景关系。
- `foreignEnvelope`：原始文档和节点 binding，只保存在本机项目数据中。
- `issues`：稳定 code，不依赖当前 UI 文案。

### 四种能力状态

| 状态 | 含义 | 是否允许自动 commit |
| --- | --- | --- |
| `exact` | QCut 可编辑并能按目标 profile 无损写回 | 是 |
| `downgrade` | 可转成明确的静态/近似结果，用户必须接受 warning | 接受后允许 |
| `opaque` | QCut 不编辑，但保存原始节点并维持引用 | 仅同 profile 且节点未变时允许 |
| `blocked` | 无法安全表达或验证 | 否 |

每个轨道、片段、附属素材和资源都要单独有 capability，不能只给整个工程一个模糊分数。

### 五种 profile 操作能力

“双向支持”不能作为一个布尔值。每个 profile 必须分别声明：

| 能力 | 含义 |
| --- | --- |
| `inspect` | 可安全识别和报告，不创建 QCut 项目 |
| `import` | 可把声明的支持子集提交为可编辑 QCut 项目 |
| `sameProfileWriteback` | QCut 修改后可写回同一产品和 profile |
| `crossProfileExport` | 可迁移到另一个明确目标 profile |
| `realAppVerified` | 已由目标版本 App 完成 open/save/reopen/native-export 收据 |

前三种数据方向分别是“来源导入”“同 profile 往返”和“跨 profile 迁移”，必须单独测试和发布。Synthetic fixture 只证明 parser/writer 内部自洽，不构成生产 profile，也不能满足 `realAppVerified`。

## 1. 正式导入器

### 流程

```text
discover
  -> snapshot immutable files
  -> detect profile
  -> classify bounded payload as plaintext/opaque/encrypted
  -> parse only verified plaintext or explicitly supported envelopes
  -> validate graph references
  -> normalize semantic document
  -> build asset resolution plan
  -> build QCut import plan
  -> user/CLI accepts warnings and mappings
  -> commit to staging project
  -> verify persisted project
  -> publish project atomically
```

### Inspect

Inspect 输出必须包括：

- profile 候选和支持级别；
- 文件清单、大小、mtime、inode/device 和 SHA-256；
- timeline/track/segment/material 数量；
- 断裂引用、重复 ID、非法时间范围和未知 bucket；
- 所需磁盘空间与资源缺失列表；
- exact/downgrade/opaque/blocked 统计；
- 任何加密或无法验证的文件。

Inspect 不写 QCut storage，不创建媒体 Blob，不修改来源草稿。

### Plan

Plan 必须绑定 inspect 的全部输入哈希。来源任何文件变化都使 plan 失效。Plan 生成：

- 确定性 QCut project ID、scene/timeline ID 和 element ID；
- 每个 source ID 到 QCut ID 的映射；
- 素材 copy/link/transcode/missing 决策；
- 降级 warning fingerprints；
- blocked 原因；
- commit checkpoint 列表和预计空间。

Plan 以版本化 `ImportPlanArtifactV1` 保存，并至少绑定：`planId`、`importId`、创建者、创建/过期时间、QCut build/schema、source snapshot manifest hash、profile evidence hash、mapper versions、warning fingerprints 和 bundle digest。默认只保存在 QCut 私有 app data；日志和 CLI 输出不得包含未脱敏的来源路径。commit 必须以 compare-and-swap 标记 plan 状态，拒绝过期、已消费、来源变化、build 不兼容或并发执行的 plan。

确定性 ID 的作用域是 `importId + source semantic ID`。重复执行同一 plan 必须幂等；重新导入同一来源则要求显式 `new-project | replace-existing | update-linked` 冲突策略，不能仅靠确定性 project ID 覆盖已有项目。

### Commit

Runtime commit 只冻结 plan、解析资源并生成带 digest 的 `QCutImportBundle`。Renderer commit 再写入 IndexedDB/OPFS 的隔离 staging namespace，完成媒体、元数据、timeline、project 和 foreign envelope 后重新读取验证。只有验证通过才把项目注册为可见。失败时回滚 staging；进程崩溃时由 renderer journal 在下次启动继续或回滚。

### CLI

```bash
qcut editor draft inspect --source "/path/to/draft" --json
qcut editor draft import-plan --source "/path/to/draft" --profile auto --json
qcut editor draft import-commit --plan-id <id> --on-conflict new-project --accept-warning <fingerprint>
qcut editor draft roundtrip-verify --project <qcut-project-id> --target capcut-8.1
```

`--profile auto` 只有在 profile 唯一且证据充分时可继续；否则要求显式 profile，不能选“最接近版本”。

## 2. Profile 与迁移

### Profile 契约

每个 profile 至少声明：

- `profileId`、产品、平台和支持的 app/schema 版本范围；
- 必需、可选和禁止文件；
- top-level/config/material/keyframe bucket；
- 时间单位、坐标系、轨道顺序和主轨身份规则；
- 素材路径编码和资源目录；
- 可读、可写和 round-trip capability；
- 未知字段策略；
- fixture 与真实 App 验证证据版本。

### Detection

Detection 使用多项证据：app metadata、schema version、top-level key set、mirror file layout、timeline registry 和路径模式。输出 `exact | ambiguous | unsupported | encrypted`，不得只用文件名判断。

### Migration

迁移采用：

```text
source raw
  -> source profile parser
  -> DraftInteropDocumentV1
  -> QCut schema migrations
  -> target profile writer
```

不要直接写大量 `5.9 JSON -> 8.1 JSON` 转换器。所有版本先进入同一语义层，只有确实无法语义化的 unknown/opaque 节点留在 foreign envelope。

### 初始支持矩阵

| Profile | Inspect | Import | Same-profile writeback | Cross-profile export | 真实 App 状态 |
| --- | --- | --- | --- | --- | --- |
| synthetic plaintext 5.9 | fixture | parser/plan fixture | 仅内部自洽测试 | 已有 writer 基础 | 非生产 profile |
| CapCut desktop 8.1 plaintext | 首个生产候选 | 首个生产候选 | 支持已验证子集后逐项开放 | 已有 migration 基础 | 每个支持子集需要真实收据 |
| JianYing 11.x 新格式 | read-only 起步 | 无证据时 blocked | blocked | blocked | unresolved/encrypted |

每增加一个 profile，必须带 sanitized golden fixture、runtime validator、迁移测试、真实 App reopen/save/export 收据。
Synthetic fixture 只能证明 QCut 内部 parser/writer 自洽，不能替代对应产品和版本的真实 App 收据。无法取得目标版本 App 时，该 profile 必须保持 `fixture-verified` 或 `read-only`。

## 3. 素材、字体与资源包重定位

### ResourceResolutionPlan

每个资源生成一个明确动作：

```text
copy        复制到 QCut 项目内容寻址存储
link        只在用户选择外部引用且平台允许时使用
transcode   解码器不兼容时生成代理/中间文件
resolve     通过 resource ID + package metadata 找到本机资源
fallback    用户接受静态化或替代资源
missing     阻止或允许占位，取决于 capability
```

### 内容寻址

建议媒体和可合法复制资源以 `sha256 + byteLength + probe signature` 去重。原始路径只是 provenance，不是缓存 key。相同文件重命名后仍可复用，不同文件同名不能误绑。

### 匹配优先级

1. 原始绝对/草稿相对路径仍存在，文件身份和哈希匹配；
2. 草稿内 portable asset 路径和 manifest 匹配；
3. resource ID + package metadata/hash 精确匹配；
4. 用户已保存的 relink mapping；
5. 交互式选择；
6. 缺失或降级。

禁止只按 basename 自动选择；多个候选时必须提示冲突。

### 字体

- 保存请求的 family/postscript name、原文件哈希、glyph coverage 和来源 profile。
- 用现有 `font-glyph-coverage.ts` 做 cmap 覆盖预检。
- 系统字体和剪映随 App 字体默认不复制；仅记录本机 binding。
- 用户有许可的项目字体可以复制到 QCut project assets。
- 字形不全时阻止 exact，允许用户接受 fallback 后降级。

### 滤镜、特效、转场和二进制包

- 私有包 resolver 放在本机 skill/runtime，不进入 editor-core fixture。
- Git 只保存 metadata schema、哈希和 synthetic fixture；不保存剪映包、缓存或反编译产物。
- resource ID、effect ID、metadata MD5 和包 hash 必须同时进入 provenance。
- 无法在 QCut 渲染的资源默认 `opaque`；如用户修改其时间、目标或参数，则重新评估为 `blocked` 或明确静态化。

## 4. 复杂功能映射

### FeatureMapperRegistry

所有映射按 `featureKind + sourceProfile + targetProfile` 注册：

```text
text.style
text.animation
color.basic
color.curves
color.lut
mask.static
mask.keyframes
media.keyframes
transition.native
transition.proprietary
```

每个 mapper 返回 `mappedValue`、capability、issues、consumed foreign paths 和测试证据 ID。

### 实施顺序

1. 基础媒体 timing、transform、opacity、audio volume。
2. 普通文字/字幕、字体、描边、阴影和背景。
3. 基础调色和 LUT。
4. 静态矩形/椭圆蒙版。
5. transform/opacity/audio keyframes。
6. 原生叠化和已验证 native transitions。
7. 曲线、动态蒙版、文字动画和专有转场。

### 映射规则

- exact 映射必须有数值边界、坐标转换和 round-trip 测试。
- downgrade 必须产生用户可理解的视觉差异说明，例如“动态文字已烘焙为透明视频”。
- opaque 节点只允许移动整个父片段或保持不变；不能假装参数可编辑。
- blocked 项不能通过删除字段后继续写出。
- 预览和导出必须调用同一 normalized mapper 或 resolved plan，不能各自实现近似。

## 5. 逐帧与音频一致性

### 四路对比

每个 fixture 至少产生：

```text
QCut preview capture
QCut native export
JianYing/CapCut preview capture
JianYing/CapCut native export
```

Native export 是主要 oracle；GUI preview 受色彩管理、缩放和显示器影响，应单独记录而不是混为同一阈值。

### 采样点

- 每个片段开始、结束前一帧和结束后一帧；
- 每个转场前、中、后；
- 每个 keyframe 前、精确帧和后一帧；
- 每个字幕出现/消失边界；
- 固定 seed 的区间随机采样；
- 首帧、末帧和最长无变化区间。

### 指标

- RGB：现有 RMSE、MAE、p95、max；
- Alpha：透明像素比例、边缘区域误差；
- Geometry：ROI 边界和关键点偏差；
- Temporal：边界帧偏移和转场实际窗口；
- Audio：时长、峰值、响度、声道、静音区和测试 tone 频谱。

阈值应按 feature/profile 定义，不能全项目只用一个 RMSE。所有证据清单绑定输入草稿、素材、字体、App 版本、FFmpeg/FFprobe 版本、导出设置和输出 SHA-256。

### 扩展现有 E2E

优先扩展 [`scripts/capcut-e2e/`](../../../scripts/capcut-e2e)，不要建立第二套测试系统。新增：

```text
scripts/capcut-e2e/roundtrip-case.ts
scripts/capcut-e2e/qcut-import-verification.ts
scripts/capcut-e2e/semantic-diff.ts
scripts/capcut-e2e/audio-comparison.ts
scripts/__tests__/capcut-e2e-roundtrip-*.test.ts
```

## 6. 未知字段保留与无损往返

### ForeignDraftEnvelope

Envelope 本机保存：

- allowlist 中确认为 round-trip 所需的原始文件字节或安全压缩副本及 SHA-256；
- profile 和 detection evidence；
- raw node ID/JSON pointer 到 QCut semantic ID 的 binding；
- 每个 unknown subtree 的父节点、引用和 ownership domain；
- import 后发生的 dirty domains；
- 用户接受的 downgrade fingerprints。

Envelope 不得默认复制整个来源目录。`crypto_key_store.dat`、`.locked`、运行日志、无关 backup、私有缓存包和未证明必要的 sidecar 默认 deny；原始用户路径只保存在受限本机 provenance 中，对日志、issue 和测试证据做脱敏。任何新 allowlist 项都必须有真实 App 文件访问或 same-profile round-trip 证据。

Envelope 属于私有本机项目数据：使用操作系统保护的项目密钥加密静态 payload，只允许在所属项目打开时访问。删除项目或导入源时必须同步删除 Envelope，并提供显式清除操作。默认不将 Envelope 字节和 provenance 放入媒体导出、云同步、备份、诊断、遥测或支持包；只有用户单独知情确认时，才能导出脱敏的兼容性证据包。

密钥契约必须在首个保存 Envelope 的实现前确定：main process 负责调用系统 keychain/credential vault 包装 project data key；renderer 只能通过窄 IPC 请求加解密，不得持久化明文 key。契约需覆盖 key version、轮换、项目删除、系统凭据不可用、跨机器迁移和用户显式导出。无法取得系统保护密钥时，允许无 Envelope 的明确降级导入或阻止 round-trip，禁止静默明文落盘。

### 脏域

建议至少区分：

```text
timing
geometry
style
resource
linkage
structure
metadata
```

例如只改片段名称不应破坏未知滤镜参数；删除片段则必须删除其所有 opaque companion references；改变复合片段结构时，无法证明安全的未知 child timeline 字段必须 blocked。

### 写回策略

1. 未修改且同 profile：尽量 patch 已知字段，保留未消费 subtree。
2. 已修改但 ownership 不冲突：重建已知域，保留其他域。
3. ownership 冲突：要求 downgrade 或阻止写出。
4. 跨 profile：opaque 数据默认不可移植，除非有显式 mapper。

禁止对整个 JSON 做“解析后 stringify”并声称无损。键顺序和空白不是核心，但未知值、引用、ID 和材料所有权必须保持。

### Round-trip 测试

- raw → interop → same-profile raw，验证 unknown sentinel 和引用图；
- JianYing → QCut → JianYing，验证支持域语义等价；
- QCut → JianYing → QCut，验证 QCut 支持域不漂移；
- 在 QCut 修改单一 dirty domain，确认无关 unknown subtree 保留；
- 在剪映打开、保存、关闭后重新导入，确认 profile 和 binding 仍可恢复。

## 7. 大工程性能、缓存与崩溃恢复

### 目标规模

第一轮性能预算使用可重复 synthetic fixture：

| 指标 | 基线目标 |
| --- | ---: |
| timeline | 10 |
| tracks | 200 |
| segments | 10,000 |
| material refs | 100,000 |
| media files | 5,000 |
| source bytes | 100 GB |
| inspect 峰值内存 | 小于 1 GB |

这些是工程预算，不是当前承诺。每个 profile 可以设置更低的安全上限，但必须明确报错，不能卡死 renderer。

### 性能策略

- 文件清单和素材 hash 使用 bounded concurrency；
- 大素材流式 hash/copy，不读入完整内存；
- JSON 首版允许限大小整体 parse，超过阈值明确 blocked；后续再引入 streaming parser；
- 引用图使用 `Map`/`Set` 单次索引，禁止在 segment loop 中反复全表搜索；
- preview proxy、thumbnail、waveform、font coverage 和 resource package inspection 都使用内容寻址 cache；
- cache key 包含 source hash、profile、mapper version、toolchain 和渲染设置；
- 导入 plan 可序列化，重开应用后可恢复。

### Journal 与 checkpoint

```text
DISCOVERED
SNAPSHOT_VERIFIED
PROFILE_LOCKED
PARSED
ASSETS_STAGED
PROJECT_WRITTEN
PROJECT_VERIFIED
PUBLISHED
```

每个 checkpoint 记录输入哈希、输出清单和可逆动作。启动时扫描未完成 journal：

- 来源未变且 staging 完整：允许 resume；
- 来源变化：作废 plan 并清理 staging；
- 项目已写但未 publish：重新验证后 publish 或 rollback；
- publish 完成：journal 标记 complete，清理临时文件。

### 原子性

现有 `storageService` 分散保存 project、timeline、media 和 OPFS。正式 importer 不应边解析边调用这些公开方法，也不能由 Node package 直接操作浏览器存储。需要在 renderer 新增批量 staging transaction，先写隔离 namespace，再通过一个 registry commit 暴露项目。Node runtime 只生成和验证 bundle；Electron bridge 负责传输和背压，不拥有持久化语义。

### 崩溃测试

在每个 checkpoint 后注入进程退出，重新启动后验证：

- 现有项目不变；
- 没有可见半成品项目；
- staging 可恢复或可安全删除；
- 重试不会复制同一素材或产生不同 ID；
- 日志不包含原始敏感路径之外不必要的信息。

## 8. 研究门禁与未决证据

这份方案中的模块边界和事务设计可以直接作为 QCut 架构决策；剪映 profile、文件所有权、跨文件引用和渲染语义则不能仅凭字段名或静态字符串实现。相关研究统一遵循 [`jianying-draft-binary-reference`](../../../.agents/skills/qcut-toolkit/jianying-draft-binary-reference/SKILL.md) 的证据分级和安全边界。

### 未决问题

| ID | 不确定项 | 当前风险 | 首选证据 | 实现门禁 |
| --- | --- | --- | --- | --- |
| JYR-001 | 保存事务的文件集合、写入顺序、临时文件和 rename 边界 | snapshot 可能组合出从未真实存在过的跨文件状态 | disposable project 上执行单次 open/edit/save/close，并用文件系统 trace 记录 PID、路径类别和操作顺序 | 未确认前，import plan 不得把活动工程目录视为一致快照 |
| JYR-002 | JianYing 11.x opaque/encrypted `draft_info.json` envelope | 将不透明载荷误判成 JSON、损坏或可写格式 | payload 分类、已存在明文 backup/subdraft、静态 owner 证据；不绕过加密 | 未有合法稳定协议前只允许 inspect，parse/write 均 blocked |
| JYR-003 | profile detection 中哪些版本字段和 sidecar 是权威证据 | 误选 writer 会生成可打开但不可继续编辑的草稿 | 多版本真实样本 corpus + App metadata + schema/key-set 对照；静态版本 gate 仅作佐证 | detection ambiguous 时禁止 `auto` commit |
| JYR-004 | synthetic plaintext 5.9 与真实剪映 5.9 的等价范围 | synthetic round-trip 被误报为产品兼容 | 对应版本真实 App first-open/save/reopen/export 收据 | 无真实 App 收据时不得标 stable |
| JYR-005 | unknown subtree 与其他文件、索引、checksum、material registry 的所有权关系 | patch 单个 JSON 节点后跨文件引用失配 | 明文 unknown sentinel 单变量实验 + 真实 App save 后语义 diff；必要时追踪 validator/deserializer owner | 未确认 ownership 的 dirty domain 必须 blocked |
| JYR-006 | ForeignDraftEnvelope 真正需要保留的 sidecar allowlist | 复制 key store、隐私路径、无关 backup 或专有缓存 | 文件访问 trace + same-profile round-trip 删除实验 + 敏感性审计 | deny-by-default；无证据文件不得进入 envelope |
| JYR-007 | parent draft、subdraft、compound timeline 的 ID binding、版本和保存职责 | 复合片段可读但子时间线修改后无法可靠写回 | 创建/进入/修改/退出一个复合片段，比较明文 parent/subdraft/backup；必要时追踪 `sub_draft_async_load` 路径 | 未确认前 compound 只允许 opaque 保留或 blocked |
| JYR-008 | resource ID、package metadata、MD5/hash 和缓存数据库的 resolver 优先级 | 自动重定位到同名或同 ID 的错误资源 | 本地 catalog/cache 只读关联 + 缺资源/relink 黑盒实验 + 包 hash | 无精确证据的私有资源保持 `opaque`，不得 basename 猜测 |

### 证据选择

- **优先明文数据 diff：** 时间单位、ID/ref 图、轨道顺序、字段 ownership 候选、backup/subdraft 结构。
- **优先真实 App 黑盒：** 插入/删除/波纹/替换/转场行为，缺素材 relink，字体 fallback，save/reopen/export 和逐帧/音频 oracle。
- **使用二进制静态研究：** 确认哪个 dylib 暴露明确的 draft、subdraft、profile、validator 或 key-store ownership 字符串和符号。静态命中只能达到 `static-strong`，不能证明运行时调用。
- **使用运行时文件追踪：** 只有在精确文件所有权或保存事务顺序会改变 importer 安全性时使用；必须是 disposable project、单变量 UI 操作，并记录 App 版本、PID、时间和路径类别。

### 二进制调用边界

正常启动真实剪映并把它作为行为和导出 oracle；不要把 QCut importer 建在私有 dylib ABI 上，也不要直接调用 `libvideoeditor.dylib`、`libVECreator.dylib` 或 crypto 私有函数。禁止 patch、inject、绕过加密、读取或复制 key store。库被链接或加载只证明它可用，只有受控 file-access/call trace 才能证明它参与了某次操作。

### 首轮研究顺序

1. **JYR-001 保存事务：** 空工程与单片段工程各做一次 open/edit/save/close，确定一致 snapshot 的文件边界。
2. **JYR-007 subdraft：** 单一复合片段前后对比 parent、subdraft 和 backup，确认 binding 与版本传播。
3. **JYR-005 unknown sentinel：** 在受控明文 fixture 中保留未知节点，经真实 App save 后检查字段、引用和 cross-file 派生数据。
4. **JYR-003 profile corpus：** 对每个候选版本生成最小工程，冻结 App/schema/file-layout/key-set 指纹和真实收据。
5. **JYR-008 resource relink：** 对字体、LUT、原生转场和一个私有资源分别执行存在、移动、缺失和用户 relink 矩阵。

每次研究输出必须标记 `runtime-observed | static-strong | architecture-only | unresolved`，记录替代解释和下一步检查。只有 `runtime-observed` 或由明文结构与真实 App round-trip 双重支持的结论，才能进入 stable profile 的可写契约。

## 分阶段实施

| 阶段 | 可独立验收的交付 | 主要依赖 | 粗略工期 |
| --- | --- | --- | ---: |
| 0 | JYR-001/JYR-003 首轮证据、Interop model、capability/issues、provenance、dirty domains、ForeignEnvelope schema、profile registry | 时间线命令语义基础 | 1–2 周 |
| 1 | Synthetic fixture 与 CapCut 8.1 候选的只读 inspect/parse/semantic plan；plan artifact 可持久化但不能 commit | Phase 0 | 2–3 周 |
| 2 | Resource resolver、QCutImportBundle、renderer staging transaction、最小 journal/rollback/recovery、Electron/CLI transport | Phase 1 | 3–4 周 |
| 3 | CapCut 8.1 声明子集的生产 import，QCut reload 和真实 App/source 不变证据 | Phase 2、对应 profile research gates | 2–3 周 |
| 4 | CapCut 8.1 same-profile writeback、unknown preservation、真实 App save/reopen/native-export 和 semantic/frame/audio 门禁 | Phase 3、JYR-005/JYR-006 | 3–5 周 |
| 5 | 文字、调色、蒙版、keyframe、transition mapper；每类功能独立 capability 和收据 | Phase 4 | 4–8 周 |
| 6 | 10k segment、100 GB 素材、缓存指标、完整 fault injection、恢复和跨版本迁移加固 | Phase 2–5 | 2–4 周 |

单人串行大约 4–6 个月；两名熟悉 QCut 和媒体格式的工程师可并行到约 2.5–4 个月。Phase 2 之后的每个阶段都必须保持前一阶段可发布，不允许以“后续再加 journal/unknown preservation”为理由交付不安全的可写路径。估算不包含破解新版本加密格式；没有合法、稳定证据时该 profile 应保持 read-only 或 blocked。

## Subtask 与文件路径

| ID | Subtask 与主要文件 | 依赖/研究门禁 | 完成条件与验证 |
| --- | --- | --- | --- |
| JYI-000 | Evidence corpus：`scripts/capcut-e2e/fixtures/`、私有本机 evidence manifest | JYR-001、JYR-003 | sanitized fixture 可提交；真实 App 证据只记录版本、哈希和脱敏收据 |
| JYI-001 | Interop/capability：`packages/editor-core/src/draft-interop/{document,capability,issues}.ts` | 时间线命令语义 | schema round-trip、四态聚合和 unknown issue code 单测 |
| JYI-002 | Provenance/envelope：`draft-interop/{provenance,dirty-domains,foreign-envelope}.ts` | JYR-005、JYR-006 的 deny-by-default 契约 | ownership/dirty-domain 矩阵、敏感字段序列化拒绝测试 |
| JYI-003 | Profile registry/detection：`jianying-draft/profiles/*`、`import/profile-detection.ts` | JYI-000、JYI-001 | exact/ambiguous/unsupported/encrypted fixtures；ambiguous 禁止写 |
| JYI-004 | Raw graph parser：`import/{raw-types,graph-reader,validation}.ts` | JYI-001、JYI-003 | malformed、重复 ID、悬空 ref、循环和时间边界测试 |
| JYI-005 | Normalizer：`import/{normalize,qcut-mapping}.ts` | JYI-002–004 | synthetic 5.9 与 CapCut 8.1 sanitized fixture 的 deterministic semantic snapshots |
| JYI-006 | Snapshot runtime：`packages/jianying-draft-import/src/{discovery,snapshot-reader,runtime-validation}.ts` | JYR-001 | symlink、TOCTOU、大小限制、活动来源变化和 bounded read 测试 |
| JYI-007 | Plan artifact：`import-plan-artifact.ts`、私有 plan store | JYI-003–006 | TTL、build/schema mismatch、CAS consume、重放/并发和日志脱敏测试 |
| JYI-008 | Asset resolver：`asset-resolver.ts` | JYI-006、JYR-008 | hash 优先级、同名冲突、missing/relink、许可动作和 bounded concurrency 测试 |
| JYI-009 | Import bundle：`draft-interop/import-bundle.ts`、`qcut-import-bundle-builder.ts`、package exports、workspace manifest/lockfile | JYI-005、JYI-007–008 | 单一共享 schema、bundle runtime validation、digest、确定性内部 ID 和 conflict policy 测试 |
| JYI-010 | Renderer storage transaction：`apps/web/src/lib/storage/{import-staging-adapter,import-journal,import-recovery}.ts`、`apps/web/src/lib/jianying-draft/qcut-import-transaction.ts` | JYI-009 | IndexedDB/OPFS staging、重新读取验证、单一 publish、rollback 和 reload 测试 |
| JYI-011 | Envelope key service：Electron keychain IPC、renderer envelope adapter | JYI-002、JYI-010 | key unavailable/rotation/delete/purge 测试；明文 Envelope 不落盘 |
| JYI-012 | Electron/CLI transport：import contract/handler/inbox、现有 `command-registry-editor-jianying.ts` 和 `cli-handlers-editor.ts` | JYI-007、JYI-009–011 | live bridge 与 offline inbox 使用同一 bundle validator；无第二套 persistence |
| JYI-013 | Import UI：`use-jianying-draft-import.ts`、import dialog card | JYI-012 | profile/issues/resource/conflict/warning/recovery 状态组件测试 |
| JYI-014 | CapCut 8.1 production import | JYI-000–013、该 profile 的 JYR gates | 声明 exact 子集可导入、reload；来源草稿 hash 不变；真实 App/source 收据 |
| JYI-015 | Same-profile writer/unknown patch | JYI-014、JYR-005–007 | unknown sentinel、dirty-domain isolation、open/save/reopen semantic diff |
| JYI-016 | Feature mapper registry | JYI-015 | text/color/mask/keyframe/transition 每类独立 mapper、capability 和 profile tests |
| JYI-017 | Semantic/frame/audio E2E：`scripts/capcut-e2e/{semantic-diff,audio-comparison,roundtrip-case}.ts` | JYI-014–016 | 四路输出、profile 阈值和 hash-bound evidence manifest |
| JYI-018 | Scale/recovery hardening：benchmarks、fault injection、cache metrics | JYI-010、JYI-017 | parser/mapping/persistence/renderer 分项预算，全部 checkpoint 崩溃恢复 |

每个 subtask 默认独立 PR 或独立原子 commit 组，不要求把一个完整 subtask 压成单文件 commit。共享 schema 与首个使用者、package manifest 与 lockfile、实现与不可分测试可以组成最小多文件提交；不得把尚未通过门禁的 profile writer 与基础模型混在同一提交。

## 测试矩阵

每个正式 profile 至少覆盖：

- malformed、超大、路径穿越、symlink、TOCTOU 和文件变化；
- 重复 ID、悬空 material refs、循环子时间线和非法时间范围；
- 缺素材、同名多候选、hash 不同、字体缺字和 package 缺失；
- exact/downgrade/opaque/blocked 四态；
- import plan 过期、warning 未接受和 commit 重放；
- QCut 持久化 reload；
- same-profile structural round-trip；
- 真实剪映/CapCut first-open、save、reopen、native export；
- 逐帧/音频比较；
- 大工程和每 checkpoint 崩溃恢复。

## 发布门禁

功能不能只靠 feature flag 上线。每个 profile 达到以下条件后才可标为 stable：

1. profile detection 无 ambiguous fixture；
2. 所有 blocked feature 都有稳定 issue code；
3. unknown sentinel round-trip 通过；
4. 真实 App first-open/save/reopen 通过；
5. 支持 feature 的视觉/音频阈值通过；
6. 非当前用户草稿 hash 保持不变；
7. fault injection 后无半成品项目；
8. 专有资源扫描确认没有进入 Git、安装包或测试 artifact。
9. JYR-001、JYR-003、JYR-005 和该 profile 涉及的其他研究门禁已有可复现证据，不依赖未验证的私有 ABI 或加密假设。

## 明确不做

- 不破解或绕过加密、DRM、签名和付费资源授权。
- 不直接调用、patch 或注入剪映私有 dylib API，也不把私有 ABI 作为产品运行时依赖。
- 不提交剪映二进制、缓存资源、字体或反编译产物。
- 不为未知版本猜测可写输出。
- 不承诺 JSON 字节级相同；承诺声明范围内的语义等价和未消费 unknown domain 保留。
- 不在 importer 中复制 QCut 时间线编辑规则；导入后继续使用共享 command 层。

## 完成定义

基础双向支持完成需要：至少一个经过真实 App 验证的生产 profile 可导入并 same-profile writeback；另一个 profile 至少达到稳定 inspect/import 或明确保持 read-only；生产 importer 使用可恢复的 renderer 原子事务、内容寻址资源重定位、加密 ForeignDraftEnvelope 和共享 CLI/UI plan/commit；真实 App save/reopen/native-export、结构 diff、逐帧和音频验证均有 hash-bound 收据。任何非无损功能都必须显式显示为 `downgrade`、`opaque` 或 `blocked`，不得静默丢弃。

“两个 stable profile”是后续跨 profile 兼容里程碑，不阻止一个真实 profile 的安全导入能力先独立发布。
