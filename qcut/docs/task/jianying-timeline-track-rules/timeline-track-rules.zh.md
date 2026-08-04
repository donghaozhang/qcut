# 剪映时间线轨道规则核验

<!-- markdownlint-disable MD013 -->

**状态：** 研究基线，不是完整兼容声明  
**核验日期：** 2026-08-04  
**适用范围：** 本机可读取的剪映草稿、剪映 5.9 明文结构、较新 subdraft 明文结构，以及公开草稿工具的实现

## 结论

剪映时间线的稳定核心不是“轨道里直接保存素材”，而是：

```text
project
  -> tracks[]
       -> segments[]
            -> material_id
            -> extra_material_refs[]
  -> materials.<kind>[]
```

当前证据足以支持 QCut 建立结构化的剪映轨道导入/导出适配器，但不足以声称已经完整复刻剪映的拖拽、主轨磁吸、联动、波纹编辑和新版渲染排序。特别是 `attribute`、`flag`、`render_index` 不能按字段名直接猜测。

## 证据等级

| 等级 | 含义 |
| --- | --- |
| 已确认 | 本机真实草稿中存在，并由至少一种独立实现或重复样本佐证 |
| 强佐证 | 公开工具有代码和测试，但本机样本覆盖不足 |
| 待核实 | 只有字段、UI 现象或单一样本，不能作为写入契约 |

本报告不把第三方工具的约定自动当作剪映官方规范。第三方代码只用于交叉验证本机证据。

## 本机审计

只读扫描目录：

```text
~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft
```

扫描候选包括 `draft_content.json`、`draft_info.json`、`.load.bak` 和 `.save.bak`。没有解密、覆盖或修改任何草稿。

| 指标 | 结果 |
| --- | ---: |
| 候选文件 | 392 |
| 可解析 JSON | 113 |
| 含完整 `tracks` + `materials` 的时间线 | 12 |
| 轨道 | 23 |
| 片段 | 31 |
| 同轨相邻片段对 | 8 |
| 同轨重叠 | 0 |
| 首尾相接 | 4 |
| 有间隙 | 4 |
| `extra_material_refs` | 115 |
| 成功解析的附属素材引用 | 115 |

轨道类型分布：`video` 14、`filter` 4、`effect` 4、`sticker` 1。这个分布只描述本机样本，不表示剪映仅支持这些类型。

审计还发现：

- 12 份时间线的 `config.maintrack_adsorb` 都是 `true`。
- 31 个片段的 `track_render_index` 全部等于所属轨道的数组下标。
- 只有 16/31 个片段的 `render_index` 等于轨道下标；其余出现 `10000`、`11000`、`14000` 等类型化编号。
- 115 个附属引用全部能在同一草稿的 `materials.*` 中找到。
- 18 个音视频片段可检查速度关系；17 个符合恒定速度公式。唯一例外使用曲线变速“英雄时刻”，其 speed material 为 `mode: 1`，不能用单一倍率精确描述。
- 两份历史快照包含同一个“烟雾转场”：转场由前一个片段引用，后一个片段不重复引用；两个 `target_timerange` 首尾相接，接缝差为 0，尽管转场材料的 `is_overlap` 是 `true`。

审计汇总临时保存在 `/tmp/jianying-timeline-track-audit-20260804.json`，不提交原始草稿或专有素材。

## 真实软件与资源核验

本轮同时核验了本机剪映专业版 `11.2.0-beta5`（产品版本 `11.1.12975`）：

- 在隔离的新草稿 `8月4日` 中导入了两段 3 秒、30 fps 的红/蓝测试视频；没有修改已有用户草稿。
- 编辑器时间线真实显示撤销、重做、分割、向左裁剪、向右裁剪、删除、标记和吸附控件。
- 已有项目的轨道头真实显示锁定、显示/隐藏和音频控制；这些是轨道状态，不应伪装成片段属性。
- 应用自带中文资源确认存在“主轨磁吸”“自动吸附”“主轨联动”“组合/解除组合”“创建/解除复合片段”“自由层级”和“素材混排”等独立能力。
- 新版 `draft_info.json` 仍为加密体，因此 UI 字符串只能证明产品能力存在，不能证明具体持久化字段。

测试草稿仅用于核验应用版本、项目初始化、媒体导入和控件可见性。下面标为“待受控 UI 实测”的拖拽结果不能由这次导入实验代替。

## 产品行为规则矩阵

### 轨道类型与职责

| 类型 | 可承载内容 | 已确认行为 | 仍需确认 |
| --- | --- | --- | --- |
| 主视频轨 | 视频、图片及其内嵌原声 | 主轨不能为空；主轨磁吸独立存在 | 主轨身份在新版草稿中的持久化方式 |
| 副视频轨/画中画 | 视频、图片 | 可参与主轨联动；当前资源文案允许视频轨转场 | 默认拖放时何时自动新建副轨 |
| 音频轨 | 音乐、音效、分离原声、文本朗读 | 有轨道静音、取消静音和轨道音量 | 多声道切换和复合片段内的混音优先级 |
| 文本轨 | 标题、普通文本、字幕 | 文本可按类型参与主轨联动 | 标题、字幕是否共享同一轨道类型字段 |
| 贴纸轨 | 贴纸和可视叠加元素 | 可参与主轨联动 | 与视频轨混排时的默认层级 |
| 特效轨 | 时间段特效 | 可独立成轨，也可作为附属素材 | 全局、轨道和指定片段作用域的冲突优先级 |
| 滤镜轨 | 时间段滤镜 | 可独立成轨，也可作为附属素材 | 多滤镜同区间的混合与排序 |
| 调节轨 | 调色/调整层 | 可参与主轨联动 | 是否允许与普通素材混排 |
| 复合片段轨 | `materials.drafts[]` 引用的子时间线 | 可创建、解除；支持多时间线注册 | 嵌套深度、局部 fps、代理缓存失效规则 |

固定研究版本的公开实现还枚举 `video`、`audio`、`effect`、`filter`、`sticker`、`text`，并把 `adjust` 视为导入兼容类型。QCut 不应因为本机样本暂时没有音频或文本轨，就删除这些类型。

轨道能力不是永远固定的：应用资源明确说明“自由层级”开启并保存后不可关闭；开启后轨道会取消锁定/隐藏限制。“素材混排”允许不同类型素材进入同一轨道，但要求先开启自由层级，而且开启后不可关闭。因此 QCut 的导入器至少要保存以下项目级 profile：

```text
classic typed tracks
free layer + typed tracks
free layer + mixed material tracks
```

### 轨道操作

| 操作 | 剪映证据 | QCut 应采用的契约 |
| --- | --- | --- |
| 新增轨道 | 公开实现追加到前景端；UI 可通过拖入素材产生轨道 | 创建稳定 UUID；明确插入的层级索引；不得靠类型排序偷偷换位 |
| 调换顺序 | `tracks[]`、`track_render_index` 与层级相关 | 重排是单个可撤销命令，同时更新轨道顺序与导出索引 |
| 锁定 | UI 和资源均有锁定/解锁；锁住主轨时不能开关主轨磁吸 | 阻止移动、修剪、删除、插入和影响该轨的波纹操作 |
| 隐藏 | UI 和资源均有隐藏/展示 | 只影响视觉合成和预览，不删除素材、不改变时间 |
| 静音 | 音频轨有静音/取消静音和轨道音量 | 只影响音频混合，不把片段 `volume` 写成零 |
| 删除轨道 | 工程以轨道包含片段 | 非空轨道必须提示或作为含所有片段的原子命令；不能留下悬空 material |

`attribute`、`flag`、`track_attribute` 的位语义尚未解出。读取时应保留未知值；写入时只由版本 profile 生成，不能把 `attribute !== 0` 一律解释成静音。

### 层级与渲染

1. 同一视觉时间点先按轨道层级确定背景到前景，再处理轨道内片段。
2. `tracks[]` 是当前最强的结构层级证据；`track_render_index` 是导出辅助索引；`render_index` 还包含素材类型编号，不能单独决定谁盖住谁。
3. 片段的基础可见性来自 `visible`，基础透明度来自 `clip.alpha`；隐藏轨道应在轨道层短路，而不是逐个改写片段。
4. 正常模式应按 source-over 合成；混合模式在应用中明确存在，但精确色彩空间、预乘 alpha 和 HDR 顺序尚未通过帧对比确认。
5. 音频不参加视觉层级。所有未静音音轨进入混音总线，再应用片段音量、轨道音量、淡入淡出和声道映射。
6. QCut UI 的轨道顺序是上方更靠前景，而合成计划按背景到前景执行；导入/导出必须显式反转，不能让两个模块各自猜一次。

### 插入、覆盖、替换与自动建轨

工程文件已确认同一轨道的片段不重叠，所以任意拖放到占用区时，编辑器必须先选择一种冲突策略：

| 模式 | 目标区间处理 | 源素材处理 | 是否移动后续内容 |
| --- | --- | --- | --- |
| 插入 | 在落点切开或形成边界后放入新片段 | 保持源时长 | 是，仅在启用波纹/主轨磁吸时 |
| 覆盖 | 删除目标区间内被覆盖的时间部分 | 保持新片段时长 | 否 |
| 替换片段 | 保留目标片段的时间槽，换主素材引用 | 默认按目标时长裁剪/适配 | 否 |
| 堆叠/新轨 | 原轨不变，在相邻视觉轨创建片段 | 保持源时长 | 否 |
| 追加 | 放到轨道末尾或主轨最后接缝 | 保持源时长 | 否 |

剪映资源确认存在显式“替换片段”，并提示“图片替换视频会导致音频丢失”。但普通拖拽默认选择插入、覆盖还是新轨，尚未从明文草稿推导出来。QCut 必须把模式做成命令参数，不能通过鼠标位置的偶然分支形成不可测试行为。

建议默认规则：拖到主轨接缝为插入；拖到主轨占用区为覆盖预览并要求明确确认；拖到主轨上方为空白区域为新建副轨；显式 Replace 命令才执行替换。

### 波纹与主轨磁吸

主轨磁吸和普通吸附是两个开关：

```text
config.maintrack_adsorb
draft_biz_config.timeline_settings.<timelineId>.adsorb_enabled
```

应用资源还确认：

- 主轨锁定时不能开启或关闭主轨磁吸。
- 快速裁剪在主轨磁吸开启时会让裁剪后的片段“保持链接”。
- 官方 CapCut 桌面说明把 Track Magnet 用于避免主轨空隙，把 Auto Snapping 用于对齐编辑点。

QCut 的具体规则应是：

- `ripple=false`：移动、删除、修剪只改变选中片段，原时间位置留空。
- `ripple=true`：计算操作产生的时间差，只平移同一波纹域中位于编辑点之后的片段。
- 主轨磁吸只定义主轨的波纹域；不要自动移动所有副轨。
- 副轨是否跟随由“主轨联动”决定，而不是由磁吸决定。
- 锁定轨道不能被波纹间接移动；命令应整体失败或明确跳过，不能提交半套状态。

### 修剪模式

已确认的剪映操作包括拖动两侧把手、向左裁剪、向右裁剪、分割和普通片段时长修改。尚未在资源或明文草稿中确认独立的 slip、slide 或专业 ripple-trim 工具。

| 模式 | 改变 `target_timerange` | 改变 `source_timerange` | 移动相邻片段 |
| --- | --- | --- | --- |
| 普通左修剪 | start 与 duration | source start 与 duration | 否 |
| 普通右修剪 | duration | source duration | 否 |
| Ripple trim | 同普通修剪 | 同普通修剪 | 是，移动后续片段 |
| Slip | 否 | source start/end | 否 |
| Slide | start | 两侧邻居边界 | 是，只调整相邻两片段 |

QCut 可以实现后四种模式，但 UI 与命令层必须使用明确名称。导出时还要验证 `source_duration ~= target_duration * speed`；曲线变速必须积分速度曲线，不能沿用普通修剪公式。

### 吸附

自动吸附应只改变交互落点，不改变项目语义。候选目标包括播放头、片段头尾、转场接缝、时间线标记和音乐节拍；明文草稿已经存在 `time_marks` 与 `materials.beats` 容器，但本机样本为空，不能据此断言当前版本会吸附到全部目标。

QCut 建议使用屏幕像素容差而不是固定时间容差：默认 8 px，Shift 临时禁用；候选点距离相同时按“选中片段边缘 > 播放头 > 同轨边缘 > 其他轨边缘 > 标记 > 节拍”排序。缩放变化时重新把像素转换为时间，避免放大后吸附过强、缩小后吸附失效。

### 主轨联动与素材关联

剪映资源给出了目前最具体的联动契约：联动开启时，可分别选择调节、特效、滤镜、音频、音效、贴纸、文本、文本朗读和画中画；被选类型会随着主轨“移动、删除”。因此：

- 联动是按类型配置的依赖关系，不等于组合，也不等于主轨磁吸。
- 内嵌原声属于视频素材本体；分离后的原声是独立音频片段，必须有显式关联 ID 才能跟随。
- 字幕、音效或特效只在时间范围关联或显式 semantic link 成立时跟随，不能仅凭时间重叠全部抓走。
- 删除主轨片段前要先计算依赖闭包；撤销时以同一事务恢复全部关联对象。
- 明文样本没有暴露新版联动配置字段，导入时不能用空 `group_id` 反推“未联动”。

### 组合、复合片段与嵌套

三个概念必须分开：

| 概念 | 时间是否折叠 | 是否创建子时间线 | 典型操作 |
| --- | --- | --- | --- |
| 多选 | 否 | 否 | 一次操作多个片段，选择解除即消失 |
| 组合 | 否 | 否 | 整体移动/缩放，可解除组合 |
| 复合片段 | 是 | 是 | 创建独立 timeline/draft，可进入内部编辑并解除 |

本机 489 个明文 segment 的 `group_id` 全为空；非空 `group_id` 出现在 text material，值为自动模板组或 `tse_subtitle`。所以这个字段当前不能直接当作 UI 组合 ID。复合片段则有 `materials.drafts[]`、`subdraft/**/draft_content.json` 和 `Timelines/project.json` 的明确结构证据。

### 转场

- 转场附着在同轨相邻视频片段的接缝，由前片段引用 transition material。
- `is_overlap` 表示渲染时需要双输入，不要求两个目标时间范围重叠。
- 当前资源文案是“转场仅支持添加到视频轨”；旧文案曾限制主轨，版本更新说明副轨后来获得转场能力。
- 边缘 handle 不足时，剪映会复制边缘帧创建转场，以保证不改变片段时长。
- 删除任一侧片段、把两侧移动成非相邻或改变轨道后，接缝转场必须被删除或标记无效。
- 修剪后若可用 handle 变短，QCut 应按 profile 选择 clamp、复制边缘帧或拒绝；不能静默改变片段时长。
- 替换片段只有在轨道、接缝、时长和 handle 仍合法时才能保留转场。

### 撤销与重做

真实 UI 同时提供撤销和重做。工程目录还有 `.backup/timeline_backup_manifest.json`，但备份快照是崩溃恢复/自动保存机制，不是可见的逐步 undo log；`attachment_editing.json` 的 `paste_segment_list` 也不能当作撤销栈。

QCut 每个用户命令应保存一份原子 before/after patch，至少覆盖轨道、片段、material registry、联动、转场和选择状态。异步 AI 任务要拆成“创建任务”“提交结果”两个命令；撤销已提交结果不能删除远端任务，只撤销本地引用。失败命令不得污染 redo 栈。

### 导航、标记与缓存

- `timeline_layout.json` 保存活动时间线和打开的 timeline ID；一个项目可有 1、2、3 条时间线。
- `materials.time_marks` 与 `materials.beats` 是标记/节拍候选数据源；导航、吸附和导出应共享同一时间基准。
- 播放头、横向滚动和缩放属于视图状态，不应触发项目内容 dirty；本机内容体中的 `zoom_info_params` 均为空。
- `performance_opt_info.json` 与代理/缓存 UI 属于性能层。代理可以降低预览分辨率，但应用资源明确说明不影响最终导出分辨率。
- 缓存键至少包含源文件身份、mtime/hash、取样范围、速度、效果链、色彩空间和输出规格；任何一项变化都应失效。

### AI 语义规则

本机旁路文件已经展示出“场景高于素材”的雏形：

- `attachment_action_scene.json` 用 `segment_id` 记录 `segment_scene`、feature 和 operation。
- `attachment_script_video.json` 把脚本句子、字幕 segment、源时间范围和目标时间范围连接起来。
- `attachment_pc_common.json` 的 AI packaging 条目用 `segment_id` 绑定关键词、B-roll 和时间段。

QCut 应把语义关联作为独立 graph，而不是把它塞进 `groupId`：场景节点拥有视频、对白、字幕、音效、BGM ducking 和效果引用。移动场景时按 graph 生成普通时间线命令；用户手动解除某条边后，AI 不得在下次重排时偷偷恢复。

## 待受控 UI 实测矩阵

每个实验都应使用两个 3 秒视频、一个独立音频、一个字幕和一个特效；每次只改变一个开关，并记录操作前后草稿与截图。

| 编号 | 操作 | 必须记录的结果 |
| --- | --- | --- |
| T01 | 空时间线拖入视频 | 主轨创建位置、轨道 type/flag/index |
| T02 | 拖到主轨片段中部 | 默认是插入、覆盖、替换还是拒绝 |
| T03 | 拖到主轨上方/下方 | 自动建轨方向和层级 |
| T04 | 主轨磁吸开/关后删除中间片段 | 后续主轨是否补齐、时间差如何计算 |
| T05 | 自动吸附开/关拖动 | 播放头、边缘、标记、节拍各自是否吸附及像素阈值 |
| T06 | 锁定/隐藏/静音轨道 | 编辑阻断范围、预览和导出差异、持久化字段 |
| T07 | 左/右修剪与快捷裁剪 | source/target range、邻片段和关联对象变化 |
| T08 | 各类型主轨联动 | 移动、删除、修剪时每类对象是否跟随 |
| T09 | 组合与解除组合 | ID、跨轨移动、部分删除和撤销后的状态 |
| T10 | 创建/解除复合片段 | 子时间线、局部时间、音频和转场如何展开 |
| T11 | 添加、修剪、删除两侧片段 | 转场 ownership、时长 clamp/复制帧和删除规则 |
| T12 | 连续撤销/重做以上操作 | 项目、选择、播放头、缓存和 material 引用是否完全一致 |

## 已确认的数据规则

### 1. 项目时间基准

- `fps` 定义项目帧率。
- 草稿时间范围使用微秒。
- `duration`、片段边界和转场时长可能量化到整数帧。
- 比较接缝时应使用帧容差或版本配置，不应直接依赖浮点秒完全相等。

### 2. 轨道与片段

轨道至少包含：

```json
{
  "id": "track-uuid",
  "type": "video",
  "attribute": 0,
  "flag": 0,
  "segments": []
}
```

片段至少通过以下字段表达身份和时间：

```json
{
  "id": "segment-uuid",
  "material_id": "primary-material-uuid",
  "target_timerange": { "start": 0, "duration": 5000000 },
  "source_timerange": { "start": 0, "duration": 5000000 },
  "extra_material_refs": []
}
```

`target_timerange` 是时间线位置，`source_timerange` 是源素材取样范围。文字、贴纸和某些生成型片段的源范围可能为空或具有不同语义，适配器必须按轨道/素材类型分派。

### 3. 同轨非重叠

本机 8 个可比较的同轨相邻片段对没有重叠。固定研究版本的 pyJianYingDraft 也把时间范围视为半开区间，并在添加同轨重叠片段时抛出 `SegmentOverlap`。

因此，QCut 生成草稿时应采用以下保守不变量：

```text
previous.target.start + previous.target.duration
  <= next.target.start
```

这不证明剪映 UI 在所有操作下都会采用同一种“覆盖、插入或新建轨道”策略；那属于待做的交互实验。

### 4. 素材引用

- `material_id` 指向主要素材，例如视频、音频、文字或贴纸。
- `extra_material_refs` 指向速度、动画、画布、蒙版、转场、音频处理等附属素材。
- 片段删除后必须清理孤立素材，但只有在确认没有其他片段引用时才能删除。
- 复制片段时必须明确哪些素材可共享，哪些实例必须重新生成 UUID。

### 5. 恒定速度与曲线速度

恒定速度的基础关系是：

```text
source_duration ~= target_duration * speed
```

误差来自帧量化。曲线变速不能只使用片段顶层 `speed`；必须解析它引用的 `materials.speeds[]`，检查 `mode` 和 `curve_speed.speed_points`，再按曲线积分/重采样。

### 6. 轨道顺序与渲染顺序

公开实现把 `tracks[]` 作为从背景到前景的完整轨道顺序，并将新轨道追加到最上层。其固定提交中的 24 个轨道相关测试通过，覆盖追加、插入、顺序、同轨重叠和半开区间。

本机样本进一步说明：

- `track_render_index` 在当前样本里可靠地跟随轨道数组下标。
- `render_index` 不是简单的轨道数组下标；不同素材类型使用不同编号区间。
- `render_index_track_mode_on` 在两个剪映 5.9 快照中为 `true`，在十个较新 subdraft 中为 `false`。
- `free_render_index_mode_on` 在全部 12 份样本中为 `false`。

所以导出器不能只排序 `render_index`，也不能永远只复制数组顺序。应使用版本化 profile 同时生成轨道顺序、`track_render_index` 和类型对应的 `render_index`。

### 7. 主轨磁吸

`config.maintrack_adsorb` 已确认存在，并被公开实现解释为“主轨磁吸”。但以下内容尚未由本机受控实验确认：

- 哪一条 `video` 轨道在每个版本中被认定为主轨；
- 主轨身份是否完全由顺序决定；
- 开关变化后插入、删除、裁剪和变速如何移动其他片段；
- UI 的“联动”和“自动吸附”是否还有独立持久化字段。

因此不能把“第一条视频轨道”硬编码为所有版本的主轨规则。

### 8. 转场归属

转场是接缝对象，不是普通独立片段：

```text
materials.transitions[]
        ^
        | transition UUID
outgoing_segment.extra_material_refs[]
incoming segment = same track, next segment
```

`is_overlap: true` 表示双输入取样/渲染契约，不表示两个 `target_timerange` 必须重叠。转场实例时长还可能被 FPS 量化，并受两侧 source handle 限制。

详见现有 [转场格式证据](../../../.agents/skills/qcut-toolkit/jianying-transition-reference/references/formats.md)。

### 9. 特效、滤镜和关键帧

- 特效和滤镜既可能作为独立时间段轨道存在，也可能作为片段的附属素材存在。
- 全局、轨道类型和指定片段的作用范围必须由 material 字段决定，不能只根据轨道位置猜测。
- `common_keyframes` 挂在片段上；公开实现把关键帧时间解释为相对片段头部。
- 本机样本中有一份时间线包含 3 组 `common_keyframes`，但不足以确认所有属性、插值和冲突优先级。

### 10. 多时间线和复合片段

`timeline_layout.json` 保存活动时间线以及一个或多个 timeline ID；本机样本出现了 1、2、3 条时间线的项目。`subdraft/**/draft_content.json` 和 `materials.drafts[]` 证明复合/嵌套时间线使用独立内容体。

当前只能确认注册和引用结构，尚未完整确认多层嵌套、解除复合、局部时间基准和渲染缓存规则。

## 不应写死的字段

| 字段 | 当前结论 |
| --- | --- |
| `track.attribute` | 公开工具用它写 mute，但本机样本出现值 `2`；必须版本化验证 |
| `track.flag` | 本机副视频轨出现值 `2`，含义未确认 |
| `segment.track_attribute` | 多数跟随轨道属性，但不能当作唯一真相 |
| `segment.render_index` | 类型化渲染编号，不等于轨道数组下标 |
| `segment.track_render_index` | 本机样本等于轨道下标，仍需跨版本 profile |
| `render_index_track_mode_on` | 5.9 与较新 subdraft 取值不同 |
| `mixed_track_mode_on` | 较新 subdraft 为 `false`，5.9 样本缺失；语义待核实 |

## QCut 对应关系

| 剪映概念 | QCut 当前模型 | 评估 |
| --- | --- | --- |
| 轨道顺序 | `TimelineTrack.order` | 基础可用，需要导出 profile |
| 主轨 | `TimelineTrack.isMain` | QCut 更显式，不能直接反推剪映字段 |
| 片段时间线范围 | `startTime` + effective duration | 可映射，需秒/微秒和帧量化边界 |
| 源素材范围 | `trimStart`、`trimEnd`、`playbackRate` | 需要集中转换器 |
| 视觉层级 | `buildCompositionPlan()` | QCut UI 自上而下、合成自下而上 |
| 转场接缝 | `TimelineTrack.transitions[]` | 与剪映接缝模型接近 |
| 附属素材引用 | 元素字段和 effects/animation/mask | 导出时需要 material registry |
| 曲线变速 | `speedKeyframes` | 尚需定义与剪映曲线的精确换算 |

核心文件：

- `packages/editor-core/src/types/timeline.ts`
- `packages/editor-core/src/timeline/track-utils.ts`
- `packages/editor-core/src/timeline/composition-plan.ts`
- `packages/editor-core/src/timeline/transitions.ts`
- `apps/web/src/stores/timeline/element-operations.ts`
- `apps/web/src/stores/timeline/track-operations.ts`
- `packages/editor-core/src/jianying-draft/`
- `packages/jianying-draft-export/src/`

## 建议实施子任务

### 1. 建立版本化轨道契约

相关文件：

- `packages/editor-core/src/jianying-draft/types.ts`
- `packages/editor-core/src/jianying-draft/time.ts`
- 新建 `packages/editor-core/src/jianying-draft/track-mapping.ts`

定义轨道、片段、时间范围、render index policy 和未知字段保留策略。不要把 5.9 与 CapCut 8.1.1 共用一个无版本 profile。

### 2. 实现 material registry

相关文件：

- `packages/editor-core/src/jianying-draft/build.ts`
- `packages/editor-core/src/jianying-draft/media-mapping.ts`
- `packages/editor-core/src/jianying-draft/validation.ts`

集中注册主素材和附属素材，检测悬空引用、重复 ID、跨片段共享和孤立素材。

### 3. 完成轨道和层级映射

相关文件：

- `packages/editor-core/src/timeline/track-utils.ts`
- `packages/editor-core/src/timeline/composition-plan.ts`
- `packages/editor-core/src/jianying-draft/capcut-8-1-profile.ts`
- 新建 `packages/editor-core/src/jianying-draft/track-render-index.ts`

用 profile 生成 `tracks[]`、`track_render_index` 和 `render_index`，并以混合类型轨道 fixture 锁定层级。

### 4. 对齐片段时间和变速

相关文件：

- `packages/editor-core/src/jianying-draft/time.ts`
- 新建 `packages/editor-core/src/jianying-draft/speed-mapping.ts`
- `packages/editor-core/src/types/timeline.ts`

分别覆盖恒定速度、曲线速度、倒放、定格、trim 和 FPS 量化。曲线速度测试必须验证积分后的 source consumption。

### 5. 保持转场为接缝对象

相关文件：

- `packages/editor-core/src/jianying-draft/transition-build.ts`
- `packages/editor-core/src/jianying-draft/transition-mapping.ts`
- `packages/editor-core/src/jianying-draft/transition-validation.ts`
- `packages/editor-core/src/timeline/transitions.ts`

验证前片段唯一 ownership、同轨下一片段、接缝相邻、两侧 handle 和帧量化；不要把转场降级成普通滤镜片段。

### 6. 建立交互行为矩阵

相关文件：

- `apps/web/src/stores/timeline/element-operations.ts`
- `apps/web/src/stores/timeline/track-operations.ts`
- `apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts`
- `apps/web/src/components/editor/timeline/`

在隔离测试账号或 VM 中逐项记录剪映操作前后草稿：主轨磁吸开/关、自动吸附开/关、联动开/关、插入、覆盖、删除、变速、跨轨拖拽。每个实验只改变一个变量。

### 7. 增加真实导出回归

相关文件：

- `packages/editor-core/src/__tests__/jianying-draft-*.test.ts`
- `packages/jianying-draft-export/src/__tests__/`
- `scripts/capcut-e2e/`
- `docs/task/jianying-draft-export.md`

要求生成、写后重读、真实打开、保存、重开和导出；视觉层级、音频混合、转场接缝和 source sampling 都要有 oracle。不得在 Peter 的真实草稿账号中运行写操作。

## 完成标准

- 每个目标版本都有独立 profile 和固定来源的最小 fixture。
- 同轨重叠、引用完整性、UUID 唯一性、时间范围和帧量化都有验证器。
- preview 与 export 使用同一个层级和转场计划。
- 恒定速度和曲线速度分开测试。
- 未知 `attribute`、`flag` 或 render mode 必须 fail closed 或原样保留，不能静默重写。
- 真实应用完成打开、保存、重开、导出回归后，才能升级为“已验证兼容”。
- 不提交或分发剪映数据库、草稿、缓存包、着色器、媒体或其他专有资产。

## 参考资料

- [pyJianYingDraft 固定研究提交](https://github.com/GuanYixuan/pyJianYingDraft/tree/c3318066d964744e2bfc66f75c71745fe8cea52a)
- [轨道实现](https://github.com/GuanYixuan/pyJianYingDraft/blob/c3318066d964744e2bfc66f75c71745fe8cea52a/pyJianYingDraft/track.py)
- [轨道插入实现](https://github.com/GuanYixuan/pyJianYingDraft/blob/c3318066d964744e2bfc66f75c71745fe8cea52a/pyJianYingDraft/_script_file_tracks.py)
- [capcut-cli 草稿轨道说明](https://github.com/renezander030/capcut-cli/blob/f3295934c716dcbe7d1781cc3bf49d5a88d6bdd2/docs/draft-schema/01-tracks-and-segments.md)
- [CapCut 官方桌面编辑说明：Track Magnet、Auto Snapping、代理与快捷键](https://www.capcut.com/resource/pc-professional-video-editor)
- [QCut 剪映 / CapCut 草稿导出状态](../jianying-draft-export.md)

本机产品能力名称来自 `/Applications/VideoFusion-macOS.app/Contents/Resources/po/zh-Hans.po`。文档只转述行为，不提交该专有资源文件或提取物。
