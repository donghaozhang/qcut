# 剪映人物抠像 GRU 对齐记录（2026-08-27）

## 结论

QCut 与剪映现在使用同一份本地 `tt_matting_video_gru_v1.0.model`，并按 `TEMattingBlendEffectV2` 的透明模式语义输出可合成 Alpha。此前仍有三处可避免的链路差异：输入通道顺序、Alpha 放大方式，以及 GRU 输出后的二次时间平滑和阈值化。本次已修正这三处，并在真人运动视频上完成桌面端 E2E。

本机剪映专业版 11.3.0 当前 UI 暴露的是“智能抠像”、跟踪方向，以及已完成结果的羽化、边缘硬度、描边和阴影等控制；模型类型、网络输入尺寸及原生后处理参数留在内部。QCut 的“基础 / 精细”是面向用户的能力分层，不是剪映当前界面的逐字复制。

## 二进制证据

- 模型 SHA-256：`101688825490be3704babc7ce49f6d002cdb4fe69e879556b4687ac9006f8596`。
- `bef_Portrait_Matting_InitModel` 以外部类型 `4` 初始化后，`bef_Portrait_Matting_GetParam(handle, 6, ...)` 返回内部模型类型 `6`。
- 初始化后的参数值为：`0=1`、`1=15`、`2=256`、`3=0`、`4=0`、`5=0`、`6=6`、`7=0`。
- `MP_DoPortraitMattingRect` 对输入像素格式 `2` 走三通道直接复制路径；其他格式统一转换到格式 `2`。
- `liblens.dylib` 的 `GetColorConvertCode` 4×4 转换表为：

  ```text
  -1  5  3  1
   5 -1  1  3
   2  0 -1  4
   0  2  4 -1
  ```

  对照 OpenCV 色彩转换码可确定格式顺序为 RGBA、BGRA、BGR、RGB，因此格式 `2` 是 BGR888。旧桥把 RGB 字节标成格式 `2`，红蓝通道实际颠倒。
- 高层运行时还包含 `TEMattingReaderUnit2::preProcessAlphaChannel`、`TEMattingBlendEffect2` 和 `TEMattingBlendEffectV2`。这证明剪映不是直接显示低分辨率网络 Alpha，而是经过独立预处理和 Blend 后处理链。
- `TEMattingBlendEffectV2` 的透明模式片元公式为 `mix(vec4(0), source, mask.r)`，即输出预乘色和 Mask Alpha。QCut 的 WebM 采用直通 RGB + 同一 Mask Alpha，最终由 Chromium 合成器执行预乘；最终画面公式相同，同时避免在编码前预乘后被播放器再次乘 Alpha 产生黑边。
- 原生 V2 设备纹理入口已定位并做了独立 ABI 探针。后续宿主研究已复现 Metal RLDevice 注册、三张 AGFX `DeviceTexture` 和 `FastBlend`，`TEMattingBlendEffectV2::init=1`、`v2_active=1`，真人首帧调用成功且逐通道符合预乘透明公式。产品 provider 随后已接入该路径，并以精确 dylib 指纹、config ID 校验和整段兼容回退约束私有 ABI。完整证据见 [tematting-blend-v2-native-metal-2026-08-27.zh.md](tematting-blend-v2-native-metal-2026-08-27.zh.md)。

## 本次实现

- RGBA 解码帧改为 BGR888 后送入原生 GRU。
- 原生 Alpha 从 `256×448` 放大到源尺寸时，由最近邻改成半像素中心双线性采样。
- “精细”默认值改为保留原生 GRU Alpha：不再默认叠加第二次时间平滑、羽化和阈值重映射。
- “基础”和“精细”各自保留一套高级参数，切换质量时不互相污染。
- 桥启动后读取并校验内部模型类型必须为 `6`，避免缓存存在但实际模型分支不一致。
- 按反汇编校正 `MattingInput` ABI：`invertAlpha` 必须位于偏移 `0x20`，其前方保留 4 字节字段；桥内加入编译期偏移断言，避免私有结构体读取越界。
- 原生 ByteNN/AGFX 会向进程标准输出写诊断日志。流式模式原先也用标准输出传 Alpha，日志字节因此进入灰度帧流，造成画面分块、水平接缝和后续帧错位。桥现在复制原始输出描述符专供 Alpha，并把运行库标准输出重定向到标准错误；二进制数据与日志已完全分离。
- 输出文件写入实际 Blend 实现和 `qcut_matting_model=tt_matting_video_gru_v1.0` 元数据；当前受支持版本为 `qcut_matting_blend=TEMattingBlendEffectV2-native-metal`，自动回退时则标记 `compatible`，E2E 不再只依赖 UI 文案。
- 新增只读参数探针 `portrait-matting-param-probe.cpp`。
- 新增 V2 设备纹理 ABI 探针 `portrait-matting-blend-v2-probe.cpp`；该探针现在同时校验 RLDevice 所有权、Metal renderer、执行计划、原生返回值和像素公式。

## 真人视频验证

输入：2 秒、360×640、30 fps、60 帧真人运动片段。

| 指标 | 旧链路 | 对齐后 |
| --- | ---: | ---: |
| Alpha 均值 | 76.631 | 159.537 |
| `alpha > 127` 覆盖率 | 30.138% | 65.686% |
| 半透明像素占比 | 3.327% | 41.242% |
| 相邻帧 Alpha MAE | 3.6544 | 12.0044 |

旧链路的默认阈值和平滑把手、猫和大量软边缘误删，只剩上半部人物硬蒙版。对齐后恢复了手、猫、衣服和软边缘。较高的相邻帧 MAE 主要来自取消额外的 0.65 时间低通；GRU 本身已经保留跨帧状态，旧值不能直接解释为更接近剪映。

桌面 E2E 状态：精细模式完成，耗时 5 秒，界面显示“人物蒙版已应用到所选片段”。输出为 2 秒 VP9 WebM，360×640，`ALPHA_MODE=1`。

新增 `TEMattingBlendEffectV2-compatible` 输出与上一版 GRU 对齐输出逐帧完全一致：SSIM `1.000000`，PSNR `inf`。变化只在合成职责封装和可核验元数据，不改变已验证的 Alpha 结果。

状态重置验证：同一真人首帧分别交给两个全新桥进程，两个 `256×448` Alpha 输出均为 230400 字节，SHA-256 同为 `ef731a1767e2c4f345d1afa0cf2cc7fced96a8983433a42e5a6820dfa6c08d0b`，字节比较相同。这证明新任务会从干净的 GRU 状态开始，不会继承上一个片段的时序状态。

本机证据目录：`/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/`

- `real-person-cutout-gru-parity-v2-2s.webm`
- `alpha-old-vs-parity-v2-2s.mp4`
- `alpha-old-frame0.png`
- `alpha-parity-v2-frame0.png`
- `qcut-gru-fine-e2e-after.png`
- `jianying-smart-cutout-ui.jpeg`
- `real-person-cutout-tematting-v2-compatible-2s.webm`
- `tematting-v2-compatible-runtime.log`
- `tematting-v2-compatible-checkerboard-1s.png`

## 仍有差距

1. QCut 人物抠像 provider 已执行 `TEMattingBlendEffectV2` 原生 Metal `FastBlend`，并跨帧复用 input、Mask、output 三张纹理；Alpha 仍需回读编码，因此还不是最终零拷贝加速形态。
2. 当前剪映对照 Alpha 来自黑底/白底两次 H.264 导出的反推值，不是剪映直接导出的无损 Alpha；编码色差会进入误差，因此数值只能作为高可信代理，不能称为逐字节真值。
3. 羽化和边缘硬度的数值映射仍是 QCut 参数语义，不应宣称与剪映滑杆一一对应。
4. 有效宽景样本的后 30 帧差距显著大于前 30 帧。后续反汇编没有发现宿主执行固定的“前后帧 Alpha 融合”；更可靠的候选是 GRU recurrent state 的重置时机、片段级模型路由、边缘处理入口差异，以及黑白底 H.264 反推 Alpha 自身的误差，而不是给默认蒙版统一加腐蚀或阈值。

## 流式管线与取消（2026-08-27 下午）

原来的产品链先把整段视频解码为 `frames.rgba`，再把整段 Alpha 写为 `alpha.gray`，最后第三次启动 FFmpeg 编码。渲染期间的进度只有固定的 `8 -> 94`，AbortSignal 也只能在本机调用前后检查，不能终止已运行的桥。

现已改为带背压的连续管线：

```text
FFmpeg RGBA stdout -> GRU/TEMatting stdin
GRU Alpha stdout   -> FFmpeg alpha stdin -> VP9 WebM
```

- 不再创建整段 RGBA 或 Alpha 临时文件；临时目录只保留最终 WebM。
- 桥逐帧向 stderr 报告 `frame/total`，IPC 以任务 ID 回传真实进度。
- Renderer 取消会通过独立 IPC 触发 AbortController，同时终止解码器、原生桥和编码器；一秒后仍未退出的子进程会被强制结束。
- Native Metal 的 input、Alpha、output 三张纹理均已改为跨帧复用；逐帧通过已验证的 `RendererDevice::updateTexture` 更新内容。
- AbortError 不再触发 native -> compatible 自动重跑。

同一 2 秒、360×640、60 帧真人视频验证：

| 项目 | 结果 |
| --- | --- |
| Node 产品运行时 native Metal | 成功，60/60 帧，4.91 秒 |
| Node 产品运行时 compatible | 成功，60/60 帧，4.11 秒 |
| 取消 | 第 9 帧触发，0.90 秒返回 `AbortError`，进程正常退出 |
| Electron 桌面 E2E | 1/1 通过，16.0 秒 |
| 输出元数据 | `ALPHA_MODE=1`、`TEMattingBlendEffectV2-native-metal`、GRU v1.0 |
| 播放器 | `readyState >= 2`、360×640，截图已保存 |

桌面证据目录：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-desktop-e2e-streaming-native-metal/
```

### 剪映黑/白底 Alpha 反推（2026-08-27）

最初的蓝背景近景不适合作为差距基准：在真正的 `/Applications/VideoFusion-macOS.app` 中启用“智能抠像”后，剪映也几乎保留了整幅画面。该素材上的蓝色残留不是 QCut 独有问题，不能据此调高默认阈值或腐蚀半径。

随后从用户真人素材中截取 2 秒宽景，保持 360×640、30 fps、60 帧，在剪映中以同一抠像片段分别叠加纯黑和纯白底并导出。对齐两段画面后按 `alpha = 255 - (white - black)` 逐像素反推剪映 Alpha。该方法经过 H.264 输出，存在压缩和色彩转换误差，但真实经过剪映 UI、智能抠像和导出链，适合作为参数选择代理。

与剪映反推 Alpha 对齐 60 帧后：

| QCut 后处理 | 全帧 MAE | 二值 IoU | 结论 |
| --- | ---: | ---: | --- |
| 原始精细 Alpha | 17.1302 | **0.9383** | IoU 与边界误差均为本轮最佳 |
| 腐蚀 1 px | 17.8327 | 0.9344 | 边缘被进一步吃掉 |
| 腐蚀 2 px | 19.1778 | 0.9266 | 明显漏抠 |
| 阈值 0.55 | 16.3605 | 0.9282 | 平均灰度接近，但软边界变差 |
| 腐蚀 1 px + 羽化 1 | **15.0963** | 0.9344 | MAE 较低，但轮廓准确度仍低于原始 Alpha |

因此没有把腐蚀、硬阈值或内容拟合 LUT 写进“精细”默认值。它们能让个别截图显得更干净，却会系统性损失衣物、头发和手部边缘。

分段指标暴露出下一层差距：原始精细 Alpha 在前 30 帧的 IoU 为 `0.9890`、MAE 为 `8.04`，后 30 帧降到 IoU `0.8909`、MAE `26.22`。这说明静态模型输出已经很接近，主要剩余差距与跨帧状态、镜头内容变化、片段级模型选择和对照 Alpha 的压缩误差有关。静态分析尚未证明剪映在 GRU 后额外执行固定的多帧 Alpha 融合。针对这个样本拟合单调 LUT 虽能改善后半段，却会恶化前半段边界，因而没有作为产品修复。

有效对照证据目录：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/jianying-alpha-reconstruction-2026-08-27/
```

- `jianying-wide-cutout-black-ui.png`、`jianying-wide-cutout-white-ui.png`：真实剪映 UI 状态。
- `jianying-wide-cutout-black.mkv`、`jianying-wide-cutout-white.mkv`：两次剪映导出的同帧底色对照。
- `jianying-wide-reconstructed-alpha.mkv`：反推 Alpha。
- `alpha-parameter-sweep-frame15.png`：QCut 参数扫描。
- `source-jianying-qcut-diff-frame15.png`：源帧、剪映 Alpha、QCut Alpha、绝对差异（从左到右）。
- `qcut-wide-native-metal-stream-clean.webm`：隔离日志后由产品流式运行时生成的 60 帧 Native Metal 输出。
- `qcut-wide-native-metal-stream-corrupt-before-fix.webm`：修复前的分块错误样本，仅用于回归对照。

流式管线同时在该无音轨真人片段上通过 60/60 帧。修复前虽然文件存在且播放器 `readyState >= 2`，但解出的 Alpha 有明显分块错位，说明“能播放”不等于画面正确。修复后从 VP9 重新解出的第 15 帧 Alpha 轮廓连续，黑底合成不再露出矩形原背景。管线还会忽略中间 pipe 的裸 `EPIPE`，改由三个子进程的退出码和 stderr 给出具体失败环节，避免正常收尾竞态掩盖诊断信息。

最新真人桌面 E2E：1/1 通过，精细模式生成并挂载全帧 `1×1` Alpha 蒙版，预览播放器成功解码 360×640 VP9 Alpha；自动生成完成后不再默认进入几何蒙版编辑态，结果截图不再覆盖 80% 尺寸的误导性编辑框。证据目录：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-desktop-e2e-wide-native-metal/
```

## 老人脸部闪烁修复：QCut 双向窗口与人物内部保持

逐帧检查发现，旧 QCut 结果在第 5–6、30–31 帧会把老人脸部从前景降为半透明；例如第 5 帧脸部区域 Alpha 均值由剪映代理值 `252.14` 降至 `150.29`。异常已经存在于原始 Alpha，不是白底合成或 VP9 编码造成。

对 `/Applications/VideoFusion-macOS.app/Contents/Frameworks/libcccreator.dylib` 的第一轮只读符号审计发现，剪映宿主在模型外还包含：

- `TEMattingFaceDetectBin` / `handleFaceDetect`；
- `getPreviousFrame`；
- `getMaskInfoFromExtendFrames`；
- `scheduleMaskInfoPrefetch` / `takePrefetchedMaskInfo`。

后续逐函数反汇编修正了对这些名称的过度解释：`handleFaceDetect` 是片段级模型路由，`getPreviousFrame` 只返回宿主缓存的 `ITEVideoFrame`，`getMaskInfoFromExtendFrames` 只复制上游已经附着的一张蒙版，prefetch 则只调度未来帧的蒙版计算。它们证明剪映的“智能抠像”不只是单独调用一份 GRU 模型，但不能证明剪映宿主在 GRU 后执行了双向 Alpha 融合。系统 Vision 人脸检测也在老人倾斜、遮挡的脸上实测无结果，因此没有把它作为错误兜底。

QCut 新增的是不依赖私有宿主的自主修复，不再称为剪映 `extendFrames` 的等价复刻：

1. 保留前后各 5 帧，输出增加最多 5 帧延迟，不缓存整段视频；
2. 只在当前 Alpha 仍有前景证据时，从前后帧寻找颜色一致的高置信度前景；
3. 用当前帧 RGB 校验相邻帧候选，只保留颜色稳定的同位置前景，避免人物离开后产生残影；
4. 对低阈值前景内部做 3 px 安全腐蚀后再实心化，外轮廓与头发软边缘不参与填充；
5. 用户选择基础模式并已有显式时间平滑时，不重复叠加该精细模式修复。

同一 360×640、60 帧真人视频，与剪映黑/白底反推 Alpha 对比：

| 指标 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 全片 MAE | 17.1302 | **8.8952** |
| 全片二值 IoU | 0.9383 | **0.9777** |
| 前 30 帧 MAE | 8.0426 | **5.6900** |
| 后 30 帧 MAE | 26.2178 | **12.1004** |
| 第 5 帧老人脸 Alpha | 150.29 | **约 242** |
| 第 30 帧老人脸 Alpha | 180.49 | **约 241** |

桌面 Electron E2E 重新运行并通过 `1/1`：输出为 2 秒、360×640、30 fps 的 Native Metal VP9 透明视频；浏览器实际解码得到中心 Alpha 均值 `245.90`、顶部背景 `0`，并成功挂载人物蒙版及在预览播放器中播放。

最终证据：

- `/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-desktop-e2e-wide-temporal-window/e2e-evidence.json`
- `/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/jianying-alpha-reconstruction-2026-08-27/qcut-temporal-window-e2e-parity-metrics.json`
- `/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/jianying-alpha-reconstruction-2026-08-27/same-video-white-bg-jianying-left-qcut-right-temporal-window-2s.mp4`
- `/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/jianying-alpha-reconstruction-2026-08-27/same-video-white-bg-jianying-left-qcut-right-temporal-window-slow-4s.mp4`

## 六项宿主问题的追踪结论（2026-08-27）

研究对象固定为中文剪映专业版 `/Applications/VideoFusion-macOS.app` 11.3.0，不是 CapCut。以下结论来自对本机 arm64 `libcccreator.dylib` 的只读符号、字符串和窄范围反汇编；对象偏移和地址只适用于该版本。第三方二进制、模型和原始日志不进入仓库。

核验时还发现同一 `11.3.0` 版本号下存在两个不同的运行时 build：

| 位置 | universal dylib SHA-256 | arm64 UUID | 用途 |
| --- | --- | --- | --- |
| 当前 `/Applications/VideoFusion-macOS.app` | `b09c395d934169cb20ec865dd1d4032ca68023b287a7264e1b06ff4d71fd1be4` | `100726E3-FCB0-31BC-98EE-1B196A1714A3` | 本节六项宿主问题的静态分析对象 |
| QCut 私有运行时备份 | `0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9` | `D6342ECD-5432-33F0-A2AD-0C28F5699994` | 之前 Native Metal 探针和产品 E2E 的已验证对象 |

两个位置的 GRU 模型 SHA-256 都是 `101688825490be3704babc7ce49f6d002cdb4fe69e879556b4687ac9006f8596`，但 dylib UUID 已变化，说明不是 universal/thin 切片或签名显示差异。QCut 产品运行时读取自己的私有备份，并只对白名单中的旧 build 开启 Native Metal；它不会把当前新 build 误当成已验证 ABI。下面记录的宿主职责在新 build 中仍可见，但不能据此宣称两个 build 的所有私有偏移和调用参数兼容。

| 问题 | 当前结论 | 置信边界 |
| --- | --- | --- |
| GRU 状态如何重置 | 已确认 `matting_reset_optical_flow != 0` 时直接调用 `MP_IgnorePrevious`；单帧 cache miss、普通 seek 和含 frame 47 视觉切点的 60 帧无缓存任务都没有设置它 | 速度曲线中的非连续时间跳变是否设置该键仍需单独样本；普通素材硬切已排除 |
| 人脸检测做什么 | 动静态均确认是片段级模型路由；低于阈值切到 model type `3` 的 video saliency | 人脸检测器自身的具体模型文件尚未唯一定位 |
| `extendFrames` / prefetch 做什么 | 已确认是上游蒙版复用与未来帧计算缓存，不是宿主双向 Alpha 融合 | 缓存淘汰指标的字段名只能部分恢复，但不影响语义判断 |
| 边缘如何处理 | `MP_ProcessBorder(256,448)` 对 GRU Alpha 应用中心 `0.65`、斜率 `8` 的 256 项正弦 LUT；同尺寸输入没有额外空间腐蚀/膨胀 | 当前结论已在安装版与 QCut 私有备份两个 dylib 上逐字节验证；UI 羽化/边缘硬度仍是缓存后的 Blend 控制 |
| 预览和导出是否同一路径 | 完整缓存时两者都读 mask 后 Blend；单帧缺失时预览不补，导出即时 `doMattingRender -> MP_ProcessBorder` | 源范围、模型路由或效果包变化时怎样使 complete range 失效仍未知 |
| GPU fast path 是否零拷贝 | 已确认 V2 Blend 可走同设备 Metal 纹理；QCut 当前不是端到端零拷贝 | GRU 推理、纹理上传、Alpha 回读和编码仍是独立成本 |

### 1. GRU recurrent state 生命周期

模型字符串包含 `input_recur_feat`、`output_recur_feat` 和 `reset recur_feat`，低层还导出 `MP_IgnorePrevious`。该函数在当前版本中把 matting handle `+0x2cc` 的“先前状态有效”标志清零；Bach 路径在收到 `matting_reset_optical_flow` 时调用它。因此可以确认：宿主有显式的不连续点信号，让下一帧不再沿用前一帧的 recurrent/previous 状态。函数名里的 optical flow 不代表这里只重置光流；它最终作用在同一个 portrait-matting handle 的 previous-state 门禁上。

QCut 每个抠像任务启动一个新 bridge、创建一个新 handle，任务起点已验证为干净状态；同一任务内按时间顺序连续处理，不会跨任务泄漏。早期版本曾用稀疏画面差异猜测硬切并调用 `MP_IgnorePrevious`，但最新剪映无缓存实测已否定这一宿主假设，产品 bridge 已删除该检测和主动 reset。

### 2. 人脸检测不是“脸部补洞”

`TEMattingFaceDetectBin::configExtractFrame` 不逐帧追踪脸，而是按任务给定的采样间隔抽取有限数量的帧；当片长会导致样本过多时，宿主会增大间隔，使样本均匀覆盖片段。送检图像最长边限制为 480。

`TEMattingFaceDetectSinkUnit` 分别累计抽样总数与“检测到脸”的样本数。`TEMattingDriveUnit::handleFaceDetect` 计算二者比例：当有脸比例低于任务阈值时，日志为 `change model to video saliency`，并把模型类型切为 `3`、改用任务携带的 saliency 模型路径；否则保留 portrait matting 路径。应用包也同时带有 `saliency_matting_v1.0.model`、`tt_matting_video_v1.0.model` 和 `tt_matting_video_gru_v1.0.model`。

因此老人脸偶发变透明不能解释为“剪映检测到脸后把脸区域强行填满”。该 detector 的已确认作用是整段内容分类和模型选择。最新注入运行已把 `TE_MATTING_FACE_DETECT_PARAM` 唯一映射到两份实际加载文件：base 为 `tt_fsnew_base_jianying_v2.0`（1,299,522 字节，SHA-256 `89e4cf058aa4ec0eceda3ecffe6b5b599b718f58aaadac5e03e5c2c1b2d66227`），extra 为 `tt_face_extra_v15.0`（691,859 字节，SHA-256 `23f548af90179d43d89931ab7d579af6b0972cb382cac379b10b8b421053a44e`）。运行日志还确认 base 版本 `2025011603`、extra 版本 `2025010812`，检测器类型为 SSD，两者均由 ByteNN CPU backend 初始化。

### 3. `getPreviousFrame`、`extendFrames` 与 prefetch 的真实语义

- `getPreviousFrame` 的实现只从 `TEMattingUnit2` 缓存成员复制一份 `shared_ptr<ITEVideoFrame>` 给调用方；它不读取两张 Alpha、不计算光流，也不做融合。
- `getMaskInfoFromExtendFrames` 要求 pipeline 已带可用的扩展帧数据，然后把该帧中 `width × height` 的单通道字节复制进新的 `TEMattingMaskInfo`。函数自身不遍历前后帧，也不生成候选蒙版。
- `scheduleMaskInfoPrefetch` 以当前 PTS 加 `n × frameDuration` 生成任务，`n` 从 `1` 开始，因此是向未来预计算。frame duration 优先由 clip FPS 得到 `1,000,000 / fps`，无有效 FPS 时回退到 pipeline duration。
- 初始 lookahead 为 3 帧，运行时每累计约 60 次观测再调参，并把窗口限制在 3–5 帧。命中、过期和耗时统计改变的是预取深度，目标是减少预览等待与 cache miss，不是改变同一帧蒙版的像素公式。

`doProcess` 还会在不同状态分支中尝试持久化 mask、上游扩展帧 mask、prefetch 结果和按需 matting，最后再进入 Blend；分支并非所有帧都按一条固定直线执行。可确定的是“获取/缓存蒙版”和“改变蒙版像素”是两个不同职责。QCut 当前 ±5 帧颜色一致性修复是针对真人回归指标设计的独立算法，虽然把全片 MAE 从 `17.1302` 降到 `8.8952`，也不能据此反推剪映内部使用相同窗口或参数。

### 4. 边缘与人物内部后处理

低层存在 `PortraitMatting::ProcessBorder` / `MP_ProcessBorder`。`bef_MP_DoPortraitMattingRect` 这条包装入口会先执行 matting，再取得 Alpha 尺寸、分配暂存蒙版、调用 `MP_ProcessBorder` 并复制处理后结果。当前下载的智能抠像效果包进一步给出了真实图配置：

| 子图 | `model_name` | `matting_mp_modeltype` | `forwardtype` | `frashevery` | `edgemode` | `proc_border` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `ai_matting` | `tt_matting_video` | 4 | -1 | 15 | 1 | 1 |
| `ai_matting_gru` | `tt_matting_video_gru` | 4 | -1 | 15 | 1 | 1 |

非 GRU 图还显式给出 `matting_mp_imagemode=0`。这里的 `frashevery` 是包内原字段拼写。最初动态无缓存后台生成没有命中 `MP_ProcessBorder`，不是隐藏的另一路 Border：最新任务路由证实它已经从 GRU type `1` 切到不含 `matting_proc_border` 的 `ai_matting_video_object` type `3`。在同一素材上只把路由阈值临时降为 0、强制保留 GRU 后，导出的 `MP_ProcessBorder` 和图内 `PortraitMatting::ProcessBorder` 都严格命中 120 次。

单帧 cache-miss 导出则走另一条按需路径：10 次 `doMattingRender` 都紧接 10 次 `MP_ProcessBorder`，尺寸固定为 `256×448`、输入 Mat 类型字段为 `5`，返回值均为 0。首次创建 processor 时还观察到 `PortraitMattingIF::SetParam` 序列 `5=1, 6=-1, 7=1, 8=1, 1=15, 0=1, 5=1`，与效果包中的 `proc_border/forward/edge/refresh` 开关相互印证。早期 4096 点抽样哈希恰好漏掉变化区域，因此不能再作为“边界步骤可能恒等”的证据。

新探针 [portrait-matting-border-oracle.cpp](probes/portrait-matting-border-oracle.cpp) 直接创建 GRU handle、完成一次真实模型初始化，再把灰阶 ramp、带边界/矩形的空间图案和宿主同尺寸 `256×448` 合成 Alpha 送入原始 `MP_ProcessBorder`。反汇编与 oracle 共同确认构造函数调用 `UpdatePostprocessLutEff(8, 0.65)`，生成如下 256 项逐像素 LUT：

```text
x = input / 255
h = (π / 2) / 8
x < 0.65 - h  -> 0
x > 0.65 + h  -> 255
otherwise      -> floor(255 * (0.5 + 0.5 * sin(8 * (x - 0.65))))
```

安装版 `b09c...` 与 QCut 私有备份 `0c393...` 的三组测试均为 `mismatch=0, max_difference=0`。空间图案逐像素等于 LUT 结果，证明这条默认 GRU 边界步骤不是形态学腐蚀、膨胀或模糊；它把低置信度 Alpha 压向 0、高置信度 Alpha 推向 255。QCut 已在 GRU 原生 `256×448` Alpha 上先应用同一 LUT，再做双线性放大和自有高级控制。Saliency ScriptInfo Mask 不重复套用，因为其 Bach graph 已经消费 `matting_proc_border=1`。

UI 羽化从 0 改到 50、边缘硬度从 0 改到 19 时，没有调用推理、`MP_ProcessBorder` 或 SetParam，也没有改写任何 `mask/<PTS>` 的时间戳，只触发已有 mask/previous frame 的预览读取。两项值随后恢复为 0。它们属于缓存后的显示/合成控制，不是人物模型或磁盘 mask 的失效键。QCut 应复现这些图参数的语义，不能为了“调用同名函数”再重复执行第二次边界处理。

另一组 `PortraitMattingV2MorphH/V`、`PortraitMattingV2BlurH/V`、`PortraitMattingV2StrokeMask` 属于 `TEMattingBlendEffectV2` 的描边/feature 计划。当前真人透明抠像探针关闭 feature path 后命中 `FastBlend`，不能把描边用的 morphology/blur 当成默认透明蒙版清理。QCut 因此只复现已证实的正弦 LUT，没有再叠加猜测性的默认腐蚀或模糊。

接入后使用全新缓存根完成真人 Electron E2E，`1/1` 通过，用时 23.3 秒。旧软 Alpha 与新剪映 LUT Alpha 的 60 帧 PSNR 为 `9.447 dB`；零值比例从 `24.82%` 提升到 `37.28%`，255 比例从 `20.65%` 提升到 `35.37%`。白底图显示灰边明显减少，但模型原本低置信度的手臂/衣物也会被压掉；这说明剩余主观画质问题已从“边缘公式未知”收窄为“GRU 原始置信度不足”，不能再靠猜测腐蚀半径解决。证据保存在：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-border-lut-e2e-2026-08-27/
```

### 5. 预览、缓存与导出

`TEMattingUnit2::setPreviewModel` 在模型类型不是 saliency `3` 且 processor 已创建时，把资源名切为 `tt_matting_video_preview.model` 并调用 processor 的模型设置入口。调用条件现已收窄为：刚成功创建 matting processor、内部 `+0x78a` 预览模型标志为真、当前处理模式等于 fourcc `0x53544245`，并且最终模型类型不是 `3`。`doProcess` 与 `doMattingRender` 各有一个相同门禁的直接调用点。

`+0x78a` 构造时为 false；正常路径只在 type param 为 `1` 且 `(modelType & ~2) == 1` 时置真，也就是 model type `1` 或 `3` 的特定预览任务。随后宿主会读取 context property `36` 覆盖它；二进制属性名正是 `forceMattingDetectModelInPreview`。但 type `3` 到达 `setPreviewModel` 后仍立即返回，因此实际可切换的是满足上述预览任务条件的 portrait 路径。三次新任务动态运行均没有命中 `setPreviewModel`，证明后台完整蒙版生成不使用该模型。本机应用 Resources、用户 model cache 和效果包中仍没有同名独立文件，实际资源解析来源尚未定位，不能把字符串本身当成已缓存模型。

宿主同时有 `TEMattingFileHelper`、`insertMaskPTS`、`insertCompleteSegment`、`saveCatchToMANEFile` 和 `getMaskFile`。动态运行已经确认缓存命中分支：工程重开、顺序播放、反向/正向 seek、从当前时间向右跟踪和切分后的预览，都只执行 `getMaskFile -> TEMattingBlendEffectV2::doBlendRender`；切分没有创建新 cache ID，也没有调用推理或 `MP_IgnorePrevious`。这不能证明切分时永远不重置推理状态，而是证明完整 mask 存在时根本没有推理状态需要重置。

真实 7 秒导出阶段记录到 125 次 `getMaskFile`、125 次 Blend enter/exit，模型初始化、`doMattingRender`、prefetch、face detect、`MP_ProcessBorder` 和 `MP_IgnorePrevious` 都是 0 次。导出的 H.264 MOV 为 360×640、30 fps、7.000 秒。这直接排除了“有缓存也会在导出时强制用完整模型重算”的假设。

随后从两个 cache ID 各可逆地移走 PTS `1,000,000` 的 `mask` 和 `maskinfo`。停在 `00:00:01:00` 的编辑器预览只调用 `getMaskFile`，没有补算，该帧临时显示未抠像原画；同一工程导出时则出现 125 次 lookup、120 次正常 Blend，以及 10 次 `doMattingRender -> MP_ProcessBorder`。补算期间没有 face detect、preview model、prefetch、`MP_IgnorePrevious`、`insertMaskPTS` 或 `saveCatchToMANEFile`，导出后两个缺失文件仍未重新生成。也就是说，导出会为缺失 payload 尝试临时按需补算，但不会把结果写回已标记 complete 的磁盘段。

恢复原文件后，在完全相同的草稿状态下再次导出并做逐帧对齐。片段内 PTS 1 秒对应 timeline frame 90：完整缓存版本是白底抠像，缺帧版本却漏出整张原背景，PSNR 只有 `9.46 dB`；frame 91 立即恢复正常。由此可见，`doMattingRender -> MP_ProcessBorder` 的结果没有赶上同一输出帧，当前帧仍走降级结果，且没有持久化供下一次使用。证据图 `restored-vs-cache-miss-frame90.png` 左侧为完整缓存、右侧为缺帧导出。实验后两个原始 mask/maskinfo 已逐文件恢复。

### 6. 原生 GPU fast path 与 QCut 差距

剪映原生快路径要求 source、mask、output 三张 AGFX `DeviceTexture` 处于同一 Metal renderer、同一 GPDevice，并由当前 context 对应的 `TERLDeviceManager` / RLDevice 管理。它加速的是 morphology、stroke 和 blend 等合成阶段；没有证据表明这一个入口同时把 GRU/ByteNN 推理也变成零拷贝。

QCut 已实际调用相同 `TEMattingBlendEffectV2` 并命中 `FastBlend`。本轮进一步定位并调用 `RendererDevice::updateTexture(DeviceTexture, const void *)`：input、mask、output 三张 `DeviceTexture` 现在都在整段视频内复用，逐帧只更新 input/mask 内容。60 帧真人回归中 native 与 compatible Alpha 逐字节相同，桌面冷 E2E 也完整输出 60 帧。

这仍不是端到端零拷贝。GRU 输入来自 CPU BGR，V2 输出 Alpha 仍回读 CPU 后交给 VP9 编码；三次冷启动中 compatible 中位数为 `2510 ms`，native 为 `3341 ms`，native 仍慢约 `831 ms`。当前价值是减少私有纹理生命周期差异并锁定相同 Blend 语义，不是宣称性能领先。下一步性能收益必须来自减少 Alpha 回读或让预览/编码留在同一 GPU device chain，详见 [tematting-blend-v2-native-metal-2026-08-27.zh.md](tematting-blend-v2-native-metal-2026-08-27.zh.md)。

## 当前应用动态追踪（2026-08-27）

新增自有探针 [jianying-matting-runtime-trace.mm](probes/jianying-matting-runtime-trace.mm)，在只匹配当前 arm64 UUID/函数序言的前提下挂载 21 个窄入口，并额外记录 matting/model 文件的 `open`。探针以 `-Wall -Wextra -Werror` 编译；日志写在仓库外，第三方二进制、效果包、模型、配置和原始日志都不提交。

`open` 事件只用于定位资源活动：剪映启动时会扫描多份 model catalog，因此“某个模型文件被打开”不能单独证明当前片段使用了它。模型选择结论来自 `handleFaceDetect` 的动态命中、该函数的控制流和实际效果包图三者交叉验证。

### 模型自动切换

无缓存打开真人草稿时，两个任务都动态命中 `handleFaceDetect`。该函数读取 face sink 在 `+0x35c` 返回的“抽样总数/有脸样本数”，当总数至少为 1 且 `有脸数 / 总数 < MattingTaskParam(+0x180)` 时：

1. 把任务携带的 saliency 路径复制到输出任务；
2. 把输出 model type 写为 `3`；
3. 打印 `change model to video saliency`。

否则不改写人物模型。效果包同时提供 `ai_matting`、`ai_matting_gru`、`saliency_matting` 和 `ai_matting_video_object` 子图，因此这里是片段级内容路由，不是一个 UI 质量开关，也不是逐帧给脸补洞。

### 显著性 provider 的真实层级

效果包 `saliency_matting/algorithmConfig.json` 已确认不是 Portrait Matting C API 配置，而是一张 `640×640` Bach 图：`texture_blit -> script`，脚本节点写入 `model_name=saliency_script_for_cc`、`packed_model_group_key=script`、`return_mask=1`。但最新默认自动路由没有选择这张图，而是选择 `ai_matting_video_object/algorithmConfig.json`：`texture_blit -> general_seg(model_name=video_saliency_seg_bce)`。这两张显著性图不能再合并称作同一个 type `3` provider。实际模型目录同时存在并在应用运行时被解析：

- `saliency_matting_v1.0`，SHA-256 `ac2ae6badafc6a94641dc59b5844762676eee71b218785bfad37169eea380341`；
- `saliency_script_for_cc_v1.2`，SHA-256 `4d7fbc2ec820f28f3d0c8531a63d53a338d091a989109f20ee67377c4f594c01`；
- `video_saliency_seg_bce_v1.0`，SHA-256 `346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef`。

新增只读探针 [saliency-seg-abi-probe.cpp](probes/saliency-seg-abi-probe.cpp) 还原了独立 `Bingo_SaliencySeg_*` 的 handle、input、result ABI。它可以用应用 Resources 中另一份 `bingo_saliency_seg_v1.0.model` 成功输出 `360×640` Mask，但上述三份智能抠像模型分别初始化失败 `-109`，而把 `saliency_matting` 直接传给 Portrait Matting type 3 则返回 `-2010`。这两组结果仍能排除 Bingo SaliencySeg 和 Portrait API 直接换模型；它们不能证明自动 fallback 使用 `saliency_matting` script。最新任务已经动态证明自动 fallback 使用的是另一张 Bach `ai_matting_video_object` general-seg graph。Bingo 输出在真人样本上只保留局部手臂或产生错误条纹，因此没有接进 QCut 产品冒充剪映 fallback。

### Bach ScriptInfo 蒙版 ABI 与 QCut provider

[effect-cgl-render-probe.cpp](probes/effect-cgl-render-probe.cpp) 已在剪映专业版 11.3.0 的真实 `saliency_matting` 图上得到可用 `Bach::ScriptInfo`：`bef_effect_get_bach_result(..., type=141)` 返回的 wrapper 在 `+0x18` 保存结果 vector，第一项是 ScriptInfo。剪映自身 `TEBachMattingAlgorithm::getMaskAndBoundingBox` 的反汇编进一步确认：

- ScriptInfo 的键值 map 位于 `+0x10`；
- 宿主分别查询 `mask` 与 `ltwh`；
- `mask` 条目的 CPU image payload 指针位于 `+0x88`，payload vector 的 begin/end 位于 `+0x10/+0x18`；
- `ltwh` 通过导出的 `BachObject -> Vector4f` 转换得到目标矩形；
- 当前 360×640 真人帧返回 `ltwh=0,0,360,640` 与严格 230,400 字节 L8 Alpha。

研究探针输出的 PGM payload 与产品桥 [saliency-script-bridge.cpp](../../../electron/jianying-person-cutout/native/saliency-script-bridge.cpp) 输出的 raw Gray **逐字节相同**，SHA-256 均为 `1e75bc207638afe66056b613d5ca26a7b12a8fb8ded733dc3ba478a3d20954d6`。这证明产品不是从输出纹理猜 Alpha，也不是换用近似模型，而是读取剪映宿主同一 ScriptInfo 结果。

该 ABI 只对已验证的 VideoFusion 11.3.0 `libcccreator.dylib` 开放，库 SHA-256 必须为 `b09c395d934169cb20ec865dd1d4032ca68023b287a7264e1b06ff4d71fd1be4`。QCut 同时校验三份模型和两份 graph 配置的 SHA-256；任一不匹配都不进入该路径。模型和 graph 只缓存在用户本机 `~/Library/Application Support/QCut/PrivateRuntimes/JianyingSaliency/current/`，不提交、不打包、不重新分发。桥二进制由 QCut 自有源码构建，并已进入 staging、签名 entitlement 和打包一致性检查。

整段 60 帧真人调用成功，输出 cache key 为 `b46c0dd4b05a75294bfb66af7e4da30e0d858aa1d42258e762b9d8f618642de1`，Alpha 严格为 `13,824,000 = 360×640×60` 字节。冷运行约 4.1 秒，缓存命中复跑约 2.2 秒；透明输出 metadata 为 `saliency_script_for_cc_v1.2`、`saliency-script` 和 `TEMattingBlendEffectV2-compatible`。完整证据在：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-saliency-provider-e2e-2026-08-27/
```

这次真人反例也明确了 provider 的适用范围：强制把整段有脸镜头交给 saliency 时，它会优先保留手、衣服、地图等显著物，而不是完整两个人；因此不能取代 GRU。后续无缓存动态任务已直接读取 `MattingTaskParam(+0x180)`：两次 `handleFaceDetect` 的原始位模式都是 `0x3f000000`，即阈值 **0.5**。QCut 的实验性自动路由因此也改成“有脸样本数 / 有效样本数低于 50% 才切 saliency”。

但 QCut 当前本地 face graph 在这段真人素材的 3 个采样帧上全部漏检；若默认启用自动路由，会把人物抠像误送到 saliency。实测整段二值 IoU 会从强制 GRU 的 `0.9285` 降到 `0.5791`。因此面向用户的“人物抠像”现在默认固定为 `portrait-gru`；`saliency-script` 只接受显式高级选择，精确 0.5 阈值只在 `QCUT_ENABLE_PERSON_CUTOUT_AUTO_ROUTE=1` 的实验模式使用。最新动态结果还表明，QCut 实验模式当前选择的 `saliency-script` 并不是剪映这段素材实际选择的 `ai_matting_video_object`，所以它只能称为安全关闭的实验路由，不能称为自动 fallback 对齐。

GRU 与 saliency 现在共用同一套 Alpha 后处理实现：阈值、时序平滑、边缘移动和羽化不会因模型切换而失效。默认参数下 saliency 输出仍与原始 ScriptInfo Mask 逐字节一致；改变高级参数后输出 SHA-256 变为 `235aefc846d5ecb10ebaafb39fd61959f2e0e9532edbdf75698876bdd5359eb5`，证明控制项确实进入实际 provider，而不是只停留在 UI。两条路径不再根据像素差异自行猜测“硬切”并清空状态；重置边界改为任务生命周期。

两条自动路由均在共享后处理接入后通过真实 Electron E2E：有脸 2 秒素材走 GRU + native Metal，23.5 秒完成；无脸 0.5 秒素材自动走 saliency + compatible Blend，14.9 秒完成。两次均完成导入、属性面板、任务进度、添加透明媒体、绑定人物蒙版与播放器解码，截图和输出分别位于：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-auto-route-refined-e2e-2026-08-27/
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-auto-saliency-refined-e2e-2026-08-27/
```

### Mask 缓存格式与完成协议

这次无缓存运行产生两个 cache ID。每个 2 秒、30 fps 任务都有：

- `2/mask/<PTS>`：60 个文件，PTS 从 `0` 到 `1,966,667`，单文件固定 65,536 字节；该尺寸与 256×256 单通道 payload 一致，但本轮没有把它宣称为已完整解码的格式；
- `2/maskinfo/<PTS>`：60 个文件，当前样本每个 110 字节；
- `2/matting_result.json`：`{"result_time_range":[{"start":0,"end":2000000}]}`；
- `2/mocf`：485 字节。

运行事件严格对应为每任务 60 次 `insertMaskPTS`，然后 `insertCompleteSegment` 和 `saveCatchToMANEFile` 各一次。再次打开工程会直接命中 `getMaskFile`。这说明有效性单位至少包含 cache ID、matting type 目录 `2`、逐帧 PTS 和 complete time range；UI 的跟踪方向决定从当前时间向右、向左或双向补齐哪一段，而不是改变模型质量。

### Seek、跟踪、切分与状态重置

完整缓存下执行顺序播放、反向 seek、正向 seek、从当前时间向右跟踪和一次可撤销切分：

- 都只读取已有 mask 并 Blend；
- 切分前后仍为原来的两个 cache ID，各 122 个文件，没有产生新 ID；
- 没有调用 `MP_IgnorePrevious`、`doMattingRender`、prefetch 或模型初始化。

低层唯一直接调用 `MP_IgnorePrevious` 的配置分支读取键 `matting_reset_optical_flow`，值非零才清除 previous-state 标志。默认 `ai_matting` / `ai_matting_gru` 图没有写死这个键。因此 reset 是宿主在真正发生非连续推理时按任务注入的事件，不是每次 UI seek 都无条件调用；缓存命中的 seek/切分不能观察到它。

单帧 cache miss 导出虽然实际执行了 10 次按需 matting，也仍然 0 次命中 `MP_IgnorePrevious`。这进一步说明“缺一帧”本身不等于时序重置事件。它更可能使用导出任务的新 processor/当前顺序上下文，并从已存在的 previous frame 入口获取邻接输入；本轮确实观察到 5 次 `getPreviousFrame`，但不能仅凭指针返回证明 GRU recurrent feature 怎样初始化。

最新无缓存运行又给出了更强的反例：真人源视频在 frame 47 有全画面切镜，剪映仍连续生成 60 个 `mask/<PTS>`，期间 `MP_IgnorePrevious` 命中 **0 次**。因此剪映 11.3.0 的这条标准智能抠像任务不存在可观察到的“按像素硬切阈值”；`matting_reset_optical_flow` 是上游任务明确传入的离散事件，不应由 QCut 用画面差异自行猜测。

### 预览与导出策略

动态结果把策略收窄为：

```text
有效逐帧 mask
  -> 预览 / seek / 跟踪 / 切分后预览：getMaskFile -> Blend
  -> 导出：getMaskFile -> Blend

完整段中的单帧 payload 缺失
  -> 交互预览：不补算，临时显示原画
  -> 导出：尝试 doMattingRender -> MP_ProcessBorder，但当前帧仍漏出原画
  -> 不写回 mask/MANE

新任务或失效区间
  -> face sampling -> 片段级模型路由
  -> 算法图生成 mask -> insertMaskPTS
  -> complete segment + MANE/磁盘缓存
```

`setPreviewModel(tt_matting_video_preview.model)` 仍存在，但这轮完整缓存运行没有动态命中；不能把它描述成每次预览必走的固定模型。导出 E2E 及原始动态证据保存在：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/dynamic-host-trace-2026-08-27/
```

其中 `jianying-host-trace-export.mov` 的 SHA-256 为 `5f2a3e083309f56ec3835b99f9995938d8b000b368b9e8b8f6c548704dd73a4c`；同状态的缺帧/恢复缓存导出分别为 `af000972d99fb1a8f5dcae674490a3b89abfb0ef8e106a0af16db7b79e9ed30e` 和 `f0be9c58505e380e2029c5c567a4906fb5fcbf8098caf236314ab864d9b4b814`。实验结束后已经把草稿恢复为原来的未抠像顶层片段、撤销测试切分、把羽化和边缘硬度恢复为 0，并恢复实验前的 `matting/` 缓存。

## QCut 缓存完整性与连续时序实现（2026-08-27）

QCut 的精细人物抠像已从“推理 Alpha 直接流入编码器”改为两阶段：先完整生成并验证单通道 Alpha 缓存，再启动透明视频编码。缓存 manifest 记录实际帧数、宽高、Alpha 字节数、内容抽样指纹、模型名及 SHA-256、native processor SHA-256、片段级模型路由、抠像参数和 Blend 实现。缓存键不包含编辑器临时复制路径或文件 mtime，因此同一素材被复制到新的临时目录后仍可复用；模型、processor、路由、内容、尺寸、帧率、参数或 Blend 实现变化都会产生新键。这样边缘处理、时序策略或 Blend bridge 更新后不会继续复用旧算法生成的 Alpha。

未完成构建写在独立 `.building-*` 目录，只有 bridge 正常退出且 `alpha.gray` 严格满足 `frameCount × width × height` 时才写 manifest 并原子提交。导出只读取通过同一检查的完整缓存；少一个字节都会判定失效并重建，不再出现剪映当前 cache-miss 导出中“当前帧先漏出原背景、补算结果又不持久化”的降级分支。

GRU bridge 现在按已动态确认的效果包序列设置 `5=1, 6=-1, 7=1, 8=1, 1=15, 0=1, 5=1`，并在设置前验证加载后的内部模型类型仍为 6。每个抠像任务创建独立 handle，从天然干净的 recurrent state 开始；同一任务内按解码顺序连续处理，不再使用 32×18 像素差异猜测硬切，也不再主动调用 `MP_IgnorePrevious`。Saliency 的自有时间平滑同样保持连续。该策略与本轮剪映 60 帧无缓存动态结果一致。

曾尝试把首帧重复送入 GRU 5 次作为“预热”，但 frame 47–52 相对剪映缓存的 MAE 从 `49.373` 恶化到 `63.039`，IoU 从 `0.7854` 降到 `0.7045`，因此已删除。视觉切点 reset 与连续运行的原始 GRU Alpha 则逐字节相同；连续后处理只把全片 IoU 从 `0.928456` 微升到 `0.928508`。这些反证说明老人脸缺口不是简单的首帧预热或 `MP_IgnorePrevious` 时机问题。

真人桌面 E2E 连续运行两次均通过。第二次运行前后同一缓存的 manifest 与 Alpha mtime 完全不变，证明导出命中缓存而非重新推理；缓存 manifest 为 60 帧、13,824,000 字节，模型路由为 `portrait-gru`，Blend 为 `TEMattingBlendEffectV2-native-metal`。QCut UI 完成态、时间线蒙版和实际播放器截图保存在：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-cache-integrity-e2e-2026-08-27/
```

剪映应用内的 `saliency_matting.v1.0`、`saliency_script_for_cc.v1.2` 和 `video_saliency_seg_bce.v1.0` 已完成分层资源验证；`saliency_matting` Bach script graph 已接入 QCut 并通过强制 route、缓存命中、无脸实验 route 和真实 Electron E2E。`modelRoute`、模型/graph/processor 哈希均进入缓存身份，透明视频 metadata 会按实际路径写 `portrait-gru` 或 `saliency-script`。剪映自动选择的 `ai_matting_video_object -> video_saliency_seg_bce` 尚未作为独立 QCut provider 接入。

最新真人桌面 E2E 在删除硬切 reset、启动 `MP_IgnorePrevious` 和默认自动路由后，使用全新缓存根冷运行 `1/1` 通过。生成 60 帧、`13,824,000` 字节 Alpha；输出为 2 秒、360×640、30 fps VP9 Alpha，metadata 同时包含 `TEMattingBlendEffectV2-native-metal`、GRU v1.0 和 `portrait-gru`。浏览器实际解码中心 Alpha 均值 `248.72`、顶部背景 `0`。证据目录：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/raw-alpha-context-parity-2026-08-27/qcut-default-gru-e2e/
```

## 老人近景的最终模型路由与 Border 前 Alpha

本轮把测试草稿原来的 244 个 matting 文件可逆移出，使用注入探针重新生成两次，每次都处理两个 2 秒任务、各写入 60 帧。默认运行得到完全一致的路由：

```text
初始 model type 1
  -> ai_matting_gru/algorithmConfig.json
  -> face detector 抽样 2 帧，检测到脸 0 帧
  -> 0 / 2 < 0.5
  -> model type 3
  -> ai_matting_video_object/algorithmConfig.json
  -> video_saliency_seg_bce
```

这张近景实际没有进入 GRU。最终 object graph 的 SHA-256 为 `797fab4d5b1f0118ae565d3f9128b6a5d550b6af559c6da764c3d7777e1f7f5b`，唯一模型节点是 `general_seg(model_name=video_saliency_seg_bce)`；模型文件为 6,292,096 字节，SHA-256 `346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef`。该图没有 `matting_proc_border`，默认运行也确实 0 次命中 `MP_ProcessBorder`。因此“老人近景漏抠的首要来源”已经确定为片段级人脸漏检导致的模型选择，不是 GRU 后的 Border 参数。

为了把剩余两层拆开，受控运行只把 `MattingTaskParam(+0x180)` 从 `0.5` 临时改为 `0`，函数返回后立即恢复原值，使同一素材保留 `ai_matting_gru`。GRU graph SHA-256 为 `57a8edbedcb0701ca67b5106c7521b681ddba9c1618df1351c29ee22cdd8c270`，实际模型仍是 3,601,895 字节的 `tt_matting_video_gru_v1.0`，SHA-256 `101688825490be3704babc7ce49f6d002cdb4fe69e879556b4687ac9006f8596`。

强制 GRU 时，探针在导出 `MP_ProcessBorder` 入口和图内 `PortraitMatting::ProcessBorder` 各命中 120 次，并保存全部 `256×448` 输入/输出 Alpha。首个任务按 frame 47–59 汇总：

| 阶段 | Alpha 均值 | 0 值占比 | 255 值占比 |
| --- | ---: | ---: | ---: |
| `MP_ProcessBorder` 前 | 70.1207 | 45.0099% | 1.3926% |
| `MP_ProcessBorder` 后 | 45.8083 | 71.4176% | 8.1040% |

对照 frame 0–46，Border 前 Alpha 均值为 `162.1330`。也就是说，若强行使用 GRU，近景漏抠在 Border 前已经明显存在；已验证的正弦 LUT 又把大量低置信度像素压到 0，使缺口进一步扩大。三层责任现在可以分开陈述：

1. **默认剪映结果**：人脸检测 `0/2`，整段切到 object saliency，这是主路由差异；
2. **强制 GRU 原始推理**：frame 47–59 的上游 Alpha 自身已经大幅下降；
3. **图内 Border**：不制造第一次置信度下降，但会把已有低置信度区域进一步硬化为背景。

原始 trace、两次新生成的缓存和 480 份 Border Alpha 均保存在仓库外：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/closeup-model-route-preborder-2026-08-27/
```

实验结束后，测试草稿原来的 244 个 `matting/` 文件已按两个原 cache ID 完整恢复。

## 当前最小剩余未知项

本轮已经动态回答老人近景的模型图、人脸检测输出和 `MP_ProcessBorder` 前后 Alpha，也恢复了实验前缓存。现在真正剩下的是：

1. 改变源时间范围、模型路由结果和效果包版本时，剪映 cache ID 与 complete range 怎样失效；QCut 自有缓存已把实际路由和全部处理器哈希纳入内容身份；
2. `tt_matting_video_preview.model` 的调用门禁已经确定，但同名资源最终由哪个 catalog/resolver 映射或下载仍未知；
3. 剪映自动 fallback 的 `ai_matting_video_object -> video_saliency_seg_bce` graph 尚未接入 QCut；当前 `saliency-script` 是另一张已验证但语义不同的显著性图；
4. 剪映宿主是否避免 Alpha 回读，以及推理、写缓存、Blend、编码各阶段的真实耗时；QCut 已完成三张 device texture 跨帧复用，但仍有 CPU Alpha 回读。Saliency provider 为规避子进程管道的分片差异，当前还会先落一份临时 RGBA。

因此 QCut 当前可以称为“同 GRU 模型、同 BGR 输入、同正弦边界 LUT、同 Metal Blend、已接入一张可用的 Bach saliency script graph、同 0.5 判定阈值，并有严格缓存完整性和按任务隔离的连续时序”。不能称为完整复刻剪映私有宿主或同自动 fallback；当前最值得修改的是 QCut 的自动路由防误判策略和 `ai_matting_video_object` provider，而不是继续猜老人近景的腐蚀或羽化参数。

本轮阈值与 reset 原始证据：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/raw-alpha-context-parity-2026-08-27/jianying-threshold-reset-trace/
```

本轮 QCut 真人桌面 E2E、量化与左剪映/右 QCut 白底对比：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/raw-alpha-context-parity-2026-08-27/qcut-default-gru-e2e/
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/raw-alpha-context-parity-2026-08-27/jianying-left-qcut-right-white.mp4
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/raw-alpha-context-parity-2026-08-27/jianying-left-qcut-right-frame-55-white.png
```

## 2026-08-28：object graph 宿主边界与精细模式最终补洞

### 剪映 object graph 实际输出链

再次清空测试草稿的可恢复 matting 缓存并动态生成后，默认近景任务仍稳定走
`ai_matting_video_object -> video_saliency_seg_bce`。360×640 源帧进入图前缩放为
288×512；`TEBachMattingAlgorithm::getMaskAndBoundingBox` 直接读取键
`saliency_mask`，随后写入逐帧缓存。该默认 object 路径中：

- `MP_ProcessBorder` 为 0 次；
- `TEBachMaskPostProcessAlgorithm::processFrame` 为 0 次；
- 缓存内容是 general-seg 图返回的 soft Alpha，不是另一次全局 mask post-process 的结果。

这进一步确认近景主差距发生在模型路由和图输出，不应继续猜测一个 object 路径并未调用的
Border 参数。

剪映宿主为这张图构造 `RendererMetalV2`、RLDevice/Effect 注册和同设备纹理。对
`bef_effect_set_render_api` 的直接入口挂载在真实任务中没有命中，说明该 renderer 不是通过公开
Effect C handle 的 render-api setter 注入，而是由宿主私有对象图创建。QCut 独立 C handle 即使尝试
CGL、EGL/GLES、Metal DeviceTexture 和相关 Effect AB 开关，输入仍呈现零纹理特征，输出只包含
`0/1/2`。因此不能把“函数返回成功”当成 object provider 成功。

QCut 现在对 `video-object` Alpha 做写缓存前质量门禁：完整视频流中任意长度的全零片头都允许，
整段全零也视为合法空蒙版；仅当整段从未观察到大于 `2` 的有效 Alpha、同时确实出现 `1/2`
量化噪声时，才确认 `0/1/2` hostless 特征并自动回退 `portrait-gru`。一旦观察到有效 Alpha，
前后合法空背景帧都不会触发误回退；AbortError 和 GRU 自身失败不会被错误吞掉。生成图的 texture-blit 尺寸按源画幅动态
计算，最长边为 512，360×640 对应 288×512。该路由仍是高级实验能力，不再冒充已复刻的剪映宿主。

### 精细模式采用 GRU + 系统人物蒙版融合

单纯对 GRU Alpha 做大半径形态学 closing 虽把近景 IoU 提高到 `0.9117`，白底逐帧却出现明显的
轴对齐蓝背景矩形，已从产品路径删除。最终方案保留同一份剪映 GRU、BGR 输入、双向安全窗口、
正弦 Border LUT 和 TEMatting Blend，只在“精细”模式增加 macOS Vision 的本机人物蒙版：

```text
source RGBA
  -> Jianying GRU -> temporal interior hold
  -> macOS Vision accurate person mask
  -> max(GRU, saturate(Vision * 2))
  -> Jianying portrait Border LUT
  -> advanced controls -> TEMattingBlendEffectV2
```

融合只提高 Vision 已识别为人物的置信度，不用方形结构元素扩张轮廓。系统 Vision 模型由 macOS
管理，QCut 不复制或重新分发它；QCut 本机缓存仍保存用户已有的 GRU 资源和最终 Alpha。输出模型标识为
`tt_matting_video_gru_v1.0+vision-person-v1`，processor 指纹包含 bridge 内容与 Darwin 系统版本，系统
分割实现升级后不会误命中旧 Alpha 缓存。打包门禁同时要求 bridge 含有
`Vision-person-fusion-v1` 能力标记。

同一真人 60 帧、同一剪映黑白底反推 Alpha 的最终结果如下。MAE 已除以 255：

| 区间 | 实现 | IoU | Recall | Precision | MAE |
| --- | --- | ---: | ---: | ---: | ---: |
| 全片 | 旧 GRU 精细结果 | 0.961935 | 0.977215 | **0.984005** | 0.042211 |
| 全片 | **GRU + Vision** | **0.980103** | **0.998120** | 0.981916 | **0.031194** |
| frame 47–59 | 旧 GRU 精细结果 | 0.879071 | 0.910478 | **0.962241** | 0.139292 |
| frame 47–59 | **GRU + Vision** | **0.957343** | **0.995049** | 0.961924 | **0.086022** |

排除 frame 46→47 的整画面切镜后，相邻帧 Alpha MAE 从旧结果 `1.7415` 降为 `0.6683`；近景
前景面积标准差从 `0.03612` 降为 `0.00298`，没有用补洞换来闪烁。白底检查还显示 frame 50 中
剪映参考保留了一块蓝背景，而 QCut 将其正确移除，所以剩余 IoU 并不全部代表 QCut 主观画质更差。

原生 Metal 与 compatible 两次 60 帧输出逐字节相同。桌面冷启动、强制 object 后安全回退、以及
缓存命中三次 E2E 均通过；缓存命中前后 13,824,000 字节 Alpha 和 manifest 的 mtime/size 不变。
最终证据位于：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-motion-reset-parity-2026-08-28/
```

重点文件为 `findings.md`、`vision-fusion-final-metrics.json`、
`jianying-left-qcut-right-vision-fusion-white-1x.mp4`、
`jianying-left-qcut-right-vision-fusion-white-0.5x.mp4` 和
`vision-fusion-final-keyframes-contact-sheet.png`。

### 仍然存在的真实边界

1. QCut 没有也不应宣称可从独立 C handle 完整复制剪映宿主的 RLDevice/Effect 注册；高级 object
   路由当前靠输出质量门禁安全回退。
2. Vision 融合是 QCut 自主的本机精细化实现，不是证明剪映内部也调用 Apple Vision。
3. 剪映对照 Alpha 来自黑/白底 H.264 反推，仍不是无损内部真值。
4. QCut 仍把 Alpha 回读 CPU 后写缓存和编码，不是端到端 GPU 零拷贝。
5. 变速曲线、倒放和源范围变化的剪映缓存失效协议仍没有全部动态覆盖；QCut 自有缓存已把内容、
   路由、模型、处理器、系统版本、画幅、帧率、Blend 和参数纳入身份。

## 2026-08-28：自动路由、缓存身份与 GPU 往返收敛

本节之后的最新产品状态单独记录在
[QCut 人物抠像差距收敛记录](person-cutout-gap-reduction-2026-08-28.zh.md)。它取代本文较早章节中“自动路由仍直接保留 GRU”“Blend 实现参与 Alpha 缓存键”以及“native 每帧回读完整 RGBA”的当前状态描述；早期数字保留为历史证据。

最新真人桌面 E2E 已实际走通 `auto -> video-object -> Alpha 质量门禁 -> portrait-gru + Vision`，并明确返回请求路线、实际路线和回退状态。native Metal 现在只做单帧 ABI/公式校验，生产缓存默认不再为相同语义 Alpha 执行逐帧 GPU 往返。
