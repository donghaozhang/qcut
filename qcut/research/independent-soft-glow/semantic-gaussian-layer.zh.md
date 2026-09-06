# Gaussian 与 Layer 的还原语义

日期：2026-09-06。固定资源：电影柔光 `7447126702137904420 / 9673f80b8e2f5a07f02f9ce1130b784a`。

本文把包内实际实例配置、Lua 参数计算、Shader 运算和自有 C++ 实现分开核对。公式为原创数学整理；第三方 Shader、Lua 和完整序列化对象不放进仓库。本文新增的是只读语义审计，不包含新的 GPU 中间帧测量。

结论：当前 C++ 覆盖这张卡采用的双轴 Gaussian、居中 103% 的 Precomp SoftLight 和 64% Adjustment Normal。每次纹理写入的 RGBA8 量化、普通 camera 缩放的双线性实现，以及完整透视几何的居中化简仍须与“已直接观测的原生 GPU 行为”区别记录。

## 固定实例与节点连接

`AmazingFeature/main.scene` 是二进制序列化文件，没有文本行号。对应 `Scene` 记录 `localId=1`，记录起点 `payloadOffset=592`、长度 `24797` 字节。以下 `entities` 下标为解码后的零基下标；属性位于该实体的 `components[1].properties`。

| 实例位置 | 配置与连接 | 当前 C++ |
| --- | --- | --- |
| `entities[2]`，`LumiGaussianBlur_301-effect0` | 输入原图，输出 `rt/outputTex.rt`；intensity=70，quality=0.2，双轴 strength=1，direction=双轴，border=Normal，inverseGammaCorrection=true，blurAlpha=true，spaceDither=0 | `GaussianParams{}` 的实际卡默认值；[gaussian.cpp](gaussian.cpp) |
| `entities[9]`，`LumiLayer_301-trs-blend` | source=Gaussian 输出，base=原图，输出 `LumiTempRT0`；SoftLight，Precomp，opacity=70，scale=103/103/100，hasTransform=true，hasMatte=false，mirrorEdge=false | `LayerBlend::soft_light`、`LayerType::precomp`、opacity=0.7、scale_x/y=1.03；[layer.cpp](layer.cpp) |
| `entities[34]`，`LumiLayer_278-trs-blend` | source=`LumiTempRT2`，base=`LumiTempRT0`，输出 `outputTex`；Normal，Adjustment，opacity=64，scale=100，hasTransform=true，hasMatte=false | `LayerBlend::normal`、`LayerType::adjustment`、opacity=0.64、scale=1 |

两个 Layer 实例的 `srcDuration` 和 `baseDuration` 都为 `[0,5]`。本文只讨论 source/base 都有效时的运算，不将 C++ 的静态图扩展为通用的时间区间、可见性或 matte 调度器。完整 pipeline 中的 source、base 区别由 [pipeline.cpp](pipeline.cpp) 显式传递，最终 Normal 的 base 是 SoftLight 的结果，而不是原图。

Gaussian 的 70 是算子自身 `0..1000` 的尺度参数，不是外层滤镜 70%。quality=0.2 是采样预算控制，也不意味着整张图固定缩到 20%。Layer Lua 的 opacity/scale 使用百分数，C++ 使用比例值；对应转换为 `70→0.7`、`64→0.64`、`103→1.03`。

## Gaussian 的参数计算

以下公式对应证据 G1 的第 29–40、66–107、212–248 行。令输出尺寸为 `W×H`，`I=clamp(intensity,0,1000)`，`h/v=clamp(axisStrength,0,1)`，`q=clamp(quality,0,1)`。

先选择工作纹理比例 `s` 与未乘质量系数的采样预算 `n`：

| I 的区间 | s | n |
| --- | ---: | --- |
| `0≤I≤30` | `1/2` | `(0.5I+2)×0.78` |
| `30<I≤100` | `1/2` | `(0.5I+10)×0.66` |
| `100<I≤200` | `1/4` | `(0.25I+50)×0.7` |
| `200<I≤1000` | `1/8` | `(0.125I+80)×0.8` |

仅当 `n<2` 时，将 `n` 替换为 `floor(n+0.5)`。不能在乘 quality 后重新套这个四舍五入规则。

令 `t=2q−1`，质量乘数为 `k=10^t`（`t<0`），否则为 `k=2t+1`。它在 `q=0.5` 时等于 1；`q=0.2` 时约为 `0.25118864`。

用于纵横比归一化的长度为：

```text
B = max(min(W,H), max(W,H)/2)
Rx = (B/W) × I × h / 1000
Ry = (B/H) × I × v / 1000
Nx = n × h × k
Ny = n × v × k
sigmaX = Rx / 2.5
sigmaY = Ry / 2.5
dx = Rx / max(Nx, 0.00001)
dy = Ry / max(Ny, 0.00001)
```

`Rx/Ry`、`sigmaX/Y`、`dx/dy` 的单位都是对应方向的**归一化 UV 距离**，不是像素数。1000、2.5、gamma=2.2 来自 G1 第 126–130 行的构造常量；没有 scene 覆盖，不能换成 1080。

方向开关只让未启用轴的有效 intensity/radius 为零，并通过 camera 可见性跳过该轴；`Nx/Ny` 仍由原来的 horizontal/vertical strength 计算。C++ 也保留此区别，而非将两个轴的采样预算都改成零。

在 `320×180`、`I=70`、`q=0.2`、双轴 strength=1 时：

| 参数 | 数值 |
| --- | ---: |
| 工作尺寸 | `160×90` |
| Nx、Ny | 约 `7.46030270` |
| sigmaX、sigmaY | `0.01575`、`0.028` |
| dx、dy | 约 `0.005277936`、`0.009382997` |
| 每轴离中心的正向／反向采样数 | 各 7 次，另加中心 1 次 |

相同宽高比下换成 `1280×720`，上述 UV 参数不变，工作尺寸改为 `640×360`。这不是固定像素半径的高斯模糊。

## Gaussian 的执行顺序、核与 gamma

G1 第 181–209 行设置六个 RT 的宽高；第 250–283 行选择实际路由。双轴路径是：

```text
原图 → 缩小写 Y 工作纹理 → X 模糊写 X 工作纹理
     → Y 模糊写 Y 工作纹理 → 放大写全尺寸输出
```

`main.scene` 的 `entities[3/4/6/8]` 对应 DownScale、X、Y、UpScale camera，序列化 renderOrder 为 1、2、3、4；输入输出关系与 Lua 路由一致。工作纹理按 I 直接选择一组 1/2、1/4 或 1/8，**不是永远依次执行三个降采样层级**。

`I≤0.01` 时跳过 DownScale 和两个 blur camera，UpScale 直接读取输入。仅 horizontal/vertical strength 为零、但 I 仍大于 0.01 时，down/up camera 仍可运行；“核不扩散”不能自动推成“输出逐字节恒等”。

每轴 shader 对当前像素中心先采样一次。对 `j=1..min(1024,floor(Naxis))`，在该轴的正负 `j×d` 处增加采样。权重为：

```text
w0 = 1
wj = exp(−0.5 × (j×d/sigma)^2)
result = 有效样本的加权和 / 有效权重之和
```

G2/G3 第 19–30 行表明：**先执行纹理采样及插值，再对 RGB 做 `pow(value,2.2)`**。这与先把整张纹理线性化再进行双线性采样不等价。每一轴独立在累加后做 `pow(result,1/2.2)`，不是仅在 X 之前转换、Y 之后转换。Alpha 不经过 gamma。

G2/G3 第 146–159 行表明，若 blurAlpha=false，当前轴结果的 Alpha 替换为该轴中心采样的 Alpha。它不恢复 downsample 之前的原图 Alpha；之后的 Upscale 也仍可能插值 Alpha。当前实际配置为 blurAlpha=true。

这是显式幂函数 gamma，不是 sRGB 的分段传递函数。当前 C++ 按同一数学定义执行；其 float 算术、`std::pow/exp`、表达式重排与原生 shader 编译器不保证逐位一致。例如 C++ 先算 `distance/sigma` 再平方，而 shader 的文本表达式先平方再相除；数学等价不等于所有浮点边界位模式一致。

## Gaussian 边界和量化的证据层次

G1 第 51–63 行和 G2/G3 第 78–144 行给出以下 Shader 级规则：

| 算子 borderType | 越界样本对加权和的贡献 | 越界样本对分母的贡献 |
| --- | --- | --- |
| Normal / `renormalize` | 丢弃 | 丢弃 |
| Replicate | 先把该方向 UV 放到 0 或 1，再采样 | 保留权重 |
| Black | 零 | 保留权重 |
| Reflect | 只反射一次：负侧变为 `−u`，正侧变为 `2−u`，再交给 sampler | 保留权重 |

边界比较使用 `<0`、`>1`；UV 恰好为 0 或 1 仍是可采样位置。Reflect 不是无限重复镜像：一次反射后若还在范围外，后续结果取决于纹理 sampler。实际卡的 Gaussian RT 声明 wrap=1，所以 C++ 对反射后的 UV 再执行 clamp。它与 SGlow 中可能存在的 Reflect 参数是分别定义的算子语义。

六份 `downsample*.rt` 的直接解码证据一致：`internalFormat=colorFormat=43`、`filterMin=filterMag=1`、`wrapModeS/T/R=1`、`enableMipmap=false`、`filterMipmap=0`。这些是文件声明。已安装 11.3.0 的 AGFX 定点分析把 43 映射到 RGBA8Unorm、filter=1 映射到 linear、wrap=1 映射到 clamp-to-edge；该映射的实测见[AGFX 纹理契约](../../docs/task/jianying-filter-runtime-research/agfx-texture-contract-2026-09-06.zh.md)。

当前 C++ 选择：

- pixel-center UV 为 `((x+0.5)/W,(y+0.5)/H)`，普通缩小／放大使用双线性插值；
- DownScale、X、Y、UpScale 各次写目标时分别量化为 `round(clamp(c,0,1)×255)/255`；
- 两轴之间存的是经过量化、已做逆 gamma 的结果；
- 禁用 mipmap，不将工作尺寸层级当作 mip 层级。

这些选择把资源声明、算法结构与 endpoint 对照连接起来；**还没有逐 RT 截获旧 D634 CGL provider 的实际格式、camera copy sampler、sRGB 状态或 tie rounding 方式**。特别是 shader 文件本身没有“写回时 round”的语句，量化来自目标格式，不能把 C++ 的 `std::round` 宣称为已反编译出的 GPU 指令。

Lua 把 `W/2、W/4、W/8` 直接赋给纹理宽高，没有显式 floor。C++ 对正尺寸取整数截断，并将小于 1 的结果保底为 1。正常可整除尺寸没有这一歧义；奇数和极小尺寸的取整方式是兼容策略，需要单独验证。

## Layer 的 SoftLight 公式与 Alpha

用 `s` 表示 source 的直通 RGB 通道，`b` 表示 base 的直通 RGB 通道。L1 的 blendMode 名称与 L2 第 704–711 行确认 SoftLight 选择第 7 号分支。L2 第 149–183 行得到：

```text
D(b) = ((16b−12)b+4)b，b<0.25
       sqrt(b)，          b≥0.25

F(s,b) = b − (1−2s)b(1−b)，     s<0.5
         b + (2s−1)(D(b)−b)，  s≥0.5
```

在 b=0.25 两个 D 分支都给出 0.5；在 s=0.5 两侧都给出 b。C++ 将低亮分支里的 `D(b)−b` 合并为 `b((16b−12)b+3)`，因此代码里的常数 3 与上式 D 中的 4 并不冲突。Normal 模式则为 `F(s,b)=s`，不能交换 base/source。

L2 第 608–621 行先将两张纹理的 RGB 分别除以 `max(alpha,0.00001)`；这说明混合函数接收的纹理数据按预乘 Alpha 处理，混合函数内部才使用直通颜色。C++ 使用同一个 Alpha 分母下限。

设输入预乘颜色为 `Cb/Cs`，Alpha 为 `ab/as`。先在需要的位置应用几何和 opacity，再解预乘得到 b/s，计算 F。没有 matte 时，两类 layer 的操作不同。

### Precomp：先衰减 source，再做覆盖合成

L1 第 309–317、344–351 行给 Precomp 设置 `u_alpha=opacity/100`；L2 第 1025–1035 行将该数同时乘入 source 的 RGB 和 Alpha。这张卡 `hasTransform=true` 且 source 有效，所以这次乘法确实属于所分析的分支。

令 `p=0.7`；将 `Cs/as` 同时乘 p 得到新的预乘 source 与 Alpha，再由其计算 s 和 as。结果为：

```text
aout = as + ab(1−as)
Cout = b×ab×(1−as) + s×as×(1−ab) + F(s,b)×as×ab
```

当 base/source 都不透明时，这个式子才简化成 `mix(b,F(s,b),0.7)`。不能把这个简化用于半透明输入后，再宣称实现了相同的 Alpha 协议。

还有一个作用域细节：原 shader 只有在 hasTrs 分支才乘 `u_alpha`。C++ `transform=false` 时也不套 Precomp opacity，这不是普通图层 API 的通用约定，而是该 shader 路径的语义。

### Adjustment：插值混合颜色和 Alpha，再预乘

L1 第 313–315、380–383 行把 Adjustment opacity 写到 `u_layerOpacity`，source 的几何 Alpha 乘数仍为 1。L2 第 981–995 行表示：

```text
aout = mix(ab,as,p)
Cout = mix(b,F(s,b),p) × aout
```

这张卡最后一级是 Normal，`p=0.64`，所以 F=s。此处是直通颜色与 Alpha 分别插值，然后重新预乘；它一般不等于把两张预乘 RGBA 直接做一次线性插值。最终各通道再按输出目标的量化策略保存。

整个独立 pipeline 当前只接受不透明输入；底层 Layer 已按上述公式实现半透明数学，但本次 endpoint 成果不能扩大成透明项目的原生平价。

## 为什么 103% 可以化为居中逆缩放

实际 SoftLight scene 配置为：`compositeSize=layerSize=(1875,2500)`，`position=anchorPoint=(937.5,1250,0)`，各旋转角为 0，scale=(103,103,100)。L1 第 251–260 行的归一化位置和 anchor 位移因此都是 0；第 293–300 行中 layer/composite 比例为 1，所以 XY 缩放为 1.03。

没有 scene 覆盖的 p0/p1 参数来自 L1 构造默认值：parent 的 position/anchor 都是 0，XY scale 都是 100%，旋转都是 0。按照第 263–300 行构造，成对父／子 XY 位移相互抵消，保留由输出宽高比和相机视角建立的中心平面关系。没有额外平移、旋转或透视倾斜需要投到输出平面上。

对这个特定配置，将 L2 第 61–105 行的矩阵与射线求交化简，得到输出 UV 到 source UV 的映射：

```text
us = 0.5 + (u−0.5)/1.03
vs = 0.5 + (v−0.5)/1.03
```

因此，C++ 放大的是 source，也就是 Gaussian 输出；base 原图仍按未变换的输出 UV 取样。103% 不应该变成 Gaussian 的采样半径乘 1.03，也不能同时放大 base 和 source。

L2 第 1025–1035 行另含几何覆盖测试。mirrorEdge=false 时，映射出的 source UV 在 `[0,1]²` 外就返回透明；开启 mirror 时，先按周期 2 折返再做覆盖测试。C++ 使用 double 做逆尺度和折返以避免极小正 scale 导致危险的坐标到整数转换。

这里恢复的是特定场景的数学等价化简。原生仍执行矩阵乘法与带 epsilon 的三角形求交，可能与逆缩放有浮点舍入差异。C++ 没有通用 AE 3D、旋转父级、非中心 anchor、裁切扩张或 matte；不能把这个模块当成完整 LumiLayer 引擎。

## C++ 的主动限制与待验证项

| 实现选择 | 证据性质／限制 |
| --- | --- |
| I、axis strength、quality 的 clamp | Lua 明确如此，属于还原行为 |
| 只支持 spaceDither=0 | 当前实际 Gaussian 配置为 0；原 shader 有随机 UV 扰动，C++ 明确拒绝非零，没有冒充支持 |
| gamma、normalization、radius-over-sigma 的正值／finite 校验 | 自有输入契约；不能推成剪映 UI 或 Lua 的错误处理 |
| reciprocal gamma 溢出、sigma 下溢、tap 距离溢出时拒绝 | 自有数值安全规则；异常参数不作原生兼容承诺 |
| 图片 normalized finite、尺寸上限与像素数限制 | 来自共享 `validate_image`，属于自有资源约束 |
| sigma 和采样预算采用 float；权重数学式做等价重排 | 与 Lua 的 number 到 shader float 过程不保证逐位相同，阈值附近应额外比较 |
| 奇数工作尺寸取整，最小尺寸保底 1 | 只在 C++ 明确定义，原生赋值／分配行为尚缺运行证据 |
| centered scale 支持正有限值，负值／零值拒绝 | 当前卡只需要 1.03 与 1；镜像翻转、退化矩阵不在本轮范围 |
| 两种 Layer mode 与两种 layer type | 只覆盖实际图中所用组合，未宣称复原其他 blendMode |

本轮 [语义契约](semantic-contract.zh.md) 的单因素实验已比较source-only 103%与无缩放、启用inverse gamma与完全关闭。它尚未区分每轴gamma往返与仅整体gamma往返。下一步仍可比较每目标量化与只最终量化、Normal边界重归一化与直接clamp，以及Precomp／Adjustment在半透明样本上的不同Alpha结果。末端接近不能单独证明所有中间假设。

## 证据文件、行号与哈希

以下路径均相对上述固定资源包根目录。文本行号是原文件一基行号；哈希为整个文件 SHA-256。二进制文件没有行号，给出记录定位，避免给二进制伪造文本行范围。

| ID | 包内相对路径 | 相关行／记录 |
| --- | --- | --- |
| G1 | `AmazingFeature/effects/LumiGaussianBlur/lua/ScriptCompGaussianBlur.lua` | `29–40` 纵横比；`51–63` border；`66–107` schedule/quality；`115–130` 默认值；`181–209` 尺寸；`212–248` 参数；`250–283` 路由 |
| G2 | `AmazingFeature/shaders/gaussianBlurX-0-2f94/gles2/26e6.frag` | `19–35` gamma/权重；`44–76` 中心和循环；`78–144` border；`146–159` 归一化/逆 gamma/Alpha |
| G3 | `AmazingFeature/shaders/gaussianBlurY-0-c9ab/gles2/dbaf.frag` | 与 G2 对应的相同行范围；方向改为 Y，非零 dither 的 hash 偏移也不同 |
| L1 | `AmazingFeature/effects/LumiLayer/lua/LumiLayer.lua` | `71–106` 变换默认值；`238–306` 几何；`309–354` opacity/TRS；`372–393` blend/matte |
| L2 | `AmazingFeature/shaders/layer-0-17bc/gles2/0037.frag` | `26–100` 射线/几何；`102–111` 镜像/覆盖；`149–183` SoftLight；`608–621` 解预乘；`704–711` SoftLight 分派；`981–1005` 两类合成；`1008–1056` main |
| S1 | `AmazingFeature/main.scene` | `localId=1`，`payloadOffset=592`，`byteLength=24797`；entities[2/9/34] 属性及 [3/4/6/8] camera |
| R1–R6 | `AmazingFeature/effects/LumiGaussianBlur/rt/downsampleX2.rt`、`downsampleY2.rt`、`downsampleX4.rt`、`downsampleY4.rt`、`downsampleX8.rt`、`downsampleY8.rt` | 各 `localId=1`，`payloadOffset=76`，`byteLength=514`；格式与 sampler 字段 |

| ID | SHA-256 |
| --- | --- |
| G1 | `3e78a5dfbdb315aba064504bada7d81a4339370c88ce6594829ef29d34c4306e` |
| G2 | `44c9b16e34754437997911f28b52bb2e5013e08cae27f0f8edbba2704ad0ec08` |
| G3 | `e29ce68714d322f2caedddba9cab45e4e04f228da584af8273fb26e1d15dc9c7` |
| L1 | `8cd4f968894980d6b8a6b5180e9db71f5a8fc8ae492bac9b75aa69d5e34ecce5` |
| L2 | `046d08e29661630421ed8791452b73cec9460225ce784cf1e3ff462b6b39a9a1` |
| S1 | `09424db1ae0fefdbd459a509db8c04dd4e589db5d7f3ad5586fd86cb5684a7d7` |
| R1：X2 | `899a8c001692162a1ba08d0431da1db6664e1f6368dd9676e99363a1f5282b35` |
| R2：Y2 | `9eb033050e61da8e75bd1cde03be5bc3675ff235ce29f38f82e8cd789e1ca131` |
| R3：X4 | `7de2f5e3d06a8ec88b2d56ffd78f37ff04fb5bd4203f48e1a6f9b666cf4d529f` |
| R4：Y4 | `27818ac23b6b26d1be5b0464b10d828461ebdcfe139190de711cf0674fc3c2e7` |
| R5：X8 | `b7b309617e91f2d3b5c999590a73294c76602e0331714fbafaa6417fb7baa4f0` |
| R6：Y8 | `49bc50fbdc90922bc116e299b6ddba5ed6f349747985f513e5e3bb6bf2d32d35` |

本轮审计的自有源码身份：`gaussian.cpp` SHA-256 `6b9c53e8934015bd7d2c9181c1e0d48eccd1c22f0efb83951553893531551b6b`；`layer.cpp` SHA-256 `2c88f925fabd24ff8037aa137baf98e37b35e62dbe5428d3c2864a691f7911bf`。两者分别在本目录内；后续修改源码时，应同步重新审计相关结论。
