# QCut 自有渲染器：667 张本地 LUT 批量接入

日期：2026-09-06。延续 [首张迷雾产品接入](independent-filter-product-2026-09-06.zh.md)。

## 本轮范围

| 路径 | 数量 | 本轮处理 |
| --- | ---: | --- |
| 单 LUT | 610 | 本地 VF_V / 文本 cube -> 自有 Metal 3D 纹理 |
| 已识别的纯 LUT 图集 Shader | 57 | 本地 8x8 图集 -> 64 级 cube -> 自有 Metal |
| 迷雾 | 1 | 保留已验证的四 Pass 自有 Metal 实现 |
| 合计 | **668** | 独立目录、预览、新 CLI、导出 |
| 其余目录卡 | 224 | 不纳入本轮独立实现，原有剪映路径仍保留 |

本机源目录共 892 张。数量为本次本地缓存快照，不是在线滤镜总数。

**668 张可走独立后端，不等于 668 张已逐卡与剪映 UI 完全对齐。**
这轮新增 667 张证明的是 LUT 解析、采样与产品集成；没有重新制作 667 张剪映 UI 无损参考。
新目录全部保留 `verification: unverified`，不继承旧后端的 verified/close。

## 入口

界面：滤镜 -> 滤镜实验室 -> **QCut Metal**。原有迷雾卡保留，下面新增本地 LUT 目录。
支持按名字/资源 ID 搜索、类别筛选、36 张分页、缩略图、A/B、强度、失败提示和刷新。

```bash
# 新增目录命令，不覆盖旧 catalog
qcut filter-lab catalog-independent --json

# 通用独立渲染，图片/视频均可
qcut filter-lab render-independent \
  --resource-id 7639191499833429274 \
  --filter-version b6e3943e04279f95872fb72042e3a346 \
  -i source.mp4 --output summer-qcut.mp4 \
  --filter-intensity 100 --json
```

旧 `filter-lab render/apply/catalog` 保持原语义。`render-independent` 继续要求显式输出路径，默认不覆盖现有文件。

## 实现与边界

- `electron/qcut-independent-filter/lut-catalog.ts`：共享目录筛选、版本锁定、本地资源加载。只接受可用、完整缓存、单 LUT，以及明确识别的 tiled-lut；排除人脸/分割能力、模型、双 LUT 和已识别的额外 Pass。
- `lut-data.ts`：校验 2-65 级 cube、值数、有限数值和 0-1 输入域；按 R 最快、G 次之、B 最慢编码 float32 RGBA。
- `host.mm` / `fog.metal`：新增 `--cube N` 模式，一次上传 RGBA32Float 3D LUT；半 texel 中心坐标、三线性采样、一次强度混合、RGBA8 输出，保留源 alpha。零强度直接透传。
- `session.ts`：沿用持久宿主协议，新增立方体与独立 provider 身份；排队前复制参数、像素和身份，拒绝错卡/错版本。
- `lut-provider.ts`：预览和导出共用有界调度，最多 8 个请求、4 个驻留宿主，LRU 不驱逐正在处理的帧，空闲 30 秒释放。
- 时间线新增 `qcut-metal-lut-v1`，不覆盖 `qcut-metal-fog-v1` 或 `jianying-local-effect-v1`。媒体、filter stack、调节层的导出路由均识别新 provider。
- 每帧通过自有宿主，CLI 仅复用 FFmpeg 编解码和音轨处理。没有调用剪映 dylib 或模型，没有将第三方 LUT、Shader、二进制加入 Git。

现阶段仅 macOS Metal，单帧最多 1920x1080 像素。不宣称 HDR、任意 ICC、4K、Windows/Linux、长视频稳定性或所有复杂 Shader 已覆盖。
目录识别是保守的本地包分类门槛，不是对每个原始 Shader graph 的数学等价证明。

## 真实验证

证据根目录：`/Users/peter/Downloads/QCut-Independent-LUT-Batch-2026-09-06/`。

### 667 张逐卡 GPU

脚本 `scripts/verify-independent-lut-batch.ts`，并发上限 2。

- 每张均真实启动独立 Metal 宿主、加载实际本地 LUT。
- 17x17x17 颜色网格，共 4913 个 RGB 输入，输出图尺寸 289x17。
- 强度 0：RGBA 字节不变；强度 37、100：与 CPU 三线性参考逐通道比较，检查 alpha。
- **667/667 通过，0 失败**；两档对照的总体平均绝对通道差约 **0.003440/255**，最大通道差 **1**。
- 本轮约 74.881 秒，含读取资源、启动宿主和比对；不是视频吞吐基准。
- `batch.json` 保存每张卡的身份、cube 大小、时间、哈希和误差。原始测试图与资源留在仓库外。

这些数字衡量的是 Metal 对 CPU LUT 采样的一致性，**不是对剪映 UI 的最终画面误差**。

### CLI 图片与视频

- 按分类选出 20 张实际执行安装链接中的 `qcut filter-lab render-independent`，输出 **20 张 1280x720 PNG**。
- 前 4 张同时输出 1 秒短视频，**4 个 MP4 均为 1280x720、30 帧并保留音轨**。
- **24/24 通过**；每个文件经过 ffprobe 和 FFmpeg 全段解码/framemd5，不只检查文件存在。
- `cli-runs.json`、逐文件 `.json`、`.log`、`.framemd5` 记录结果。
- 本轮含校验耗时：PNG 约 1.802-2.624 秒，MP4 约 4.200-4.769 秒。
- 运动素材沿用 1 秒平移测试片，不等同于真实人物连续拍摄视频。

### 真实 Electron UI / 导出

E2E 使用隔离项目用户目录，设置 `QCUT_JIANYING_DISABLE_USER_CACHE=1`，并通过 `QCUT_JIANYING_FILTER_PACKAGE_ROOT` 指向 QCut 自管资产目录。否则临时项目目录会隐藏自管缓存中的新增一张，界面仅显示 666 张 LUT；这是测试 profile 的资产路径隔离，不是渲染失败。通过实际按钮操作：

1. 旧迷雾应用、100/0 强度、两次 MP4 导出继续通过。
2. 新目录分页、搜索和类别筛选通过。
3. 夏日晴朗（单 LUT）、普林斯顿（图集 LUT）和高清黑白实际应用、预览并各导出一个 30 帧视频。
4. 采样 0/15/29 帧，确认不是静帧，也不是原图透传。
5. 重开项目后独立 provider、资源 ID 和画面保留。
6. 切回旧剪映页签不改写时间线 provider。
7. IPC 注入渲染故障时预览有提示、导出报错且不产生伪成功视频。

截图和导出：`editor/lut-*-preview.png`、`editor/lut-*-export.mp4`、`editor/lut-project-reopened.png`、`editor/editor-evidence.json`。
编辑器导出测试助手关闭音频；带声音导出由 CLI 的 4 个短视频覆盖。

### 自动化

17 个测试文件，**168 项通过、0 失败**，包括真实 Metal Fog/通用 LUT 测试。
覆盖新增目录门槛、非法身份、cube 尺寸/域、透明度、队列快照、LRU、加载失败恢复、销毁竞态、IPC 主窗口限制、CLI 路由、搜索分页、预览派发及导出引擎选择。
Web/Electron 构建和 TypeScript 检查通过；46 个 TS/TSX/JSON 文件的 Biome 检查、`git diff --check`、provenance 检查通过。自有宿主 staging 成功；没有制作完整安装包。

## 修复与缓存补齐

1. 新通用 LUT 不能仅扩展预览而遗漏导出路由；媒体、调节层、filter stack 都已接入并补测试。
2. 连续切换几百张卡不能无限创建宿主；新增有界队列、4 项 LRU 和空闲释放。
3. 排队期间调用者修改身份/像素会污染任务；现已在排队/启动前快照。
4. 验证脚本最初读取 `response.success`，但 CLI 实际返回 `status: ok` 信封，造成假失败；已修正并重新运行全部 24 项文件生成和解码校验。
5. 发现资源 `7528441228891802918` 只在剪映安装缓存，复制约 596 KB 的版本包至 QCut 自管目录。源文件未改动；LUT 源/目标 SHA-256 相同：`53d64637de9d803bceff0ae2f07be92de95d73c1631f5096b6fa9e7c2027b2db`。

补齐位置：`/Users/peter/Library/Application Support/QCut/JianyingFilterPackages/artistEffect/7528441228891802918/a1b13b0f771a9734392e57c1fd212254/`。
复制清单在 `local-cache-copy.json`；禁用剪映缓存后该卡通过真实 CLI 输出 `private-cache-proof.png`。
禁用剪映用户缓存后，独立目录仍为 **668 张**。这不是移走整个剪映应用的测试，也没有宣称机器其他进程不访问剪映。
随后在该配置下重新跑完 **667/667** 张真实 GPU 验证，0 失败，用时约 **103.321 秒**；记录在 `private-only/batch.json`。

## 下一步

- 先按拓扑扩展锐化、暗角、Bloom，逐个用同输入 RGBA 与现有二进制 oracle/剪映 UI 对照，再批量开放。
- 纯 LUT 还需补跨分类的剪映 UI 无损参考；不要将这轮采样精度当作逐卡 UI parity。
- 前一轮编辑器与 CLI 端到端平均 RGB 差 3.975/255 尚未单独消除，编解码/画布色彩路径仍需隔离验证。
- 人像双 LUT、Face AI、面部区域 LUT 继续走原有后端，不伪装成无模型全帧 LUT。

本轮未提交 Git、未推送、未发布；只修改自有源码、测试和文档。
