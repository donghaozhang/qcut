# 本地算法探针状态

> 探针源码：`research/jianying-basic-video-probe/`
>
> 私有运行库、模型、输入帧和输出只允许保存在本机私有目录或 Git 忽略目录，不进入仓库。

## 验证等级

| 等级 | 含义 |
| --- | --- |
| `discovered` | 所需模型、库和符号存在 |
| `runtime-callable` | 在隔离子进程中真实构造并释放算法对象 |
| `model-loaded` | 私有运行时成功解析模型或 GPU 程序 |
| `input-processed` | 用真实输入得到结构和尺寸有效的输出 |

低等级不能代替高等级。特别是 `discovered` 不能写成“算法已经跑通”，`model-loaded` 也不能代替像素或轨迹结果验证。

## 当前总表

| 能力 | 本地性 | 当前等级 | 已验证 | 仍缺 |
| --- | --- | --- | --- | --- |
| 防闪烁 | 已确认本地 | `model-loaded` | Lens 工厂创建/释放；Deflicker 2.0.0；Metal 库装载 | 连续帧输入和去闪输出 |
| 剪映防抖 | 已确认本地 | `runtime-callable` | VAS 2.0.0 工厂创建/释放 | 稳定矩阵和安全裁切输出 |
| ByteNN 降噪 | 已确认本地 | `model-loaded` | ByteNN 真实解析 `nn_denoise.bytenn` | 三帧输入和降噪像素输出 |
| UMVFI 补帧 | 已确认本地 | `model-loaded` | UMVFI 3.2.0 工厂；Metal 库装载 | 两帧输入和中间帧 |
| 光流运动模糊 | 已确认本地 | `runtime-callable` | VMB 1.0.0 工厂创建/释放 | 光流和时域多采样输出 |
| 智能运镜 | 已确认本地 | `input-processed` | 五帧真人 Mask；QCut 生成平滑运镜关键帧 | 与剪映运镜策略做 oracle 对照并接入时间线 |
| 智能裁剪 | 已确认本地 | `input-processed` | 真人帧输出 360×640 Mask；QCut 生成 9:16 裁剪框 | 与剪映平滑/构图策略做 oracle 对照 |
| 镜头追踪 | 已确认本地 | `model-loaded` | Bingo ObjectTracking 模型初始化成功 | 真实起始框和逐帧目标轨迹 |
| 眼神修正 | 已确认本地 | `runtime-callable` | 两份眼部模型存在；Bach/Amazing 使用本地模型根初始化成功 | 指定算法按需加载和眼部像素结果 |
| AI 超分 | 本地 Provider 未确认 | `discovered` | Client 存在；发现明确上传路径；三处模型/缓存无候选 | 本地模型与推理 ABI 出现前不得标为本地 |

## 脱离剪映 App 的本机验证

2026-08-30 已把本任务需要的十个模型文件以内容哈希快照复制到：

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingBasicVideo/current/Models
```

模型快照约 16 MB，清单位于同级 `manifest.json`。运行库使用 QCut 既有的私有 Frameworks 快照：

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current/Frameworks
```

探针以 `env -i` 清空继承环境，只保留 `HOME`、系统 `PATH` 和指向上述 QCut 私有目录的 `DYLD_LIBRARY_PATH`；所有执行参数都不包含 `/Applications/VideoFusion-macOS.app`。结果如下：

| 能力 | 私有路径结果 |
| --- | --- |
| 防闪烁 | `model-loaded` |
| 剪映防抖 | `runtime-callable` |
| ByteNN 降噪 | `model-loaded` |
| UMVFI 补帧 | `model-loaded` |
| 光流运动模糊 | `runtime-callable` |
| 智能运镜 | 五帧 `input-processed` |
| 智能裁剪 | 单帧 `input-processed` |
| 镜头追踪 | `model-loaded` |
| 眼神修正 | `runtime-callable` |
| AI 超分 | 未确认本地，故不进入私有运行时 |

单帧 Mask 以及五个运镜 Mask 均与直接读取应用路径的探针输出逐字节一致。机器可读总报告：

```text
.local/jianying-basic-video-probe/app-independent/report.json
```

因此可以确认：前九项的当前验证层级可在本机备份完成后脱离剪映 App 路径运行；AI 超分不在此结论内。这里的“脱离”不是再分发许可，剪映私有 dylib 和模型只保存在本机 QCut 私有目录，不进入 Git、安装包或公共下载。

准备模型快照：

```bash
bun research/jianying-basic-video-probe/prepare-private-models.ts --version 11.3.0
```

证据目录已由 `.gitignore` 明确排除。

## 1. 防闪烁

### 探针入口

- 清单：`research/jianying-basic-video-probe/capabilities.ts`
- 原生宿主：`research/jianying-basic-video-probe/native/runtime-probe.mm`
- 模式：`deflicker`

### 2026-08-30 本机结果

探针完成了三件互相独立的检查：

1. 动态装载 `liblens.dylib`。
2. 调用 `DeflickerFactory::createDeflickerInstance`，确认对象非空后调用对应删除函数。
3. 通过当前 Metal 设备装载 `deflicker/deflicker.bundle/deflicker.metallib`。

关键结果：

```json
{
  "mode": "deflicker",
  "status": "model-loaded",
  "detail": "Deflicker factory and Metal library loaded"
}
```

运行时同时报告 `lens_deflicker: deflicker version v2.0.0`。该结果证明本地低层对象和 GPU 程序可用，但还没有向算法输入连续帧，因此当前不能宣称已经得到去闪视频。

### 复查命令

```bash
xcrun clang++ -std=c++20 -fobjc-arc -Wall -Wextra -Werror \
  research/jianying-basic-video-probe/native/runtime-probe.mm \
  -framework Foundation -framework Metal -framework OpenGL \
  -o /tmp/qcut-jianying-basic-runtime-probe

DYLD_LIBRARY_PATH=/Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /tmp/qcut-jianying-basic-runtime-probe \
  deflicker \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /Applications/VideoFusion-macOS.app/Contents/Resources/models
```

## 2. 剪映防抖

### 探针入口

- 原生模式：`stabilization`
- 低层对象：`ies::vas::VASFactory`
- 上层任务证据：`VideoStableClient::startVideoStabProcess`

### 2026-08-30 本机结果

探针在隔离进程中装载 `liblens.dylib`，调用 VAS 工厂创建本地防抖对象，验证返回值非空，并通过匹配的删除入口释放对象。运行库报告 `vas version v2.0.0`：

```json
{
  "mode": "stabilization",
  "status": "constructed",
  "detail": "factory created and released a local algorithm object"
}
```

当前等级是 `runtime-callable`。尚未恢复 `ies_vas_config`、`ies_vas_data` 和矩阵输出结构的完整 ABI，因此没有输入帧，也没有把对象可构造误写成防抖视频已生成。

### 复查命令

```bash
DYLD_LIBRARY_PATH=/Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /tmp/qcut-jianying-basic-runtime-probe \
  stabilization \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /Applications/VideoFusion-macOS.app/Contents/Resources/models
```

## 3. ByteNN 降噪

### 探针入口

- 原生模式：`bytenn-denoise`
- 模型：`noise_reduction/nn_denoise.bytenn`
- 解析入口：`IESNN::Interpreter::CreateFromFile`

### 2026-08-30 本机结果

探针动态装载 `libbytenn.dylib`，并把实际降噪模型路径传给 ByteNN 解释器。解释器返回非空对象，运行日志报告 `bytenn espresso version: 3.12.30`：

```json
{
  "mode": "bytenn-denoise",
  "status": "model-loaded",
  "detail": "ByteNN parsed nn_denoise.bytenn"
}
```

该探针在独立短生命周期进程内运行，因为当前私有构建没有导出与 `Interpreter::CreateFromFile` 返回对象匹配的析构入口。进程退出负责回收地址空间，避免猜测 ABI。当前还没有调用 `NNDenoiseFilterMetal::exec` 输入三帧数据，因此不报告降噪画质结果。

### 复查命令

```bash
DYLD_LIBRARY_PATH=/Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /tmp/qcut-jianying-basic-runtime-probe \
  bytenn-denoise \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /Applications/VideoFusion-macOS.app/Contents/Resources/models
```

## 4. UMVFI 补帧

### 探针入口

- 原生模式：`umvfi-interpolation`
- 低层对象：`ies::umvfi::UMVFIFactory`
- GPU 程序：`umvfi/umvfi.bundle/umvfi.metallib`
- 附加模型：`interpolation/lens_vfi_v1.0.model`

### 2026-08-30 本机结果

探针真实构造并释放 UMVFI 对象，并使用系统 Metal 设备装载 UMVFI GPU 程序。运行库报告 `lens_umvfi: umvfi version v3.2.0`：

```json
{
  "mode": "umvfi-interpolation",
  "status": "model-loaded",
  "detail": "UMVFI factory and Metal library loaded"
}
```

这证明随包本地 UMVFI 运行时和 GPU 程序可用。探针还没有恢复 `ies_umvfi_config` 和纹理数据 ABI，也没有生成中间帧，因此当前不报告视觉补帧效果。

### 复查命令

```bash
DYLD_LIBRARY_PATH=/Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /tmp/qcut-jianying-basic-runtime-probe \
  umvfi-interpolation \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /Applications/VideoFusion-macOS.app/Contents/Resources/models
```

## 5. 光流运动模糊

### 探针入口

- 原生模式：`optical-flow-motion-blur`
- 低层对象：`ies::vmb::VMBFactory`
- 关键路径：`VideoVMB::process_optical_flow_process`

### 2026-08-30 本机结果

探针通过 VMB 工厂真实构造并释放本地运动模糊对象。运行库报告 `lens_vmb: vmb version v1.0.0`：

```json
{
  "mode": "optical-flow-motion-blur",
  "status": "constructed",
  "detail": "factory created and released a local algorithm object"
}
```

当前结果证明 VMB 低层对象可调用，并与二进制中的光流处理路径一致。尚未恢复 `ies_vmb_config`、帧信息和纹理 ABI，所以没有生成时域融合帧。

### 复查命令

```bash
DYLD_LIBRARY_PATH=/Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /tmp/qcut-jianying-basic-runtime-probe \
  optical-flow-motion-blur \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /Applications/VideoFusion-macOS.app/Contents/Resources/models
```

## 6. 智能运镜

### 探针入口

- Mask 运行时：Bingo SaliencySeg
- 序列分析：`research/jianying-basic-video-probe/saliency-analysis.ts`
- 可复查 CLI：`research/jianying-basic-video-probe/saliency-probe.ts motion`

### 2026-08-30 本机结果

从同一段 6 秒真人视频的 0.5、1.5、2.5、3.5、4.5 秒各抽一帧。五次本地推理全部返回 `process=0`、`valid=1` 和 360×640 Mask。QCut 按时间排序 Mask，计算加权主体质心，再以 0.4 系数平滑成运镜中心关键帧。

关键帧中心的主要变化如下：

| 时间 | `centerX` | `centerY` | `zoom` |
| ---: | ---: | ---: | ---: |
| 0.5 s | 0.267526 | 0.594882 | 1.777778 |
| 1.5 s | 0.271658 | 0.650657 | 1.777778 |
| 2.5 s | 0.478293 | 0.630261 | 1.777778 |
| 3.5 s | 0.543354 | 0.614762 | 1.777778 |
| 4.5 s | 0.542628 | 0.615587 | 1.777778 |

主体在样本中由左向右移动，平滑关键帧也保持同方向响应，因此该探针达到 `input-processed`。轨迹生成和 9:16 构图是 QCut-owned 逻辑，不等于剪映 `VideoClient::addVideoSmartMotion` 的精确参数或美学策略。

### 本地证据

```text
.local/jianying-basic-video-probe/motion/frame-*.rgba
.local/jianying-basic-video-probe/motion/mask-*.gray
.local/jianying-basic-video-probe/motion/probe-*.log
.local/jianying-basic-video-probe/motion/smart-motion.json
```

### 复查命令

```bash
bun research/jianying-basic-video-probe/saliency-probe.ts \
  motion 360 640 0.5625 \
  .local/jianying-basic-video-probe/motion/smart-motion.json \
  0.5=.local/jianying-basic-video-probe/motion/mask-0_5.gray \
  1.5=.local/jianying-basic-video-probe/motion/mask-1_5.gray \
  2.5=.local/jianying-basic-video-probe/motion/mask-2_5.gray \
  3.5=.local/jianying-basic-video-probe/motion/mask-3_5.gray \
  4.5=.local/jianying-basic-video-probe/motion/mask-4_5.gray
```

## 7. 智能裁剪

### 探针入口

- 原生 Mask 探针：`docs/task/jianying-filter-runtime-research/probes/saliency-seg-abi-probe.cpp`
- QCut 分析模块：`research/jianying-basic-video-probe/saliency-analysis.ts`
- 可复查 CLI：`research/jianying-basic-video-probe/saliency-probe.ts crop`
- 模型：`saliency_seg_model/bingo_saliency_seg_v1.0.model`

### 2026-08-30 本机结果

输入来自 6 秒真人视频的第 1 秒画面，先以 RGBA 360×640 输入 Bingo SaliencySeg。运行时报告模型输入为 160×160，并真实返回 `process=0`、`valid=1`、360×640 单通道 Mask。Mask 为 230400 字节，不是测试 fixture。

QCut 对 Mask 使用阈值 32、12% 主体留白，并适配 9:16 画幅，输出：

```json
{
  "activePixelCount": 78572,
  "activePixelRatio": 0.3410243055555556,
  "centroid": { "x": 0.4389153749502921, "y": 0.6373623731412821 },
  "recommendedCrop": { "x": 0.13875, "y": 0, "width": 0.5625, "height": 1 }
}
```

因此该项达到 `input-processed`：本地模型处理了真实像素，QCut 得到了尺寸有效且可检查的 Mask 与裁剪框。裁剪框算法属于 QCut，不宣称复刻剪映最终的镜头平滑、主体优先级或美学打分。

最终还把原始灰度 Mask 转为 PNG 目检：输出不是全黑、全白或随机条纹，亮区确实覆盖画面中的人物上身和手臂；这只能作为结构合理性检查，不能替代与剪映最终裁剪结果的 oracle 对比。

### 本地证据

```text
.local/jianying-basic-video-probe/face-360x640.rgba
.local/jianying-basic-video-probe/saliency-pf2-mi0.gray
.local/jianying-basic-video-probe/smart-crop.json
```

### 复查命令

```bash
DYLD_LIBRARY_PATH=/Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /tmp/qcut-jianying-saliency-probe \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks/libcccreator.dylib \
  /Applications/VideoFusion-macOS.app/Contents/Resources/models/saliency_seg_model/bingo_saliency_seg_v1.0.model \
  .local/jianying-basic-video-probe/face-360x640.rgba \
  360 640 2 0 \
  .local/jianying-basic-video-probe/saliency-pf2-mi0.gray

bun research/jianying-basic-video-probe/saliency-probe.ts \
  crop .local/jianying-basic-video-probe/saliency-pf2-mi0.gray \
  360 640 0.5625 \
  .local/jianying-basic-video-probe/smart-crop.json
```

## 8. 镜头追踪

### 探针入口

- 原生模式：`camera-tracking`
- 模型：`object_tracking/bingo_objectTracking_v1.0.dat`
- 运行入口：`Bingo_ObjectTracking_createHandle`、`getDefaultParam`、`init`

### 2026-08-30 本机结果

探针先让运行库写入默认参数，再创建 Bingo ObjectTracking handle，并用真实本地模型初始化。初始化返回成功，handle 随后通过匹配的 release 入口释放：

```json
{
  "mode": "camera-tracking",
  "status": "model-loaded",
  "detail": "Bingo object-tracking model initialized"
}
```

当前结论绑定本机剪映专业版 11.3.0 的私有 ABI。它证明模型可由本地运行时解析，但还没有提供起始目标框，也没有调用 `trackFrame`，因此不报告追踪精度或轨迹稳定性。

### 复查命令

```bash
DYLD_LIBRARY_PATH=/Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /tmp/qcut-jianying-basic-runtime-probe \
  camera-tracking \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /Applications/VideoFusion-macOS.app/Contents/Resources/models
```

## 9. 眼神修正

### 探针入口

- 原生模式：`eye-correction`
- 运行时：Bach/Amazing Effect SDK
- 模型：`idream/tt_eyegrad_v1.0.model`
- 模型：`tt_eyefitting/tt_eyefitting_v1.0.model`

### 2026-08-30 本机结果

探针创建 legacy OpenGL context，构造 Effect handle，选择 OpenGL render API，并把本地 `Resources/models` 作为模型根执行 `bef_effect_init`。初始化和销毁均成功：

```json
{
  "mode": "eye-correction",
  "status": "constructed",
  "detail": "Bach/Amazing runtime initialized with the local model root"
}
```

两份眼部模型的本机指纹：

| 模型 | 字节 | SHA-256 |
| --- | ---: | --- |
| `tt_eyegrad_v1.0.model` | 977129 | `5506e2c96f51d4b5a304aa8b00fecf11808dbea32ecba25167a9bab92d9f7b97` |
| `tt_eyefitting_v1.0.model` | 105180 | `d5bffb3ded3d9e0cae474384cc607435020ff098f8183f8cb7d3b0a74586324b` |

当前等级严格保持为 `runtime-callable`。通用运行时初始化不会自动证明 EyeGrad/EyeFitting 已按需装载，更没有对真人眼部产生修正像素；这两项仍需恢复具体算法请求和输入/输出 ABI 后单独验收。

### 本地证据与复查命令

```text
.local/jianying-basic-video-probe/eye-correction.log
```

```bash
DYLD_LIBRARY_PATH=/Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /tmp/qcut-jianying-basic-runtime-probe \
  eye-correction \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks \
  /Applications/VideoFusion-macOS.app/Contents/Resources/models
```

## 10. AI 超分

### 探针入口

- 证据分类：`research/jianying-basic-video-probe/super-resolution-evidence.ts`
- 扫描 CLI：`research/jianying-basic-video-probe/super-resolution-probe.ts`
- 客户端库：`libvideoeditor.dylib`

### 2026-08-30 本机结果

探针发现三个编辑器入口：

- `SuperResolutionClient::startConvertSuperResolution`
- `SuperResolutionClient::getSuperResolutionPath`
- `SuperResolutionClient::cancelSuperResolution`

但同一二进制明确包含 `uploadVideoForSuperResolution`。探针随后扫描应用随包 `Resources/models`、剪映 `AlgorithmCache` 的可读元数据，以及 QCut 私有 Saliency 模型目录，没有发现可识别的本地超分模型或超分元数据：

```json
{
  "clientSymbols": [
    "startConvertSuperResolution",
    "getSuperResolutionPath",
    "cancelSuperResolution"
  ],
  "uploadEvidence": ["uploadVideoForSuperResolution"],
  "localModelCandidates": [],
  "metadataEvidence": [],
  "validationLevel": "discovered",
  "locality": "local-provider-unresolved"
}
```

结论不是“AI 超分一定只能云端”，而是“当前本机没有可证明的本地 Provider”。Client/时间线节点只证明产品支持该任务；明确上传路径又进一步阻止我们把它误标成离线能力。未来若下载到带哈希名的模型，仍需找到元数据映射和本地推理 ABI，才能提升等级。

### 本地证据与复查命令

```text
.local/jianying-basic-video-probe/ai-super-resolution.json
```

```bash
bun research/jianying-basic-video-probe/super-resolution-probe.ts \
  --library /Applications/VideoFusion-macOS.app/Contents/Frameworks/libvideoeditor.dylib \
  --root /Applications/VideoFusion-macOS.app/Contents/Resources/models \
  --root "$HOME/Movies/JianyingPro/User Data/Cache/AlgorithmCache" \
  --root "$HOME/Library/Application Support/QCut/PrivateRuntimes/JianyingSaliency/11.3.0/Models" \
  --output .local/jianying-basic-video-probe/ai-super-resolution.json
```
