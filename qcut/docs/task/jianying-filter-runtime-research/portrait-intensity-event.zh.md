# 人像路径：FeatureSegment 强度事件

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：在奥林巴斯人像滤镜中，是否显式发送
`FeatureSegment {"intensity":1}`，能否解释旧 V2 基线约 `31.412 dB` 与当前
约 `43 dB` 结果之间的差异。

两组使用同一个输入、Effect 包、精确 static skin-seg model、V2 manager、
update-mode 序列、纹理参数、图像质量和算法缓存配置。唯一变量是是否设置
`JY_FILTER_FEATURE_PARAMS={"intensity":1}`。

## 固定条件

| 项目 | 值 |
| --- | --- |
| 滤镜 | 奥林巴斯 |
| resource ID | `7361792068475325735` |
| package version | `3db90437187dd911b234766ef7297fe9` |
| 输入 | 同一张 854x480 真人静帧，重复 10 帧 |
| 首帧 mode | `3;1;2` |
| 后续 mode | `1` |
| skin-seg model | `tt_skin_seg_v5.0.model` |
| model MD5 | `2b5a3aed4a9a45a67b7febabe9247d6e` |
| `EnableImageQuality` | `true` |
| `AlgorithmCacheFlag` | `9` |

运行日志确认无参数组仍精确请求并加载相同 static model，且两组均渲染
`10/10` 帧。

## 结果

预热后的 `frame-0001.rgba`：

| 对比 | RGB RMSE | PSNR | SSIM | Delta E |
| --- | ---: | ---: | ---: | ---: |
| 无强度事件 vs 剪映 UI | `1.796547` | `43.042030` | `0.995639` | `0.759327` |
| `intensity=1` vs 剪映 UI | `1.796547` | `43.042030` | `0.995639` | `0.759327` |
| 无强度事件 vs `intensity=1` | `0` | `100` | `1` | `0` |

两组 raw frame 的 SHA-256 完全相同：

```text
6cc16a55a89f3bfbb66396db082c3004d68eb9d4f0498e3406e99bcaa3ffc2b7
```

`cmp` 也返回逐字节一致。这个人像包在当前宿主配置下，初始化状态已经等价于
强度 1；显式强度事件没有改变最终帧。

## 结论

本轮否定了待验证假设：**奥林巴斯旧 V2 结果从约 `31.412 dB` 提升到
`43.042 dB`，不是由补发 `intensity=1` 导致。** 普通多 Pass 的清透美食需要
显式强度事件，但不能把该规律直接外推到所有人像包。

旧、新日志的后续差分找到决定性宿主变量：旧输入纹理格式为 `43`，新输入纹理
格式为 `50`。它对应 `createTextureFromNativeBuffer` 第三个标志从假变为真；该标志
控制 native mask 的垂直采样约定，也改变读回通道顺序。

这个变量已经在 `mask-binding-fix.zh.md` 中做过独立单变量验证：正确置位并停止多余
的 R/B 交换后，静态帧的人像内部 PSNR 从 `21.113` 提升到 `37.699`，全图 PSNR
从 `30.442` 提升到 `44.521`。因此旧约 `31.412 dB` 基线的主要问题已经确定为
mask 纹理绑定，而不是强度、模型 cache 或 update-mode。

仓库外完整证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  portrait-intensity/exact-no-intensity/
  portrait-model-resolution/exact-first-v2/
```

其中包含 probe 日志、raw 输出和 PNG；私有模型与二进制不进入 git。

## 下一次唯一问题

在 native mask 绑定已经修复、静态帧达到 `43.042 dB` 的新基线上，只研究导出路径
与预览路径是否使用不同的 update-mode、export mode 或销毁顺序。不再复跑已经排除的
强度、cache、图像质量和 manager init 参数。
