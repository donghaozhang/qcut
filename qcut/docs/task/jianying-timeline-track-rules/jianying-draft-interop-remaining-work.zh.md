# 剪映草稿互通剩余工作清单

<!-- markdownlint-disable MD013 -->

**状态：** 活跃实施清单

**日期：** 2026-08-13

**代码核验基线：** `3b368ec5e`

**关联 PR：** [#410 feat: add guarded JianYing draft interoperability](https://github.com/Quriosity-agent/qcut/pull/410)

**上位设计：** [剪映与 QCut 双向草稿兼容具体实现方案](./jianying-qcut-bidirectional-implementation-plan.zh.md)

## 1. 当前交付边界

当前已经完成的是一条 fail-closed 的剪映 11.3 beta4 导入基础链，以及几个经过真实 App 和 QCut 持久化验证的最小子集：

- 默认状态的单视频与相邻多视频；
- 默认状态的本地静态音频；
- 单样式普通静态文字，接受明确 downgrade warning 后可导入；
- 视频 X 位置的窄范围线性关键帧；
- profile 检测、原始图解析、素材解析、导入计划、事务落盘、恢复、CLI、Electron bridge 和导入 UI；
- 对未知或未验证结构保留原始证据并标为 `opaque`、`downgrade` 或 `blocked`，不静默丢失。

当前不能宣称：

- 任意剪映工程都能导入；
- QCut 编辑后可以可靠写回剪映；
- QCut 可以生成一个剪映能够保存、重开并继续编辑的完整工程；
- 文字、画面和音频已经与剪映逐帧或逐采样一致；
- `verify-roundtrip` 的 no-op 字节一致等于写回成功。当前验证明确记录 `writebackPerformed=false` 和 `targetAppPersistenceVerified=false`。

## 2. 剩余工作总表

| ID | 优先级 | 状态 | 交付目标 | 主要依赖 |
| --- | --- | --- | --- | --- |
| JYN-001 | P0 | 写回阻塞 | 找到剪映 11.3 可保存内容的真实 owner 和保存事务 | JYR-007 真实 App 研究 |
| JYN-002 | P0 | 未开始 | 开放受门禁保护的 QCut → 剪映同版本写回 | JYN-001 |
| JYN-003 | P1 | 部分完成 | 扩展关键帧导入，并分别验证关键帧写回 | 单变量草稿证据、JYN-001 |
| JYN-004 | P1 | 部分完成 | 支持视频与音频的常用编辑状态 | profile-specific mapper 证据 |
| JYN-005 | P1 | 部分完成 | 支持富文本、字幕、动画与花字的可声明子集 | 字体/资源重定位、渲染收据 |
| JYN-006 | P1 | 部分完成 | 映射调色、蒙版、滤镜、转场和专有资源 | 资源身份、许可和运行时证据 |
| JYN-007 | P0 | 部分完成 | 建立真实保存/重开、逐帧和音频 E2E 门禁 | JYN-002 至 JYN-006 |
| JYN-008 | P2 | 部分完成 | 支持版本 profile、迁移和未知字段往返 | 每版本独立证据 |
| JYN-009 | P2 | 部分完成 | 完成大工程缓存、预算、告警和真实压力验证 | 稳定功能矩阵 |
| JYN-010 | P1 | 部分完成 | 收尾 CLI/UI 的候选选择、重定位和能力说明 | JYN-001 至 JYN-008 |

## 3. 详细实施项

### JYN-001：确认真实 owner 与保存事务

**现状：** 剪映 11.3 beta4 的明文 compound subdraft 是快照，不是最终 owner。直接修改它以后，剪映保存时会根据 opaque parent 恢复旧值；同一工程还可能保留多个过期 subdraft，因此不能自动猜测活动候选。

**相关文件：**

- `packages/jianying-draft-import/src/source-root-resolver.ts`
- `packages/jianying-draft-import/src/discovery.ts`
- `packages/jianying-draft-export/src/jianying-11-3-project-source.ts`
- `packages/editor-core/src/jianying-draft/profiles/jianying-11-3-beta4.ts`
- `docs/task/jianying-timeline-track-rules/timeline-track-rules.zh.md`

**下一步：**

1. 用独立测试工程分别改变片段时间、文字内容、转场和一个变换参数。
2. 在 create、open、save、quit、reopen 每个边界记录相对路径 inventory、mtime、大小和 SHA-256。
3. 通过非侵入式文件访问观察确认哪个文件或数据库在保存后拥有最终状态，并记录临时文件、rename、锁和镜像更新顺序。
4. 定义多 subdraft 候选的确定性选择规则；证据不足时要求用户显式选择。

**完成条件：** 至少三个单变量 case 都能确定 owner；对受控副本写入后，剪映保存、退出、重开仍保持目标值；来源选择没有猜测；所有路径化证据和剪映私有数据留在 Git 外。若无法证明，`sameProfileWriteback` 必须继续为 `none`。

### JYN-002：剪映同版本写回

**目标：** 只在 JYN-001 完成后，把现有写回基础设施接到已证明的剪映 owner，首批只允许修改已有元素的已验证字段。

**相关文件：**

- `packages/editor-core/src/jianying-draft/writeback/jianying-11-3-same-profile-prepare.ts`
- `packages/editor-core/src/jianying-draft/writeback/jianying-11-3-timing-patches.ts`
- `packages/jianying-draft-export/src/jianying-11-3-registered-project-writer.ts`
- `electron/jianying-project-export-handler.ts`
- `apps/web/src/lib/jianying-draft/jianying-11-3-project-export-client.ts`

**完成条件：** writer 有旧值前置条件、source hash、TOCTOU、symlink、锁、journal、rollback 和恢复门禁；未知 sentinel 完整保留；raw diff 只包含计划字段；真实剪映完成 save/quit/reopen；产生不含绝对路径的可信 App receipt。新增、删除、换素材和跨轨移动应作为后续独立节点，不与首个写回混在一起。

### JYN-003：关键帧能力矩阵

**现状：** 只支持一组严格形状的 X 位置线性关键帧导入。Y 位移、缩放、旋转、透明度、非线性曲线、多个关键帧组合和任何关键帧写回都未完成。

**相关文件：**

- `packages/editor-core/src/jianying-draft/import/beta4-position-keyframes.ts`
- `packages/editor-core/src/jianying-draft/import/static-video-mapper.ts`
- `packages/editor-core/src/jianying-draft/writeback/jianying-11-3-timing-patches.ts`
- `packages/editor-core/src/__tests__/jianying-11-3-beta4-video-import.test.ts`

**实施顺序：** Y 位置 → 等比缩放 → 旋转 → 透明度 → 非等比缩放 → 贝塞尔/缓动。每一种属性都先做单变量真实草稿，再做组合测试；导入和写回使用独立 capability，不因导入成功自动开放写回。

**完成条件：** 时间单位、帧网格、坐标归一化、终态字段与关键帧末值全部有断言；超出已验证形状的输入仍 fail closed；至少取起点、中点、终点三帧与剪映输出比较。

### JYN-004：视频和音频常用编辑状态

**缺少的视频能力：** trim、crop、非默认 transform、speed、reverse、visibility、blend、算法增强和素材替换。

**缺少的音频能力：** trim、volume、speed、loop、reverse、pitch、tone modify、声道映射、人声处理和音频关键帧。

**相关文件：**

- `packages/editor-core/src/jianying-draft/import/static-video-mapper.ts`
- `packages/editor-core/src/jianying-draft/import/static-audio-mapper.ts`
- `packages/editor-core/src/jianying-draft/import/beta4-video-material-defaults.ts`
- `packages/editor-core/src/jianying-draft/import/beta4-video-segment-defaults.ts`
- `packages/jianying-draft-import/src/import-session.ts`

**完成条件：** 每个编辑域使用独立 mapper/helper 和独立 fixture；source/target timerange、播放时长和 QCut timeline 结果一致；音频类能力增加时域和频谱验证；unsupported 组合不能被默认值逻辑误判为 exact。

### JYN-005：文字、字幕、动画和花字

**缺少能力：** 多 style range、富文本、字幕语义、逐字样式、文字动画、花字/text effect、文字关键帧、字体包重定位和字体 fallback 的可重复渲染。

**相关文件：**

- `packages/editor-core/src/jianying-draft/import/static-text-mapper.ts`
- `electron/jianying-text-runtime/`
- `electron/jianying-text-effect-style-parser.ts`
- `apps/web/src/components/editor/preview-panel/jianying-text-playback-overlay.tsx`

**完成条件：** 数据映射、资源身份和渲染能力分开建模；缺字体或资源时给出 relink/downgrade，而不是替换后仍标 exact；每个可声明子集有透明背景、字体、位置和动画时序的真实帧收据。

### JYN-006：调色、蒙版、滤镜、转场和专有资源

**现状：** QCut 已有部分剪映滤镜、文字和转场实验室能力，但“本机可预览某资源”不等于“草稿字段已经可以无损导入或写回”。草稿 mapper 仍缺调色、蒙版、专有转场和多数资源引用。

**相关文件：**

- `packages/editor-core/src/jianying-draft/import/normalize.ts`
- `electron/jianying-transition/`
- `electron/jianying-filter-local-runtime/`
- `apps/web/src/lib/filters/jianying-parity/`
- `scripts/jianying-filter-parity/`

**完成条件：** 每个资源由 profile、资源 ID、包哈希和许可状态共同识别；本地剪映二进制、资源包、字体和用户草稿不得提交；缺资源时提供合法重定位或 portable fallback；每个 mapper 有结构、预览和导出三层验证，无法证明时保持 opaque。

### JYN-007：真实语义、逐帧和音频 E2E

**相关文件：**

- `packages/jianying-draft-import/src/round-trip-verifier.ts`
- `scripts/capcut-e2e/roundtrip-case.ts`
- `scripts/capcut-e2e/semantic-diff.ts`
- `scripts/capcut-e2e/audio-comparison.ts`
- `scripts/capcut-e2e/qcut-import-snapshot.ts`

**必须区分的四类结果：** 来源剪映导出、QCut 导入后 native export、QCut preview capture、写回后剪映 save/reopen/export。no-op 草稿字节一致只能证明未改动来源，不能替代后两项。

**完成条件：** receipt 绑定 App 版本/签名、profile、资源哈希、导出设置、输入草稿哈希和输出媒体哈希；视频检查 Alpha、Geometry、Temporal 和关键帧采样；音频检查时长、声道、响度和测试 tone 频谱；每个 feature/profile 有独立阈值，不能用另一版本结果代替。

### JYN-008：版本 profile 与迁移

**现状：** beta4 的窄范围 inspect/import 为 stable；beta2、beta3 仍是 candidate；所有 JianYing 11.3 写能力仍为 none。

**相关文件：**

- `packages/editor-core/src/jianying-draft/profiles/jianying-11-3-beta2.ts`
- `packages/editor-core/src/jianying-draft/profiles/jianying-11-3-beta3.ts`
- `packages/editor-core/src/jianying-draft/profiles/jianying-11-3-beta4.ts`
- `packages/editor-core/src/jianying-draft/profiles/jianying-11-3-shared.ts`
- `packages/editor-core/src/jianying-draft/import/profile-detection.ts`

**完成条件：** 每个版本拥有独立检测 fixture、能力矩阵和真实 App receipt；升级前后 unknown 字段仍可保留；版本不确定或证据冲突时返回 ambiguous；不得用“结构看起来相似”继承写能力。

### JYN-009：大工程与生产加固

**缺少能力：** 跨会话持久内容寻址缓存、分阶段性能预算、生产聚合/告警和真实 100GB 素材导入收据。现有 100GB 结论只来自逻辑清单级测试。

**相关文件：**

- `packages/jianying-draft-import/src/asset-resolver.ts`
- `packages/jianying-draft-import/src/snapshot-reader.ts`
- `packages/jianying-draft-import/src/import-session.ts`
- `apps/web/src/lib/jianying-draft/qcut-import-transaction.ts`
- `apps/web/src/lib/storage/import-recovery.ts`

**完成条件：** 真实大工程的 inspect/plan/commit/reload receipt；缓存有容量、版本、逐出和损坏恢复策略；各阶段有稳定指标和预算；任意 checkpoint 崩溃后可恢复或安全回滚；日志和指标不包含绝对路径、token 或草稿内容。

### JYN-010：CLI 与 UI 产品收尾

**剩余体验：** 多 subdraft 候选选择、missing/ambiguous 素材重定位、能力矩阵展示、写回前风险确认、恢复状态和机器可读 CLI 错误。

**相关文件：**

- `electron/native-pipeline/cli/command-registry-editor-jianying-import.ts`
- `electron/native-pipeline/editor/editor-handlers-jianying-import.ts`
- `apps/web/src/hooks/import/use-jianying-draft-import.ts`
- `apps/web/src/components/import-dialog/jianying-draft-import-card.tsx`

**完成条件：** UI 与 CLI 共用同一 contract、plan digest、warning acceptance 和 capability gate；CLI 支持稳定 JSON schema；用户可以明确选择候选和重新定位素材；UI 不把 inspect/import 成功显示成 writeback 可用。

## 4. 推荐实施顺序

1. 先保持 PR #410 为导入基础基线，等待 macOS、Windows、Linux CI 全部通过后再进入 review/merge。
2. 并行推进 JYN-001 的 owner 研究和 JYN-003/JYN-004 的高价值导入子集；导入扩展不必等待写回研究。
3. JYN-001 没有可信结论前，不实现或开放剪映写回。
4. 每完成一个 feature mapper，立即补 JYN-007 对应的真实 App、QCut 持久化和媒体输出证据。
5. 功能矩阵稳定后再做 JYN-008/JYN-009，避免缓存或版本抽象建立在错误数据模型上。

## 5. 整体完成定义

只有同时满足以下条件，才能把项目状态从“受限导入”改为“剪映双向互通”：

- 声明支持矩阵中的剪映工程可导入 QCut，重启后数据和媒体仍完整；
- QCut 修改后的声明支持字段可写回剪映，save/quit/reopen 后继续存在；
- 未知字段、sidecar 和资源引用没有被静默删除或错误归属；
- missing、ambiguous、license-restricted 和版本不确定都有明确用户决策路径；
- 文字、视频和音频通过对应 profile 的语义及媒体输出阈值；
- 大工程满足性能、缓存、恢复和隐私门禁；
- Git 中不包含剪映二进制、私有资源包、用户草稿、绝对用户路径或密钥。
