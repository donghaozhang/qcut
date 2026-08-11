# 普通多 Pass：迷雾四段 Shader Graph 重放

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：对包含水平模糊、垂直模糊、Screen 混合和 64 级 LUT 的“迷雾”，独立 Swing V2
宿主能否直接执行完整二进制 graph，并在显式发送 UI 强度事件后复现剪映 UI 强度 100 的同一无损帧。

本轮没有改写 shader、替换模糊核、修改中间纹理、调整采样器或枚举 AB 开关。输入、Effect 包、尺寸、
update-mode、native texture flags 和 UI 目标都固定，只比较发送 `intensity=1` 前后的输出。

## 固定夹具

| 项目 | 值 |
| --- | --- |
| 滤镜 | 迷雾 |
| resource ID | `7160594413847203085` |
| package version | `e745e131cff1db913aea07f4098ec8de` |
| 输入 | 1280x720 无损 RGBA 静帧 |
| UI 目标 | 剪映 UI 强度 100 的 1280x720 无损 PNG |
| 宿主 | `SwingManager::seekFrameV2` |
| update-mode | 首帧 `0,1,1,2`，后两帧 `1` |
| native texture flags | `001` |
| `AlgorithmCacheFlag` | `9` |
| `EnableImageQuality` | `true` |
| parallel/async Swing | `true` |
| FeatureSegment 参数 | `{"intensity":1}`，首个成功帧后注入 |

输入 RGBA 的 SHA-256 为
`b1eea462c6fbb6398d488fce9eef05c932924543c8a631d1f4e630a4c1e92bdf`，与原始 PNG 解码后的 RGBA
逐字节一致。

## Graph 与资源绑定

包内 `main.scene` 串联四段渲染：

```text
share://input.texture
  -> Pass0: horizontal blur + luminance mask
  -> midRenderTex0.rt
  -> Pass1: vertical blur
  -> midRenderTex1.rt
  -> Pass2: screen blend with original
  -> NewScreenRT.rt
  -> Filter: 64-level cube LUT
  -> outputTex.rt
```

从序列化 material 读取到的关键绑定是：

| Material | 输入 |
| --- | --- |
| `pass0.material` | `share://input.texture` |
| `pass1.material` | `rt/midRenderTex0.rt` |
| `pass2.material` | 原图 `share://input.texture` + `rt/midRenderTex1.rt` |
| `filter.material` | `rt/NewScreenRT.rt` + `image/filter.png` |

`NewScreenRT`、`midRenderTex0` 和 `midRenderTex1` 均为 `ScreenRenderTexture`：宽高为 `0/0`，表示跟随
画布；`pecentX/Y=1/1`，没有降采样；`internalFormat=43`、`colorFormat=43`、`dataType=1`；min/mag
均为 `1`，S/T wrap 均为 `1`。`outputTex` 为 `SceneOutputRT`，内部格式同样为 `43`。

这次样本因此验证的是全分辨率中间纹理链，不代表半分辨率、浮点或 HDR 中间纹理已经覆盖。

## 强度映射

包内事件脚本把 UI 强度 `x` 同时映射到：

```text
Pass0.blurSize = x * 0.90 * 4
Pass1.blurSize = x * 0.90 * 4
Pass2.intensity = 1 - x * 0.50
Filter.intensity = x
```

所以 UI 100 对应 `x=1`，运行时值为 blur `3.6`、Pass2 mix `0.5` 和 LUT intensity `1`。只加载包而不
发送事件时，material 保留包内初始值，不等价于 UI 100。

## 运行

```bash
env \
  JY_FILTER_PACKAGE="$HOME/Movies/JianyingPro/User Data/Cache/artistEffect/7160594413847203085/e745e131cff1db913aea07f4098ec8de" \
  JY_MODEL_DIRECTORY="$HOME/Library/Application Support/QCut/Research/JianyingFilter/multipass-binary-host/food-v2-2026-08-11/models" \
  JY_FILTER_MANIFEST="$HOME/Library/Application Support/QCut/Research/JianyingFilter/multipass-binary-host/food-v2-2026-08-11/manifest.tsv" \
  JY_FILTER_OUTPUT="$HOME/Library/Application Support/QCut/Research/JianyingFilter/multipass-fog/fog-intensity-one-2026-08-11/output" \
  JY_VIDEO_WIDTH=1280 \
  JY_VIDEO_HEIGHT=720 \
  JY_VIDEO_FPS=30 \
  JY_NATIVE_TEXTURE_FLAGS=001 \
  JY_ALGORITHM_CACHE_FLAG=9 \
  JY_FILTER_FEATURE_PARAMS='{"intensity":1}' \
  JY_ENABLE_IMAGE_QUALITY=1 \
  JY_ENABLE_PARALLEL_ASYNC_SWING=1 \
  research/jianying-runtime-probe/run-probe.sh filter-sequence
```

探针以 `-Wall -Wextra -Werror` 构建，所有 manager、segment、参数和 seek 调用返回 `0`，两次独立进程
都渲染 `3/3` 帧。

## 结果

首个输出发生在强度事件注入前：

| 候选 | RGB RMSE | PSNR | SSIM | Delta E | 状态 |
| --- | ---: | ---: | ---: | ---: | --- |
| 未发送强度事件 | `9.685520` | `28.408345` | `0.990528` | `3.467146` | `unverified` |
| 显式 `intensity=1` | `0` | `100` | `1` | `0` | `verified` |

完整比较覆盖全部 `921,600` 个像素。注入后的两帧 SHA-256 都是
`82a592bd08e03d7c5503b527ab1a7fdf14349da1a39251d2cb08a6c0cb26559b`，第二次独立进程得到完全相同
的三个帧哈希，排除了单进程缓存偶然对齐。二进制 PNG 和 UI PNG 的容器哈希不同，但解码 RGB 完全一致；
`difference.png` 为全黑。

## 结论

本轮问题已经回答：**“迷雾”的四段完整二进制 graph 在显式发送 `intensity=1` 后，可以逐像素复现剪映
UI 强度 100。**

它比“清透美食”和“暗角旧影”多覆盖了以下组合：

- 两段半径 8 的可分离模糊和自定义权重；
- 由亮度阈值写入 Alpha 的 mask；
- 原图与模糊图的双输入 Screen 混合；
- 三张全分辨率中间 RenderTexture；
- 多个 uniform 由同一个 UI 强度事件联动；
- 最后一段 64 级 LUT。

因此，QCut 旧的 `gblur + linear blend` 大误差来自替代算法，不是剪映二进制无法在独立宿主中执行这套
多 Pass。对这三个已验证普通滤镜，宿主协议已经收敛为：完整包、同一 context/thread、正确原地纹理绑定，
以及显式 UI 强度事件。

这个结论仍只覆盖本机预览静帧和该包。它不覆盖降采样、浮点/HDR 中间纹理、动画纹理、视频跨帧状态、
真实导出路径，也不表示可以重新分发剪映二进制、shader、LUT 或缓存资源。

## 仓库外证据

证据目录：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/multipass-fog/
  fog-intensity-one-2026-08-11/
  fog-intensity-one-repeat-2026-08-11/
```

| 证据 | SHA-256 |
| --- | --- |
| 首次运行日志 | `f3dd7e9f91165aa5a4fc3924bcd308c78e35e4c89b8aeaccf552501a54a83e95` |
| 独立复跑日志 | `0ed55470e320f4093ca9e03a61f834cfa67b279a69a2652fe28ab21ab89e6d32` |
| 指标 JSON | `875f3411037b7caf1bd3e51305dfce09a9885186fae3674f0b10473293eeaef3` |
| 三联对照图 | `a157e06376abfcc9d33895c3c5eb7a0ce4418bdd0c40501d0849e2a1a4e9d425` |
| 全黑差值图 | `3a8c3a3b2f310f8eadc1c204ab2005390c6d93b39f59ceb9385c8eb01789c387` |
| `main.scene` | `a2da8e318e91b3c2d436605f7883d704f309916467e87454b34fc8afac6e63cd` |
| 强度事件脚本 | `3e31309e74c274703ba5ef68c095fb1808ebbf502e2dc4ea599a69e9b6e75270` |
| Pass 0/1/2/filter xshader | `7c73d286...` / `0e066fb1...` / `7fa7b726...` / `b94aab5d...` |

私有包、运行库、shader、LUT、输入和原始输出均留在仓库外。仓库只保存自有探针、命令、哈希、指标和结论。

## 下一次唯一变量

普通多 Pass 的下一轮只选择一个明确使用半分辨率或浮点中间纹理的非人像包，验证 `pecentX/Y` 或
`colorFormat` 改变时二进制宿主是否仍与 UI 一致。不要同时加入动画纹理、视频时序或导出 mode。
