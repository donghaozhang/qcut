# 剪映滤镜复刻长尾计划（lut-v2）

<!-- markdownlint-disable MD013 -->

**状态：** 可执行计划
**日期：** 2026-08-12
**分支：** `lut-v2`
**代码核验基线：** `c503cc0832ea20d99f359b63306460f78b3d3a7f`（v2026.08.12.1，PR #407 已合并）
**上位设计：** [剪映滤镜运行时：当前覆盖与剩余边界](./current-coverage.zh.md)
**任务前缀：** `FLP-`（Filter Lab Parity；`C91` / `QTL` / `JYI` / `JYR` 已被其他线占用）

## 1. 这一步到底要交付什么

上一阶段（PR #405 / #406 / #407）证明了**普通滤镜的执行框架**：效果包加载、pass 顺序、输入输出纹理、
外部纹理与 sampler、强度事件、原地输出、context 生命周期，都能在本机二进制重放里与剪映 UI 逐像素一致。
但这个结论来自**三个**全分辨率、常规格式的多 Pass 样本，不能外推到本地目录里的 883 张滤镜卡。

本阶段**不以“883 张卡全部复刻”为目标**。要交付的是三件可验证的事：

> 1. 用**分层抽样 + 批量自动对照**代替“三个样本 + 人工外推”，把长尾（降采样中间纹理、浮点/HDR、
>    mipmap、动画纹理、位移图、非线性强度、时变 shader）从“未知”变成**逐类有数据的已知**；
> 2. 把人像链路当前 **46.8 dB** 的缺口收敛为**一个有结论的单变量实验序列**——首要是
>    「CoreML ready 后同 timestamp re-seek 是否替换旧 mask」；
> 3. 把**授权边界**从散落的口头约定变成**代码里可执行的约束**：研究产物只做本机 oracle，
>    产品实现只用 QCut 自有 LUT/shader 与获授权的分割、人脸能力。

以下内容**明确不在本阶段**：重新分发剪映 Frameworks / 模型 / LUT / shader / 效果包；任何加密或授权绕过；
把私有二进制当作可发布依赖；把研究探针接进 QCut 产品运行时。

## 2. 现状核验（写计划时实际读过的代码）

| 领域 | 当前实现 | 关键文件 |
| --- | --- | --- |
| 多 Pass 配方 | 仅 3 种 kind（`sharpen-lut` / `vignette-lut` / `fog-lut`），5 个 operation 联合，pass 参数为**硬编码常量**而非从包内解析 | [filter-lab-multi-pass.ts](../../../electron/native-pipeline/filters/filter-lab-multi-pass.ts) |
| 浏览器渲染 | 每个 pass 在**全分辨率 `Uint8ClampedArray` RGBA8** 上跑；启用 multiPass 时 GPU 路径直接放弃 | [multi-pass-pixel-processor.ts](../../../apps/web/src/lib/color/multi-pass-pixel-processor.ts)、[gpu-color-path.ts](../../../apps/web/src/lib/color/gpu-color-path.ts) |
| 平价度量 | `rgbRmse` / PSNR / SSIM / ΔE76（+ 可选 mask IoU/MAE/edge-MAE、时序指标固定 320x180@6fps/10s）；解码强制 `rgb24` 8 bit | [filter-lab-verification.ts](../../../electron/native-pipeline/filters/filter-lab-verification.ts)、[filter-lab-image-metrics.ts](../../../electron/native-pipeline/filters/filter-lab-image-metrics.ts) |
| 验证存储 | `~/.qcut/filter-lab/verifications.json`，schemaVersion 1，**按 resourceId 单条覆盖写** | [jianying-filter-verification-store.ts](../../../electron/jianying-filter-verification-store.ts) |
| 卡片目录 | `JianyingKnownFilter` 带 `requirements[]` / `sdkModel` / `effectId`；实现分类为 `single-lut \| dual-lut \| shader \| face-ai \| unknown` | [jianying-filter-metadata.ts](../../../electron/jianying-filter-metadata.ts)、[jianying-filter-package-inspector.ts](../../../electron/jianying-filter-package-inspector.ts) |
| CLI | `filter-lab list/compare/match/verify`；**没有**任何命令能导出完整 883 卡目录 | [cli-handlers-filter-lab.ts](../../../electron/native-pipeline/cli/cli-handlers-filter-lab.ts) |
| 运行时探针 | 研究用 C++/ObjC，CGL 3.2 core，全分辨率 RGBA8 raw frame | [research/jianying-runtime-probe/](../../../research/jianying-runtime-probe/) |

三个直接影响排期的事实：

- **长尾能力在数据结构层就不存在**：`FilterLabMultiPassOperation` 没有 scale / 像素格式 / mip 级别 /
  时间参数字段，所以“验证长尾”必须先扩 schema，否则连记录观测结果的地方都没有。
- **抽样没有输入**：完整卡片目录只在 `setupJianyingFilterLabIPC` 内部组装，且 IPC 摘要
  (`JianyingFilterLabFilterSummary`) 丢掉了 `requirements` / `sdkModel` / `effectId`——恰好是分层抽样最需要的轴。
- **验证存储会互相覆盖**：一卡一条、按 resourceId 覆盖写，批量跑几百张卡时无法保留同卡多版本 / 多输入的历史。

## 2.1 首次实测基线（FLP-001 落地后）

`qcut filter-lab catalog --json` 在本机跑出的第一份真实分布（2026-08-12，仅数值结果）：

| 实现类型 | cached | uncached | partial |
| --- | ---: | ---: | ---: |
| `single-lut` | 59 | 0 | 1 |
| `dual-lut` | 21 | 0 | 0 |
| `shader` | 13 | 0 | 0 |
| `face-ai` | 2 | 140 | 0 |
| `unknown` | 0 | 647 | 0 |
| **合计** | **95** | **787** | **1** |

这条数据直接修正了计划的前提：**883 是目录规模，不是可操作规模**。本机只有 96 张卡的包真正缓存下来
（`unknown` 全部来自未缓存包，无法判定实现类型），其中 76 张 `available`。当前验证记录 15 条
（1 verified / 14 close），`multiPassKind` 只有 3 张（`sharpen-lut` / `vignette-lut` / `fog-lut` 各 1）。

因此后续任务的抽样口径统一收敛为：

- **可立即批量对照的总体 = 96 张已缓存卡**，FLP-004 的「30 张抽样」应在此总体内分层；
- `face-ai` 是最大的长尾风险面（142 张卡，仅 2 张已缓存），且 `requirements` 里普遍带
  `skin_seg` / `matting` / `face` / `face_fitting` / `sky_seg` / `scene_normal` —— 直接印证 FLP-005 / FLP-006 的优先级；
- 未缓存卡不作为失败项，而是记为「本机无样本」，需要在剪映里实际使用后才进入可验证总体。

## 3. 任务分解

每项按 **目标 / 主要文件 / 完成条件 / 停止条件** 组织。`停止条件` 是硬边界：触发即停下来记录，不要绕过。

### 进度（2026-08-12）

| 任务 | 状态 | 备注 |
| --- | --- | --- |
| FLP-001 目录导出与抽样 | ✅ | `filter-lab catalog` 实测 883 卡；确定性抽样验证通过 |
| FLP-002 schema 扩展 | ✅ | traits 贯通 contract / electron / editor-core / 快照校验；既有配方逐字节不变 |
| FLP-003 长尾采集 ×7 | ⬜ | 依赖真实运行时探针 |
| FLP-004 批量对照 | 🔶 | v2 存储（复合主键 + v1 迁移）、`verify-batch`、`coverage` 已上线并实测；「30 卡实跑」等 FLP-003 产出参照帧 |
| FLP-005 ready 后 re-seek | ✅ | 静态恢复至 48.888 dB / IoU 0.9626；动态历史证明 discontinuity 必须重建 manager |
| FLP-006 人脸关键点绑定 | ⬜ | 依赖 FLP-005 |
| FLP-007 导出链路捕获 | ⬜ | 依赖 FLP-005/006 |
| FLP-008 授权边界代码化 | ✅ | pre-commit + CI 生效；红线修正为「再分发」并记录 |

### 产品侧补充进展

QCut 自有结构化渲染已新增 `grain-noise`、`light-leak`、`bloom`、`chromatic-aberration` 与
`lens-distortion`，并让浏览器预览和 FFmpeg 导出都能执行。Bloom 的代表配方覆盖 `scale=0.5`、
`pixelFormat=float16` 与三层 blur；真实 FFmpeg 串联烟测输出 1 秒 H.264，六帧哈希各不相同。

这不改变 FLP-003 的状态：FLP-003 要求的是剪映真实代表卡的中间纹理与 UI 无损对照；当前完成的是 QCut
表达与执行能力。详细结果见
[product-batches-and-long-tail-e2e.zh.md](product-batches-and-long-tail-e2e.zh.md)。

### FLP-001 卡片目录导出与分层抽样底座

**目标：** 让长尾覆盖率可以被**测量**而不是被估计。新增 CLI 导出完整卡片目录（含 `requirements` /
`sdkModel` / `effectId` / `implementation` / `renderer.kind` / `passCount` / `cacheStatus` / `verification`），
并提供确定性分层抽样（按实现类型 × 能力标签 × 缓存状态分层，固定种子）。

**主要文件：**

- 新增 `electron/native-pipeline/cli/cli-handlers-filter-lab-catalog.ts`（沿用现有 `bun` + `node:sqlite`
  子进程 shim 模式，见 `cli-handlers-filter-lab.ts` 内注释）
- 修改 [command-registry.ts](../../../electron/native-pipeline/cli/command-registry.ts) 与
  [command-groups.ts](../../../electron/native-pipeline/cli/command-groups.ts) 注册 `filter-lab catalog`
- 新增 `electron/native-pipeline/filters/filter-lab-sampling.ts`（纯函数：分层 + 固定种子取样）
- 复用 [jianying-filter-lab-catalog.ts](../../../electron/jianying-filter-lab-catalog.ts) 的
  `buildJianyingFilterLabCatalog`，把目录组装从 IPC 里抽出到可被 CLI 复用的位置

**完成条件：** `qcut filter-lab catalog --json` 输出全部已知卡片及上述字段；
`--sample N --seed S --stratify implementation,requirements` 对同一目录**两次运行结果完全一致**；
抽样结果覆盖每个非空分层至少 1 张卡。

**停止条件：** 导出内容仅限**本机目录元数据**（id / 标题 / 分类 / 版本哈希 / 能力标签）。
不得导出 LUT 像素、shader 源码、包内文件或任何可重建效果包的数据。

**测试：** `electron/__tests__/filter-lab-sampling.test.ts`（分层与种子确定性、空分层、单卡分层）、
`electron/__tests__/cli-filter-lab-catalog.test.ts`（CLI 契约与字段裁剪，注入假目录，不碰真实缓存）

### FLP-002 多 Pass 配方 schema 扩展（承载长尾语义）

**目标：** 给 `FilterLabMultiPassOperation` 补齐描述长尾所需的字段，使观测结果**有地方落**：
每 pass 的 `scale`（1 / 0.5 / 0.25）、`pixelFormat`（`rgba8` / `float16` / `float32`）、`mipLevels`、
`edgeMode`（clamp / repeat / mirror）、`intensityCurve`（线性 / 分段 / 表驱动）、`timeVarying` 标记。
本任务**只扩类型与序列化**，不改渲染语义；未观测到的卡片保持现有默认值，行为逐字节不变。

**主要文件：**

- [filter-lab-multi-pass.ts](../../../electron/native-pipeline/filters/filter-lab-multi-pass.ts)
  （operation 联合 + `operationsForRenderer` 默认值）
- [jianying-filter-lab-contract.ts](../../../electron/jianying-filter-lab-contract.ts)
  （`JianyingFilterLabMultiPassOperation` 镜像；注意契约注释要求与渲染端类型同步）
- `apps/web/src/types/electron/api-jianying-filter-lab.ts`（渲染端镜像类型）
- [jianying-filter-multi-pass-loader.ts](../../../electron/jianying-filter-multi-pass-loader.ts)（序列化透传）

**完成条件：** 新字段全部可选且有显式默认；三个既有 fixture 的配方 JSON 与扩展前**逐字段等价**；
渲染输出逐像素不变（用既有 fixture 回归）。

**停止条件：** 出现“为了让某张卡对上而临时加字段”的冲动时停下——字段必须来自**观测到的运行时语义**，
不是拟合参数。

**测试：** 扩展 [filter-lab-multi-pass.test.ts](../../../electron/__tests__/filter-lab-multi-pass.test.ts)
（默认值向后兼容、序列化往返、契约镜像一致性）

### FLP-003 长尾类别代表样本采集（探针侧）

**目标：** 为七类长尾各找到**至少一张**本机已缓存的代表卡并采集单变量证据：
①0.5x / 0.25x 降采样中间纹理 ②浮点/HDR 中间格式 ③mipmap 与多级模糊 ④动画噪声/光泄漏/颗粒纹理
⑤位移图与复杂边缘采样 ⑥非线性/分段强度映射 ⑦时变 shader。
每类产出一篇与现有研究文档同构的 `.zh.md`（单一问题 → 探针边界 → 结果 → 结论）。

**主要文件：**

- 复用 [research/jianying-runtime-probe/](../../../research/jianying-runtime-probe/) 的 `filter-sequence`
  探针；按类别新增最小诊断参数（沿用 `JY_*` 环境变量、**默认关闭**的既有惯例）
- 新增文档：`docs/task/jianying-filter-runtime-research/longtail-<category>.zh.md` ×7
- 用 FLP-001 的抽样结果筛候选卡（`requirements` / `passCount` / shader 特征）

**完成条件：** 七类各有一篇结论文档，含**中间纹理分辨率、像素格式、绑定顺序、强度映射曲线**的实测值；
每篇给出「现有 schema 能否表达」的明确判断。

**停止条件：** 单类连续两轮拿不到有效样本即停，记录“本机缓存无代表卡”而不是猜测语义。
探针只做**只读观测**：不改参数、不改模型、不改效果包、不改生命周期。

**测试：** 探针为研究代码不进产品测试面；但每篇文档的数值结论要能被
`electron/__tests__/filter-lab-multi-pass.test.ts` 中新增的 schema 表达性用例引用（把实测值写成 fixture）。

### FLP-004 批量对照流水线与逐卡计分

**目标：** 把「一次验一张」升级成「一次验一批」：对抽样卡片批量跑对照，把每卡分数写成**可累积、可回归**
的记录，覆盖率成为一个能画出来的数字。

**主要文件：**

- [jianying-filter-verification-store.ts](../../../electron/jianying-filter-verification-store.ts)
  （schemaVersion 2：主键从 `resourceId` 改为 `resourceId + version + inputDigest`，保留历史；
  迁移时旧记录整体降级为 `legacy` 条目，不丢数据）
- [cli-handlers-filter-lab.ts](../../../electron/native-pipeline/cli/cli-handlers-filter-lab.ts)
  （新增 `filter-lab verify-batch`：读抽样清单 → 逐卡跑 → 汇总）
- 新增 `electron/native-pipeline/filters/filter-lab-coverage.ts`（纯函数：把验证记录聚合成分层覆盖率报告）

**完成条件：** 对 30 张抽样卡跑通批量对照，产出覆盖率报告（按实现类型 / 能力标签分层的
verified / close / unverified 计数与分数分布）；重跑同一清单**记录可追加不互相覆盖**；
schemaVersion 1 → 2 迁移有测试。

**停止条件：** 报告只写**数值结果与卡片 id/哈希**。参照帧、候选帧、mask 图像一律留在仓库外证据目录
（沿用现有 `docs/task/**` 的证据约定），不进 git。

**测试：** `electron/__tests__/filter-lab-coverage.test.ts`（聚合与分层统计）、
扩展 [jianying-filter-verification-store.test.ts](../../../electron/__tests__/jianying-filter-verification-store.test.ts)
（v1→v2 迁移、复合主键去重、并发写）

### FLP-005 人像首次结果生命周期：ready 后同 timestamp re-seek

**结果：** 本阶段最关键的单变量实验已完成。固定 UI physical `tt_skin_seg v5.1`、SIMD、效果包、manager
与输入，等待后续 seek 已观察到 CoreML ready，再对原输入、原时间戳 re-seek。静态历史下结果达到
`48.888033 dB / mask IoU 0.962641`，两次复跑逐字节一致；经过 60 张静态帧与 10 张运动帧后再回跳则降为
`40.140233 dB / 0.265185`，两次复跑仍逐字节一致。

这证明显式 re-seek 会重新交付结果，但不会清除 segmentation 时序历史。结合已完成的 source-switch reset
实验，连续 clip 复用 manager，clip/source 变化或向后时间跳转时重建 manager 与 AlgorithmService。

**主要文件：**

- 探针：[research/jianying-runtime-probe/filter-probe.mm](../../../research/jianying-runtime-probe/filter-probe.mm)
  （新增默认关闭的 re-seek 诊断参数，形如 `JY_RESEEK_AFTER_READY=1`）
- mask 观测：`docs/task/jianying-filter-runtime-research/probes/skin-seg-result-capture.cpp`
- 结论文档：更新 [skin-seg-first-result-lifecycle.zh.md](./skin-seg-first-result-lifecycle.zh.md)
  与 [olympus-portrait-filter-e2e.zh.md](./olympus-portrait-filter-e2e.zh.md)，并在
  [current-coverage.zh.md](./current-coverage.zh.md) 能力矩阵回填

**完成条件：已满足。** 同 timestamp re-seek 会替换首次 mask；静态与动态恢复的字节哈希、RGB、mask 指标
均已记录，能力矩阵的「视频时序 / skin mask 交付」两行已回填。

**停止条件：** 严格单变量。本轮**不得**同时引入 manager reset、source switch、face-extra、mode 切换或导出参数；
也不得重复已有结论（`amazing param`、Bach result directory、`AlgorithmCacheFlag`、`EnableImageQuality`、
`EnableAdjustColorWithFloat`、manager init mode、`ExportMode`）。

**测试：** 研究实验无单测；但结论一旦确立「ready 后需要显式 re-seek」，
QCut 侧对应的等待/重取语义要在 `electron/__tests__/` 增加行为用例（见 FLP-007）。

### FLP-006 人脸关键点与高级美化语义

**目标：** 回答四个绑定问题：（a）关键点如何绑定到具体美妆/整形效果；（b）多人时人脸如何分配；
（c）磨皮/美白/五官调整的参数语义；（d）tracking、遮挡、转头、进出画面时的行为，以及 mask 羽化与跨帧稳定、
source switch / seek 回跳后的缓存重置。

**主要文件：**

- 探针：`docs/task/jianying-filter-runtime-research/probes/feature-params-capture.cpp`、
  `bach-algorithm-params-capture.cpp`
- 已有边界文档：[model-clip-feature-params.zh.md](./model-clip-feature-params.zh.md)、
  [bach-algorithm-model-clip-params.zh.md](./bach-algorithm-model-clip-params.zh.md)、
  [source-switch-manager-reset.zh.md](./source-switch-manager-reset.zh.md)
- 新增文档：`face-keypoint-binding.zh.md`、`face-multi-subject-assignment.zh.md`

**完成条件：** 至少确定单人场景下关键点→效果的绑定路径与一个可复现的参数语义（例如磨皮强度到 uniform 的映射）；
多人分配给出观测到的排序规则（面积 / 置信度 / 首次出现顺序）。

**停止条件：** 本任务依赖私有算法服务，**只做只读语义理解**。不实现、不移植、不打包任何剪映人脸/分割模型。
产品侧美化能力必须走 QCut 自有或获授权实现（见 FLP-008）。

**测试：** 语义结论落到 QCut 侧的参数映射时，在
`apps/web/src/lib/filters/__tests__/` 增加映射函数单测（纯函数，不含任何私有模型）

### FLP-007 真实导出链路（`--lvve-service`）时序捕获

**目标：** `ExportMode=true/false` 已被证明不是决定性变量，缺口在 UI 真实导出子进程的**外围调用序列**：
初始化与预热顺序、timestamp 与 seek 策略、async flush/wait、跨帧缓存、clip 切换 reset、色彩空间与像素格式、
销毁与资源回收顺序。目标是拿到这条序列，避免「静帧预览正确、导出视频闪烁或偏色」。

**主要文件：**

- 已有结论：[export-mode-lifecycle.zh.md](./export-mode-lifecycle.zh.md)（`ExportMode` 单变量已排除）
- 新增文档：`export-orchestration-capture.zh.md`
- QCut 侧对照：[color-multi-pass-filter 导出链](../../../electron/native-pipeline/filters/)（FFmpeg filter_complex 构建）

**完成条件：** 产出一份导出调用时序表（阶段 → 调用 → 参数 → 观测证据），
并明确 QCut 现有导出链在哪些阶段与之不同。

**停止条件：** 目标进程为 hardened `--lvve-service`。**不得**为了注入而禁用系统完整性保护、
修改代码签名、绕过 hardened runtime 或任何授权机制。若在合规手段下无法观测，
结论就写「当前手段不可观测」，并转为**用 QCut 自有导出链做端到端时序自证**（连续帧无闪烁、色彩空间一致）。

**测试：** `electron/__tests__/` 增加导出时序回归：同一段落连续 N 帧导出，
校验帧间无跳变（复用 [filter-lab-image-metrics.ts](../../../electron/native-pipeline/filters/filter-lab-image-metrics.ts)
的时序指标）与色彩空间标记稳定

### FLP-008 授权边界代码化

**目标：** 把「研究可用、产品不可用」从文档约定变成**构建期可执行的检查**，长期防止私有资源渗入产品包。

**主要文件：**

- 新增 `scripts/check-filter-provenance.ts`（沿用 [check-boundaries.ts](../../../scripts/check-boundaries.ts) 的
  pre-commit 检查模式）：禁止 `.local/jianying-runtime`、剪映效果包、模型文件路径出现在
  `apps/web/` / `electron/`（研究目录 `research/` 与 `docs/task/**` 白名单）
- [package.json](../../../package.json) 的 `prebuild` / pre-commit 挂载
- 文档：更新 [current-coverage.zh.md](./current-coverage.zh.md) 的「产品边界」章节，指向本检查

**完成条件：** 检查脚本在 CI 与 pre-commit 生效；故意构造的违规引用会被拦下；
现有代码库零违规通过。

**实现修正（2026-08-12）：** 首版按「产品代码不得出现私有运行时路径字符串」实现，跑出 52 处命中后发现
前提错了——草稿互操作、字体预检、安装守卫**合法地**引用用户本机 `CapCut.app` / 剪映路径，
filter-lab 与 text-runtime 也合法地读取本机缓存做 oracle。真正可执行的红线是**再分发**，
最终落地为两条纯静态检查：①`git ls-files` 里不得出现私有产物文件
（`libcccreator*` / `tt_skin_seg*` / `*.mlmodelc` / `*.bytenn` / `artistEffect/` / `rp.db` /
`.local/jianying-runtime/`）；②electron-builder 的 `files` / `extraResources` 不得打包
`research/` 或 `.local/`。字符串引用一律合法。

**停止条件：** 检查只做**静态路径与依赖**判定，不做内容启发式扫描（避免误报拖垮 CI）。

**测试：** `scripts/__tests__/check-filter-provenance.test.ts`（白名单、违规样例、路径规范化）

## 4. 建议执行顺序

```text
FLP-001 ──┬─> FLP-003 ──> FLP-002（用观测回填 schema）──> FLP-004
          └─> FLP-004（先用现有 schema 跑基线覆盖率）
FLP-005 ──> FLP-006 ──> FLP-007        （人像线，可与上排并行）
FLP-008                                 （随时可做，越早越好）
```

理由：FLP-001 是所有批量结论的前置；FLP-008 与其它任务无耦合且能立刻止血；
人像线（005→006→007）串行，因为每一步都依赖前一步的单变量结论。

## 5. 完成判定

本阶段可以宣布完成，当且仅当：

1. 七类长尾各有一篇实测结论文档，能力矩阵对应行从「仍缺少」更新为具体结论；
2. 至少 30 张分层抽样卡跑过批量对照，覆盖率报告可复现；
3. 人像 ready 后 re-seek 有明确是/否结论，并回填能力矩阵；
4. 导出时序表存在，或明确记录「合规手段下不可观测」并有 QCut 自证替代方案；
5. 授权边界检查在 CI 生效。

**不作为完成判定**的事：883 张卡全部 verified（那是长期目标，不是本阶段）；
人像达到 RMSE 0（受私有模型限制，本阶段目标是**解释**差距而非消除）。

## 6. 证据与合规约定（适用于全部任务）

沿用既有约定，不放宽：

- 仓库内只保留**数值结果、卡片 id、哈希与脱敏清单**；参照帧、mask、原始 payload 一律留在仓库外证据目录；
- 不提交剪映二进制、模型、LUT、shader、效果包、缓存、数据库、字体或账号数据；
- 加密或不透明内容保持 **inspect-only**，不做解密或绕过；
- 探针默认关闭，通过显式 `JY_*` 环境变量启用，且只读；
- 产品实现使用 QCut 自有 LUT / shader graph 与获授权的分割、人脸能力；私有二进制只作本机对照 oracle。
