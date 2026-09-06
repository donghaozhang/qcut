# 电影柔光：独立 C++ 算法源码

本目录交付电影柔光的 **C++20 CPU 算法语义重建**：可读源码、静态库、命令行程序、测试和逐阶段输出。编译与运行只需 C++ 标准库；不调用剪映 dylib、OpenGL、Metal、Lua 或 QCut。

已还原当前固定资源的实际五节点图。它是单个滤镜的算法实现，不代表恢复了剪映原始 C++ 工程、类型名或全部编辑器功能。

## 编译并运行

在本目录执行，构建目录可放在任意可写位置：

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j4
ctest --test-dir build --output-on-failure
./build/soft-glow --demo --output demo.ppm
```

不使用 CMake 也可直接编译：

```sh
c++ -std=c++20 -O2 -Wall -Wextra -Wpedantic -Werror -ffp-contract=off \
  image.cpp gaussian.cpp glow.cpp layer.cpp lut.cpp pipeline.cpp \
  image_io.cpp main.cpp -o soft-glow
./soft-glow --demo --output demo.ppm
```

`--demo` 自行生成色块、肤色、亮点和细线，默认使用程序生成的 identity LUT，因此整个演示无需供应商资源。对应色调需要显式提供同一张 LUT 数据；这份私有美术资源没有嵌入源码。

```sh
./build/soft-glow --input input.rgba --width 320 --height 180 \
  --lut reference-map2.rgba --intensity 1 --output output.rgba --trace stages
```

输入／输出 raw 为紧密排列的 **RGBA8、从上到下、不透明 SDR 图像**。LUT 为 512×512 RGBA8，8×8 图块组成 64³ cube；不需要 PNG 解码库。`.ppm` 输出仅保存 RGB，适合检查图像。`--trace` 导出每阶段 RGBA 与 PPM，便于定位误差。CLI 拒绝尺寸不匹配、非法强度、非有限数和透明输入。

`--intensity-mode` 有两个明确契约，单张图和帧流共用：

- `output-mix` 是默认值，保留本地 CGL provider 的 `lerp(input, full_effect, intensity)`；0 强度逐字节返回原图，已有六组历史原生对照属于这个模式。
- `ui-snapshot` 根据剪映实际导出快照重建参数：`t≤0.8` 时 threshold=`1−0.175t`、brightness=`3t`；更高强度使用场景的0.84／2.4；LUT opacity=`0.8t`。SoftLight和Normal保持固定，不再做末端强度混合，因此0仍保留SoftLight。

例如在上面的命令中添加 `--intensity-mode ui-snapshot --intensity 0.37`。该模式每次由强度重新计算，未修补或执行供应商事件脚本。公式、兼容性和实测边界见 [两种强度模式](intensity-modes.zh.md)。

## 源码入口

| 文件 | 独立职责 |
| --- | --- |
| `pipeline.cpp` / `pipeline.hpp` | 固定场景连接与有效参数，提供 `cinematic_soft_glow` |
| `gaussian.cpp` / `gaussian.hpp` | 分辨率选择、采样预算、gamma、可分离高斯卷积 |
| `layer.cpp` / `layer.hpp` | 居中缩放、SoftLight／Normal、Precomp／Adjustment 合成 |
| `glow.cpp` / `glow.hpp` | 阈值提取、RG／BA 高精度打包模糊、dither、辉光混合 |
| `lut.cpp` / `lut.hpp` | 64³ 图集插值、identity LUT 生成 |
| `image.cpp` / `image.hpp` | 图像数据、双线性采样、边界和 RGBA8 量化 |
| `image_io.cpp` / `image_io.hpp` | raw／PPM、可复现测试图 |
| `main.cpp` | 独立 CLI |
| `tests.cpp` | 9 组算法与异常输入测试 |
| `stream_main.cpp` / `stream_io.cpp` | [持续RGBA帧流](stream.zh.md)，显式固定强度模式 |
| `cli_intensity_test.py` | 可选标准库Python测试，两种CLI的模式参数及像素协议 |
| `verify_reference.py` | 可选的标准库 Python 原生参考对照；不参与编译或渲染 |

先读 [算法语义契约](semantic-contract.zh.md)：它将输入输出、有效参数、公式、通道布局、生命周期和待确认项独立于C++定义，并含30份单因素变体的实测依据。对应 [JSON契约](semantic-contract.json) 可用于后续实现或审计。

追踪细节见 [Gaussian／Layer语义](semantic-gaussian-layer.zh.md)、[SGlow语义](semantic-glow.zh.md)、[生命周期语义](semantic-lifecycle.zh.md)。有效场景来源见 [graph-evidence.zh.md](graph-evidence.zh.md)，简要数学概览见 [algorithm.zh.md](algorithm.zh.md)。

## 已完成的验证

2026-09-06，macOS arm64，AppleClang 21。Release、直接 C++ 编译、AddressSanitizer／UndefinedBehaviorSanitizer 测试均通过。测试包含双线性边界、LUT 通道映射、Gaussian 核参数与恒色、SoftLight、极小图像、非法输入、dither 重复性、RG／BA 打包的解析期望值、逐阶段量化及细白线回归。

以下是 `output-mix` 历史对照：同一私有 LUT、相同原始 RGBA 输入，对照 D634 兼容快照的 CGL 原生宿主。三个输入 × 两种强度，每组两个原生进程 × 三帧，**36 张参考帧全部在对应组内一致**；独立 C++ 每组也运行两遍，输出完全一致。双模式版本又重放六组输入，输出SHA与历史记录完全相同；历史源文件hash仍表示当时的快照。

| 输入 | 强度 | RGB MAE，0–255 | 单通道最大误差 | Alpha 最大误差 |
| --- | ---: | ---: | ---: | ---: |
| 色块／细线 320×180 | 100% | 0.054485 | 6 | 0 |
| 色块／细线 320×180 | 37% | 0.021360 | 2 | 0 |
| 非对称亮点 257×145 | 100% | 0.040959 | 5 | 0 |
| 非对称亮点 257×145 | 37% | 0.014974 | 2 | 0 |
| 连续渐变 321×181 | 100% | 0.020631 | 4 | 0 |
| 连续渐变 321×181 | 37% | 0.006540 | 2 | 0 |

此前结构近似在第一行输入上的 MAE 为 22.907616，细白线从 255 降至 25；本实现保留白线的 `[255,255,255]`。这说明本轮交付已包含可用的独立算法，也仍存在小幅数值差异。**没有宣称 bit-exact 或完整产品对标完成。**

可选对照脚本默认容差是 RGB MAE ≤0.25、单通道最大误差 ≤8、Alpha 完全一致；这是一组回归标准，不是“恢复了全部原生行为”的证明。

本机证据与已编译程序位于：

```text
/Users/peter/Downloads/QCut-Independent-Soft-Glow-2026-09-06/
  build/soft-glow
  build/libsoftglow.a
  build-sanitize/
  private-lut/reference-map2.rgba
  oracle/manifest.json
  cpp-verification/metrics.json
```

```sh
python3 verify_reference.py \
  --executable /Users/peter/Downloads/QCut-Independent-Soft-Glow-2026-09-06/build/soft-glow \
  --evidence /Users/peter/Downloads/QCut-Independent-Soft-Glow-2026-09-06
```

真实视频的持续处理、重复与乱序验证见 [帧流报告](stream.zh.md)；UI强度快照证据见 [双模式报告](intensity-modes.zh.md)。这些结果各有输入、编码与采样范围，不能把上述旧CGL的误差表当作当前编辑器视频逐帧一致性结论。透明图像整链原生对齐、HDR、全部事件宿主依赖和跨平台等价仍未覆盖。Gaussian极小工作尺寸保底为1；SGlow工作高度取整为0时拒绝输入，两者均为独立实现边界，未经原生验证。Gaussian非零空间抖动、任意图层3D变换及matte均不在该固定场景范围。

源码没有携带供应商二进制、Shader、Lua、模型或 LUT；私有 LUT 仅用于本机实测。
