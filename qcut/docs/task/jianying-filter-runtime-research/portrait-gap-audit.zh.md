# 人像缺口审计：哪些是真缺口，哪些不是

记录时间：2026-08-24（v2026.08.24.2 发布后）

对「美颜/脸型/五官/美体/多人」缺口清单逐项考古后的裁决。证据全部来自本机
剪映缓存（包 Lua、rp.db 资源目录）与原生运行库符号，未修改任何原始包。

## 已在 v2026.08.24.2 关闭

美白、清晰、匀肤、丰盈、祛斑祛痘五张卡随 GL 上下文根因修复一起上线；
红润、通用祛皱在剪映资源目录中不存在独立卡（红润只是滤镜 LUT 名），
从缺口清单划掉。见 [beauty-gap-cards-oracle.zh.md](beauty-gap-cards-oracle.zh.md)。

## 额头 ≠ 缺口：额头与发际线就是同一张卡

- `face_adjust_Forehead` 在 face 包（`7408077448513998114/aa4932…`）的原包 Lua 里
  驱动 FaceReshape degree 通道 9，包内注释即 `-- zoom forehead`；
- 剪映资源目录 `face_shape` 分类中这张卡的 UI 名是「发际线」（两份 rp.db 各 4 命中），
  而「额头」在全部 `http_cache` 中 **0 命中**；
- 原生库只有小写 `forehead`（关键点命名），没有独立的 Hairline 形变类型。

裁决：剪映只有一张「发际线」卡，内部语义是前额缩放。QCut 现有映射正确，
不存在待接的独立「额头」参数。

## 五官单侧调整：算法层不可达

features 包（`7408077472211668276/f662ff9c…`）的
`FaceReshapeControlSystem.lua` 中 key→ReshapeType 映射表是该包支持的完整
形变类型清单：`EyeSize / EyeWidth / EyeHeight / EyePupil / EyeInnerCorner /
EyeOuterCorner(Inout) / EyeLowerEyelid / EyePosition / EyeDistance /
BrowRidge / BrowSize / BrowPosition / BrowTilt / BrowWidth / BrowDistance /
Mouse* / Face* / *Atrium` —— **全部是双侧对称类型，无任何 Left/Right 变体**
（包内 `left`/`right` 字样只是包围盒坐标注释）。

裁决：左右眼、左右眉的单侧调整不是「没接」，而是剪映 FaceReshape 算法
本身不按单侧建模；手动局部精修笔刷在 rp.db 中也没有对应资源分类。
这两项要做只能 QCut 自研（自有网格形变 + 笔刷遮罩），不属于剪映互操作范畴。

## 美体：SDK 有 SLIM_LEG，但没有任何包暴露它

- 原生 `libcccreator.dylib` 的美体枚举族：`SMALL_HEAD / SWAN_NECK / SLIM_ARM /
  **SLIM_LEG** / SLIM_BODY / SLIM_WAIST / SLIM_HIP / SLIM_BREAST /
  ORTHO_SHOULDER / WIDEN_SHOULDER / STRETCH_LEG` —— `SLIM_LEG`（独立瘦腿）
  是正式成员；
- 但本机仅有的两个美体包（`7408076932065152296/9c891b…` 与
  `31631430/96eb248e…`）键集完全相同的 10 项，都不含 SLIM_LEG；
- `slimbody.lua` 只在原生已有 `items` 列表里按 type 匹配设强度，不创建 item，
  未映射键被 `intensityMap[inputKey] ~= nil` 直接丢弃——改包不在纪律允许范围内。

裁决：独立瘦腿是「SDK 支持、无包暴露」，与美白解锁前同构；落地需要找到
官方暴露 SLIM_LEG 的包（本机没有）。大腿/小腿细分与头身比在枚举全集中
**不存在**对应类型——「小头 + 长腿」近似头身比不是权宜，就是剪映的做法本身。

## 多人：唯一真正的工程缺口（本分支主线）

运行时侧的既有事实：
- features 包 Lua `maxFaceNum = 10, maxDisplayNum = 5`——跟踪 10 张脸、
  同时生效 5 张是包级硬上限；
- freid 提供跨帧 trackid（GAN 卡的 `faceInfoBySize` 已实测消费它）；
- 资源目录中有「人脸框」包（`7406173874112531752/1a54ce6e…`，44K）——
  剪映自己的人脸框覆盖层资源；
- 低层探针已支持 `--inspect-face-result --face-output json`（人数 + 106 点）。

缺口全在产品侧：宿主协议不回传人脸检测结果、UI 固定列出人脸 1–10、
`MediaPortraitAdjustments` 只有一套 `values + faceTarget`、预设无重命名/
缩略图/导入导出。

## Phase 2a 前置门：引擎上下文下的人脸检测（已通过）

产品宿主锁定在运行时自有的 `HTSGLContext` 上渲染，而 `bef_effect` 人脸检测此前
只在探针的独立 CGL 上下文里验证过——设计把这条列为 2a 的合并前置门。

给探针加 `--engine-gl-context`（先 `dlopen` 效果核心再绑定 `HTSGLContext`，
复刻产品宿主的加载—绑定顺序），同一张 1280x720 真人帧两种上下文各跑一次：

| 上下文 | faceCount | rect | score | landmarks |
| --- | ---: | --- | ---: | ---: |
| standalone CGL 3.2 core | `1` | `0.403125, 0.263889, 0.173438, 0.322222` | `1` | `106` |
| engine `HTSGLContext` | `1` | 同上 | `1` | `106` |

两份 `faces.json` **逐字段完全相同**（不是"都检出人脸"，是数值全等），
且 `id=0`、`trackingCount=19`。因此检测管路可以直接移植进产品宿主，
不需要为它保留独立上下文，也不存在两种上下文的结果漂移。

空结果一律按管路失败处理，绝不解释为"画面里没有人脸"。
