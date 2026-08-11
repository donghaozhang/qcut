# SkinSeg 模型输入边界对照

记录时间：2026-08-10

## 单一问题

本轮只验证一个问题：低层 Effect、旧 C API Swing 和剪映 UI 使用的 Swing V2 是否把同一张量送入 `tt_skin_seg`。

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

### 奥林巴斯同素材最终帧对照

前述 10 帧只验证输出交付，使用的是本机目录中资源 ID `7145394266209127694`、本地目录标记为“银蓝”的包。最终 parity 改用剪映草稿实际记录的“奥林巴斯”资源 ID `7361792068475325735`；其 `config.json` SHA-256 为 `59936c227115bb64cddcf72e0f7cb44d1e40e4e39b030d40292bfcd7052fc0`，`algorithmConfig.json` SHA-256 为 `2112803857244000a6857308b7e9b00fb35ca6eb082d65b5a814d226a8a14bc7`。

输入为既有无缩放 854x480 剪映 baseline 的 180 张无损 RGB 帧，目标为同一草稿、同一时间点、强度 100 的 180 张剪映滤镜帧。探针先用重复的首帧执行 `3;1;2` 并丢弃该输出，再从同一首帧开始以 mode `1` 连续渲染 180 帧。运行结果为 `181/181` 成功；比较只使用后 180 帧，因此没有初始化帧或一帧偏移混入。

| 路径 | 全片 | 静态人像 1-60 | 动态段 61-180 |
| --- | ---: | ---: | ---: |
| V2 原地输出 | **31.720 dB** | **31.412 dB** | **31.882 dB** |
| Low-level 既有基线 | 40.741 dB | 37.331 dB | 44.681 dB |
| 剪映无滤镜 baseline | 18.881 dB | 20.985 dB | 18.118 dB |

V2 全片分通道 PSNR 为红 `34.602`、绿 `39.786`、蓝 `28.048 dB`。使用同一 Low-level skin mask 划分诊断区域：`mask >= 128` 为内部，`8 < mask < 128` 为软权重/边缘，`mask <= 8` 为背景。结果如下：

| 路径 | mask 内部 | mask 边缘 | 背景 |
| --- | ---: | ---: | ---: |
| V2 原地输出 | **22.552 dB** | **27.610 dB** | **39.038 dB** |
| Low-level 既有基线 | 36.431 dB | 34.152 dB | 49.756 dB |

V2 在 mask 内部分通道只有红 `28.161`、绿 `30.936`、蓝 `18.436 dB`，而背景三个通道仍有红 `38.409`、绿 `44.968`、蓝 `37.028 dB`。这次单变量实验没有缩小最终差距：V2 输出交付虽然已经正确，但当前宿主复现的 segmentation 状态或 mask 绑定仍与剪映 UI 不同，且蓝通道人像内部是最大误差源。不能把“进入 `seekFrameV2`”等同于“复现剪映 UI 的 V2 状态机”。

## 剪映 UI 的真实 update-mode 与预热序列

下一轮只观察 update-mode，不改 resize、LUT、色彩矩阵、纹理读回或滤镜参数。由于两个 setter 都是 `libcccreator.dylib` 内部的非虚函数，普通 DYLD interpose 无法截获，hardened runtime 也拒绝 LLDB attach/launch。临时观察器因此只在当前剪映进程中对代码页做 copy-on-write 映射并记录 setter 参数；磁盘上的应用和 Framework 均未修改。观察位置为：

- `TESwingProcessUnit::setUpdateMode`，`libcccreator.dylib + 0x1f810a0`；
- `AmazingEngine::SwingManager::setUpdateMode`，`libcccreator.dylib + 0x17e2e04`。

在草稿“8月10日 (1)”加载同一 854x480 奥林巴斯素材后，所有实际调用都落在同一个 `SwingManager` 对象。加载阶段在约 1.2 ms 内依次收到原始值 `0 -> 1 -> 1 -> 2`，随后静置 5 秒没有新调用。暂停状态把时间线从 `00:00:00:00` 跳到 `00:00:01:17` 时只收到一次 `0`；开始播放后，同一 manager 每个渲染帧反复收到 `1`。测试期间没有观察到 `3`。所有调用都来自 `TESwingManagerInterfaceWrapper::setUpdateMode + 0xd0`（`libcccreator.dylib + 0x2249b98`），而 `TESwingProcessUnit::setUpdateMode` 没有收到业务调用。这说明 UI 绕过顶层 setter，通过 wrapper 直接设置底层 manager。导出流程本轮没有捕获，不能外推其序列。

日志必须按 manager 指针分组。此前未记录对象地址时，把不同操作产生的额外 `0` 误并入预热，形成了 11 帧序列；该结果作废。按同一对象确认后，只对精确加载序列做两种时序解释，并丢弃首张预热输出，再比较后续 60 张静态人像帧：

| V2 预热解释 | 静态 60 帧 PSNR | 相对原 `3;1;2` 候选 |
| --- | ---: | ---: |
| `0,1,1,2`，四次 setter 后只 render 一次 | **30.876 dB** | -0.537 dB |
| `0;1;1;2`，每次 setter 后各 render 一次 | **30.374 dB** | -1.039 dB |
| 原 `3;1;2` 候选 | 31.412 dB | 基线 |
| Low-level Effect | 37.331 dB | +5.919 dB |

两种真实序列解释均为 `61/61` 帧成功，比较严格排除了预热帧；连续 60 帧结果稳定。真实序列不但没有超过 Low-level，也没有超过原来的错误猜测，因此 update-mode/预热顺序不是当前最终帧差距的主因。这个实验完成的是排除：继续排列 mode 值不会缩小误差。

## V2 skin mask 交付边界

下一轮只验证最高优先级问题：独立 V2 宿主渲染滤镜时读取的 `SkinSegInfo` 是否已经持有 AlgorithmService 生成的 mask。不改 manager/segment/feature 创建参数、AB、update-mode、色彩或滤镜包。临时进程内观察器拦截以下三个对象边界，代码、日志和原始帧均保留在 `/tmp`：

- `Bach::SkinSegInfo::updateTexture`；
- `Bach::SkinSegInfo::textureId`；
- `Bach::SkinSegInfo::nativeBuffer`。

同一 854x480 真人首帧按已捕获的加载顺序 `0;1;1;2` 预热，再用 mode `1` 渲染一次，结果为 `1/1` 帧成功。五个 render pass 都查询了同一个 `SkinSegInfo` 对象：

| 观察项 | 次数 | 结果 |
| --- | ---: | --- |
| `textureId()` | 5 | 返回的纹理 ID 均为 `0` |
| `nativeBuffer()` | 5 | 返回值均为 `nullptr` |
| `updateTexture(...)` | 0 | 从未把 texture 写入该对象 |

调用点均位于 `libcccreator.dylib + 0x99bb60` 附近。最初把 texture ID 和 native buffer 同时为空解释成“mask 未绑定”，但 working Low-level 对照推翻了该结论：Low-level 同样返回 `textureId=0`、`nativeBuffer=nullptr`，也从不调用 `updateTexture()`，却能稳定渲染正确的分割效果。静态反汇编随后定位到真正的 CPU fallback：native result 对象的 `+0x18` 指向一个容器，容器的 `+0x10/+0x18` 分别保存 mask 数据的 begin/end 指针。

按该结构读取后，两条路径都交付了完整 CPU mask，而不是空对象：

| 路径 | 尺寸 / bytes | 值域 | 总和 | 稳定性 |
| --- | --- | --- | ---: | --- |
| Low-level Effect | `224x128 / 28672` | `0-252` | `905367` | 20 次读取哈希均为 `800709a8bda33c72` |
| V2 `0;1;1;2;1` 最终 pass | `224x128 / 28672` | `0-254` | `927044` | 五个 staged pass 随状态更新，最终哈希 `9213b7fc91cd7cf9` |

两张最终 raw mask 直接比较为 `MAE 23.224 / RMSE 57.409`；校正已知的垂直方向差异后为 `MAE 15.442 / RMSE 40.492`。该数字不能解释为同模型 parity，因为运行日志同时暴露了更靠前的控制变量：Low-level 加载的是 260961-byte、MD5 `2b5a3aed4a9a45a67b7febabe9247d6e` 的 `tt_skin_seg_v5.0.model`，V2 资源回调则加载 407541-byte、MD5 `cd5474732a4b56b7fffceba8a83d7c1e` 的 `tt_skin_seg_video_seg_fp16_v1.0.model`。

把 V2 的 video model 强制放入 Low-level 路径后，文件确实按同一 MD5 加载成功，但 mask 退化为 `reflector=0`、值域 `0-15`、总和 `10390`。这说明 video model 依赖 V2 宿主配置，不能通过替换模型文件建立有效对照。当前单变量结论因此是：**mask 交付链已经工作，剩余差异位于 segmentation 模型选择及其宿主初始化/运行配置，不是 `SkinSegInfo` 缺少 texture/native 绑定。**

## Manager 初始化 mode 对照

`TESwingManagerInterfaceWrapper::managerCreateWithGpdeviceNoLock` 的真实调用把第三个布尔参数转换为 SDK init mode：`false -> 0`、`true -> 2`，同时传入尺寸、空 finder、UUID `8` 和 GPDevice。独立探针原来把 `true` 当作整数 `1` 传入，现已改成同样的 `2`。

固定 854x480 输入、奥林巴斯包、`3;1;2` 更新序列、static-model 解析和其余 AB 后，分别运行 mode `0` 与 mode `2`。两组均完成 `10/10` 帧，十份 raw RGBA 逐字节相同。被丢弃的预热帧均为 `22.226933 dB`，首个有效 mode-1 测量帧均为 `32.899460 dB`。这个 mode 在当前用例中没有改变 segmentation 或渲染输出，可以从主差距候选中排除。

同一轮还临时让 finder 精确返回请求的 `tt_skin_seg_v5.0.model`。V2 最终 mask 对 Low-level 的方向校正差值改善为 `MAE 12.245 / RMSE 29.630`。没有边界预热的单帧输出严重偏绿并出现 posterization；按既有规则丢弃 `3;1;2` 预热输出后，首个有效帧为 `32.899460 dB`，比 video model 的 `32.105926 dB` 提高 `0.793534 dB`，但仍比 Low-level 的 `37.331 dB` 低约 `4.432 dB`。exact static model 确实缩小了一部分差距，却不等于 UI 的完整 AlgorithmService 配置。冷启动行为尚未解释，因此 exact-first finder 实验未作为默认行为保留。

真实剪映渲染运行在单独的 hardened `--lvve-service` 子进程。主应用观察库不会被该子进程载入，所以本轮没有取得 UI 内部 `SkinSegInfo` 的 CPU mask，不能声称已直接比较 UI 与探针 mask。临时强制 OpenGL R8 texture 只验证了 GPU 分支控制流；它不是 V2 Metal 可共享资源，不作为视觉或 parity 证据。

## 结论

Low-level 与旧 C API Swing 没有把真实图像的逐值相同张量送入 `tt_skin_seg`；旧路径的主差异除了垂直方向，还包括 `227x128` 与 `398x224` 两种中间尺寸。真实剪映 UI 明确运行 Swing V2，独立 V2 tensor 强匹配 `227x128` 路径，使“UI 使用 398x224”的假设变得不成立。

两级尺寸和 linear kernel 已经确定；旧 Swing 的固定点采样细节不再是 UI parity 的主线。V2 输出交付也已确定为第一张 texture 的原地写回，但同素材最终帧只有 `31.720 dB`，没有超过 `40.741 dB` 的 Low-level 基线。剪映 UI 的真实加载序列已捕获为同一 manager 上的 `0 -> 1 -> 1 -> 2`，暂停 seek 为 `0`，播放帧为 `1`；按两种 render 时序重放后静态结果只有 `30.876` 和 `30.374 dB`。update-mode/预热顺序因此已被排除为主差距来源。

最高优先级的交付检查已经纠正了“空 `SkinSegInfo`”假设。V2 与 working Low-level 都通过 `+0x18` 容器的 CPU fallback 交付完整 `224x128` mask；texture ID、native buffer 和 `updateTexture()` 不是判断绑定成功与否的必要条件。manager init mode `0/2` 也已通过逐字节 A/B 排除。static model 在正确预热后把首个有效帧提高约 `0.794 dB`，证明模型选择解释了一部分差距，但仍离 Low-level 约 `4.432 dB`。当前明确卡点是模型与 AlgorithmService、segment/feature 创建配置的组合。下一步若继续，只应隔离其中一个创建配置，不应继续调整 mode、resize、LUT、色彩矩阵或输出读回。

## AlgorithmService 与 feature 创建边界

`bef_swing_segment_video_get_algorithm_width_height` 直接读取 `VideoSegment + 0x4ac` 的宽高字段。
创建 video/feature 后立即读取为 `0x0`，但这只是惰性初始化：首个 seek/render 后变为
`398x224`，后续十帧保持不变。日志同时出现 `edit_alg_system` 的 `AlgorithmService` 创建、
`setDisplaySize(854x480)`、graph parse、skin-seg 模型加载和执行。因此当前宿主没有漏掉整个
AlgorithmService；差异位于已经运行的服务配置中。

UI 对 manager 调用 `setIsImageQuality(true)`，底层等价于设置 `EnableImageQuality=true`。
固定输入、奥林巴斯包、video model、manager mode 和 update-mode 后，对 `false/true` 各跑十帧：
两组模型 MD5 都是 `cd5474732a4b56b7fffceba8a83d7c1e`，渲染后算法尺寸都是 `398x224`，
十张 raw RGBA 逐字节相同。`EnableAdjustColorWithFloat=false/true` 也得到十张逐字节相同输出，
首个有效 mode-1 帧均为 `32.105926 dB`。这两个 UI/manager 参数可以排除。

静态调用链还表明，`bef_swing_segment_video_create_feature` 从 video segment 取回 manager，随后以
feature segment type `0` 和效果包路径调用 AmazingEngine 的通用 segment factory。UI 的 clip-based
路径最终使用同一组 `VideoSegment`/`FeatureSegment` 类，但在外围追加 model-clip 参数、cache 状态和
tracking 元数据。基础 feature graph 并非明显分叉点。

UI 的 `enableAlgorithmCache:9` 已通过真实 wrapper 入口单独复现：
`setAlgorithmCacheFlag(9)` 最终调用 `setParameterInt("AlgorithmCacheFlag", 9)`。它与
`setRunAlgorithmCacheMode` 写入的 `RunAlgorithmMode` bool 是两个参数；本轮只改变前者。
`0/9` 两组日志分别确认对应值进入 `SwingAlgorithmV2::initAlgorithm`，但模型 MD5、渲染后的
`398x224` 算法尺寸和十张 raw RGBA 均相同，逐字节差异帧数为 `0`。所以 cache flag 不是差值来源。
下一项应从 UI 与探针已经确认不同、且直接影响算法输入的 AB 配置中只选一个验证，而不是同时改写
整条创建链。

## 仓库边界

仓库只保存观察 probe 和文字结果。ByteNN、剪映 Framework、模型、滤镜包、输入素材、张量 payload、生成帧和完整运行日志均保留在仓库之外。
