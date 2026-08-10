# 剪映滤镜运行时互操作性研究

记录时间：2026-08-09，2026-08-10 追加中文剪映逐帧、ProRes 和无缩放对照

## 范围

本目录只提交 QCut 自有的研究文字和探针源码，用于记录剪映滤镜包的运行时行为、GL 纹理上下文要求和可复现实验方法。

本目录不包含，也不得后续加入：

- 剪映、火山引擎或其他第三方的 `.dylib`、Framework、可执行文件；
- `tt_face`、`tt_face_extra`、`tt_skin_seg` 等模型文件；
- 滤镜包、LUT、Shader、Lua、纹理、Scene、Material 或序列化资源；
- 剪映缓存数据库、原始运行日志或应用配置；
- 本地编译产物、PPM/PNG 输出和其他二进制证据。

需要复现实验时，应由研究者在仓库之外提供自己有权使用的 SDK、模型和素材。不得从本目录推导出重新分发第三方运行时的许可。

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

五组多斜率坡度进一步确认取整是低频差异的主要来源：Low-level 稳定更接近四舍五入，
Swing 稳定更接近向下取整；前三组中 `94.94%` 的位置符合两种规则应产生的 `0/+1` 差值形态。
剩余 `5.06%` 以及随斜率增大的残差仍排除了“只有取整不同”的解释，后续候选只保留亚像素
采样精度、插值 kernel 和边界行为。该结论只比较两条独立宿主，不能覆盖最终 UI 基准。

完整 GL 与滤镜技术记录见 [gl-texture-context.zh.md](gl-texture-context.zh.md)。可复现的低层
Effect 探针见 [effect-cgl-render-probe.cpp](probes/effect-cgl-render-probe.cpp)，模型边界观察器见
[bytenn-input-capture.cpp](probes/bytenn-input-capture.cpp)。

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

产品实现应优先采用 QCut 自有 LUT 解析、渲染和获得授权的人像分割能力，而不是打包或调用剪映私有二进制。
