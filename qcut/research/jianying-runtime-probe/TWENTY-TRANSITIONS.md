# 剪映新增二十个转场逆向记录

本报告记录在既有 13 个像素级对齐转场之外，新选择的 20 个剪映转场。
机器可读身份、时长、证据文件和算法摘要见
[`twenty-transition-manifest.json`](./twenty-transition-manifest.json)。

## 完成标准

这批 20 个转场均满足以下条件：

1. 下载包的 MD5 与剪映资源目录记录一致，或使用剪映已经缓存的同一 MD5 包。
2. 真实 `AmazingEngine::TransitionSegment` 对包执行 `loadSegment` 和
   `unloadSegment`，20/20 均正常退出。
3. 使用同一对 A/B 校准视频、剪映私有运行时和各自默认时长，20/20 均生成
   `640x360 @ 30 fps` 的 240 帧视频。
4. 逐个完整解码 240 帧；没有损坏帧。每个转场提取
   `0 / 0.25 / 0.5 / 0.75 / 1` 五个进度点，100/100 个样本均非黑帧，且每个
   转场的五帧哈希均不相同。
5. 从 Lua、GLSL、Lumi AE 数据或 `.seq` 描述中恢复输入所有权、时间映射、
   关键参数和合成顺序，而不只按文件名分类。

本轮证明的是“包内算法已经读懂，并能由真实运行时完整执行”。它还不是独立
QCut 实现与剪映导出视频的像素差分结论。要称为 clean-room parity，仍需在 QCut
重写这些算法，再与同时间线的剪映导出逐帧比较。

本地验证产物不会提交到 Git：

- `.local/jianying-runtime/new-twenty/render-validation.json`
- `.local/jianying-runtime/new-twenty/twenty-contact.png`
- `.local/jianying-runtime/new-twenty/renders/<resource-id>/runtime.mp4`
- `.local/jianying-runtime/new-twenty/renders/<resource-id>/five-stop/*.png`

## 清单

| 转场 | 资源 ID | 默认时长 | 实现家族 | 核心所有权切换 |
| --- | --- | ---: | --- | --- |
| 3D空间 | `7049979667406656014` | 1.5s | 多 Pass GLSL | 六层圆形区域合成 |
| 爱心 | `6748289440130535947` | 0.5s | 单 Pass GLSL | 隐式心形遮罩 |
| 白光快闪 | `7343136487182963211` | 0.4s | 序列帧 + 后处理 | `p=0.6` 硬切 |
| 白色墨花 | `6858191556055142919` | 0.5s | 47 帧序列 | `p=0.5` 硬切并遮缝 |
| 百叶窗 | `6789847331060584974` | 0.5s | 31 帧序列 | 序列 alpha 直接混合 |
| 波点向右 | `6858191541706428941` | 0.5s | 48 帧序列 | `p=0.5` 硬切并遮缝 |
| 窗格 | `6747989545448378888` | 0.5s | 单 Pass GLSL | 十条竖向窗格 |
| 弹跳 | `6747865141120864779` | 0.5s | 单 Pass GLSL | A 弹离后露出 B |
| 倒影 | `6748313807031898627` | 0.5s | 单 Pass GLSL | 透视面板，半程换绘制顺序 |
| 电视故障 I | `7046293801123451405` | 1.6s | Shader + 15 帧序列 | `0.3 / 0.7` 三阶段 |
| 叠加 | `6914112332205396488` | 1.0s | 单 Pass GLSL | Add 到 Overlay 再到 B |
| 动漫漩涡 | `6858191448827761160` | 0.5s | 48 帧序列 | `p=0.5` 硬切并遮缝 |
| 抖动 | `7252544245444121148` | 0.8s | Lua AE 管线 | A 透明度关键帧交给 B |
| 翻篇 | `7034446419641504264` | 1.3s | GLSL + Lua | 90 度时切到镜像 B |
| 泛白 | `6949828109663212045` | 1.0s | 单输入 GLSL | 非重叠切点换输入 |
| 放射 | `6724239584663704071` | 1.0s | CrossZoom GLSL | 连续 dissolve |
| 风车 | `6748286529921094157` | 0.5s | 单 Pass GLSL | 八个旋转扇区 |
| 穿越 III | `7341295618863665690` | 0.8s | 多效果 + 32 帧遮罩 | 遮罩和 B opacity 共同接管 |
| 吸入 | `7246288124110705209` | 1.0s | 三 Feature Lua 管线 | `9.5/30` 帧换输入 |
| 烟雾转场 | `7450031574923350555` | 1.5s | Lumi AE | A 位移、放大、淡出露出 B |

## 算法恢复

### 1. 3D空间

这是四次模糊 Pass 加一次合成 Pass，不是真正的 3D 网格：

- A、B 各执行水平和垂直模糊。
- 每张图分成六层圆形区域。第 `i` 层半径为
  `mix(0.65, 2 * aspect, cubicBezier((i-1)/5))`；A、B 使用不同 Bezier：
  `[0.52, 0.08, 1, 0.88]` 和 `[0.58, 0.01, 1, 0.88]`。
- 竖屏沿 X 轴移动圆心，横屏沿 Y 轴移动；越界 UV 使用 mirror-repeat。
- 六层分别选择不同位移 UV，并按时间参数混合原图与模糊图，最后把 A 层以 alpha
  覆盖到 B 层。
- A 的六个主要移动结束点为
  `0.84 / 0.78 / 0.70 / 0.76 / 0.86 / 0.86`；B 的位移初值为
  `-0.6 / -0.7 / -0.9 / -1.0 / -1.3 / -1.5`。

证据：`AmazingAuto/lua/data_val.json`、`AmazingAuto/lua/SadGE.lua` 和
`AmazingAuto/xshader/resource1/shader/normal.frag`。

### 2. 爱心

将 UV 围绕 `(0.5, 0.4)` 做 Y 翻转并除以 `1.6p`。令：

```text
a = x^2 + y^2 - 0.3
heart = step(a^3, x^2 * y^3)
output = mix(A, B, heart)
```

因此心形从中心连续扩大，`p=0` 时专门返回空遮罩。

### 3. 白光快闪

这是 10 帧 AE 控制曲线和 31 帧 RGBA 遮罩共同驱动的后处理链：

- `p*10 < 6` 使用 A，否则使用 B，即输入在 `p=0.6` 硬切。
- 帧 `1->4` 上升、`4->8` 保持、`8->10` 回落。
- 峰值参数：grain `0.2`、sharpen `0.15`、X/Y offset `-0.08/0.2`、
  Gaussian `5`、glow `0.4`、noise `0.6`。
- 同一遮罩序列被四个 Pass 复用，分别控制 Gaussian 混合、additive glow、
  screen noise 和 sharpen 混合。

### 4. 白色墨花

Lua 以归一化时间索引 47 帧、`500x500` 序列，起始偏移为 1。Shader 对序列做
aspect-fill，并在半程切换底图。白色墨花像素本身承担遮缝和视觉主体；核心代码是
通用序列合成器。

### 5. 百叶窗

与其他三项序列转场不同，它不在半程硬切。31 帧、`450x800` 序列的 alpha 是
逐像素混合权重：

```text
frame = clamp(floor(31p), 0, 30)
output = mix(A, B, sequenceAlpha(frame))
```

### 6. 波点向右

使用 48 帧、`500x500` 波点序列，起始帧为 0；底图在 `p=0.5` 从 A 切到 B，
序列在其上覆盖切口。

### 7. 窗格

固定 `count=10`、`smoothness=0.5`：

```text
pr = smoothstep(-0.5, 0, x - 1.5p)
mask = step(pr, fract(10x))
output = mix(A, B, mask)
```

它是十个交错推进的竖条，不依赖图片素材。

### 8. 弹跳

背景始终是 B，A 以三次衰减弹跳离开：

```text
stime = sin(pi*p/2)
y = abs(cos(3*pi*p)) * (1-stime)
```

接触阴影高度 `0.0375`、最大 alpha `0.6`，末尾通过
`smoothstep(0.95, 1, p)` 消失。

### 9. 倒影

参数固定为 reflection `0.4`、perspective `0.2`、depth `3`。A、B 分别做透视
缩放和水平位移，`p<0.5` 优先绘制 A，之后优先绘制 B。越出主面板的区域使用黑色
背景，并用以下投影 UV 绘制衰减倒影：

```text
reflectionUv = panelUv * (1, -1.2) + (0, -0.02)
```

### 10. 电视故障 I

时间被分为三个区间：

- `p<0.3`：A，叠加量化横线位移和 YUV 色差。
- `0.3<=p<0.7`：索引 15 帧、`480x270` 故障序列。
- `p>=0.7`：B，故障强度和 alpha 按 `(1-remap(p))^2` 衰减。

后段线宽由 `0.4` 增至 `0.8`，最大故障 alpha 为 `0.3`。

### 11. 叠加

前半程逐渐增加 A+B 的 additive 桥接；后半程进入 overlay，再退到 B。三个权重为：

```text
opacityA = p < 0.5 ? 1 : 2(1-p)
opacityB = p > 0.5 ? 1 : 2p
overlay = p < 0.5 ? 0 : 2(p-0.5)
```

### 12. 动漫漩涡

使用 48 帧、`500x500` 漩涡序列，起始偏移为 1。与白色墨花、波点向右共用
CenterCrop 合成器，底图在 `p=0.5` 硬切。

### 13. 抖动

运行时将 `p` 映射到 AE 的第 10 到 29 帧。A、B 共用以下主要关键帧：

- 时间：`10 / 14 / 17 / 19 / 21 / 26 / 29` 帧。
- rotation：`0 / -8 / 25 / 25 / -7 / 3 / 0` 度。
- scale：`100 / 100 / 111 / 111 / 100 / 100`。
- position 在设计画布 `720x1280` 上连续抖动。
- A radial blur：`0 / 3 / 10 / 10 / 10 / 0 / 0`；B 第二点直接到 `10`。
- A opacity 在第 17 到 21 帧由 `100` 降到 `0`，B 因而接管输出。

两路先 mirror-expand 到 2 倍渲染面，再按半径自适应采样数量执行旋转模糊、
transform，最后 alpha-over。

### 14. 翻篇

Lua 用 34 档离散时序把 scale 从 `1` 压到 `0.6` 再恢复，同时将角度从 `0`
旋转到 `180`。角度小于 90 度采样 A，超过后采样水平镜像 B。Shader 沿像素到中心
方向采样 9 次形成运动模糊；模糊包络在 `p<0.3` 上升、`0.3..0.7` 保持，之后下降。

### 15. 泛白

这是唯一只读取 `#TransitionInput0` 的非重叠包。宿主在切点把当前输入由 A 换成 B；
Shader 对两侧使用对称曝光：

```text
q = min(p, 1-p)
e = cubicBezierY([0.42,0], [0.58,1], q)
output.rgb = input.rgb * 2^(16e)
```

中点达到约 8 stops，从而把切口淹没在白色中。

### 16. 放射

CrossZoom 使用 41 个带随机抖动的采样点。采样方向指向移动中心
`(mix(0.25,0.75,p), 0.5)`，权重为 `4(q-q^2)`。模糊强度以正弦 ease
`0->0.4->0`，A/B dissolve 使用 exponential ease-in-out。

### 17. 风车

以画面中心计算 `atan(y-0.5, x-0.5)`，加上 `2p` 后按 `pi/4` 取模，得到八个
交替属于 A/B 的扇区。时间只旋转扇区边界，不需要外部纹理。

### 18. 穿越 III

内部 AE 时间为 `p*29/31`，32 帧遮罩以 `p*32/30` seek：

- A：scale `100->30`、optics FOV `0->150`，并用相邻帧 scale 计算 motion blur。
- B：scale `500->100`、FOV `172.1->0`、turbulence `-0.3->0`。
- B opacity 在第 15 到 21 帧由 `0.55->1`；第 15 帧前强制为 0。
- directional blur 在第 19 帧峰值 `53`，Gaussian 在同帧峰值 `10`，二者到第
  29 帧回到 0。
- 最终混合为 `mix(A, B, (1-sequence.r)*opacityB)`。

### 19. 吸入

三个 AmazingFeature 串联：FOV 变形、centered radial blur、Gaussian blur。

- A FOV 在第 `0..9` 帧由 `0->110`。
- `p=9.5/30` 时切到 B；B FOV 在第 `8..21` 帧由 `110->0`。
- radial blur amount 在第 `0..9` 帧 `0->50`，第 `9..21` 帧回到 0。
- Gaussian 采样档位在第 `4..9` 帧 `0->5`，第 `9..16` 帧回到 0。
- position、非等比 scale 和 rotation 继续通过 29 帧 AE 曲线制造吸入后的回弹。

FOV Shader 对 UV 迭代 63 次，并使用 mirror UV 处理边缘。

### 20. 烟雾转场

包内没有烟雾图片；观感完全由 Lumi AE 图生成：

- radial blur amount 在 1.5 秒内 `0->90`，中心 `(0.5,0)`，quality `0.2`。
- wave amplitude `0->20`，wavelength `450`、direction `90`、speed `2`。
- A layer 位置由 `(640,360)` 移到 `(640,0)`，scale `100->200`，opacity
  `100->0`，露出作为 base texture 的 B。
- adjustment exposure 在 `0.033..0.2s` 从 `0->3`，在 `0.2..0.3667s`
  回到 0，形成前段亮闪。

## 可复用实现家族

20 个卡片不等于 20 套完全独立的引擎。Clean-room 实现可以收敛为以下组件：

1. 通用双输入 GLSL 转场：爱心、窗格、弹跳、倒影、叠加、放射、风车。
2. 通用序列帧播放器与 aspect-fill 合成器：白色墨花、百叶窗、波点向右、动漫漩涡。
3. 通用后处理图：Gaussian、方向/径向/旋转模糊、glow、grain、noise、sharpen。
4. AE keyframe 求值器：抖动、穿越 III、吸入、烟雾转场。
5. 通用 transform 和 mirror-repeat 采样：3D空间、抖动、吸入。
6. 单输入非重叠转场宿主协议：泛白。

因此后续工作不应把 929 个目录逐个硬编码。先实现这些共享原语，再把同家族卡片
转换为参数、关键帧和合法自有素材，长期成本会低很多。
