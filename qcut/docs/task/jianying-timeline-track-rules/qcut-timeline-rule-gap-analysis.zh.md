# QCut 时间线规则差距与修复计划

<!-- markdownlint-disable MD013 -->

**状态：** 审计基线 + 实施进行中（进度见下表）  
**审计日期：** 2026-08-04  
**审计分支：** `codex/transition-v2`  
**对应规则：** [剪映时间线轨道规则核验](./timeline-track-rules.zh.md)

## 实施进度

| 任务 | 状态 | 完成日期 | 说明 |
| --- | --- | --- | --- |
| QTL-001 统一命令守卫和锁定契约 | ✅ 已完成 | 2026-08-04 | 纯函数 preflight + 全入口接入 + 26 用例矩阵测试；顺带修复 `replaceElementMedia` 旧快照写回 |
| QTL-002 共享 Collision Engine | ✅ 已完成 | 2026-08-04 | `collision-policy.ts` 纯区间数学 + `reject\|insert\|overwrite` 显式参数;deleteTimeRange 与 add-overwrite 共用一份 trim/split 实现;replace 并发回归测试 |
| QTL-003 Ripple Domain 与类型化 Link | ✅ 已完成 | 2026-08-04 | `ripple-plan.ts`：groupId 派生类型化 link（video-audio/group）+ ripple domain 解析；无关轨道不再被波纹移动；锁定依赖阻止整个命令 |
| QTL-004 扩展事务历史 | ✅ 已完成 | 2026-08-04 | 历史快照含 tracks + 选择 + 转场选中 + 播放头；修复 redo 不回推 history 的往返 bug；CLI 事务桥升级到完整快照 |
| QTL-005 ~ QTL-012 | ⬜ 未开始 | | |

## 结论

本轮把剪映研究文档中的时间线行为拆成 **50 个可独立验证的原子规则**，并对照 QCut 当前代码和测试逐项检查：

| 状态 | 数量 | 占比 |
| --- | ---: | ---: |
| 完整实现 | 37 | 74% |
| 部分实现 | 6 | 12% |
| 尚未实现 | 7 | 14% |
| **需要修复或补齐** | **13** | **26%** |

审计基线为 19/50 项需要改动；QTL-001 ~ QTL-004 完成后，**当前还有 13/50 项时间线规则需要代码改动**——6 项已有基础但契约不完整，另有 7 项缺少正式模型或命令。

QCut 的基础模型并不差。轨道类型、主轨标识、显隐、静音、顺序、合成层级、分组、复合片段、转场和波纹操作都已经存在。最大差距集中在操作语义：锁定没有在所有入口统一执行，插入/覆盖/替换没有一个共享冲突引擎，主轨磁吸与普通吸附/波纹没有拆开，关联仍主要依赖通用 `groupId`，撤销只保存轨道数组。

## 统计口径

| 分类 | 定义 |
| --- | --- |
| 完整实现 | 有明确数据契约和可调用命令，并有相关测试覆盖核心不变量 |
| 部分实现 | UI 或某条路径可用，但 Store、CLI、异步流程、持久化或边界行为不一致 |
| 尚未实现 | 没有独立模型/命令，或只能由调用方临时组合出来 |

“需要修复或补齐”等于“部分实现 + 尚未实现”。统计只覆盖时间线规则本身，不把素材库数量、滤镜数量、转场视觉相似度或剪映草稿全量导出算入分母。

## 分领域统计

| 领域 | 原子规则 | 完整 | 部分 | 缺失 | 需改动 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 轨道类型与操作 | 7 | 6 | 0 | 1 | 1 |
| 层级与渲染 | 5 | 4 | 1 | 0 | 1 |
| 插入、覆盖与替换 | 5 | 4 | 1 | 0 | 1 |
| 波纹与主轨磁吸 | 5 | 4 | 0 | 1 | 1 |
| 修剪模式 | 5 | 4 | 0 | 1 | 1 |
| 吸附 | 5 | 3 | 0 | 2 | 2 |
| 关联、组合与复合片段 | 5 | 3 | 1 | 1 | 2 |
| 转场 | 5 | 4 | 1 | 0 | 1 |
| 撤销与重做 | 3 | 3 | 0 | 0 | 0 |
| 导航与缓存 | 3 | 1 | 2 | 0 | 2 |
| AI 语义规则 | 2 | 1 | 0 | 1 | 1 |
| **总计** | **50** | **37** | **6** | **7** | **13** |

## 50 项规则明细

### 1. 轨道类型与操作：6 完整，0 部分，1 缺失

**完整：** 明确的轨道类型、显式 `isMain`、稳定 `order`、新增/重排、显隐与静音/独奏。核心定义位于 [`timeline.ts`](../../../packages/editor-core/src/types/timeline.ts) 和 [`track-utils.ts`](../../../packages/editor-core/src/timeline/track-utils.ts)。

**完整（QTL-001，2026-08-04 落地）：轨道锁定。** 锁定契约现在由 [`lock-contract.ts`](../../../packages/editor-core/src/timeline/lock-contract.ts) 的纯函数 preflight 统一执行，经 [`timeline-lock-guard.ts`](../../../apps/web/src/stores/timeline/timeline-lock-guard.ts) 接入全部 Store 内容命令入口（crud、element、track、media-timing、transition、effects、compound、group）。策略：显式目标命中锁定轨时整个命令 fail closed（无状态变化、无历史条目）；派生集合（ripple 位移域、"全轨道"默认、广域字幕样式）跳过锁定轨；轨道元数据（静音/隐藏/高度/重命名/排序/解锁本身）不属于内容编辑，保持可用。矩阵测试见 [`timeline-lock-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-lock-contract.test.ts)（26 用例）与 editor-core 单元测试（8 用例）。

**缺失：项目级轨道 profile。** 当前兼容性校验固定为 typed tracks，没有 `classic`、`free-layer`、`mixed-material` 三种模式，也无法无损表达剪映开启自由层级和素材混排后的工程。相关代码是 [`validation.ts`](../../../packages/editor-core/src/timeline/validation.ts)。

额外迁移风险：当已有轨道全部带 `order` 且缺少主轨时，`ensureMainTrack()` 给新主轨分配最后一个顺序值；需要用测试确认它不会落到音频轨下方。

### 2. 层级与渲染：4 完整，1 部分

**完整：** QCut 已有统一 composition plan；UI 轨道按上到下保存，合成按下到上绘制；隐藏轨道和隐藏元素可从视觉合成排除；音频轨独立进入混音；媒体支持透明度。实现位于 [`composition-plan.ts`](../../../packages/editor-core/src/timeline/composition-plan.ts)。

**部分：混合模式。** `MediaBlendMode` 当前只有 `normal`、`multiply`、`screen`、`overlay`、`darken`、`lighten` 六种，而且还需要用同一组 golden frames 证明预览、原生导出和草稿导出一致。这里不建议先堆更多枚举，应该先建立跨渲染器契约测试。

### 3. 插入、覆盖与替换：4 完整，1 部分，0 缺失

**完整：自动堆叠到新轨。** `addMediaAtTime()` 会寻找同类型空闲轨道，全部占用时新建轨道，见 [`timeline-add-ops.ts`](../../../apps/web/src/stores/timeline/timeline-add-ops.ts)。`separateAudio` 也改为堆叠语义：分离音频落到第一条未锁定且该时间段空闲的音轨，否则新建。

**完整（QTL-002，2026-08-04 落地）：同轨不重叠不变量。** `addElementToTrack()` / `moveElementToTrack()` / `updateElementStartTime()`（含整组移动）在 Store 层默认拒绝制造重叠，无状态变化、无历史污染。UI 拖拽的预检查保留为交互反馈，但契约由 Store 命令层执行——CLI（claude-bridge → 同一 store 命令）与 AI 入口自动继承。区间数学位于 [`collision-policy.ts`](../../../packages/editor-core/src/timeline/collision-policy.ts)，测试见 [`timeline-collision-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-collision-contract.test.ts)。

**部分：替换。** `replaceElementMedia()` 已能导入新文件并更新素材引用，但它会用新素材时长直接改写片段时长，可能破坏接缝和转场。~~它也没有锁定检查；该异步函数在导入前捕获 `_tracks`，完成后仍用旧快照写回~~——锁定检查（入口 + 导入完成后复检）和旧快照写回已随 QTL-001 修复，并发编辑回归测试已随 QTL-002 落地。剩余缺口是时长/转场保留策略（归 QTL-012）。实现位于 [`timeline-element-ops.ts`](../../../apps/web/src/stores/timeline/timeline-element-ops.ts)。

**完整（QTL-002 落地）：显式 Insert 命令。** `addElementToTrack(trackId, data, { collision: "insert" })`：落点处片段按手动分割语义切开，落点之后的同轨元素整体右移插入时长。

**完整（QTL-002 落地）：显式 Overwrite 命令。** `addElementToTrack(trackId, data, { collision: "overwrite" })`：清空目标区间（删除/修剪/两侧切分），保留后续时间位置。区间清除的 trim/split 数学与 `deleteTimeRange` / 波纹区间删除共用同一份实现（[`timeline-collision-utils.ts`](../../../apps/web/src/stores/timeline/timeline-collision-utils.ts)）。CLI 批量添加接口透传 `collision` 字段。

### 4. 波纹与主轨磁吸：4 完整，0 部分，1 缺失

**完整：** 同轨移动波纹、同轨删除波纹和显式区间删除已经有 Store 操作与测试，见 [`timeline-element-ops.ts`](../../../apps/web/src/stores/timeline/timeline-element-ops.ts)、[`timeline-track-ops.ts`](../../../apps/web/src/stores/timeline/timeline-track-ops.ts) 和 [`timeline-ripple-ops.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts)。

**完整（QTL-003，2026-08-04 落地）：跨轨联动波纹。** `removeElementFromTrackWithRipple()` 和 `deleteSelectedElementsWithRipple()` 现在按 ripple domain 移动：被编辑轨道 + 其元素显式关联的轨道（[`ripple-plan.ts`](../../../packages/editor-core/src/timeline/ripple-plan.ts) 从 groupId 派生 `video-audio` / `group` 类型化 link），无关轨道保持原位；锁定的关联依赖阻止整个命令（防半套提交），锁定的无关轨道只是不在域内。`removeTrackWithRipple()` 与 `rippleDeleteAcrossTracks()` 保留为显式跨轨命令（全轨道减锁定），语义由调用方声明。测试见 [`timeline-ripple-domain.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-domain.test.ts)。

**缺失：独立主轨磁吸。** 当前只有 `snappingEnabled` 和 `rippleEditingEnabled`。剪映的主轨磁吸、普通吸附和主轨联动是三个独立概念，QCut 目前把后两类行为压进一个“Linked editing”开关。

### 5. 修剪模式：4 完整，1 缺失

**完整：** 普通边缘修剪、分割、Slip 和 Roll 已存在。Slip/Roll 对反向播放、素材 handle、最小时长和锁定轨道做了检查，并有原子撤销测试，见 [`precision-edit.ts`](../../../apps/web/src/lib/timeline/precision-edit.ts) 和 [`timeline-precision-edit-ops.ts`](../../../apps/web/src/stores/timeline/timeline-precision-edit-ops.ts)。

**缺失：Slide 与显式 Ripple Trim 模式族。** QCut 还没有保持片段时长、同时调整左右邻居的 slide edit，也没有名称明确、可由 CLI 调用的 ripple trim 命令。两者应复用同一套 source/target range 数学，而不是继续扩展 UI handler。

### 6. 吸附：3 完整，2 缺失

**完整：** 片段头尾、播放头、帧边界/音频节拍已经可参与部分拖放路径。核心 hook 是 [`use-timeline-snapping.ts`](../../../apps/web/src/hooks/timeline/use-timeline-snapping.ts)。

**缺失：书签和转场接缝候选。** 时间尺已经渲染 bookmarks，转场也有明确 seam，但吸附引擎只生成 element start/end 和 playhead 候选。见 [`timeline-ruler.tsx`](../../../apps/web/src/components/editor/timeline/timeline-ruler.tsx) 和 [`transitions.ts`](../../../packages/editor-core/src/timeline/transitions.ts)。

**缺失：候选优先级和临时禁用。** 当前只选距离最近点，没有稳定的同距优先级，也没有拖动时按 Shift 临时关闭吸附。10 px 阈值本身是合理基础，但必须由所有拖拽/修剪入口共享。

### 7. 关联、组合与复合片段：3 完整，1 部分，1 缺失

**完整：** 组合/解除组合、组合选择/整体移动，以及分离音频后同步变速已经存在。相关实现位于 [`timeline-group-operations.ts`](../../../apps/web/src/stores/timeline/timeline-group-operations.ts)、[`timeline-media-timing-ops.ts`](../../../apps/web/src/stores/timeline/timeline-media-timing-ops.ts) 和 [`aligned-generated-media.ts`](../../../apps/web/src/lib/timeline/aligned-generated-media.ts)。

**部分：组合操作原子性。** 普通选中可以展开整个 group，但底层直接删除、修剪、跨轨移动和锁定冲突没有统一 group closure。当前 `groupId` 同时承担 UI 组合、分离音频和 AI 对齐媒体的职责，语义会继续膨胀。

**缺失：类型化依赖图（部分推进）。** QTL-003 引入了从 groupId 派生的类型化 link（`video-audio`、`group`，见 `ripple-plan.ts`），并已驱动 ripple domain；但 `caption-owner`、`effect-target`、`semantic-scene` 等持久化 link、删除/移动前的依赖闭包和单边 unlink 的持久化模型仍未建立（归 QTL-008 / QTL-011）。

复合片段本身可创建和解除，但当前是一个 `MediaElement.compound.clips[]` 容器，不是可进入编辑、拥有独立 fps/标记/缓存版本的真正子时间线。因此这部分应在“类型化依赖图”之后继续演进，而不是把更多职责塞入 `groupId`。

### 8. 转场：4 完整，1 部分

**完整：** 同轨相邻视频接缝资格、增删改、时长 clamp、相邻转场共享 handle 限制和失效转场清理已经有统一 core 函数。每次 `updateTracksAndSave()` 都会调用 reconcile，见 [`transitions.ts`](../../../packages/editor-core/src/timeline/transitions.ts)、[`timeline-transition-ops.ts`](../../../apps/web/src/stores/timeline/timeline-transition-ops.ts) 和 [`timeline-store-autosave.ts`](../../../apps/web/src/stores/timeline/timeline-store-autosave.ts)。

**部分：handle 不足与替换策略。** 当前策略是 clamp 或拒绝，没有剪映式边缘帧延展 profile。媒体替换也没有显式声明“保留目标时间槽、重算 handle、保留或移除转场”的规则。基础转场不变量已经可靠，不应重写；只需在其上增加策略层。

### 9. 撤销与重做：3 完整，0 部分

**完整：** 轨道数组可以 undo/redo，转场和 precision edit 都能作为单次历史操作恢复。

**完整（QTL-004，2026-08-04 落地）：历史快照范围。** `history` 与 `redoStack` 现在保存完整编辑上下文快照（[`timeline-history.ts`](../../../apps/web/src/stores/timeline/timeline-history.ts)：tracks + 选择 + 转场选中 + 播放头），undo/redo 一并恢复。顺带修复了一个真实往返 bug：旧 `redo()` 只弹 redoStack 不回推 history，undo→redo 之后再 undo 会跳级。CLI 事务桥（`claude-transaction-bridge.ts`，分组事务单条历史）同步升级到完整快照。审计所称"multi 分支追加两次"在当前代码中无法复现（multi 分支是 toggle 语义），已用选择不变量测试钉死。测试见 [`timeline-history-transaction.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-history-transaction.test.ts)。场景切换仍不可撤销（加载场景时清空历史）——场景生命周期归 QTL-010。

### 10. 导航与缓存：1 完整，2 部分

**完整：书签。** 项目 bookmarks 可显示并点击跳转播放头。

**部分：场景导航。** `scene-store.ts` 已支持创建、切换、重命名和按 scene 保存时间线，但工具栏的场景管理仍显示 coming soon；删除场景还有清理存储的 TODO。相关代码位于 [`scene-store.ts`](../../../apps/web/src/stores/timeline/scene-store.ts) 和 [`timeline-toolbar.tsx`](../../../apps/web/src/components/editor/timeline/timeline-toolbar.tsx)。

**部分：帧缓存身份。** 缓存已经包含 scene、活动元素、媒体签名和项目画布信息，但 hash 过滤使用 `track.muted`，没有使用 `track.hidden`。隐藏视觉轨后可能仍命中旧的可见帧；静音媒体轨又可能不必要地改变视觉缓存。见 [`use-frame-cache.ts`](../../../apps/web/src/hooks/timeline/use-frame-cache.ts)。

### 11. AI 语义规则：1 完整，1 缺失

**完整：** QCut 已有场景检测后智能分割，以及 AI 生成语音/视频的时间对齐组合。

**缺失：持久化语义图。** 当前系统不能表达“这个字幕、音效和 B-roll 属于场景 A，但用户已手动解除其中一条跟随关系”。没有类型化语义边，就无法让 AI 移动场景时既自动跟随又尊重用户编辑。

## 已确认的高风险缺陷

| 优先级 | 缺陷 | 影响 | 状态 |
| --- | --- | --- | --- |
| P0 | 锁定只在部分 UI/命令生效 | CLI、自动化和其他 Store 入口可修改锁定轨道 | ✅ 已修复（QTL-001） |
| P0 | linked ripple 实际可移动全部轨道 | 无关轨道或锁定轨道可能被时间平移 | ✅ 已修复（QTL-001 排除锁定轨 + QTL-003 domain 语义） |
| P0 | `replaceElementMedia()` 异步写回旧 `_tracks` | 等待导入期间的用户编辑可能被覆盖 | ✅ 已修复（QTL-001） |
| P0 | 冲突检查不在 domain command 层 | 同一操作从 UI、CLI、AI 入口得到不同结果 | ✅ 已修复（QTL-002） |
| P1 | 历史只保存 tracks | undo 后选择、播放头和跨 Store 状态可能不一致 | ✅ 已修复（QTL-004，含 redo 往返 bug） |
| P1 | 帧缓存忽略 `track.hidden` | 隐藏轨道后可能短暂显示旧缓存帧 | ⬜ 待 QTL-010 |
| P1 | multi-select 重复追加选择 | 选择计数和批量命令输入可能重复 | ✅ 无法复现（当前为 toggle 语义），已加不变量测试（QTL-004） |
| P1 | 场景删除不清理对应 timeline storage | 长期积累孤立场景数据 | ⬜ 待 QTL-010 |

## 建议修复顺序

### P0：先建立一致的命令语义

#### QTL-001 统一命令守卫和锁定契约 ✅ 已完成（2026-08-04）

目标：任何入口都不能修改锁定轨道，间接 ripple/link 操作也必须先做全量预检。

实施记录：

- `packages/editor-core/src/timeline/lock-contract.ts`：纯函数 preflight（`preflightLockedTracks`、`findTrackIdsForGroup`、`excludeLockedTrackIds` 等），element id 自动解析到所在轨道。
- `apps/web/src/stores/timeline/timeline-lock-guard.ts`：Store 层薄封装，命中锁定时经 `handleError` 上报并返回阻塞。
- 接入入口：`timeline-store-crud.ts`（add/remove/move/trim/duration/startTime/transform/各类 update*Element/group/ungroup/compound/multicam/toggleElementHidden）、`timeline-element-ops.ts`（ripple move/split×3/separateAudio/replace）、`timeline-track-ops.ts`（removeTrack、全部 ripple 删除路径）、`timeline-media-timing-ops.ts`（含 linked audio 闭包）、`timeline-transition-ops.ts`（转场四个变更命令，超出原清单）、`timeline-add-ops.ts`（effects 四命令）、`timeline-store.ts`（`findOrCreateTrack` 跳过锁定轨）、`caption-style-operations.ts`（广域样式跳过锁定轨）。
- 附带修复：`replaceElementMedia` 异步完成后重读当前 timeline、重验元素存在并复检锁定，不再写回旧快照（并发编辑回归测试留给 QTL-002 的 collision 重构一并做）。
- 测试：[`timeline-lock-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-lock-contract.test.ts) 26 用例矩阵 + [`lock-contract.test.ts`](../../../packages/editor-core/src/__tests__/lock-contract.test.ts) 8 用例；既有 timeline 套件 95 用例全绿。

验收结果：add/move/delete/trim/split/replace/group/compound/ripple 对锁定目标全部无状态变化、无历史污染 ✅；跨轨命令策略明确——显式目标整体失败，派生域（ripple 位移、默认全轨道、广域样式）跳过锁定轨 ✅；轨道元数据（静音/隐藏/高度/重命名/排序/解锁）明确不属于内容编辑，保持可用。

#### QTL-002 建立共享 Collision Engine ✅ 已完成（2026-08-04）

目标：把 `append | insert | overwrite | replace | stack` 做成显式 command 参数，UI、CLI 和 AI 共用一套区间算法。

实施记录：

- `packages/editor-core/src/timeline/collision-policy.ts`：纯区间数学——`rangesOverlap`（半开区间）、`findRangeCollisions`、`classifyRangeCollision`（inside / ends-inside / starts-inside / spans）、`planOverwrite`、`planInsertShift`。
- `apps/web/src/stores/timeline/timeline-collision-utils.ts`：把纯计划落到真实元素的唯一实现（`overwriteRangeInElements`、`insertGapInElements`），`deleteTimeRange` / `deleteSelectedElementsWithRipple` 的区间删除段重构为同一函数，删除了第二份 trim/split 数学。
- `addElementToTrack` 新增 `collision: "reject" | "insert" | "overwrite"` 参数（默认 reject）；`moveElementToTrack`、`updateElementStartTime`（单元素与整组，碰撞时整体拒绝且不污染历史）接入 reject 契约；`separateAudio` 改为堆叠语义（跳过锁定/占用音轨，必要时新建）。
- CLI 链路核实：CLI → HTTP → 主进程 → IPC → `claude-bridge` → **同一批 store 命令**，主进程只做形状校验，无区间逻辑复制；批量添加请求新增 `collision` 字段透传（`electron/types/claude-api.ts`、`claude-timeline-operations.ts`、`claude-timeline-bridge-batch.ts`）。
- `use-track-drop.ts` 未再添加条件：UI 预检查保留为拖拽反馈，契约由 store 层执行。
- 测试：[`collision-policy.test.ts`](../../../packages/editor-core/src/__tests__/collision-policy.test.ts)（6 用例）+ [`timeline-collision-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-collision-contract.test.ts)（10 用例，含 mock 媒体导入门闩的 replace 并发编辑回归）。

验收结果：UI/CLI 调用同一 store 命令，语义字节等价 ✅；普通 add/move API 不能制造非法同轨重叠（默认 reject，无历史污染）✅；replace 异步完成时重读当前 timeline，并发编辑测试通过 ✅。stack 语义保留在 `addMediaAtTime`/`separateAudio` 的轨道选择层（跨轨命令），与单轨 collision 参数正交。

#### QTL-003 建立 Ripple Domain 与类型化 Link ✅ 已完成（2026-08-04）

目标：明确主轨域、当前轨域、选择域和依赖域，替代“全部轨道”与通用 `groupId` 推断。

实施记录：

- `packages/editor-core/src/timeline/ripple-plan.ts`（类型与实现放在一起，未拆到 types/timeline.ts）：`TimelineLinkType`（`video-audio` / `group` 已可派生；`caption-owner` / `effect-target` / `semantic-scene` 预留给 QTL-011）、`TimelineElementLink`（含 `detached` 字段）、`deriveTimelineLinks`（groupId + mediaId + 音轨类型 → 分离音频对；其余组内关系 → group）、`resolveRippleDomain`（seed 轨道 + link 单跳扩展；锁定依赖单独上报）。
- `timeline-track-ops.ts`：`removeElementFromTrackWithRipple` 与 `deleteSelectedElementsWithRipple` 的位移集合从"全部轨道"改为 ripple domain；锁定关联依赖 → `handleError` + 整体失败、零历史污染。
- `updateMediaTiming`（media-timing-ops）此前已按 linked audio 闭包处理，无需改动；`aligned-generated-media` 的 groupId 关联自动进入派生 link 图。
- 决策：`removeTrackWithRipple` / `rippleDeleteAcrossTracks` 保留"全轨道减锁定"语义——它们是调用方显式声明的跨轨命令，不属于隐式联动。
- 现状契约变化：波纹删除不再平移无关 overlay 轨道（原行为是审计确认的缺陷）；两个既有测试的期望已随契约更新。
- 测试：[`ripple-plan.test.ts`](../../../packages/editor-core/src/__tests__/ripple-plan.test.ts)（5 用例：link 派生分型、单跳扩展、锁定依赖上报、detached 忽略、seedElement 收窄）+ [`timeline-ripple-domain.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-domain.test.ts)（4 用例）。

验收结果：主轨删除只移动主轨和显式 linked 依赖（分离音频轨随动）✅；无关 overlay 不动 ✅；锁定依赖阻止半套提交（整体失败、无历史条目）✅；undo 一次完整恢复 ✅。剩余：持久化 link 图与 unlink 状态（QTL-011）、组闭包删除（QTL-008，删除视频暂不删除孤儿音频伙伴）。

#### QTL-004 扩展事务历史 ✅ 已完成（2026-08-04）

目标：历史命令保存可恢复的编辑状态，而不是只保存 tracks。

实施记录：

- `apps/web/src/stores/timeline/timeline-history.ts`：`TimelineHistorySnapshot`（tracks + selectedElements + selectedTransition + playheadTime）与捕获/播放头恢复函数；对 playback-store 用懒加载引用避免模块环。
- `timeline-store.ts` 的 `pushHistory`/`undo` 与 `timeline-store-persistence.ts` 的 `redo` 改为完整快照语义；**修复 redo 不把当前状态回推 history 的往返 bug**（undo→redo→undo 此前会跳级）。
- `claude-transaction-bridge.ts`：CLI 分组事务的 Begin 时捕获完整快照，commit 推快照、rollback 用快照恢复——CLI 多步事务保持单条历史。
- 决策：未采用 `packages/editor-core/src/commands/history.ts` 的泛型栈（store 内联双栈更贴合现状，通用模块保留待用）；场景切换保持不可撤销（加载即清历史），归 QTL-010；播放头恢复采用"undo 回到编辑现场"语义。
- 连带修复（QTL-002 契约暴露）：贴纸"复制"改为堆叠空闲/新建贴纸轨（同轨同时段副本违反不重叠不变量），新轨路径复用 `insertTrackAt` 的历史条目保持单次 undo。
- 测试：[`timeline-history-transaction.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-history-transaction.test.ts)（4 用例：undo/redo 恢复选择与播放头、往返回归、批量删除单条目、multi-select 不变量）；两个既有测试随快照结构/贴纸行为更新。

验收结果：批量删除、替换、CLI 事务和 AI 对齐插入都只有一个历史条目 ✅；undo/redo 后 tracks、选择、转场选择和播放头符合命令定义 ✅；异步失败不留半成品（replace 仅在成功后入栈，QTL-002 并发测试覆盖）✅；场景切换的单条目化留在 QTL-010（场景生命周期）。

### P1：补齐专业编辑行为

#### QTL-005 拆分主轨磁吸、普通吸附与联动

相关文件：`packages/editor-core/src/types/project.ts`、`apps/web/src/stores/timeline/types.ts`、`apps/web/src/stores/timeline/timeline-store.ts`、`apps/web/src/components/editor/timeline/timeline-toolbar.tsx`。

验收：三个开关可独立持久化；锁住主轨时主轨磁吸行为明确；旧项目有稳定迁移默认值。

#### QTL-006 扩展吸附候选与优先级

相关文件：`apps/web/src/hooks/timeline/use-timeline-snapping.ts`、`apps/web/src/components/editor/timeline/timeline-ruler.tsx`、`packages/editor-core/src/timeline/transitions.ts`、所有 drag/trim hooks。

验收：片段、播放头、接缝、bookmark、beat 使用统一 8-10 px 容差；同距有确定优先级；Shift 临时禁用；不同 zoom 有参数化测试。

#### QTL-007 补齐 Slide 与 Ripple Trim

相关文件：`apps/web/src/lib/timeline/precision-edit.ts`、`apps/web/src/stores/timeline/timeline-precision-edit-ops.ts`、`apps/web/src/hooks/timeline/use-timeline-precision-edit.ts`。

验收：普通、反向、变速和 handle 不足 fixture 都有纯函数测试；每次手势只产生一个历史命令。

#### QTL-008 强化组合与复合片段边界

相关文件：`apps/web/src/stores/timeline/timeline-group-operations.ts`、`apps/web/src/stores/timeline/timeline-compound-operations.ts`、`packages/editor-core/src/types/timeline.ts`、storage scene/timeline API。

验收：group 的 delete/trim/move 有统一 closure；复合片段升级为有稳定 ID 和版本的子时间线；局部 fps、markers 和 cache namespace 有明确继承规则。

#### QTL-009 增加轨道 profile 与无损迁移

相关文件：`packages/editor-core/src/timeline/validation.ts`、`packages/editor-core/src/types/project.ts`、`packages/editor-core/src/jianying-draft/`、project migration tests。

验收：classic typed、free-layer typed、free-layer mixed 三种 profile 均能 round-trip；未知 profile fail closed，不静默丢素材。

#### QTL-010 完成场景导航与缓存修复

相关文件：`apps/web/src/stores/timeline/scene-store.ts`、`apps/web/src/components/editor/timeline/timeline-toolbar.tsx`、`apps/web/src/hooks/timeline/use-frame-cache.ts`。

验收：场景可真实创建/切换/删除；删除清理对应 timeline DB；hidden/muted/scene/transition 变化都能正确命中或失效缓存。

### P2：建立 AI 与兼容层

#### QTL-011 持久化语义依赖图

目标：让 scene、caption、SFX、BGM、B-roll、AI output 之间有类型化边和用户可覆盖状态。

相关文件：`packages/editor-core/src/types/timeline.ts`、`apps/web/src/lib/timeline/aligned-generated-media.ts`、scene detection/smart split、project serialization。

验收：移动/删除语义场景能预览 dependency closure；用户 unlink 后不会被下一次 AI 操作重新绑定；导出不支持的 link 必须报告而不是静默丢弃。

#### QTL-012 转场 handle 与替换 profile

相关文件：`packages/editor-core/src/timeline/transitions.ts`、`apps/web/src/stores/timeline/timeline-transition-ops.ts`、`apps/web/src/stores/timeline/timeline-element-ops.ts`、预览和原生导出测试。

验收：`reject | clamp | extend-edge` 策略显式；替换后是否保留转场由同一个 preflight 决定；预览与导出使用相同 resolved window。

## 测试基线

本轮运行以下 8 个窄范围测试文件：

```text
packages/editor-core/src/__tests__/composition-plan.test.ts
packages/editor-core/src/__tests__/transitions.test.ts
apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts
apps/web/src/stores/timeline/__tests__/timeline-transition-ops.test.ts
apps/web/src/stores/timeline/__tests__/timeline-precision-edit-ops.test.ts
apps/web/src/stores/timeline/__tests__/timeline-group-operations.test.ts
apps/web/src/stores/timeline/__tests__/timeline-compound-operations.test.ts
apps/web/src/hooks/timeline/__tests__/use-frame-cache.test.tsx
```

结果：**8 个文件全部通过，54 个测试全部通过。** 这说明现有已覆盖能力是稳定基础，但不能反证上面缺少的跨入口、锁定、并发、缓存和语义图测试。

## 不建议的短期方案

- 不要只在 `use-track-drop.ts` 增加更多条件；CLI 和 AI 仍会绕过。
- 不要继续用 `groupId` 同时表示组合、分离音频、AI 对齐和主轨联动。
- 不要把主轨磁吸等同于 ripple toggle，也不要把普通 snapping 等同于主轨磁吸。
- 不要为每个入口各写一套 overlap/ripple 数学。
- 不要为了“看起来支持”而静默近似剪映 profile；不能无损表达时应 fail closed 并给出原因。

## 完成定义

这 19 项不能以“按钮出现了”作为完成标准。每个子任务至少应满足：共享纯函数或命令契约、UI 与 CLI 共用、锁定和失败路径无半套状态、一次操作一次 undo、序列化 round-trip、窄范围单元测试，以及至少一条桌面真实时间线 E2E。
