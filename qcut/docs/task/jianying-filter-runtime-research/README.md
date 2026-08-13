# 剪映滤镜运行时互操作性研究

记录时间：2026-08-09，2026-08-10 追加中文剪映逐帧、ProRes 和无缩放对照，2026-08-12 追加产品批处理、固定时间基和长尾 Pass E2E，2026-08-13 追加 7 张双 LUT 真实视频门禁

## 范围

本目录只提交 QCut 自有的研究文字和探针源码，用于记录剪映滤镜包的运行时行为、GL 纹理上下文要求和可复现实验方法。

本目录不包含，也不得后续加入：

- 剪映、火山引擎或其他第三方的 `.dylib`、Framework、可执行文件；
- `tt_face`、`tt_face_extra`、`tt_skin_seg` 等模型文件；
- 滤镜包、LUT、Shader、Lua、纹理、Scene、Material 或序列化资源；
- 剪映缓存数据库、原始运行日志或应用配置；
- 本地编译产物、PPM/PNG 输出和其他二进制证据。

需要复现实验时，应由研究者在仓库之外提供自己有权使用的 SDK、模型和素材。不得从本目录推导出重新分发第三方运行时的许可。

最新产品批处理、7 张双 LUT、1 秒固定时间基导出和五类 QCut 自有长尾 Pass 结果见
[product-batches-and-long-tail-e2e.zh.md](product-batches-and-long-tail-e2e.zh.md)。这些结果把“产品能力可运行”
与“剪映卡片像素平价”分开计分；后者仍必须有同素材 UI 无损帧门禁。

7 张双 LUT 人像卡的 70 帧连续视频、人物移动、mask 边缘、素材切换和逐卡导出结果见
[dual-lut-seven-real-video-e2e.zh.md](dual-lut-seven-real-video-e2e.zh.md)。奥林巴斯达到 verified；共享算法图
的青灰、冷月夜、橙蓝、亮肤、森山、雾野达到 close，文档没有把 close 写成完美复刻。

真实多 Pass 卡“电影柔光”的剪映 UI、独立二进制 oracle、QCut 产品预览和 QCut 产品导出四方对照见
[cinematic-soft-glow-four-way-e2e.zh.md](cinematic-soft-glow-four-way-e2e.zh.md)。本轮确认本机 provider 达到
verified，并修复了调整层未把 native-local multi-pass 传入像素预览链路的问题；H.264 4:2:0
导出帧单独按 close 记录，未把编码损失伪装成滤镜误差。

## 已确认结果

旧探针使用缓存中的 EGL/GLES 创建纹理，但目标 Effect 库的 GL 符号绑定到 macOS `OpenGL.framework`。两套 context 不共享 GLuint 命名空间，导致输入纹理被视为不可加载。

新的 CGL 探针验证了以下工作组合：

```text
CGLContextObj
  + OpenGL 3.2 core profile
  + OpenGL.framework 创建的独立 source/target GL_TEXTURE_2D
  + 同一个 current context
  + 同一个调用线程
```

在测试机器上，该配置得到 OpenGL 4.1 Metal。三个不同的纯 3D LUT Effect 包都满足：

- 输入和输出纹理在调用前后均通过 `glIsTexture`；
- `bef_effect_process_texture` 返回成功；
- 每帧 `glGetError` 为零；
- framebuffer 完整；
- 目标纹理相对输入和预填测试颜色均发生非零变化；
- 不同包产生不同输出，同一包重复运行得到逐字节一致输出。

OpenGL legacy profile 只有 2.1，无法编译运行时生成的 GLSL 330，因此不能作为替代方案。

## 人像算法验证

使用仓库已有的 512x512 真人肖像图进行了完整验证。运行时成功加载 `tt_face`、`tt_face_extra` 和 `tt_skin_seg`；预热完成后，算法、效果处理、framebuffer 读回和 GL 状态均成功。

通过仓库外的临时调试副本分别读回了背景 LUT、皮肤 LUT 和实际 skin mask。mask 与画面中的脸、颈肩和双臂对齐，mask 与完整效果相对背景 LUT 的像素差异相关系数为 `0.9334`。

使用 `LUT0 * (1 - mask) + LUT1 * mask` 在 CPU 上重建的图片与原始效果达到 `51.316 dB` PSNR，`99.3656%` 的颜色通道误差不超过 2。这确认了真实 skin segmentation 和双 LUT 逐像素混合链路。

这项结果仍不代表当前调用满足正式 SDK 的授权和分发要求。它只是本机互操作性证据，不改变 QCut 产品应使用自有或已授权运行时的边界。

## 中文剪映逐帧对照

在中文剪映专业版中建立了一次性草稿，并通过滤镜卡片的轨道添加入口应用“奥林巴斯”。滤镜作为独立轨道覆盖完整 6 秒素材，右侧面板同时显示名称“奥林巴斯”和强度 `100`。随后使用相同导出参数分别导出有滤镜和无滤镜版本。

素材共 180 帧、30 fps：前 60 帧是静态近景人像，后 120 帧是多人舞蹈。探针将无滤镜导出解码后的 RGB 帧按顺序送入同一个 CGL 3.2 core context、同一个 Effect handle 和同一个线程，以 `frameIndex / 30` 作为时间戳连续重放。

| 区间 | PSNR | SSIM | RGB RMSE | RGB MAE | 抽样 Delta E 76 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 全部 180 帧 | 37.291 dB | 0.946786 | 3.483 | 2.143 | 1.687 |
| 静态人像 60 帧 | 35.666 dB | 0.910336 | 4.200 | 2.660 | 1.937 |
| 动态舞蹈 120 帧 | 38.409 dB | 0.965012 | 3.062 | 1.885 | 1.562 |

作为效果量级对照，无滤镜导出与剪映滤镜导出的全片 PSNR 只有 `18.930 dB`，RGB RMSE 为 `28.844`。探针重放明显更接近剪映成片。动态段错开一帧比较时 PSNR 降至约 `21.36 dB`，错开两帧降至约 `18.87 dB`，排除了靠帧错位获得高相似度的可能。

初版导出使用 MOV/HEVC、`yuv420p` 和 Rec.709，因此只能证明高相似度重放。后续改用 ProRes 422 HQ 和 ProRes 4444，并增加了一组时间线缩放固定为 `100%`、输入与输出均为 854x480 的控制实验：

| 对照 | 全片 PSNR | 全片 SSIM | 静态人像 PSNR | 动态舞蹈 PSNR |
| --- | ---: | ---: | ---: | ---: |
| HEVC 4:2:0 | 37.291 dB | 0.946786 | 35.666 dB | 38.409 dB |
| ProRes 422 HQ | 39.140 dB | 0.959279 | 36.312 dB | 41.876 dB |
| ProRes 4444，剪映内有缩放 | 40.580 dB | 0.991692 | 37.093 dB | 44.796 dB |
| ProRes 4444，无缩放且用剪映基线校准输入 | 40.741 dB | 0.991899 | 37.331 dB | 44.681 dB |

无缩放实验使用 854x480、30 fps、180 帧、6 秒的 ProRes 422 HQ 源文件。剪映时间线显示缩放 `100%`，无滤镜和“奥林巴斯”版本都导出为 854x480、180 帧的 ProRes 4444。直接把同一源文件解码后送入探针，与剪映滤镜版比较得到 `37.500 dB / 0.987756`；但源文件经过剪映无滤镜往返本身只有 `41.569 dB / 0.995134`，说明宿主解码、色彩管理和导出转换已引入可测差异。

用无滤镜基线抵消该宿主路径后，效果残差 PSNR 为 `39.619 dB`。进一步把剪映无滤镜 RGB 基线帧作为诊断性探针输入后得到表中的 `40.741 dB`。它不是产品调用方式，而是用于隔离滤镜运行时与宿主色彩链路。与存在缩放的 ProRes 4444 对照相比，整体只提高约 `0.16 dB`，静态段提高约 `0.24 dB`，动态段基本不变，因此 640 到 854 的空间缩放不是当前主要误差源。

随后用一张 854x480 的无损 RGB 色卡枚举了 BT.709 limited/full、BT.601 limited 和 BT.2020 limited 解码路径。剪映无滤镜 ProRes 4444 往返与 BT.709 limited/default 解码达到 `50.884 dB`，其余候选只有 `27.481` 到 `35.502 dB`。同一色卡应用“奥林巴斯”后，探针与剪映输出达到 `49.345 dB`，分通道为红 `49.008`、绿 `50.640`、蓝 `48.637 dB`。因此全局 RGB/YUV 矩阵和纯 LUT 路径已经基本锁定，蓝通道并不存在独立的全局错误。

真人序列中，利用背景 LUT、皮肤 LUT 和剪映最终输出逐像素反推出剪映等效 mask，再与探针 mask 对照。统一的诊断性后处理
`clip(1.18284 * Gaussian(erode5(mask), sigma=4)^0.65 - 0.01520, 0, 1)`
将全片重建 PSNR 从 `40.731` 提高到 `41.814 dB`，蓝通道从 `38.755` 提高到 `40.222 dB`。但它只改善 `127/180` 帧，另有 53 帧变差；最差帧倒退 `2.253 dB`。这证明剩余蓝通道误差主要被 skin mask 边缘和权重放大，也证明固定经验参数不能直接成为产品实现。

动态段按 mask 帧偏移比较时，偏移 0 为 `44.482 dB`，偏移正负 1 帧约为 `40.96 dB`，排除了简单的一帧延迟。

随后通过算法类型 `49` 直接取得 `Bach::SkinSegBuffer` 和同 context 原始纹理。模型枚举 `224x128`、`128x224`、`176x128`、`128x176` 四种 NCHW 空间形状；实际运行时输出为横屏 `224x128`、竖屏 `128x224`、4:3 `176x128`、方形 `128x128`。纹理是单通道 `GL_R8`，min/mag filter 都是 `GL_LINEAR`。真人首帧范围为 `0-201/255`，91.7725% 像素为非端点软值；无人物灰底范围为 `1-12/255`。因此它是连续权重，不是阈值化的二值 mask。

用标准 OpenGL 半像素中心线性采样重建画布 mask，四个采样帧达到 `53.628-54.081 dB`，MAE 只有 `0.167-0.227` 个 8-bit 色阶。效果 shader 也直接执行 `mix(LUT0, LUT1, mask.a)`；包内没有可见的阈值、腐蚀、Gaussian、gamma 或 mask 羽化 pass。此前的离线拟合是在补偿上游算法状态差异，不是遗漏了一组固定包内参数。

同一 handle 上连续输入“10 帧真人、20 帧灰底、10 帧同一真人”时，每个区段内部逐字节稳定，但返回真人后的 mask 最大值从 `201` 变为 `124`。这证明存在内容/历史相关状态，却没有简单 EMA 式逐帧过渡。包内 `skin_seg_is_video_mode`、`skin_seg_is_need_face`、直接 algorithm param 和低层 Effect picture-mode A/B 都逐字节一致。静态分析已经定位真正的 `TESwingProcessUnit -> TESwingEffectManagerV2 -> TESwingManagerInterfaceWrapper -> SwingManager::setUpdateMode` 宿主链路以及 C 入口 `bef_swing_manager_set_update_mode`；低层探针没有经过这条状态机。剩余差异已收窄到剪映 UI 实际传入的 update-mode 序列、算法预处理状态和重置时机；仍不能宣称逐像素完美复刻。

补齐 Swing/Metal 宿主后，manifest 可以区分“一次 seek 前连续设置 mode”的 `3,1,2` 与“每个 mode 后分别 seek”的 `3;1;2`；每个 staged seek 都必须重新绑定输入纹理。`3;1`、`3;1;2` 和直接 mode `1` 收敛到同一张强 mask，但这不是剪映 UI 的正确复现：同一张 854x480 无损输入上，既有低层 Effect 重放与剪映 UI 为 `37.331 dB`，Swing `3;1;2` 只有 `32.669 dB`，两条宿主路径之间为 `33.413 dB`。因此 `3;1;2` 已从“候选 UI 序列”降级为反例，后续必须以 `37.331 dB` 的低层路径为基线，不能因为 mode 调用成功就替换它。

状态重置实验仍给出独立的有效结论：真人、灰底、同一真人的返回序列中，`feature` 和 `video` reset 都不能恢复初始 mask；重建 Swing manager 及其 `AlgorithmService` 后，返回真人与初始 mask 的 SHA-256 完全一致。该结果确定了可复现的内容边界清理方式，但不代表剪映 UI 在所有边界上也必然销毁 manager。

`FaceMakeupV2System` 在预热日志中仍报告 `facecount = 0`，所以人脸关键点结果尚未通过独立 API 读回。这个日志不推翻 skin segmentation 结论：动态 mask 已随人物移动，并在真人近景中与脸、颈肩和四肢对齐；但“人脸关键点链路已完整复刻”仍不能宣称。

> 更正：该日志不代表检测失败。直接拦截人脸 SDK 入口后读到有效的人脸矩形、关键点和数量字段，
> 人脸链路是通的；同时实测人脸对 skin mask 没有影响（删除 `face_0 -> skin_seg_0` 连线后输出逐字节相同）。
> 见 [mask-binding-fix.zh.md](mask-binding-fix.zh.md)。

另外，完全退出中文剪映主程序和托盘辅助进程后，独立探针仍能在约 2.1 秒内完成一张真人帧的加载、20 帧预热、滤镜处理和读回，进程退出码为 `0`。输出与剪映仍运行时连续测试中的对应帧逐字节一致，证明执行滤镜时不需要启动剪映应用进程。

模型输入边界的独立对照进一步确认：低层 Effect 与 Swing 虽然都生成
`1x128x224x3`、172032 bytes 的 type 2 张量，但 payload 不同。主要差异是低层路径相对
Swing 垂直翻转；校正方向后仍有 `0.830` 的逐元素 MAE。完整证据和复现方式见
[model-input-boundary.zh.md](model-input-boundary.zh.md)。

七种独立纯色平场的后续 A/B 中，两条路径的模型输入逐字节一致，并共同使用 BGR 顺序和
`channel - 128` 映射。因此颜色范围、通道顺序、归一化和纯色量化已经排除；剩余差异必须
依赖空间变化，当前卡点收窄到缩放采样网格、插值或纹理边界处理。

水平和垂直坐标坡度的下一轮隔离实验显示，两条路径都明显采用 half-pixel center；
align-corners、asymmetric 和中心裁切均与观察值不符。对齐后的两路坡度张量只出现 `-1/0/+1`
差值，当前剩余候选进一步收窄到亚像素采样精度、插值 kernel 和输出取整规则。

后续脉冲与二维纹理实验推翻了单级 resize 前提，并确定两条路径都执行两级 bilinear：Low-level
为 `854x480 -> 227x128 -> 224x128`，旧 C API Swing 为 `854x480 -> 398x224 -> 224x128`。二维纹理对
正确路径的 RMSE 分别只有 `0.279` 和 `0.502`；单级或交换中间尺寸后的 RMSE 约为 `40-49`。
因此此前 `94.94%` 的取整解释已经撤回，主要差异是中间工作分辨率，不是不同的标准 kernel。
这条 `398x224` 结论只适用于旧 Swing，不代表剪映 UI。

随后对剪映 UI 连续 seek 的实时采样直接捕获到
`TESwingProcessUnit -> TESwingEffectManagerV2 -> TESwingManagerInterfaceWrapper -> SwingManager::seekFrameV2`。
旧 C create API 会硬编码 `XT_Init=true` 并清除 V2 标志；研究探针通过 UUID 限定的直接构造路径
进入同一个 `seekFrameV2`，60/60 帧成功并抓到新的模型输入。该 tensor 对
`854x480 -> 227x128 -> 224x128` 的拟合为 `MAE 0.087 / RMSE 0.295`，而 `398x224` 候选为
`MAE 0.819 / RMSE 1.812`。结合 UI 已确认调用同一 V2 入口，当前最强证据支持 UI 与 Low-level
选择相同的 `227x128` 中间尺寸；由于无法向 hardened UI 进程注入 observer，这仍是同入口复现推断。
它也解释了 Low-level 的 `37.331 dB` 为什么高于旧 Swing 的 `32.669 dB`。

V2 输出交付链现已定位。wrapper 只解引用第一份 `SwingDeviceTextureData` 的 texture，第二份结构只提供
texture code；剪映 `TESwingProcessUnit::renderEffect` 则把同一个 `shared_ptr<ITEVideoFrame>` 同时传给
manager 的输入和输出参数。因此宿主可见结果是同一 frame、第一张 texture 的原地写回，不是 callback
或独立 frame。探针读回该 texture 后连续渲染 `10/10` 帧成功，输出可见且不再是黑帧；预热后的
第 1 至 9 帧逐字节一致。此前的黑帧来自读取了 V2 不使用的旧式 output texture。该测试证明输出约定，
但使用的是本机标记为“银蓝”的资源，只能作为 handoff 证据。

> 本节以下的 V2 数字已作废。它们是在 native texture 第三标志为假的条件下测得的，交付的 skin mask
> 被上下颠倒地绑定，实际没有进入混合。修复与修复后的基线见
> [mask-binding-fix.zh.md](mask-binding-fix.zh.md)。

随后改用剪映草稿实际记录的“奥林巴斯”资源 ID `7361792068475325735`，将同一无缩放 854x480 UI
baseline 首帧作为 `3;1;2` 预热帧丢弃，再以 mode `1` 连续渲染并对齐全部 180 帧。V2 原地输出为
全片 `31.720 dB`、静态人像 `31.412 dB`、动态段 `31.882 dB`，均没有超过 Low-level 的
`40.741 / 37.331 / 44.681 dB`。按 Low-level mask 划分后，V2 的人像内部、软边缘和背景分别为
`22.552 / 27.610 / 39.038 dB`；人像内部蓝通道只有 `18.436 dB`。因此输出交付已解决，但视觉差值
没有缩小。随后对剪映 UI 底层 `SwingManager::setUpdateMode` 做进程内只读日志捕获，并按 manager
对象分组，确认同一实例加载时依次收到 `0 -> 1 -> 1 -> 2`，暂停 seek 收到 `0`，播放时逐帧收到
`1`；所有调用均来自 `TESwingManagerInterfaceWrapper::setUpdateMode`，顶层
`TESwingProcessUnit::setUpdateMode` 没有业务调用，测试中也没有出现 mode `3`。导出序列尚未捕获。

将真实加载序列分别按“一次 render 前连续 setter”和“每个 setter 各 render 一次”重放，丢弃预热
输出后与 UI 静态 60 帧比较，PSNR 分别只有 `30.876` 和 `30.374 dB`，均低于旧 `3;1;2`
候选的 `31.412 dB`，更低于 Low-level 的 `37.331 dB`。因此 update-mode/预热顺序已被排除为
主差距来源；当前卡点进一步收窄到 UI 与探针在 manager、AlgorithmService、segment/feature 创建时
的初始化参数、AB 状态、segmentation 模型选择或结果交付，而不是 resize、LUT、色彩矩阵或输出纹理读回。

最高优先级的 segmentation 结果交付随后被单独验证并纠正。独立 V2 宿主按真实加载顺序预热并渲染
同一 854x480 真人帧时，效果更新链五次读取同一个 `Bach::SkinSegInfo`：五次 `textureId()` 均为 `0`，
五次 `nativeBuffer()` 均为 `nullptr`，也没有调用 `updateTexture()`。但 working Low-level 对照具有完全相同
的 GPU 观察结果，并能稳定渲染正确效果。反汇编确认两条路径实际都从 native result `+0x18` 指向的
CPU 容器读取 begin/end；实测均得到完整 `224x128 / 28672-byte` mask。Low-level 连续 20 次 mask 哈希
完全一致；V2 的五个 staged pass 也均有有效数据。因此“mask 未绑定”结论撤回，texture/native 为空
只是 CPU fallback，不是故障。

真正的新控制变量是模型不同：Low-level 使用 MD5 `2b5a...d6e` 的静态 `tt_skin_seg_v5.0.model`，V2
资源回调使用 MD5 `cd547...c1e` 的 `tt_skin_seg_video_seg_fp16_v1.0.model`。两张最终 mask 校正垂直方向后
仍为 `MAE 15.442 / RMSE 40.492`，但不能作为同模型 parity。把 video model 强塞给 Low-level 后虽然
加载成功，mask 却退化为 `reflector=0`、值域 `0-15`，证明它还依赖 V2 宿主配置。真实 UI 位于 hardened
`--lvve-service` 子进程，本轮仍没有直接读取其 mask。下一步应定位 V2 的模型选择和 AlgorithmService
初始化参数，而不是补造 Metal texture 绑定。

随后只验证 manager 初始化的第三个参数。反汇编确认
`TESwingManagerInterfaceWrapper::managerCreateWithGpdeviceNoLock` 会把调用方布尔值映射为
`false -> 0`、`true -> 2`，尺寸、UUID `8` 和 GPDevice 的位置与独立探针一致。探针已按相同规则
传递 mode `2`。在同一 854x480 输入、奥林巴斯包、`3;1;2` 序列和模型解析条件下，mode `0`
与 mode `2` 的十张输出逐字节完全一致。被丢弃的预热帧均为 `22.227 dB`，首个有效 mode-1
测量帧均为 `32.899 dB`。这个参数在当前 V2 场景没有改变 mask 或最终像素，不是视觉差值来源。

另一次隔离实验让 finder 精确返回包请求的静态 `tt_skin_seg_v5.0.model`。最终 mask 对 Low-level
的方向校正误差从 `MAE 15.442 / RMSE 40.492` 改善到 `MAE 12.245 / RMSE 29.630`，但最终
单帧冷启动画面出现明显色阶断裂和偏绿。按既有规则丢弃 `3;1;2` 预热输出后，首个有效帧为
`32.899 dB`，高于同序列 video model 的 `32.106 dB`，差距实际缩小 `0.794 dB`，但仍明显低于
Low-level 的 `37.331 dB`。模型选择确实有贡献，却不是充分条件；静态模型仍缺少与 UI 一致的
AlgorithmService/segment/feature 配置。由于冷启动行为尚未解释，exact-first finder 没有作为默认
改动保留。下一轮若继续，应只比较一个创建配置变量。

继续对 manager/AlgorithmService 创建边界做单变量检查后，两个 UI 可见参数也已排除。
`TESwingManagerInterfaceWrapper::setIsImageQuality(true)` 实际映射为
`SwingManager::setParameterBool("EnableImageQuality", true)`；真实 UI 日志确实出现
`image quality is: 1`。但独立 V2 宿主在 `false/true` 两组中选择同一 video skin-seg model，
首帧后都得到 `398x224` 算法尺寸，十张 RGBA 输出逐字节完全相同。
`EnableAdjustColorWithFloat=false/true` 的十张输出也逐字节相同，首个有效帧均为
`32.105926 dB`。这两个参数都不是当前视觉差值来源。

此前创建后读取到的 `algorithm_size=0x0` 也不代表 `AlgorithmService` 缺失。新增的渲染后诊断
显示首个 seek/render 后尺寸变为 `398x224`，后续十帧保持不变；同一日志完整出现
`edit_alg_system`、graph parse、skin-seg model load 和 execute。C API 的 feature 创建路径会从
video segment 取得 manager，并以类型 `0` 和效果包路径创建 `FeatureSegment`；UI clip 路径最终
使用相同 AmazingEngine segment 类，但外围还会写入 model-clip 参数、cache 状态和 tracking 元数据。

UI 日志中的 `enableAlgorithmCache:9` 随后也被精确复现。真实入口不是 AB 猜测，而是
`TESwingManagerInterfaceWrapper::setAlgorithmCacheFlag(9)`，它直接调用
`SwingManager::setParameterInt("AlgorithmCacheFlag", 9)`；独立的 `RunAlgorithmMode` bool 保持不变。
探针日志按预期从 `enableAlgorithmCache:0` 变为 `9`，但两组都加载 MD5
`cd5474732a4b56b7fffceba8a83d7c1e` 的模型，算法尺寸都为 `398x224`，十张 RGBA 输出逐字节
完全相同。该 cache flag 也可排除。下一轮只应隔离一个真正影响算法输入的 AB 值或 post-create
model-clip 参数，不应再测试 `AlgorithmCacheFlag`、`EnableImageQuality`、
`EnableAdjustColorWithFloat` 或“手动补建 AlgorithmService”。

该历史候选随后已逐项检查：model-clip 参数不含分割配置，physical resolver 会改变输出，SIMD 0/1 在
ready 受控后逐字节一致。当前优先级已转为模型 ready 与首次结果/cache 提交生命周期，以下“当前收敛结果”
为准。

## 2026-08-11 当前收敛结果

普通多 Pass 路径现有三组逐像素基线。清透美食的完整二进制 graph 在显式注入
`intensity=1` 后与剪映 UI RGB 完全一致，`intensity=0` 则逐字节 passthrough；此前误差来自宿主
漏发强度事件，而不是 shader 算法。暗角旧影继续覆盖了包内 `src1.png`、sampler、Y 翻转、Alpha、
blur 和 pass 顺序，完整二进制重放同样与 UI RGB 完全一致。迷雾进一步验证四段 graph：水平/垂直
模糊、亮度 mask、双输入 Screen 混合、三张全分辨率中间纹理和最终 64 级 LUT；显式
`intensity=1` 后也达到 `RMSE 0 / PSNR 100 / SSIM 1`，独立复跑逐字节一致。见
[multipass-intensity-mapping.zh.md](multipass-intensity-mapping.zh.md) 与
[multipass-src1-binary-replay.zh.md](multipass-src1-binary-replay.zh.md)、
[multipass-fog-binary-replay.zh.md](multipass-fog-binary-replay.zh.md)。

人像模型解析也完成了一个受控修正：可选 exact-first finder 会先返回效果包实际请求的
`tt_skin_seg_v5.0.model`，再按 family fallback。与误选 video model 相比，它把静态 UI 对照从
`RMSE 1.813743 / 42.959291 dB` 改善为 `RMSE 1.796547 / 43.042030 dB`。幅度很小；
真实 UI 对照随后发现，UI 会把同一逻辑请求映射到实际 `v5.1` 文件，exact-first 使用的是旧 `v5.0`。
因此上述数字只能评价 `v5.0` 与错误 video fallback。后续对照把独立宿主的实际文件换成 UI 使用的 v5.1：
完整 UI mask 从 `MAE 9.797590 / IoU 0.853549` 变为
`MAE 3.243866 / IoU 0.962409`，最终 RGB 从 `RMSE 1.796547 / 43.042030 dB` 变为
`RMSE 0.916513 / 48.888033 dB`，证明 physical resolver 是像素变量。随后的 SIMD 实验发现，v5.1 候选在
首帧后才报告 CoreML ready；同一 v5.1 在 ready 受控后为 `RMSE 1.168216 / 46.780337 dB`。因此旧
`5.846004 dB` 不能再全部解释为纯模型文件收益，v5.0/v5.1 仍需同 readiness 协议重测。见
[portrait-model-resolution.zh.md](portrait-model-resolution.zh.md) 与
[ui-physical-skin-model.zh.md](ui-physical-skin-model.zh.md)。

`ExportMode` 的真实入口已定位为 `SwingManager::setParameterBool("ExportMode", value)`。固定其余条件后，
`0/1` 两组十帧逐字节一致，模型选择、算法尺寸和销毁日志也一致，所以该 bool 不是预览/导出差异来源。
见 [export-mode-lifecycle.zh.md](export-mode-lifecycle.zh.md)。

素材切换使用不同人物再次验证了状态边界：`A x3 -> gray x5 -> B x10` 若不 reset，十张 B 都不同于
fresh-B；在第一张 B 前重建 manager 后，十张 B 从第一帧起全部逐字节等于 fresh-B。因此独立宿主应
在 clip/source 边界重建 manager 和 `AlgorithmService`，同一连续 clip 内保持复用。见
[source-switch-manager-reset.zh.md](source-switch-manager-reset.zh.md)。

model-clip 参数通道也已真实捕获。`TESwingSegmentUtils::_generateFeatureParams` 只写入 feature 顺序和
起止 offset；剪映 UI 为奥林巴斯下发的完整 `amazing param` 只有 `blendMode`、`hasPostEffect`、
`intensity=1.0`、`previewColor`、空 `preview_effect_id` 和空 `time`。调用只发生在草稿加载时，返回地址位于
`TESwingEffectManager::updateSegmentParam` 内；再次选择滤镜轨道不会重复调用。其中没有模型、分割、mask、
关键点或 AB 配置，所以该通道已经排除。随后对 `updateBachAlgorithmParam` 的真实值做了单独捕获：当前 UI
走 legacy model-clip 分支，algorithm type 为 `0`、result directory 为空；`clip_res_path` 正确指向奥林巴斯
资源包。该函数只在 type 为 `1` 时继续，因此预计算算法结果目录路径同样可以排除。见
[model-clip-feature-params.zh.md](model-clip-feature-params.zh.md) 与
[bach-algorithm-model-clip-params.zh.md](bach-algorithm-model-clip-params.zh.md)。

模型名称 AB 也已完成单变量对照。真实 UI 与独立 V2 在 Swing 初始化处都读取
`support_external_model_name=3`，并请求相同的 face、face-extra 和 skin-seg 逻辑名字；差异发生在资源
resolver，UI 将请求映射到更新的缓存文件。同一 physical v5.1 文件上的 SIMD 单变量测试也已完成。在两组
CoreML 都于最终 preparation 输出前
ready 后，SIMD 0/1 的 71 张 RGBA 和 72 张完整 mask
逐字节一致，独立复跑亦一致；早先的小差异来自异步 ready 时序。首次结果与模型 ready/cache 生命周期由
后续单变量实验继续隔离。见
[support-external-model-name.zh.md](support-external-model-name.zh.md) 与
[ui-physical-skin-model.zh.md](ui-physical-skin-model.zh.md)、
[skin-seg-simd-ab.zh.md](skin-seg-simd-ab.zh.md)。

首次结果生命周期随后完成同帧双 readback与 ready 后 re-seek。被动等待两秒时，五帧连续测试每次均为
`0/1639680` 字节变化，且没有额外 CPU mask 交付。显式同 timestamp re-seek 在静态历史下达到
`48.888033 dB / mask IoU 0.962641`；同一 manager 经过运动历史后回跳只剩
`40.140233 dB / 0.265185`，两次独立复跑逐字节一致。结合 source-switch manager-reset 结果，独立宿主应在
clip/source 变化或向后时间跳转时重建 manager 与 AlgorithmService，连续 clip 内保持复用。见
[skin-seg-first-result-lifecycle.zh.md](skin-seg-first-result-lifecycle.zh.md) 与
[olympus-portrait-filter-e2e.zh.md](olympus-portrait-filter-e2e.zh.md)。

各能力的“已证明 / 未证明”边界汇总在
[current-coverage.zh.md](current-coverage.zh.md)。

完整 GL 与滤镜技术记录见 [gl-texture-context.zh.md](gl-texture-context.zh.md)。可复现的低层
Effect 探针见 [effect-cgl-render-probe.cpp](probes/effect-cgl-render-probe.cpp)，模型边界观察器见
[bytenn-input-capture.cpp](probes/bytenn-input-capture.cpp)，完整 CPU mask 观察器和模型对比工具见
[skin-seg-result-capture.cpp](probes/skin-seg-result-capture.cpp) 与
[compare-skin-model-runs.py](probes/compare-skin-model-runs.py)。

## 探针用途

探针通过动态符号加载研究接口，只用于本机互操作性验证，不是 QCut 产品代码。它要求调用者显式传入本机路径：

```sh
./effect-cgl-render-probe \
  <effect-library> \
  <model-directory> \
  <effect-package-directory> \
  <output.ppm> \
  core32 \
  --input <input.ppm>
```

`--input` 只接受 8-bit binary P6 PPM，并在上传为 GL texture 前处理垂直坐标方向。`--inspect-skin-result` 会按算法类型读取 `SkinSegBuffer`，并检查同尺寸 GL 纹理的格式、采样器和数值分布。`--skip-algorithm`、`--skin-seg-mode` 和 `--force-skin-seg-picture-mode` 都是隔离算法行为的 A/B 诊断参数，不是产品参数。

连续视频帧使用按播放顺序排列的文本清单，并将第四个位置参数改为输出目录：

```sh
./effect-cgl-render-probe \
  <effect-library> \
  <model-directory> \
  <effect-package-directory> \
  <output-directory> \
  core32 \
  --input-list <frames.txt> \
  --fps 30
```

序列模式只创建一次 context、纹理和 Effect handle；后续帧通过 `glTexSubImage2D` 更新同一输入纹理。输入帧必须同尺寸，输出文件沿用输入清单中的文件名。

Swing V2 路径的 skin mask 绑定修复、修复后的四配置基线，以及因此作废的旧 V2 结论，见
[mask-binding-fix.zh.md](mask-binding-fix.zh.md)。

产品实现应优先采用 QCut 自有 LUT 解析、渲染和获得授权的人像分割能力，而不是打包或调用剪映私有二进制。
