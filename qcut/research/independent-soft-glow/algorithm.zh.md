# 电影柔光算法说明

本文件保留概览。完整的输入输出、逐阶段契约、证据级别、单因素验证和未知项见 [算法语义契约](semantic-contract.zh.md)；机器可读版本见 [semantic-contract.json](semantic-contract.json)。

这是根据固定本地效果包的有效场景、控制脚本和着色计算重写的标准 C++ 实现。采用有含义的变量和函数表达运算，没有将供应商脚本作为运行时，也没有声称还原其原始工程结构。

## 图像与中间结果

每像素四个归一化浮点数，数据顺序为 top-down RGBA。每次写入模拟的 RGBA8 渲染目标时执行 `round(clamp(c,0,1) × 255) / 255`。内部运算保留浮点精度；不把所有计算统一改成整数。

归一化坐标 `(u,v)` 对应像素坐标 `(u × width − 0.5, v × height − 0.5)`。双线性插值在相邻四点进行；mirror 使用周期为 2 的折返坐标，clamp 复制边缘，transparent 在边界外返回零。

## 高斯支路

当前强度 70、quality 0.2 得到半尺寸工作图。步骤是降采样、横向卷积、纵向卷积、放回原尺寸。原始 source 单独保留给后续 SoftLight 基础层。

尺寸归一化参考为 `max(min(width,height), max(width,height)/2)`，避免直接把绝对像素半径绑定某一种输入分辨率。320×180 下横纵 UV 半径分别为 0.039375 和 0.07，sigma 为半径除以 2.5。质量映射与采样预算得到每侧 7 个有效 tap，中心另计一次。

每个轴都在采样后将 RGB 做 gamma 2.2 变换，按 `exp(−0.5 × (distance/sigma)²)` 加权，再做逆 gamma。当前边界跳过超出 UV 范围的 tap，并按实际权重归一化。每轴输出与缩放目标分别量化。

## SoftLight 基础层

将模糊结果围绕画面中心放大 103%，作为 source；完整原图作为 base，使用 70% 的 Precomp opacity。

对 straight RGB 的每个通道，记 base 为 b、source 为 s：当 s ≤0.5 时，SoftLight 为 `b − (1−2s)b(1−b)`；否则为 `b + (2s−1)(D(b)−b)`。D 在低亮度使用三次多项式，在其余区间使用平方根。合成阶段同时按各图层类型处理 premultiplied alpha；固定整链入口目前只接受不透明图像。

这条完整分辨率 base 支路是保留细白线的关键。

## 唯一的辉光节点

有效 threshold=0.84、brightness=2.4、glowWidth=0.13、X/Y 宽度系数=0.41/0.65、RGB 宽度系数均为1。工作宽度上限240，纵横比保持，尺寸向下取整。

阈值提取按每个通道的超阈值占比计算，再用三通道之和归一化为作用于 RGBA 的权重。它不是先转灰度、再对亮度做一次阈值。

两对横纵卷积分别处理 RG 和 BA，均从同一张 mask 开始。一个归一化值 v 写为两个通道：`floor(v × 255)/255` 与 `fract(v × 255)`；读回时为 `high + low/255`。这提供约 1/65025 的分辨率，不能替换成普通8位模糊或按256进位的整数打包。采样时先对打包通道进行双线性插值，再解包。

各通道 sigma 为 radius/2.4；核权重为 `exp(−distance²/(2sigma²))`。采样预算超过质量限制时加大步长，循环终止仍遵循实际通道半径及固定上限。dither 使用只依赖当前 UV、偏移和固定常数的浮点散列，不依赖墙钟或随机种子。

辉光在完整分辨率上与 SoftLight 结果合成。当前 Screen 为 `1 − (1−base)(1−glow)`，glow 先乘 brightness。模块还实现观察到的其他混合分支；固定 pipeline 只选择 Screen。

## LUT 与最终混合

实际 LUT 是场景 `lutImage` 绑定的图集。64 个蓝轴切片按8×8排列，红绿轴在单个64×64图块内部。红绿双线性、蓝轴相邻切片插值，共同得到三线性查表。加载元数据要求翻转Y，Shader查表也翻转Y；CPU采用二者抵消后的top-down组合约定，已由专门的额外Y翻转实验支持，但没有直接截获原生加载步骤。

静态场景的LUT opacity为0.8；图像Alpha还参与LUT结果混合。最终 Normal／Adjustment 图层以 SoftLight 输出为 base、LUT输出为 source，opacity为0.64。

CLI默认 `output-mix` 在完整效果之后执行用户强度混合。显式 `ui-snapshot` 则每次由 `t` 重建导出快照参数：`t≤0.8` 时辉光threshold=`1−0.175t`、brightness=`3t`，其余使用场景0.84／2.4；LUT opacity=`0.8t`。SoftLight与Normal不变，也不再叠加末端强度混合。0保留SoftLight，100与默认模式相同，80到81保留实测分支变化。来源和范围见 [两种强度模式](intensity-modes.zh.md)。

## 精度范围

CPU 使用标准浮点数学函数与显式RGBA8量化。GPU纹理插值、着色器mediump、浮点运算重排及量化实现可能造成数值差异；当前没有逐Pass原生截帧，尚不能把剩余误差唯一归因于某一项。具体已测误差见 [README.zh.md](README.zh.md)，不能把“可能原因”写成已定位根因。
