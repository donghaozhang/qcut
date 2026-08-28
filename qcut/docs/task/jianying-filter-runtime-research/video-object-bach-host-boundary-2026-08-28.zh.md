# 剪映 Video Object Matting 宿主边界审计（2026-08-28）

## 结论

`ai_matting_video_object -> video_saliency_seg_bce` 的真实人物抠像执行边界不是
`SwingManager` 的全局 Effect handle，也不是把一张 Metal/GL texture 交给
`bef_effect_algorithm_texture`。剪映的 `TEBachMattingAlgorithm` 直接把
`ITEVideoFrame` 转成 CPU 可读的 Bach 图像输入，执行其持有的
`BachAlgorithmSystem`，再从节点 `video_saliency_seg_0` 的结果中读取
`saliency_mask`。

因此，当前结论已经从“只能设计未来 worker”推进到“固定版本 worker 已动态跑通”：

- QCut 的独立 worker 现在用固定 UUID 中的具名构造/析构符号创建 `TECVPixelBufferFrame` 和
  `TEBachMattingAlgorithm`，连续帧复用同一 `BachAlgorithmSystem`；
- worker 内同时锁死主 dylib SHA/UUID、graph SHA、packed model SHA，以及本机快照中
  全部 23 个私有 Framework dylib 的内容闭包；任一不匹配都在 `dlopen`/推理前失败；
- raw `saliency_mask` 是 `256×256` u8；默认产品输出把它作为低分辨率 Mask texture
  交给同一固定版 `TEMattingBlendEffectV2`，由 vendor `FastBlend` 放大并回读源尺寸
  Alpha，不再用 QCut 双线性近似；
- 每帧私有 ObjC/CoreML 推理都在独立 autorelease pool 中完成，避免长视频把
  vendor 临时对象累积到 worker 退出；
- 高级参数只有非默认时才进入 QCut refinement，因此会使用独立的 refined
  pipeline identity，不能标成 raw Bach exact；
- Swing V2/Effect handle 仍不是这张图的结果 owner，它只保留作普通 Swing 特效研究。

实现位于
[video-object-bach-bridge.mm](../../../electron/jianying-person-cutout/native/video-object-bach-bridge.mm)
和 [metal-matting-blend.cpp](../../../electron/jianying-person-cutout/native/metal-matting-blend.cpp)，
进程崩溃、超时和资源缺失仍由 Electron parent 的 watchdog/circuit breaker 回退，
不会让 vendor pointer 进入主进程。

## 审计对象

本轮结论只适用于以下本机 ARM64 运行时：

```text
libcccreator.dylib SHA-256:
0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9

ARM64 UUID:
D6342ECD-5432-33F0-A2AD-0C28F5699994

private Framework closure（按 basename 排序的 `basename=sha256\n`）：
e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e

capability marker:
jianying-runtime-framework-closure-d634-v1-e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e
```

闭包来自本机 `qcut-effect-runtime.json` 的完整 `Frameworks/` 清单：主
`libcccreator.dylib` 单独校验，另外 22 个 dylib 逐文件校验，包含
`libAGFX`、`libEGL`、`libGLESv2`、`libLumiGeneRuntime`、`libbytenn`、
`libfastcv`、`libIESAppLogger`、`libsamicore`、`libvecryptor` 和同快照其余
编解码依赖。这避免 `RTLD_NOW | RTLD_GLOBAL` 从混合版本目录加载未门禁的私有
`@rpath` image。把临时快照中的 `libIESAppLogger.dylib` 截断到 16 bytes 后，
worker 在 `dlopen` 前以退出码 1 拒绝，并精确报告该文件 SHA 不匹配。

该闭包只锁剪映随包私有 dylib、graph 和 model；macOS 系统 Framework、CoreML
实现、GPU 驱动和硬件仍属于宿主环境边界，不能由本地文件 SHA 固定。因而这里的
“exact”是“同一私有运行时快照与同一宿主数值路径”，不是跨 OS/GPU 的数学承诺。

下文虚拟地址只用于说明这个 UUID 的静态证据，不能作为跨版本产品常量。

测试 graph：

```text
name: AlgorithmGraph_9bpck63bYbqbZAcfdUcjcAbNdWcf
node: video_saliency_seg_0
type: general_seg
model_name: video_saliency_seg_bce
output key: saliency_mask
model input/output: 256x256
source input in verified run: 360x640 RGBA
```

旧的 `360×640 -> 288×512 -> 256×256` 推断已被真实 tensor capture 排除。
`texture_blit` 的无效 view size/default `128×224` 日志不参与这条 CPU model input；
packed graph 把源尺寸直接送入 `mobilecv2` resize，再得到 `256×256`。

## 已验证的真实调用链

### 1. 输入不是 Swing Effect texture

`TEBachMattingAlgorithm::AIMattingInternal` 位于 `0x201fc70`。它在
`0x201fd14` 调用：

```text
TEBachAlgorithmBase::executeBachAlgorithm(
  shared_ptr<ITEVideoFrame> const&,
  shared_ptr<Bach::BachAlgorithmSystem> const&
)
```

目标函数位于 `0x200b3e4`。其输入处理顺序为：

1. 通过 `ITEVideoFrame` 虚接口取得 frame buffer 描述；
2. 取得其中的 CVPixelBuffer/raw buffer；
3. 需要 CPU 拷贝时，按 `width * height * 4` 分配内存并在 `0x200b4ac`
   调用 `TECVPixelBufferGetRawData`；
4. 在 `0x200b538–0x200b590` 逐像素交换第 0、2 通道，即 BGRA/RGBA 转换；
5. 构造 Bach 输入，按源 frame format 映射像素格式；
6. 在 `0x200b70c–0x200b71c` 调用 `BachAlgorithmSystem` 的 execute 虚接口。

这条函数中没有调用 `bef_effect_algorithm_texture`、Swing segment seek 或
RLDevice texture 输入。上游 frame 可以由 CVPixelBuffer 背书，但在 Bach execute
前已经显式落到 CPU 可读 payload；这里不是端到端 Metal 零拷贝边界。

### 2. Object route 的精确结果 owner

`TEBachMattingAlgorithm::getMaskAndBoundingBox` 位于 `0x2021250`。object route
进入条件已经由分支直接确认：

```text
VEMattingType = 1
VEMattingModelType = 3
```

对应分支从 `0x2021f48` 开始：

1. 构造字符串 `video_saliency_seg_0`；
2. `0x2021f70` 取得 `BachAlgorithmSystem` vtable；
3. `0x2021f74` 读取 vtable `+0x78`；
4. 以 `(system, "video_saliency_seg_0", 0)` 调用 result getter；
5. 从返回 wrapper 的 `+0x18` 取得第一项结果；
6. 以键 `saliency_mask` 查 Bach result map；
7. 将其转换成 `BachMap/BachTextureInfo`；
8. 从 `BachTextureInfo::data()` 复制 soft Alpha；
9. 用 `BachTextureInfo::width()/height()` 写入 `TEMattingMaskInfo` 的尺寸。

这里的 `+0x78` 是对真实调用点的说明，不是建议 QCut 直接调用该 vtable 槽。
运行时同时导出了具名方法：

```text
Bach::BachAlgorithmSystemGE::execute(Bach::BachAlgorithmInput const&)
Bach::BachAlgorithmSystemGE::getResult(std::string const&, unsigned int)
```

产品 worker 没有调用 vtable `+0x78`；它调用已经在该 UUID 上动态验证的
`TEBachMattingAlgorithm::getMaskAndBoundingBox` 具名导出，并由该方法内部读取
结果。`TEMattingMaskInfo+0x10` 返回的数据来自 `operator new[]`，worker 使用
`operator delete[]` 释放，不能用 `free`。

## Packed graph 数值链

### 源帧直接缩到 256

packed model 的 `saliency_seg` graph 已确认：

```text
input: Uint8 NHWC, source-variable shape
resize: CPU, source -> fixinput[1,256,256,4]
cvt_color: RGBA -> BGR
nhwc2nchw
convert: uint8 -> float32, alpha=1/255, beta=0
bytenn_op: data + prev_img + prev_mask -> nn_3
convert_2: float32 nn_3 -> uint8 saliency_mask
```

`bce::device::cpu::resize` 位于 `0x13906e0`：它读取属性 `interpolation`，并把
该整数原样传给 `0xea9240`。后者的断言路径直接指向
`mobilecv/mobilecv2/modules/imgproc/src/imgwarp.cpp::resize`。model header 的
`cpuresize_mode` 为 `1`，运行日志版本为 `mobilecv2 1.8.27`，即这条图使用
mobilecv2 `INTER_LINEAR`，不是 Metal texture blit 或两段 graph-size resize。

同一真实首帧 capture 的 `data` 为 BGR NCHW float32，形状
`[1,3,256,256]`。QCut 自写 half-pixel bilinear uint8-round 与它比较时，归一化
MAE `0.000343496`、最大误差 `1/255`；差值只到 1 LSB，但并非 bit-exact。
这一差异现在不需要继续在 direct CoreML fallback 中猜：Bach provider 把源
RGBA 交给同一 packed graph，由上述 mobilecv2 op 本身产生输入。

### `nn_3 -> saliency_mask` 已 bit-exact

研究 hook 在同一次 Bach 执行中同时抓取 ByteCoreML 返回的 `nn_3` float32 和
`getMaskAndBoundingBox` 返回的 u8 `saliency_mask`。对 identity、翻转、转置和
旋转候选做全量对照后，唯一逐像素完全相等的规则是：

```text
saliency_mask = round(clamp(nn_3, 0, 1) * 255)
```

首帧 `65536/65536` 像素完全相同，MAE `0`、最大误差 `0`，没有翻转、转置或
中间 resize。此前 standalone CoreML replay 的 `0.0441437/255` MAE、最大
`1/255` 是 Apple CoreML 与 ByteCoreML backend inference drift，不是
`convert_2` 的量化差异。

### V2 context/config 不改变 Bach 推理

最终 full-framework-closure capture worker 会先构造同进程
`TEMattingBlendEffectV2`，因此会走 V2 所需的 TERL context 与固定 ConfigID；随后
在同一 worker 连续处理两帧。capture 位于
`/private/tmp/qcut-jy-bach-v2-framework-closure-capture-final-20260828-1521`：

| tensor | V2 worker SHA-256 | 与 V2 接入前比较 |
| --- | --- | --- |
| frame 0 `nn_3` | `18914e224988222bf3f47b1bf07ef9c71b877c278c21b8c986f751fcbba43a07` | `cmp=0` |
| frame 1 `nn_3` | `a6febb781f79279295a55018a0a4882cb3c374e13169f428f9df787356da4a59` | `cmp=0` |

再按已锁定规则把两帧 `nn_3` 量化成 u8，与 V2 接入前直接保存的
`/private/tmp/qcut-jy-bach-two-frame-raw-256.gray` 比较，`131072/131072`
像素完全相同，MAE `0`、最大误差 `0`。因此 V2 的全局 config/context 初始化
没有改变 Bach 原始 256 Mask；当前输出差异只发生在 raw Mask 之后的 vendor V2
源尺寸合成阶段。

## 两帧时序实证

两帧真人输入在一个 worker、一个 `TEBachMattingAlgorithm` 和一个内部
`BachAlgorithmSystem` 中连续执行。输入 hook 与 ByteCoreML 输出 hook 得到：

| tensor | SHA-256 | 结论 |
| --- | --- | --- |
| frame 0 `data` | `209e3e1a88dc2464eee4d35575850cade736b8a916ae1125b1d7dffed77af801` | 真实 256 BGR NCHW input |
| frame 0 `prev_img` | `599c1bb5ffd4b87229a81958f33f1060821cd01cd7aa7ccafa0d862f4522f3f6` | 786432 bytes 全零 |
| frame 0 `prev_mask` | `8a39d2abd3999ab73c34db2476849cddf303ce389b35826850f9a700589b4a90` | 262144 bytes 全零 |
| frame 0 `nn_3` | `18914e224988222bf3f47b1bf07ef9c71b877c278c21b8c986f751fcbba43a07` | ByteCoreML 原始 float32 |
| frame 1 `data` | `cc74c2458883139c3fe54e2f8f2734e88a6bbe1d91fc1f6ada9bdaf8e1603bff` | 第二个源帧的真实 input |
| frame 1 `prev_img` | `209e3e1a88dc2464eee4d35575850cade736b8a916ae1125b1d7dffed77af801` | 与 frame 0 `data` bit-exact |
| frame 1 `prev_mask` | `18914e224988222bf3f47b1bf07ef9c71b877c278c21b8c986f751fcbba43a07` | 与 frame 0 `nn_3` bit-exact |
| frame 1 `nn_3` | `a6febb781f79279295a55018a0a4882cb3c374e13169f428f9df787356da4a59` | 使用真实上一帧状态后的输出 |

两帧 raw 256 mask 串联文件 SHA-256 为
`1e49daa89eeade3d40ece0d5ea6658bf2bbb016dfb3585a56f5b09c7af4473f0`。
其中第二帧 warm mask SHA-256 为
`2ad1da78ee5ae715dd9bc803f3b433ba7b4fa07e8327bbd13adf931489f3dea4`；
把完全相同的第二个 RGBA 帧放进新 worker 冷启动，mask SHA-256 为
`10da001c8db46377f21f32e39aab9393db6a45268a37b33d7203ffedc95519c9`。
两者有 `23213/65536` 像素不同，u8 MAE `0.6737823486`、最大误差 `69`。
这排除了“同一个进程但每帧重置”的假阳性。

## Swing V2 probe 的复用结论

现有 [effect-probe.mm](../../../research/jianying-runtime-probe/effect-probe.mm)
已经验证以下宿主链：

```text
HTSGLContext bind
  -> GPDevice(RendererType=6, Metal)
  -> CVPixelBuffer-backed DeviceTexture(flags=false,false,true)
  -> SwingManager(create_with_gpdevice)
  -> VideoSegment(type=7) + FeatureSegment(type=0)
  -> seek_frame_device_texture
```

该 probe 使用的已验证入口如下。具名导出按符号绑定；只有 context scope 两项是
UUID 锁定的研究偏移：

| 入口 | 所属库/地址 | 约束 |
| --- | --- | --- |
| `GPDevice::createDevice(RendererType, unsigned int)` | `libAGFX.dylib` 具名导出 | `RendererType=6` |
| `Utils::createCVPixelBuffer(...)` | `libAGFX.dylib` 具名导出 | BGRA、明确 stride |
| `RendererDevice::createTextureFromNativeBuffer(..., bool, bool, bool, ...)` | `libAGFX.dylib` 具名导出 | flags 必须为 `false,false,true` |
| `bef_swing_manager_create_with_gpdevice` | `libcccreator.dylib` `0x1664ffc` | manager 必须返回同一 GPDevice |
| `bef_swing_segment_video_set_device_texture` | `libcccreator.dylib` `0x166fe00` | 只传已验证的 `DeviceTexture` |
| `SwingTexture::convertMetalTextureInPlace` | `libcccreator.dylib` `0x27a9128` | manager/device 必须匹配 |
| `bef_swing_manager_seek_frame_device_texture` | `libcccreator.dylib` `0x1665710` | worker 内调用 |
| `SwingManager::getOrCreateEffectManagerHandle` | `libcccreator.dylib` `0x17e4a70` | 仅证明 manager Effect owner |
| Amazer context scope ctor/dtor | `0x3fb3bc` / `0x3fb3e8` | 仅限上述 ARM64 UUID 的 research probe |

本轮把同样的链放进一次性、显式 opt-in 的诊断 worker，并用真人 RGBA 输入运行。
实测结果为：

```text
Apple M4 Pro Metal GPDevice: created
manager GPDevice identity: matched
CVPixelBuffer-backed DeviceTexture: accepted
Swing seek: returned success
```

随后通过真实导出
`AmazingEngine::SwingManager::getOrCreateEffectManagerHandle()` 取得 manager 的
Effect handle。该方法本身不是猜测偏移：静态调用确认它负责创建/初始化 manager
拥有的 Effect 实例。

但在该 handle 上读取 object graph 结果全部失败：

```text
bef_effect_get_bach_result(handle, ..., 198): no BachBuffer
bef_effect_get_bach_result_by_node_name(
  handle, "video_saliency_seg_0", ...
): -1 / null
bef_effect_get_bach_result_by_graph_and_node_name(
  handle,
  "AlgorithmGraph_9bpck63bYbqbZAcfdUcjcAbNdWcf",
  "video_saliency_seg_0",
  ...
): -1 / null
```

这不是“同设备 texture 仍然没有送达”的证据。相反，同设备输入和 Swing seek
已经成功；失败原因是结果 owner 不同：Feature/Swing algorithm 的结果不在
manager 的全局 Effect handle 中，而剪映人物抠像的真实消费者直接持有
`BachAlgorithmSystem`。

因此现有 Swing V2 probe 的复用判定是：

| 能力 | 是否可复用 | 说明 |
| --- | --- | --- |
| Metal GPDevice 创建/销毁 | 是 | 已在固定 UUID 上动态验证 |
| HTSGLContext / Amazer context 作用域 | 是 | 必须先 bind，且只限隔离进程 |
| CVPixelBuffer-backed DeviceTexture | 是 | 第三个 native flag 必须为 true |
| Swing Video/Feature segment 生命周期 | 是 | 适合继续研究普通 Swing 特效 |
| `ai_matting_video_object` 输入 owner | 否 | 真实入口是 `ITEVideoFrame -> BachAlgorithmInput` |
| `ai_matting_video_object` 结果 owner | 否 | 真实 owner 是 `BachAlgorithmSystem` |
| manager Effect handle 的 type 198 | 否 | type/by-node/by-graph 均已动态证伪 |

## 最小安全桥实现

当前 exact 路径采用独立的 `jianying-video-object-bach-bridge`，没有扩展旧 Effect
bridge 的职责。其进程协议遵循以下最小边界：

### 进程边界

```text
QCut parent
  -> spawn isolated worker
  -> INIT(runtime UUID/hash, graph path, model root, width, height)
  -> FRAME(index, pts, owned RGBA bytes/FD)
  <- ALPHA(index, width, height, bytes, diagnostics)
  <- ERROR(stage, vendor code, recoverable=true)
```

要求：

- worker 每个任务独立，vendor crash 不影响 Electron；
- 固定 runtime SHA/UUID、graph SHA、model SHA；
- 任一符号、尺寸、模型或结果类型不匹配立即退出；
- parent 保留现有 watchdog、取消、完整帧数校验、坏 Alpha 门禁和 GRU + Vision
  回退；
- 只有固定 runtime/model/graph 与 bridge capability 全部匹配才启用；
- 不共享或缓存 vendor object pointer；只返回 QCut 自有 Alpha bytes。

### 允许绑定的接口层

worker 只绑定已经在固定 UUID 上动态验证的具名 C++ 导出：

1. `TEEffectConfig::getInstance/setExternalFinder`；
2. `TECVPixelBufferFrame` 官方 ctor/dtor 与 `storeCVPixelBuffer`；
3. `TEBachMattingAlgorithm` 官方 ctor/dtor；
4. `initBach`、`AIMattingInternal`、`getMaskAndBoundingBox`。

固定版 layout 为 frame object `0x2c8`、matting object `0x388`、
`VEMattingTypeParam` `0xa0`（graph path `+0x20`、model type `+0x68`）。
只有 dylib SHA 和 LC_UUID 同时匹配才允许使用；其他版本直接不可用。

禁止：

- 直接调用 vtable `+0x78`；
- 读取 `FeatureSegment + guessedOffset` 或 `SwingAlgorithmV2 + guessedOffset`；
- 伪造 `ITEVideoFrame` vtable；
- 把 manager Effect handle 当成 per-graph result owner；
- 默认启用私有 AB/renderer 开关；
- 失败时写入缓存或把空/量化噪声标成成功。

### 固定 D634 路径的 blocker 状态

此前的 `BachAlgorithmInput/BachImageBuffer/BachInitConfig` 聚合类型 blocker 已被
真实 wrapper 的更高层入口绕开：worker 不自行构造这些对象，而是用匹配 UUID 中的
`TECVPixelBufferFrame` 具名构造器和 `storeCVPixelBuffer` 交付 CVPixelBuffer，随后
让 `TEBachMattingAlgorithm::AIMattingInternal` 在 vendor runtime 内部构造并执行
`BachAlgorithmInput`。结果也由具名 `getMaskAndBoundingBox` 返回，不读取
`BachAlgorithmSystem` vtable 或 graph result 私有容器。

固定版入口已经动态完成同一真人素材的连续两帧：模型解析为 type 198
`video_saliency_seg_bce`。下面是接入 vendor V2 外层之前、仍使用 QCut resize 的历史
bridge 日志；它保留用于证明 Bach 时序，不代表当前 route 或 source-size 算法：

```text
progress frame=1 total=2
progress frame=2 total=2
ok width=360 height=640 frames=2 route=video-object-jianying-bach-d634-v1
```

同一进程内注入的只读 CoreML hook 还证明：首帧两个 previous tensor 全零；第二帧
`prev_img` 与首帧 `data` 逐字节相同，第二帧 `prev_mask` 与首帧 ByteCoreML
`nn_3` 逐字节相同。完整 capture、SHA 和日志见
[人物抠像差距收敛记录](person-cutout-gap-reduction-2026-08-28.zh.md#两帧-temporal-capture)。

因此，对这个固定 SHA/UUID 的 exact Bach provider，输入 ABI、模型执行、结果读取和
跨帧状态都已不再构成 blocker。仍然不支持的是跨版本 ABI：frame/matting object size、
`VEMattingTypeParam` layout 或导出集合任一变化，都必须拒绝该 exact provider，而不是
尝试兼容或猜测。独立 same-model CoreML runner 继续作为不依赖私有 runtime 的
fallback；它的 source→256 输入已收敛到最大 `1/255` 的残差，但仍不冒充 Bach
bit-exact。

这里必须区分两层 Alpha：

1. `raw Bach mask` 是 packed graph 的原生 `256×256` u8 结果；
2. 产品 `source-size Alpha` 是 raw mask 经固定版 `TEMattingBlendEffectV2`
   `FastBlend` 与源 RGBA 合成后，从源尺寸输出纹理回读的 Alpha。

默认参数或显式 `0.5 0 0 0` 会直接返回第二层结果，不调用 `refineAlpha`，避免
浮点回转。非默认高级参数才进入 QCut refinement，并由上层使用不同的
provider/pipeline/cache identity。V2 输出 Alpha 包含源 RGBA Alpha，即透明源像素不会
被 Mask 重新变为不透明；低分辨率路径还门禁 `outputAlpha <= sourceAlpha`。

### 原生 V2 外层已接入

同一真人首帧、同一 raw `256×256 saliency_mask` 下，旧 QCut 双线性与 vendor V2
源尺寸 Alpha 仅有 `1840/230400` 像素相差 `1`，u8 MAE `0.007986`、最大误差
`1`、soft IoU `0.99999355`。vendor V2 结果相对剪映黑白背景代理的 u8 MAE 为
`1.877075`，旧 QCut resize 为 `1.878021`；代理还包含导出/重建误差，不能把该数值
当作内部 raw truth，但方向与宿主链一致。

产品 helper 现在逐帧执行：

```text
source RGBA -> Bach packed graph -> raw 256 mask
  -> TEMattingBlendEffectV2 FastBlend -> source-size RGBA
  -> extract source-size Alpha
  -> optional QCut advanced refinement
```

route 为 `video-object-jianying-bach-v2-exact-d634-v1`，blend identity 为
`TEMattingBlendEffectV2-vendor-exact`。默认 refinement identity 是
`vendor-v2-exact-no-qcut-refinement-v1`；非默认参数则是
`qcut-alpha-refinement-after-vendor-v2-v1`。运行时闭包 identity 是
`jianying-runtime-framework-closure-d634-v1-e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e`。
resolver 同时要求 route、blend、默认/高级 refinement、闭包、主库/graph/model
固定值；旧 bridge marker 因 resolver marker 与源码 fingerprint 同时变化而失效，
不能被误认为新能力。

worker 每帧在 Bach 前恢复 Engine GL context，V2 自己在合成前恢复其 CGL/RL
context。销毁顺序由声明顺序固定为：先销毁 V2 纹理/Effect/RL context，再用
noexcept restorer 恢复 Engine context，最后销毁 Bach session；context 恢复失败会
直接终止隔离 helper，让 parent watchdog/fallback 接管，不会在错误 context 上静默析构。
库使用 `RTLD_GLOBAL`，因为固定版 V2/RLDevice 内部会跨其依赖图解析 Effect/AGFX
符号；该扩大只存在于独立 helper 进程内，且 `dlopen` 前已经逐 SHA 校验完整 23
个私有 Framework dylib，而不是只检查会直接参与数值计算的六个库。

source Alpha 边界不只做了纯函数单测：把同一真人首帧的所有源 Alpha 固定为 `64`
后，真实 V2 输出范围为 `0..64`，`230400` 个像素中没有一个
`outputAlpha > sourceAlpha`。输入 SHA-256 为
`5e9ffe9e92dd5eb5a56147aae7d84c4f17ceda990b6c1ec3729eee1cd43ef5bf`，
输出 Alpha SHA-256 为
`ae06c9597f7d2e85024858862aad8939610a74f96ffc4ee2d85e20af017c39e2`。
同一 Alpha=64 输入再启用非默认 `0.6 0.2 1 2`，advanced 输出仍有 `0`
个越界像素；本例阈值后全零，SHA-256 为
`2a589ae1f2fa2a6328223ff195a29c9244bec633dca49139f6f231e1d79c0eb2`。
advanced 最后显式取 `min(refinedAlpha, sourceAlpha)`，不会把半透明/透明源像素
重新“复活”为更高 Alpha。

最终 full-framework-closure helper 的产品构建产物为
`/private/tmp/qcut-resolver-built-bach-v2-framework-closure-final`，本次 Mach-O
SHA-256 为 `5e48a1337b33d52c7319a5ea9f85be3d9c155151568dea437ef1d55083f0a1f1`。
两帧真人 source-size Alpha 为 `460800` bytes，SHA-256
`dca0f2912ba0188939737920b18c66834d7354aca7e11b8c906d4effd85f6c3e`；
它与闭包升级前、第二次运行和显式 `0.5 0 0 0` 全部逐字节一致。

60 帧真人运行产生 `13,824,000` 字节 Alpha，SHA-256 为
`f1a113fc4b4330e9c405508253848376bf60b6f9b0eddcbddb712abdf0cc7b91`；两次运行
逐字节一致。相同 raw mask 的旧 QCut resize 输出 SHA-256 为
`589b1e55c8ec7265b3fc00ab55bb5e4d5ab3009e54602b345324f9553cdd3c8c`，
两条 60 帧输出只在 `168640/13824000` 像素上相差 `1`，u8 MAE `0.0121991`、
最大误差 `1`。最终完整闭包门禁版本同机单次 wall-clock 为 vendor V2 `1.10s`、
旧 CPU resize `0.94s`，相差约 `0.16s`。使用缺失输入、只走 SHA 门禁而不进入
`dlopen` 的 warm-cache 测量为 `0.61s`；它包含主库、22 个其余 Framework、graph
和 model 的 SHA 读取。这是一轮本机微基准，不是发布性能承诺。

最终成功日志含完整身份：

```text
ok width=360 height=640 frames=60 route=video-object-jianying-bach-v2-exact-d634-v1 blend=TEMattingBlendEffectV2-vendor-exact closure=jianying-runtime-framework-closure-d634-v1-e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e refinement=vendor-v2-exact-no-qcut-refinement-v1
```

流式输入在完成一帧后再收到 1 个残缺字节的故障注入，会先输出第一帧，然后以
`video-object input ended mid-frame` 返回 1，并完整执行 V2、Engine context、Bach
三段清理，验证异常路径不会按错误 context 顺序析构。仍未替上层决定 seek、切镜、
倒放和变速时何时重建 worker。流式 stdout 的 duplicated fd 若在异常路径提前退出，
会在隔离进程终止时由 OS 回收；这是低严重度的进程内资源寿命问题，不会跨任务保留
vendor 或文件句柄。

## 可复现命令

普通产品 helper：

```bash
xcrun clang++ -std=c++20 -fobjc-arc -Wall -Wextra -Werror \
  -Wno-deprecated-declarations \
  electron/jianying-person-cutout/native/alpha-refinement.cpp \
  electron/jianying-person-cutout/native/metal-matting-blend.cpp \
  electron/jianying-person-cutout/native/video-object-bach-bridge.mm \
  -framework AppKit -framework OpenGL -framework CoreVideo \
  -framework CoreFoundation \
  -o /private/tmp/jianying-video-object-bach-bridge
```

两帧 tensor capture 复用同一个 worker，只额外编译两个只读 probe：

```bash
xcrun clang++ -std=c++20 -fobjc-arc -Wall -Wextra -Werror \
  -Wno-deprecated-declarations -DQCUT_BACH_RESEARCH_CAPTURE \
  electron/jianying-person-cutout/native/alpha-refinement.cpp \
  electron/jianying-person-cutout/native/metal-matting-blend.cpp \
  electron/jianying-person-cutout/native/video-object-bach-bridge.mm \
  docs/task/jianying-filter-runtime-research/probes/bytecoreml-nn3-capture.mm \
  -framework AppKit -framework OpenGL -framework CoreVideo \
  -framework CoreFoundation -framework CoreML -framework Foundation \
  -o /private/tmp/jianying-video-object-bach-capture-worker

xcrun clang++ -std=c++20 -fobjc-arc -Wall -Wextra -Werror -dynamiclib \
  -framework CoreML -framework Foundation \
  docs/task/jianying-filter-runtime-research/probes/coreml-feature-capture.mm \
  -o /private/tmp/qcut-jy-coreml-feature-capture.dylib

DYLD_LIBRARY_PATH="$FRAMEWORKS" \
DYLD_INSERT_LIBRARIES=/private/tmp/qcut-jy-coreml-feature-capture.dylib \
JY_COREML_CAPTURE_DIR="$CAPTURE_DIR" \
JY_BACH_NN3_CAPTURE_DIR="$CAPTURE_DIR" \
/private/tmp/jianying-video-object-bach-capture-worker \
  "$FRAMEWORKS/libcccreator.dylib" "$GRAPH_DIR" "$PACKED_MODEL" \
  "$RGBA" 360 640 "$ALPHA"
```

worker 需要在独立进程并允许 macOS GPU/OpenGL context 的环境运行。文件系统
sandbox 内无法创建 context 时是环境失败，不是模型失败。

## 上线前验证门禁

固定 D634 exact provider 已完成第 1、2、3、5、6、7、8、9、10 项；第 4 项中的连续帧与取消已有测试，seek、切镜和倒放仍作为宿主策略的后续覆盖项。最新真人 Electron E2E 为 `1/1 passed (22.1s)`，首轮执行 Bach+vendor V2、第二轮命中独立新缓存，两轮均无 fallback，并已生成三张桌面截图和白底左右对比。详情见 [固定版同算法验收](./jianying-person-cutout-exact-bach-v2-2026-08-28.zh.md)。

exact Bach worker 与 direct same-model fallback 上线均至少要求：

1. 固定真人片段，剪映与 QCut 同帧 raw Alpha 对齐；
2. 校验 raw `256×256 saliency_mask`、回到源尺寸后的 soft Alpha 和方向；
3. 检查近景人脸、头发、身体边缘，不只看非零像素数；
4. 首帧、连续帧、seek、切镜、倒放和取消；
5. 模型缺失、finder 失败、空结果、坏尺寸、vendor crash 和 watchdog；
6. 合法全零蒙版与 hostless `0/1/2` 噪声必须可区分；
7. 缓存只在完整帧数、内容哈希和 Alpha 质量均通过后提交；
8. helper 编译使用 `-Wall -Wextra -Werror`，并验证打包后的 runtime/symbol
   capability；
9. 真实 Electron E2E、截图和白底左右对比；
10. 任一失败自动回退，不改变用户默认人物抠像可用性。

## 本轮保留与未保留

保留：

- 本文静态调用链、动态 tensor/result 结果和安全接口设计；
- 既有 Swing V2 research probe；
- 固定 SHA/UUID 的独立 `jianying-video-object-bach-bridge`；
- compile resolver、原子发布单测和 CoreML/ByteCoreML capture probes；
- 当前产品已有的隔离、watchdog、Alpha 质量门禁和回退链。

未保留：

- 临时 Swing-device-to-Effect 产品接线；
- manager Effect handle 的 type 198/by-node/by-graph 读取；
- vendor dylib、模型、graph、真人帧、捕获 tensor 和完整运行日志。

仓库不保存剪映 dylib、模型、真人输入或完整 vendor 日志。
