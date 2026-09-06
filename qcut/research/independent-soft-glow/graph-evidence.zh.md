# 电影柔光独立实现：有效图与参数证据

日期：2026-09-06。固定资源 `7447126702137904420`，版本 `9673f80b8e2f5a07f02f9ce1130b784a`。本文是独立实现的行为说明，不包含供应商 Shader、Lua 或资源原文。

## 先纠正三处容易误读的证据

1. `LumiExportData.lua` 登记两组 SGlow 参数，但 **main.scene 只实例化一组 SGlow**。第二组 `effect1` 没有对应 Entity，不应成为独立算法节点。
2. `LumiManager` 虽读入 ExportData，但实际 `initParams`、关键帧、slider、fade 更新调用被注释。因此 ExportData 的 threshold 0.86、LUT 0.64 不能覆盖 scene 的 **threshold 0.84、LUT 0.8**。
3. scene 的 `LutTex` 指向 `effects/LumiLvFilter/image/filter.png`，但实际脚本采样的是 **`lutImage`**，绑定 `resource/images/reference map2.png`。两张 PNG 的像素不同；按目录中常见 `filter.png` 文件名猜测会选错输入。

以上替代此前仅据 ExportData 和目录识别得到的“两组 SGlow + filter.png”摘要。已有 CPU 结构近似与原生的差异测量仍有效，它真实调用的正是当时已有的近似实现；修正的是差异成因与应实现的目标图。

## 五个实际节点与连接

| 次序 | 节点 | 输入 | 输出 | 基础图像分支 |
| --- | --- | --- | --- | --- |
| 1 | GaussianBlur | 原图 source | outputTex | 无 |
| 2 | SoftLight / Precomp 图层 | Gaussian 输出 | Temp0 | **原图 source** |
| 3 | SGlow0 | Temp0 | Temp1 | blend 阶段保留 Temp0 |
| 4 | LVFilter | Temp1 | Temp2 | LUT 为 reference map2 |
| 5 | Normal / Adjustment 图层 | Temp2 | outputTex | **Temp0，不是原图 source** |

`outputTex` 在第一节点和最终节点重复使用，反映可复用目标资源；独立 CPU 实现可使用单独变量表达每个时刻的数据，避免把旧值覆盖关系读成环。

scene 中共有 13 个相关相机：Gaussian 四个、SoftLight 一个、SGlow 六个、LUT 一个、Normal 一个。这是静态相机拓扑，不是 GPU draw-call 实测。

## 有效静态参数

### GaussianBlur

scene 值：强度 70、quality 0.2、spaceDither 0、横纵强度均 1、方向为横纵、边界类型 Normal、blurAlpha 与 inverseGammaCorrection 均为 true。

构造默认且 scene 未覆盖：NormalizationSize 1000、Gamma 2.2、RadiusOverSigma 2.5、MaxIntensity 1000。

初始强度 70 对应半尺寸。相机连接为：source 降采样到 Y2 → 横向处理到 X2 → 纵向处理到 Y2 → 放大到完整 outputTex。四分之一与八分之一资源也存在，但不能因为存在就全部串行执行。非整除输入尺寸必须在实现中明确取整规则，并接受原生边界用例对照。

### SoftLight / Precomp 图层

- source：Gaussian 输出；base：原图。
- opacity 70；scale `[103,103,100]`。
- anchorPoint 和 position 都为 `[937.5,1250,0]`。
- compositeSize 与 layerSize 都为 `[1875,2500]`。
- orientation、XYZ rotation 均为 0。
- hasBlend=true、hasTransform=true、hasMatte=false、mirrorEdge=false。
- layerType=Precomp、blendMode=SoftLight，水平视场角 39.6。

这些值描述居中的 103% 缩放。独立算法可直接用规范化坐标实现本例，但不能假定通用剪映图层只有这一种变换。

### 唯一的 SGlow0

| 参数 | scene 有效值 |
| --- | --- |
| threshold | **0.84** |
| brightness | 2.4 |
| glowWidth | 0.13 |
| widthX / widthY | 0.41 / 0.65 |
| widthRed / widthGreen / widthBlue | **1 / 1 / 1** |
| quality / dither | 0.2 / 1 |
| thresholdAddColor / glowColor | 黑 / 白 |
| show / combine / edgeMode | Result / Screen / Reflect |
| sourceOpacity | 1 |
| glowFromAlpha / glowUnderSource | 0 / 0 |
| lightBackground / bgBrightness | 0 / 1 |
| bgTexture | 未绑定 |

scene 还有旧名 `widthR/G/B`，而脚本实际读 `widthRed/Green/Blue`。不能把旧名中 1.2/1.4 的值当作当前通道宽度。

SGlow 工作宽度上限为 `clamp(quality × 1200, 120, 360)`。本例得到 240；宽度超过上限时等比例缩小，最终宽高向下取整。320×180 对应 240×135。

SGlow 并不是依次串行执行两次同一模糊：

| 相机 | 读取 | 写入 |
| --- | --- | --- |
| Mask | Temp0 | BlurTex2 |
| Horz1 | BlurTex2 | BlurTexTmp |
| Vert1 | BlurTexTmp | BlurTex |
| Horz2 | **仍是原 mask 的 BlurTex2** | BlurTexTmp |
| Vert2 | BlurTexTmp | BlurTex2 |
| Blend | Temp0、BlurTex、BlurTex2 | Temp1 |

Vert2 与 Mask 共享 BlurTex2，因此 Vert2 的尺寸更新也会更新 Mask 的目标尺寸。两对 blur 的 Shader 不同；应分别实现其行为，不能盲目复用同一个卷积两次。

### LUT

`LVFilter` 的初始 `uniAlpha=0.8`，本例所有输入不透明。LUT Shader 除 uniAlpha 外还以输入 Alpha 再混合一次；透明输入的行为应单独验证。

实际纹理为 `reference map2.png`，512×512 的 8×8 图集，64³ cube。原始 PNG SHA-256：

```text
4dc2e1a87a571a18ed4729c04159ddaf18ccf3f79ac35d7cc1141b6aedb2e39f
```

解码 RGBA SHA-256：

```text
f9f142849b99e77d5b9174b054c7634d0945f6fd731c4133def07900d0bd9239
```

图集采样使用蓝轴相邻切片插值，每块 64×64，坐标在 texel center。资源元数据 `needFlipY=true`，Shader 查图坐标又做一次 Y 翻转。以普通 PNG top-down 像素解码的 CPU LUT 应优先按两次翻转抵消后的约定实现，并以图表量化确认，不能把单独一处翻转直接照搬到 CPU。

### 最终 Normal / Adjustment 图层

- source=Temp2、base=**Temp0**。
- opacity 64、scale `[100,100,100]`。
- 与上面的图层相同中心、构图尺寸和零旋转。
- layerType=Adjustment、blendMode=Normal。
- hasBlend=true、hasTransform=true、hasMatte=false、mirrorEdge=false。

## 初始化、时间和 intensity 事件分开看

scene 属性是稳定 CGL 参考的初始基线。`LumiManager` 的 ExportData 参数初始化调用未启用；保留下来的 duration 更新用于图层可见区间，各图层 source/base duration 都是 `[0,5]`。

该包 `effectType=xtEffect`。非 EditorSDK 分支把 aeTime 固定在 compDuration 的中点，约为 `(1/30 - 0.00001)/2 = 0.0166617` 秒；EditorSDK 分支还会覆盖它。本次没有直接读取宿主宏，不能把中点当作已截获的实际时间。两个分支在当前参考时刻均处于有效区间，详见 [生命周期语义](semantic-lifecycle.zh.md)。

包内确有 intensity 事件分支：

- SGlow 事件在 0.8 分段；低分支可静态读出 threshold=`1−0.175×intensity`、brightness=`3×intensity`。高分支调用本模块未定义的全局 step/mix；事件1的0.7725／3.9仅是在宿主提供预期helper时的条件公式，尚未证明可以执行。
- LVFilter 收到事件后把 uniAlpha 设为 `0.8 × intensity`。
- LumiLayer 事件尝试写入 `self.LumiLayer_301.opacity`，该字段未在此模块或scene中初始化。它的意图不能直接等同于已执行的SoftLight opacity更新。

本次独立实现对照采用已有 CGL `unchanged-package` provider：固定包按其初始行为渲染完整效果，再将输出与原图按用户强度混合。100% 是完整图；37% 是完整图输出与原图的混合。CLI 若匹配本次证据，应明确提供这一强度契约，不能同时修改包内参数又在末端混合一次。

这份说明没有把尚未完成的包内事件路径测量写成与剪映 UI 一致。

## 私有参考与仓库中的界限

私有根目录：`/Users/peter/Downloads/QCut-Independent-Soft-Glow-2026-09-06/`。

- `effective-scene-parameters.private.json`：实际五个节点的参数与资源引用。
- `scene-summary.private.json`：主场景结构化解析。
- `private-lut/reference-map2.rgba`：独立 CLI 可读的 512×512 RGBA 图集，仅本机。
- `inputs/`：自行生成的 chart、offaxis、ramp 输入，另含 portrait-shaped impulse。
- `run-oracle-fixtures.ts`：只调用现有原生 CGL API 的私有参考脚本。
- `oracle/`：原生结果，每个输入和强度两个新进程，每进程三帧，固定外部 t=0；各帧 SHA 与稳定性写入回执。

供应商运行库、模型、PNG/LUT、Shader、Lua、完整序列化资源及其私有导出不加入源码项目。独立源码应只依赖自己的图像/采样/算子实现，以及用户显式提供的本地 LUT。算法能独立编译与所有素材均可公开分发是两个不同验收项。
