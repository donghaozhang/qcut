# 复杂滤镜独立迁移第三批：空间处理与等价双 LUT

日期：2026-09-06。承接第二批的 185 张待迁移清单。

## 结果与边界

本轮新增 **6 张**，不是把全部 185 张标成完成。自有目录 **707 -> 713**：667 张纯 LUT、迷雾、45 张精确版本 graph。剩余 **179 张**：Shader 10、双 LUT 131、Face AI 33、面部区域 LUT 3、未知 2。

新增卡共用 QCut Metal 的预览、独立 CLI 和导出入口；旧剪映后端保留。运行时只读取已校验的本机 LUT 数据，不调用原始 Shader、Lua 或剪映 dylib。原始包文件参与哈希校验，不进入 Git。所有新增卡仍为 `unverified`，本轮参考是剪映本机二进制宿主，**不是新的剪映 UI 无损导出**。

| 资源 ID | 名称 | 自有处理链 |
| --- | --- | --- |
| 7127830050786823437 | 海鸥DC | Sobel 派生边缘增亮、水平色散、细节增强、LUT，共 7 Pass |
| 7127824119294364959 | 千玺IXU | 两级边缘柔光、细节增强、LUT，共 11 Pass |
| 7127609569416711455 | 侘寂灰 | 相同 VF 双 LUT 折叠为一次 3D 采样，保留 Alpha 强度权重 |
| 7617811957558611206 | 小麦肌 | 相同图集双 LUT、相同强度，单 Pass，保留预乘 Alpha clamp |
| 7617811803829046591 | 蜜桃肌 | 相同图集双 LUT、相同强度，单 Pass，保留预乘 Alpha clamp |
| 7356885346841349410 | 风铃II | 0.6 强度系数锐化、等价双 LUT，共 2 Pass |

## 为什么四张双 LUT 不需要分割模型

仅对精确版本证明：两张 LUT 内容逐字节相同、采样规则相同、两条颜色分支的权重相同、没有其他依赖 mask 的 Pass，因此 `mix(grade, grade, mask) = grade`。

- 固定四个资源 ID/版本和完整控制文件 SHA-256；不是按名字、双 LUT 类型或文件名自动放行。
- 两张 LUT 都进入素材 SHA-256；加载时再次检查相等。即使渲染只读一张，另一张变化也会拒绝运行。
- 图集、原生 3D sampler、Alpha 混合、锐化前置、输出 clamp 分别保留，不统一当普通 LUT。
- 晴空海岸等虽然两张表相同，但背景/皮肤强度是 0.8/0.6，**不能折叠**。
- 俱乐部等还包含纹理/合成；旧时代I 和布兰卡还有其他 Pass，不能因两张表相同就忽略整条链。
- 此次并未实现通用独立 skin segmentation，也未把其余 131 张的 mask 设为零、设为一或换成肤色阈值近似。

## 空间处理实现与修复

`graph-plan.h` 负责每个 Pass 的输入、额外 base 纹理、目标尺寸和采样尺寸。原有五 Pass 与新增七/十一 Pass 共用计划，避免宿主中用一个全局尺寸套所有 Pass。

海鸥 DC：边缘亮度梯度按固定 512 采样尺度；色散水平比例为 R=0.9975、B=1.0025。细节链基准尺寸为 520，增强系数为 1.0。

千玺 IXU：先模糊原图，与原图求逐通道阈值 0.1 的差，模糊差值后做加亮，再进入 550 基准尺寸的细节链。共享 render target 被后续 detail camera 改写尺寸，因此早期柔光 Pass 的目标尺寸也必须对应。

首测千玺最大差 96/255、MAE 5.9063。重新核对材质发现：前两次模糊的 `blurStep` 是 **2**，不能由脚本中的 blur radius 推测为 1。修复后同输入最大差降至 **1/255**、MAE **0.007246**；没有放宽量化门禁。

## 验证证据

本机证据目录：`/Users/peter/Downloads/QCut-Independent-Complex-Batch3-2026-09-06/`。

| 项目 | 结果 |
| --- | --- |
| 全部 45 张 graph，321x181 色块图，37/100 强度 | 90/90，36.617 秒；最大 MAE 0.084377，最大通道差 3 |
| 全部 45 张 graph，1280x720 真人图，37/100 强度 | 90/90，122.823 秒；最大 MAE 0.095678，最大通道差 4 |
| 新增 6 张，563x1000 和 563x1001 两侧边界，37/100 强度 | 24/24，9.059/9.220 秒；最大 MAE 0.077406，最大通道差 3 |
| 新增 6 张真实 CLI 视频 | 6/6，28.286 秒；每段 1 秒、1280x720、30 帧，保留音轨，完整解码通过 |
| 全部 667 张纯 LUT 回归 | 667/667，105.169 秒；对照 CPU 采样器，不是剪映 UI |
| 真实 Electron 逐卡预览、视频导出、项目重开 | 通过，1.8 分钟；目录 713 张，6 个新增导出均为 30 帧，无页面异常 |
| 聚焦单元、UI、真实 Metal 测试 | 102 项通过，含新拓扑、素材切换、Alpha、双 LUT 误放行拒绝 |
| Electron/网页构建、Electron 类型检查 | 通过；网页仍有现有大 chunk 等警告 |

量化门禁仍为 RGB MAE <= 0.25、单通道最大差 <= 4、Alpha 最大差 0。零强度及同输入重复帧逐字节相同。4 种输入累计新增卡 48 组对照全部通过，最大 MAE 0.077532、最大通道差 3。

视频素材是已有真人静帧平移片，不是新拍摄的真实人物运动视频。本轮不涉及人物跟踪、时序 mask，也不证明 HDR/色彩管理与所有尺寸。

编辑器首轮在缩略图断言失败：全新隔离用户目录未带已有缩略图，30 秒内仍为 0 张。这不是滤镜视频渲染失败，也不能当作 E2E 通过。新增 `QCUT_INDEPENDENT_THUMBNAIL_CACHE` 可把真实已有缩略图复制到隔离测试目录，不复制项目状态、不 mock 任何渲染 API。复测的三个目录缩略图均返回真实 JPEG/PNG 字节，随后六张新卡的应用、预览、导出全部通过。

失败材料保留在 `editor/`；成功材料在 `editor-cached/`。其中 `thumbnail-evidence.json` 记录缓存是否注入及实际缩略图字节，`editor-evidence.json` 记录六个视频与帧数、目录数、页面错误和重开状态，`lut-1-preview.png` 至 `lut-6-preview.png` 是逐卡截图。已人工查看千玺 IXU、蜜桃肌的截图；无空白帧。部分新增卡没有本地缩略图时仍显示图标，不能把这次测试宣称为全部 713 张缩略图离线齐全。

同轮还通过预览错误提示和导出拒绝注入测试：发生渲染错误时有提示，导出失败且不留下假成功视频。`otool -L` 确认自有宿主只链接 Apple 系统库。旧剪映 dylib 仅供参考端测试，不参与 QCut 自有输出。

## 完整库存与下一步

新增 `scripts/audit-independent-filter-backlog.ts`，只读取目录、私有包和 LUT 摘要，输出 JSON，不下载或复制原始二进制。

- 完整目录 892 张，独立 713，未迁移 179；其中 175 张有本地包。
- 缺包四张：`7672306518011776266`、`7672306701118262554`（鎏金夜）、`7659347184361622826`（落日橘光）、`7669796773006708019`（晴海增色）。
- 禁用剪映用户缓存后，私有目录只能发现 888 张，剩余 175 张且都有包。这是目录范围差异，不能宣称又迁移了 4 张。
- `backlog-full-audit.json` 和 `backlog-audit.json` 分别记录两种范围的实际检查结果。

剩余大头是不同 LUT/不同权重的 skin-mask 合成，以及人脸/人体/天空分割。下一步应单独实现有严格输入契约的 mask 适配层与多 LUT 合成，再接可独立运行的模型；只有颜色表不够，不能在 UI 默认隐藏效果差异。

剩余 Shader 中还有时间噪声、动画序列、纹理叠加和多级 Bloom。现有稳定参考门禁只适用于静态图；动态类型需要同时间戳、seek/reset 和连续帧参考，不能挑“最像”的某一帧宣称通过。

## 重现

```sh
bun run stage-independent-filter-host
bun electron/native-pipeline/cli/cli.ts filter-lab render-independent \
  --resource-id 7127824119294364959 \
  --filter-version f725154759349e471b9ba4607e75d503 \
  -i source.mp4 --output ixu-metal.mp4 --filter-intensity 100 --json

bun scripts/verify-independent-graph.ts --source portrait.png --output evidence/graphs
bun scripts/audit-independent-filter-backlog.ts --output evidence/backlog-full.json
QCUT_JIANYING_DISABLE_USER_CACHE=1 \
  bun scripts/audit-independent-filter-backlog.ts --output evidence/backlog-private.json

QCUT_JIANYING_DISABLE_USER_CACHE=1 \
QCUT_JIANYING_FILTER_PACKAGE_ROOT="$HOME/Library/Application Support/QCut/JianyingFilterPackages/artistEffect" \
QCUT_INDEPENDENT_THUMBNAIL_CACHE="$HOME/Library/Application Support/QCut/Cache/jianying-filter-thumbnails" \
QCUT_INDEPENDENT_FILTER_E2E=1 \
QCUT_INDEPENDENT_GRAPH_IDS=7127830050786823437,7127824119294364959,7127609569416711455,7617811957558611206,7617811803829046591,7356885346841349410 \
QCUT_INDEPENDENT_FILTER_VIDEO=/absolute/path/source-moving.mp4 \
QCUT_INDEPENDENT_FILTER_EVIDENCE=/absolute/path/evidence/editor \
bun run test:e2e -- apps/web/src/test/e2e/qcut-independent-filter.e2e.ts --reporter=line
```
