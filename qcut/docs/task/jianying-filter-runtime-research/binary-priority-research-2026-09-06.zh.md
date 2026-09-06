# 剪映二进制优先分析：第一轮成果

日期：2026-09-06。工作区 `/Users/peter/Desktop/code/qcut/qcut`，分支 `timeline-fixed-prfix`。

第一轮按“先解决独立滤镜渲染的实际差距”的优先级，分析 `libAGFX`、`libvideoeditor` 和 `libVECreator`，并用电影柔光建立可重复的失败基线。第一轮结束时已完成定点二进制分析、隔离探针、数值对照和文档，尚未实现电影柔光的完整独立渲染器。

本文保留第一轮的分析范围和证据。随后已完成独立 C++、UI 强度语义及 QCut 预览/导出验证，最终状态见 [UI 与视频验证报告](soft-glow-ui-video-verification-2026-09-06.zh.md)。

## 成果入口

| 部分 | 本轮新增证据 | 文档 |
| --- | --- | --- |
| GPU 格式、采样、同步 | 原生转换函数 7/7 用例；采样器映射；scheduled 与 completed 的真实区别 | [AGFX 纹理契约](agfx-texture-contract-2026-09-06.zh.md) |
| 编辑器模型与时间 | 数值原样保存；关键帧传递；序列区间与 Clip 本地区间分别构造 | [videoeditor 调用链](videoeditor-filter-chain-2026-09-06.zh.md) |
| UI 数值与提交 | 默认值、精度、连续更新／接受更新、多选与重置请求 | [VECreator 强度参数](vecreator-filter-params-2026-09-06.zh.md) |
| 实际单卡差距 | 精确资源图检查；结构近似与稳定原生输出的 RGBA 对照 | [电影柔光案例](soft-glow-agfx-case-2026-09-06.zh.md) |

自有可重跑代码：[agfx-format-probe.mm](../../../research/jianying-runtime-probe/agfx-format-probe.mm)。
完整私有证据根目录：`/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/`。

## 最重要的四个结论

### 1. 电影柔光的差距已有稳定测量

精确资源为 `7447126702137904420 / 9673f80b8e2f5a07f02f9ce1130b784a`。固定 320×180 RGBA 色块／边缘图、相同时间和输入，不经过有损视频编解码：

| 外层强度 | 自有结构近似 vs 原生：RGB MAE | RGB RMSE | 单通道最大差 |
| --- | ---: | ---: | ---: |
| 100% | 22.9076 / 255 | 33.0905 / 255 | 230 / 255 |
| 37% | 10.5727 / 255 | 18.6098 / 255 | 233 / 255 |

Alpha 相同。每个强度的 CGL 原生参考经过两个独立进程、每次六帧的固定时间重放，共 12 份输出完全一致；结构近似自身重复稳定且零强度恒等。100% 是主要对照；37% 比较的是两个后端各自的外层强度语义，CGL provider 对完整结果做输出混合，不能视为两者均向包内发送 intensity=0.37，更不代表剪映 UI 的 37% 结果。

差距足够大，当前不能将简单 bloom + LUT 当作独立复刻。结构近似先把整张源图降至 25% 再放大，丢失了原图细节。随后深解scene确认真实图包含多级工作尺寸、SoftLight 103%缩放及一组SGlow的RG／BA两条模糊支路；ExportData里的第二组没有实例化。独立实现及语义验证已另行完成，见 [算法语义契约](../../../research/independent-soft-glow/semantic-contract.zh.md)。

### 2. 数字格式不能跨层猜测

电影柔光的 13 份 `.rt` 都声明 `internalFormat=43`。当前已安装 AGFX 的实际转换证明 `43 → Metal 70 → RGBA8Unorm`；七个用例均通过，含 unsupported 值与边界值。

此前其他复杂滤镜记录出现过未解释的 `127`，但它没有出现在本轮柔光格式字段中。将 127 直接传入当前 AGFX Metal 转换器会返回不支持，不能直接把它当 RGBA8 或浮点格式。

### 3. 外层强度保持归一化值，百分比埋点是另一条路径

VECreator 的强度请求保留输入 double；已恢复的 videoeditor 材料 setter 和滤镜关键帧转换也没有再除以 100。Creator 中的 `×100 + round` 位于操作埋点分支。

尚未完全接通 `UpdateGlobalFilterReqStruct` 到最终效果事件的所有中间步骤，也未证明 UI 输入框的除 100 在哪一层发生。这些局部数据流不能被拼成未经验证的完整调用栈。

### 4. 时间和 GPU 同步需要明确区分

videoeditor 的特定 AmazingFilter 子类型会把 Clip 本地裁切起点归零，但保留原序列位置。电影柔光是否采用这个子类型尚未观测；后续对照要同时记录序列时间、本地时间和关键帧偏移。

AGFX 中 `commitCommandBuffer(true)` 等待 `waitUntilScheduled`；`finish()` 的路径使用 `waitUntilCompleted`。因此 CPU 读回的完成条件应以实际 API 为准，不能根据函数名中出现 commit、sync 推断。

## 证据版本必须分开

前三份二进制报告分析的是**当前已安装剪映 11.3.0**。每份报告记录原始文件 SHA-256 和 ARM64 UUID，格式探针拒绝未知二进制。

电影柔光像素参考使用 QCut 既有的 **D634 私有 CGL 兼容运行时**，不是当前已安装 AGFX 的 Metal 渲染。其 `libcccreator` UUID 为 `D6342ECD-5432-33F0-A2AD-0C28F5699994`，AGFX UUID 为 `57ECC10F-8BB8-319C-BA46-AF286E2EBD43`，具体身份见单卡报告。

因此，本轮已证明“结构近似与稳定的私有原生参考有明显差距”，没有证明“已安装剪映 UI 与新独立 Metal 后端逐像素一致”。也没有把旧文档中的 UI 或导出验证次数计入本轮。

## 下一轮执行顺序

1. 电影柔光的独立多Pass已另行完成：保留原图分支、各级尺寸、SoftLight、一组SGlow的RG／BA支路、实际绑定LUT和最终混合。后续以语义契约中的未确认项继续验证。
2. 给每级输出添加仅用于研究的无损读回，对照采样尺寸、RGBA8 量化、强度和 Alpha；用当前确定的稳定 CGL 参考作为首个门槛。
3. 独立渲染与参考接近后，再补当前剪映 UI 的同输入无损输出，解决版本、宿主与预览／导出差异。
4. 跟进 Creator 请求到 videoeditor 的服务端处理、重置默认值，以及该卡的 subtype 和时间语义。
5. 完成这个闭环后，再按功能目标扩展 `liblens`（防抖／补帧）和 `libbytenn`（降噪／分割）；本轮未分析这些库的算法。

## 文件与验证边界

本轮只增加研究探针和这组文档，没有修改现有滤镜实现、目录注册、用户草稿或应用包。已有并行的独立滤镜迁移 WIP 保留；未提交、推送或发布。

原始二进制、反汇编、资源元数据、图片与结果日志只存放在仓库外。仓库内是自有诊断代码、原创解释及定位信息。各分报告区分静态证据、实际调用和像素实验，所有未完成的链路继续标为未确认。
