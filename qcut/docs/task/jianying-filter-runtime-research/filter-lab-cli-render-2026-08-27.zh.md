# Filter Lab CLI 渲染入口与新增缓存实测

<!-- markdownlint-disable MD013 -->

日期：2026-08-27。分支：`lutv7`。对象是剪映专业版，不是 CapCut。

## 结论

补齐 `filter-lab render`，`filter-lab apply` 为同一命令的别名。可以将现有加载器支持的本地滤镜应用到图片或视频，不需要打开剪映。

新增缓存中的「逆光提亮」「蓝调时刻」「奶杏」已分别通过真实 CLI 渲染和 QCut 桌面点选预览。另用已有「迷雾」「食色」覆盖原生多 Pass 和 FFmpeg 结构近似路径。本轮共完成 7 个 PNG、2 个带音轨 MP4，以及 5 张桌面截图。

目录仍为 **887 张已缓存、788 张 available、99 张不可用**。没有修改可用性门槛，没有把缓存存在当作渲染成功，也没有更新任何卡片的剪映 UI parity 等级。

## 修复内容

### 大目录 JSON 被截断

实际复现：`filter-lab catalog --json` 输出到 shell 管道时，原路径只读到 98,305 字节，JSON/UTF-8 被截断。改用 `process.stdout.write()` 输出完整 envelope，并将 JSON 失败路径的立即退出改为 `process.exitCode = 1`，让输出排空。

修复后同一目录管道收到 **455,345 字节、887 张卡**，JSON 可完整解析。成功、失败、异步任务的 wire format 保持不变。这里只记录本机 CLI 的复现，不推断所有 Bun `console.log` 都有相同问题。

### 渲染入口

新增代码按职责拆分：

| 文件 | 职责 |
| --- | --- |
| `electron/native-pipeline/cli/cli-handlers-filter-lab-render.ts` | 参数、文件保护、原子发布和结果验证 |
| `electron/native-pipeline/filters/filter-lab-render-plan.ts` | 复用目录、版本和渲染器解析 |
| `electron/native-pipeline/filters/filter-lab-media.ts` | FFprobe、FFmpeg 进程和编码参数 |
| `electron/native-pipeline/filters/filter-lab-render.ts` | 图片/视频执行，原生宿主生命周期 |
| `electron/native-pipeline/filters/filter-lab-frame-stream.ts` | RGBA 分帧、顺序执行和残帧检查 |

桌面 UI 已有入口，本轮没有修改 UI 源码。新 CLI 复用其 LUT/包检查、原生运行时和现有导出算子，不绕过 `available` 或版本检查。

### 零强度仍改变像素

真实 PNG 检查发现：强度 0 的单 LUT 仍经过恒等 LUT 插值，约 0.1764% 像素存在最大 1/255 的 RGB 差异，RGB MAE 为 0.0005879。

现改为在确认 LUT 可解码后旁路插值。重跑后普通 LUT 和原生双 LUT 的零强度 PNG 都与原始解码 RGBA 完全一致，RGB MAE、最大 RGB 差、Alpha MAE 均为 0。该结论不是有损 MP4 的逐字节一致性保证。

## 使用命令

以下是在当前源码工作区可直接使用的入口；本轮未发布新版本或替换全局安装的 `qcut`。

```bash
# 获取完整目录，寻找 resourceId、version、available 和 cacheStatus
bun --silent run qcut -- filter-lab catalog --json

# 单张图片，输出 PNG
bun --silent run qcut -- filter-lab render \
  --resource-id 7524288987129810214 \
  -i portrait.jpg --output filtered.png \
  --filter-intensity 100 --json

# 双 LUT 真人视频；apply 与 render 等价
bun --silent run qcut -- filter-lab apply \
  --resource-id 7392898023505792319 \
  -i clip.mp4 --output filtered.mp4 \
  --duration 1 --fps 30 --json

# 检查输入、版本和本地运行时，不输出媒体
bun --silent run qcut -- filter-lab render \
  --resource-id 7524288987129810214 \
  -i portrait.jpg --output filtered.png --dry-run --json
```

- `--filter-intensity`：0 至 100，默认 100。
- `--filter-version`：要求目录当前选中的精确版本，不静默换版。
- `--duration`：最多处理指定秒数，只适用于视频；`--fps` 为 0 至 120 范围内的正数。
- 视频转为恒定帧率，默认源平均帧率；输出 H.264 / YUV420P MP4，音轨重新编码为 AAC。不是 HDR、VFR 或原始编码无损保留。
- 图片输出一帧 RGBA PNG；输入支持 PNG/JPEG/WebP/BMP/TIFF，视频支持 MP4/MOV/M4V/MKV/WebM/AVI。
- 输入最多 `4096 * 4096` 像素，单边最多 8192；MP4 要求偶数宽高，不静默缩放。
- 不指定 `--output` 时写到 `--output-dir` 下；已有文件必须显式 `--force`，源文件、硬链接和输出软链接仍受保护。
- 临时结果通过尺寸、视频时长、帧率和音轨检查后才发布；失败不覆盖已有输出。任务有 15 分钟超时和取消清理。

## 渲染路径

| 路径 | 实现 | 结果中的 fidelity |
| --- | --- | --- |
| 单 LUT、已识别的纹理 LUT | 共享 LUT 解码与 FFmpeg tetrahedral 插值 | `lut` |
| 双 LUT | 本机原生宿主与真实 skin segmentation，不回退到肤色猜测 | `native-local` |
| 已接通的原生多 Pass 卡 | 现有本机原生效果包宿主 | `native-local` |
| 其余已支持的多 Pass recipe | 现有 FFmpeg 结构近似算子 | `structural` |

`native-local` 只说明使用本机原生渲染，不代表与剪映 UI 导出逐像素相同。原生多 Pass 仍受现有 profile 白名单约束，不能执行任意 Shader 包。

原生视频对同一素材保持一个宿主，按时间戳逐帧串行，避免并发破坏分割时序状态；批量测试中的 9 个任务也顺序运行。

## 真实 CLI 验证

每次 CLI 渲染都在 macOS `sandbox-exec` 内执行：禁止联网、读取剪映安装目录、剪映用户缓存以及 QCut 下载目录。只允许使用 QCut 私有快照，并设置禁用 App bundle / 用户缓存的环境变量。

使用与缓存补齐记录相同的最新私有快照（快照标识不入库）。这不是 Daytona/Linux 验证；原生路径依赖本机 macOS 运行库。

图片为已有真人素材，854 x 480。视频为已有真人视频截出的 1280 x 720、1 秒、30 帧片段；原视频没有声音，测试夹具另加 440 Hz 音轨用于检查音频是否丢失。

| 输出 | 卡片 / resourceId | 后端 | 结果 | 耗时 |
| --- | --- | --- | --- | ---: |
| `01-backlight.png` | 逆光提亮 / `7524288987129810214` | FFmpeg LUT | 通过 | 2.659 s |
| `02-blue-hour.png` | 蓝调时刻 / `7392898023505792319` | 原生双 LUT | 通过 | 4.193 s |
| `03-milk-apricot.png` | 奶杏 / `7127670311775898917` | 纹理 LUT | 通过 | 2.352 s |
| `04-blue-hour-video.mp4` | 蓝调时刻 | 原生双 LUT | 30 帧、音轨存在 | 7.374 s |
| `05-native-fog.png` | 迷雾 / `7160594413847203085` | 原生多 Pass | 通过 | 3.646 s |
| `06-structural-food.png` | 食色 / `7131644140340776205` | 结构近似多 Pass | 通过 | 2.299 s |
| `07-intensity-zero.png` | 逆光提亮，强度 0 | FFmpeg 旁路 LUT | 与源 RGBA 完全相同 | 2.031 s |
| `08-backlight-video.mp4` | 逆光提亮 | FFmpeg LUT | 30 帧、音轨存在 | 2.000 s |
| `09-native-intensity-zero.png` | 蓝调时刻，强度 0 | 原生双 LUT | 与源 RGBA 完全相同 | 3.746 s |

耗时包括 CLI 启动、目录解析、渲染、FFprobe 和完整解码校验，不是单独 GPU 运算耗时。所有输出都通过 FFmpeg 完整解码。两个视频均抽查第 0/15/29 帧，三帧哈希各不相同；音频 RMS 约 0.088，不是空音轨。

负例「晴空海岸」`7617814057051016484` 有缓存但不可用：CLI 返回完整 JSON 错误、退出码 1，没有生成输出文件。这是预期拒绝，不是把该卡接通了。

## 桌面 UI 验证

使用独立测试 profile 启动真实 Electron 窗口，执行新建项目、导入视频、加入时间线、进入滤镜实验室，再逐张搜索并点击上述三张新增卡片；没有向 store 注入预制滤镜状态。

| 检查 | 结果 |
| --- | --- |
| 目录数量 | 887 cached / 788 available |
| 运行库和模型来源 | `qcut-private` / `qcut-private`，`offlineReady=true` |
| 逆光提亮 | 17 阶 LUT 已启用，预览非空 |
| 蓝调时刻 | 64 阶双 LUT，`maskKind=skin-segmentation-v1`，正确 resourceId |
| 奶杏 | 64 阶纹理 LUT 已启用，预览非空 |
| A 原图按钮 | LUT enabled 切换为 false |
| 页面异常 | `pageErrors=[]` |

这次 UI 测试禁用了剪映安装/用户缓存发现，但没有加操作系统级网络隔离；不要把 UI 测试与上面的严格离线 CLI 测试混为一谈。UI 启动日志出现无音轨素材的波形提取失败及另一张卡片缩略图请求超时，未阻止三张卡应用，但不是“应用全程无告警”。

## 自动化测试与证据

- 43 个 Vitest 文件，258 项测试全部通过；覆盖 CLI JSON、参数、版本、渲染路由、逐帧流、原子文件保护及现有 Filter Lab/UI 回归。
- `bunx tsc -p electron/tsconfig.json --noEmit --pretty false` 通过。
- 15 个修改/新增 TypeScript 文件的 Biome 检查通过；`git diff --check` 通过。

证据保存在本机的 `QCut-FilterLab-2026-08-27/` 目录（绝对路径不入库）：

| 文件 | 内容 |
| --- | --- |
| `10-still-comparison.png` | 原图与五种滤镜的对照，已人工查看 |
| `11-video-comparison.png` | 原视频与双 LUT 视频的首/中/末帧，已人工查看 |
| `ui-01-catalog.png` 至 `ui-05-original-toggle.png` | 真实桌面截图 |
| `cli-real-report.json`、`*.png.json`、`*.mp4.json` | 后端、版本、SHA-256、尺寸、帧数和耗时 |
| `pixel-verification.json` | 最终逐像素与音频检查 |
| `pixel-verification-before-fix.json` | 零强度失败原始记录，不覆盖历史失败 |
| `cli-real-report-before-fix.json` | 首轮真实渲染记录 |
| `catalog-pipe-report.json` | 455,345 字节完整 JSON 管道结果 |
| `ui-report.json`、`unsupported-report.json`、`unit-test-report.json` | UI、预期拒绝和回归测试报告 |

首轮视频夹具使用 stream copy，未限制 duration 的 LUT 输出随源保留了 32 帧；最终夹具重新编码为严格 1 秒/30 帧后重测，两条视频路径均为 30 帧。对照图最初的 `%` 标签触发 drawtext 转义告警，已改为 literal expansion 并重新生成。

## 尚未证明

没有完成新增 67 张可用卡的逐张渲染，更没有完成全部 788 张的剪映 UI 对照。「蓝调时刻」100% 强度有明显锐化观感，仍需同素材的剪映 UI 无损参考来判断是否一致；不能因 native 调用成功就升级为 verified。

99 张不可用卡的缺口仍是加载器、效果图或模型接入，不是缺缓存。HDR、长视频、不同平台、复杂旋转元数据和取消时的系统级压力测试不在本轮真实覆盖内。

剪映二进制、模型、效果包、LUT、Shader 和测试媒体均留在本机私有目录，没有加入 Git。本轮只修改源码、测试与文档，没有提交、推送或发布。
