# 剪映与 QCut 双向草稿兼容具体实现方案

<!-- markdownlint-disable MD013 -->

**状态：** 实施设计，尚未全部实现  
**日期：** 2026-08-04  
**最后核验代码：** `c1f1a6075`

**依赖文档：** [剪映时间线轨道规则核验](./timeline-track-rules.zh.md)、[QCut 时间线规则差距与修复计划](./qcut-timeline-rule-gap-analysis.zh.md)

## 实施进度

| Subtask | 状态 | 完成日期 | 说明 |
| --- | --- | --- | --- |
| JYI-001 Interop/capability/issues | ✅ 已完成 | 2026-08-04 | `packages/editor-core/src/draft-interop/{document,capability,issues}.ts` + `index.ts` 子路径导出；`DraftInteropDocumentV1`（整数微秒时基、fail-closed 验证 parser、精确 JSON-pointer 错误路径）、四态 capability（最严者胜的 combine/aggregate + 提交门控表逐行实现）、24 个稳定 issue code + 与 exporter 同构的 fingerprint（`\u001f` 分隔、message 不参与）。测试 [`draft-interop-document.test.ts`](../../../packages/editor-core/src/__tests__/draft-interop-document.test.ts)（11 用例：round-trip、嵌套路径、未知 code 拒绝、聚合、门控矩阵、fingerprint 稳定性） |
| JYI-002 Provenance/dirty-domains/envelope | ✅ 已完成 | 2026-08-04 | `draft-interop/{provenance,dirty-domains,foreign-envelope}.ts`。七类脏域 + `evaluateUnknownSubtree`（preserve/drop/conflict：owner 删除→drop、structure 或 owned 域被改→conflict，绝不静默保留或丢弃）；provenance 带 RESTRICTED `restrictedSourcePaths`，`redactProvenanceForEvidence` 为唯一出口序列化（结构性剔除 + bindings 折叠为计数），`assertNoRestrictedProvenanceFields` 深度遍历 fail-closed；envelope schema 仅存元数据（字节走 `payloadRef` 加密引用，JYI-011），sidecar 准入 deny-by-default：硬拒绝（key store/.locked/logs/caches）压过 allowlist,路径穿越直接拒。设计决策：envelope 与 document 经 importId 关联而非内嵌（inspect-only 文档无 envelope；加密 payload 契约禁止内联字节）。测试 [`draft-interop-envelope.test.ts`](../../../packages/editor-core/src/__tests__/draft-interop-envelope.test.ts)（26 用例：所有权矩阵 10 例、准入 11 例、持久化拒绝、脱敏序列化） |
| JYI-003 Profile registry/detection | ✅ 已完成 | 2026-08-04 | `jianying-draft/profiles/{registry,plaintext-5-9,capcut-8-1,index}.ts` + `import/profile-detection.ts`。Profile 契约五能力分级（none/fixture/candidate/stable + realAppVerified），`isDraftProfileWritable` 仅认 stable——两个已注册 profile（synthetic 5.9 = fixture 级非生产、CapCut 8.1 = 首个生产候选）当前均不可写；detection 用四路独立信号（app metadata、schema/new_version、top-level key 包含、文件布局+明文分类），5.9 键集是 8.1 子集使"仅键集"天然歧义——缺 app metadata 即 ambiguous 且禁止写；加密 content 为终态（JYR-002）；纯文件名不作判据。jianying-11 按计划未注册（无证据不入册）。测试 [`profile-detection.test.ts`](../../../packages/editor-core/src/__tests__/profile-detection.test.ts)（8 用例:exact×2/ambiguous/unsupported/encrypted/仅文件名/注册表约束×2） |
| JYI-004 Raw graph parser | ✅ 已完成 | 2026-08-04 | `jianying-draft/import/{raw-types,graph-reader,validation}.ts`。raw-types 只声明 reader 需要的最小字段（不宣称全覆盖，未知字段保持 unknown 流向 envelope）；graph-reader 单遍索引 tracks/segments/材料桶 + 每节点 JSON pointer，畸形子树跳过并记 `DOCUMENT_MALFORMED`（绝不 throw）；validation 产出稳定 issue 码——`REF_DUPLICATE_ID`（跨 track/segment/material 全局）、`REF_BROKEN`（悬空 material_id/extra_material_refs）、`TIME_RANGE_INVALID`（负值/零时长/非整数微秒）、`TRACK_OVERLAP`（同轨 target 半开区间重叠，复用 QTL-002 `rangesOverlap`）、`REF_CYCLE`（`detectDraftReferenceCycles` 对调用方提供的 draft 引用边做 DFS，每环仅报一次——真实 compound 子草稿绑定 gated on JYR-007，故边提取暂由调用方负责）。JYI-000 fixture 以自产替代：`buildJianyingDraft` 产物 JSON round-trip 后直接喂 parser，零 read issue、零 validation issue（writer↔reader 自洽）。测试 [`raw-draft-graph.test.ts`](../../../packages/editor-core/src/__tests__/raw-draft-graph.test.ts)（12 用例:builder 自洽/索引/malformed 指针/重复 ID/悬空 ref/时间边界×3/重叠+邻接/环×3） |
| JYI-005 Normalizer | ✅ 已完成 | 2026-08-04 | `jianying-draft/import/{normalize,qcut-mapping}.ts`。normalize：raw graph → `DraftInteropDocumentV1`，确定性（无时钟/随机，语义 ID 复用 raw ID），逐节点诚实 capability——核心媒体子集 exact；证据支持的 CapCut 8.1 静态单样式文字由 JYI-016 mapper 标为 downgrade；sticker、动态/多样式文字及未映射转场明确 downgrade/blocked；未知桶/未知轨道类型 opaque（`FEATURE_OPAQUE`）；悬空引用与缺失 target_timerange blocked。extra_material_refs 三分类：机械伴随桶（speeds/canvases 等）不降级、可映射桶（transitions/animations/fades）降为 downgrade、未知桶 opaque。原始媒体路径 RESTRICTED——绝不进 document，经 `restrictedSourcePathsByResourceId` 侧通道返回仅供 provenance；每个语义节点产出 RawNodeBinding。资源自 videos/audios 桶提取（含 durationUs，status=pending 待 JYI-008 解析）。qcut-mapping：document → `QCutImportTimelinePlanV1`（纯数据、秒单位），映射 exact 的 video/image/audio 与显式接受 warning 后可提交的静态文字 downgrade 子集，其余全部进 `skipped`（附 capability 与原因）不静默丢弃。验收达成：5.9 与 CapCut 8.1 fixture 双 deterministic semantic snapshot（`__snapshots__/raw-draft-normalize.test.ts.snap`，无路径泄漏），normalize 输出可无损过 `parseDraftInteropDocumentV1`。测试 [`raw-draft-normalize.test.ts`](../../../packages/editor-core/src/__tests__/raw-draft-normalize.test.ts)（11 用例） |
| JYI-006 Snapshot runtime | ✅ 已完成 | 2026-08-04 | 新包 `packages/jianying-draft-import`（仅 main process/CLI 可用，零写入），已接入 workspaces/vitest/check-types。`discovery.ts`：realpath 根 + 逐条目 lstat，符号链接一律跳过（symlink 内容文件不成为候选）、denied 目录（logs/caches/回收站）不扫、深度≤2、条目≤4096，绝对路径不进 manifest；`snapshot-reader.ts`：O_NOFOLLOW 打开、读前按 BigIntStats 尺寸拒超限（单文件 64MiB/总预算 256MiB 默认）、边读边哈希、读后重新 fstat 对比 dev/ino/size/mtimeNs——中途被换即 `SOURCE_FILE_CHANGED`；分类含 NUL 启发式（content 二进制→encrypted 终态）；`verifyDraftSourceUnchanged` 为 plan/commit 前的活动来源门禁（改动→CHANGED、消失→MISSING）；`runtime-validation.ts`：IPC/CLI 白名单 fail-closed（未知键/相对路径/`..`/NUL/超限数值全拒）。验收测试全过：symlink（目录环+内容文件+绕过 discovery 直读）、TOCTOU/活动来源变化、单文件+总量大小限制、bounded read、输入白名单。测试 [`snapshot-runtime.test.ts`](../../../packages/jianying-draft-import/src/__tests__/snapshot-runtime.test.ts)（15 用例）。注：真实 JianYing 目录布局假设仍属 JYR-001 证据范围 |
| JYI-007 Plan artifact + store | ✅ 已完成 | 2026-08-04 | `jianying-draft-import/src/{import-plan-artifact,import-plan-store}.ts`，镜像 exporter `TrustedJianyingDraftExportSessionCore` 契约。Artifact（V1，可持久化）：随机 32B token、TTL（默认 5min/上限 24h）、buildIdentity（appVersion+interop schemaVersion）绑定、requestFingerprint（源身份 dev/ino/size/mtimeNs + sha256 + profile + build 的哈希）、issueSetFingerprint（severity+`\u001e` 分隔、`\u001d` join，与 exporter 同构）、warning/blocker 指纹分离、`canCommit = exact 且零 blocker`；RESTRICTED 拆分——绝对根路径独立于 loggable 字段，`redactImportPlanArtifactForLog` 结构性删除（非置空），是日志/CLI/evidence 唯一合法形态；时钟为参数注入，artifact 完全确定性。Store（私有、仅 main process）：CAS consume 单次成功、重放与并发一律 `ImportPlanConsumedError`、过期即删不可复活、build/schema mismatch fail-closed 拒绝并清除、容量有界（先逐出 consumed，满员活 plan 拒绝新入而非静默逐出）、token 重复拒绝。测试 [`import-plan.test.ts`](../../../packages/jianying-draft-import/src/__tests__/import-plan.test.ts)（11 用例:指纹分离/确定性/TTL 越界/日志脱敏/expiry+build+schema mismatch/CAS/并发三连争抢/TTL 过期删除/跨 build 拒绝/容量策略/重复 token） |
| JYI-009 Import bundle | ✅ 已完成 | 2026-08-04 | `editor-core/draft-interop/import-bundle.ts`（共享 schema，纯数据无 node 依赖）+ `jianying-draft-import/qcut-import-bundle-builder.ts`。单一共享 schema：`QCutImportBundleV1` 打包 document + timelinePlan + resourceStaging + `internalIdBySemanticId`，live bridge 与 offline inbox 都必须过同一个 `parseQCutImportBundleV1`（fail-closed 结构校验 + 交叉引用校验：staging 只许引用 document 声明的资源、plan 节点必须有确定性内部 ID、媒体元素必须引用已 staging 资源、文字元素不得伪装成媒体、轨道与元素类型必须一致、timelinePlan 必须等于 document 的确定性投影、stagingKey 不得形似路径/含穿越/NUL）。Digest：editor-core 定义规范序列化（递归键排序 + digest 字段占位归零），runtime 用 node:crypto 计算/验证——结构合法但内容被篡改的 bundle 能过 parse 但 digest 必然失配（有测试）。确定性内部 ID：`deriveImportInternalId` 以 requestFingerprint 为种子（纯 TS，复用 `createDeterministicJianyingId`），同源重 plan 不同 token 下 ID 完全一致。Conflict policy：`projectName: rename|fail`（默认 rename），未知策略拒绝。builder 自检：产出前跑与 renderer 相同的 parser。测试 [`import-bundle.test.ts`](../../../packages/jianying-draft-import/src/__tests__/import-bundle.test.ts)（13 用例，fixture 走 builder→normalize→plan→artifact→bundle 全链路） |
| JYI-008 Asset resolver | ✅ 已完成 | 2026-08-04 | `jianying-draft-import/src/asset-resolver.ts`。五态输出：resolved / relink-required / missing / ambiguous / license-restricted。哈希证据永远压过声明路径：声明路径哈希失配绝不静默采用——先记 warning 再落入 name search，同名候选中恰有一个哈希匹配才 resolved（method=hash-search）；无期望哈希时唯一同名候选可 resolved（name-search），多候选= ambiguous（`RESOURCE_AMBIGUOUS` error）；失配且无替代 = relink-required（需用户决策）。许可动作：originHint 为 app-resource/package 的资源零探测零拷贝，直接 license-restricted（`RESOURCE_LICENSE_RESTRICTED`，JYR-008 gate fail-closed）。所有探测有界：O_NOFOLLOW、单文件哈希上限 4GiB、name search 深度≤2/条目≤4096/拒 symlink、固定 worker pool（默认 4/上限 8，injectable instrumentation 验证峰值）。解析出的绝对路径为 RESTRICTED 输出（仅 provenance）。测试 [`asset-resolver.test.ts`](../../../packages/jianying-draft-import/src/__tests__/asset-resolver.test.ts)（10 用例:声明路径哈希匹配/哈希压过失配路径/relink/同名歧义/唯一名候选/missing/许可零探测/拒 symlink 候选/并发峰值+顺序保持/池上限校验） |
| JYI-010 Renderer storage transaction | ✅ 已完成 | 2026-08-05 | `apps/web/src/lib/storage/{import-journal,import-staging-adapter,import-recovery}.ts`、`lib/jianying-draft/qcut-import-transaction.ts` 与共享 `editor-core/draft-interop/{qcut-import-state,qcut-import-verification}.ts`。Journal：任何项目数据写入前先落 intent 记录（Electron→IndexedDB→localStorage 探测链，可注入 adapter 测试），phase staging→published，publish 验证后才删除。Staging session：媒体字节与 timeline 写在"无 project 记录指向"的新 id 下，`publishProject` 是唯一可见化步骤；落盘后重新读取全部媒体 `File` 和 scene timeline，按 bundle 重新计算确定性期望状态，对媒体 ID/type/byteLength/SHA-256 及完整 track/element/transition 做精确比较，任何 duplicate/missing/unexpected/mismatch 都 fail-closed 并回滚。项目 publish 后还会重读并核对 id/name/scene/canvas/FPS/draftInterop，再清 journal。共享 state builder 替代原 Web 专用 `qcut-import-element-builder.ts`，确保 renderer 与 E2E 使用同一投影。Recovery 仍按 staging/published 状态清理或补完。测试 [`qcut-import-verification.test.ts`](../../../packages/editor-core/src/__tests__/qcut-import-verification.test.ts) 6 用例及 [`import-transaction.test.ts`](../../../apps/web/src/lib/storage/__tests__/import-transaction.test.ts) 22 用例，覆盖媒体、timeline、project readback 损坏和全量 rollback。 |
| JYI-011 Envelope key service | ✅ 已完成 | 2026-08-04 | `electron/jianying-envelope-key-{contract,handler}.ts` + preload/main.ts/双侧类型接线 + renderer adapter [`envelope-key-adapter.ts`](../../../apps/web/src/lib/jianying-draft/envelope-key-adapter.ts)。密钥架构：每个 envelope 随机 32B data key → AES-256-GCM 加密 payload（iv‖authTag‖ciphertext 落 `userData/jianying-import/envelopes/<importId>.bin`，目录 0o700/文件 0o600）→ data key 经 safeStorage（OS keychain）包裹后 base64 存 key store（0o600）。**明文绝不落盘**：keychain 不可用即 `keychain-unavailable` fail-closed（不同于 api-keys 的明文降级），零字节写入。六通道（store/read/delete/purge/rotate/status）全部 `assertTrustedMainFrame`（iframe/非主窗口拒绝）、importId 白名单 `[A-Za-z0-9_-]{1,128}`（路径穿越不可能）、payload 上限 256MiB、IPC 永不 throw（有界 ErrorDto）。GCM 认证失败 = `envelope-corrupt`；rotation 全量重包裹并 bump keyVersion，解不开的条目连文件一起丢弃（fail-closed 不盲带）。renderer adapter 桥缺失时返回类型化 `bridge-unavailable`，renderer 永远接触不到密钥材料。测试 [`jianying-envelope-key-handler.test.ts`](../../../electron/__tests__/jianying-envelope-key-handler.test.ts)（11 用例:round-trip+磁盘无明文/keychain 不可用零写入/not-found+非法 id/GCM 篡改检测/六通道信任边界/单删/purge/rotation 成功/rotation 丢弃损坏项/status/dispose） |
| JYI-012 Electron/CLI transport | ✅ 已完成 | 2026-08-04 | `jianying-draft-import/src/{import-session,persistent-import-plan-store,desktop-import-inbox}.ts` + `electron/jianying-draft-import-{contract,handler}.ts` + preload/双侧类型/CLI 接线。Plan store 使用私有目录 0700、文件 0600、O_NOFOLLOW 读取和 fsync+rename 原子发布；持久 JSON 先经严格 artifact parser，损坏/build mismatch/过期均 fail-closed。Session 重启后不持久化第二份大 session：从 RESTRICTED root 重读来源、重跑 profile/normalize/asset resolution，以 request/issue/warning/blocker fingerprints 验证一致后重建同一 bundle，再 CAS consume；错误 warning 不提前消费 token。Live IPC 六通道覆盖 inspect/plan/commit 与 inbox list/read/ack，全部只接受 trusted main frame；CLI inspect/plan/commit 共用 bundled runtime，plan 跨进程持久化，commit 将共享 parser+digest 验证后的 bundle 和独立媒体文件原子排入 desktop inbox。Inbox 只在 renderer transaction 成功后显式 ack 删除，篡改 bundle/media、symlink、路径穿越和重复 entry 均拒绝。定向测试 81 个通过；全仓 `check-types` 与 Electron/import-runtime bundle build 通过。 |
| JYI-013 Import UI | ✅ 已完成 | 2026-08-04 | Projects 页新增桌面端草稿导入入口，由 `use-jianying-draft-import.ts` 与 `jianying-draft-import-card.tsx` 驱动。可信目录选择器执行 inspect → plan → 显式接受 warning → renderer transaction；弹窗展示 profile 识别、语义计数、issues、资源状态、rename 冲突策略、进度与错误。桌面队列严格按 read → renderer publish → ack 执行：事务失败保留 inbox；ack 失败仅提供 ack-only 恢复；重启后重试会复用按源 hash 派生的已发布项目，不会再造 rename 副本。hook 挂载时执行 JYI-010 journal recovery，并显示 rollback/finalize 数量。Projects 页已接中英文文案。30 个定向测试覆盖 bridge 信任边界、payload 解码、事务/ack 顺序、重试幂等、hook 门禁、UI 状态和恢复；Playwright 已检查桌面与 390px 宽度，无重叠或横向溢出。 |
| JYI-014 CapCut 8.1 production import | ✅ 已完成 | 2026-08-05 | 核心 video/audio 子集现在同时具备原始真实 App 收据和可信持久化状态复验。复验首先发现一个跨层缺陷：资源探测已返回 `resolved`，但语义文档与 bundle 仍携带 normalizer 初始的 `pending`，因此 renderer 正确地把已暂存媒体/轨道判成 unexpected 并回滚。现在 `resolveImportAssets` 会把每项解析结果写回语义资源，并把 resolved SHA-256/byteLength 绑定到 plan 与 bundle；session 回归测试覆盖这条 pending→resolved 路径。随后对真实 CapCut 8.1.1 来源重新执行：25 个文件精确识别，2 轨/2 片段/2 资源全部 resolved，零 issue；两份媒体 payload 经 desktop inbox 导入运行中的 QCut，项目数 88→89，时间线为 8 秒 Video/Audio 双轨。可信 renderer capture 对持久化 project/timeline/media 双读、流式哈希，并通过 schema-2 import gate：所有 binding、名称/FPS/画布、媒体和轨道检查均为 true，零 issue。证据：[`capcut-8.1.1-core-media-import-2026-08-04.json`](../../../scripts/capcut-e2e/receipts/capcut-8.1.1-core-media-import-2026-08-04.json)、[`capcut-8.1.1-qcut-import-snapshot-2026-08-05.json`](../../../scripts/capcut-e2e/receipts/capcut-8.1.1-qcut-import-snapshot-2026-08-05.json) 和 [`capcut-8.1.1-qcut-import-verification-2026-08-05.json`](../../../scripts/capcut-e2e/receipts/capcut-8.1.1-qcut-import-verification-2026-08-05.json)。Profile 仍只将 `import` 升为 stable/production；native export、逐帧/音频和 same-profile writeback 尚未验证，`realAppVerified` 仍为 false。 |
| JYI-015 同版本 envelope/写回 | 🟨 部分完成 | 2026-08-05 | 导入项目会持久化版本化来源绑定、规范化 `DraftInteropDocumentV1` 基线与可选 `ForeignDraftEnvelope` 元数据；原始字节仍只存在 OS keychain 包装的加密 payload 中。由真实 CapCut 8.1.1 保存并受收据约束的草稿（实测 `new_version: 179.0.0`）从 25 个发现文件中只捕获 `draft_info.json`：源 14,273B、6 个 bindings、payload 19,115B、零 warning。证据：[`capcut-8.1.1-envelope-capture-2026-08-04.json`](../../../scripts/capcut-e2e/receipts/capcut-8.1.1-envelope-capture-2026-08-04.json)。现有写回链路包含严格 payload/key-version/SHA-256 校验、带旧值前置条件与 unknown ownership 冲突门禁的标量 JSON Pointer patch、核心 video/audio 时间域 planner、保留未知字段的 preparation、renderer orchestration，以及受短期目录选择 token 约束的可信 Electron IPC。planner 只接受专用的无路径时间快照（tracks + playback-aware durations），因此从 IndexedDB 导入的媒体不需要取得仅导出流程才有的文件系统路径。主进程 writer 事务化替换固定 4 个活动 mirror，不触碰 `.bak`，并提供 fsync、独立 rollback 副本、journal 恢复、`.locked`、symlink、TOCTOU 和源 hash 门禁；新增/删除/跨轨移动、换素材和变速均 fail-closed。真实收据绑定的隔离副本验证器注入受控 unknown segment sentinel，走生产 `inspect → plan → commit`，应用 4 个时间叶子，并证明 4 个活动 mirror 哈希一致、2 个 `.bak` 与原始来源未变、raw JSON diff 仅含计划指针、sentinel 保留、recovery 为 `none`。无路径证据：[`capcut-8.1.1-same-profile-writeback-2026-08-05.json`](../../../scripts/capcut-e2e/receipts/capcut-8.1.1-same-profile-writeback-2026-08-05.json)。用户交付链路现已接通：导出弹窗对 CapCut 8.1 导入项目展示写回/恢复状态；严格 wire API 只接受 `projectId` 或不透明 `recoveryToken`，拒绝草稿路径和未知键；utility HTTP → main → 可信 main-frame renderer IPC 会重读持久化 project/timeline，校验 operation/project 关联，并在用户选择目录后再次校验时间线，并发修改会以 `qcut-state-changed` 拒绝。CLI 命令为 `qcut editor interop writeback --project-id <id> --json` 和 `qcut editor interop writeback-recover --recovery-token <token> --json`。聚焦验证已通过 13 个文件的 74 个测试、Web/Electron TypeScript 检查、两个生产构建，以及真实 CLI→utility→main→renderer 阻断路径 smoke test。其 verdict 刻意保持 `unverified`：仍需精确 CapCut 8.1 应用打开、保存并重开写回副本，profile 仍保持 `sameProfileWriteback: none`；CapCut 9.1 不能替代这道门禁。 |
| JYI-016 特性 mapper | 🟨 部分完成 | 2026-08-04 | 已完成两条 fail-closed 导入子链。其一是证据门禁下的 CapCut 8.1 原生 `Dissolve`：仅在精确身份、相邻 seam、正整数时长及两侧片段承载能力均成立时映射为 QCut `dissolve/easeInOut`。其二是静态单样式普通文字候选：仅接受完整 UTF-16 单 style range、有限画布/变换、单位缩放、无翻转、无 keyframe/animation/额外引用，映射文字内容、字体、字号、填充、对齐、粗斜体/下划线、字距/宽度、位置/旋转/透明度、单描边、单阴影和背景；多样式、字幕语义、动态文字及畸形值一律 blocked，不静默压平。由于本机没有真实 CapCut 8.1 文字 render receipt，静态文字始终标为 downgrade，并提示系统字体替换风险，不能宣称逐帧 exact。bundle parser 强制轨道/元素类型一致并校验 timelinePlan 是 document 的确定性投影，renderer 可在零媒体 payload 时持久化 QCut TextElement。当前聚焦回归 5 个测试文件 48 用例及全仓 `check-types` 均通过。调色、蒙版、关键帧、富文本/动态文字和专有转场 mapper 仍未完成。 |
| JYI-017 语义/逐帧/音频 E2E | 🟨 部分完成 | 2026-08-05 | 语义、采样帧、native/preview、音频链保持不变。可信导入取证链已接通：renderer 从 IndexedDB 持久化 project/timeline/media 双读，状态变化即拒绝，并流式计算媒体 SHA-256；Electron 只接受当前主窗口 main frame 的响应，HTTP/preload/utility bridge 共用严格 schema；CLI `qcut editor interop import-snapshot` 以 project ID + bundle digest 生成 0600、拒绝覆盖、零路径快照。E2E import manifest schema 2 强制核对完整媒体、tracks、project name/FPS/geometry、bundle digest、import ID、profile ID 和可信 capture 来源；旧的绝对 `sourcePath` schema-1 快照即使内容一致也只能得到 not-comparable。真实运行 QCut 的 capture 现已证明这道 import gate：bundle digest `bdc7f806…44d89d`、两份持久化媒体哈希、两条完整轨道及全部身份/画布检查通过，零 issue；零路径收据见 JYI-014。总编排 [`roundtrip-case.ts`](../../../scripts/capcut-e2e/roundtrip-case.ts) 保持必经 `qcut-import` gate，再合并 source→roundtrip 语义、reference→QCut 两份 native export、两套 preview PNG 与音频证据。相关 verifier/roundtrip 测试 19 用例通过，renderer、IPC、HTTP、CLI 各有独立信任边界测试，全仓 `check-types` 通过。**仍缺**：keyframe 三点采样、Alpha/Geometry/Temporal 与测试 tone 频谱、可信 App/资源/导出设置 provenance，以及真实 CapCut 8.1 四路输出和逐 feature/profile 阈值校准（本机为 9.1，不能替代 8.1 证据）。 |
| JYI-018 规模/恢复加固 | 🟨 部分完成 | 2026-08-05 | 规模：[`draft-interop-scale.test.ts`](../../../packages/editor-core/src/__tests__/draft-interop-scale.test.ts) 让 10k 片段（10 轨×1000 段 + 2 万材料）走完 read→validate→normalize→map→diff→bundle-parse 全纯管线,零 issue、RESTRICTED 路径零泄漏,每阶段计数断言 + 宽松 10s 预算背书（实测全程 ~300ms,防的是意外平方爆炸不是机器速度）。恢复加固修了两个真实缺陷:**(1) 写回孤儿锁死锁**——writer 在建锁后、journal 前崩溃曾留下永久 `WRITEBACK_ALREADY_RUNNING`;现在 `recoverCapCut81SameProfileWriteback` 在无 journal 时清理孤儿锁并返回新 action `cleared-stale-lock`（安全性依据:镜像变更只发生在 journal 存在之后;有 journal 缺 rollback 的形态仍是硬 `RECOVERY_REQUIRED`,有测试双向覆盖）;**(2) inbox 列表单点炸表**——`listDesktopImports` 曾因单个损坏 entry 使整个列表 Promise.all 失败;现在损坏 entry 以 `unreadable: true` 占位返回（可见、可删、不可读/不可发布,绝不静默隐藏),in-flight 临时目录不进列表。测试:writer +2、inbox +2。**未做**:mid-rename 崩溃矩阵（afterMirrorReplaced 1..3 已有部分覆盖）、损坏 renderer ImportJournal 记录的滞留数据审计、PersistentImportPlanStore 损坏文件的隔离策略、cache metrics、100GB 素材级别验证 |
| JYR-001 保存事务 | 🟨 部分完成 | 2026-08-04 | 真实 CapCut 8.1.1 观测：打开时创建 `.locked`，退出后删除；首次保存改写 9 个 snapshot 文件并更新 root metadata，active content 四镜像同步变化。这足以否定“只 patch 根 `draft_info.json`”方案，但尚缺隔离账号下的系统调用级写入顺序、临时文件和 rename 边界。 |
| JYR-002 ~ JYR-008 研究门禁 | 🟨 部分完成 | 2026-08-04 | JYR-003 已记录 CapCut 8.1.1 精确保存迁移 `new_version: 159.0.0 → 179.0.0`；JYR-001 的现有真实保存后证据显示根与 timeline 下的 `draft_info.json`/`template-2.tmp` 四个活动 mirror 内容 hash 一致，两个 `.bak` 仅视为恢复副本，writer 因而只更新四个活动 mirror。该证据不能证明真实 syscall 调用顺序。JYR-006 仍只凭真实 App 文件访问证据准入根 `draft_info.json`；伴随引用闭包、完整 sidecar 需求、许可、compound ownership 和真实 8.1 写回顺序仍未知，继续阻止 profile 升为 writable。 |

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
scripts/capcut-e2e/qcut-import-verification-contract.ts
scripts/capcut-e2e/qcut-import-snapshot.ts
scripts/capcut-e2e/semantic-diff.ts
scripts/capcut-e2e/audio-comparison.ts
scripts/__tests__/capcut-e2e-qcut-import-verification.test.ts
scripts/__tests__/capcut-e2e-roundtrip-*.test.ts
```

当前“导入落盘门禁 + 四路输出”编排命令：

```bash
bun scripts/capcut-e2e/roundtrip-case.ts \
  --case-id <case-id> \
  --source-draft <source-draft-dir> \
  --roundtrip-draft <roundtrip-draft-dir> \
  --qcut-import-bundle <qcut-import-bundle.json> \
  --qcut-import-snapshot <qcut-import-snapshot.json> \
  --qcut-native-export <qcut-media> \
  --reference-native-export <jianying-or-capcut-media> \
  --qcut-preview-frames <qcut-frame-dir> \
  --reference-preview-frames <jianying-or-capcut-frame-dir> \
  --output <evidence-dir> --json
```

聚合 roundtrip manifest 已升为 schema 2；schema 1 不包含必经的导入落盘门禁，不能作为等价证据继续使用。

先在已打开目标项目的 QCut 中生成可信持久化快照：

```bash
qcut editor interop import-snapshot \
  --project-id <qcut-project-id> \
  --bundle-digest <bundle-sha256> \
  --output <qcut-import-snapshot.json> --json
```

该命令要求 renderer 对持久化 project、原始 tracks 和媒体 Blob 连续读取两次，流式哈希，并输出绑定 bundle digest、import ID、profile ID 的无路径快照。E2E verifier 只有在可信来源、全部绑定和 materialization 都匹配时才允许 schema-2 import manifest 为 pass。旧 schema-1 绝对 `sourcePath` 快照仍可用于本地诊断，但完全一致也只能是 not-comparable，不能证明 QCut 真正落盘。两套预览目录必须按 `frame-XXXXXXXX.png` 提供计划中的精确画布帧；不能用带侧栏、窗口边框或播放控件的整屏截图代替。退出码 `0/1/2/3` 分别表示 verified pass、comparison fail、unverified/not-comparable、harness error。当前默认 provenance 与全部阈值仍是 candidate，因此合成数据即使数值完全一致也只会得到 `unverified`，不会冒充真实 CapCut 8.1 验证。

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
| JYI-017 | Import/semantic/frame/audio E2E：`scripts/capcut-e2e/{qcut-import-verification,qcut-import-snapshot,semantic-diff,audio-comparison,roundtrip-case}.ts` | JYI-014–016 | 导入落盘门禁、四路输出、profile 阈值和 hash-bound evidence manifest |
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
