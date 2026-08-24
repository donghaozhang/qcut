# 剪映专业版“瘦脸”单卡复刻与批量化门槛

记录时间：2026-08-23

## 结论

本轮只研究中文剪映专业版的手动脸型参数“瘦脸”，没有同时调整小脸、窄脸、
下颌线或其他人像参数。

已经验证：

- 剪映缓存中的“瘦脸”资源、算法图、强度键和 Lua 形变通道已定位；
- 私有本机运行时可以在剪映完全不参与渲染时加载原始模型和效果图；
- 同一张真人帧稳定返回 1 张脸和 106 个关键点；
- 强度 `0.5`、`1.0`、`3.0` 产生单调增强的脸部几何变化；
- 保持强度 `1.0` 但跳过算法时，输出重新与输入逐像素一致；
- 中文剪映 UI 只开启“瘦脸 100”后的导出，与本机强度 `1.0` 最接近；
- `0.9 / 1.0 / 1.1` 邻域搜索中，`1.0` 的面部 ROI 指标明确最优；
- 未修改原包已通过 Swing `FeatureSegment` 收到 face-id vector 参数，强度 `0 / 0.5 / 1.0`
  均通过确定性门禁。

当前状态仍应记为 **close**，不能记为产品侧 verified。未修改原包的参数协议已经找全，
但 QCut 产品适配器尚未公开脸型参数并将它传给本机 Swing 宿主；而且 Swing 输出相对中文剪映
UI 仍有可量化的宿主路径差异。仓库外私有 Lua 副本只继续作为低层 EffectSDK 对照，不再是
原始包运行的前置条件。

## 卡片与运行时

| 字段 | 值 |
| --- | --- |
| UI 名称 | 瘦脸 |
| 资源 ID | `7408078156944379136` |
| 第三方资源 ID | `7126765507457323557` |
| 包 MD5 | `aa4932200616e291a252039a3aac7232` |
| 效果类型 | `auto_beauty` |
| 强度键 | `face_adjust_TotalFace` |
| UI 范围 | `0-100` |
| 算法节点 | `face -> freid`，输入由 `blit` 节点提供 |
| 模型 | `tt_face`、`tt_face_extra`、`tt_fsnew_base_jianying`、`tt_freid` |

原始包只保存在仓库之外。下载后先校验 MD5，再复制一份私有调试副本；原始包从未修改。
效果包、模型、动态库、数据库、导出视频、图片和原始日志均不得进入 Git。

## 强度语义

效果 Lua 监听 `Amaz.AppEventType.SetEffectIntensity`，从事件的第二个参数读取按 face id
组织的 map vector。`face_adjust_TotalFace` 的强度记为 `t` 时，本包实际写入的非零基础通道为：

```text
degree[0]  =  0.08 * t
degree[10] = -0.20 * t
degree[12] = -0.01 * t
degree[19] = -0.20 * t
```

因此“瘦脸”不是画面横向缩放，也不是 LUT。它依赖真实人脸关键点和 `FaceReshape`，并在
不同脸部区域执行非均匀几何变形。

## 本机因果门禁

测试素材为同一张 `1280x720` 真人帧。运行时使用两张独立、同尺寸的
`GL_TEXTURE_2D`，并在同一个 CGL 3.2 core context 和同一个线程中完成算法、效果处理和读回。

| 私有默认强度 | 与输入的 RGB 通道绝对差值总和 | face count | landmarks |
| ---: | ---: | ---: | ---: |
| `0` | `0` | `1` | `106` |
| `0.5` | `1,940,642` | `1` | `106` |
| `1.0` | `3,259,324` | `1` | `106` |
| `3.0` | `5,778,517` | `1` | `106` |
| `1.0` + `--skip-algorithm` | `0` | unavailable | unavailable |

这组 A/B 证明画面变化来自：

```text
真人输入 -> face/freid -> 106 点 -> FaceReshape -> 输出纹理
```

不是来自色彩转换、随机纹理、输出缓冲初始化或背景滤镜。

## 中文剪映 UI 对照

中文剪映专业版中使用同一 5 秒、30 fps 素材，只把脸型面板第二行“瘦脸”从 `0`
改为 `100`。同屏可见的“小脸”“窄脸”等其他参数保持 `0`。导出文件为：

```text
1280x720
30 fps
5.000 s
H.264
yuv420p
```

剪映导出第 1 秒帧与本机输入在空间和时间上对齐。固定面部 ROI
`x=470, y=190, w=340, h=360` 后，候选强度对剪映导出的结果为：

| 本机强度 | PSNR | SSIM |
| ---: | ---: | ---: |
| `0` | `21.348682 dB` | `0.780281` |
| `0.5` | `25.187735 dB` | `0.872795` |
| `0.9` | `32.434564 dB` | `0.969645` |
| `1.0` | **`34.037875 dB`** | **`0.979148`** |
| `1.1` | `32.350806 dB` | `0.966352` |
| `3.0` | `19.083764 dB` | `0.747425` |

`1.0` 在两侧邻域都显著更好，确认 UI `100` 到运行时强度 `1.0` 的映射。剩余误差包含
剪映 H.264 4:2:0 编码、RGB/YUV 往返和宿主色彩管理，因此当前数字不能用于宣称逐像素一致。

仓库外对照图：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  face-keypoint-parity/slim-face-2026-08-23/
    slim-face-binary-strength-comparison.png
    slim-face-parity-grid.png
    slim-face-100-difference-x8.png
    jianying-ui-face-panel-before.jpeg
    jianying-ui-slim-face-100.jpeg
    slim-face-jianying-100.mov
    slim-face-jianying-100-frame-1s.png
    unmodified-segment-event/
      zero-probe.log
      half-probe.log
      vector-probe.log
      zero-output/frame-000*.rgba
      half-output/frame-000*.rgba
      vector-output/frame-000*.rgba
      slim-face-original-package-vector-050-vflip.png
      slim-face-original-package-vector-100-vflip.png
```

`slim-face-binary-strength-comparison.png` 从左到右为原图、`0.5`、`1.0`、`3.0`。
`slim-face-parity-grid.png` 上排从左到右为原图、本机 `1.0`、剪映 `100`；下排依次为
原图对剪映、本机对剪映、原图对本机的六倍差分。

## 未修改原包的参数桥

### 无效的低层入口

三条公开或导出 ABI 路径都在未修改原包上返回 `0`，但最终输出仍为逐像素 passthrough：

| 路径 | 返回值 | 与输入差值 |
| --- | ---: | ---: |
| composer scalar `face_adjust_TotalFace=1.0` | `0` | `0` |
| `bef_effect_set_intensity(type=5, value=1.0)` | `0` | `0` |
| `bef_effect_update_reshape_face_intensity(0, 1.0)` | `0` | `0` |

反汇编确认 reshape helper 的两个浮点参数是 eye 和 cheek；其兼容分支会写 legacy intensity
type `4/5`。但当前 AmazingFeature Lua 需要的是包含 face id 和 intensity 的 vector map，三条路径
都没有完成这层事件桥。

`bef_effect_get_feature` 的第三个输出是编码 feature handle，不是可解引用的 C++ 对象。
`bef_ae_feature_set_params` 则属于独立 AE Feature Engine，要求真实 engine 和 feature 对象指针。
两套 ABI 不能混用；把编码句柄交给后者会段错误，因此它不是本卡的参数入口。

### 有效的 Swing 事件入口

`filter-sequence` 创建原生 `FeatureSegment`，首帧成功后调用二参数
`bef_swing_segment_set_params(segment, json)`。标量 JSON 虽然返回 `0`，但原包 Lua 明确报告
`vec is a number`；这证明键已到达 Lua，同时也证明值的形状错误。正确协议是：

```json
{
  "face_adjust_TotalFace": [
    { "id": -1, "intensity": 1.0 }
  ]
}
```

`id=-1` 在本轮单人输入上会把强度应用到检测到的人脸；多人分配语义仍需单独验证。事件在
首帧后提交，因此 `frame-0000` 是同进程严格基线，`frame-0001/0002` 是参数生效后的重复帧。
原始包、相同输入和相同宿主的结果为：

| vector 强度 | 首帧与输入 RGB 差值 | 效果帧与输入 RGB 差值 | 两张效果帧 |
| ---: | ---: | ---: | --- |
| `0` | `0` | `0` | 逐字节一致 |
| `0.5` | `0` | `1,944,900` | 逐字节一致 |
| `1.0` | `0` | `3,256,939` | 逐字节一致 |

强度 `1.0` 的两张效果帧 SHA-256 均为
`50d8961d058defe5e51b8161e9318583da113d5185c4ffb8ab92edf5d6c30163`。
这条链已经被实测闭合：

```text
QCut research host JSON
  -> FeatureSegment::setParameters
  -> vector<map{id, intensity}>
  -> SetEffectIntensity
  -> 未修改 AmazingFeature Lua
  -> FaceReshape
```

### 宿主差异

使用 QCut 的 `measureFilterLabFrames` 对相同 `1280x720` 帧测量，Swing 原始包输出与低层
私有 oracle 的全帧 PSNR/SSIM 为 `45.248598 dB / 0.997918`，面部 ROI 为
`37.337900 dB / 0.987215`。Swing 输出对中文剪映 UI 的全帧指标为
`40.244817 dB / 0.995240`，面部 ROI 为 `32.489289 dB / 0.973951`。

同一指标实现下，私有低层 oracle 对 UI 的面部 ROI 为
`34.037875 dB / 0.985304`，仍略优于 Swing。参数桥已证明，但两种宿主的纹理、算法输入或
调度路径仍有小幅差异，因此这里不能写“逐像素完美复刻”。

## 单卡模板

下一张脸型效果继续按以下顺序验证，不能直接批量标记成功：

1. 从中文剪映缓存定位标题、ID、MD5、资源 URL、强度键和 UI 范围。
2. 校验并把原包、调试副本和运行时都放在 Git 外。
3. 解析算法图、模型依赖、Lua 强度公式和实际非零 shape 通道。
4. 先跑强度 `0`，要求输出逐像素 passthrough。
5. 跑正常、邻域和夸张强度，要求变化单调且区域符合预期。
6. 保持强度不变并跳过算法，要求重新 passthrough。
7. 在中文剪映 UI 只开启同一项，保存数值面板和导出证据。
8. 用同帧固定 ROI 搜索最接近强度，报告 PSNR/SSIM 和编码边界。
9. 用未修改原包验证 vector 事件，并要求 `0` 回到输入、重复帧逐字节一致。
10. 只有产品适配器也走同一协议并完成预览、导出和 UI 对照后，才能标记 verified。

## 批量化前置条件

资源发现、完整性校验、模型依赖检查、强度 sweep、因果 A/B、截图归档、ROI 指标和报告生成
都可以批量化。原始包事件协议已经打通，当前批量产品接入的主卡点变为：

```text
QCut typed face-adjust value
  -> build { key: [{ id: -1, intensity }] }
  -> local Swing host setParameters
  -> preview/export lifecycle
```

下一步先把这套强类型协议接到 QCut 产品适配器，并完成“瘦脸”预览和导出门禁；随后才能把
同一协议复用到窄脸、瘦鼻和嘴型。批量修改第三方 Lua 仍然只会扩大 oracle 数量，不等于产品能力。
