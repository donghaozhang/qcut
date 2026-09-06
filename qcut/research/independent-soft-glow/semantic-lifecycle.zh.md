# 电影柔光：初始化、时间与事件语义审计

日期：2026-09-06。资源 `7447126702137904420`，版本 `9673f80b8e2f5a07f02f9ce1130b784a`。本文是独立撰写的行为规格与证据索引；不包含供应商程序全文、着色器或资源副本。

本次只读审计发现：**scene 静态参数、ExportData 参数表、包内 intensity 事件、宿主输出强度混合，是四个不同入口。** 其中包内事件存在未解决的作用域和对象引用依赖，不能把其意图公式写成已验证的运行结果。本文保留该次静态审计范围；后续独立宿主已观察对应Lua错误，而[新增ui-snapshot模式](intensity-modes.zh.md)依据剪映实际导出快照重建参数。默认output-mix仍使用无包内事件的静态配置，两者都不修补供应商事件分支。

## 证据约定与固定文件

以下相对路径均从此本地包目录起算：

```text
/Users/peter/Movies/JianyingPro/User Data/Cache/artistEffect/7447126702137904420/9673f80b8e2f5a07f02f9ce1130b784a/
```

`M:370–371` 表示下表 M 文件的原始 1-based 行号。scene、PNG metadata、mesh 是二进制文件，使用 SHA-256 与字段定位，不使用私有 JSON 导出行号冒充原文件行号。

| ID | 包内相对路径 | SHA-256 |
| --- | --- | --- |
| SC | `AmazingFeature/main.scene` | `09424db1ae0fefdbd459a509db8c04dd4e589db5d7f3ad5586fd86cb5684a7d7` |
| M | `AmazingFeature/lua/LumiFamily/LumiManager.lua` | `5cab07246412833c724a7c483c94fcd0db7f8a494ca984fddf5db92770a360fe` |
| P | `AmazingFeature/lua/LumiFamily/LumiParamsSetter.lua` | `342e87a41c2754ef25059f3ad070220c95727028f2b085bb045841c8d820858e` |
| O | `AmazingFeature/lua/LumiFamily/LumiObjectExtension.lua` | `6863f671337ea4a785b3aab8dfb3cad9ad17cc87a4b90eee2e6555a61a0c532a` |
| E | `AmazingFeature/lua/LumiFamily/LumiExportData.lua` | `2822d0b101d034de9399d86dee45535ca5b7c6b39d14233e22564e37045020d7` |
| G | `AmazingFeature/effects/LumiSGlow/lua/SGlow.lua` | `6744d5e18cc0558b1c8255d18e3af507a693375cb7cf343be0b3a01ba6e6bf6b` |
| L | `AmazingFeature/effects/LumiLayer/lua/LumiLayer.lua` | `8cd4f968894980d6b8a6b5180e9db71f5a8fc8ae492bac9b75aa69d5e34ecce5` |
| V | `AmazingFeature/effects/LumiLvFilter/lua/LVFilter.lua` | `d43f0a1a1a147cf8672e742f305b079aa7d5a4249734bc528770dee1b223542d` |
| B | `AmazingFeature/effects/LumiGaussianBlur/lua/ScriptCompGaussianBlur.lua` | `3e78a5dfbdb315aba064504bada7d81a4339370c88ce6594829ef29d34c4306e` |
| LM | `AmazingFeature/resource/images/reference map2.png.meta` | `f659284569d950dafdb5fa73d1655ce744a58dfd860a35512038369f4c3b27fe` |
| LI | `AmazingFeature/resource/images/reference map2.png` | `4dc2e1a87a571a18ed4729c04159ddaf18ccf3f79ac35d7cc1141b6aedb2e39f` |
| LS | `AmazingFeature/shaders/pass6-0-c667/gles2/8e0d.frag` | `bfdbdc49e7801619e1c637304076bfdcc222a951f9b0a391089dd2536d794846` |
| GM | `AmazingFeature/effects/LumiSGlow/mesh/Quad.mesh` | `8243e08a76b2737ca68aafb8cdab465b8a76d1a62af12ad5c5c071f7266a3994` |

## 1. 参数来源与生命周期

### scene 配置与 Lua 构造默认值不同

SC 的统一定位形式为 `Scene.entities[Entity.name=…].components[ScriptComponent.className=…].properties`。下列值是**包中编码的配置**；没有将其表述为逐字段原生运行时读回结果。

| Entity / ScriptComponent | 关键 scene 配置 | 与构造默认值的区别 |
| --- | --- | --- |
| `LumiGaussianBlur_301-effect0` / `ScriptCompGaussianBlur` | intensity=70；quality=0.2；spaceDither=0；horizontalStrength=verticalStrength=1；blurDirection=`Horizontal and Vertical`；borderType=`Normal`；blurAlpha=true；inverseGammaCorrection=true | B:126–129 的 NormalizationSize=1000、MaxIntensity=1000、RadiusOverSigma=2.5、Gamma=2.2 未在该 scene properties 中覆盖 |
| `LumiLayer_301-trs-blend` / `LumiLayer` | opacity=70；scale=[103,103,100]；layerType=`Precomp`；blendMode=`SoftLight`；hasTransform=true；hasBlend=true；hasMatte=false；mirrorEdge=false | L:72–84、115–118 的默认值为无变换、opacity=100、Adjustment/Normal |
| `LumiSGlow_278-effect0` / `SGlow` | threshold=0.84；brightness=2.4；glowWidth=0.13；widthX=0.41；widthY=0.65；widthRed=widthGreen=widthBlue=1；quality=0.2；dither=1 | G:62–82 默认 threshold=0.5、brightness=2、widthGreen=1.2、widthBlue=1.4、dither=0 |
| `LumiLvFilter_278-effect2` / `LVFilter` | uniAlpha=0.8；lutImage=`resource/images/reference map2.png` | V:14–20 默认 lutImage=nil、uniAlpha=1 |
| `LumiLayer_278-trs-blend` / `LumiLayer` | opacity=64；scale=[100,100,100]；layerType=`Adjustment`；blendMode=`Normal`；hasTransform=true；hasBlend=true；hasMatte=false；mirrorEdge=false | L:72–84 默认 hasTransform=false、opacity=100 |

两个图层均编码 position=anchorPoint=[937.5,1250,0]、compositeSize=layerSize=[1875,2500]、orientation/旋转=0、active_cam_fovx=39.6。SGlow 另有旧字段 widthR/G/B，但算宽度使用 widthRed/Green/Blue（G:168–173）；不能用旧别名覆盖新字段。

SC 中仅存在 `LumiSGlow_278-effect0`，没有 `effect1` Entity。E:35 等位置保留第二组登记，不足以实例化第二个节点。首次由引擎把 scene properties 写入 Lua 对象的具体顺序尚未直接观测；这不影响区分“scene 配置”与“构造默认值”，但不能声称已追踪全部宿主初始化调用。

### ExportData 仍有一部分生效路径

M:89–157 导入 E、读取参数和时长、构造 ParamsSetter。**读入不等于应用参数表**：M:391、394、397、401 的 initParams、updateKeyFrameData、updateSlider、updateFade 调用都是行注释。P:349–360 确实定义了批量赋值函数，但本包 Lua 中未找到其他活跃调用点。因此，这条包内 update 路径不会自动用 E.ae_attribute 覆盖 SC 参数。

不能进一步扩大为“ExportData 完全无效”。这些调用仍活跃：

- M:273–293 根据 E.ae_durations 设置图层的 srcDuration/baseDuration。
- M:383–387 递归设置 startTime/endTime/curTime/aeTime。
- M:405–417 用 nodeDuration 更新 Entity 可见性。

通用扩展 O:29–67 注册子对象，并写入 `__lumi_obj_ext`；没有给每个 Layer 自动创建 `LumiLayer_301` 字段。其纹理 setter（O:129–134）也不等于完整的 scene 标量初始化机制。

“这些被注释的调用不执行”是当前包源码事实。“任何宿主都无法额外调用其函数”则不是本次证据能支持的结论。

## 2. 外部时间与内部 aeTime

E:3–7 编码 compDurations=[0,0.03333333333333]、effectType=`xtEffect`。M:123–124 会从结束时间减去 0.00001。

若 `Amaz.Macros.EditorSDK` 为假，M:370–371 对 xtEffect 使用区间中点，得到 **aeTime≈0.016661666666665 秒**。所以外部 timestamp=0 不能直接解释为此分支内部 aeTime=0。

若 EditorSDK 为真，M:374–380 会在上述计算后再次覆盖 aeTime。M:75 的 autoPlay 默认 true，SC 的 `SeekModeScript/LumiManager.properties` 没有覆盖 autoPlay；在此前提下，外部 curTime=0 对应 aeTime=0。SC 中存储的 debugTime≈0.02636133320629597 会被 M:376 更新，不能直接当成播放时的时间值。若宿主另行把 autoPlay 设为 false，则改用 debugTime。`isEditor` 的取值来自 M:1，本次没有读取隔离宿主中的实际宏值。

两个 Layer 的 SC.srcDuration/baseDuration 都是 [0,5]；L:322、375 对纹理存在性使用闭区间判断，而 Manager 对 nodeDuration 使用左闭右开区间（M:411）。上述 0 或中点均在有效区间内；**本例输出稳定不足以反推实际走了哪条时间分支**。SC 内保存的 Layer.aeTime≈0.0138606667 也可能被 Manager 递归时间写入覆盖。

V:38–46 的 seekToTime 不使用传入 time 做颜色动画，只绑定纹理和 uniAlpha。固定外部 t=0 的参考应保留该描述，不扩写成所有组件、所有 Shader 的内部时间均为零。

## 3. intensity 事件：可读公式与可执行前提

### SGlow 的高区间有未解析全局依赖

G:237–258 监听事件名 `intensity`，从 args[1] 读数值。对于 `t≤0.8`，G:244–247 只用普通算术：

```text
threshold = 1 − 0.175 t
brightness = 3 t
```

该分支自身没有区间钳制。上式说明事件 t=0.8 对应 threshold=0.86、brightness=2.4，仍不能替代 SC 的 0.84/2.4。

对于 `t>0.8`，G:249、251、254 调用裸名字 `step`、`mix`。检查 G 全部 260 行，没有定义或导入这两个名字。包内发现的相关定义是 M:430–435 的 **local** mix/step，以及 P:25–27 的 **local** mix。这些函数属于各自 Lua chunk 的词法作用域；即使模块共用全局环境或先后载入，也不会自动成为 G 可见的全局函数。G:1–3 的 exports/类表初始化同样不会把另一个 chunk 的局部变量提升为全局。

如果宿主另行提供与 M 中公式相同的全局 helper，意图可以表示为：

```text
a = clamp((t − 0.8) / 0.2, 0, 1)
factor = 1 + 0.3 a
threshold = 1 − 0.175 t × factor
brightness = 3 t × factor
```

因此 t=1 的 **0.7725/3.9 只是附带 helper 前提的公式结果**，不是本次已验证的原生事件结果。如果全局 helper 不存在，按普通 Lua 语义会在 G:249 调用 nil，尚未到达该分支的参数赋值。现有证据未确定原生宿主是否注入 helper，以及发生脚本错误时宿主如何处理帧输出。

### SoftLight 事件有未初始化对象引用

L:400–406 仅对名为 `LumiLayer_301-trs-blend` 的 Entity 进入写入分支。实际目标是 `self.LumiLayer_301.opacity`，**不是 self.opacity**。

L:62–130 的 new、L:148–163 的 onStart 都没有创建 self.LumiLayer_301；该模块全文件没有对应赋值，SC 的两个 Layer ScriptComponent.properties 也没有此属性。全包仅找到 M:167、422 的同名查找赋值，两处都被注释，而且其 self 是 Manager 对象。即使解除这些注释，也不能据此认为 Layer 的 self 已获得同名字段。

L:177–184 的 setEffectAttr 只更新已存在的非 nil 字段；O:29–67 的注册过程只提供扩展对象引用。这些路径没有填补上述缺口。若宿主没有额外注入对象引用，该事件分支按普通 Lua 语义将索引 nil。因此“SoftLight opacity 必然改成 70t”必须降级为有前提的意图，不能写成已恢复的运行行为。

### LVFilter、Manager 与宿主混合需分别记录

- V:48–52 直接设置 uniAlpha=0.8t，该函数体没有上述缺失 helper/对象依赖；仍需宿主实际分发事件后才执行。
- M:467–485 的 intensity 参数调整代码均被注释。活跃的 M:494–495 只调用 ParamsSetter.onEvent；P:337–347 只记录 sliderInfos 已登记项。E:154–162 的 sliderInfos 为空，示例项均为注释。
- Gaussian 模块 B 全部 309 行没有 onEvent 函数；不能默认全包每个 intensity 参数都随同一事件变化。
- 本次稳定 CGL 参考的 37% 是固定包输出与原图的宿主混合，未发送包内 intensity=0.37。其重复输出只验证当前 provider 路径，不能证明上面事件分支正确，或等同剪映 UI 的分发策略。

本机未发现 lua/luajit 命令，当前 Python 环境也没有 lupa；未为此安装工具。因此这里报告的是源码与作用域审计，**没有把预测的 nil 错误声称为已执行的原生错误日志**。

## 4. 实际 LUT 与方向证据

SC 的 `LumiLvFilter_278-effect2/LVFilter.properties.lutImage` 指向 LI。V:44–46 把它绑定到第二输入。SC 中并存的 LutTex 指向 `effects/LumiLvFilter/image/filter.png`，但 V 没有读取 LutTex；选取 LUT 应按绑定字段而非文件名猜测。

LM 的 `PngMeta(localId=1)` 字段为：

| 字段 | 编码值 |
| --- | --- |
| innerAlphaPremul / outerAlphaPremul | true / false |
| enableMipmap / filterMipmap | false / 0 |
| filterMin / filterMag | 1 / 1 |
| wrapModeS / wrapModeT / wrapModeR | 1 / 1 / 1 |
| maxAnisotropy / maxTextureSize | 1 / 0 |
| isColorTexture | false |
| needFlipY | true |

这里保留二进制枚举数值，不仅凭字段名推断全部后端采样器实现。LI 解码为 512×512 RGBA，RGBA SHA-256 为 `f9f142849b99e77d5b9174b054c7634d0945f6fd731c4133def07900d0bd9239`；本次检查全部 Alpha=255，所以该 LUT 自身的 premultiply 标志不会改变其 RGB 字节。

LS:13–27 用 blue×63 的相邻两个切片、8×8 排列和 texel center 取样；LS:28–29 明确翻转 LUT 采样 y。LS:30 按 uniAlpha 混合，LS:46–50 再按输入 Alpha 混合 RGB，并保持输入 Alpha。**metadata.needFlipY 与 Shader 的翻转同时存在是已证事实；宿主资源加载与 CPU top-down 行序之间最终是否抵消，还需具体加载/读回约定或独立实验确认。** 本文不以较小全图误差代替这个因果验证。

GM 的 `Mesh(localId=1).vertices` 是 36 个 little-endian float，四顶点、每顶点 36 字节；vertexAttribs 编码 position(offset=0,count=3)、color(offset=12,count=4)、UV(offset=28,count=2)。顶点位置到 UV 为 (-1,-1)→(0,0)、(1,-1)→(1,0)、(1,1)→(1,1)、(-1,1)→(0,1)。这固定了作者网格低 y 对应低 v；还须结合相机投影、上传和读回行序才能确定 C++ top-down 像素的 dither v 方向，不能只看顶点 Shader 传递 UV 就完成方向证明。

## 5. 仍须明确的语义边界

1. 原生宿主如何注入 scene properties，以及是否注入全局 step/mix 或 Layer 对象引用，未逐项动态读取。
2. 当前隔离 CGL 宿主的 EditorSDK 宏、事件分发范围/顺序和脚本错误传播，不能从稳定最终图反推。
3. “无事件静态 profile”应固定 SC 参数；“模拟包内事件”必须另立契约，并保留上述依赖，不能悄悄修复后称为原包行为。
4. LUT组合方向已有后续单因素验证：对实际图集额外翻转Y，三个输入的MAE从0.020631–0.054485升至56.906410–78.598417，支持当前top-down查表约定；这仍不是直接截获原生加载翻转。dither UV结合网格与宿主上传／读回关系的审计见 [SGlow语义](semantic-glow.zh.md)。坐标约定不能作为误差调参项隐含切换。

私有结构解析见 `/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/soft-glow/all-serialized.private.json`。静态场景摘录与原生多输入参考见 `/Users/peter/Downloads/QCut-Independent-Soft-Glow-2026-09-06/scene-summary.private.json`、`effective-scene-parameters.private.json`、`oracle/manifest.json`。它们提供本机核查材料，不纳入可公开的独立源码项目。
