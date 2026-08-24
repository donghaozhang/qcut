# 美颜缺口卡片的本机 oracle 首轮结论

记录时间：2026-08-24

## 背景

美颜面板缺口项（独立美白、红润、祛痘祛斑、匀肤、丰盈、清晰）在
`Cache/ressdk_db/*/rp.db` 的 `http_cache` 表中全部找到了对应资源：
`auto-beauty2` 与 `skin_management` 两个分类就是美颜面板的资源目录。
所有包与所需模型都已在本机缓存中，无需任何下载。

| UI 名称 | 缓存目录（resource/md5 前 8 位） | 强度协议 | 模型 |
| --- | --- | --- | --- |
| 美白 | `7408028287785602319/8615dc8c` | 标量 `{"intensity": t}` | `tt_face`、`tt_skin_seg` |
| 清晰 | `7598460431144963366/d8d3201f` | 标量 `{"intensity": t}` | `tt_fsnew_base_jianying` |
| 匀肤 | `7408077026705280256/74ded1bf` | 向量 `face_adjust_yunfu` | fsnew + freid + `jypc_yunfuhua_gpucpu` |
| 丰盈 | 同上（同包） | 向量 `face_adjust_fuling` | 同上 |
| 祛斑祛痘 | `7442228961163088434/e8b42491` | 向量 `face_adjust` | fsnew + freid + `newbandou`×2 |
| 祛黑眼圈 | 与眼部细节包同 md5（`a5ff2cc5`） | 既有键族 | 既有 |

「红润」在资源缓存中只出现在滤镜 LUT 名称里，没有独立美颜资源；
「通用祛皱」在两份 rp.db 中零命中（祛皱/除皱/皱纹/抗皱都没有）——
剪映本身就没有这两张独立卡，产品侧不再视为缺口。

## 已通过（Swing `filter-sequence` 宿主，同一张 1280x720 真人帧）

### 美白

| 强度 | 首帧（注参前） | 效果帧 | 重复帧 |
| ---: | ---: | ---: | --- |
| `0` | `1,915,782` | `0` | 逐字节一致 |
| `0.5` | `1,915,782` | `956,489` | 逐字节一致 |
| `1.0` | `1,915,782` | `1,915,782` | 逐字节一致 |

- 包默认强度为 `1.0`（注参前首帧即满强度）——产品适配器必须总是显式下发强度。
- `0.5` 恰好为满强度差值的一半：线性 alpha 混合（Lua 将 `intensity` 写入 `uniAlpha`）。
- 差分图严格局限于人脸皮肤区，眼唇被保护，背景零变化（`tt_skin_seg` 掩膜驱动）。
- 低层 CGL oracle：默认差值 `2,552,287`，`--skip-algorithm` 后回到 `0`——
  变化因果来自算法掩膜，不是烘焙纹理。

### 清晰

| 强度 | 效果帧差值 |
| ---: | ---: |
| `0` | `0` |
| `0.5` | `2,528,517` |
| `1.0` | `5,102,496` |

- 包默认强度为 `0`（与美白相反）。
- 单调且近似线性；重复帧有个位数至两位数的微小漂移（算法内部状态，
  与 skin-seg 首结果生命周期研究一致），不是逐字节确定。

## GAN 家族已在 effect-video 宿主打通（同日第二轮）

第一轮的“堵点在宿主调度”结论只对了一半。真正的原因有两条，都已定位：

1. **参数形状**：`effect-video` 宿主原本只用四参数键值形式
   `bef_swing_segment_set_params(seg, keys[], values[], count)` 下发滑杆；
   美颜 GAN 包要的是同一导出符号的**两参数 JSON 形式**
   `{"face_adjust_yunfu": [{"id": -1, "intensity": 1}]}`。键值形式永远到不了
   `SetEffectIntensity`。probe 新增 `JY_EFFECT_FEATURE_PARAMS` 走 JSON 通道后，
   Lua 立刻报告 `hitKey`。
2. **宿主构造**：换到 `effect-video` 宿主后，同一张帧上 `faceCount=1`、`id=0`
   （真实 freid trackid）。当时把原因归给了 FeatureSegment 形状与算法预卷，
   这个归因是错的——真正的变量见下一节的三次隔离。

两条同时满足后，Lua 门 `gate valid=true`，GAN 纹理正常发布。以零强度输出为
基线（零强度与输入逐字节一致，因果自洽）：

| 卡片 | 强度键 | `0.5` | `1.0` |
| --- | --- | ---: | ---: |
| 匀肤 | `face_adjust_yunfu` | `123,996` | `199,634` |
| 丰盈 | `face_adjust_fuling` | `450,275` | `873,895` |
| 祛斑祛痘 | `face_adjust`（包内键） | `24,043` | `97,260` |

差分图语义也对：匀肤/丰盈覆盖 GAN 人脸对齐区且眼嘴挖空保护，
祛斑祛痘呈稀疏点状集中在瑕疵与纹理处，背景全部零变化。

## 根因：渲染必须发生在运行时自己的 GL 上下文里

第二轮把「宿主构造」记成了 FeatureSegment 形状，这一条也是错的。三次单变量隔离
（`effect-video` 宿主，其余条件完全不变）给出了决定性结论：

| 变量 | faceCount | GAN 门 |
| --- | ---: | --- |
| 对照 | `1` | `true` ×10 |
| 关闭引擎 GL 上下文 | `0` | 全 `false` |
| 关闭 200ms 算法预卷 | `1` | `true` ×10 |

也就是说：FeatureSegment 形状、算法预卷、原生 CVPixelBuffer 输入都不是原因
（filter 路径本来就有 `.useNativeInputTextures = true`，见
`research/jianying-runtime-probe/filter-probe.mm`）。真正的原因是——

**人脸算法只在运行时自己的 `HTSGLContext`（`sharedImageProcessingContext`）里才拿得到
输入。** 产品宿主原本用 `NSOpenGLContext ... shareContext:nil` 自建了一个独立上下文，
于是模型照常加载、算法照常初始化，但人脸检测永远返回 0 张脸。

为此隔离出来的两个诊断开关（`JY_EFFECT_ENGINE_GL_CONTEXT`、
`JY_EFFECT_ALGORITHM_PREROLL`）默认保持出厂行为，只用于 A/B。

### 修复

`OpenGlContext` 现在接受运行时根目录：先 `dlopen` 效果核心（`HTSGLContext` 就在
`libcccreator.dylib` 里，早于加载时 `NSClassFromString` 只会返回 nil），再取运行时的
共享图像处理上下文并绑定，**完全不创建独立上下文**。运行时没有发布该上下文时才回退到
原来的独立上下文，并打印一行明确的警告。`JY_FILTER_ENGINE_GL_CONTEXT=0` 可强制回退。

> 曾经试过「先建独立上下文，加载后再接管」，引擎上下文确实接管成功但人脸仍为 0——
> 运行时会针对首次出现的上下文初始化 GL 状态，所以独立上下文一次都不能创建。

## 产品宿主门禁结果

同一张显示方向帧，走 dist 构建里的真实 provider：

| 用例 | 产品宿主 | 基线 | 结论 |
| --- | ---: | ---: | --- |
| 美白 `100` | `2,548,174` | `2,548,174` | 逐字节不变 |
| 美白 `50` | `1,273,875` | `1,273,875` | 逐字节不变 |
| 清晰 `100` | `4,830,507` | `4,830,507` | 逐字节不变 |
| 匀肤 `0 / 50 / 100` | `0 / 126,127 / 203,404` | oracle `0 / 123,996 / 199,634` | 单调，偏差 ~2% |
| 丰盈 `100` | `859,109` | oracle `873,895` | 偏差 1.7% |
| 祛斑祛痘 `100` | `94,744` | oracle `97,260` | 偏差 2.6% |

GAN 三卡与低层 oracle 的残差属于两个宿主的纹理与调度差异，量级与瘦脸单卡一致。
三张卡的 UI 屏蔽已撤除。

### 全包回归（修复前后两个二进制逐字节对拍）

上表只覆盖了 12 个 runtime 包里的两个，而引擎上下文是**所有**人像渲染共用的，
因此补做了全量对拍：`QCUT_JIANYING_PORTRAIT_ADJUSTMENT_HOST` 指向修复前后的
两份 dev-cache 二进制（修复前 `d8141f2f13071bba`，`HTSGLContext` 命中 0；
修复后 `f42152ec7e7b6c97`，命中 2），同一张帧、同一批用例各渲一遍：

- smooth / whiten / clarity / eye-details / skin-tone（强度与冷暖两键）/ teeth /
  face（正负两向）/ features（大眼与眉宽）/ body（瘦腰与长腿），每项 50 与 100 两档；
- 另加两条美妆 stage（独立卡 look-oxygen、动态卡 lip-soft-pink），它们不在
  `JIANYING_PORTRAIT_RUNTIME_PACKAGE_ORDER` 里但同样受上下文影响。

**28 项输出 SHA-256 前后完全一致**，换上下文没有改动任何既有渲染。

一个如实的口径限制：body 两项在 50/100 与输入三者哈希相同，即纯透传——
这张素材是半身像，美体算法找不到可形变的身体。前后一致所以不是回归，但
**美体包实际上没有被这张素材验证到**，需要换一张全身素材另行确认。

### 发版缺陷：staged 宿主是修复前的旧二进制

`resolveHost` 的候选顺序是 `QCUT_JIANYING_PORTRAIT_ADJUSTMENT_HOST` →
`resourcesPath/bin` → 现场编译，**打包版只会走第二条**。而
`electron/resources/bin/jianying-portrait-adjustment-host` 当时还是 8 月 23 日
14:19 的产物，`HTSGLContext` 命中 0——也就是说，本轮所有验证都跑在现场编译的
dev-cache 上，而打包版会带着修复前的宿主，让刚解禁的三张卡对用户静默渲染原图。

已重新 stage，并给 `scripts/verify-packaged-jianying-runtime-bridges.ts` 加了
能力断言：打包宿主里必须出现 `HTSGLContext` 引用，否则打包直接失败。
原来的校验只比对 Mach-O 身份与 UUID，对「能启动、能渲染、但少一项能力」的
陈旧产物完全无感。断言已用修复前后两份二进制验证过判别力（前 false、后 true）。

## 第一轮记录：未通过时的观察（保留）

三张卡在 `filter-sequence` 与 `effect-video` 两个宿主中输出都与输入逐字节一致。
调试副本（打开 Lua 日志）证明链路断点非常精确：

- `SetEffectIntensity` 事件已抵达 Lua（`hitKey face_adjust_yunfu` 命中）；
- 但逐帧 `result:getFaceCount()` 恒为 `0`，`faceInfo.id` 恒为 `-1`；
- 合成门 `outputMap:get("gan"..index) == 1` 恒为 false——script 算法
  （JS runtime，`doInit` 正常解析 `yunfu` 320x320 GAN 模型配置）从未执行逐帧推理，
  init 后直接 destroy。

即：**堵点不是事件桥、不是模型解析，而是宿主没有把人脸检测/freid 结果喂进
script 算法的逐帧调度**。这与「剪映 CV 特效解锁」时的两堵墙同族但更深一层
（那次修的是模型回调与原生纹理输入；这次缺的是 face→freid→script GAN 的
requirement 调度与结果发布）。输入方向（GL/显示两种朝向）已排除。

## 产品适配器已接线（同日）

美白、清晰已进产品目录：`face_adjust_Whiten` / `face_adjust_Clarity`
（editor-core 键 + electron 契约 + runtime 包身份 + 标量强度分支，语义同 smooth；
美白默认 1.0 的坑由「分支总是显式下发 intensity + 零值不建 stage」中和）。

用 dist 构建里的真实 provider（产品宿主二进制 + stage 链）对同一显示方向帧渲染：

| 用例 | activeGroups | 与输入差值 |
| --- | --- | ---: |
| `face_adjust_Whiten=100` | `face` | `2,548,174` |
| `face_adjust_Whiten=50` | `face` | `1,273,875` |
| `face_adjust_Clarity=100` | `face` | `4,830,507` |

- 美白 100 与低层 CGL oracle 默认差值（`2,552,287`）收敛在 0.2% 内；50 恰为半程。
- 产品差分图方向正确、严格局限人脸皮肤区、眼唇保护、背景零变化
  （`product-whiten-diff-x8.png`）。
- 包解析 `source=jianying-installation`；下一次私有运行时备份会按身份表自动收录。

## 下一步

1. 五张卡（美白、清晰、匀肤、丰盈、祛斑祛痘）按单卡模板补第 7-8 步
   （中文剪映 UI 只开单项 100 采参照 + 固定 ROI PSNR/SSIM 邻域搜索），
   补齐后才能标 verified；当前状态是「产品可用且有数值门禁」，不是逐像素平价。
2. 引擎上下文现在是所有人像渲染的前提。运行时若不发布 `HTSGLContext`，宿主会回退
   到独立上下文并打印警告，此时依赖人脸跟踪的卡会静默渲染原图——值得在
   provider 侧把这个状态透出来，而不是只留在 stderr。
3. 祛黑眼圈只需产品侧命名核对（很可能就是现有 `face_adjust_Pouch` 的 UI 名），
   不需要新包。

原始包全部未修改；调试副本、探针日志、差分图只存
`~/Library/Application Support/QCut/Research/JianyingFilter/beauty-gap-cards-2026-08-24/`，
不进 Git。
