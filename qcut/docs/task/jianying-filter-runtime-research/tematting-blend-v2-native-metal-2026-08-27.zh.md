# 剪映人物抠像原生 GPU 合成链路（2026-08-27）

## 结论

剪映专业版 11.3.0 的人物抠像不是“模型输出一张 Alpha 后直接叠图”。已确认的完整链路是：

```text
TEMattingUnit2
  -> GRU 人物分割与时序状态
  -> TEMattingReaderUnit2::preProcessAlphaChannel
  -> TEMattingBlendEffectV2
  -> TERLDeviceManager 中与当前上下文绑定的 Metal RLDevice
  -> 输入、输出、Mask 三张 AGFX DeviceTexture
  -> bef_portrait_matting_v2_blend_device_texture_with_data
  -> FastBlend / FastMorphologyBlend / 带 LegacyStroke 的两种路径
```

本轮已在独立探针中复现到真正的原生 Metal `FastBlend`，不是只创建 handle：

- `RLDevice` 的 renderer 与 `TESharedGLContext` renderer、GPDevice 完全同源；
- `TEMattingBlendEffectV2::init` 返回 `1`，对象内 `v2_active=1`；
- `selected_path=1`，对应 `FastBlend`；
- `bef_portrait_matting_v2_blend_device_texture_with_data` 返回 `0`；
- 真人首帧的原生 GPU 输出与 `source × mask / 255` 的预乘透明公式逐通道完全一致：最大误差 `0`、MAE `0`、不同通道数 `0`；
- 输出 Alpha 与送入的 GRU Mask 完全一致，PSNR 为 `inf`。

这证明原生 V2 合成已经可独立调用。随后 QCut 产品 provider 也已接入同一条 Metal 路径并通过真人视频桌面 E2E；它仍不等于与剪映导出达到逐像素平价。

## QCut 产品接入结果

产品接入保留了 renderer 与私有 ABI 的隔离：UI 只调用 Electron IPC，主进程选择 provider，独立 native bridge 同时持有连续 GRU 状态和 `TEMattingBlendEffectV2`。每帧流程为：

```text
RGBA -> BGR888 GRU -> 全尺寸 Alpha -> AGFX input/mask/output textures
     -> TEMattingBlendEffectV2 native Metal -> 回读输出 Alpha
     -> 直通 RGB + native Alpha -> VP9 WebM
```

回读后只采用 native 输出的 Alpha，RGB 继续直通源画面。原因是 Effect 输出为预乘 RGBA，而 WebM/Chromium 的透明视频契约需要直通 RGB；直接编码预乘 RGB 会在播放器合成时再次乘 Alpha，产生黑边。

安全边界：

- 只在 macOS arm64 且 `libcccreator.dylib` SHA-256 精确等于本报告版本时选择 native Metal；
- bridge 再校验三个 AB config ID 必须分别为 `372 / 377 / 568`；
- native 初始化、任一纹理、任一帧 Blend 或 Alpha 公式校验失败时，删除半成品并对整段视频重跑兼容路径；
- 打包校验要求 helper 包含 native Metal 能力标记，macOS 签名为该 helper 保留本地私有 runtime 所需的 dyld entitlement；
- dylib、模型、视频和生成结果仍只保存在用户本机，不进入仓库。

真人 2 秒、360×640、30 fps、60 帧连续视频结果：

- native Metal Alpha 与兼容路径 Alpha 逐字节相同；
- 两份 13,824,000 字节输出 SHA-256 均为 `010310f238172a43dbf8b2cda7cb6bf3dc3d943f5ef92728e06b44a77c2ad294`；
- QCut runtime 返回 `blendImplementation=TEMattingBlendEffectV2-native-metal`；
- WebM 流包含 `ALPHA_MODE=1`、`QCUT_MATTING_BLEND=TEMattingBlendEffectV2-native-metal` 和正确 GRU 模型标记；
- Electron E2E 完成“精细 -> 开始并应用 -> 素材入库 -> 时间线人物蒙版 -> 播放器加载”，播放器 `readyState >= 2`、`videoWidth=360`；
- 桌面 E2E 通过，耗时 18.3 秒；UI 中单次抠像任务显示约 5 秒。

同机串行冷运行一次，仅比较 60 帧 bridge 阶段：兼容路径 `1.70s`，当前 native 接入 `2.56s`。这不是正式多轮 benchmark，但已经足以否定“接入 FastBlend 后整链路必然更快”。当前版本每帧创建三张纹理并把结果读回 CPU，约多 `0.86s`；它的价值是先锁定剪映同一 Blend 语义和产品回退边界。只有完成纹理复用、减少读回并测量预览链路后，才能把它称为 QCut 性能 fast path。

本机证据：

```text
/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/
  qcut-native-metal-person-cutout-2s.webm
  qcut-native-metal-e2e-compare-frame0-alpha.png
  qcut-desktop-e2e-native-metal/
    desktop-person-cutout.webm
    01-fine-cutout-ready.png
    02-cutout-completed.png
    03-mask-playing-in-preview.png
    e2e-evidence.json
```

## 样本与版本边界

- 剪映专业版运行时备份来源版本：`11.3.0`，来源应用为 `/Applications/VideoFusion-macOS.app`，不是 CapCut。
- `libcccreator.dylib` SHA-256：`0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9`。
- arm64 UUID：`D6342ECD-5432-33F0-A2AD-0C28F5699994`。
- x86_64 UUID：`D633A4BB-4D09-30AE-88CA-A389782087BE`。
- GRU 模型 SHA-256：`101688825490be3704babc7ce49f6d002cdb4fe69e879556b4687ac9006f8596`。
- 真人输入：360×640，来自仓库外 `improve_voice` 证据目录。

最终复核时，当前应用仍显示 `11.3.0`，但 universal dylib 已变为 SHA-256 `b09c395d934169cb20ec865dd1d4032ca68023b287a7264e1b06ff4d71fd1be4`、arm64 UUID `100726E3-FCB0-31BC-98EE-1B196A1714A3`。这说明相同产品版本号下发生过运行时 build 漂移。本报告的 Native Metal 成功结论只绑定上面的 QCut 私有备份指纹；当前产品也正是从该备份读取运行时，并不会对白名单外的新 build 开启私有 fast path。

以下私有符号地址和对象偏移只对上述 UUID 有效，不应作为跨版本稳定 ABI。

## 宿主设备链

### 1. RL 线程生命周期

静态调用关系：

```text
TERLThread::onThreadEnter / willEnterTask
  -> 创建 TERLRenderContext
  -> TERLRenderContext::_init
  -> TERLDeviceManager::createRLDeviceFromGLContext
  -> 以 TESharedGLContext* 为键缓存 RLDevice

TERLRenderContext 析构
  -> TERLDeviceManager::removeRLDeviceFromGLContext
```

`TERLThread` 构造时把 render-context 类型写为 `30`；独立探针使用同一值。`TERLRenderContext::_init` 还会建立 `TECoreFrameBufferCache`，所以不能只手工伪造一个 RLDevice 指针。

### 2. `TEMattingBlendEffectV2::init` 的接受条件

`init` 先检查 `ConfigID_EnableAGFXMetal`，再取得当前 `TESharedGLContext` 的 renderer、GPDevice 和 `TERLDeviceManager` 缓存的 RLDevice。V2 只有在以下条件全部成立时才激活：

```text
context renderer != null
RLDevice owner renderer != null
RLDevice owner renderer == context renderer
RLDevice owner GPDevice == context GPDevice
context GPDevice != null
```

任一条件失败都会输出：

```text
[MattingBlendV2] reject V2: gpdevice owner unavailable, ...
```

并清除对象 `+0x48` 的 V2 激活位。此前只看到 handle 被创建，不能证明进入了原生 V2。

### 3. macOS 必须是 Metal renderer

标准 `TERLRenderContext::_init` 的双参数创建分支会先创建 GLES 设备。该设备可以通过上面的 owner 校验，但 EffectSDK 在 macOS 上仍会拒绝：

```text
fast device fallback: mac requires metal renderer, actual=8
fast circuit open, plan=FastBlend,
reason=deterministic_device_context,
detail=mac_metal_renderer_required
```

`TERLDeviceManager::createRenderDevice` 的另一条分支在 `ConfigID_EnableAGFXMetal` 与 `ConfigID_VeabtestEnableMetalV2` 打开时创建 renderer type `6`。探针移除临时 GLES 注册，再通过共享上下文重建 Metal RLDevice；随后 `getRenderDevice()`、RLDevice owner renderer 与 GPDevice 再次全部相等，V2 才能实际执行。

因此“缺一个 RLDevice 注册”仍不够精确。macOS 的必要条件是：同一上下文、同一 Metal renderer、同一 GPDevice，并由 `TERLDeviceManager` 维护所有权关系。

## EffectSDK 合成链

### 1. 三张输入都是设备纹理

入口名 `blend_device_texture_with_data` 容易误读。对 `TEMattingBlendEffectV2::renderBlendEffect` 的调用点反汇编确认，三个 24 字节图像描述符都是：

```cpp
struct MattingImage {
  uint32_t format;
  uint32_t reserved;
  const void* data;
  uint32_t width;
  uint32_t height;
};
```

其中 `data` 分别指向输入、输出和 Mask 的 AGFX `DeviceTexture`。Mask 不是裸灰度字节。把 CPU Mask 指针直接传入会在 `DeviceWrapper<TextureBase>::getGPDevice()` 中崩溃；正确做法是先上传为 R8 或 RGBA Mask 纹理。

### 2. 参数会选择四条执行计划

`TEMattingUnit2::getFilterParam` 从模型片段取出 stroke 参数，`TEMattingBlendEffectV2::setStrokeParam` 再调用 `bef_portrait_matting_v2_set_stroke_params`。已确认字段包括：

- `morphologyParams`
- `erode_dilate_kernel_size`
- `blur_kernel_size`
- `enable_reverse`
- `blendPath`
- `featurePath`

内部选择器返回值与字符串表对应为：

| 值 | 计划 | 用途 |
| ---: | --- | --- |
| 1 | `FastBlend` | 直接 Mask 合成 |
| 2 | `FastMorphologyBlend` | 腐蚀/膨胀或模糊后合成 |
| 3 | `FastBlendThenLegacyStroke` | 直接合成后接旧描边链 |
| 4 | `FastMorphologyBlendThenLegacyStroke` | 形态学合成后接旧描边链 |

本轮真人首帧关闭 `featurePath`、保留 `blendPath`，命中计划 `1`。打开 `featurePath` 会进入带 LegacyStroke 的计划 `3`。

### 3. 实际像素公式

透明模式的片元公式为：

```glsl
mix(vec4(0), source, mask.r)
```

对 360×640 真人首帧读取 GPU 输出后，探针逐通道计算：

```text
expected = round(source_channel * mask / 255)
```

结果为：

```text
formula_max_error=0
formula_mae=0
different_channels=0
```

所以原生输出是预乘 RGBA。QCut 当前 WebM 兼容链保留直通 RGB 和相同 Alpha，再交给 Chromium 合成；最终显示公式相同，但内存布局与执行位置不同。

## 可复现实验

探针源码：

```text
docs/task/jianying-filter-runtime-research/probes/portrait-matting-blend-v2-probe.cpp
```

编译：

```bash
xcrun clang++ -std=c++20 -Wall -Wextra -Werror \
  docs/task/jianying-filter-runtime-research/probes/portrait-matting-blend-v2-probe.cpp \
  -framework OpenGL -framework Foundation -lobjc -ldl \
  -o /tmp/qcut-portrait-matting-blend-v2-probe-rl
```

运行时需要研究者自己有权使用的本地剪映运行时与真人素材。成功门禁是：

```text
owner_match=1
tematting_init_status=1 v2_active=1
selected_path=1 flags=1,1,1,0
formula_max_error=0 formula_mae=0 different_channels=0
ok width=360 height=640 alphaWidth=360 alphaHeight=640
```

仓库只提交 QCut 自有探针和研究结论，不提交 dylib、模型、剪映资源、原始日志或素材。

## 对 QCut 的实际意义

当前 QCut 的 GRU 模型、输入通道、Alpha 放大、状态重置和原生 V2 Blend 已接入受控 provider。剩余工作是把当前可用接入继续收敛为低往返的生产快路径：

1. 直接创建 Metal RLDevice，避免探针当前“先建 GLES、再替换 Metal”的研究性过渡和纹理桥警告。
2. 已定位并接入 `RendererDevice::updateTexture(DeviceTexture, const void *)`，input、Mask、output 三张纹理现在都在同一 GPDevice 上跨帧复用；Alpha 仍需回读后编码，因此仍不是零拷贝。
3. 为源切换、seek、取消和任务结束执行明确的 Effect handle、RLDevice 与 GRU 状态清理。
4. 当前 60 帧端到端 bridge 基准中 compatible 中位数 `2510 ms`、native 中位数 `3341 ms`；后续还需分别记录模型推理、Mask 上传、GPU Blend、读回和编码耗时。
5. 用同一真人、同一背景、同一导出设置取得剪映 Alpha/成片真值后，再做视觉与数值平价判定。

原生 `FastBlend` 可以减少 CPU 合成和部分纹理往返，主要改善预览合成延迟。它不会自动加速 GRU 推理、视频解码或 VP9/导出编码；在完成连续视频 benchmark 前，不给出整条人物抠像的速度提升百分比。

## 证据分级

| 项目 | 状态 |
| --- | --- |
| 同一 GRU 模型与哈希 | 已确认 |
| RLDevice owner / context / GPDevice 身份门禁 | 已确认 |
| macOS Metal renderer type 6 要求 | 已确认 |
| 三张 AGFX DeviceTexture 调用契约 | 已确认 |
| 四种 FastBlend 计划映射 | 已确认 |
| 真人首帧原生 Metal 输出 | 已确认 |
| 原生输出与预乘公式逐通道一致 | 已确认 |
| QCut 产品 provider 已切换原生 V2 | 已确认，精确版本门禁并自动回退 |
| 连续真人视频原生 V2 稳定性 | 已确认，60 帧 + 桌面 E2E |
| 连续真人视频原生 V2速度 | 已测：流式整链 4.91 秒，兼容链 4.11 秒；原生仍慢 0.80 秒 |
| QCut 与剪映导出逐像素平价 | 未验证 |
