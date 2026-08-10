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

## 结论

两条宿主路径没有把真实图像的逐值相同张量送入 `tt_skin_seg`。主差异是垂直方向；校正后仍存在较小但真实的预处理差异。纯色平场已经排除颜色和量化路径，剩余差异必须依赖空间变化，候选范围收窄到缩放采样位置、插值实现和纹理边界处理。

这次结果把差异定位到模型之前，不能再把全部误差归因于 segmentation 状态、mask 后处理或 LUT 混合。下一轮若继续，应一次只验证空间采样中的一个变量；本记录没有继续展开采样网格实验。

## 仓库边界

仓库只保存观察 probe 和文字结果。ByteNN、剪映 Framework、模型、滤镜包、输入素材、张量 payload、生成帧和完整运行日志均保留在仓库之外。
