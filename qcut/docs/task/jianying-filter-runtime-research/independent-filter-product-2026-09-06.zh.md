# QCut 自有 Metal 渲染器：预览、CLI 与导出

日期：2026-09-06。实现分支：`timeline-fixed-prfix`。

后续扩展见 [667 张本地 LUT 批量接入](independent-lut-batch-2026-09-06.zh.md)。本文保留首张迷雾接入时的范围与测试记录。

## 范围与结论

在 [迷雾独立渲染研究](independent-fog-chain-2026-09-06.zh.md) 的基础上，新增一个产品后端，**没有替换既有剪映本机滤镜或旧 CLI**。

- 界面：滤镜 > 滤镜实验室 > **QCut Metal** > 迷雾。
- 应用时沿用现有调节层流程；可自动创建调节层，支持 A/B、强度与项目持久化。
- 新命令：`qcut filter-lab render-independent`，旧 `render`、`apply` 不变。
- 编辑器预览与固定时间基画布导出使用同一个独立 Metal IPC。
- CLI 复用 FFmpeg 的逐帧解码、音轨处理、编码、取消和原子输出流程，滤镜计算交给自有宿主。
- 宿主只链接 Apple 系统库，不加载剪映运行库；仍读取一张经过 SHA-256 校验的本地 LUT。

**目前只有迷雾这一张，macOS、RGBA8、最多 1920×1080 像素。不是整个滤镜库的独立替代，也不是跨平台 WebGPU 后端。**

## 命令

```bash
# 新增路径：图片
qcut filter-lab render-independent \
  --resource-id 7160594413847203085 \
  -i source.png \
  --output fog-qcut.png \
  --filter-intensity 100 \
  --json

# 新增路径：视频，保留音轨
qcut filter-lab render-independent \
  --resource-id 7160594413847203085 \
  -i video.mp4 \
  --output fog-qcut.mp4 \
  --duration 1 --fps 30 \
  --filter-intensity 100 --json

# 原有路径未改名、未迁移、未默认切换
qcut filter-lab render \
  --resource-id 7160594413847203085 \
  -i source.png --output fog-native.png --json
```

可使用 `--dry-run` 校验文件、LUT 和宿主可用性；GPU 实际执行由真实渲染测试证明。输出路径必须显式给出；已有文件默认不覆盖，只有显式 `--force` 才在成功后替换。

## 数据与调用链

新增持久化标识：`nativeEffect.provider = qcut-metal-fog-v1`，`presetId = qcut-independent-fog-v1`。
旧项目的 `jianying-local-effect-v1` 保留原语义；切换目录页签不会更换时间线已有滤镜。

| 入口 | 路径 |
| --- | --- |
| UI | `filter-lab-backends.tsx` / `independent-filter-shelf.tsx` -> 现有 `useAdjustmentLut` |
| 预览与画布导出 | `browser-color-rendering.ts` -> `jianying-local-effect-preview.ts` -> 新 IPC |
| 新 IPC | `qcut-independent-filter/ipc.ts` -> `provider.ts` -> `session.ts` |
| 新 CLI | `cli-handlers-filter-lab-independent.ts` -> 现有 frame stream -> 独立 session |
| GPU | 自有 `host.mm` + 重写的 `fog.metal`，四个 RGBA8 Pass |

独立后端被纳入导出引擎选择器，包括媒体 color、filter stack、调节层及现有递归检查。
不允许因 Metal 缺失或渲染失败悄悄退回 CSS 或剪映后端。预览调用错误由画布捕获，保留最后一张成功帧并显示错误提示；尚无成功帧时可能为空。导出继续向上传播错误并终止。

预览宿主按需启动、复用，空闲 30 秒退出。每次最多排队 8 帧，单帧协议超时 20 秒。
CLI 逐帧顺序处理，一个视频复用一个宿主，不是每帧启动进程。
零强度直接返回输入；队列复制输入数据和尺寸/强度，避免调用者后续修改影响排队帧。

## 本地资产与打包

- 资源 ID：`7160594413847203085`。
- 版本：`e745e131cff1db913aea07f4098ec8de`。
- LUT 相对位置：`AmazingFeature/image/filter.png`，512×512 的 64³ atlas。
- 文件 SHA-256：`e3d93009c983c84a674e5d288d8d3fbdd8f3e9572f9687132cc03bd4e14976d8`。
- RGBA SHA-256：`6fbe77f1043a2f1e221e97bebdf1c569d3658c5bc30c3c98719a72e4c50ff295`。

优先查找 QCut 私有缓存，也兼容现有本地缓存根；可由主进程环境变量 `QCUT_INDEPENDENT_FILTER_LUT_PATH` 指定该版本 LUT。渲染器 IPC 不接受任意 LUT 文件路径。
没有自动下载、没有复制第三方模型或运行库、没有将 LUT 放入 Git。

开发模式根据自有宿主源码、Metal 源码和架构的哈希编译到用户缓存；生产打包新增 `stage-independent-filter-host`，已接入 `stage:all-binaries`，输出 `electron/resources/bin/qcut-independent-filter-host`。
实际运行宿主的 `otool -L` 仅包含 Foundation、Metal、CoreFoundation、libobjc、libc++、libSystem；启动时也检查已加载镜像。
本轮验证了 Apple Silicon 编译与 staging，没有构建或发布安装包，也未验证 Intel Mac。

## 真实测试结果

证据目录：`/Users/peter/Downloads/QCut-Independent-Filter-2026-09-06/`。

### CLI / GPU

| 测试 | 结果 |
| --- | --- |
| 1280×720 输入，强度 0 / 50 / 100 | CLI 与同解码输入的直接 Metal 输出 RGBA 完全一致 |
| 强度 0 | 与输入 RGBA 完全一致 |
| 强度 100 | 与保存的剪映 UI 无损参考完全一致 |
| A -> 3×1 透明测试帧 -> A | 返回 A 时无状态污染 |
| 队列、尺寸变化、参数快照 | 本机真实 Metal 协议测试通过 |
| 非法版本、尺寸、NaN、队列溢出 | 拒绝且不破坏后续有效请求 |
| 1 秒、30 帧、1280×720 移动画面 + 声音 | 独立 CLI 与原有原生 CLI 的整段解码 RGBA 完全一致，音轨存在 |
| 实际安装链接中的 `qcut` 命令 | 新命令成功写出 `installed-qcut.png` |
| 指定不存在的本地 LUT | CLI 非零退出，提示缺失文件，不生成输出 |

强度 100 对照 RGBA SHA-256：`82a592bd08e03d7c5503b527ab1a7fdf14349da1a39251d2cb08a6c0cb26559b`。

本轮单次 CLI 墙钟时间：图片 0/50/100 分别约 0.650 / 0.719 / 0.696 秒；1 秒视频独立后端约 **3.301 秒**，现有剪映后端约 **7.539 秒**。这是一次本机样本，包含 CLI 启动和编解码，并非稳定性能基准。

`verification.json` 保存参数、哈希、视频 ffprobe 和宿主依赖库列表。测试运动由同一画面平移构造，不是新的真人连续拍摄视频。

### 真正的编辑器 E2E

运行隔离 Electron 用户目录，通过界面导入视频并添加到时间线，实际点击 QCut Metal 卡片。

- 预览非空且滤镜生效；截图 `editor/01-qcut-metal-100.png`。
- 键盘调整强度到 0，恢复原图；截图 `editor/02-qcut-metal-zero.png`。
- 两次真实导出均为 1280×720、H.264、1 秒、30 帧；检查 0/15/29 帧不同，排除静帧输出。
- `editor/editor-metal-100.mp4` 与 `editor/editor-metal-zero.mp4` 的采样帧哈希不同。
- 切回旧剪映页签可用，不会改写新 provider。
- 离开项目后重新进入，强度与独立 provider 保留；等待预览像素非空后截图 `editor/03-project-reopened.png`，人工查看确认画面恢复。
- 注入 IPC 渲染故障，界面显示“QCut Metal 渲染失败，预览未更新”；截图 `editor/04-preview-failure-visible.png`。
- 同一故障下实际点击导出，错误可见，`must-not-export.mp4` 不存在；截图 `editor/05-export-failure-visible.png`。
- `editor/editor-evidence.json` 记录结果；未捕获页面错误为 0，故障注入属于预期的受控错误。最终整轮约 33.5 秒。

编辑器 E2E 复用现有导出测试助手，自动处理保存路径选择，并关闭音频选项；音轨保留由上面的 CLI 视频测试覆盖。

### 自动化与构建

- 14 个 Vitest 测试文件，**133 项通过、0 失败**，其中 5 项执行真实本机 Metal 宿主。结果在 `unit-tests.json`。
- 测试覆盖 IPC 来源/版本校验、LUT 缺失、队列和宿主生命周期、取消竞态、新旧 CLI 路由、预览派发、导出引擎选择和界面重试。
- Web 与 Electron TypeScript 检查通过；38 个改动/新增 TS、TSX、JSON 文件的 Biome 检查通过。
- Web 构建、Electron 构建、自有宿主 staging、`git diff --check`、仓库 provenance 检查通过。
- JSDOM 单元测试会输出既有 Canvas 未实现警告；真实像素正确性由原生测试和 Electron E2E 覆盖，不以 JSDOM 渲染代替。
- 编译宿主受 Git 忽略规则保护；没有提交 LUT、剪映二进制或模型。本轮未创建提交、推送或发布。

### 已发现并处理的问题

1. 第一次 UI 实测卡片被错误要求“已有选中的调节层”才启用。现有应用流程本来会创建调节层，已移除这个错误限制，并补 UI 回归。
2. 初版图片验证混用了 NAPI Canvas 与 FFmpeg 解码。原图带有色彩信息，两种解码得到不同 RGBA。已改为同解码输入对比；不是将不一致当作渲染器通过。
3. 增补取消期间宿主刚完成启动的销毁保护，避免丢失进程；对应延迟启动测试通过。
4. 新后端输出错误必须冒泡，不能沿用旧路径的 CSS 降级造成“成功导出但没有滤镜”。

## 尚未消除的差异

**同一 Metal 计算链，不等于所有端到端文件逐像素一致。**

本轮另取第 15 帧，对编辑器实际导出与独立 CLI 实际导出的 RGB 做比较，平均绝对通道误差 **3.975 / 255**，最大通道差 **33**。
证据：`editor-cli-frame-comparison.json`、`editor-frame-15.png`、`cli-frame-15.png`。

这两条路径分别使用浏览器视频解码/画布/编码和 FFmpeg 解码/编码；该差异不能归因于某个单一环节，也不能宣称已经消除。下一步应固定输入 RGBA、输出时间戳和无损出口，再分别隔离解码色彩转换与编码器。

本轮不宣称 HDR、ICC 任意图片、半透明彩色素材、4K、长视频稳定性、所有滤镜、或其他平台已对齐。透明素材仅覆盖零强度不变与 alpha 保留边界。

## 复现

```bash
bun run build
bun run stage-independent-filter-host

bun scripts/verify-independent-filter.ts \
  --source /absolute/source.png \
  --reference /absolute/jianying-ui-reference.png \
  --output /absolute/evidence

QCUT_INDEPENDENT_METAL_TEST=1 bunx vitest run \
  electron/__tests__/qcut-independent-filter-native.test.ts

QCUT_INDEPENDENT_FILTER_E2E=1 \
QCUT_INDEPENDENT_FILTER_VIDEO=/absolute/evidence/source-moving.mp4 \
QCUT_INDEPENDENT_FILTER_EVIDENCE=/absolute/evidence/editor \
  bunx playwright test qcut-independent-filter.e2e.ts --reporter=line
```

本地图片/视频、LUT、私有缓存、编译产物和原始日志留在仓库外。Git 仅包含自有实现、测试和研究文档。
