# 普通多 Pass：UI 强度参数映射

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：剪映 UI 的滤镜强度是否通过 `FeatureSegment` 的 `intensity` 参数进入完整 Effect 包，以及缺少这次参数注入是否足以解释“清透美食”独立 V2 宿主与 UI 强度 100 之间的全部差异。

输入、Effect 包、1280x720 尺寸、纹理标志、Swing V2、update-mode、模型目录、`EnableImageQuality=1` 和 `AlgorithmCacheFlag=9` 全部保持不变。本轮不修改 shader、LUT、Pass、颜色空间或 AB 开关。

## 静态调用链

本机 `libcccreator.dylib` 导出 `bef_swing_segment_set_params`。定点反汇编确认该 C API 把 JSON 字符串转交给 segment 的 `setParameters` 虚函数；`FeatureSegment::setParameters` 解析顶层 JSON 对象，并逐项调用 `FeatureSegment::setParameter`。

`FeatureSegment::setParameter` 对键 `intensity` 有专门分支：保存输入标量，并把它乘入 feature node 的 preset 值后分派事件。这里不需要猜测 `preset_params` 包装格式，正确入口是：

```json
{"intensity": 1}
```

“清透美食”包内 `extra.json` 声明：

```json
{
  "effect_key": "effects_adjust_filter",
  "min": 0.0,
  "max": 1.0,
  "default": 1.0
}
```

同一包的 `AmazingFeature/lua/SeekModeScript.lua` 在收到 `intensity` 事件后，把同一个标量同时写入：

```text
pass0Material.u_sharpness = intensity
filterMaterial.intensity = intensity
```

因此 UI 的 `0..100` 对应运行时 `0..1`；它不是只控制最终 LUT，还同时控制前置锐化 Pass。

## 探针改动

`filter-sequence` 增加可选环境变量 `JY_FILTER_FEATURE_PARAMS`，通过 `bef_swing_segment_set_params` 注入 JSON。为了在同一次进程里保留严格基线，参数只在首个成功渲染完成后注入：

- `frame-0000`：未注入参数的原基线；
- `frame-0001`、`frame-0002`：仅参数发生变化；
- 每帧都会重新上传同一份原始 RGBA，避免 V2 原地输出污染下一帧。

私有库、包、模型、RGBA、PNG 和完整日志均留在仓库外：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  multipass-intensity/food-intensity-zero-2026-08-11/
  multipass-intensity/food-intensity-one-2026-08-11/
```

两次运行均返回 `rendered 3/3`，参数 API 均返回 `0`。

## 强度 0

参数：

```text
JY_FILTER_FEATURE_PARAMS={"intensity":0}
```

| 帧 | SHA-256 |
| --- | --- |
| 未注入基线 `frame-0000` | `0eae04f093df33eccbbcdff2bcc88ad13ee28e7661d85285b9bbab704d081f32` |
| 强度 0 `frame-0001` | `b1eea462c6fbb6398d488fce9eef05c932924543c8a631d1f4e630a4c1e92bdf` |
| 强度 0 `frame-0002` | `b1eea462c6fbb6398d488fce9eef05c932924543c8a631d1f4e630a4c1e92bdf` |

强度 0 的两帧逐字节一致。解码成 RGB 后与原图比较：

| RGB RMSE | PSNR | SSIM | Delta E | 状态 |
| ---: | ---: | ---: | ---: | --- |
| `0` | `100` | `1` | `0` | `verified` |

共比较 `921,600` 个像素，RGB 完全一致。强度 0 是严格 passthrough，不是视觉近似。

## 强度 1

参数：

```text
JY_FILTER_FEATURE_PARAMS={"intensity":1}
```

| 帧 | SHA-256 |
| --- | --- |
| 未注入基线 `frame-0000` | `0eae04f093df33eccbbcdff2bcc88ad13ee28e7661d85285b9bbab704d081f32` |
| 强度 1 `frame-0001` | `892ba6c7758495063b36edb5b834f18a04e81bad71b8667069a30e6dde81064a` |
| 强度 1 `frame-0002` | `892ba6c7758495063b36edb5b834f18a04e81bad71b8667069a30e6dde81064a` |

强度 1 的两帧也逐字节一致。解码成 RGB 后与剪映 UI 强度 100 的无损 PNG 比较：

| RGB RMSE | PSNR | SSIM | Delta E | 状态 |
| ---: | ---: | ---: | ---: | --- |
| `0` | `100` | `1` | `0` | `verified` |

同样比较全部 `921,600` 个像素，RGB 完全一致。PNG 文件哈希不同只是编码容器不同，不是像素差异。

未注入参数的旧基线与 UI 的差值正好是此前记录的 `RMSE 7.543120 / SSIM 0.977693 / Delta E 2.264585`。显式注入 `intensity=1` 后该差值全部归零。

## 结论

本轮问题已经完整回答：**“清透美食”此前的全部差异来自宿主漏发 UI 强度事件，不来自锐化核、中间纹理、LUT 采样、颜色空间或多 Pass 调度。**

这也证明，对这个普通多 Pass 包，直接调用剪映二进制并补齐 `FeatureSegment` 参数即可逐像素复现 UI 强度 100。初始化后的 material 默认值不等价于 UI 已应用状态，即使 `extra.json` 的 default 为 `1.0`，宿主仍必须显式发送 `intensity=1`，以同时更新锐化和 LUT 两个 Pass。

这个结论只覆盖该包和预览静帧路径。它不自动证明所有滤镜、人像算法、视频时序或导出路径一致，也不解决私有二进制的授权与分发问题。

## 下一次唯一问题

下一轮只选择一个明确使用额外纹理的普通多 Pass 包，保持同一宿主协议并注入 `intensity=1`。若它也与 UI 逐像素一致，就可以确认 `src1.png` 的 sampler、坐标、边缘和混合语义已经由二进制完整执行；若仍有差异，再单独追踪该纹理的绑定，而不同时修改颜色空间或 Pass 格式。
