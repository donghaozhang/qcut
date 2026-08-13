# “电影柔光”真实卡四方无损帧对照

记录时间：2026-08-13

## 结论

真实剪映卡“电影柔光”已经完成四方端到端对照：剪映 UI、独立二进制 oracle、QCut 产品预览和 QCut 产品导出。

- 剪映 UI 与独立 oracle 达到 `verified`：`RMSE 0.868566`、`SSIM 0.998680`、`Delta E 0.487112`。
- 独立 oracle 与 QCut 产品 provider 达到 `verified`：`RMSE 0.213559`、`SSIM 0.999832`、`Delta E 0.055983`。
- QCut 预览确实调用 `jianying-local-effect-v1`，不再只是显示结构近似或原图。
- QCut 实际导出的 H.264 帧达到 `close`：oracle 对导出帧 `RMSE 2.728705`、`SSIM 0.988730`、`Delta E 1.558960`。

前三项证明真实卡的本机二进制重放和 QCut 产品接线有效。导出帧的剩余差异主要出现在 H.264、BT.709 limited 和 4:2:0 编码之后，不能归因于滤镜 provider。

## 资源身份

| 字段 | 值 |
| --- | --- |
| 中文标题 | 电影柔光 |
| 资源 ID | `7447126702137904420` |
| 版本 | `9673f80b8e2f5a07f02f9ce1130b784a` |
| 目录分类 | 人像、基础 |
| 包文件数 | 121 |
| 包目录树 SHA-256 | `9db2974298a914c4a465c4fc42a1e797f4c2e416bd2d9442d2ab57174526f971` |
| QCut provider | `jianying-local-effect-v1` |
| QCut fidelity | `native-local` |

目录树哈希按相对路径代码点顺序排序，并依次哈希 `path + NUL + bytes + NUL`。产品只接受上表固定资源、版本和哈希，避免同 ID 的未知缓存内容进入本机运行时。

## 卡片结构

真实包不是单 LUT。静态结构检查得到约 10 个渲染阶段：

1. 高斯模糊与二分之一、四分之一、八分之一分辨率 render target 链。
2. inverse-gamma 处理。
3. `SoftLight` 图层，包内 opacity 为 70%，scale 为 103%。
4. `SGlow` 高光提取与扩散，包含 threshold、brightness、宽度和 RGB 增益参数。
5. 64³ tiled LUT，包内强度为 80%。
6. 最终 Normal 图层混合，包内 opacity 为 64%。

QCut 的结构 fallback 只保留 bloom + LUT 的可解释近似。`native-local` 路径不执行该近似，而是把未经修改的固定包交给本机二进制宿主。

## 四方定义

所有量化输入最终保存为 PNG；比较工具先解码为 RGB，再计算 RMSE、PSNR、SSIM 和 Delta E。

| 方位 | 输入 | 取得方式 |
| --- | --- | --- |
| 剪映 UI | `filtered-frame-0075.png` | 中文剪映 UI 应用真实卡、强度 100，导出 ProRes 4444 后解码第 75 帧 |
| 二进制 oracle | `oracle-default.png` | 独立 `filter-sequence` 宿主直接加载固定包，同一张 1280×720 RGBA 输入连续运行三帧 |
| QCut 预览 | `qcut-preview-filtered.png` | 真实 Electron 产品 UI 创建调整层并应用卡片，读取实际 `color-preview-canvas` |
| QCut 导出 | `qcut-export-frame-0015.png` | 真实导出对话框生成 1 秒 MP4，再无损解码第 15 帧为 PNG |

四宫格颜色边框约定：蓝色左上为剪映 UI，绿色右上为 oracle，黄色左下为 QCut 预览，红色右下为 QCut 导出。

这里的“无损帧对照”是指四个比较样本都以 PNG 保存，避免指标工具再次有损压缩。QCut 导出的 MP4 本身仍是 H.264 `yuv420p`，所以从它解码出来的 PNG 已经包含编码损失，不能称为无损视频导出。

## 量化结果

### 1280×720

| 对照 | 状态 | RGB RMSE | PSNR | SSIM | Delta E |
| --- | --- | ---: | ---: | ---: | ---: |
| 剪映 UI vs oracle | verified | 0.868566 | 49.354752 | 0.998680 | 0.487112 |
| oracle vs QCut provider | verified | 0.213559 | 61.540462 | 0.999832 | 0.055983 |
| 剪映 UI vs QCut provider | verified | 0.892718 | 49.116521 | 0.998524 | 0.509132 |
| oracle vs QCut 导出帧 | close | 2.728705 | 39.411671 | 0.988730 | 1.558960 |
| 剪映 UI vs QCut 导出帧 | close | 2.916723 | 38.832900 | 0.987719 | 1.647387 |
| QCut provider vs QCut 导出帧 | close | 2.722841 | 39.430357 | 0.988778 | 1.555517 |

### QCut 预览尺寸 480×270

| 对照 | 状态 | RGB RMSE | PSNR | SSIM | Delta E |
| --- | --- | ---: | ---: | ---: | ---: |
| 产品预览 canvas vs 同尺寸 provider | close | 1.423794 | 45.061862 | 0.997137 | 0.742217 |

E2E 内部逐通道检查同时得到 `MAE 1.097667`、最大误差 9。该差异发生在 renderer 的 Canvas2D fit、逐层 canvas 合成和最终读回之后；provider 自身与 oracle 的全分辨率对照已经通过 verified 门禁。

## 发现并修复的产品问题

真实 E2E 首次失败不是选择器问题。调整层栈原先只向下层素材传递“启用且已解析 cube 的 LUT”，因此 `native-local` multi-pass 设置虽然存在于时间线和 UI 卡片中，却没有进入 `ColorPreviewCanvas`。

修复后的行为：

- 调整层把 LUT 和 multi-pass 都作为像素颜色层传给下方素材。
- 基础亮度、对比度等 CSS 调整不会同时进入该像素层，避免重复应用。
- 真实 multi-pass 使素材进入 `usesPixelColor` 路径并调用本机 provider。
- 原有 cube LUT 调整层行为保留。
- 禁用状态和只有 CSS 调整的图层不会误建像素预览层。

相关代码：

- `apps/web/src/components/editor/preview-panel/adjustment-layer-stack.tsx`
- `apps/web/src/lib/color/browser-color-rendering.ts`
- `apps/web/src/lib/color/jianying-local-effect-preview.ts`
- `electron/jianying-filter-local-runtime/package-preparer.ts`
- `electron/jianying-filter-local-runtime/render.ts`

## QCut 导出规格

真实导出文件经过 `ffprobe` 确认为：

```text
codec: H.264 High
resolution: 1280x720
pixel format: yuv420p
color: BT.709 limited
frame rate: 30 fps
duration: 1.000 s
frames: 30
```

因此当前产品可以宣称“滤镜运行时 verified，最终常规视频导出 close”，不能宣称四路最终像素完全一致。若要让导出侧也参加 verified 逐像素门禁，下一步应增加正式的无损 still/pre-encoder frame 输出，或提供 ProRes 4444 / lossless RGB 导出选项。

## 自动化门禁

真实 Electron E2E：

```bash
QCUT_JIANYING_SOFT_GLOW_SOURCE="/absolute/path/to/source.png" \
QCUT_JIANYING_SOFT_GLOW_EVIDENCE="/absolute/path/to/evidence" \
bunx playwright test \
  apps/web/src/test/e2e/jianying-soft-glow-four-way.e2e.ts \
  --reporter=line
```

最终结果：`1 passed (27.5s)`。

聚焦回归：

```text
5 test files passed
26 tests passed
Web TypeScript + Vite production build passed
Electron TypeScript and preload/runtime build passed
```

E2E 同时验证：

- 卡片显示真实资源和 10 Pass 标识；
- 时间线调整层保存固定 resource ID、version、provider 和 fidelity；
- 实际预览 canvas 存在；
- 预览 canvas 与独立调用 provider 的误差低于门禁；
- 真实导出对话框生成可由 `ffprobe` 和 FFmpeg 解码的 30 帧视频。

## 证据位置

二进制和媒体证据仅保存在仓库外：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  cinematic-soft-glow-four-way/2026-08-13/
```

关键文件：

```text
comparison/four-way-contact-sheet.png
comparison/differences-contact-sheet-x8.png
comparison/metrics.json
comparison/manifest.json
qcut-e2e/qcut-preview-ui.png
qcut-e2e/qcut-export.mp4
qcut-e2e/qcut-export-frame-0015.png
```

`manifest.json` 记录 17 个证据文件的相对路径、字节数和 SHA-256，以及实际 QCut 导出的 `ffprobe` 结果。仓库中不提交剪映二进制、Framework、效果包、Shader、LUT、纹理、源素材或输出媒体。
