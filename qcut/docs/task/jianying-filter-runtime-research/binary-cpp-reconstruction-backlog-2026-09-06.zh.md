# 剪映二进制分析与独立 C++ 还原：剩余工作台账

盘点日期：2026-09-06。工作分支：`timeline-fixed-prfix`；源码基线：`c8ac87f132eb963cc9fa7805c8530f5325e1755d`。
本次只核对已有代码、研究报告和本机安装清单，记录后续任务；没有新增反编译或算法实现。

## 现在到底还剩多少

| 统计口径 | 已有结果 | 还剩什么 |
| --- | --- | --- |
| 当前优先队列的核心库 | **6 个**：cccreator、AGFX、videoeditor、VECreator、lens、bytenn | **6/6 都没有完成整库源码还原**；不能把局部函数分析记为一个库完成 |
| 本轮新增的定点二进制分析 | AGFX、videoeditor、VECreator **3/3 已有报告**；加上历史 cccreator，共 **4 个库有明确的定点反汇编证据** | 四个库仍有大量未覆盖路径；lens 另有局部转换函数恢复，bytenn 有模型输入边界证据，不属于“完全没碰过” |
| 本轮可单独交付的标准 C++ 算法链 | **1 条：电影柔光**，已有源码、编译入口、单帧 CLI、持续帧 CLI、测试和 QCut 接入 | 其余核心库没有对应的完整、独立 C++ 替代工程；柔光自身也有透明/HDR、实时性能等边界待补 |
| 当前安装包的 `.dylib` 文件库存 | 剪映 11.3.0 的 `Contents/Frameworks` 下递归找到 **85 个实际文件**，其中顶层 **82 个**、嵌套 **3 个** | 除上面六个优先目标外，另外 **79 个文件不纳入这张核心还原表**；没有逐库完成率，不能直接说“还剩 81 个没反编译” |

因此，后续任务应表述为：**继续完成 6 个核心库涉及的目标算法/合同，其中目前明确交付了一条独立 C++ 算法链；整库级恢复完成数为 0。** “已有 1 条算法”与“还剩多少个库”不能做减法。

85 是本次文件系统盘点值，不是剪映全部 Mach-O 镜像数：没有把应用主程序、无 `.dylib` 后缀的 Framework 可执行文件、系统依赖或其他私有运行时快照混入。很多依赖是通用基础库，也不需要逐个重写。旧文档的 **23 个 dylib** 是某份私有运行时的依赖闭包，不能替代安装包库存。

## 六个核心库逐项状态

| 核心库 | 已经知道/已经做过 | 独立 C++ 现状 | 尚需分析与实现 |
| --- | --- | --- | --- |
| `libcccreator.dylib` | Effect/Swing/FeatureSegment 宿主、滤镜与转场入口、序列化资源、文字/人像/跟踪的部分合同；电影柔光固定资源图与强度语义 | 柔光已提炼为独立 C++20；也有自有后处理代码。大量 `.mm/.cpp` 文件仍是调用原生库的探针或桥，不能算原生算法已重写 | 通用多 Pass 图、其他复杂滤镜、文本动画和转场的完整独立执行；Bach/GRU/跟踪等核心算法与模型仍有私有依赖 |
| `libAGFX.dylib` | ARM64 格式转换、采样器映射、GPU 调度/完成语义；格式探针 7/7；`43 → RGBA8Unorm` | 自有 Metal 滤镜后端已经存在；柔光有 CPU 采样与量化实现。没有恢复一个通用 AGFX C++ 引擎 | 真正逐 Pass 的目标格式、采样精度、颜色/Alpha、资源寿命和同步；补齐目标效果需要的 GPU 原语，不以整库照搬为目标 |
| `libvideoeditor.dylib` | 材料强度存储、关键帧转换、序列时间与 Clip 本地时间的局部调用链 | 没有该库的完整 C++ 重建；QCut 已有自己的时间线实现 | 请求处理到实际效果事件的中间链、clamp/default/reset、subtype、seek/export 时间语义；先形成可测试合同，再接到 QCut |
| `libVECreator.dylib` | UI 默认值/精度、连续更新和接受更新、多选、重置请求、百分比埋点 | 没有该库的完整 C++ 重建；QCut UI 使用自己的实现 | UI 百分比转换的确切位置、服务端 action、撤销/重做和多选传播。以恢复行为合同为主，不要求重建原来的 UI 工程 |
| `liblens.dylib` | 已有 Deflicker 连续帧原生桥、VAS/VMB 对象调用、UMVFI 模型加载；还恢复过局部颜色转换表 | **尚无这些核心算法的独立 C++ 实现**；现有 Deflicker 宿主仍加载私有库 | 防闪烁时序/强度映射；VAS 防抖配置与矩阵；UMVFI 补帧输入/状态；VMB 光流与帧融合。逐个恢复完整帧合同，再写自有实现 |
| `libbytenn.dylib` | ByteNN 模型加载、`SetInput` 张量元数据与输入预处理边界，部分模型路由 | **尚无 ByteNN 推理引擎及相关降噪/分割模型的完整独立 C++ 替代** | 张量布局、算子/后端、输出协议、时序状态与模型依赖。恢复推理调用合同不等于取得模型训练源码或权重的独立替代 |

上述证据来自不同时间与不同二进制版本。当前已安装 11.3.0 与柔光历史 D634 CGL 参考分开记录，地址/ABI/像素结论不能跨版本直接套用。

### 下一批候选库（4 个，尚未纳入当前六库优先队列）

| 库 | 目前证据 | 待推进 |
| --- | --- | --- |
| `libLumiGeneRuntime.dylib` | 已识别为脚本转场运行时桥和依赖 | 内部调度/执行合同；现有文档未记录完整独立替换 |
| `libfastcv.dylib` | 已记录视觉处理依赖和版本身份 | 按具体效果定位需要的光流/warp/图像算子；现有文档未记录库内核心完整恢复 |
| `libsamicore.dylib` | 已出现在私有运行时依赖闭包 | 先建立音频功能→符号→输入输出的定向台账，再决定需要的自有算法 |
| `libspeechsdk.dylib` | 已识别 ASR/字幕后处理入口和模型供给 | 拆分本地/云端路由，先取得可复现输入输出，再考虑独立语音算法 |

加上这四个候选，**本台账点名跟进的是 10 个库，当前执行优先队列仍为 6 个**；没有把候选识别写成已完成反编译。依据为[运行时依赖说明](../../../research/jianying-runtime-probe/README.md)、[依赖闭包](video-object-bach-host-boundary-2026-08-28.zh.md)和[字幕研究](../jianying-subtitle-reference/README.zh-CN.md)。

`libTracking.dylib` 已确认是埋点/遥测库，不是视觉跟踪算法；Bingo 原生跟踪桥已有真实轨迹输出，但独立 tracker 仍未完成，现有自有视频基线使用 Python/OpenCV。见[跟踪研究的原生桥与自研阶段](../../../research/jianying-tracking-probe/README.md)。

## 已经写好的 C++ 不要重复做

电影柔光源码位于 [`research/independent-soft-glow`](../../../research/independent-soft-glow/README.zh.md)：

- 算法主体：`image.cpp`、`gaussian.cpp`、`glow.cpp`、`layer.cpp`、`lut.cpp`、`pipeline.cpp`。
- 已有 Gaussian、SoftLight、RG/BA 打包 Glow、LUT、Normal 合成和固定场景连接；`output-mix` 与 `ui-snapshot` 两种强度合同分开。
- 已有 CMake、静态库、raw/PPM 输入输出、持续 RGBA 帧协议、异常输入和算法测试；编译与渲染不加载剪映库。
- 已有五档剪映 UI 导出对照、70 帧运动序列重复/乱序验证、实际 QCut 预览和导出 E2E。具体范围见[最终验证报告](soft-glow-ui-video-verification-2026-09-06.zh.md)。本次文档盘点没有重跑这些实验。
- 精确色调仍需要外部 LUT；透明/HDR/高位深、通用事件状态机、逐 Pass 原生精度、GPU/SIMD 实时化及跨平台算法实测尚未完成。普通工程 CI 通过不能替代这些验证。

这条算法来自**二进制宿主行为、资源图、脚本/Shader 语义及实际输出的共同证据**，并非把一个完整 dylib 自动翻译回了原始 C++ 项目。

仓库另外已有独立 Metal 滤镜及人像后处理代码，例如 [`host.mm`](../../../electron/qcut-independent-filter/host.mm)、[`alpha-refinement.cpp`](../../../electron/jianying-person-cutout/native/alpha-refinement.cpp)、[`alpha-temporal-stabilizer.cpp`](../../../electron/jianying-person-cutout/native/alpha-temporal-stabilizer.cpp)。它们应保留和复用；不能因为本轮只有一份标准 C++ 算法链交付，就说整个仓库其他 C++ 都没写。

## 下一步按什么顺序做

| 优先级 | 可执行任务 | 完成门槛 |
| --- | --- | --- |
| P0 | 以柔光为模板，把下一个真实复杂滤镜的有效图、参数、采样和生命周期写成语义契约；扩展可复用的 Gaussian/Layer/Glow/LUT 原语 | 一个真实效果从独立源码编译、读取自有输入并输出像素；同输入原生参考差分和边界测试可重跑 |
| P0 | 补柔光与 AGFX 对应的实际逐 Pass 证据，再实现自有 GPU/SIMD 路径 | 数值差异有归因；CPU/GPU 对照、尺寸/强度切换、预览/导出和性能数据均有证据 |
| P1 | `liblens` 先从已有连续帧桥的 Deflicker 开始，再做防抖/补帧/VMB | 先恢复帧输入输出、时序状态和 UI 参数合同，再交付不加载该库的算法源码与视频对照 |
| P1 | `libbytenn` 与 cccreator 的分割/降噪链 | 明确哪些是通用推理代码、哪些是模型资产；独立/已授权后端产出真实张量和像素，不以 model-loaded 计完成 |
| P2 | 补 videoeditor → cccreator 与 VECreator → videoeditor 的剩余行为链 | reset、多选、关键帧、seek、重开和导出合同被测试覆盖；需要的语义接入 QCut，不重复实现整套原 UI |

待办清单：

- [ ] 为下一个真实复杂滤镜建立独立语义契约和 C++ 实现。
- [ ] 柔光/AGFX 的逐 Pass 格式、采样和舍入完成实测归因。
- [ ] 柔光补 GPU/SIMD 性能实现及跨平台算法测试。
- [ ] Deflicker 从私有运行时桥推进到独立算法。
- [ ] VAS / UMVFI / VMB 分别补齐帧合同与独立实现。
- [ ] ByteNN 相关降噪/分割明确模型替代与独立推理路径。
- [ ] 补齐 UI 请求、关键帧、重置及宿主事件链。

这七条是当前计划的工作包，不是剩余函数数量；没有函数级覆盖率，暂不估算“还差百分之多少”或全部完成工时。

## 不同库存数字不要混算

[第三批混合滤镜报告](hybrid-dual-3dl-batch3-2026-09-06.zh.md) 的快照是：892 张资源卡，713 张完全独立 Metal、117 张自有 Metal 加私有模型、62 张未迁移到 Metal（含 4 张缺包）；另有一张 CPU 卡。这里数的是**资源卡与后端支持**，不是 dylib，也不是 713 份独立 C++ 算法。

[转场解构报告](../../../research/jianying-runtime-probe/DECOMPILATION.md) 已恢复 13 个代表性转场的公式/结构，部分数学代码在 TypeScript；其原生差分通过不代表 13 套完整独立 C++ 渲染器已经交付。`.ausl`、`graph.dat` 等资源文件也不并入本表的动态库数量。

## 证据入口与盘点方法

- [二进制第一轮总报告](binary-priority-research-2026-09-06.zh.md)
- [AGFX 纹理契约](agfx-texture-contract-2026-09-06.zh.md)
- [videoeditor 调用链](videoeditor-filter-chain-2026-09-06.zh.md)
- [VECreator 参数与提交](vecreator-filter-params-2026-09-06.zh.md)
- [基础视频探针与验证等级](../jianying-video-basic-panel-reference/PROBES.zh-CN.md)
- [Deflicker 私有运行时现状及缺口](../jianying-video-basic-panel-reference/PRIVATE_RUNTIME_DEFLICKER.zh-CN.md)
- [ByteNN 模型输入边界](model-input-boundary.zh.md)
- [柔光算法语义契约](../../../research/independent-soft-glow/semantic-contract.zh.md)

安装文件库存可用以下只读命令重算；升级应用后应更新日期和计数：

```sh
python3 - <<'PY'
from pathlib import Path
import plistlib

app = Path('/Applications/VideoFusion-macOS.app')
info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
root = app / 'Contents/Frameworks'
files = {p.resolve() for p in root.rglob('*.dylib') if p.is_file()}
top = {p.resolve() for p in root.glob('*.dylib') if p.is_file()}
print(info['CFBundleShortVersionString'])
print({'dylib_files': len(files), 'top_level': len(top), 'nested': len(files - top)})
PY
```

本台账只保存原创说明和定位信息；原始库、模型、资源包与原生证据保持在仓库外。
