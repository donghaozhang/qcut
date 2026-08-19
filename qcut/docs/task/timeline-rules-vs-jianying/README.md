# 时间线规则对照：QCut vs 剪映

日期：2026-08-18 · 分支：`labs-default-access`

## 来源与方法

**QCut 侧**：从代码逐条提取（store 88 条规则，四路并行审读：store 核心 /
拖拽吸附 UI / 轨道模型 / 剪映草稿互导层）。绝大多数断言带 file:line，
少数引用只到文件级（如 [time.ts]、[use-timeline-snapping.ts]）。

**剪映侧**：实机操作剪映专业版（macOS，草稿 `8月18日`，官方素材白场/黑场
5s 各若干段），逐项实验并截图核对。**不是**凭产品印象写的——下面每条
「剪映实测」都对应一次真实操作。互导层（`packages/editor-core/src/
jianying-draft/`）编码的 draft 格式事实作为第三方印证。

## 一句话模型

- **剪映**：**磁性主轨 + 自由轨**二元世界。主轨（第一条视频轨）永不留洞：
  删除闭合、缩短拉拢、伸长右推、拖拽换序、插入右推；其余轨道（画中画/
  文本/贴纸/音频）自由摆放允许间隙。磁性不可关（draft 里
  `config.maintrack_adsorb: true` 是常量，[constants.ts:81]）。
- **QCut**：**统一自由轨** + 三个开关。所有轨道同一套规则：无重叠不变量
  （QTL-002，半开区间 [start,end)），自由放置，碰撞即拒绝；主轨磁性
  （`mainTrackMagnetEnabled`）、ripple（`rippleEditingEnabled`）、吸附
  （`snappingEnabled`）都是显式开关。**出厂默认：磁性关、ripple 关、
  吸附开**（[project.ts:121-125]、[timeline-store.ts:70]）。

差距的本质不在数据模型（两边同构程度很高），而在**默认交互语义**：
剪映把磁性当世界观，QCut 把它当选项。

## 逐规则对照

### 1. 素材入轨

| # | 场景 | 剪映实测 | QCut 现状 | 差距 |
|---|------|---------|-----------|------|
| 1.1 | 素材面板点 + | **播放头处插入主轨，已有片段右推**（实测：依次加白/黑/黑，播放头停 0，结果顺序黑黑白——每次都插到 0 并推开前者） | `addMediaAtTime`：放在播放头处**第一条有空位的同型轨**，全占则**叠新轨**，从不推挤（[timeline-add-ops.ts:76-116]） | **语义不同**。QCut 的 `addElementToTrack` 其实有 `collision:'insert'` 原语（切割占位者+右推，[timeline-store-crud.ts:291-297]），但面板点击路径不用它 |
| 1.2 | 拖到轨道间隙/上方 | 任意上拖即建新画中画轨（实测 E3） | 面板拖放有 above/below 落区建新轨（[use-track-drop.ts:410-418]），但**时间线内拖动已有片段**只能落到已存在的轨道（`moveElementToTrack`） | **QCut 缺**：已有片段上拖建轨 |
| 1.3 | 拖放到已占用区间 | 弹回原位（实测 E2，拖到邻居中段松手回原地） | 同：碰撞拒绝、弹回（引用相等检测，[timeline-group-operations.ts:112-116]） | 一致 |
| 1.4 | 文本入轨 | 落在拖放 x 位置，新文本轨在主轨上方，**默认 3s** | 永远新建文本轨于最顶（index 0），**默认 5s**（[timeline-add-ops.ts:121]、`DEFAULT_TEXT_DURATION`） | 默认时长 3s vs 5s；建轨策略近似（剪映是否复用已有文本轨未对测） |
| 1.5 | 图片默认时长 | 素材库黑白场为 5s 素材 | `DEFAULT_IMAGE_DURATION` 5s | 一致 |

### 2. 主轨磁性

| # | 场景 | 剪映实测 | QCut 现状 | 差距 |
|---|------|---------|-----------|------|
| 2.1 | 删除主轨中段 | **必闭合**（实测 E1：删中段，后段左滑贴上，总时长 15→10s） | 默认**留洞**；`mainTrackMagnetEnabled && isMain` 或 ripple 开才闭合（QTL-005"主轨永不留洞"，[timeline-store-crud.ts:461-488]）——**机制已有，默认关** | **默认值差**：把 `mainTrackMagnetEnabled` 默认改 true 即对齐 |
| 2.2 | 主轨内拖拽 | **换序**（实测 E2b：白场拖过黑场头部→两段交换，全程无缝） | 无换序语义：目标区间被占即拒绝 | **QCut 缺**：磁性换序拖拽 |
| 2.3 | 主轨缩短（右缘左拉） | **下游自动左移贴上**（实测 E6：白场 5→3.27s，黑场立即跟进，无洞） | `updateElementTrim` 原样写入不联动（[timeline-store-crud.ts:590-619]）；resize hook **无邻居检查**；ripple-trim 是独立 precision op 且需 ripple 开 | **默认行为差** + 见 2.5 |
| 2.4 | 主轨伸长（右缘右拉） | **下游被推开**（实测 E10：白场拉回 5.47s，黑场后移；上方文本轨不动） | resize 无邻居检查——伸长会**直接压到邻居上**（重叠！） | **QCut 缺陷级差异**，见下 |
| 2.5 | resize 重叠不变量 | 不可能产生重叠 | `use-timeline-element-resize` 与 `updateElementTrim`/`updateElementDuration` 都不做重叠校验（[use-timeline-element-resize.ts:109]、store raw setters）——**违反自家 QTL-002** | 独立缺陷，已另立 task |
| 2.6 | 主轨 ripple 是否波及自由轨 | **不波及**（实测 E10：主轨推挤时文本片段纹丝不动） | linked ripple 只沿 groupId 链接域传播，unrelated 轨不动（QTL-003，[ripple-plan.ts:10-17]） | 一致（QCut 的 linked-ripple 域还更精细） |

### 3. 轨道模型

| # | 场景 | 剪映实测/格式事实 | QCut 现状 | 差距 |
|---|------|---------|-----------|------|
| 3.1 | 主轨概念 | 第一条视频轨隐式为主轨（5.9 无显式字段；CapCut 8.1 用 flag=0/2 区分，[capcut-8-1-content.ts:507-515]） | 显式 `isMain`，`ensureMainTrack` 自动创建"主轨道"、永不删除、空了不回收（[track-utils.ts:141-165]） | 同构；导出时按"QCut 底部视觉轨 = 剪映主轨"反转映射（[build.ts:295-319]） |
| 3.2 | 空轨回收 | 画中画轨清空即消失（实测 E3→拖回主轨后轨道消失） | `.filter(t => t.elements.length>0 \|\| t.isMain)`（[timeline-store-crud.ts:456]） | 一致 |
| 3.3 | 轨道上下秩序 | 文本在上、画中画中间、主轨、音频最下 | `TRACK_PRIORITY`：text 1 … sticker 4 … media 5、audio 6；显式 `order` 可自由重排（[track-utils.ts:12-23]） | 哲学一致；QCut 10 种轨型更多且可手动重排（剪映不可重排轨道） |
| 3.4 | 自由轨允许间隙 | 允许（实测 E3 黑场落 5.6s 前面留空） | 所有轨允许 gap | 一致 |
| 3.5 | mute/lock/hidden | 轨头有锁/眼/静音钮（未逐项对测） | muted 只管音频、hidden 从合成计划剔除、locked 阻编辑不阻渲染（QTL-001 fail-closed + 派生域静默跳过） | 近似；draft 格式里 attribute 位表 0/1/4/5 与 QCut 双旗对映（[build.ts:114-121]） |

### 4. 吸附与播放头

| # | 场景 | 剪映实测 | QCut 现状 | 差距 |
|---|------|---------|-----------|------|
| 4.1 | 边缘吸附 | 拖拽时吸附相邻片段边缘（实测 E5：跨轨对齐精确落位） | 吸附目标：元素两缘、转场缝、播放头、书签；阈值 10px；Shift 临时绕过；关吸附则按帧对齐（QTL-006，[use-timeline-snapping.ts]） | 一致；QCut 目标集更多（书签、音频节拍网格） |
| 4.2 | 播放头 | 点刻度 seek、分割在播放头处（实测 E8：一分为二右半选中） | 同：scrub/click-seek 帧对齐；`splitElement` 左半留原 id、边缘分割拒绝 | 一致 |

### 5. 互导层已固化的剪映格式事实（第三方印证）

- 时间单位：**整数微秒**，`Math.round(s×1e6)`，帧对齐校验在整数域算
  （避免 122.99999999999999 假阴性）（[time.ts]、[qcut-mapping.ts:198-216]）
- `target_timerange` = 时间线占位，`source_timerange` = 源内读取，
  source = target × speed（[media-mapping.ts:172-235]）
- 同轨 target 区间重叠 = 导入错误 `TRACK_OVERLAP`——**剪映格式本身也
  持无重叠不变量**，与 QTL-002 同构（[import/validation.ts:80-124]）
- `config.maintrack_adsorb: true` 恒写——磁性是格式级默认
- 变速：QCut 只导常速（`curve_speed: null`）；曲线变速/倒放/定格都是
  阻断错误；关键帧只认 beta4 线性 X 位移一种形状，其余 opaque
- 能力格 exact/downgrade/opaque/blocked 管什么能往返——详见
  `packages/editor-core/src/draft-interop/capability.ts`

## 到底差多少（总评）

**数据模型层：设计目标几乎同构。** 无重叠不变量（成文当日 QCut 的
resize/trim 路径尚有 B1 执行缺口，T0 已补——见 TASKS.md 状态行）、
主轨概念、空轨回收、轨道类型
上下秩序、自由轨间隙、吸附框架、微秒/帧对齐——两边一致，互导层能建起
四方言 profile 也印证了这点。QCut 还多出剪映没有或未对测的：显式轨道
重排、10 种轨型、slip/slide/roll/ripple-trim 精修、linked-ripple 域、
分组原子移动、marquee 多选、书签与节拍吸附。

**交互默认层：三条真差距 + 一条缺陷。**（下表所有行已于 2026-08-18
全部落地——PR #419，随 v2026.08.18.2 发布；见文末收敛记录。）

| 差距 | 大小 | 对齐路径 |
|------|------|----------|
| G1 磁性默认关 | 一行 | `DEFAULT_PROJECT_TIMELINE_SETTINGS.mainTrackMagnetEnabled` → true（2.1 即对齐；但 2.3/2.4 的 trim 路径不走磁吸，还需把 magnet 扩展到 trim/伸长） |
| G2 主轨换序拖拽 | 中 | 新交互：拖拽跨过邻居中点时预演换序（磁性时间线的核心手感，无现成原语） |
| G3 播放头插入式添加 | 小 | 面板 + 按钮改走 `collision:'insert'`（原语已在 [timeline-store-crud.ts:291-297]，纯 UX 接线） |
| G4 时间线内上拖建轨 | 小-中 | 自定义 mouse 拖拽路径补 above/below 落区（面板拖放已有同逻辑可复用） |
| **B1 resize 可造重叠** | 缺陷 | resize/trim 路径补 QTL-002 校验（无关对齐剪映，是自家不变量破口） |

**一句话回答「差多少」**：底盘不差——差的是出厂姿态。QCut 以
Premiere 式自由时间线出厂，剪映是 iMovie/FCP 式磁性时间线；QCut 的
磁性机制（QTL-005）已存在但默认关闭且只覆盖删除路径。把 G1 默认翻转 +
磁吸补到 trim 两侧 ≈ 剪映手感的 70%；G2 换序拖拽是剩下 30% 里最贵也
最点睛的一块。

## 收敛记录（2026-08-18，PR #419 → v2026.08.18.2）

上表 G1-G4 与 B1 当日全部实现并真机对照验收（TASKS.md 状态行有逐项
明细，T5 区间特效段与 T6 层级开关也一并落地）。此后与剪映的残差收敛为
三类：

1. **真欠账**：区间特效只作用于媒体层（剪映的特效会打在贴纸/文字上），
   WebGL 叠加类与 jianying-local 本机特效仍逐片段——T5 阶段 2，需要
   「下层合成→离屏→回贴」渲染管线；变速/倒放/定格片段的 resize 只钳制
   不磁吸；左缘磁吸 trim 按 FCP 惯例锚定实现，未回剪映实测该手势。
2. **有意保留**：浮层层级默认类型分层（byArrival 为工具栏开关）；文本
   默认 5s、调节层默认到项目尾；滤镜是片段/调节层属性而非独立段。
3. **QCut 反超**：轨道自由重排、slip/slide/roll、linked ripple、分组
   原子移动、书签/节拍吸附、轨级 audio bus——剪映无对应物。

日常剪辑流程（放、切、拖、换序、修边、加特效）两边手感已基本一致，
可感知差异集中在「特效不作用于浮层」一点。

## 实验记录（剪映专业版 macOS，2026-08-18）

| 编号 | 操作 | 结果 |
|------|------|------|
| E-add | 播放头 0 处依次 + 白/黑/黑 | 顺序黑黑白：播放头插入 + 右推 |
| E1 | 删主轨中段 | 后段左滑闭合，15s→10s |
| E2 | 拖白场到黑场中段松手 | 弹回原位（不切割不覆盖） |
| E2b | 拖白场越过黑场头部 | 两段换序，无缝 |
| E3 | 黑场上拖 | 新建画中画轨，落 5.6s，允许留空 |
| E3b | 画中画拖回主轨 | 空轨自动回收 |
| E5 | 画中画左拖近主轨右缘 | 边缘精确吸附 |
| E6 | 主轨白场右缘左拉至 3.27s | 黑场自动左移贴上 |
| E10 | 白场右缘右拉至 5.47s | 黑场被推开；上方文本轨不动 |
| E7 | 拖默认文本入时间线 | 落拖放位、新文本轨于主轨上方、默认 3s |
| E8 | 播放头 2.24s 处分割白场 | 一分为二，右半选中 |
