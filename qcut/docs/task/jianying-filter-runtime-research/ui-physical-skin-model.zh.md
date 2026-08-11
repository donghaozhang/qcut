# 人像路径：UI 物理 skin-seg v5.1 单变量对照

记录时间：2026-08-11

> 后续校正：本页记录的旧 v5.0 / physical v5.1 输出差异是真实的，但原协议没有控制 CoreML ready 相对
> 首次 staged 输出的时点。两次 v5.1 运行都在最终 `3;1;2` 输出之后才报告 ready；同一 v5.1 文件在
> ready 受控后得到不同 mask 与 RGBA。因此本页的 `5.846004 dB` 不能全部归因于模型文件。完整校正见
> [skin-seg-simd-ab.zh.md](skin-seg-simd-ab.zh.md)。

## 单一问题

本轮只验证一个变量：独立 Swing V2 宿主收到逻辑请求
`skin_seg/tt_skin_seg_v5.0.model` 后，把实际返回文件从安装包内旧 `v5.0` 换成剪映 UI resolver
真实返回的 `v5.1`，能否让完整 skin mask 和最终 RGBA 更接近同一剪映 UI 对照。

两组不改变 face/face-extra、效果包、输入帧、mode、时间戳、纹理标志、强度、manager/segment/feature
创建方式、AlgorithmCacheFlag、ExportMode 或任何 AB 值。尤其两组都保持
`enable_skin_seg_use_simd_optim=0`，没有同时复现 UI 中观察到的值 `1`。

这些是宿主调用参数上的单变量；原协议没有等待或观测两个模型后端在首次输出前达到同一 ready 状态，后来
证明这是一个遗漏的生命周期控制变量。

## 固定夹具

| 项目 | 固定值 |
| --- | --- |
| 滤镜 | 奥林巴斯 |
| resource ID | `7361792068475325735` |
| package version | `3db90437187dd911b234766ef7297fe9` |
| 输入 | 同一组 854x480 RGBA 真人静态帧 |
| 输出 | 10 帧；丢弃 `3;1;2` 预热输出，测量 output index `1-9` |
| mode | 首帧 `3;1;2`，后续 `1` |
| fps / 时间戳 | 30 fps；`index * 1,000,000 / 30` |
| native texture flags | `001` |
| input/output texture data code | `0 / 0` |
| feature 参数 | `{"intensity":1}` |
| AlgorithmCacheFlag | `9` |
| ExportMode | `0` |
| EnableImageQuality | `1` |
| EnableAdjustColorWithFloat | `0` |
| manager create option | `0` |
| parallel/async Swing | `1`，确认进入 V2 路径 |

两组运行都报告相同 face 与 face-extra MD5：

```text
tt_face_v11.1.model       8572969b01c3ca4b84b7078b3d9bde0a
tt_face_extra_v14.0.model 40355868b9ccc603edb1d32d44cbbf07
```

唯一不同的物理文件为：

| 组 | 逻辑请求 | 实际文件 | 字节 | MD5 | SHA-256 |
| --- | --- | --- | ---: | --- | --- |
| baseline | `tt_skin_seg_v5.0.model` | 安装包旧 `v5.0` | 260961 | `2b5a3aed4a9a45a67b7febabe9247d6e` | `dcfc109297b1db0605fcd3bc4e13b5ec7e0ca5a0107557f70ef97a8a3d8ded0b` |
| candidate | `tt_skin_seg_v5.0.model` | UI cache `v5.1_size100` | 2071057 | `63b6b4b76d30ec8e11c0e9fdfdc9a608` | `f84a8cd7355ec07cab3fa904f599ee0df91141d297d9a999736e04f06ae6a7cc` |

模型目录只使用同逻辑文件名的 symlink，模型本体不进入仓库。

## 探针与比较方法

[skin-seg-result-capture.cpp](probes/skin-seg-result-capture.cpp) 是只读、UUID gated 的本机观察器。它仅在已知
`libcccreator.dylib` UUID 上替换 `Bach::SkinSegInfo::textureId()` 入口，在返回原始 texture ID 前读取已经存在的
CPU fallback 容器。只有 `end - begin == width * height` 且大小不超过 4 MiB 时才写出 mask；它不修改模型、
算法、纹理、参数或返回值。本轮每次读取都是 `224x128`、28672 字节，调用方偏移一致为 `0x99bb64`。

[compare-skin-model-runs.py](probes/compare-skin-model-runs.py) 负责：

- 丢弃预热输出，并按 `output N -> mask capture N+1` 对齐稳定帧；
- 读取 9 张 RGBA 和 9 张完整 CPU mask，而不是只比较截图；
- 用半像素中心、clamp-to-edge 的双线性采样把 224x128 mask 放大到 854x480；
- 同时报告原方向和垂直翻转，避免靠静默选方向提高分数；
- 分别计算全 RGB、人物内部、soft boundary、背景、mask MAE/RMSE/correlation/IoU；
- 在仓库外生成逐像素差图和 JSON。

放大函数用常量图和 Pillow float bilinear 参考做了独立检查，最大误差小于 `2e-6`。旧 `v5.0` 的全 RGB
结果还复现了此前已经记录的 `RMSE 1.796547 / PSNR 43.042030 dB`，证明帧和 UI target 对齐没有漂移。

比较命令：

```bash
python3 docs/task/jianying-filter-runtime-research/probes/compare-skin-model-runs.py \
  --baseline-run "$E/run-v5-0" \
  --candidate-run "$E/run-ui-v5-1-repeat" \
  --ui-rgba "$E/ui-target-10.rgba" \
  --ui-mask "$E/ui-mask-10.gray" \
  --output "$E/analysis-repeat"
```

其中 `$E` 为仓库外证据目录：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/ui-v5-1-model
```

## 完整 mask 结果（原协议）

候选与 baseline 的原生 224x128 mask 本身有明显差异：

| 指标 | v5.1 对 v5.0 |
| --- | ---: |
| MAE | `8.631452` |
| RMSE | `24.246248` |
| correlation | `0.963576` |
| IoU @ 128 | `0.864227` |
| v5.0 soft-band fraction | `0.058210` |
| v5.1 soft-band fraction | `0.026053` |

与剪映 UI 的真实 mask 诊断视频逐帧比较：

| 物理模型 | MAE | RMSE | correlation | IoU @ 128 | soft-band fraction |
| --- | ---: | ---: | ---: | ---: | ---: |
| 旧 v5.0 | `9.797590` | `25.335922` | `0.961390` | `0.853549` | `0.061073` |
| UI v5.1 | `3.243866` | `8.613617` | `0.995469` | `0.962409` | `0.027823` |
| UI target | - | - | - | - | `0.032448` |

v5.1 把 UI mask MAE 降低 `6.553725`，IoU 提高 `0.108860`。原方向为明确正确方向；垂直翻转后两组
MAE 都超过 30，不能解释该提升。可视差图也显示旧 v5.0 错误覆盖了画面左侧背景人物，而 v5.1 的主体轮廓、
脖颈和背景抑制明显更接近 UI。

## 最终 RGBA 结果（原协议）

9 个稳定输出帧的聚合 RGB：

| 物理模型 | RGB MAE | RGB RMSE | PSNR | correlation |
| --- | ---: | ---: | ---: | ---: |
| 旧 v5.0 | `0.872214` | `1.796547` | `43.042030 dB` | `0.999665` |
| UI v5.1 | `0.561823` | `0.916513` | `48.888033 dB` | `0.999910` |

只替换物理 skin-seg 文件便令 RGB RMSE 降低 `0.880035`，相对降低约 `49.0%`，PSNR 提升
`5.846004 dB`。9 个测量帧都得到相同 PSNR 提升，不是少数帧拉高平均值。

按 UI mask 区域拆分：

| 区域 | v5.0 PSNR | UI v5.1 PSNR | 提升 |
| --- | ---: | ---: | ---: |
| 人物内部 | `47.078270 dB` | `47.669478 dB` | `+0.591208 dB` |
| soft boundary | `39.493100 dB` | `42.089029 dB` | `+2.595929 dB` |
| 背景 | `43.004278 dB` | `50.272168 dB` | `+7.267890 dB` |

提升最大的是背景，和 mask 差图中的背景人物误检一致。边界仍是候选中误差最大的区域，不能据此宣称人像链路
已经逐像素一致。

## 冷启动与确定性校正

第一次 v5.1 冷启动在临时 CoreML cache 中报告一次无效 `coremldata.bin`，随后回退并异步完成初始化；第二次
没有该初始化错误。两次运行都成功渲染 `10/10`，10 张 RGBA 与 11 张 mask 的目录摘要分别一致，说明它们
稳定复现了同一种状态。

但是重新核对日志顺序后，两次都是先完成最终 `timestamp=0 passes=3;1;2` 输出，随后才报告
`skin_seg coreml is Ready!`。所以“可重复”只证明 pre-ready/首次缓存状态确定，不证明 CoreML ready 已在
测量前完成。本轮后续受控实验在 staged seek 之间等待并确认 ready 先发生，同一 v5.1 文件变为：

| v5.1 生命周期状态 | RGB RMSE | PSNR | mask MAE | mask IoU @ 128 |
| --- | ---: | ---: | ---: | ---: |
| 原协议，最终 staged 输出后 ready | `0.916513` | `48.888033 dB` | `3.243866` | `0.962409` |
| 受控协议，最终 staged 输出前 ready | `1.168216` | `46.780337 dB` | `4.988363` | `0.946869` |

两种状态的原生 mask 有 `MAE 3.861258 / RMSE 12.994668`，最终 RGB 彼此有 `RMSE 0.899084`。异步 ready
确实污染了原模型归因，不能再说冷缓存没有影响测量语义。

## 结论

两边的逻辑请求和 `support_external_model_name=3` 一致，但 resolver 返回不同 physical 文件；替换文件后
完整 mask 与最终 RGB 都发生实质变化，所以 resolver 仍是已证明的像素变量。**本页不能再证明它独自贡献
`5.846004 dB`，也不能据此断言它是最大的纯变量**，因为 v5.1 后端的首次 ready/cache 状态没有与旧 v5.0
对齐。量化纯模型增益必须让两组都在相同的 ready-before-render 协议下重跑。

本页没有证明：

- physical v5.1 的纯模型收益是多少；
- face-extra 的 UI 物理映射是否影响人脸框或关键点；
- 动态人物、跨帧追踪和真实导出路径是否得到同样幅度的改善；
- 私有模型或运行时可以进入 QCut 产品或被重新分发。

后续 SIMD 单变量已经完成：ready 受控后 SIMD 0/1 的 71 张 RGBA 与 72 张 mask 逐字节一致。下一轮只应
固定 v5.1、SIMD、包和输入，捕获 ready 前后每个 staged seek 的结果交付，不要同时更换 face-extra、mode
或导出参数。

## 仓库外证据

| 证据 | SHA-256 |
| --- | --- |
| UI RGBA 10 帧 | `63ecf007c276e712f9285e208bc5eb20a0bf2dc084e3f03a4bf04fd43067cd95` |
| UI mask 10 帧 | `d63f3dd2808699b91e16fb80f64ef05197da0ed61485fe3c45adc1e398fdba0e` |
| manifest | `7484d26c252b2a20e6e2280c83cb98ecd9e0d5450ec42e048f86793bf929791b` |
| baseline log | `f606abe519c612ffc6ff04bbbce9e27248a787b2b49a1ffae566d00d5bec413c` |
| v5.1 cold-run log | `5a2838953c34038061268f32198bf8a64724484c0291d32b918a5295e6413443` |
| v5.1 repeat log | `d638765986f918f207ef7ffa743155742f32c26174754e78fc1c6e0891111690` |
| metrics JSON | `2cfa39c094038b07322aa4b9dfd1af2f761082143c588500a7bb5d3ab85a778e` |
| mask comparison PNG | `204b8faa1ae7d9b59ddedcafa0dd19bb8b386302371c4b1616ad83cd8e4e8a45` |
| RGBA comparison PNG | `abd461ea5b37c1fea86f08219148df3482a41a90b8788d40ba88dcbb950874dd` |
| compiled observer | `bafcee812f87b5e303957f0352e6ad0e27c78a7e8d8606a264914b58e49cd3e2` |

模型、效果包、原始帧、日志、PNG、JSON 和编译产物都保留在仓库外；仓库只保存自有探针源码、比较工具、
哈希、指标和结论。
