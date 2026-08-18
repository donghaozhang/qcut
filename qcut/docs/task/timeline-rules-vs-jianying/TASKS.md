# 对齐剪映时间线：任务分解（只读代码规划，未动手）

日期：2026-08-18 · 依据：[README.md](README.md)（规则对照）+
[TRACK-TYPES.md](TRACK-TYPES.md)(轨型对照)。所有锚点都实读过代码。

任务间关系：T0 是 T1 的前置；T2 依赖 T1 的磁性语义；T3/T4/T5 相互独立；
T6 需要产品决策先行；T7 是零星小项。建议顺序 T0 → T1 → T3 → T4 → T2 →
T5，T6/T7 视决策插入。

---

## T0 · 修 resize 重叠缺陷（前置，缺陷级）

**目标**：resize/trim 不再能把片段拉到邻居身上（QTL-002 破口，README
B1）。这不是对齐剪映——是磁吸 trim（T1）必须踩在合法的碰撞域上。
已有后台任务卡片（task_96965115）。

**现状锚点**：`use-timeline-element-resize.ts:109` 的
`timelineDelta = deltaX / (50 * zoomLevel)` 之后没有任何邻居检查；
store 侧 `updateElementTrim` / `updateElementDuration`
（`timeline-store-crud.ts:590-649`）原样写入。

**改动文件**
- `apps/web/src/hooks/timeline/use-timeline-element-resize.ts` — 核心
- `apps/web/src/hooks/timeline/__tests__/`（回归测试，新增或扩展）

**核心改动**：resize 开始时缓存同轨邻居的 [start,end) 区间；每次
pointermove 把 delta 钳制在「不与任何邻居相交」的最大值（左缘向左 ≤
左邻居 end，右缘向右 ≤ 右邻居 start），复用
`packages/editor-core/src/timeline/collision-policy.ts` 的
`findRangeCollisions` 做校验断言。store setter 保持哑（现有注释明确
「guarding trim ranges is the caller's responsibility」），钳制留在
hook 层。

**验收**：两段相邻片段，右拉左段 trim 手柄越过右段起点 → 停在邻居
边缘，不产生重叠。

---

## T1 · 主轨磁性全路径 + 默认开（中）

**目标**：复刻剪映主轨「永不留洞、双向联动」（实验 E1/E6/E10）。现状
QCut 磁吸只覆盖**删除**路径且默认关。

**现状锚点**
- 默认值：`packages/editor-core/src/types/project.ts:121-125`
  `mainTrackMagnetEnabled: false`
- 已有的删除磁吸：`timeline-store-crud.ts:461-488`（QTL-005「主轨永不
  留洞」，`magnetApplies` → `removeElementFromTrackWithRipple`）
- trim 不联动：`updateElementTrim` 原样写（:590-619）；ripple-trim 是
  独立 precision op 且吃 `rippleEditingEnabled` 开关
  （`timeline-precision-edit-ops.ts:160-214`）
- 下游平移的现成数学：`timeline-track-ops.ts:339-378`（删除 ripple 的
  左移）、`timeline-media-timing-ops.ts:94-115`（变速时长差平移，含
  `DURATION_EPSILON` 边界处理——**这段就是磁吸 trim 要的形状**）

**改动文件**
- `packages/editor-core/src/types/project.ts` — 默认值翻转
- `apps/web/src/hooks/timeline/use-timeline-element-resize.ts` — trim
  提交路径接磁吸
- `apps/web/src/stores/timeline/timeline-store-crud.ts` — 新增磁吸
  trim 提交命令（或扩展现有 setter 的磁吸分支）
- `apps/web/src/stores/timeline/timeline-precision-edit-ops.ts` —
  ripple-trim 在 `magnetApplies` 时绕过 `rippleEditingEnabled` 门

**新增文件**
- `packages/editor-core/src/timeline/magnet-plan.ts` — 纯函数：
  `applyMainTrackMagnet({elements, changedElementId, oldEndTime,
  newEndTime})` → 对 `startTime >= oldEndTime` 的元素统一平移
  `newEnd - oldEnd`（负=拉拢、正=推挤），带 epsilon 与 ≥0 钳制
- `packages/editor-core/src/timeline/__tests__/magnet-plan.test.ts`

**核心改动**：主轨上任何改变某片段 end 时间的操作（右缘 trim、时长
变化、变速）在 `mainTrackMagnetEnabled && track.isMain` 时调用
magnet-plan 平移下游——方向双向；左缘 trim 改变 start 时间时对称处理
（前段不动，本段吸附前邻居 end？剪映实测左缘 trim 是本段变短、下游
拉拢——即以「本段旧 end」为锚平移下游）。删除路径保持现状。**联动只
限主轨自身**（E10 实测：剪映浮层轨不跟动），不要接入 linkedRipple 域。

**默认值迁移注意**：`resolveProjectTimelineSettings`（project.ts:128-134）
把持久化值覆盖在默认值上——老项目里显式存过 false 的会保持 false。
决策点：只翻新项目默认（安全），还是加一次性迁移（激进）。建议前者。

**验收**：在 QCut 里复刻 E1（删中段闭合）、E6（缩短拉拢）、E10（伸长
推挤、上方文本轨不动）三个实验，行为与剪映截图一致。

---

## T2 · 主轨换序拖拽（中大）

**目标**：复刻 E2/E2b——主轨内拖拽=换序：拖过邻居中点两段交换、松手
永远无缝；拖不过中点弹回。这是磁性时间线的核心手感。

**现状锚点**
- 自定义鼠标拖拽路径：`timeline-track.tsx:110-345`（5px 阈值提升为
  drag，:165-171 时间换算，:288-302 松手 overlap 检测「无 else 分支」
  静默弹回）
- 单元素 DragState：`timeline-add-ops.ts:39-70`
- 碰撞拒绝：`timeline-group-operations.ts:112-192`（引用相等约定）

**改动文件**
- `apps/web/src/components/editor/timeline/timeline-track.tsx` — 主轨
  磁吸态下的 mousemove/mouseup 分支
- `apps/web/src/stores/timeline/timeline-add-ops.ts` — DragState 增加
  `insertionIndex`（磁吸拖拽的预演落位）
- `apps/web/src/components/editor/timeline/timeline-element.tsx` —
  拖拽中其它片段的「让位」预演渲染（:335-342 现在只挪被拖元素）

**新增文件**
- `packages/editor-core/src/timeline/reorder-plan.ts` — 纯函数：
  `resolveMainTrackReorder({elements, draggedId, pointerTime})` →
  {targetIndex, packedLayout}（按邻居中点判定插入位，重排后从 0 起
  顺次紧排 startTime）
- `apps/web/src/stores/timeline/timeline-reorder-ops.ts` — store 命令
  `reorderMainTrackElement(trackId, elementId, targetIndex)`：splice +
  紧排 + 一条 history
- 对应测试两份

**核心改动**：磁吸开且拖拽发生在主轨内部时，不走「自由移动+碰撞拒绝」
而走 reorder-plan：mousemove 实时算 targetIndex 并让其它片段预演让位
（视觉平移即可，不写 store）；mouseup 提交 `reorderMainTrackElement`。
拖出主轨（跨轨）回落到现有 `moveElementToTrack` 路径。非主轨与磁吸关
时行为完全不变。

**验收**：复刻 E2（拖中段松手弹回原位）与 E2b（拖过头部换序无缝）。

---

## T3 · 播放头插入式添加（小）

**目标**：复刻 E-add——素材面板 + 号在播放头处**插入主轨并右推**，
而不是找空 lane / 叠新轨。

**现状锚点**
- 现行为：`timeline-add-ops.ts:76-116` addMediaAtTime（lane 搜索 +
  叠轨，注释「Never reject a drop as overlapping」）
- **原语已存在**：`addElementToTrack` 的 `collision:'insert'` 分支
  （`timeline-store-crud.ts:291-297` → `insertGapInElements`,
  `timeline-collision-utils.ts:126-179`——切割占位者+右推下游）
- 调用点：`media-item-card.tsx:92-94`、`use-media-actions.ts:207-216`

**改动文件**
- `apps/web/src/stores/timeline/timeline-add-ops.ts` — 核心：
  `addMediaAtTime` 在磁吸开、素材为视觉类时改走
  `addElementToTrack(mainTrackId, …, {collision:'insert'})`；音频保持
  lane 语义（剪映音频也不插主轨）
- `apps/web/src/stores/timeline/__tests__/`（或既有测试位置）补用例

**核心改动**：一个分支 + 现有原语接线。插入点取播放头；磁吸关时保持
现行 lane 行为。文本/贴纸不动（剪映它们也走浮层）。

**验收**：播放头停在片段中间点 +，占位片段被切割、右半与后续整体右移
（与剪映 E-add 一致）；磁吸关时行为回到现状。

---

## T4 · 时间线内拖拽建轨（小中）

**目标**：复刻 E3——把已有片段在时间线内往上/下拖进空白区或轨道间隙
时自动建新轨（现在只有素材面板拖放有这个能力）。

**现状锚点**
- 面板拖放的 zone 数学：`use-track-drop.ts:410-418`（<20px above、
  >40px below、else on）与建轨逻辑 :543-815
- 时间线内鼠标拖拽的跨轨路径：`timeline-track.tsx:317-338`——只会
  `moveElementToTrack` 到**已存在**的轨
- 空源轨回收已就位：`timeline-store-crud.ts:585`

**改动文件**
- `apps/web/src/components/editor/timeline/timeline-track.tsx` /
  `timeline-tracks-area.tsx` — mouseup 时识别「落点不在任何 lane 内 /
  在 lane 间隙」→ 建轨再移入
- `apps/web/src/components/editor/timeline/use-track-drop.ts` — zone
  判定抽出为共享函数

**新增文件**
- `apps/web/src/components/editor/timeline/track-drop-zones.ts` —
  纯函数：`resolveDropZone({pointerY, lanes})` → {kind:
  "on"|"above"|"below"|"empty-above"|"empty-below", index}，两条路径
  （HTML5 drop 与自定义 mouse drag）共用
- 测试一份

**核心改动**：zone 解析统一后，mouse 拖拽的 mouseup 分支在 above/
below/空白区调用 `insertTrackAt(elementType 对应轨型, index)` + 
`moveElementToTrack`；类型→轨型沿用 `canElementGoOnTrack`
（validation.ts:11-35）。

**验收**：复刻 E3：主轨片段上拖到空白区 → 新轨承接、允许留空；拖回
主轨后空轨自动回收（已有行为）。

---

## T5 · 区间特效段（大，两阶段）

**目标**：复刻 J3——特效作为**轨道段**存在，作用于时间范围内其下所有
层。这是轨型对照里同构度最低的一项，也是特效实验室区间应用的前提。

**现状锚点**
- 模型已备一半：`EffectElement {type:"effect", targetElementId,
  effect: EffectInstance}`（editor-core types/timeline.ts:955-959）、
  `effect` 轨型 priority 4.75——但**全仓零调用点创建 effect 轨**
  （track-model 审读结论）
- 渲染现状：特效按 elementId 存于 `effects-store.ts`（
  `getElementEffects(elementId)`），经
  `use-effects-rendering.ts` 出 `filterStyle`（CSS filter）/
  `renderProgram`（WebGL）**逐片段**应用
- 合成计划：`composition-plan.ts:116-201` 按 order 反向走非音频轨——
  effect 元素会进 plan 但渲染器没有分支
- 导出：`export-engine-renderer.ts` / `export-engine-utils.ts:34` 同
  一套 plan

**改动文件**
- `packages/editor-core/src/types/timeline.ts` — `targetElementId` 改
  optional：无 target = 区间特效
- `packages/editor-core/src/timeline/composition-plan.ts` — plan 输出
  增加 `regionEffects`: 每个 effect 元素带 {timeRange, drawOrder,
  effect}，并保序（作用于 drawOrder 低于它的层）
- `apps/web/src/components/editor/preview-panel.tsx` +
  `preview-element-renderer.tsx` — 渲染时把「当前时间命中的区间特效」
  合成到其下层的容器上（CSS filter 可以包一层 wrapper div；WebGL
  renderProgram 走离屏合成）
- `apps/web/src/lib/export/export-engine-renderer.ts` — 导出同构应用
- `apps/web/src/stores/timeline/timeline-add-ops.ts` — 新命令
  `addEffectAtTime(preset, currentTime)`：`findOrCreateTrack("effect")`
  + 默认 3s 段
- `apps/web/src/components/editor/media-panel/views/effects.tsx` — UI
  入口（无选中片段时 + 号建区间段，或右键菜单「应用为区间特效」）
- `apps/web/src/components/editor/properties-panel/` — effect 元素的
  参数面板分支（adjustParameters 滑杆，剪映每特效 7± 项）

**新增文件**
- `apps/web/src/lib/effects/region-effects.ts` — 纯函数：
  `resolveActiveRegionEffects({plan, time})` → 合并后的
  filterStyle/renderProgram/参数
- 测试若干

**核心改动（阶段 1）**：只支持浏览器可渲染的特效（CSS filter /
`EffectRenderProgram` WebGL 预设）——这已覆盖 EFFECT_CATALOG 全部内置
特效。**阶段 2**：`engine:"jianying-local"` 的本机运行时特效走主进程
逐帧渲染，区间应用需要「下层先合成→送 native 管线→回贴」的离屏通路，
另立任务（依赖 CV 效果通路的帧回读能力）。

**验收**：复刻 J3——雨滴段盖在贴纸+主轨上，预览与导出中粒子作用于其
下所有层；段可拖动/裁剪/删除如普通元素。

---

## T6 · 浮层层级模式「后加者居上」（中；产品决策先行）

**目标**：可选复刻 J1b——剪映浮层轨按添加时序叠放（后加最顶），QCut
现为类型分层（TRACK_PRIORITY，文本永远压贴纸）。**不建议直接改世界
观**：现有项目、合成计划、导入导出都建立在类型序上；建议做成 per-
project 模式开关，默认保持现状。

**现状锚点**
- 类型序：`track-utils.ts:12-23`（TRACK_PRIORITY）+ `normalizeTrackOrder`
  :48-85（显式 order 优先，legacy 才按类型排）
- 插入约定：文本/markdown 恒 index 0（`timeline-store.ts:274-297`）、
  贴纸 index 0、adjustment 在最顶 media 上（`adjustment-layer.ts:23-44`）、
  media 在 media 组尾、audio 追加底部（`timeline-add-ops.ts:93-104`）
- 渲染就是 order 反向（composition-plan.ts:163-167），**渲染层不用改**

**改动文件**
- `packages/editor-core/src/types/project.ts` — 新设置
  `overlayStacking: "byType" | "byArrival"`（默认 byType）
- `apps/web/src/stores/timeline/timeline-add-ops.ts` +
  `timeline-store.ts` findOrCreateTrack — byArrival 时所有浮层轨型
  （text/captions/markdown/sticker/adjustment/effect）一律
  `insertTrackAt(type, 0)`
- `packages/editor-core/src/timeline/track-utils.ts` — byArrival 时
  legacy 排序退化为「保持数组序」（显式 order 项目本就不重排，改动
  面很小）
- 设置 UI 一处（timeline toolbar 或项目设置）

**核心改动**：因为现代项目已用显式 `order` 且渲染按 order，真正要改的
只有「新轨插到哪」这一个决策点。byArrival = 永远插 0。

**验收**：byArrival 模式下复刻 J1/J1b 的叠放时序；byType 模式回归测试
全绿；剪映导入的草稿在 byArrival 下保持原遮挡关系。

---

## T7 · 零星小项（微）

| 项 | 改动 | 备注 |
|---|---|---|
| 文本默认时长 3s | `timeline-constants.ts:174` `DEFAULT_TEXT_DURATION: 5→3` + 相关测试 | 纯产品口味，与剪映一致但 5s 也自洽 |
| 滤镜/调节段默认时长 | `adjustment-layer.ts:45-49` 由「播放头→项目尾」改为固定 3s 段（或加参数） | 剪映滤镜/调节都是 ≈3s 段；QCut 现语义（到结尾）对「整片调色」更好用——建议不改，或在 T6 的模式开关下联动 |
| 脚本贴纸插主轨 | 不复刻 | 剪映特例（数据图表），互导层已挡 opaque |

---

## 不需要做的（已同构，防止重复立项）

无重叠不变量（QTL-002 ↔ TRACK_OVERLAP）、空轨自动回收、主轨永存
（ensureMainTrack）、吸附框架（目标集 QCut 更多）、拖放占用弹回、自由
轨间隙、贴纸/文本自动建轨、音频落底 + 播放头起点、调节层模型、
分割语义、微秒/帧对齐。
