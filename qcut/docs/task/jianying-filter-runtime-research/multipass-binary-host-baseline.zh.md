# 普通多 Pass：完整二进制宿主基线

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：不重写锐化、LUT、Pass 调度和中间纹理逻辑，直接把“清透美食”完整 Effect 包交给剪映 Swing V2 运行时，能否得到剪映 UI 强度 100 的同一最终帧。

本轮不修改 shader、资源、模型、颜色参数或滤镜强度，也不枚举 AB 开关。判据在运行前固定：

- 若二进制输出达到 QCut 的 `verified` 或 `close` 门槛，说明内部 Pass、纹理格式和资源绑定可以先整体委托给二进制；
- 若运行成功但仍为 `unverified`，说明“加载完整包”不是完整宿主协议，下一轮只追踪一个宿主参数；
- 若运行失败或输出等于原图，则先修复宿主调用，不讨论像素差。

## 固定输入

| 项目 | 值 |
| --- | --- |
| 滤镜 | 清透美食 |
| resource ID | `7403664041945681191` |
| package version | `59f14f9555fc38667c3ddb0814346cc8` |
| 输入 | 与既有滤镜实验室对照相同的 1280x720 PNG |
| UI 目标 | 剪映 UI 强度 100 的无损 PNG |
| 宿主 | `SwingManager::seekFrameV2` |
| 预览 mode | 首帧 `0,1,1,2` 后一次 seek；后两帧 mode `1` |
| native texture flags | `001` |
| `EnableImageQuality` | `true` |
| `AlgorithmCacheFlag` | `9` |

私有运行库、Effect 包、模型、RGBA 帧和日志均留在仓库外：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  multipass-binary-host/food-v2-2026-08-11/
```

## 夹具修正

首次启动在创建 manager 时请求 `/ttfacemodel/tt_face.model`，随后因资源回调返回空而崩溃。原因不是滤镜：探针的 `ModelCatalog` 只扫描传入目录的第一层，而本轮最初错误地传入了剪映递归的 `Resources/models` 根目录。

修正方式是在证据目录建立只包含 `tt_face`、`tt_face_extra` 和 `tt_skin_seg` 符号链接的扁平目录。没有修改探针、Effect 包或实验变量。修正后所有 manager、video segment、feature segment 和 seek 调用均返回 `0`。

## 运行结果

完整 Effect 包成功加载并执行，三帧全部渲染：

```text
[filter] rendered 3/3 frames
frame-0000.rgba  0eae04f093df33eccbbcdff2bcc88ad13ee28e7661d85285b9bbab704d081f32
frame-0001.rgba  0eae04f093df33eccbbcdff2bcc88ad13ee28e7661d85285b9bbab704d081f32
frame-0002.rgba  0eae04f093df33eccbbcdff2bcc88ad13ee28e7661d85285b9bbab704d081f32
```

三帧逐字节一致，说明静态输入在既定预热和播放 mode 下是确定性的。二进制输出与原图 RMSE 为 `34.442712`，确认滤镜确实生效，不是 passthrough。

与剪映 UI 强度 100 比较：

| 候选 | RGB RMSE | PSNR | SSIM | Delta E | 状态 |
| --- | ---: | ---: | ---: | ---: | --- |
| Swing V2 完整二进制包 | `7.543120` | `30.579783` | `0.977693` | `2.264585` | `unverified` |
| QCut 既有结构近似 | `6.649393` | `31.675164` | `0.974541` | `2.401960` | `unverified` |

二进制结果的 SSIM 和 Delta E 略优于结构近似，但 RGB RMSE 更差；它没有达到 `close` 门槛，也没有自动复现 UI 强度 100。

仓库外可视证据 `comparison.png` 从左到右依次为原图、Swing V2 二进制结果、剪映 UI 100。二进制结果视觉上执行了正确的调色和锐化家族，但对比度与细节强度仍不同。

## 结论

本轮问题已经回答：**剪映二进制可以稳定执行“清透美食”的完整多 Pass 包，但仅创建 `FeatureSegment` 并加载包，不等于剪映 UI 的完整滤镜配置。**

这同时排除了两个错误方向：

- 不是“QCut 无法调用这类多 Pass 二进制”；完整包已经连续执行成功；
- 不能把剩余差值直接归因于 QCut 的 FFmpeg 锐化核；剪映自己的二进制在缺少 UI 宿主参数时同样没有对齐 UI。

本轮没有证明中间纹理格式已经完全理解。它只证明内部图可以由二进制运行，并把下一卡点收窄到包加载之后、首次 seek 之前由剪映宿主写入的配置。

## 下一次唯一变量

下一轮只验证 **UI 强度到 FeatureSegment 参数的传递**：捕获剪映 UI 在强度 0、50、100 时调用的 segment/model-clip 参数入口和值，再在独立 V2 宿主重放其中一个入口。期间保持输入、包、mode、纹理标志、AB 状态和对照帧不变。

在强度入口被确认之前，不测试中间纹理格式、颜色空间、采样规则或其他 AB 开关，避免把多个变量混在同一轮。
