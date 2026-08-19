# 剪映 ↔ QCut 草稿互导:现状盘点(干了多少、还差多少)

> 2026-08-19 · 基于 master 代码实读(`packages/editor-core/src/jianying-draft/`、`draft-interop/`)
> 结论先行:**难的架构层(约六成工作量)已完成且质量高;剩下的是可枚举的「逐特性映射 + 对真剪映验证」流水线活,没有未知深水区**(唯一例外:11.3 写回的所有权建模需要一轮研究)。

---

## 一、已经建成的地基

### 1. 三层架构

| 层 | 位置 | 职责 |
|---|---|---|
| 草稿格式层 | `jianying-draft/`(types、build + `*-mapping`、`import/`、`writeback/`、`profiles/`) | 每个方言的 schema、构建、读入、写回契约 |
| 语义中间层 | `draft-interop/document.ts` | 整数微秒制,帧对齐在整数域校验,杜绝浮点漂移 |
| 能力格 | `draft-interop/capability.ts` | exact / downgrade / opaque / blocked 四级,父节点随最弱子降级 |

### 2. 四个方言 profile(`profiles/registry.ts`)

检测按 app 元数据 + schema 版本 + 顶层键 + 文件布局判定,**绝不猜最近版本**;未注册格式一律 inspect-only。能力矩阵(2026-08-19 实测 registry):

| Profile | inspect | import | 同 profile 写回 | 跨 profile 导出 | production |
|---|---|---|---|---|---|
| 合成 plaintext 5.9(导出基线) | fixture | fixture | fixture | **candidate** | false(永不作为导入目标) |
| CapCut 8.1(`draft_info.json`) | candidate | **stable** | none | candidate | true |
| 剪映 11.3 beta2 / beta3 | candidate | candidate | none | none | false |
| 剪映 11.3 beta4(生产导入) | **stable** | **stable** | none | none | true |
| 加密草稿 | 识别为 inspect-only 终态(NUL / 非 UTF-8 检测) | — | — | — | — |

关键事实:`isDraftProfileWritable` 要求写回等级为 `stable`(`registry.ts:85-93`,fixture 不算数)——**今天没有任何 profile 真正开放写回**。写回机件(`writeback/` 下 capcut-8-1 / beta2 / 11.3 的 timing patch 模块)已就位,但生产闸门全关。

### 3. 各方向已达成的能力

**导入(剪映 → QCut,最扎实)**
- 全量图读入 + 完整校验:单一 id 空间、REF_BROKEN / REF_DUPLICATE_ID / TRACK_OVERLAP / REF_CYCLE;malformed 子树跳过并报告,不崩。
- 能力格裁决:video/image/audio 须命中 beta4「验证默认指纹」(速度 1、无旋转/缩放/透明度、伴生素材全默认)才 exact;text 为 exact|downgrade;sticker/transition 封顶 downgrade;effect/filter/adjustment/未知类型一律 opaque。
- 关键帧只认 beta4 双通道线性 X 位移形状;转场只认原生叠化(接缝 touching + 2×min 时长);复合片段只降入中性单段 wrapper。
- opaque 内容经 foreign envelope **保真留存**,同 profile 往返不丢字节。
- 确定性:同字节输入 → 同文档。

**导出(QCut → 剪映)**
- 合成 5.9 草稿全链路:轨道反转映射(QCut 底部视觉轨 = 剪映主轨)、素材复制 + ffprobe 逐资产校验、确定性 id(同快照 → 字节同构)。
- issue 制:error 挡写、warning 须显式指纹确认才放行——**拒绝写入而非近似**。
- 文本 → styles-JSON(1080p 基准字号换算);贴纸 → 图片段(声明式降级)。

**写回(同 profile,契约最严但面最窄)**
- 仅 4 个标量 patch(target/source timerange 的 start/duration)@ 原 JSON pointer,带 expectedValue 防并发;任何结构漂移拒绝整单。

**应用入口**
- HTTP API:`/api/claude/interop/jianying-project-import|export`(30 分钟超时路由),端到端流程在。

---

## 二、还差多少(按方向)

### 导入侧:能编辑的内容面很窄

只有命中默认指纹的媒体/音频 + 文本能跨过来编辑;任何带加工的段(变速、旋转、滤镜、特效、贴纸、非叠化转场、非线性-X 关键帧)全部 opaque 只读。

**差距 = 逐项放宽指纹**,每项都是「映射 + 对真剪映验证后开闸」的中小工程,约十来项:

- [ ] 旋转/缩放/透明度 → QCut transform
- [ ] 变速标量 → playbackRate(QCut 侧 T4 变速已落地,映射有落点)
- [ ] 音量/淡入淡出 → volume / fade
- [ ] 更多关键帧形状(双轴位移、缩放、透明度、非线性插值)
- [ ] 转场家族扩展(叠化之外的原生转场)
- [ ] 滤镜/调色段 → QCut 滤镜(LUT 拟合线已有方法论,见 filter-fitting 记录)
- [ ] 贴纸段 → QCut 贴纸(现为 downgrade 上限)
- [ ] 复合片段更多形状(现只认中性单段 wrapper)

### 导出侧:error 清单同样长,且在加宽

QCut 的滤镜/调色/蒙版/裁剪/混合模式/动画/变换关键帧/高级音频/背景色全被挡(设计如此:拒绝而非近似)。**注意**:未映射元素类型统一走 `UNSUPPORTED_TIMELINE_ELEMENT` 阻塞错误(`build.ts:106`)——2026-08 新落地的区间特效段(effect 元素,timeline-v2 / PR #420)也在其中。**QCut 每加一个时间线特性,这条沟就宽一分**;时间线新特性设计时应同步登记导出降级策略。

- [ ] 调色 → 剪映 adjust 轨 + LUT(CapCut 8.1 的 LUT 校验 `capcut-8-1-lut.ts` 已写好 = 现成铺垫)
- [ ] 变换关键帧 → common_keyframes
- [ ] 变速标量 → speed 素材
- [ ] 区间特效段 → 剪映特效轨(或降级为烘焙提示)
- [ ] 文本高级特性清单逐项消化(`text-unsupported-features.ts`)

### 写回侧:距离最远

- 面只有媒体段 timing 四标量,且**没有任何 profile 达到 stable**(最高是合成 5.9 的 fixture)。
- 11.3 全线 `sameProfileWriteback: "none"`:父所有权 opaque 未解决——要先建所有权模型,才谈得上扩写回面(新增段、文本内容、变速、转场……每类都要对真剪映做 open/save/reopen 行为验证才敢开)。
- `realAppVerified` 目前所有 profile 均为 false(该旗标要求真 app open/save/reopen/native-export 回执)。

### 加密草稿:既定边界,不是欠账

新版剪映加密 draft 只能 inspect。反规避约束(DMCA §1201 / s116AN)下不解密、不绕过——这是刻意的终态,不列入差距。

---

## 三、里程碑评估

| 级别 | 定义 | 现状 |
|---|---|---|
| L1 单向导入可用 | 剪映草稿 → QCut 能编辑 | ✅ 已达成但窄:仅「默认参数的剪辑型时间线」 |
| L2 导出可开 | QCut → 剪映能打开继续编辑 | ✅ 已达成但损耗大:cut-only + 文本 + 贴纸转图 |
| L3 同 profile 无损往返 + 写回 | 改动写回原草稿不破坏 | ❌ 起点:机件在,闸门全关,所有权未建模 |
| L4 加密草稿 | — | 🚫 边界,不做 |

## 四、总结

- **已完成(难的部分)**:能力格、四方言检测、信封保真、确定性、微秒制、校验体系、issue 制导出、写回契约。这些是最容易做错、返工最贵的架构层。
- **未完成(宽度部分)**:导入放宽约十项指纹、导出清约十项 error、写回从 4 标量起步扩面。全部可独立排期,均为「映射 + 真 app 验证」流水线。
- **唯一研究型欠账**:11.3 写回的父所有权建模。

---

*本文档由代码实读生成;capability 矩阵直接摘自 `profiles/*.ts` 当日内容,过期请以 registry 为准。*
