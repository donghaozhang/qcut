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
| QTL-002 共享 Collision Engine | ⬜ 未开始 | | |
| QTL-003 Ripple Domain 与类型化 Link | ⬜ 未开始 | | 锁定轨排除域已随 QTL-001 落地 |
| QTL-004 扩展事务历史 | ⬜ 未开始 | | |
| QTL-005 ~ QTL-012 | ⬜ 未开始 | | |

## 结论

本轮把剪映研究文档中的时间线行为拆成 **50 个可独立验证的原子规则**，并对照 QCut 当前代码和测试逐项检查：

| 状态 | 数量 | 占比 |
| --- | ---: | ---: |
| 完整实现 | 32 | 64% |
| 部分实现 | 9 | 18% |
| 尚未实现 | 9 | 18% |
| **需要修复或补齐** | **18** | **36%** |

审计基线为 19/50 项需要改动；QTL-001 完成后，**当前还有 18/50 项时间线规则需要代码改动**——9 项已有基础但契约不完整，另有 9 项缺少正式模型或命令。

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
| 插入、覆盖与替换 | 5 | 1 | 2 | 2 | 4 |
| 波纹与主轨磁吸 | 5 | 3 | 1 | 1 | 2 |
| 修剪模式 | 5 | 4 | 0 | 1 | 1 |
| 吸附 | 5 | 3 | 0 | 2 | 2 |
| 关联、组合与复合片段 | 5 | 3 | 1 | 1 | 2 |
| 转场 | 5 | 4 | 1 | 0 | 1 |
| 撤销与重做 | 3 | 2 | 1 | 0 | 1 |
| 导航与缓存 | 3 | 1 | 2 | 0 | 2 |
| AI 语义规则 | 2 | 1 | 0 | 1 | 1 |
| **总计** | **50** | **32** | **9** | **9** | **18** |

## 50 项规则明细

### 1. 轨道类型与操作：6 完整，0 部分，1 缺失

**完整：** 明确的轨道类型、显式 `isMain`、稳定 `order`、新增/重排、显隐与静音/独奏。核心定义位于 [`timeline.ts`](../../../packages/editor-core/src/types/timeline.ts) 和 [`track-utils.ts`](../../../packages/editor-core/src/timeline/track-utils.ts)。

**完整（QTL-001，2026-08-04 落地）：轨道锁定。** 锁定契约现在由 [`lock-contract.ts`](../../../packages/editor-core/src/timeline/lock-contract.ts) 的纯函数 preflight 统一执行，经 [`timeline-lock-guard.ts`](../../../apps/web/src/stores/timeline/timeline-lock-guard.ts) 接入全部 Store 内容命令入口（crud、element、track、media-timing、transition、effects、compound、group）。策略：显式目标命中锁定轨时整个命令 fail closed（无状态变化、无历史条目）；派生集合（ripple 位移域、"全轨道"默认、广域字幕样式）跳过锁定轨；轨道元数据（静音/隐藏/高度/重命名/排序/解锁本身）不属于内容编辑，保持可用。矩阵测试见 [`timeline-lock-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-lock-contract.test.ts)（26 用例）与 editor-core 单元测试（8 用例）。

**缺失：项目级轨道 profile。** 当前兼容性校验固定为 typed tracks，没有 `classic`、`free-layer`、`mixed-material` 三种模式，也无法无损表达剪映开启自由层级和素材混排后的工程。相关代码是 [`validation.ts`](../../../packages/editor-core/src/timeline/validation.ts)。

额外迁移风险：当已有轨道全部带 `order` 且缺少主轨时，`ensureMainTrack()` 给新主轨分配最后一个顺序值；需要用测试确认它不会落到音频轨下方。

### 2. 层级与渲染：4 完整，1 部分

**完整：** QCut 已有统一 composition plan；UI 轨道按上到下保存，合成按下到上绘制；隐藏轨道和隐藏元素可从视觉合成排除；音频轨独立进入混音；媒体支持透明度。实现位于 [`composition-plan.ts`](../../../packages/editor-core/src/timeline/composition-plan.ts)。

**部分：混合模式。** `MediaBlendMode` 当前只有 `normal`、`multiply`、`screen`、`overlay`、`darken`、`lighten` 六种，而且还需要用同一组 golden frames 证明预览、原生导出和草稿导出一致。这里不建议先堆更多枚举，应该先建立跨渲染器契约测试。

### 3. 插入、覆盖与替换：1 完整，2 部分，2 缺失

**完整：自动堆叠到新轨。** `addMediaAtTime()` 会寻找同类型空闲轨道，全部占用时新建轨道，见 [`timeline-add-ops.ts`](../../../apps/web/src/stores/timeline/timeline-add-ops.ts)。

**部分：同轨不重叠不变量。** 拖拽 UI 会拒绝重叠，但底层 `addElementToTrack()` 和多个 Store 调用没有统一冲突检查。当前行为取决于入口，不能作为 CLI 或自动化的稳定契约。

**部分：替换。** `replaceElementMedia()` 已能导入新文件并更新素材引用，但它会用新素材时长直接改写片段时长，可能破坏接缝和转场。~~它也没有锁定检查；该异步函数在导入前捕获 `_tracks`，完成后仍用旧快照写回~~——锁定检查（入口 + 导入完成后复检）和旧快照写回已随 QTL-001 修复：导入完成后重读当前 timeline 并重验元素仍存在。剩余缺口是时长/转场保留策略（归 QTL-002/012）。实现位于 [`timeline-element-ops.ts`](../../../apps/web/src/stores/timeline/timeline-element-ops.ts)。

**缺失：显式 Insert 命令。** 当前没有“切开落点并向后移动波纹域”的原子命令。

**缺失：显式 Overwrite 命令。** 当前没有“只移除目标区间、保留后续时间位置”的区间命令。

### 4. 波纹与主轨磁吸：3 完整，1 部分，1 缺失

**完整：** 同轨移动波纹、同轨删除波纹和显式区间删除已经有 Store 操作与测试，见 [`timeline-element-ops.ts`](../../../apps/web/src/stores/timeline/timeline-element-ops.ts)、[`timeline-track-ops.ts`](../../../apps/web/src/stores/timeline/timeline-track-ops.ts) 和 [`timeline-ripple-ops.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts)。

**部分：跨轨联动波纹。** `deleteSelectedElementsWithRipple()` 把所有轨道放入 ripple 集合；`removeTrackWithRipple()` 也会根据被删轨道的占用区间移动所有剩余轨道。锁定排除域已随 QTL-001 落地（锁定轨在所有 ripple 路径中保持原位），但仍没有"主轨域、显式关联域"模型，可能移动无关轨道。分组片段移动时又会跳过普通 ripple 逻辑，行为并不统一。

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

**缺失：类型化依赖图。** 目前没有 `video-audio`、`caption-owner`、`effect-target`、`semantic-scene` 等 link 类型，也没有删除/移动前计算依赖闭包和单边 unlink 的持久化模型。

复合片段本身可创建和解除，但当前是一个 `MediaElement.compound.clips[]` 容器，不是可进入编辑、拥有独立 fps/标记/缓存版本的真正子时间线。因此这部分应在“类型化依赖图”之后继续演进，而不是把更多职责塞入 `groupId`。

### 8. 转场：4 完整，1 部分

**完整：** 同轨相邻视频接缝资格、增删改、时长 clamp、相邻转场共享 handle 限制和失效转场清理已经有统一 core 函数。每次 `updateTracksAndSave()` 都会调用 reconcile，见 [`transitions.ts`](../../../packages/editor-core/src/timeline/transitions.ts)、[`timeline-transition-ops.ts`](../../../apps/web/src/stores/timeline/timeline-transition-ops.ts) 和 [`timeline-store-autosave.ts`](../../../apps/web/src/stores/timeline/timeline-store-autosave.ts)。

**部分：handle 不足与替换策略。** 当前策略是 clamp 或拒绝，没有剪映式边缘帧延展 profile。媒体替换也没有显式声明“保留目标时间槽、重算 handle、保留或移除转场”的规则。基础转场不变量已经可靠，不应重写；只需在其上增加策略层。

### 9. 撤销与重做：2 完整，1 部分

**完整：** 轨道数组可以 undo/redo，转场和 precision edit 都能作为单次历史操作恢复。

**部分：历史快照范围。** 当前 `history` 与 `redoStack` 只保存 `TimelineTrack[][]`。选择、当前转场、播放头、场景切换、异步素材导入和跨 Store 操作不在同一事务中。`selectElement()` 的 multi 分支还会把同一个新选择追加两次，说明选择状态需要独立不变量测试。实现位于 [`timeline-store.ts`](../../../apps/web/src/stores/timeline/timeline-store.ts) 和 [`timeline-store-persistence.ts`](../../../apps/web/src/stores/timeline/timeline-store-persistence.ts)。

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
| P0 | linked ripple 实际可移动全部轨道 | 无关轨道或锁定轨道可能被时间平移 | 🔶 锁定轨已排除（QTL-001）；无关轨道待 QTL-003 |
| P0 | `replaceElementMedia()` 异步写回旧 `_tracks` | 等待导入期间的用户编辑可能被覆盖 | ✅ 已修复（QTL-001） |
| P0 | 冲突检查不在 domain command 层 | 同一操作从 UI、CLI、AI 入口得到不同结果 | ⬜ 待 QTL-002 |
| P1 | 历史只保存 tracks | undo 后选择、播放头和跨 Store 状态可能不一致 | ⬜ 待 QTL-004 |
| P1 | 帧缓存忽略 `track.hidden` | 隐藏轨道后可能短暂显示旧缓存帧 | ⬜ 待 QTL-010 |
| P1 | multi-select 重复追加选择 | 选择计数和批量命令输入可能重复 | ⬜ 待 QTL-004（需先复现） |
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

#### QTL-002 建立共享 Collision Engine

目标：把 `append | insert | overwrite | replace | stack` 做成显式 command 参数，UI、CLI 和 AI 共用一套区间算法。

相关文件：

- `packages/editor-core/src/timeline/collision-policy.ts`：建议新增纯函数模块。
- `apps/web/src/stores/timeline/timeline-add-ops.ts`
- `apps/web/src/stores/timeline/timeline-store-crud.ts`
- `apps/web/src/stores/timeline/timeline-element-ops.ts`
- `apps/web/src/components/editor/timeline/use-track-drop.ts`
- `electron/native-pipeline/`：CLI 只调用共享命令，不复制区间逻辑。

验收：同一 fixture 经 UI/CLI 调用得到字节等价 timeline；普通 add API 不能制造非法同轨重叠；replace 在异步完成时重新读取当前 timeline，并有并发编辑测试。

#### QTL-003 建立 Ripple Domain 与类型化 Link

目标：明确主轨域、当前轨域、选择域和依赖域，替代“全部轨道”与通用 `groupId` 推断。

相关文件：

- `packages/editor-core/src/types/timeline.ts`：新增 versioned link graph 和 ripple domain 类型。
- `packages/editor-core/src/timeline/ripple-plan.ts`：建议新增 dry-run 计划器。
- `apps/web/src/stores/timeline/timeline-track-ops.ts`
- `apps/web/src/stores/timeline/timeline-element-ops.ts`
- `apps/web/src/stores/timeline/timeline-media-timing-ops.ts`
- `apps/web/src/lib/timeline/aligned-generated-media.ts`

验收：主轨删除只移动主轨和显式 linked 依赖；无关 overlay 不动；锁定依赖阻止半套提交；undo 一次完整恢复。

#### QTL-004 扩展事务历史

目标：历史命令保存可恢复的编辑状态，而不是只保存 tracks。

相关文件：

- `packages/editor-core/src/commands/history.ts`
- `apps/web/src/stores/timeline/timeline-store.ts`
- `apps/web/src/stores/timeline/timeline-store-persistence.ts`
- `apps/web/src/stores/editor/playback-store.ts`
- `apps/web/src/stores/timeline/scene-store.ts`

验收：批量删除、替换、场景切换和 AI 对齐插入都只有一个历史条目；undo/redo 后 tracks、选择、转场选择和播放头符合命令定义；异步失败不留下半成品。

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
