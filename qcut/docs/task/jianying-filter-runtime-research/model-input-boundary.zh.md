# SkinSeg 模型输入边界对照

记录时间：2026-08-10

## 单一问题

本轮只验证一个问题：低层 Effect、旧 C API Swing 和剪映 UI 使用的 Swing V2 是否把同一个张量送入 `tt_skin_seg`。

实验使用同一份 854x480 RGBA 真人帧、同一个滤镜包和同一组本机模型。低层路径通过 `bef_effect_algorithm_texture` 与 `bef_effect_process_texture` 连续预热；旧 C API Swing 路径使用 manifest `3;1;2`。两条路径都保持一个 context、一个线程和递增时间戳。本文前半部分历史表格中的“Swing”均指这个旧 C API 路径，不代表剪映 UI 的 Swing V2。

## 抓取位置

公开的 Bach result getter 无法取得 `textureBlitter` 输入节点，按 node name 和 graph/node 查询都返回 `-1`。`IESMMProcessNN` 的 CoreML PixelBuffer/HWC 入口在本次实际推理中也没有接收输入；运行时最终经过 ByteNN 的 `ByteNNEngineImpl::SetInput(vector<Tensor>)`。

因此使用 [bytenn-input-capture.cpp](probes/bytenn-input-capture.cpp) 在 ByteNN vtable 的模型输入边界记录张量元数据。vtable slot 只有在 `dladdr` 验证其符号名与预期 `SetInput` 完全一致后才会替换。默认不写 payload，实验时通过 `JY_BYTENN_CAPTURE_PAYLOAD=1` 显式启用仓库外的临时 dump。

编译观察库：

```sh
xcrun clang++ \
  -std=c++20 \
  -dynamiclib \
  -Wall -Wextra -Werror \
  probes/bytenn-input-capture.cpp \
  -o /tmp/libjy-bytenn-input-capture.dylib
```

运行目标 probe 时设置：

```sh
JY_BYTENN_LIBRARY=/path/to/authorized/libbytenn.dylib \
JY_BYTENN_CAPTURE_DIR=/tmp/jy-bytenn-capture \
JY_BYTENN_CAPTURE_PAYLOAD=1 \
DYLD_INSERT_LIBRARIES=/tmp/libjy-bytenn-input-capture.dylib \
<probe command>
```

## 结果

两条路径的张量声明相同：

| 路径 | shape | type | payload |
| --- | --- | ---: | ---: |
| Low-level Effect | `1x128x224x3` | `2` | 172032 bytes |
| Swing `3;1;2` | `1x128x224x3` | `2` | 172032 bytes |

payload 按有符号 16-bit 元素解析，数值范围均为 `-125` 到 `124`。Swing 连续抓取三次得到完全相同的 SHA-256，证明该路径在本次静态输入上稳定。

| payload | SHA-256 |
| --- | --- |
| Low-level | `0faee4b0d024f51e72366a0222d94b85af73974f6c2b163d71b80f013006d6e1` |
| Swing（3 次一致） | `d69b7e88b482009961ee3a415490d73d49f1d7f8655b5a64e4c6aac61de07427` |

直接逐元素比较：

| 对齐方式 | MAE | RMSE | 完全相同 | 最大差值 |
| --- | ---: | ---: | ---: | ---: |
| 原始顺序 | 40.413 | 57.136 | 1.86% | 240 |
| Low-level 垂直翻转后 | 0.830 | 1.800 | 48.14% | 47 |

将低层 PPM 输入预先垂直翻转后重新运行，直接比较得到完全相同的 `0.830 MAE / 1.800 RMSE`，确认主差异是低层上传路径和 Swing 路径的垂直坐标方向相反，而不是比较脚本偶然找到了错误变换。

垂直对齐后的分通道 MAE 为：

- R：`0.835`
- G：`0.814`
- B：`0.841`

## 纯色平场隔离实验

为了区分颜色数值转换与空间缩放采样，随后保持 854x480、context、滤镜包、模型和调用顺序不变，对七种空间上完全均匀的 RGBA 输入分别启动独立的 Low-level 和 Swing 进程。纯色不受垂直翻转影响，也不会因正常的线性缩放产生空间变化。

七组输入的两条路径均生成 `type=2`、`1x128x224x3`、172032 bytes 的张量，并且每一组都逐字节一致：

| RGBA 输入 | 张量三个通道的唯一值 | 两条路径共同 SHA-256 |
| --- | --- | --- |
| black `(0,0,0,255)` | `-128, -128, -128` | `960098db9151ac209bd5b4750143a3ed3e4fb7a39f04c769fbe9208a6f4666bf` |
| gray64 `(64,64,64,255)` | `-64, -64, -64` | `4a5d1dddca2eb50422fd007fb49f77c7df296166a1da9226cfb2568cee0ece1e` |
| gray128 `(128,128,128,255)` | `0, 0, 0` | `2cbbeef1249170a43854962fa5b19fba628470c70beb9ce23e15a0f05cb891f2` |
| white `(255,255,255,255)` | `127, 127, 127` | `f6a6202c0672562c8cf6230ed7d5b2a88fc12c94d100033036be93e34094c619` |
| red `(255,0,0,255)` | `-128, -128, 127` | `8f0175652f97ff19c5a1dc8e9e7056ca88463cde978a0dc340d94b7190d6ca6b` |
| green `(0,255,0,255)` | `-128, 127, -128` | `43e038a1e883377329f531abae343aed6591bca3ede509e8732ea3279a7e772a` |
| blue `(0,0,255,255)` | `127, -128, -128` | `17a1ad977dd6761686c31d68feb33db8e502039c7640e185ce1666fb6b70fd37` |

结果确认两条路径共同使用 BGR 张量顺序和精确的 `channel - 128` 映射。颜色范围、通道顺序、归一化、纯色量化和均匀区域 padding 均不是 `0.830 MAE` 的来源。

## 采样坐标坡度实验

下一轮只验证采样坐标。输入仍为 854x480，分别生成水平和垂直三角坡度；每沿目标轴移动一个源像素，RGB 三个通道都变化一个色阶，并在 0 与 255 之间连续折返。该信号比普通 0-255 全幅渐变具有更高的坐标分辨率，同时避免 sawtooth 跳变。

水平张量直接比较；垂直张量按前一轮已确认的方向进行翻转对齐：

| 方向 | MAE | RMSE | 最大差值 | 完全相同元素 |
| --- | ---: | ---: | ---: | ---: |
| 水平 | 0.346 | 0.588 | 1 | 65.40% |
| 垂直，对齐后 | 0.328 | 0.573 | 1 | 67.19% |

随后用同一输入信号评估常见 resize 坐标公式。下表是观察值相对连续理想坡度的 RMSE；数值包含最终整数张量量化误差：

| 路径与方向 | half-pixel center | align-corners | asymmetric | 840px 中心裁切 + half-pixel |
| --- | ---: | ---: | ---: | ---: |
| Low-level 水平 | 0.382 | 0.904 | 1.469 | 4.067 |
| Swing 水平 | 0.453 | 0.877 | 1.440 | 4.131 |
| Low-level 垂直 | 0.277 | 0.839 | 1.401 | 不适用 |
| Swing 垂直 | 0.393 | 0.739 | 1.452 | 不适用 |

两条路径在两个轴上都明显符合 half-pixel center。Low-level 的拟合坐标为水平 `3.81237*x + 1.43149`，理论 half-pixel 是 `3.8125*x + 1.40625`；垂直反向拟合为 `-3.75005*y + 477.63341`，理论值是 `-3.75*y + 477.625`。Swing 的量化拟合与理论值也只相差亚像素量级，当前 8-bit 输入和 int16 输出不足以把这部分细分为微小坐标偏移或 sampler 数值精度。

因此可以排除 align-corners、asymmetric、中心裁切等坐标体系差异。坡度图中两条路径始终只差 `-1/0/+1`，说明真实图像中的较大边缘误差不是由宏观采样网格错位造成；剩余候选收窄到亚像素采样精度、插值 kernel 实现和输出取整规则。

## 两级插值 kernel 隔离实验

下一轮只验证插值 kernel。先使用单像素竖线脉冲和远距离灰度脉冲梳状图，区分单级 bilinear、area、cubic 与多级 resize；随后使用一张二维确定性高频纹理，同时验证水平和垂直路径。每组 Low-level 与 Swing 都在独立进程中运行；Low-level 重复三次的 payload 哈希一致，Swing 三个独立进程及每个 `3;1;2` 阶段也全部一致。

单级 half-pixel 无法解释脉冲响应。结合已经直接读出的 Low-level `ImageProducer 227x128`，枚举中间尺寸后得到两条不同但都由 bilinear 组成的两级路径：

```text
Low-level: 854x480 -> 227x128 -> 224x128
Legacy Swing C API: 854x480 -> 398x224 -> 224x128
```

`398x224` 是 Swing 先把短边缩到 224 后保持 16:9 得到的尺寸；Low-level 则先把短边缩到 128，得到已经由运行时读回确认的 `227x128`。脉冲和二维纹理的拟合结果如下：

| 路径 | 一维脉冲 MAE / RMSE / 命中 / 最大差 | 二维纹理 MAE / RMSE / 命中 / 最大差 | 错误的单级 resize RMSE |
| --- | --- | --- | ---: |
| Low-level，两级 linear | `0.004 / 0.067 / 99.55% / 1` | `0.078 / 0.279 / 92.23% / 1` | `48.665` |
| Swing，两级 linear | `0.004 / 0.067 / 99.55% / 1` | `0.250 / 0.502 / 75.10% / 2` | `40.484` |

将两条路径的中间尺寸交换后，二维纹理 RMSE 都约为 `40.2`；直接单级 resize 同样在 `40-49`。Area 候选在一维脉冲上的 RMSE 超过 `8.5`，也无法复现两级 linear 的双输出响应。结果因此不是“一个用 bilinear、另一个用 area/cubic”，而是同一 kernel 家族在不同中间工作分辨率上连续执行两次。

正确的两级路径也修正了上一轮的取整判断。五组坡度重新计算后，Low-level 在两级都取最近整数时平均 MAE 为 `0.035`，每组最大差均为 1；此前基于错误单级模型得到的 `0.210-0.616` 已被解释。Swing 的简单取整候选仍不能同时完全解释坡度与二维纹理：坡度最接近浮点中间值加最终向下取整，平均 MAE `0.255`；二维纹理则最接近两级取最近整数，MAE `0.250`。这部分应描述为固定点采样/量化细节尚未定位，不能再声称 Swing 已确定使用向下取整。

因此撤回“`94.94%` 证明取整是主要差异来源”的旧结论。该比例只是在错误单级理想值下观察到的次级现象；Low-level 与旧 C API Swing 的主要差异已经由 `227x128` 与 `398x224` 两种中间分辨率解释。当前 Low-level 最终输出对 UI 的 `37.331 dB` 仍高于旧 Swing 的 `32.669 dB`。

## 剪映 UI 的 Swing V2 复核

对正在预览同一 854x480 工程的剪映进程连续 seek，并使用 macOS `sample` 做非侵入采样。活跃调用链稳定出现：

```text
TESwingProcessUnit::doProcessWithSwing
-> TESwingEffectManagerV2::seekFrame
-> TESwingManagerInterfaceWrapper::seekFrameNoLock
-> AmazingEngine::SwingManager::seekFrameV2
```

采样中约有 503 次 `TESwingProcessUnit::doProcess`、502 次 `doProcessWithSwing`、469 次 render/seek 和 449 次 `SwingManager::seekFrameV2`。这直接证明当前 UI 使用 V2，而不是前文测试的旧 `SwingManager::seekFrame`。

静态追踪进一步解释了为什么原探针没有进入 V2：`SwingManager::init` 从 AB 键 `enable_parallel_and_async_swing` 读取 V2 标志，但公开 C create API 会在 init 前硬编码 `XT_Init=true`，随后把该标志清零。研究探针新增 `JY_ENABLE_PARALLEL_ASYNC_SWING=1` 后，使用 UUID 限定的直接构造路径避开这次强制降级；60/60 帧调用成功，进程采样明确进入 `seekFrameV2`。

V2 抓到的 `tt_skin_seg` 输入为 `1x128x224x3`、172032 bytes，SHA-256 为 `48239cef472220312fd25d4571cf8d34429ee39fd4bc444f44005cdc6043f6c0`。同一输入对两条候选两级 half-pixel bilinear 路径拟合如下：

| V2 候选路径 | MAE | RMSE | 最大差 | 完全相同 |
| --- | ---: | ---: | ---: | ---: |
| `854x480 -> 227x128 -> 224x128` | **0.087** | **0.295** | 2 | 91.30% |
| `854x480 -> 398x224 -> 224x128` | 0.819 | 1.812 | 46 | 50.21% |

因此 `398x224` 只属于旧 C API Swing。结合 UI 已确认调用同一个 `seekFrameV2`，当前最强证据支持 UI V2 与 Low-level 一样选择 `227x128` 中间尺寸；但 hardened runtime 阻止了向 UI 进程注入 tensor observer，所以这仍是由同入口独立复现得出的推断，不是 UI tensor 的直接 dump。此前 Low-level 最终帧比旧 Swing 更接近 UI 的现象也与该推断一致。

进一步静态追踪确认了 V2 的输出约定。`TESwingEffectManagerV2::seekFrame` 只是基类入口的薄封装；`TESwingManagerInterfaceWrapper::seekFrameNoLock` 在 V2 分支只解引用第一份 `SwingDeviceTextureData` 的 `DeviceTexture`，第二份结构只提供 texture code，随后调用 `SwingManager::seekFrameV2(firstTexture, firstCode, secondCode, timestamp)`。剪映宿主 `TESwingProcessUnit::renderEffect` 调用 manager 虚函数时，又把同一个 `shared_ptr<ITEVideoFrame>` 地址同时作为输入和输出参数传入。宿主边界因此是同一 frame、第一张 texture 的原地写回，不是完成回调，也不是另一份 frame 的返回；引擎内部是否使用临时纹理不影响这个宿主约定。

探针按该约定在 `seekFrameV2` 返回后读回第一张 texture。854x480 真人输入连续渲染 `10/10` 帧成功，输出不再是黑帧，并呈现明确的暖色滤镜效果。第 0 帧 SHA-256 为 `9f6c79b8db03a10f798e2e48a1abb34fa3f210f1e1792f20a860fe8ff803911c`；预热后的第 1 至 9 帧逐字节一致，SHA-256 均为 `cabb62486b6e27e4e87aee1c9ba52f8dd27b3bfe0fe5d73c6a8e5eb1ee2b580a`。稳定输出相对原输入 PSNR 为 `15.376 dB`，这里只用于证明 texture 已被显著修改，不能作为与剪映 UI 的 parity 指标。

## 结论

Low-level 与旧 C API Swing 没有把真实图像的逐值相同张量送入 `tt_skin_seg`；旧路径的主差异除了垂直方向，还包括 `227x128` 与 `398x224` 两种中间尺寸。真实剪映 UI 明确运行 Swing V2，独立 V2 tensor 强匹配 `227x128` 路径，使“UI 使用 398x224”的假设变得不成立。

两级尺寸和 linear kernel 已经确定；旧 Swing 的固定点采样细节不再是 UI parity 的主线。V2 输出交付也已确定为第一张 texture 的原地写回。下一项真正的 UI 差距是用既有 854x480 对照素材和同一个包重新测量 V2 对剪映 UI 的最终帧 PSNR，并继续隔离 segmentation 状态及 mask 后处理，而不是继续调整中间 resize 尺寸或寻找不存在的独立输出回调。

## 仓库边界

仓库只保存观察 probe 和文字结果。ByteNN、剪映 Framework、模型、滤镜包、输入素材、张量 payload、生成帧和完整运行日志均保留在仓库之外。
