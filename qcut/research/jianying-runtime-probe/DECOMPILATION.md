# Jianying Transition Decompilation Notes

更新日期：2026-08-04

本文记录对本机剪映专业版 `11.1.12975` 转场运行时和资源包的互操作性研究。目标是理解格式、时间函数和渲染算法，为 QCut 的独立实现提供证据；本文和仓库都不包含剪映二进制、shader、脚本、图片序列或其他专有资源。

## 结论

这次工作已经超过“看效果猜实现”的阶段：

- 从 `libcccreator.dylib` ARM64 指令中定位并还原了 `%SerializedFormat%@` 的读取和写入路径。
- 恢复了 v1/v2 文件头、对象目录、字段编码、引用类型和 `djb2` 名称哈希。
- 对缓存中的 2,024 个真实容器文件进行交叉验证，2,022 个可完整结构化解码。
- 恢复了 `.seq` 的 `AnimSeq -> ImageAtlas -> ImageFrame -> PNG URI` 对象图。
- 恢复了 `.xshader` 的 shader、pass、目标 API、宏、sourcePath 和引用关系。
- 从可读 Lua、JavaScript 和 GLSL 中还原了 13 个代表性转场的时间函数和渲染步骤。
- 使用私有运行时探针与剪映导出逐帧比较，13/13 转场通过 RGB RMSE `<= 8` 的门槛。
- 确认 87 个 `.ausl` 使用统一的 12 字节头和 16 字节块对齐载荷，但尚未证明具体密码算法、模式或密钥。

因此，“转场如何工作”对这 13 个样本已经基本清楚；仍未完成的是把所有私有 shader cache 解密，以及把这些算法改写成可发布的 QCut 自有 GPU 实现。

## 证据等级

本文区分四类证据：

| 等级 | 含义 |
| --- | --- |
| A | ARM64 指令、文件边界和大量真实文件共同确认 |
| B | 包内可读 Lua、JavaScript、GLSL 或序列元数据直接确认 |
| C | 私有运行时渲染与剪映导出逐帧差分确认 |
| D | 根据结构和统计推断，尚未找到直接解码或符号证据 |

格式表和名称哈希属于 A；具体转场公式主要属于 B，并由 C 验证；`.ausl` 的“块密码”判断目前只到 D。

## ARM64 反编译

目标二进制：

```text
.local/jianying-runtime/Frameworks/libcccreator.dylib
```

关键位置：

| 地址 | 作用 |
| --- | --- |
| `0x005ddb50` | 读取二进制 serialized file，校验 magic 并建立记录索引 |
| `0x005dde4c` | 写入 magic、版本、记录数和扩展目录长度 |
| `0x005ddeec` | 顺序写入每个 12 字节目录项和连续 payload |
| `0x005de484` | 按 local ID、类型和 payload 范围构造对象 |

二进制内保留了源文件字符串 `AmazingEngine/Core/Framework/RTTI/AMGSerializedFile.cpp`，但相关函数名已经被裁剪。根据指令流恢复出的读取逻辑是：

```text
read 20-byte magic
if magic != "%SerializedFormat%@\n": fail

version = read_u32_le()
record_count = read_u32_le()
additional_directory_bytes = read_u32_le()
skip 32 bytes

payload_offset = 0x40 + record_count * 12 + additional_directory_bytes
repeat record_count times:
    local_id = read_u32_le()
    type_hash = read_u32_le()
    byte_length = read_u32_le()
    index(local_id, type_hash, payload_offset, byte_length)
    payload_offset += byte_length
```

写入路径执行完全对称的操作。真实文件中所有目录长度之和严格等于文件长度，没有未归属尾部数据。

## `%SerializedFormat%@`

### 文件头

| 偏移 | 长度 | 字段 |
| --- | ---: | --- |
| `0x00` | 20 | `%SerializedFormat%@\n` |
| `0x14` | 4 | little-endian version，已观察 `1` 和 `2` |
| `0x18` | 4 | record count |
| `0x1c` | 4 | additional directory bytes，样本中为 `0` |
| `0x20` | 32 | 保留区域 |
| `0x40` | `12 * count` | record directory |
| 目录后 | 可变 | 连续 payload |

每个目录项是：

```text
u32 local_id
u32 type_hash
u32 payload_byte_length
```

v2 对象字段是 `field_hash + field_byte_length + typed_value`；v1 对象字段不保存 `field_byte_length`，只能依赖 typed value 自身长度继续读取。

### 名称哈希

类型名和字段名使用 32 位 `djb2`：

```text
hash = 5381
for byte in UTF-8(name):
    hash = (hash * 33 + byte) mod 2^32
```

已验证的例子：

| 名称 | 哈希 |
| --- | --- |
| `name` | `0x7c9b0c46` |
| `String` | `0xd1ee9bdc` |
| `XShader` | `0x42f187f4` |
| `AnimSeq` | `0x9789c053` |
| `ImageAtlas` | `0x63c02e9d` |
| `ImageFrame` | `0x64196313` |

`inspect-serialized.ts` 可以从本机 dylib 的 printable string table 中反查未知哈希；哈希碰撞时会保留全部候选，而不是任意选择一个。

### Typed value

每个值以 `u32 type_hash + u32 wire_tag` 开始。当前缓存实际用到并已恢复的编码包括：

| tag | 已确认类型 | payload |
| ---: | --- | --- |
| `0` | `String` | `u32 length + UTF-8 bytes` |
| `1` | enum / Int32 | `i32` |
| `2` | RTTI object | `u32 field_count + fields` |
| `3` | `Int64` | `i64` |
| `4` | `Bool` | one byte |
| `5` | `Double` | IEEE-754 f64 |
| `6` | `Vector2f` | 2 x f32 |
| `7` | `Vector3f` | 3 x f32 |
| `8` | `Vector4f` | 4 x f32 |
| `12` | `Rect` | 4 x f32 |
| `13` | color-like vector | 4 x f32 |
| `31` | `StringVector` | count, then repeated `u32 length + bytes` |
| `32` | `LocalRef` | target local ID |
| `33` | `ExternalRef` | version, target type/tag, URI, target local ID |
| `34` | `Vector` | count, then typed values |
| `35` | `Map` | count, then `u16 key length + key + typed value` |
| `36` | `Guid` | 16 raw bytes |

真实缓存扫描结果：

- 扩展名为 `.seq` 或 `.xshader` 的文件：2,068。
- 实际使用 `%SerializedFormat%@` magic 的文件：2,024。
- 完整解码：2,022，累计 9,691 个 record payload。
- 两个失败文件具有相同的旧 shader 内容，其字段声明长度会在第二个 `LocalRef` 中间结束，属于源文件自身不一致。
- 其余 44 个同扩展名文件使用别的文本或二进制格式，并非解析器漏识别。

## `.seq` 恢复

`前后对比 II` 的两个序列文件各包含 71 条记录：

```text
1 x AnimSeq
70 x ImageAtlas
```

`AnimSeq` 恢复出的主要字段：

- `name`
- `guid`
- `assettype`
- `assetfilename`
- `fps = 60`
- `lazyload`
- `cache`
- `atlases`: 70 个 `LocalRef`
- `memoryLimit`
- `preload`
- `indexAction`
- `preloadCount`

每个 `ImageAtlas` 包含：

- `name` 和 `guid`
- 一个 `ImageFrame`
- `uri`，例如 `seq/guangtiao/guangtiao_000.png`

`ImageFrame` 包含 `rotate`、`trimed`、`outerRect` 和 `innerRect`。当前样本每张 PNG 自成 atlas，矩形为 `[1, 1, 0, 0]`。

转场脚本以 `time * 65 / 60` seek 两个 70 帧序列：

- `mengban1` 是左右推进的羽化遮罩。
- `guangtiao` 是叠加的亮条序列。
- 第一遍用遮罩执行 `mix(B, A, mask)`。
- 第二遍将亮条按 alpha 覆盖到结果上。

这里的转场“算法”主要存在于 140 张带 alpha 的 PNG 像素中，`.seq` 只是对象图和 URI 索引。

## `.xshader` 恢复

以 `横移模糊` 的 `motion.xshader` 为例，完整对象图是：

```text
1 x XShader
4 x Shader
1 x KeywordProgramProfile
```

恢复出的字段包括：

- `properties`
- `renderQueue`
- `passes`
- `type`
- `sourcePath`
- `macros`
- `keywordSets`
- `targetApis`
- `stagets`（资源中的原始拼写）
- `shaderSnippets`

四个 `Shader` 分别指向 GLES vertex/fragment 和 Metal vertex/fragment 的 source path。对这些转场来说，算法可以从包内可读 GLSL 和 Lua 恢复；`.ausl` 只是预编译缓存，不是理解算法的唯一入口。

## 通用时间系统

三个现代 ThreeJS 转场使用相同的 2 秒内部时间壳：

```text
q = clamp((p - 0.15) / 0.70, 0, 1)
r = clamp((q - 0.10) / 0.80, 0, 1)
```

`p` 是宿主转场进度；前后各 15% 保持端点，中间 70% 推动动画。shader 又在 10% 和 90% 之间做一次端点保护。

`淡入淡出` 使用另一条 2 秒曲线：

```text
q = clamp((2000 * p - 150) / 1700, 0, 1)
ease = 0.5 * (1 - cos(pi * q))
```

旧 `SadGE.lua` 转场直接把 `Amaz.Input.frameTimestamp` 绑定到 shader progress。

## 代表性转场算法

### 叠化

```text
output = (1 - p) * A + p * B
alpha = 1
```

### 左移和右移

时间函数是 quintic ease-in-out：

```text
e(p) = 16p^5                     p < 0.5
e(p) = 1 + 16(p - 1)^5          p >= 0.5
```

shader 给 x 坐标加上带方向的 `e`，再取 `fract`。原始坐标仍在画面范围内时采样 A，越界环绕区域采样 B。资源内部方向值为：

- `右移`: `(-1, 0)`
- `左移`: `(1, 0)`

### 翻页

这是斜向圆柱 page curl，不是普通 2D warp：

```text
amount = 1.66 * p - 0.16
radius = 1 / (2 * pi)
cylinder_angle = 2 * pi * amount
page_plane_rotation = 100 degrees
```

shader 将页面映射到圆柱面，区分正面、背面和透视穿透区域；背面转为灰色纸张，并添加卷页阴影。边缘抗锯齿使用距离尺度 `512` 和 sharpness `3`。

### 淡入淡出

使用上面的正弦 ease，同时插值混合比例、alpha、亮度和 blur。模糊核是 3 x 3：

```text
corners = 0.0625
edges = 0.125
center = 0.25
```

### 叠化拉近

- A scale: `1.0 -> 0.5`
- B scale: `1.5 -> 1.0`
- A radial blur amount: `0 -> 0.3`
- B radial blur amount: `0.3 -> 0`
- 每路 10 个径向样本，坐标先按宽高比校正。
- 最后按 `r` 混合两路。

每个 blur 样本沿 `center -> uv` 方向按 `1 - sampleProgress * blurAmount` 收缩。

### 推镜虚化

- blur center 是 `(0.5, 0.7)`。
- A scale 为 `1 + 0.3r`。
- B scale 为 `1 + 0.3(1-r)`。
- blur radius 上限为 `35`，UV step 是 `radius / 1000`。
- 五点十字核：中心 `0.5`，上下左右各 `0.125`。
- 最后按 `r` 混合 A/B。

### 雾化交叠

混合使用 quadratic ease-in-out，模糊包络是：

```text
intensity = 4r(1-r)
```

每路使用 20 个带抖动的径向样本。随机项来自：

```text
fract(sin(dot(uv, [12.9898, 78.233])) * 43758.5453)
```

offset 强度为 `0.3 * 0.5 * intensity`，样本权重从 `1` 线性降到 `0.5`。shader 中还有一个计算后未使用的局部 `offset`，实际采样直接使用缩放后的 `center -> uv` 向量。

### 横移模糊

内部关键帧范围是 19..43；A/B 在第 32 帧切换，所以切换进度是 `13/24`。渲染目标扩到 `1.6W x 1.1H`，避免位移和模糊露边。

位置关键帧：

| 层 | 帧 | x |
| --- | --- | ---: |
| A | 19 -> 24 | `360 -> 395` |
| A | 24 -> 27 | `395 -> 360` |
| A | 27 -> 31 | `360 -> -219.12250325` |
| B | 32 -> 39 | `927.87749675 -> 360` |

每段使用包内给定的 cubic bezier handles。两路 blur 的原始峰值分别为 `100` 和 `5`，运行时再乘 `0.5 * 0.7 = 0.35`。曝光在 21..32 帧从 `0 -> 0.5`，在 32..43 帧回到 `0`。

motion shader 对两路纹理执行变换，主纹理 mirror-repeat，副纹理 clamp-transparent，再按 alpha 将副纹理合成到主纹理。ScaleWipe shader 通过求解 `y = x + stretch*x^2` 的二次方程产生单侧拉伸。

### 前后对比

基础 wipe：

```text
base = mix(A, B, step(uv.x, progress))
```

边界叠加一条白色羽化线：

```text
half_width = 0.002 * min(width, height) / width
fade_width = 0.003 * min(width, height) / width
```

progress 不是线性值，而来自 AE 曲线。主要 x 关键帧为：

| 帧 | x | 归一化 |
| ---: | ---: | ---: |
| 14 | `-240` | `/1080` |
| 23 | `483.231150853021` | `/1080` |
| 37 | `560.172091468979` | `/1080` |
| 46 | `1275` | `/1080` |

### 立方旋转

两路输入都渲染为 `Lumi3DShape`：

- mesh type `3`
- 3 x 3 x 3 网格
- 每轴 resolution `30`
- back-face culling
- FOV `60.5`
- 基准 z `-4.37`

Y 旋转从 `0 -> -90`，时间范围 `.133333 -> .633333`，bezier handles 为 `(.66830899, .008496309)` 和 `(.078329249, .99530264)`。两路同时改变 z、曝光和对比度，以隐藏几何交接并维持视觉亮度。

### 拍立得

这是 AE/Lumi 组合图，不是一个单 shader：

- A 在 `.266667 -> .3` 将 fps 从 `30` 降到 `.01`，形成冻结帧。
- A 同时降低饱和度、提高对比度、加 vignette，并进入旧照片框构图。
- 主 3D motion blur 使用 10 个样本，强度 `.66`，FOV `39.6`。
- B 经 round-corner、brightness、Gaussian blur 和 deep-glow 后成为新照片。
- B 的 corner radius `22 -> 0`，brightness `-.66 -> 0`，blur `15 -> 0`。
- deep glow exposure 执行 `0 -> 1.3 -> 0` 的脉冲。

主要 3D 位置轨迹：

```text
(0.5, 0.5, 0)
-> (0.5, 0.5, -0.25)
-> (0.5, 0.6527778, 1.5972222)
-> hold
-> (-1.4981, -0.225, 1.0931)
-> (-4.0676, -1.3118, 0.31875)
```

X/Y/Z 旋转分别走到约 `-85 / 26.5 / 85` 度。AETools 还为 motion blur 生成提前一帧的 `pre` 轨道。

## AE 曲线求值器

包内 `AETools.lua` 的关键行为已经转换为 `recovered-transition-math.ts`：

- temporal cubic 的 x 控制点是 `[0, c1.x, c2.x, 1]`。
- 用二分搜索求参数 t，epsilon `.001`，最多 50 次。
- y 控制点是 `[0, c1.y, c2.y, end-start]`。
- hold 标记为 `info[5][1] == 2` 时直接返回起点。
- spatial cubic 先取 200 个样本估算弧长，再把 eased progress 映射到等距离参数。
- 6413/6414/6415/6416/6417 分别对应 3D spatial、3D、2D spatial、2D 和 scalar 属性。
- 某些 `end-start == 0` 的元数据分支会返回 `start + x`，而不是普通 lerp。

## 运行时差分验证

私有运行时探针不启动剪映 UI，直接创建 AGFX device、SwingManager、VideoSegment 和 TransitionSegment，并将两段视频输入真实转场包。

统一验证条件：

- 剪映导出和探针使用相同输入、转场时长、切点和 engine render size。
- 比较前统一到 1280 x 720、30 fps、BT.709。
- 每个转场比较 5 个关键进度和完整转场区间。
- 使用 decoded RGB，而不是 MP4 文件字节比较。

13 个转场全部通过：

- 最差五点 RMSE：`4.750855`
- 最差完整区间 RGB RMSE：`3.836548`
- 最低完整区间平均 PSNR：`36.45199 dB`
- 最低单帧 PSNR：`34.595369 dB`
- 最低 SSIM：`0.996470`

这证明已恢复的宿主时间、输入保持策略、engine resolution 和私有运行时调用关系与剪映基本一致。它并不代表 QCut 已经拥有可发布的独立实现。

## `.ausl`

缓存中 87/87 个 `.ausl` 都满足：

| 偏移 | 字段 |
| --- | --- |
| `0x00` | `ASLE` |
| `0x04` | `u32 reserved = 0` |
| `0x08` | `u32 decoded_byte_length` |
| `0x0c` | 高熵、16 字节块对齐载荷 |

文件长度恒等式：

```text
file_size = 12 + ceil(decoded_byte_length / 16) * 16
```

87 个路径对应 43 个唯一文件内容；相同 shader 的 `.ausl` 在不同资源包中可以逐字节相同，说明封装是确定性的。43 个不同文件之间没有复用相同的 16 字节 ciphertext block。

目前只能确认“固定头 + 块对齐高熵载荷”。它很像块密码封装，但没有找到足以证明 AES、ECB/CBC 模式、IV 或 key 的直接调用路径，因此工具将载荷命名为 `ciphertext`，报告不把推断写成事实。

对本轮 13 个转场来说，`.ausl` 不是理解算法的阻塞点，因为对应的 Lua、JavaScript、GLSL、`.xshader` source path 和运行时输出都可用。

## `graph.dat`

当前只找到两个相关样本，大小分别为 12,350 和 16,930 字节，熵约 `7.945 bits/byte`，共享 16 字节前缀。常见压缩格式和 `%SerializedFormat%@` 均不匹配。

`拍立得` 的 Lua、JSON、scene 和 shader 引用中没有运行时读取 `graph.dat`；完整效果图已经由 `LumiExportData.lua` 描述并成功渲染。因此它可能是编辑器、导出器或其他版本的辅助图数据，而不是当前运行时的必需算法载荷。

## 工具

解码 serialized container：

```bash
bun research/jianying-runtime-probe/inspect-serialized.ts \
  --dictionary-binary .local/jianying-runtime/Frameworks/libcccreator.dylib \
  --summary /path/to/file.seq /path/to/file.xshader
```

去掉 `--summary` 会输出完整对象树。

检查 AUSL 封装：

```bash
bun research/jianying-runtime-probe/inspect-ausl.ts /path/to/file.ausl
```

运行纯合成测试：

```bash
bun test \
  research/jianying-runtime-probe/ausl-container.test.ts \
  research/jianying-runtime-probe/serialized-container.test.ts \
  research/jianying-runtime-probe/serialized-value.test.ts \
  research/jianying-runtime-probe/serialized-name-dictionary.test.ts \
  research/jianying-runtime-probe/recovered-transition-math.test.ts
```

所有测试只使用本仓库生成的合成字节，不包含剪映 fixture。

## 对 QCut 的长期建议

可复用的自有实现应按渲染原语拆分：

1. progress remap、hold、cubic easing 和 AE spatial evaluator。
2. dissolve、wipe、slide、page curl 和 radial blur shader。
3. 通用纹理平面、透视相机、网格变形和 3D motion blur。
4. alpha matte sequence 和 overlay sequence 合成器。
5. 对每个转场保存自有参数 preset，而不是依赖剪映包或私有 dylib。
6. 为每个原语建立 CPU 数学测试、GPU golden-frame 测试和跨分辨率 E2E。

私有运行时探针适合研究和回归证据，不应成为 QCut 产品依赖。最稳妥的交付路径是使用本报告的公式和行为约束做 clean-room 实现，再用用户自有的剪映导出做视觉对照。

## 未解决问题

- `.ausl` 的确切密码算法、模式和 key schedule。
- 两个结构损坏旧 `.xshader` 的引擎容错方式。
- `立方旋转` 在所有边缘时刻的 exact depth/blend ordering。
- `graph.dat` 的生成器和非运行时用途。
- 929 个转场版本中尚未逐个分类和参数化的长尾资源。
- 私有运行时跨剪映版本的 ABI 稳定性。

这些问题不会推翻已经恢复的 13 个算法和容器格式，但决定了后续能否做到全目录自动迁移。
