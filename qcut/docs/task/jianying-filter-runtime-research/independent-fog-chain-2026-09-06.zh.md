# 迷雾：从调用链到独立 Metal 实现的逐像素验证

日期：2026-09-06。目标应用为中文剪映专业版，不是 CapCut。

## 结论与边界

本轮完成一张多 Pass 滤镜的闭环：调用入口与参数语义核对、资源图解析、自有宿主和数学实现、同输入逐像素比较。

- 独立实现不加载剪映 `.dylib`，不解释剪映 Lua，也不加载原始 Shader/Scene/Material。
- 仍读取用户本机私有缓存中的 LUT 图片。因此是**运行库独立**，不是资源独立，也不是可直接分发的完整滤镜产品。
- 一张 1280x720 真人图在强度 100 时，与保存的剪映 UI 无损参考图 **RGBA 逐字节一致**。
- 两种输入、三个强度，共六组与本轮新运行的 QCut 剪映原生后端逐像素一致。
- 这是仓库外的研究实现，尚未替换 QCut 产品的预览、导出或 CLI 后端。
- 本轮没有重新操作剪映窗口。UI 参考来自 2026-08-11，已重新校验文件哈希及原生输出；新增测试图和强度 50 的依据是本轮原生 oracle，不是新 UI 导出。

不能把这些结果推广为全部滤镜、所有 GPU、视频色彩路径或人像模型已经复刻。

## 样本身份

| 项目 | 值 |
| --- | --- |
| 滤镜 | 迷雾 |
| Resource ID | `7160594413847203085` |
| Package version | `e745e131cff1db913aea07f4098ec8de` |
| 私有包 | `~/Library/Application Support/QCut/PrivateAssets/JianyingText/Cache/artistEffect/<id>/<version>` |
| GPU | Apple M4 Pro |
| 独立渲染 | Objective-C++ 宿主 + Metal fragment shaders |
| 输入 | 1280x720、不透明 RGBA、没有缩放 |
| 新增测试图 | 513x287，渐变、棋盘格、127/128 灰阶、亮块、四色一像素边框 |

关键哈希：

```text
输入 RGBA:
b1eea462c6fbb6398d488fce9eef05c932924543c8a631d1f4e630a4c1e92bdf

剪映 UI 参考 PNG 文件:
6e264d9b62aca50bb0fd4595d9a23bd32692348f98f29ca83871a942fc066fcb

剪映 UI / 独立实现 / 本轮原生输出，强度 100 的共同 RGBA:
82a592bd08e03d7c5503b527ab1a7fdf14349da1a39251d2cb08a6c0cb26559b

私有 filter.png 文件:
e3d93009c983c84a674e5d288d8d3fbdd8f3e9572f9687132cc03bd4e14976d8
```

UI 参考目前位于：

```text
/Volumes/MOVE SPEED/Download/QCut-Jianying-LUT-Parity-2026-08-11/multi-pass/jianying/04-fog.png
```

## 1. 调用链

需要区分两条原生入口，不能混为一次新的剪映 UI 动态追踪。

### Swing 参数入口

此前原生研究已经用 `{"intensity":1}` 验证正确强度，见
[强度映射研究](multipass-intensity-mapping.zh.md)和
[迷雾完整原生重放](multipass-fog-binary-replay.zh.md)。
本轮在完整 ARM64 反编译索引中复核三个入口：

| 入口 | 映像内地址 | 本轮静态证据 |
| --- | --- | --- |
| `bef_swing_segment_set_params` | `0x01666b74` | 字符串参数经 segment 虚表偏移 `0xc0` 派发 |
| `FeatureSegment::setParameters` | `0x0180ca58` | 处理参数对象，并遍历调用单参数入口 |
| `FeatureSegment::setParameter(string, Variant)` | `0x0180c2f0` | `intensity` 专用分支、事件构造及 preset 参数处理 |

地址只针对 ARM64 UUID `D6342ECD-5432-33F0-A2AD-0C28F5699994` 的本地运行库。
原始伪代码有寄存器/`this` 推断残缺，不能将其签名当成恢复出的原始 C++ 头文件。

可复用的行为链是：

```text
归一化 intensity
 -> segment 参数对象
 -> FeatureSegment 参数事件
 -> SeekModeScript.onEvent
 -> 各材质 uniform
 -> 四个有依赖关系的渲染 Pass
```

本轮没有宣称恢复 manager/segment 的完整类布局；独立实现只需要已验证的输入输出协议和数值语义。

### 本轮 QCut 原生 CLI 入口

当前产品使用另一条已存在的低层入口：

```text
qcut filter-lab render
 -> 解析本机私有包与原生后端
 -> createJianyingFilterLocalRenderSession
 -> prepareJianyingNativeMultiPassPackage
 -> 临时包 onStart 写入各 Pass 强度
 -> CGL 本机宿主，skipAlgorithm
 -> bef_effect_init / bef_effect_set_effect / bef_effect_process_texture
 -> PPM/RGBA 读回、PNG 输出
```

源码入口为 `electron/jianying-filter-local-runtime/render.ts`、`package-preparer.ts`、
`host-process.ts` 和 `docs/task/jianying-filter-runtime-research/probes/effect-cgl-render-probe.cpp`。
本轮没有改动这些产品文件。

## 2. 参数与结构

UI 强度 `I` 的范围为 0..100，归一化 `x = I / 100`：

| 目标 | 数值语义 |
| --- | --- |
| 横向模糊 | `blurSize = x * 0.90 * 4` |
| 纵向模糊 | 同上；实际 UV 步距还乘 `1.25` 并除输入尺寸 |
| 雾化混合 | 向原图混回的权重为 `1 - x * 0.50` |
| 最后 LUT | LUT 与前一 Pass 的混合权重为 `x` |

不能用“强度 100 的最终图与原图混合”替代整个强度曲线，因为模糊半径本身也在变化。

独立实现自己的 uniform block 为 16 字节：两个 float 尺寸、一个 float 强度、一个 uint Pass 编号。
宿主用 `static_assert` 校验大小。这是本轮自定义协议，不是剪映的二进制结构声明。

## 3. Shader 与纹理

```text
原图
 -> 横向加权采样，同时生成亮度阈值 mask 到 Alpha
 -> 纵向加权采样，RGB 与 mask 一起模糊
 -> 结合原图、模糊图和 mask 的 screen/混合运算
 -> 64 级、8x8 分片的 LUT 图集采样
 -> 输出
```

关键条件：

- 不是标准 Gaussian blur：需要原包对应的采样位置、权重和运算顺序。
- mask 是亮度阈值结果，不是人像分割；这张滤镜不需要人脸或皮肤模型。
- 四个 Pass 同尺寸，输入与各级输出独立，前一 Pass 写完才能被后一 Pass 读取。
- 本轮匹配配置为 `RGBA8Unorm` 中间纹理、线性采样、clamp-to-edge、无 mipmap、无 sRGB 转换、无 blending。
- 不能把所有 Pass 融成一个浮点公式：每一级的 8 位量化会影响后续结果。
- 最终 Alpha 恢复源 Alpha；本轮所有对比素材均不透明，尚未验证半透明素材。
- `main.scene`、material 和 render-target 二进制记录使用仓库现有序列化解析器解析，原始 JSON 保存在私有证据目录。

保存了独立实现全部四个 Pass 的原始数据与 PNG。尚未从原生后端逐一读出中间纹理，
因此本轮“逐像素一致”指最终输出，不是已完成所有原生中间纹理的逐项审计。

## 4. 独立实现

研究代码位于仓库外：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/independent-fog/2026-09-06/
  render.mm                  自有 Metal 宿主
  fog.metal                  根据已理解的数学语义重写的四 Pass
  verify.py                  输入、原生 oracle、逐像素比较
  test-matrix.py             六组强度/尺寸测试、重复性、参数拒绝测试
  capture-evidence.py        定向反编译证据、资源图解析与消融统计
```

渲染进程只读取自有 shader、输入 RGBA 和私有 LUT RGBA，不读取 oracle 或 UI 参考文件。
比较程序在渲染完成后才读取参考图。

`otool -L` 和进程内 `_dyld_image_count()` 审计均已保存。
六组独立渲染都没有加载剪映、`libcccreator`、`libAGFX` 或其他非系统运行库。
这些证据证明不依赖剪映渲染运行库，但不改变私有 LUT 的资源依赖与使用边界。

## 5. 逐像素结果

MAE/RMSE 使用 0..255 RGB 数值，逐个像素、全部三个颜色通道计算；Alpha 另外检查，未缩放后再比较。

| 输入 | 强度 | 参考 | RGB MAE / RMSE / Max | 不同 RGB 像素 | Alpha Max |
| --- | ---: | --- | --- | ---: | ---: |
| 真人 1280x720 | 0 | 本轮原生 CLI | 0 / 0 / 0 | 0 | 0 |
| 真人 1280x720 | 50 | 本轮原生 CLI | 0 / 0 / 0 | 0 | 0 |
| 真人 1280x720 | 100 | 本轮原生 CLI | 0 / 0 / 0 | 0 | 0 |
| 测试图 513x287 | 0 | 本轮原生 CLI | 0 / 0 / 0 | 0 | 0 |
| 测试图 513x287 | 50 | 本轮原生 CLI | 0 / 0 / 0 | 0 | 0 |
| 测试图 513x287 | 100 | 本轮原生 CLI | 0 / 0 / 0 | 0 | 0 |
| 真人 1280x720 | 100 | 保存的剪映 UI PNG | 0 / 0 / 0 | 0 | 0 |

另外通过：两个零强度输入原样输出、重新启动独立进程的确定性、超范围强度拒绝、运行库加载白名单。
测试脚本会在任意像素不等时失败，不使用“看起来差不多”阈值代替通过条件。

### 单变量消融

固定真人输入、强度 100 和同一张 UI 参考：

| 实验 | RGB MAE | RGB RMSE | Max | 不同像素 |
| --- | ---: | ---: | ---: | ---: |
| 独立 Metal，RGBA8，fast math | 0 | 0 | 0 | 0 |
| 只将前三个中间纹理改为 RGBA16Float | 0.198093 | 0.445102 | 2 | 396448 / 921600 |
| 只关闭 fast math | 0.000515 | 0.022734 | 2 | 827 / 921600 |
| 历史结构近似输出，重新计量 | 24.004018 | 25.573723 | 70 | 921594 / 921600 |

前两项消融是真实单变量实验，不是猜测：提升中间精度未必更接近原实现，改变编译数学选项也会改变舍入结果。
这些实验没有进一步隔离 fast math 中具体哪一项优化造成差异，不能直接归因于某一条 FMA 指令。

历史结构近似输出来自 2026-08-11，不能描述成当前原生产品仍有 25.57 RMSE。
当前原生产品在同一图上也为零误差。本轮进展是**获得不依赖剪映运行库的同输出实现**。

## 复现

需要本机已有的私有 LUT 与参考素材，不下载或重新分发第三方资源。

```bash
EXPERIMENT="$HOME/Library/Application Support/QCut/Research/JianyingFilter/independent-fog/2026-09-06"

clang++ -std=c++20 -fobjc-arc -O2 -Wall -Wextra -Werror \
  -Wno-deprecated-declarations -framework Foundation -framework Metal \
  "$EXPERIMENT/render.mm" -o "$EXPERIMENT/render"

python3 "$EXPERIMENT/verify.py" prepare
python3 "$EXPERIMENT/test-matrix.py"

python3 "$EXPERIMENT/verify.py" render --format rgba16f
python3 "$EXPERIMENT/verify.py" compare --format rgba16f
python3 "$EXPERIMENT/verify.py" render --math precise
python3 "$EXPERIMENT/verify.py" compare --math precise
python3 "$EXPERIMENT/capture-evidence.py"
```

矩阵内的原生对照每次重新执行下面的 CLI，而非仅检查旧文件存在：

```bash
QCUT_JIANYING_DISABLE_APP_BUNDLE=1 \
QCUT_JIANYING_DISABLE_USER_CACHE=1 \
qcut filter-lab render \
  --resource-id 7160594413847203085 \
  --filter-version e745e131cff1db913aea07f4098ec8de \
  -i "$EXPERIMENT/input.png" \
  --output "$EXPERIMENT/oracle-input-100.png" \
  --filter-intensity 100 --force --json
```

## 证据与后续

同一私有目录内：

- `comparison-overview.png`：原图、保存的 UI 参考、独立输出、放大 16 倍差分。
- `provenance.json`、`resource-hashes.json`：来源与资源哈希。
- `test-matrix.json`、`diagnostics.json`：完整逐像素计数、消融结果。
- `input-100-fast-rgba8/pass0..3.raw`、对应 PNG：独立中间结果。
- 各运行的 `run.json`：设备、配置、加载映像和 GPU 时间。
- `oracle-*.log`、`oracle-*-command.json`：本轮原生 CLI 命令、返回值和耗时。
- `private-call-chain/`、`private-scene-material-rt.json`：定向反编译和资源结构，仅本地保留。

没有把一次 GPU submit/wait 时间与包含启动、资源解析、编解码的整条 CLI 耗时直接计算加速比。
本轮不是性能基准。

下一步最小产品接入范围是单卡可选的独立后端，并保持原生后端作回归 oracle；接入前还需要验证：

1. 连续视频、多帧尺寸/素材切换、取消与资源释放。
2. 半透明输入、视频 RGB/YUV 和色彩标签、HDR 等未覆盖路径。
3. QCut 实际预览、导出、项目重开，以及其他机器的浮点行为。
4. 私有 LUT 的供应边界；不能因为运行库独立就把 LUT 打进发行包。

本次仓库只新增本报告及索引，不包含二进制、原始 Shader/LUT、反编译产物或媒体。
