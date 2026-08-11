# 剪映滤镜运行时：当前覆盖与剩余边界

更新日期：2026-08-11

## 先说结论

把已列出的八组问题全部搞懂，确实能解决剪映滤镜运行时的绝大多数技术问题，但要按滤镜类型区分：

- 普通 LUT 与多 Pass 滤镜：核心执行语义已经跑通，当前可高置信覆盖大部分纯调色、纹理叠加、暗角、
  旧影和常见多 Pass 组合；不能从三个普通多 Pass 样本外推成 883 个卡片全部完成。
- 人像与区域滤镜：主要链路已定位，仍受私有人像模型、宿主配置和许可边界限制，尚不能宣称完美复刻。
- 预览与导出：独立宿主的状态边界和销毁已验证；真实剪映导出子进程的外围调用序列仍未直接捕获。

## 能力矩阵

| 领域 | 当前状态 | 已证明 | 仍缺少 |
| --- | --- | --- | --- |
| 单 LUT / 纯调色 | 已掌握 | 本机二进制重放与 UI 可做到逐像素一致 | 批量验证更多卡片；产品侧需自有或获授权实现 |
| 普通多 Pass | 已掌握核心语义 | 清透美食、暗角旧影、迷雾在显式 `intensity=1` 后 RGB 完全一致；迷雾覆盖四段 blur/mask/screen/LUT graph | 半分辨率、浮点/HDR 中间格式和动画纹理的代表性样本 |
| 外部纹理与 sampler | 已掌握代表样本 | 暗角旧影的 `src1.png` 绑定、坐标、Y 翻转、Alpha 与 pass 链可完全一致 | 其他纹理用途，如噪声、光泄漏、位移和动画纹理 |
| UI 强度映射 | 已掌握普通滤镜入口 | `intensity=0` 为 passthrough，`1` 与 UI 100 完全一致 | 非线性强度、分段参数和多 uniform 卡片的逐卡验证 |
| skin mask 交付 | 已掌握独立宿主的静态与首次交付边界 | native texture 第三标志修复；CPU fallback mask 可完整读出；同帧等待前后 1639680 字节零变化且无额外 mask | UI 的恢复动作、动态追踪和真实导出 |
| 分割模型选择 | 已掌握 resolver 差异，纯增益待重测 | UI 与 V2 的逻辑请求和 `support_external_model_name=3` 一致；physical v5.1 会实质改变 mask 与 RGBA | v5.0/v5.1 同 readiness 对照；face-extra 物理映射 |
| 人脸结果 | 部分掌握 | SDK 入口能读到有效人脸框、关键点和 face count | 独立结果 API、关键点到具体人像效果的绑定与逐帧追踪 |
| 素材切换状态 | 已掌握独立宿主策略 | A -> gray -> B 时 manager reset 从 B 首帧起逐字节等于 fresh-B | UI 是否使用更窄 reset，以及 seek 回跳的真实策略 |
| ExportMode | 已排除单一 bool | `ExportMode=0/1` 十帧逐字节一致，销毁顺序一致 | hardened `--lvve-service` 中真实导出 orchestration |
| 视频时序 | 部分掌握 | 连续帧确定性、source-boundary reset 已验证；被动等待不会改写当前纹理，ready 需后续 seek 才被观察 | 同 timestamp re-seek 是否恢复；真实导出的时间戳、并发、flush/wait、跨帧平滑序列 |

## 对“能否解决大部分滤镜”的准确回答

可以，但“大部分”更准确地指普通滤镜的执行框架，而不是每个卡片都已经复刻。

已经足以形成通用执行器的部分包括：效果包加载、pass 顺序、输入输出纹理、外部纹理、sampler、强度事件、
原地输出和同线程/context 生命周期。清透美食、暗角旧影与迷雾三个单变量实验证明，直接执行完整二进制
graph 时，这些语义可以与 UI 完全一致。迷雾还确认三张全分辨率 `PixelFormat 43` 中间纹理、双输入
Screen 混合和联动多个 uniform 的强度事件可以精确重放。

人像美化、背景分离、人物双 LUT 等不能只靠这套普通 graph。它们还依赖 AlgorithmService、模型选择、mask
状态和关键点。旧 `v5.0` 与 UI-resolved physical `v5.1` 的初始对照从
`43.042030 dB` 变为 `48.888033 dB`，证明 resolver 选择的是像素相关的真实模型；但后续实验发现 v5.1
候选首次渲染发生在 CoreML ready 前。相同 v5.1 在受控 ready 后为 `46.780337 dB`，所以旧
`5.846004 dB` 不能全部归因于模型文件。SIMD 0/1 已在受控静态与动态窗口下得到逐字节一致结果，可以排除；
当前关键缺口转为 ready 后的显式恢复动作、关键点和导出路径，因此仍不能称为“完美复刻”。

## 产品边界

研究探针证明了本机互操作性和实现语义，不代表 QCut 可以重新分发剪映 Frameworks、模型、LUT、shader
或效果包。产品落地仍应使用 QCut 自有 LUT/shader graph 与获得授权的分割、人脸能力。私有二进制可以做
本机对照 oracle，不能当作可发布依赖。

## 下一优先级

`support_external_model_name` 已在真实 UI 和独立 V2 的 Swing 初始化处读到相同值 `3`；physical v5.1
也确认会实质改变完整 mask 与 RGBA。SIMD 单变量已完成：两组 runtime 确实读取 `false/true`，在 CoreML
都于最终 preparation 输出前 ready 后，71 张 RGBA 与 72 张 mask 全部逐字节一致，独立复跑同样一致。

首次结果生命周期已经完成一个单变量结论：renderer callback 返回后，同一 V2 纹理在 2 秒 run-loop 等待
前后连续五次都是 `0/1639680` 字节变化，单帧独立复跑也为零，且没有额外 mask 交付。CoreML ready 只有在
后续 seek 中才被宿主观察；它在某次 seek 内出现也不证明该帧已经消费新结果。

下一次只固定 UI v5.1、SIMD、包、manager 和输入，等待后续 seek 已观察到 ready，再对原输入和原时间戳做
一次同 timestamp re-seek，确认旧结果能否被替换。不要同时加入 manager reset、source switch、face-extra、
mode 或导出参数，也不要重复
`amazing param`、Bach result directory、`AlgorithmCacheFlag`、`EnableImageQuality`、
`EnableAdjustColorWithFloat`、manager init mode 或 `ExportMode`。

记录见 [skin-seg-first-result-lifecycle.zh.md](skin-seg-first-result-lifecycle.zh.md)、
[skin-seg-simd-ab.zh.md](skin-seg-simd-ab.zh.md)、
[ui-physical-skin-model.zh.md](ui-physical-skin-model.zh.md)、
[support-external-model-name.zh.md](support-external-model-name.zh.md)、
[model-clip-feature-params.zh.md](model-clip-feature-params.zh.md) 与
[bach-algorithm-model-clip-params.zh.md](bach-algorithm-model-clip-params.zh.md)。
