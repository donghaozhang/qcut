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

## Phase 2a 原生层：detect 命令已打通

产品宿主新增 `detect<TAB>id<TAB>input` 命令，返回真实人数、人脸框、trackid：

```text
faceCount=1  id=0  rect=[0.4031, 0.2639, 0.1734, 0.3222]  score=1
landmarks=106  trackingCount=19
```

与探针基准逐字段一致。移植过程中踩到的两个坑，都值得记：

1. **包资源是异步加载的**（`enable_resource_load_synchronously = 0`）。
   `bef_effect_set_effect` 返回 0 不代表算法图已就绪，首帧 `algorithm_texture`
   会返回 `-11`。日志差分显示失败侧根本没有 `EffectParser::parse` 与
   `refreshFinalAssignedModel`。**泵动管线本身就是驱动加载完成的手段**——
   早期帧失败属正常，只有"一次都没成功"才是真失败。250ms 睡眠不能替代泵动。
2. **关键点容器的 span 在 +0x10/+0x18**，不是对象起始处；照抄成 +0x00/+0x08
   会让 106 点读取失败，而错误表现只是"结果缓冲区形状异常"。

## 既存缺陷：祛斑祛痘间歇性不生效

同一张帧、同一套参数，`face_adjust_SpotAcne=100` 的输出在多次运行间跳变：

| 宿主 | 三次运行的 absdiff |
| --- | --- |
| 含 detect 的新宿主 | `94,744` / `42,625` / `984` |
| **修改前的 staged 宿主** | `94,744` / **`0`** / `94,744` |

修改前的宿主同样不稳定，**因此这不是 Phase 2a 引入的**。`0` 意味着该卡有时
完全不渲染。匀肤（`203,404`）在所有运行中逐字节稳定，说明不是通用的渲染抖动。

推断与上面第 1 条同源：祛斑祛痘依赖 `newbandou` 系列 GAN 模型，同样异步加载，
而渲染路径每帧只泵两遍（warm + final）。模型没加载完时 Lua 的 `gan0==1` 发布门
为假，于是渲染原图。匀肤的模型更小、加载更快，所以不暴露。

修法方向：宿主渲染应泵到 GAN 发布门为真（或 provider 侧重试），而不是固定两遍。
`beauty-gap-cards-oracle.zh.md` 里记录的 `94,744` 是"能达到的值"，不是稳定值——
该文档的 GAN 门禁数字需要按这个口径重读。

## 多人美体验证：美体是整帧的，且逐脸向量曾让它静默失效

验证素材换成五人全身舞蹈镜头（1280×720）后得到两条结论。

### 美体确实生效——此前的"透传"只是素材问题

| 用例 | 与输入差值 |
| --- | ---: |
| 长腿 `100` | `13,208,907` |
| 瘦身 `100` | `567,553` |
| 小头 `100` | `144,101` |

之前记录的"美体恒为透传"是因为验证素材是半身像，算法找不到身体。

### 美体无法按人定向

`slimbody.lua` 的 `handleIntensityEvent` 只从强度向量的**第 0 个条目**取强度值，
**从不读 id 字段**（行为结论来自对该包强度事件处理逻辑的核对；包内源码不入库）。

因此逐人美体在这套包上不可实现——这不是"没接"，是包的参数协议里没有这个维度。
顺带一提，这张帧上人脸检测返回 `0`（远景全身，脸在 640×360 的算法输入里太小），
而美体照常生效，也印证美体走的是自己的身体检测而非人脸跟踪。

### 由此暴露并修复的发布缺陷

v2026.08.25.1 的逐脸发射对美体包发的是多条目向量，而**第 0 个是强度为 0 的基础
条目**，于是 body 读到 `0`——`faces[]` 里的美体值全部静默失效：

| 写法 | 修复前 | 修复后 |
| --- | ---: | ---: |
| `id=-1` 长腿 100 | `13,208,907` | `13,208,907` |
| `faceTarget single 0` | `13,208,907` | `13,208,907` |
| `faces[trackId 0]` | **`0`** | `13,208,907` |
| `faces[trackId 3]` | **`0`** | `13,208,907` |

修法：美体包塌缩为单条目 `id=-1` 向量，取计划中第一个非零值（基础层优先）。
四种写法现在渲出逐字节相同的结果。已上线卡回归零漂移。
