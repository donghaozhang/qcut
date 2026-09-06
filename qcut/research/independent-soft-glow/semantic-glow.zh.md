# SGlow：可独立实现的算法语义

审计日期：2026-09-06。对象为电影柔光资源 `7447126702137904420`、版本 `9673f80b8e2f5a07f02f9ce1130b784a` 中的 **SGlow0**。本文以原始数学表达解释本地脚本、Shader 和资源连接，不包含供应商源码副本。整链约束见 [算法语义契约](/Users/peter/Desktop/code/qcut/qcut/research/independent-soft-glow/semantic-contract.zh.md)。

证据标记：**静态**表示精确包的直接事实；**推导**表示从这些事实恢复的运算；**输出验证**表示固定原生宿主的末端比较；**实现约定**表示独立 CPU 实现选择的输入、采样和舍入边界。本文中的源文件别名与行号均可在文末定位。

## 1. 运算对象、参数与通道

SGlow 的输入是上游 SoftLight 输出 Temp0，输出为 Temp1。实际场景只有一个 SGlow0；ExportData 中另一组 SGlow 参数不等于第二个执行节点。参数来源和节点解析见 [连接证据](/Users/peter/Desktop/code/qcut/qcut/research/independent-soft-glow/graph-evidence.zh.md)。

| 参数 | 当前场景 | Lua 构造默认值 | 单位／作用 |
| --- | ---: | ---: | --- |
| threshold | 0.84 | 0.5 | 归一化颜色阈值 |
| thresholdAddColor | (0,0,0) | (0,0,0) | 各 RGB 阈值的加数 |
| brightness | 2.4 | 2 | 辉光 RGBA 乘数 |
| glowWidth | 0.13 | 0.1 | 工作宽度的比例 |
| widthX / widthY | 0.41 / 0.65 | 1 / 1 | RGB 轴向半径乘数 |
| widthRed / Green / Blue | 1 / 1 / 1 | 1 / 1.2 / 1.4 | RGB 通道半径乘数 |
| quality | 0.2 | 0.2 | 工作宽度及采样预算参数 |
| dither | 1 | 0 | 采样位置扰动强度 |
| glowColor | (1,1,1) | (1,1,1) | 辉光 RGB 乘数，不乘 Alpha |
| sourceOpacity / bgBrightness | 1 / 1 | 1 / 1 | 底图混合与亮度 |
| glowFromAlpha / glowUnderSource / lightBackground | 0 / 0 / 0 | 0 / 0 / 0 | 见 mask 与 blend 公式 |
| edgeMode / combine / show | Reflect / Screen / Result | 相同 | 边界／合成／预览方式 |
| bgTexture | 无 | 无 | 可选背景，当前独立接口不提供 |

构造默认值来自 L:56–83，UI 范围声明来自 L:5–25；它们不能覆盖已序列化的场景值。独立 `GlowParameters` 的默认值对应构造函数，电影柔光管线显式赋入场景参数。

六次逻辑绘制的通道合同如下。`hi/lo` 表示第 4 节定义的两字节编码，不能当作颜色或覆盖率。

| 顺序／目标 | 读取 | 写出 RGBA 的含义 |
| --- | --- | --- |
| Mask → BlurTex2 | Temp0 | 高光 R、高光 G、高光 B、高光 Alpha |
| H1 → BlurTexTmp | 原始 BlurTex2 | R_hi、R_lo、G_hi、G_lo |
| V1 → BlurTex | H1 的 BlurTexTmp | R_hi、R_lo、G_hi、G_lo |
| H2 → BlurTexTmp | **仍未覆盖的原始 BlurTex2** | B_hi、B_lo、A_hi、A_lo |
| V2 → BlurTex2 | H2 的 BlurTexTmp | B_hi、B_lo、A_hi、A_lo |
| Blend → Temp1 | Temp0、BlurTex、BlurTex2 | 结果 R、G、B、Alpha |

两组 H/V 从同一个 mask 出发。V2 最后覆盖 mask 的物理纹理；独立实现可以用不同对象保存这些数据版本。H:116–122 与 HB:116–122 选择不同通道；V/VB:123–134 各自解码到相应通道；B:51–54 把两路重新组为 RGBA。Camera、material 与 RT 的对应关系来自 `main.scene` 和相关资源静态解析。

## 2. 尺寸、半径和像素坐标

设原始输出尺寸为 `W0×H0`。Lua 优先读取已指定 OutputTex 的尺寸，否则使用内建输入尺寸（L:155–165）。当前独立接口要求输入、输出尺寸相同；包本身允许另设 OutputTex。

```text
C = clamp(1200 × quality, 120, 360)
w = min(W0, C)
h = H0 × w / W0
Wb = floor(w), Hb = floor(h)
r = glowWidth × w
K = 10 + floor(100 × quality)

Rx = r × (widthX×widthRed, widthX×widthGreen, widthX×widthBlue, 1)
Ry = r × (widthY×widthRed, widthY×widthGreen, widthY×widthBlue, 1)
Daxis,c = 2 × (Raxis,c / 2.4)²
```

`r` 使用**取整前**的工作宽度；`R`、采样距离及步长的单位都是工作纹理像素。Alpha 的半径始终为 `r`，不乘 widthX、widthY 或 RGB 通道宽度。名为 ColorSigma 的 uniform 实际装入 `D=2σ²`，不是 σ 本身。来源：L:166–218。

当前 320×180 输入得到 240×135；`r=31.2`，RGB 的 Rx=12.792、Ry=20.28，Alpha 的两轴半径均为 31.2，K=30。所有 blur RT 都设为 Wb×Hb；V2 的输出与 mask 输出复用 BlurTex2，因此 mask 尺寸也随之改变（L:175–182）。

目标像素中心采用 `u=(x+0.5)/Wtarget`、`v=(y+0.5)/Htarget`。采样纹理的连续索引为 `u×Wsample−0.5`、`v×Hsample−0.5`。水平偏移以 Wb 为分母，纵向偏移以 Hb 为分母。Shader 的 u_ScreenParams 由宿主绑定；使用对应工作目标尺寸是当前实现约定，得到末端输出对照支持，尚未直接截获旧 CGL 每次绘制的 uniform。

`show != Result` 时，mask 直接写 OutputTex，四个 blur 和 blend 被隐藏（L:135–149）。因此 Threshold 预览应在完整输出尺寸计算 mask，不能把低分辨率 mask 简单放大代替。

## 3. Mask：共享颜色归一化，不是逐通道输出阈值

以下运算在归一化的已存储 RGBA 上进行。SGlow 内没有额外 sRGB 解码、预乘或解除预乘步骤。

设双线性采样得到 `S=(Sr,Sg,Sb,Sa)`，`a=glowFromAlpha`：

```text
C.rgb = (1−a) × S.rgb + a × (1,1,1)
C.a = S.a
tc = threshold + thresholdAddColor[c]

T(z,t) = 0                    当 z <= t
         (z−t)/(1−t)          当 z > t

gain = (T(Cr,tr)+T(Cg,tg)+T(Cb,tb)) / max(Cr+Cg+Cb, 1e−6)
M = Q8(gain × C)
```

`Q8(z)=round(clamp(z,0,1)×255)/255`，逐通道执行。mask 输出、每次 packed blur 输出、最终 blend 输出都经过目标存储量化；加权累积期间不执行 Q8。

共同 gain 乘到全部 RGBA，保留入选颜色之间的比例；公式没有亮度加权、smoothstep 或二值门限。`glowFromAlpha=1` 把用于检测的 RGB 变白，Alpha 仍来自输入，再乘 gain；它不是直接把 Alpha 复制到 RGB。透明像素中保存的非零 RGB 不会自动清零。来源：M:11–39。

在本接口的 `[0,1]` 输入域内，阈值为 1 或更大时对应通道走零分支，不会执行 `1/(1−t)`。Lua 的 UI 范围不能证明原生运行时会拒绝越界参数；独立实现主动拒绝不支持的范围和非有限值。

## 4. 两通道打包：255 进位及其精度边界

对一个标量 z，定义 `fract(z)=z−floor(z)`：

```text
hi(z) = floor(255z) / 255
lo(z) = fract(255z)
Pack(a,b) = Q8([hi(a),lo(a),hi(b),lo(b)])
Decode(p) = [p.r+p.g/255, p.b+p.a/255]
```

来源：H/HB:111–114，V/VB:118–121，V/VB:14–17，B:26–29。水平 pass 直接取 mask 的 RG 或 BA，纵向 pass 先对 packed RGBA 纹理采样、再 Decode，卷积后再 Pack。最终 Blend 也先采样 packed 纹理再解码。

若一个已量化 texel 的两字节为 H、L，则解码值为 `(255H+L)/65025`。这是两个 UNORM8 分量组成的 **radix-255 编码**，不是 uint16 UNORM 的 `/65535`，也不涉及主机整数端序。

理想算术、输入 z∈[0,1]、就近 Q8 下，立即 Pack→Decode 的格点间隔为 **1/65025**，0 到 1 共 65026 个不同格点，误差最多 `1/(2×65025)`。L=255 与下一高位的 L=0 可以表示同一数值；并非全部 65536 个任意字节组合都会合法产生，例如 H=255、L>0 会解出大于 1 的值。

这个格点陈述只针对存储 texel 的即时编解码。双线性插值会得到分数字节分量，随后解出的值不再局限于格点。初始 mask、最终颜色仍为 RGBA8，因此不能称整条算法具有固定“16 位精度”。浮点舍入、sampler 精度和量化规则也会改变实际误差。

## 5. H/V 卷积循环

对每个轴独立选择 `R=Rx` 或 `Ry`，定义：

```text
m = max(Rr,Rg,Rb)
stepSize = max(1, m/K)
distance = 1
accumulated[c] = center[c]
normalizer[c] = 1
```

最多执行 128 次循环。每次取样前，只要 `distance>128`、`distance>K×stepSize` 或 `distance>m`，即停止。否则：

```text
weight[c] = exp(−distance² / D[c])   当 distance <= R[c]
            0                      其余

accumulated[c] += weight[c] × (positiveSample[c]+negativeSample[c])
normalizer[c] += 2×weight[c]
distance += stepSize

blurred[c] = accumulated[c] / normalizer[c]
```

距离从 **1** 起步，然后浮点加 stepSize；不是从 stepSize 起步。权重使用未抖动的 distance。一个通道的半径不足当前距离时其权重为零；半径为零的通道没有邻点贡献。循环停止条件只看 RGB 最大半径，Alpha 半径不会延长循环。例如 RGB 的 widthY=0 时纵向不取邻点，即使 Alpha 半径仍大于零。来源：H/HB:54–109；V/VB:61–116。

透明边界拒绝了某个邻点后，normalizer 仍加其完整权重，产生边缘衰减；不能按实际有效邻点重新归一化。当前场景水平方向每侧 12 次、纵向每侧 20 次，stepSize 均为 1。

实现可以只累积本 pass 使用的两个通道，但半径最大值和循环边界仍必须从完整 RGB 半径计算。H2 不能仅根据 B、A 半径决定循环。

## 6. 确定性抖动及 Y 方向

定义标量散列 η(a,b)，其中所有 fract 按分量计算，点积按通常定义：

```text
p = fract(13.517 × (a,b))
t = dot(p, p.yx + (22.541,22.541))
z = p + (t,t)
η(a,b) = fract((z.x+z.y) × z.y) − 0.5
```

这两个十进制常量在精确 GLSL 中打印了其 binary32 的完整小数展开；使用 float32 常量 13.517f、22.541f 可恢复同一常量值。来源：H/HB:19–24，V/VB:24–29。

设 d=distance，s=stepSize，δ=dither，当前目标像素的 UV 为 (u,v)：

| 方向 | 正向位移 j+ | 负向位移 j− | 对应采样坐标 |
| --- | --- | --- | --- |
| H | `d+δsη(d+u+0.199,dv)` | `d+δsη(d+u+0.677,dv)` | `(u+j+/Wb,v)`、`(u−j−/Wb,v)` |
| V | `d+δsη(d+u+0.223,dv)` | `d+δsη(d+u+0.569,dv)` | `(u,v+j+/Hb)`、`(u,v−j−/Hb)` |

纵向散列仍使用 `d+u` 和 `d×v`，没有把 u、v 对调。两组 RG/BA 使用相同轴向种子；各通道共享位移，不分别生成随机数。δ=0 时退化为无抖动取样。散列没有时间、帧号或随机状态，因此相同坐标、参数和浮点执行方式会得到相同结果。来源：H/HB:37–52，V/VB:42–59。

**当前 CPU 行 y 应使用 v=(y+0.5)/H，不能无依据改成 1−v。** 证据链为：

1. `effects/LumiSGlow/mesh/Quad.mesh` 的四个位置／UV 对为 `(-1,-1)→(0,0)`、`(1,-1)→(1,0)`、`(1,1)→(1,1)`、`(-1,1)→(0,1)`。二进制字节 217 是小端 uint32 的 float 数量 36；字节 221 起为四组 9 个 float32，位置位于组内 0–2，UV 位于 7–8。
2. SGlow 顶点 Shader 的第 8–9 行直接由位置生成裁剪坐标、原样传递 UV，没有投影矩阵或额外 Y 翻转。
3. 本次 CGL 参考宿主在 `createTexture` 中原样上传 RGBA 字节，在 `readTexture` 中原样返回 glReadPixels 字节；multi-pass 配置不启用两处可选 Y 翻转。原始文件的第 0 行在上传、读回两端对应相同的低 V 行。

这确立的是**固定 CGL 测试桥与 CPU 文件行序之间的约定**；不能外推为剪映 UI、摄像机输入、所有 Metal 后端的统一行序。可选背景 Shader 确实在 B:39 对背景 UV 做 `1−v`，它与主图、卷积抖动坐标是不同路径。

Shader 先计算 `1/u_ScreenParams.xy` 再乘像素偏移，CPU 当前使用除法；实数公式相同，但浮点舍入未必相同。禁用 FMA 收缩能减少一种差异来源，仍不能保证散列、插值及 exp 跨 GPU／CPU 逐位一致。

## 7. 边界与纹理存储

三个 `.rt` 文件静态声明 format=43、filterMin/filterMag=1、mipmap=false、wrapS/T/R=3。本地 AGFX 枚举研究把相关值映射到 RGBA8、线性、mirror；此映射来自安装版 11.3.0，末端原生参考使用另一份固定 D634 CGL 运行时。两者身份必须分开，不能据此声称直接测到了 D634 每个目标的分配格式。

独立镜像采样的可编码定义：对任意坐标 c，先令 `t=c−2×floor(c/2)`，再令 `mirror(c)=t`（t≤1）或 `2−t`（t>1）。用折返后的 UV 做 texel-center 双线性采样；端点的超界 texel 索引夹到边缘。这对应当前实现选用的 mirrored-repeat 行为。

Reflect 模式不附加截断。Transparent 模式仍使用原纹理采样状态，但 H 的每个偏移样本乘 `1[0≤u′≤1]`，V 乘 `1[0≤v′≤1]`。这是**采样中心 UV 的区间门控**，不是把每个越界 texel 都换成透明色；门控等号包含 0 与 1。来源：H/HB:26–35，V/VB:31–40。当前 CPU 的直接返回零与乘零在有限、有效纹理输入下语义一致。

Q8 的就近舍入使用 C++ `std::round`，正半值向上，这是实现约定。包的 GLSL 使用 highp float 运算、mediump sampler；真实驱动内部精度、UNORM 半值舍入、双线性精度没有通过逐目标读回确定。

## 8. Blend：RGB 合成与独立 Alpha 方程

在完整输出尺寸上采样 S=Temp0，并先插值、后解码两张 packed 纹理，组成 `U=(Ur,Ug,Ub,Ua)`。无背景时令 `B0=(0,0,0,Sa)`。

```text
base = clamp(mix(B0,S,sourceOpacity) × bgBrightness, 0, 1)
G = brightness × (U.rgb × glowColor, U.a)
light = mix(G, mix(G,S,sourceOpacity), glowUnderSource) × (1−lightBackground)
```

每个 RGB 通道对 b=base[c]、l=light[c] 应用下表，然后写入目标时 Q8。亮度增强后的 G 和 light 在合成前没有额外 clamp。

| combine 名称／整数 | RGB 公式 |
| --- | --- |
| Screen / 0 | `1−(1−b)(1−l)` |
| Add / 1 | `b+l` |
| Mult / 2 | `b×l` |
| Difference / 3 | `abs(l−b)` |
| Overlay / 4 | b<0.5 时 `2bl`，否则 `1−2(1−b)(1−l)` |

Alpha 另算：`out.a=Q8(G.a+(1−G.a)×S.a)`。这里使用**原始亮度增强后的 blur Alpha**，不是 light.a、base.a，也没有经过 glowUnderSource 或 lightBackground 的混合。brightness 同时乘 RGB 与 Alpha；源图不透明时此式恒为 1。来源：B:31–64、65–136、137–138。

当前固定参数下化简为：`out.rgb=Q8(1−(1−S.rgb)×(1−2.4×U.rgb))`。不能先把 `2.4×U` 裁剪再执行 Screen。

可选背景的静态分支还可恢复为：先算 `bgUV=(0.5,0.5)+((u,1−v)−(0.5,0.5))×(W0/bgW,H0/bgH)`，令 B0 为背景采样乘完整 UV 单位矩形的区间门控，然后沿用上式（B:21–24、36–50）。该分支需要背景输入及其 sampler 合同；当前 scene 无背景、独立 C++ API 也未开放，不能把它算作已经运行验证的支持项。

## 9. 事件、输入范围与可复现边界

L:237–258 中存在 intensity 事件分支。对于 i≤0.8，静态算式是 `threshold=1−0.175i`、`brightness=3i`。对于 i>0.8，代码依赖本模块未定义的全局 `step(0.8,1,i)` 与 `mix`；包内其他模块的同名 **local** 函数并不能自动满足这个依赖。

只有在宿主确实绑定“区间归一化并截断的 step”及线性 mix 时，高分支才可推为乘数 `1+0.3×clamp((i−0.8)/0.2,0,1)`；此时 i=1 得到 threshold=0.7725、brightness=3.9。这个数值是条件推导，不是当前固定场景或已截获的执行结果。当前参考管线保留 scene 参数，强度在宿主末端执行原图／完整效果混合，不依赖这里的事件。

独立接口要求图像尺寸为正、存储数量匹配、RGBA 有限且在 [0,1]。允许 SGlow 单算子处理 Alpha，但整条电影柔光原生对照合同仅覆盖不透明输入。极端宽高比在降采样后使 Wb 或 Hb 为 0 时主动报错；这是独立实现保护，不代表原生同样报错。

参数验证采用声明范围：threshold/glowWidth/quality/dither 及 opacity、背景和 alpha 混合参数在 [0,1]；brightness 在 [0,50]；轴向及 RGB 宽度在 [0,5]；两个 RGB 颜色向量在 [0,1]。所有值必须有限；未知枚举直接拒绝。Lua／Shader 的未知 combine 会回退 Screen、未知 edge 索引可能回退 Transparent，独立实现没有伪装实现这些容错细节。

## 10. 可手算的检查与验证层级

一个 3×1 图像，中心为不透明红色、两端为透明黑色；设 threshold=0、glowWidth=1/3、widthX=1、widthY=0、RGB 宽度均 1、dither=0。mask 保持输入；水平只存在距离 1 的两个邻点，单侧权重 `w=exp(−2.88)`。

```text
中心标量 = 1/(1+2w) ≈ 0.89906266145
边缘标量 = w/(1+2w) ≈ 0.05046866927
RG packed 中心字节 = [229,67,0,0]；两端 = [12,222,0,0]
BA packed 中心字节 = [0,0,229,67]；两端 = [0,0,12,222]
```

纵向 widthY=0 导致 RGB 循环立即停止，所以两个 vertical 目标分别保持 horizontal 字节。这一用例能同时检查 RG／BA 分路、两字节编码、Alpha 半径不决定循环终止。它是独立实现的解析测试，不是原生中间目标截图。

现有完整管线六组固定 D634 CGL 输出比较，RGB MAE 范围 0.006540–0.054485（0–255 单位），最大误差 6，Alpha 误差 0；不是逐位相等。320×180 图表的 MAE=0.0544849537、RMSE=0.2629625554。静态公式、解析测试、末端对照三类证据互相补充，末端接近不能证明每个原生 pass 的 sampler、精度或 uniform 已被直接观察。

## 11. 精确来源与 SHA256

包相对路径以此目录为根：

`/Users/peter/Movies/JianyingPro/User Data/Cache/artistEffect/7447126702137904420/9673f80b8e2f5a07f02f9ce1130b784a/AmazingFeature`

| 别名 | 包内相对路径 | 行号范围／用途 | SHA256 |
| --- | --- | --- | --- |
| L | `effects/LumiSGlow/lua/SGlow.lua` | 5–25 范围；56–83 默认；135–235 更新；237–258 事件 | `6744d5e18cc0558b1c8255d18e3af507a693375cb7cf343be0b3a01ba6e6bf6b` |
| M | `shaders/mask-0-5170/gles2/82ee.frag` | 11–39 阈值与归一化 | `e9e6399c25bff3cff15e2edc5dffa2042898d2367599f5e8e35c72abb62ed440` |
| H | `shaders/BlurHorz-0-8805/gles2/e69d.frag` | 14–52 权重、抖动、边界；54–122 核与 RG 编码 | `7df9c1046c992a068d7ed1f384dcceaf91857313522f56e7f8fe293594edce4b` |
| V | `shaders/BlurVert-0-3f66/gles2/7399.frag` | 14–59 解码与采样；61–134 核与 RG 编码 | `df127bde1a0c220cd74ebf2b5e4faf738ee4f0f3d2b6854f387dc75a6bbe540f` |
| HB | `shaders/BlurHorz2-0-91a4/gles2/ec77.frag` | 14–52 权重、抖动、边界；54–122 核与 BA 编码 | `94838a16b08a98e3ded94c9fd9226a3e7315b6a1fbe97b9728c8d73ad6cf20be` |
| VB | `shaders/BlurVert2-0-a4a0/gles2/b51e.frag` | 14–59 解码与采样；61–134 核与 BA 编码 | `1fd2c83e1e236a105de6f25b0ab8a9ca51fd3691d8a78c1611e70d33ac09e415` |
| B | `shaders/blend-0-9c37/gles2/baeb.frag` | 21–64 读取与预处理；65–138 RGB、Alpha 合成 | `5d5b74ecac64192b019e7b485561722b49b530785b862bd95881a90657aa7668` |

辅助资源是二进制时用字节偏移或结构字段定位，不虚构文本行号：

| 包内相对路径 | 定位 | SHA256 |
| --- | --- | --- |
| `main.scene` | SGlow0 参数、Camera、MeshRenderer 连接；35700 字节 | `09424db1ae0fefdbd459a509db8c04dd4e589db5d7f3ad5586fd86cb5684a7d7` |
| `effects/LumiSGlow/mesh/Quad.mesh` | 从 0 计数的 217–364 字节为 count 与顶点；1279 字节 | `8243e08a76b2737ca68aafb8cdab465b8a76d1a62af12ad5c5c071f7266a3994` |
| `effects/LumiSGlow/rt/BlurTex2.rt` | RenderTexture 的 format、filter、wrap、mipmap；590 字节 | `f4d56927dadf449eb2cba144c25f8a830d7d12245174e263d738bacf76841940` |
| `effects/LumiSGlow/rt/BlurTexTmp.rt` | 同上；590 字节 | `4e438132f410483ff97481f7a215b38322e1ca752c912b04202ac9b30e21ceb3` |
| `effects/LumiSGlow/rt/BlurTex.rt` | 同上；590 字节 | `77e5ceb747cc54f370f1176a80618b2741d01ac5af6a52cefdfb0f6ae0db8096` |

顶点 Shader 均为 11 行，重点是第 8–9 行：`shaders/mask-0-5170/gles2/82ee.vert` 与 `shaders/blend-0-9c37/gles2/baeb.vert` 的 SHA256 均为 `b401fb34cceaad43f6a5be86ff3b33fa85930e5b46c62cf4cf7849da2c46c777`；四个 blur 路径中与 frag 同名的 `.vert` 文件 SHA256 均为 `d51250cd67dacd5e59f6fdf58cc3ecdbfedb20b1ef8ce35d14054dfac72b4367`。

仓库自己的实现和桥接证据以 `/Users/peter/Desktop/code/qcut/qcut` 为根：

| 相对路径 | 重点行号 | 审计时 SHA256 |
| --- | --- | --- |
| `research/independent-soft-glow/glow.cpp` | 75–101 mask；119–146 核；157–242 抖动及 packed pass；271–333 blend 与执行 | `68305b6750e9057c7fbd2a74b15f847819e206461c64fbe4957463d38be2438a` |
| `research/independent-soft-glow/glow.hpp` | 9–38 参数与接口 | `67edf381516e94f802475b5dfb5dbf2808cfa069000c15ffa15c8b206d7b1e4d` |
| `research/independent-soft-glow/image.cpp` | 22–31 mirror；68–100 Q8 与双线性采样 | `97b7486baed14fc7ab05bc8975660d6f29b67f7c6b7c2078e4cad2a1ac38c644` |
| `docs/task/jianying-filter-runtime-research/probes/effect-cgl-render-probe.cpp` | 227–248 上传；266–280 可选翻转；288–316 读回；2557–2561 输出翻转条件 | `d1d4d3ba431fab61d3d7039d58ab2c593de98f2013a4bcd679e957a30d3d5b2f` |
| `electron/jianying-filter-local-runtime/render.ts` | 368–377 multi-pass 翻转配置 | `4f8cec67f02ad86e4245a255e7749e0c4083760b4dfcfae4876051033c69fcba` |

私有末端对照位于 `/Users/peter/Downloads/QCut-Independent-Soft-Glow-2026-09-06/cpp-verification/metrics.json`；运行时身份位于 `/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/soft-glow/runtime-identity.private.json`。D634 参考的 libcccreator SHA256 为 `0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9`、UUID `D6342ECD-5432-33F0-A2AD-0C28F5699994`；其 libAGFX SHA256 为 `1b9493940eebda3b79d72b7308adf8abfbff56c9cfce9d7d73b31cd080453eee`、UUID `57ECC10F-8BB8-319C-BA46-AF286E2EBD43`。
