# 电影柔光：AGFX 资源图与自有结构近似的差异

本文记录独立 C++ 重建之前的结构近似基线，以下产品状态均指该实验阶段。后续实现及最终验证见 [UI 与视频验证报告](soft-glow-ui-video-verification-2026-09-06.zh.md)。

日期：2026-09-06。资源 `7447126702137904420`，版本 `9673f80b8e2f5a07f02f9ce1130b784a`。

同日更正：随后为独立 C++ 实现深解 main.scene 的 Entity、ScriptComponent 和材质引用，确认旧摘要把 ExportData 中未实例化的第二组 SGlow、未执行的初始化参数，以及未实际绑定的 `filter.png` 当成了有效图。下文已纠正；原有结构路径和原生的实测指标不变。完整证据见 [有效图与参数](../../../research/independent-soft-glow/graph-evidence.zh.md)。

## 本轮结论

固定 320×180 RGBA 输入、同一强度下，现有 QCut CPU 结构近似与本机原生 CGL provider 存在可重复的大差异。100% 强度 RGB MAE 为 **22.907616**，RMSE 为 **33.090460**；一条 1 像素白线在原生结果中保持白色，在结构近似中降至 `[25,25,25]`。

原生对照在两个独立进程内分别连续渲染六帧，12 张输出逐字节相同。结构近似自身重复也相同。因此这一差异不能用本轮参考输出抖动或编码损失解释。

这是独立实现的缺口，不是本轮发现的普通产品预览回归：该卡当前产品注册为 `native-local`，正常路径使用原生 provider；本实验显式调用已存在的自有结构处理器，评估其独立替代能力。`QCut Metal` 的独立 graph profile 尚不包含该卡。没有修改产品 renderer、profile、测试、剪映应用或运行中进程。

## 版本与输入固定

检查时分支为 `timeline-fixed-prfix`。工作区存在其他独立滤镜任务的未提交修改；本案例只新增此文档，实验脚本与媒体留在仓库外。实际调用的 QCut 源文件 SHA-256 已写入 `case-metrics.json`。

| 项目 | 本轮值 |
| --- | --- |
| 精确包 | `~/Movies/JianyingPro/User Data/Cache/artistEffect/7447126702137904420/9673f80b8e2f5a07f02f9ce1130b784a` |
| 文件数 | 121 |
| 包树 SHA-256 | `9db2974298a914c4a465c4fc42a1e797f4c2e416bd2d9442d2ab57174526f971` |
| 输入 | 自行生成的灰阶、肤色、RGB 色块、暗底亮圆/方块和 1 像素白线；320×180，全部 Alpha=255 |
| 输入 RGBA SHA-256 | `74fea03ff5679c7b4996c7677dea3c9fa99ddeb6f9393cffe87013dd15c51066` |
| 时间戳 | 每次均为 0 秒 |
| 原生入口 | `createJianyingFilterLocalRenderSession`，`mode: multi-pass` |
| 原生运行时 | QCut 私有兼容快照；`libcccreator` arm64 UUID `D6342ECD-5432-33F0-A2AD-0C28F5699994` |
| 该快照 AGFX | arm64 UUID `57ECC10F-8BB8-319C-BA46-AF286E2EBD43`，SHA-256 `1b9493940eebda3b79d72b7308adf8abfbff56c9cfce9d7d73b31cd080453eee` |

包树哈希按相对路径排序，依次哈希 `path + NUL + bytes + NUL`；与已有四方验证文档的固定包一致。本轮运行时不是已安装剪映 11.3.0 的运行时；安装版 AGFX 的纯格式转换探针另见 [AGFX 纹理契约](agfx-texture-contract-2026-09-06.zh.md)。不能把两条证据写成同一次 Metal 执行 trace。

## 包中实际有哪些处理阶段

依据当前精确包的序列化对象、资源引用及 Lua 控制参数，处理链至少需要区分以下部分：

1. GaussianBlur：带反 gamma 校正，初始强度 70、quality 0.2；内部可选半、四分之一、八分之一尺寸。
2. SoftLight 图层：opacity 70%，几何 scale 103%，需要保留与原图的独立合成关系。
3. **一组实际实例化的** SGlow：scene threshold 0.84、brightness 2.4，glowWidth 0.13，横纵宽度 0.41/0.65，RGB 宽度系数均为 1。ExportData 中第二组没有对应 Entity；其参数不属于当前渲染图。
4. tiled LUT：实际 `lutImage` 绑定 `resource/images/reference map2.png`，512×512 图集、64³ cube，scene `uniAlpha=0.8`。ExportData 的 0.64 初始化调用被注释；收到 intensity 事件后脚本另设为 `0.8 × intensity`。
5. 最终 Normal 图层：opacity 64%，base 是 SoftLight 输出，不是原始输入。

当前目录检测器标记 `passCount: 10`，这是其拓扑类别计数；它不是本轮逐帧统计到的十次 GPU draw call。实际 SGlow 包含 mask、两对横纵 blur 和 blend 相机，不能把目录数字当作实际运行图的完整 Pass 列表。

SGlow 的 intensity 事件代码以0.8分段，但高分支依赖本模块未定义的全局step/mix；Layer事件也引用了本模块未初始化的self字段。不能仅凭公式认定整条事件路径可执行。scene初始值、代码意图和实际事件执行需分开，详见 [生命周期语义](../../../research/independent-soft-glow/semantic-lifecycle.zh.md)。本轮没有改写这些包内脚本。

## RenderTexture、尺寸、格式和采样

本轮使用仓库已有 `%SerializedFormat%@` 解析器读取包内全部 **40 个序列化文件**，包括 scene、rt、material、xshader 和 PNG meta。全部已解码字段中未发现数值 127。13 个 `.rt` 的 `internalFormat` 均为 **43**；除输出占位资源的 `colorFormat=0` 外，其余为 43。

| 资源组 | 数量 | 文件中声明的宽×高 | 运行时尺寸规则 | 采样相关声明 |
| --- | ---: | --- | --- | --- |
| GaussianBlur `downsampleX2/Y2` | 2 | 360×640 | 输出纹理尺寸 ÷2 | min/mag=1，wrap S/T/R=1 |
| GaussianBlur `downsampleX4/Y4` | 2 | 180×320 | 输出纹理尺寸 ÷4 | 同上 |
| GaussianBlur `downsampleX8/Y8` | 2 | 90×160 | 输出纹理尺寸 ÷8 | 同上 |
| SGlow `BlurTex/BlurTex2/BlurTexTmp` | 3 | 240×426 | quality 0.2 给出宽度上限 240，保持纵横比后向下取整 | min/mag=1，wrap S/T/R=3 |
| `LumiTempRT0/1/2` | 3 | 720×1280 | Lumi 图的中间输出；本轮未拦截最终分配尺寸 | min/mag=1，wrap S/T/R=1 |
| `outputTex` | 1 | 0×0 | 输出占位资源，由宿主/图绑定实际输出 | min/mag=1，wrap S/T/R=1 |

这些 `.rt` 都声明 `dataType=1`、`enableMipmap=false`、`filterMipmap=0`。因此“有多个降采样目标”和“开启 mipmap”是不同事实。结构 fallback 的 `mipLevels=2` 是自有近似语义，不是这份包声明的 mip 层数。

在本轮输入尺寸下，GaussianBlur 初始强度 70 的脚本选择半尺寸，对应 160×90；SGlow 的尺寸规则计算为 240×135。这里前者是脚本规则推导，后者也是按脚本参数计算；没有把它们标成 GPU 分配回执。非整除尺寸及后续事件改变强度时仍应单独验证。

SGlow 参数的 `edgeMode=1` 在该脚本中解析为 `Reflect`；这与 RenderTexture 的 wrap 枚举是两个层次。表中的序列化枚举保持原数值，不能直接作为 Metal 的 sampler 枚举使用。

LUT 的 PNG meta 还声明：`needFlipY=true`、`innerAlphaPremul=true`、`outerAlphaPremul=false`、`isColorTexture=false`、mipmap 关闭。独立采样器需要明确资源加载时的翻转、颜色标记和图集 texel-center 规则。

安装版 AGFX 的独立格式转换探针确认该版本 `AMGPixelFormat 43 → Metal 70 (RGBA8Unorm)`；这支持继续追踪格式 43，但没有证明本轮旧版 CGL 宿主每一张中间纹理的最终 GL/Metal 分配格式。**127 是其他复杂卡的待查问题，不是这张电影柔光卡已观察到的格式。**

## 自有结构路径做了什么

本轮调用当前工作区的 `loadJianyingMultiPassRecipe` 和 `applyColorMultiPass`，没有重新实现一份近似算法。读取的 recipe 为：

- bloom：threshold 0.86、radius 13、amount 70、scale 0.25、RGBA8、两档 blur 半径、mirror 边界。
- LUT：目录识别器选择同一包的 `effects/LumiLvFilter/image/filter.png`，64³ cube、强度 80%。这张图与实际场景绑定的 `reference map2.png` 不同，是结构近似的另一处不匹配。

`applyOperationAtScale` 将整个输入先缩为 80×45，在这个尺寸完成 bloom，再放大到 320×180，随后应用 LUT。它没有单独保留原分辨率 source 分支，也没有上述 SoftLight 图层、真实 SGlow 的两路 blur 合成和最终 Normal 合成链。

关键代码入口：

- `electron/native-pipeline/filters/filter-lab-multi-pass.ts`：结构 recipe。
- `apps/web/src/lib/color/multi-pass-pixel-processor.ts`：`applyOperationAtScale` 与 Pass 顺序。
- `apps/web/src/lib/color/multi-pass-long-tail-operations.ts`：亮度阈值、blur 与 screen 合成。
- `electron/jianying-filter-multi-pass-loader.ts`：当前产品把这张固定版本卡注册为 `native-local`。
- `electron/jianying-filter-local-runtime/package-preparer.ts`：固定包树校验及 `unchanged-package` 处理。

## 对照方法与实测

先尝试既有 Swing 原生宿主，固定输入、强度 100、t=0，最多六帧。它没有达到连续三帧 SHA 一致，且一次返回值与输入 SHA 相同。该尝试已停止，错误日志保存在 `run.log`，没有从中挑选与 QCut 最相似的一帧。包中虽有 dither 参数，但本轮没有证明 dither 就是该宿主波动的原因。

随后使用这张卡已有产品验证覆盖的 CGL `multi-pass` 路径。每个强度使用两个新进程，每个进程固定采六帧，并保留全部输出。结果先选定为第六帧，再对全部十二帧交叉检查；没有按误差挑帧。CGL provider 的 bootstrap 使用 PPM，本例输入完全不透明，因此该传输保留同一 RGB 数据；最终比较直接使用 RGBA，PNG 只用于查看，没有 H.264、色度抽样或有损编码。

| 整体强度 | 结构 vs 原生 RGB MAE | RGB RMSE | PSNR | 单通道最大差 | Alpha 最大差 | 原生 12 帧一致性 |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 100 | 22.907616 | 33.090460 | 17.736747 dB | 230 | 0 | 全部逐字节相同 |
| 37 | 10.572650 | 18.609774 | 22.735982 dB | 233 | 0 | 全部逐字节相同 |

100% 对照是主要证据。37% 对照测量的是当前两个后端的强度语义：此卡的 CGL `unchanged-package` provider 对完整效果做输出混合，结构处理器则把 overall intensity 分别传入各 Pass。它不证明两条路径向包内事件发送了相同的 0.37，也不是剪映 UI 的 37% 对照。

两种强度下，结构输出自身重复逐字节相同；结构 0% 与输入逐字节相同。100% 原生与输入 RGB MAE 22.816209，确认使用的参考确实改变图像。

### 最小可见反例

坐标采用输入左上原点，像素 `(160,150)` 是暗背景中的 1 像素白线：

| 输出 | RGB |
| --- | --- |
| 输入 | `[255,255,255]` |
| 原生 100% / 37% | `[255,255,255]` / `[255,255,255]` |
| 结构 100% / 37% | `[25,25,25]` / `[22,22,22]` |

这与结构路径先把完整源缩小四倍的行为一致。降低用户强度也没有恢复白线，因为缩放仍作用在整个 source 上。对比图已检查：原生保留细线，并在高亮边缘产生扩散；结构近似丢失细线、亮圆边缘呈现低分辨率轮廓。

## 下一步独立实现需要补什么

1. **保留完整 source 分支**：降采样只能作用于需要低分辨率计算的支路；按包的图关系回到原尺寸合成。先把白线反例设为回归输入。
2. **恢复真实组合顺序**：GaussianBlur、反 gamma、带 103% 几何缩放的 SoftLight、实际一组 SGlow 的两路 blur、正确绑定的 LUT 和最终 Normal 合成不能压成一个 bloom。
3. **明确每个节点的有效参数**：初始导出属性、intensity 事件、onUpdate 材质写入分别记录；特别覆盖 0、0.37、0.8、1 及重复事件。
4. **追到 AGFX 分配与 sampler 边界**：验证实际尺寸、格式 43 的上层/底层转换、枚举映射、需要翻转的 LUT 与 Pass 量化，而非将所有目标凭名称设为统一格式。
5. **分开原生宿主与产品验收**：先对本轮稳定 CGL 参考重现，再与剪映 UI 无损输出对照。当前只覆盖静态合成图；没有新增真人运动、透明输入、HDR、编辑器或导出 E2E。

## 文件与重现

私有证据目录：`/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/soft-glow/`。

- `run-case-cgl.ts`：复用工作区现有实现的实际对照脚本。
- `case-metrics.json`、`metrics-100.json`、`metrics-37.json`：全部原生帧哈希、指标、QCut 源文件哈希。
- `package-identity.json`、`render-target-summary.json`：包身份及 RT 标量摘要。
- `all-serialized.private.json`、`runtime-identity.private.json`：私有解析与运行库证据。
- `comparison.png`：输入 / 结构 100% / 原生 100% 三列。
- `difference-x3.png`：RGB 绝对差放大三倍。
- `manifest.json`：文件大小与 SHA-256，标记本机私有。

从当前仓库目录运行：

```sh
bun /Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/soft-glow/run-case-cgl.ts
```

脚本会在同一证据目录重写自己的生成结果；依赖精确缓存包、QCut 私有兼容运行时和当前工作区代码。二进制、Shader、LUT、完整资源解析、原始帧及实验脚本均不加入仓库。历史四方产品验证见 [电影柔光四方对照](cinematic-soft-glow-four-way-e2e.zh.md)，其通过结论不扩大为本轮自有结构实现的通过。
