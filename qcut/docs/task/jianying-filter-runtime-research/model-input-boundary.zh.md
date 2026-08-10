# SkinSeg 模型输入边界对照

记录时间：2026-08-10

## 单一问题

本轮只验证一个问题：低层 Effect 和 Swing 宿主是否把同一个张量送入 `tt_skin_seg`。

实验使用同一份 854x480 RGBA 真人帧、同一个滤镜包和同一组本机模型。低层路径通过 `bef_effect_algorithm_texture` 与 `bef_effect_process_texture` 连续预热；Swing 路径使用 manifest `3;1;2`。两条路径都保持一个 context、一个线程和递增时间戳。

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
Swing:     854x480 -> 398x224 -> 224x128
```

`398x224` 是 Swing 先把短边缩到 224 后保持 16:9 得到的尺寸；Low-level 则先把短边缩到 128，得到已经由运行时读回确认的 `227x128`。脉冲和二维纹理的拟合结果如下：

| 路径 | 一维脉冲 MAE / RMSE / 命中 / 最大差 | 二维纹理 MAE / RMSE / 命中 / 最大差 | 错误的单级 resize RMSE |
| --- | --- | --- | ---: |
| Low-level，两级 linear | `0.004 / 0.067 / 99.55% / 1` | `0.078 / 0.279 / 92.23% / 1` | `48.665` |
| Swing，两级 linear | `0.004 / 0.067 / 99.55% / 1` | `0.250 / 0.502 / 75.10% / 2` | `40.484` |

将两条路径的中间尺寸交换后，二维纹理 RMSE 都约为 `40.2`；直接单级 resize 同样在 `40-49`。Area 候选在一维脉冲上的 RMSE 超过 `8.5`，也无法复现两级 linear 的双输出响应。结果因此不是“一个用 bilinear、另一个用 area/cubic”，而是同一 kernel 家族在不同中间工作分辨率上连续执行两次。

正确的两级路径也修正了上一轮的取整判断。五组坡度重新计算后，Low-level 在两级都取最近整数时平均 MAE 为 `0.035`，每组最大差均为 1；此前基于错误单级模型得到的 `0.210-0.616` 已被解释。Swing 的简单取整候选仍不能同时完全解释坡度与二维纹理：坡度最接近浮点中间值加最终向下取整，平均 MAE `0.255`；二维纹理则最接近两级取最近整数，MAE `0.250`。这部分应描述为固定点采样/量化细节尚未定位，不能再声称 Swing 已确定使用向下取整。

因此撤回“`94.94%` 证明取整是主要差异来源”的旧结论。该比例只是在错误单级理想值下观察到的次级现象；主要差异已经由 `227x128` 与 `398x224` 两种中间分辨率解释。当前 Low-level 最终输出对 UI 的 `37.331 dB` 仍高于 Swing 的 `32.669 dB`，所以也不能因为 Swing 路径已拟合就用它替换 Low-level。

## 结论

两条宿主路径没有把真实图像的逐值相同张量送入 `tt_skin_seg`。主差异除了垂直方向，还包括两级 bilinear 使用不同中间分辨率：Low-level 是 `227x128`，Swing 是 `398x224`，最终才共同进入 `224x128`。纯色平场排除了颜色路径；坐标坡度确认宏观 half-pixel 映射；脉冲与二维纹理则把高频差异定位到两级缩放结构，而不是不同的 bilinear/area/cubic kernel 家族。

这次结果把差异定位到模型之前，不能再把全部误差归因于 segmentation 状态、mask 后处理或 LUT 混合。两级尺寸和 linear kernel 已经确定；剩余模型输入误差只保留 Swing 固定点采样/量化细节，不再重复颜色、坐标体系、标准 kernel 或单级取整枚举。

## 仓库边界

仓库只保存观察 probe 和文字结果。ByteNN、剪映 Framework、模型、滤镜包、输入素材、张量 payload、生成帧和完整运行日志均保留在仓库之外。
