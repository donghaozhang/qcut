# model-clip 到 FeatureSegment 的参数边界

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：剪映 UI 通过 model clip 下发给 `FeatureSegment::setParameters` 的真实
`amazing param` 是否包含人像分割模型、AB 开关或 skin mask 配置。

先做静态调用链核对，再做只读运行时捕获；不修改参数、模型、滤镜包、update-mode、颜色路径或生命周期。

## 证据范围

分析对象：

```text
.local/jianying-runtime/Frameworks/libcccreator.dylib
SHA-256 d383946d322b9326adde930e01b61a54035b6307c7b5f3f4bd89e945510be265
```

仓库中的 `.local` 运行时只用于本机互操作研究，不进入 git。

## `_generateFeatureParams` 实际职责

`TESwingSegmentUtils::_generateFeatureParams` 位于 `libcccreator.dylib + 0x225c92c`。逐指令检查显示它只向
`EffectBundle` 写入以下三类 feature 通用元数据：

| EffectBundle 键 | model-clip 回退键 |
| --- | --- |
| `amazing effect order` | `amazing order` |
| `amazing effect start time offset` | `amazing effect start offset` |
| `amazing effect end time offset` | `amazing effect end offset` |

启用 CC model 路径时，它会先把 clip 动态转换为 `CCAmazingFilter`，再读取同等的顺序和起止字段；转换失败
时才读取旧 model-clip 键。该函数没有读取或写入分割模型、AlgorithmService、skin mask、人脸框、关键点、
AB 开关或算法缓存配置。

因此，`_generateFeatureParams` 不是当前人像差值的候选入口。

## `amazing param` 的真实入口

`TESwingEffectManager::updateSegmentParam` 位于 `libcccreator.dylib + 0x21eea14`。它先调用
`TESwingSegmentUtils::generateSwingParams` 构建通用 `EffectBundle`，随后从 model clip 读取
`amazing param` 字符串，并通过 segment vtable 的 `+0xc0` 入口下发。

`bef_swing_segment_set_params` 位于 `libcccreator.dylib + 0x1666aec`，它把 JSON 字符串转换为
`std::string` 后调用同一个 vtable `+0xc0` 入口。结合已确认的
`FeatureSegment::setParameters(std::string const&)` 行为，可以确定两条路径最终进入同一 JSON 参数解析器：

```text
ITEModelClip["amazing param"]
  -> TESwingEffectManager::updateSegmentParam
  -> Segment vtable +0xc0
  -> FeatureSegment::setParameters
  -> FeatureSegment::setParameter(key, value)
```

`updateSegmentParam` 还读取 `amazing flag`。值为 `1` 时会进入额外 LUT 文件处理和错误上报分支；这个 flag
本身不是分割模型配置，不能只凭名字当作人像 AB 开关。

## 只读观察器

观察器源码为 [probes/feature-params-capture.cpp](probes/feature-params-capture.cpp)。它只在进程内对
`FeatureSegment::setParameters` 入口做 copy-on-write remap，记录原始 `std::string`、调用线程、对象地址和
返回地址，然后原样调用原函数；不会修改 app 文件或参数内容。日志路径由 `JY_FEATURE_PARAMS_LOG` 指定，
未指定时写入剪映用户日志目录。

```bash
xcrun clang++ -std=c++17 -dynamiclib -arch arm64 -O2 -Wall -Wextra \
  -o /private/tmp/libjy-feature-params-capture.dylib \
  docs/task/jianying-filter-runtime-research/probes/feature-params-capture.cpp
codesign --force --sign - /private/tmp/libjy-feature-params-capture.dylib
```

先在现有 Clear Food 独立宿主上 smoke test：三帧全部成功渲染，观察器捕获到 15 字节的
`{"intensity":1}`，调用者为 `libcccreator.dylib + 0x1666bb8`。这与公开 C API
`bef_swing_segment_set_params` 的调用路径一致，也验证了 late-loaded `libcccreator` 的 dyld callback 能安装
hook。

## 真实 UI 捕获

在剪映草稿 `8月10日 (1)` 中打开同一奥林巴斯滤镜，时间线素材为
`olympus-ui-baseline-480-prores-hq.mov`，右侧滤镜强度显示 `100`。草稿加载时仅捕获到一次调用：

```text
caller = libcccreator.dylib + 0x21ef1a0
payload bytes = 144
```

返回地址正好位于 `TESwingEffectManager::updateSegmentParam` 调用
`FeatureSegment::setParameters` 之后。完整 payload 为：

```json
{"blendMode":false,"hasPostEffect":false,"intensity":1.0,"previewColor":[0,0.756862759,0.80392158,0.501960814],"preview_effect_id":"","time":[]}
```

随后在 UI 中再次选择滤镜轨道，没有产生第二次 `setParameters` 调用。因此本次记录的是 clip 加载时的完整
model-clip 参数，不是鼠标选择事件产生的临时值。

本机证据保存在 git 外：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/model-clip-params/
  ui-capture-2026-08-11/feature-params-capture.log
  ui-capture-2026-08-11/ui-olympus-intensity-100.png

feature-params-capture.log
SHA-256 0b46b0c691fbc694ca664d3188cdac886880697291d9d79a3a5f7c9c7f793018

ui-olympus-intensity-100.png
SHA-256 d0a1eb3061c8744472d686bcf79c5731b32254d60ded43944f5bac3f73bd44db
```

## 两个排除项

1. `_generateFeatureParams` 只负责顺序和时间范围，不负责像素相关的人像配置。
2. `_syncClipSegmentParameters` 读取的 `CCJsScriptUpdateParams` 只进入 ScriptSegment 的脚本更新入口，不是
   `FeatureSegment` 的分割参数。

## 结论

真实 `amazing param` 只包含 `blendMode`、`hasPostEffect`、`intensity`、`previewColor`、
`preview_effect_id` 和 `time`。它没有分割模型名、AlgorithmService 配置、skin mask 配置、人脸框、关键点或
AB 键，因此可以排除为当前人像 parity 差距的配置来源。

其中 `intensity=1.0` 与 UI 的 `100` 一致；既有独立宿主实验也已经证明人像包中“省略 intensity”和显式
`intensity=1` 输出逐字节相同。没有证据表明 `previewColor` 参与最终渲染，不应为了凑实验而猜测性 A/B。

## 后续验证结果

上述三个值已经在真实奥林巴斯 UI clip 上完成只读捕获：`cc_model_enabled=0`、algorithm type 为 `0`、
result directory 为空，`clip_res_path` 则正确指向资源 `7361792068475325735` 的效果包。由于函数只在 type
为 `1` 时继续，这条预计算算法结果路径没有启用，不能解释当前人像差距。完整静态链、双版本布局与证据见
[bach-algorithm-model-clip-params.zh.md](bach-algorithm-model-clip-params.zh.md)。
