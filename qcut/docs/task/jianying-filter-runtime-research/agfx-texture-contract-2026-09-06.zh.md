# libAGFX：纹理格式、采样器与提交同步

日期：2026-09-06。分支：`timeline-fixed-prfix`。本轮只新增研究代码和文档。

本轮对已安装剪映 11.3.0 的 ARM64 `libAGFX.dylib` 做了定点反汇编，并用固定二进制身份的隔离进程调用格式转换函数。已确认 **AGFX 格式 43 对应 Metal `RGBA8Unorm`，格式 127 在该转换入口不受支持**。同时恢复了采样模式映射，并确认 `commitCommandBuffer(true)` 等待的是调度，不能替代 GPU 完成等待。

这些结果是后续独立滤镜实现的底层约束，不等于已经捕获电影柔光每一个实际 GPU Pass，也不代表其独立实现已完成。

## 版本与证据

| 项目 | 本轮实测 |
| --- | --- |
| 原始文件 | `/Applications/VideoFusion-macOS.app/Contents/Frameworks/libAGFX.dylib` |
| 应用版本 | `11.3.0` |
| 原始文件字节数 | `19657776` |
| Universal 文件 SHA-256 | `4fa8758d914743dc682f8f1f9e667f1cc0b429cd2bd7437a25cdec7d4d7489aa` |
| ARM64 UUID | `408EB610-AD47-3846-9595-14B6A3ABF537` |
| x86_64 UUID | `C0E3BB80-FD35-39AA-87FD-BE8564763E4F`，未分析该切片 |
| 实测 GPU | Apple M4 Pro |
| 私有证据根目录 | `/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/agfx/` |
| 自有探针源码 | [`agfx-format-probe.mm`](../../../research/jianying-runtime-probe/agfx-format-probe.mm) |

地址均为 ARM64 切片中的静态虚拟地址。运行时按加载基址加偏移定位，先核验文件 SHA-256，再核验实际加载镜像的 SHA-256、架构和 UUID。未知版本拒绝运行。

原始库薄片、符号表、反汇编和诊断输出均留在仓库外。本轮没有修改应用、打开草稿或附加正在运行的剪映进程；动态验证只发生在新建的诊断进程中。

## 1. 恢复真正的 Metal 格式转换函数

`RendererMetalV2::createTexture(tex_create_info const*)` 在 `0x906bc–0x916c4`。其 `0x909e0` 读取创建参数中的格式；`0x909f0` 或 `0x90a3c` 调用 `0x8b6e4`；成功后在 `0x90a4c` 调用 Objective-C `setPixelFormat:`。

`0x8b6e4` 没有独立可读符号名。`LC_FUNCTION_STARTS` 确认它是独立函数，范围为 `0x8b6e4–0x8bd24`。反汇编器显示的 `RendererMetalV2::readImage + offset` 只是最近符号标签，不能据此把它当成 readImage 的中间指令随意调用。

通过入口、调用实参和返回块，恢复出本构建的诊断调用协议：输入是 32 位格式数值及一个 64 位输出槽的指针；返回值表示是否支持。它没有隐含 renderer 指针。成功分支在 `0x8bd0c` 写入 64 位 Metal 格式；失败分支保持输出槽不变。

证据：`metal-create.txt`、`metal-format-convert.txt`、`function-starts.txt`、`objc-selectors.json`。证据等级为 `static-strong`，以下七项另有实际函数调用验证。

## 2. 七个实际调用用例

探针对四个有效格式调用原生转换器，然后用返回值在 Apple Metal API 中分配 4×3 纹理，检查纹理实际格式。另测一个枚举空洞及两个边界值，并确认失败时输出哨兵值未被改写。

| AGFX 输入 | 转换结果 | Metal SDK 名称 | 本轮验证 |
| --- | --- | --- | --- |
| `43` | `70` | `RGBA8Unorm` | 原生转换成功，Apple 纹理创建成功 |
| `50` | `80` | `BGRA8Unorm` | 原生转换成功，Apple 纹理创建成功 |
| `97` | `110` | `RGBA16Unorm` | 原生转换成功，Apple 纹理创建成功 |
| `128` | `92` | `RG11B10Float` | 原生转换成功，Apple 纹理创建成功 |
| `127` | 不支持 | 无输出 | 返回 false，输出槽不变 |
| `0` | 不支持 | 无输出 | 返回 false，输出槽不变 |
| `206` | 不支持 | 无输出 | 返回 false，输出槽不变 |

名称由本机 Xcode 的 `Metal.framework/Headers/MTLPixelFormat.h` 核对，不按数字相邻关系猜测位深或通道数。

结果文件 `runtime-format-probe.json`：**7/7 通过**。独立进程复跑产生完全相同的 JSON。未知文件 `/usr/bin/true` 在 SHA 检查阶段拒绝；相对路径及缺少参数均返回非零。四项驱动检查记录于 `verification.json`。

这个实验验证了原生转换函数及 Apple 纹理分配，**没有通过 AGFX 创建纹理，也没有向纹理写入或渲染像素**。不能把 `appleTextureCreated=true` 写成滤镜渲染通过。

### 关于格式 127 的修正

第二批复杂滤镜记录提到过尚未解释的 `127`。本轮没有证明那个字段与 `AMGPixelFormat` 属于同一枚举；只能确认把 `127` 直接传给此 Metal 转换器会失败。它可能需要其他层的转换，也可能来自另一种字段，现阶段不能命名为 RGBA8、浮点格式或默认格式。

针对电影柔光的精确包，另一路只读检查了 40 份序列化文件：未发现格式字段值 127，13 份 `.rt` 的 `internalFormat` 均为 **43**。这张卡应以实际字段为依据。详见[单卡案例](soft-glow-agfx-case-2026-09-06.zh.md)。

因此，目前有“资源声明 43”和“当前 AGFX 的 43 转为 RGBA8Unorm”两项证据；尚缺真实运行中逐个 render target 的描述符采样，不能把每个 Pass 的实际资源分配也当作已经观测。

## 3. 采样器：独立保存放大、缩小和三个方向

函数 `RendererMetalV2::setTexFilterWrapMode` 位于 `0x8e0c4–0x8e1fc`。它保存传入的六项枚举，建立 `MTLSamplerDescriptor`，逐项设置状态，再调用 `newSamplerStateWithDescriptor:`。

通过指令访问的映射表与 Objective-C selector 地址交叉核对，得到：

| 参数 | 源枚举值 | Metal 行为 |
| --- | --- | --- |
| 放大／缩小 filter | `0 / 1` | nearest / linear |
| mip filter | `0 / 1 / 2` | not mipmapped / nearest / linear |
| S、T、R wrap | `0 / 1 / 2 / 3` | repeat / clamp-to-edge / clamp-to-border-color / mirror-repeat |

放大模式在 `0x8e13c` 设置，缩小模式在 `0x8e14c` 设置，mip 在 `0x8e164` 设置，S/T/R 在 `0x8e17c / 0x8e18c / 0x8e19c` 分别设置。随后设置 max anisotropy。

Metal 名称另外对照本机 SDK 的 `MTLSampler.h`：wrap 源值 2 映射到 Metal 值 5，是 clamp-to-border-color；Metal 的 clamp-to-zero 是 4，不能混淆。这解释了 QCut 已有探针中的 `filter=1`、`wrap=1`：在此版本分别是 linear、clamp-to-edge。它不证明任意包都选这两个值，也不证明 shader 内部没有自己修正 UV、执行边界逻辑或组合多次采样。

尤其不能把“图像都是 linear”当作所有 Pass 使用同一采样尺寸的证据。源纹理尺寸、目标尺寸、shader 的 texel-size uniform、半 texel 坐标，以及 wrap 需分别记录。

本节是 `static-strong`，未运行 AGFX sampler 创建接口。只读提取结果和 selector 名称记录在 `static-contract.json`、`objc-selectors.json`。

## 4. 提交、调度、完成是不同边界

| 函数 | 位置 | 已恢复行为 |
| --- | --- | --- |
| `MTL::ContextMetal::commitCommandBuffer(bool)` | `0x7fd80–0x7fe70` | 提交当前 command buffer；bool 为 true 时进一步等待调度 |
| `RendererMetalV2::finish()` | `0x922a8–0x922e8` | 从其 queue 创建 command buffer，commit 后调用完成等待 |
| `RendererMetalV2::syncState()` 及若干同族状态入口 | 从 `0x922e8` 开始 | 本构建中对应函数体直接返回 |

关键 selector 通过 Mach-O 地址解析确认：

- `0x7fe0c` → `commit`。
- `0x7fe18` → **`waitUntilScheduled`**。
- `0x922d4` → **`waitUntilCompleted`**。

不能因为接口名带 commit 或 sync，就推断 CPU 已能安全读取最终像素。对 QCut 独立宿主，GPU 完成同步和错误检查应在明确的读回边界执行；同一 command buffer 内多个按依赖编码的 Pass，不需要因此机械地每个 Pass 都阻塞 CPU。

本轮静态分析没有测量竞态窗口，也没有复现 AGFX 缺同步的缺陷。这里提出的是读回实验应遵守的边界，而非对剪映运行时的故障判断。

## 5. 对独立实现的直接约束

1. 电影柔光当前资源声明对应 RGBA8Unorm。按 Pass 顺序分别分配目标纹理并保存中间图，再比较是否每级发生量化；不能把最终输出改为 8-bit 就视为等价。实际内部动态分配仍需进一步验证。
2. 放大、缩小、mip、wrap 分别传递。缩小链与放大合成链应各自核对采样坐标，不把同名“模糊”当作相同计算。
3. 将 CPU 读回安排在完成同步之后。只等待 scheduled 不能代替 completed。
4. 禁止把没有解释的序列化枚举直接透传给私有 ABI；格式 127 的失败用例保留为反例。
5. 二进制版本必须绑定到每项证据。当前格式探针使用已安装的 AGFX；单卡像素实验使用已有私有 CGL 兼容宿主，两者不是同一条 Metal 运行时 trace。

后续深解scene已纠正旧摘要：电影柔光只有一组SGlow，内部为RG／BA两条模糊支路。多级尺寸、SoftLight 103%缩放、实际绑定LUT和最终混合的独立C++及终点对照已完成，见 [算法语义契约](../../../research/independent-soft-glow/semantic-contract.zh.md)。旧CGL逐目标分配和精确舍入仍未直接观测，不能把终点接近升级为逐Pass原生状态已验证。

## 复现与验证

从仓库根目录运行，自有编译产物放在仓库外：

```sh
JY_EVIDENCE=/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/agfx
JY_FRAMEWORKS=/Applications/VideoFusion-macOS.app/Contents/Frameworks
mkdir -p "$JY_EVIDENCE"
xcrun clang++ -std=c++20 -fobjc-arc -Wall -Wextra -Werror \
  -Wno-deprecated-declarations \
  research/jianying-runtime-probe/agfx-format-probe.mm \
  -framework Foundation -framework Metal \
  -o "$JY_EVIDENCE/agfx-format-probe"
DYLD_LIBRARY_PATH="$JY_FRAMEWORKS" "$JY_EVIDENCE/agfx-format-probe" \
  "$JY_FRAMEWORKS/libAGFX.dylib" > "$JY_EVIDENCE/runtime-format-probe.json"
```

SHA-256 固定的是原始 Universal 文件；不能将剥离后的 ARM64 文件传给动态探针。薄片只用于静态反汇编：

```sh
lipo "$JY_FRAMEWORKS/libAGFX.dylib" -thin arm64 \
  -output "$JY_EVIDENCE/libAGFX.arm64.dylib"
xcrun llvm-objdump -d --demangle \
  --start-address=0x8b6e4 --stop-address=0x8bd24 \
  "$JY_EVIDENCE/libAGFX.arm64.dylib" > "$JY_EVIDENCE/metal-format-convert.txt"
xcrun llvm-objdump --macho --function-starts=addrs \
  "$JY_EVIDENCE/libAGFX.arm64.dylib" > "$JY_EVIDENCE/function-starts.txt"
python3 "$JY_EVIDENCE/extract-contract.py"
```

定点反汇编不带 `--macho` 或 `--arch`；这些选项在本机可能忽略 start/stop 限制。用 `LC_FUNCTION_STARTS` 划出隐藏函数边界，用只读 Mach-O 地址解析验证 selector，而非凭最近符号标签命名。

验证范围：源码以 warnings-as-errors 编译成功；7 个格式契约用例通过；重复输出及 3 个拒绝用例通过；独立复核了跳转表与 64 位写回协议。没有构建 QCut 安装包、修改现有滤镜、运行全仓回归或执行新的剪映 UI 导出。
