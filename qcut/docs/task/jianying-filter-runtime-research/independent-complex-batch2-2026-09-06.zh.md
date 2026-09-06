# 复杂滤镜独立迁移第二批：13 张与全量回归

日期：2026-09-06。承接 [第一批 26 张](independent-complex-migration-2026-09-06.zh.md)。

## 本轮结果

- 新增 13 张，独立目录从 694 增至 **707 张**：667 张纯 LUT、迷雾、39 张精确绑定版本的 graph。
- 原始 224 张复杂滤镜中，累计迁移 39 张，仍剩 **185 张**。不把双 LUT、分割或人脸模型当作普通 LUT 绕过。
- 新增卡在 QCut Metal 的预览、`filter-lab render-independent` 和视频导出共用自有 Metal 渲染器；旧剪映后端和 CLI 保留。
- 自有宿主仅链接 Apple 系统库。LUT/纹理仍读取本机私有缓存，不包含在 Git 中。
- 所有新增卡保持 `verification: unverified`。本轮对照的是本机剪映二进制参考宿主，**不是新录制的剪映 UI 无损导出参考**。

## 新增卡与处理链

| 资源 ID | 名称 | 自有处理链 |
| --- | --- | --- |
| 7127684611450178823 | 迈阿密 | 细节增强，5 Pass，Alpha 加权 |
| 7127669342325443854 | 松果棕 | 细节增强，5 Pass，Alpha 加权 |
| 7127668616991952158 | 贝松绿 | 细节增强，5 Pass，Alpha 加权 |
| 7127669912050420999 | 老友记 | 细节增强，5 Pass，Alpha 加权 |
| 7312646907908607244 | 中性II | 细节增强，5 Pass |
| 7312646382395936010 | 暖晨 | 细节增强，5 Pass |
| 7127822013074263310 | 牛皮纸 | 细节增强，5 Pass，Alpha 加权 |
| 7312647197462367524 | 好莱坞IV | 细节增强，5 Pass |
| 7127824802819116302 | 冷透 | 细节增强，5 Pass |
| 7127619120761212168 | 气泡水 | 细节增强，5 Pass |
| 7127669338089311495 | 三洋VPC | 520 基准尺寸的细节增强变体，5 Pass |
| 7617817255128173865 | 纸醉金迷 | 图集 LUT，单 Pass，Alpha 加权 |
| 7148963827239963918 | 春风 | 两轴模糊、柔光混合、LUT，4 Pass |

### 细节增强

不能只按 Shader 文件的哈希归为一类。还需读取场景绑定、材质参数、控制脚本和中间纹理尺寸。

自有实现的顺序为：调整工作分辨率并复制、复制、横向三点模糊、纵向模糊并与保存的第二张纹理做 unsharp、LUT。

- 普通变体的尺寸基准为 1000；长边不超过 1000 时放大到该基准，超过时工作尺寸为输入的 1.1 倍。
- 三洋VPC 基准为 520，长边超过 1000 时比例为 `0.52 * 1.1`，unsharp 增益为 1.2；普通变体为 1.35。
- 前两个 Pass 的半径按整数参数读取后为 0，因此是复制，不应凭脚本中的小数直觉增加模糊。
- 纵向增强的 base 是保存的第二个 Pass，不是全尺寸原始图。
- LUT 强度是否乘 Alpha 按精确卡片配置，不统一猜测。
- 目前自有中间纹理采用 RGBA8，已通过本轮量化门禁；这不等于已证明剪映内部枚举值 127 的确切格式。

### 春风与纸醉金迷

春风复用自有迷雾的基础算子，但模糊尺度为 0.60、混合量为 0.30；迷雾保持原有 0.90/0.50，不更改旧行为。

纸醉金迷的特征目录是 `AmazingFeature_2998`，并非通用 `AmazingFeature`。新增受限的目录配置，并参与控制文件、素材 SHA-256 校验。其 LUT 使用 texel-center 坐标和 Alpha 强度混合。

## 修复的验证问题

1. **切卡截图可能捕获上一张预览。** Canvas 仅在实际绘制完成后更新当前资源/强度标记，E2E 等待标记与所选卡一致，再检查像素、截图。
2. **CLI 验证脚本读错成功字段。** 真实 JSON envelope 使用 `status: "ok"`。首轮视频已生成，但脚本误判；修正后重新执行 13 条真实 CLI，并核对输出路径、资源 ID、`qcut-metal` 后端、完整解码、尺寸、帧数及音轨。失败报告保留在 `cli/`，成功复测在 `cli-verified/`。
3. **参考端冷启动可能不稳定。** 初次全量测试中旧时来信 37% 的 MAE 为 13.09；独立复测降到 0.03049，QCut 输出 SHA-256 未变化。新增静态图参考稳定性门禁：最多 6 次同时间戳渲染，连续 3 次 SHA-256 一致才参与对照；未稳定直接失败，不按与 QCut 的相似程度挑帧。全量复测实际捕获一次松果棕的初始化变化。
4. **Identity LUT 测试断言不合理。** 单 Pass identity LUT 本来就应保持原像素，不能要求非零强度必然改变画面。修正断言，并新增反色 LUT、37% 强度、半透明 Alpha 的真实 Metal 数值测试。

## 真实验证

证据根目录：`/Users/peter/Downloads/QCut-Independent-Complex-Batch2-2026-09-06/`。

| 验证 | 已完成结果 |
| --- | --- |
| 新增 13 卡，321x181 色块图及 1280x720 真人图，强度 37/100 | 52/52 通过；最大 RGB MAE 0.084377，单通道最大差 3/255 |
| 全部 39 张 graph，同两种输入及强度 | 156/156 通过；最大 RGB MAE 0.095678，单通道最大差 4/255，Alpha 最大差 0 |
| 4 种新增处理链代表卡，563x1000/563x1001 竖图，强度 37/100 | 16/16 通过；覆盖工作尺寸切换边界，最大 MAE 0.020795，单通道最大差 2/255 |
| 全部 667 张纯 LUT，强度 37/100、零强度、重复帧 | 667/667 通过，106.726 秒；对照 CPU LUT 采样器，不是剪映 UI |
| 13 条真实 CLI 视频生成 | 13/13 通过，串行 61.555 秒；每段 1 秒、720p、30 帧，音轨保留，完整解码通过 |
| Electron 编辑器 13 张逐卡预览和导出 | 两轮均通过，3.3/2.9 分钟；第二轮目录 707 张；另测迷雾 100/0、项目重开、预览失败提示及导出拒绝 |
| 聚焦单元、UI、真实 Metal 测试 | 93 项通过，含静态参考稳定性测试 |
| Electron 与网页构建、Biome、diff whitespace | 通过；Vite 仍有现有大 chunk 等警告 |

量化门禁未放宽：RGB MAE <= 0.25、单通道差 <= 4、Alpha 差为 0；零强度和重复输入必须逐字节相同。

视频输入是已有真人静帧的平移测试片，有音轨，用于确认连续帧处理和输出；**不是新拍摄的真实人物运动视频，也不证明人脸跟踪或时序分割**。

可读证据：

- `stable-39-pattern/graph-parity.json`、`stable-39-portrait/graph-parity.json`：逐卡误差、参考帧稳定性哈希。
- `boundary-1000/graph-parity.json`、`boundary-1001/graph-parity.json`：迈阿密、三洋VPC、纸醉金迷、春风的竖图尺寸边界。
- `lut-regression/batch.json`：667 卡纯 LUT 回归。
- `cli-verified/video-evidence.json`：CLI 完整视频检查及逐卡耗时。
- `editor/editor-evidence.json`：首次隔离用户目录的 13 卡 E2E，13 张预览截图和导出视频。
- `editor-managed-root/editor-evidence.json`：使用正式私有素材缓存的复测，目录 707 张、13 个导出均为 30 帧、无页面异常；完整截图和视频同目录。
- `portrait-comparison.jpg`：原图、剪映二进制参考、自有 Metal 三列，展示迈阿密、三洋VPC、春风、纸醉金迷。已人工查看，无空白或明显构图偏移。

### E2E 目录隔离

临时 Electron 用户目录不会自动读取正式用户目录的 `JianyingFilterPackages`。因此首次测试的独立目录是 706 张，其中列表显示 705，迷雾另列；正常 Node/Bun 目录为 707 张。差的旧卡 `7528441228891802918` 只在正式 QCut 管理目录，不是本轮新增卡。

正式缓存复测使用下方的 `QCUT_JIANYING_FILTER_PACKAGE_ROOT`；该变量只指定私有素材读取位置，项目/数据库仍隔离。结果另存 `editor-managed-root/`，避免覆盖第一轮证据。复测通过：目录 707 张，列表 706 张加单独的迷雾卡，与 CLI 一致。

## 重现命令

```sh
# 自有宿主，不加载剪映 dylib。旧 filter-lab render 不变。
bun run stage-independent-filter-host
bun electron/native-pipeline/cli/cli.ts filter-lab render-independent \
  --resource-id 7127684611450178823 \
  --filter-version 76cf7477069167098bb9887386808f12 \
  -i source.mp4 --output miami-metal.mp4 --filter-intensity 100 --json

# 全部已注册 graph 的静态图对照；参考宿主需要本机合法的私有运行库。
bun scripts/verify-independent-graph.ts --source portrait.png --output evidence/graphs

# 单独限定本轮的部分视频卡，实际执行 CLI。
bun scripts/verify-independent-graph-video.ts \
  --source source-moving.mp4 --output evidence/cli \
  --ids 7127684611450178823,7127669338089311495,7148963827239963918

# 真实 Electron E2E。需先构建 Electron 和 apps/web。
QCUT_JIANYING_DISABLE_USER_CACHE=1 \
QCUT_JIANYING_FILTER_PACKAGE_ROOT="$HOME/Library/Application Support/QCut/JianyingFilterPackages/artistEffect" \
QCUT_INDEPENDENT_FILTER_E2E=1 \
QCUT_INDEPENDENT_GRAPH_IDS=7127684611450178823,7127669338089311495,7148963827239963918 \
QCUT_INDEPENDENT_FILTER_VIDEO=/absolute/path/source-moving.mp4 \
QCUT_INDEPENDENT_FILTER_EVIDENCE=/absolute/path/evidence/editor \
bun run test:e2e -- apps/web/src/test/e2e/qcut-independent-filter.e2e.ts --reporter=line
```

## 下一批边界

剩余 185 张：Shader 12、双 LUT 135、Face AI 33、面部区域 LUT 3、未知 2，详见 [剩余清单](independent-complex-backlog-2026-09-06.md)。

优先继续无 AI 的静态多 Pass。KV5D、黑胶唱片、旧乐园等含噪声/时间语义，电影柔光和热气腾腾包含更复杂 graph；不能套用当前同名 blur 算子就宣布复刻。双 LUT 和 Face AI 仍需要独立可发布的模型及 mask/关键点管路。

本轮未扩大平台范围，仍为 macOS Metal，帧像素数上限为 1920x1080。尚未覆盖所有素材尺寸、HDR/色彩管理、长视频稳定性、七类 AI 依赖，也未证明预览缩放后与全尺寸导出逐像素相同。
