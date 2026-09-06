# QCut 封面：实现状态与本地资料

更新：2026-09-06。状态：已补齐可编辑文字模板工作区；不是剪映完整功能或素材库复刻。

## 工作目录

- Git 根目录：`/Volumes/MOVE SPEED/qcut`
- 应用根目录：`/Volumes/MOVE SPEED/qcut/qcut`
- 分支：`codex/cover-design`
- 基线：`origin/master`，`2b9f355bd7accfd24a0e02a584e6ab6f223853d0`
- 首次实现验收时尚未提交；后续按单文件提交方式交付，发布状态以该分支的 Git/PR 记录为准。原 Desktop 工作区和机械盘副本保留，未清理。

## 研究文档

下面两份文档从桌面逐字节复制，未改写原研究结论；历史实验日期及局限仍以原文为准：

- [剪映封面机制研究](./jianying-research.zh-CN.md)：来自 `~/Desktop/剪映封面机制研究.md`。
- [QCut 封面与封面模板实现方案](./implementation-plan.zh-CN.md)：来自 `~/Desktop/QCut封面与封面模板实现方案.md`。

原方案是完整目标，不是当前交付清单。下面区分本轮已经实现和仍需实现的内容。

2026-09-06 原生剪映实测和 QCut UI 对照：

- [中文：交互差异、实现与验证](./ui-comparison-2026-09-06.zh-CN.md)
- [English: UI comparison, implementation and validation](./ui-comparison-2026-09-06.en.md)

## 已实现

1. 预览面板工具栏和主轨道“封面”按钮打开同一个编辑器，支持鼠标、键盘和中英界面。
2. 图片导入接受 PNG/JPEG/WebP，解码后统一成 PNG；使用项目画布尺寸，支持完整显示和居中填满。
3. 当前帧和指定帧复用正式静帧导出渲染器，不截取编辑器界面、不移动时间线播放头；保存场景、帧号、FPS 和时间来源。底部支持导入、逐帧、帧号、滑杆和按需生成的七点胶片缩略图。
4. 媒体仍在加载或当前帧的可见媒体缺少 URL 时拒绝取图；继续执行已有受限素材导出检查。
5. 独立保存 `CoverDesignV1`、项目尺寸 PNG、640×360 WebP 缩略图，以及 `project.cover` 引用。设计支持一个背景和最多 20 个文字图层，旧单图层设计仍可读取。
6. 资源用 SHA-256 寻址并校验大小、哈希和逻辑路径，读取失败不能作为成功发布；设计版本已存在但内容不同时拒绝覆盖。
7. 项目封面引用在资源和设计写入并读回后更新；检查活动项目、画布和旧封面，避免过期弹窗覆盖新状态。
8. 项目卡片和列表共用封面加载组件，优先显示正式封面，缺失时回退原项目缩略图；释放临时 Blob URL。
9. 重开可恢复封面；取消不改变正式引用；清除只解除绑定，回退原缩略图。复制项目先复制封面资源，删除项目清理其封面存储。
10. 独立工作区包括左侧模板/文本、顶部文字工具、中央画布和底部来源与保存区；本轮在 1440×900 和 390×844 下验证。共享 Dialog 新增可选固定布局，默认滚动行为保持不变。
11. 五款 QCut 原创模板生成可逐层编辑的文字，缩略图使用实际来源图；切换模板只替换模板所属文字，保留手动文字。
12. 文字可编辑内容、字号、三类系统字体、颜色、粗斜体、下划线、对齐、描边/阴影/背景开关、前后层级、文本框宽高和旋转；支持画布拖动和键盘微调。
13. 背景支持完整显示/填满、缩放、位置和裁剪模式；裁剪时暂时隐藏文字并停用文字工具。独立撤销重做保留最多 60 步，完整拖动只提交一步。

## 存储边界

首个 `CoverBlobStore` 实现使用现有 OPFSAdapter，按项目隔离在 `project-cover-<projectId>` 目录。逻辑路径如下，当前会编码为 OPFS 的扁平文件名：

```text
cover/objects/<sha256>.png
cover/objects/<sha256>.webp
cover/designs/<designId>/<revision>.json
```

项目引用随现有项目元数据存储。Blob URL 只用于当前会话显示，不作为正式封面数据。

**当前不是原生项目文件夹中的可搬运封面目录。** 浏览器清除站点数据会删除这份 OPFS 数据；只复制磁盘项目文件夹不能保证带走封面。Electron 原生文件系统适配、项目包导入导出以及跨机器迁移需要下一阶段完成。

边界限制：单张输入不超过 32 MiB，单边不超过 8192，像素总数不超过 33,554,432；模型只接受一个背景图片和最多 20 个已知文字图层。未知图层类型会报错，不静默丢弃。文字效果目前采用固定参数，尚无气泡、自定义字体包或贴纸图层。

## 剪映参考缓存

私有路径：`/Volumes/MOVE SPEED/qcut/.local-reference/jianying-cover/`。

| 内容 | 数量 | 说明 |
| --- | ---: | --- |
| 封面校准 JPEG | 4 | 指定实验项目的 Resources/cover、draft_cover 和时间线封面 |
| CEF WebP 图片载荷 | 74 | 预览参考；不是经过逐项归类验证的完整封面模板目录 |
| 可编辑模板资源包 | 0 | 未发现并缓存完整可编辑包，不能宣称离线模板能力 |
| 总计 | 78 | 2,997,082 字节，所有文件按 manifest 重新计算 SHA-256 通过 |

缓存只用于本地行为研究，不成为 QCut 内置素材，也没有加入 Git。`.git/info/exclude` 排除根目录 `.local-reference/`。仅抽取图片载荷，不复制账号令牌、完整 CEF 请求头、MMKV、IndexedDB 或加密草稿正文。校准项目在原实验之后有过修改，当前 `draft_cover.jpg` 不等同于原实验时状态。

重建已知样本缓存，在应用根目录运行：

```sh
node scripts/cache-jianying-cover-reference.mjs '../.local-reference/jianying-cover'
```

脚本第三个参数可指定实验项目目录，但该目录仍须具有脚本中列出的已知样本文件。它是本地证据留存脚本，不是通用剪映模板下载器。

## 验证证据：2026-09-06

- 97 项测试通过，覆盖 14 个测试文件；含本轮新增的模板、文字渲染、历史、拖动取消、异步发布、文字资源复制和主轨道入口回归。
- Web TypeScript 检查及变更代码 Biome 检查通过；具体命令和运行边界见本轮对照文档。
- 从真实文件选择器导入 4 秒 H.264 校准视频并加入时间线，在 30 FPS 项目选择第 36 帧（1.2 秒）；编辑模板标题和手动文字后保存，等待弹窗关闭，再刷新重开。
- 重开后第 36 帧、中文标题、手动文字位置、下划线和背景仍在；从主轨道入口再次保存背景缩放 1.01、横向位置 0.51，刷新重开后数值仍在。
- 实际浏览器预览为 1920×1080，64×36 像素采样含 424 种颜色，非空白。桌面与窄屏截图已在会话中目视检查；未将本轮截图写入下面的历史截图目录。
- 本轮未修改或发布剪映项目，也未做原生 Electron 封面 E2E、跨机器迁移、完整模板包或剪映逐像素对齐验证。

## 历史验证：2026-09-05

以下是上一阶段证据，不代表本轮视频测试的输出尺寸、哈希或截图：

- 58 项测试通过，覆盖模型、资源存储、几何计算、帧捕获、项目绑定、序列化、缩略图和共享弹窗回归。
- `bunx tsc --noEmit -p apps/web/tsconfig.json --pretty false` 通过。
- 26 个修改或新增的代码、测试和脚本文件通过 `biome check`。
- `node --check scripts/cache-jianying-cover-reference.mjs` 通过。
- 新 SSD 仓库通过 `git fsck --connectivity-only --no-dangling` 和 `git diff --check`。
- 浏览器完成图片导入、发布、刷新重开、项目卡片展示、当前帧发布、清除、取消不发布、键盘 Enter 发布。
- 当前帧测试用已有 store API 把校准图片加入 5 秒时间线，重开等待媒体加载后通过真实 UI 捕获；不是完整媒体导入 UI 或视频解码 E2E。
- 直接导入与该单图片时间线取图的 PNG 哈希相同：`9852b45fd26df78df8a9eeff2599692d377fd1951d47ec32ad6bc5460824d7ea`。
- PNG 为 1080×1920、2,124,093 字节；缩略图为 640×360、23,026 字节。PNG 中心 RGBA 为 `[222, 201, 51, 255]`，并已人工查看截图，非空白图。

本地截图：`/Volumes/MOVE SPEED/qcut/.local-reference/validation/`，重点查看 `cover-frame-desktop.png`、`cover-frame-mobile.png`、`cover-reopened-mobile.png`、`cover-project-card.png`。机器可读摘要为同目录 `cover-validation.json`。

测试命令，在应用根目录运行：

```sh
bunx vitest run packages/editor-core/src/cover apps/web/src/lib/cover apps/web/src/components/editor/cover apps/web/src/lib/export/__tests__/export-still-frame.test.ts apps/web/src/stores/__tests__/project-cover.test.ts apps/web/src/lib/storage/__tests__/storage-service-cover.test.ts apps/web/src/components/project/__tests__/project-thumbnail.test.tsx apps/web/src/stores/__tests__/project-store-save-current-project.test.ts apps/web/src/components/project/__tests__/use-project-thumbnail-loader.test.tsx apps/web/src/components/ui/dialog.test.tsx apps/web/src/components/editor/timeline/__tests__/timeline-track-label.test.tsx
```

## SSD 与运行环境

MOVE SPEED 是 SSD，但当前格式是 exFAT，不支持正常依赖树所需的符号链接。源码和私有资料已放 SSD；本轮依赖、测试和 Vite 在内置 APFS 的字节一致镜像运行：

```text
/Users/peter/.cache/qcut-cover-validation/qcut
http://127.0.0.1:5188/#/projects
```

这不是自动双向同步。后续以 SSD 源码为准，停止开发服务器后可先预览同步：

```sh
rsync -rltn --exclude=node_modules --exclude=.git --exclude=dist --exclude=output --exclude=.playwright-cli --exclude='._*' '/Volumes/MOVE SPEED/qcut/qcut/' "$HOME/.cache/qcut-cover-validation/qcut/"
```

确认目标是上述专用运行镜像，再去掉 `-n` 同步。在镜像里运行 `bun install --frozen-lockfile --ignore-scripts`，随后进入 `apps/web` 执行 `VITE_BUILD_TARGET=web bunx vite --host 127.0.0.1 --port 5188 --strictPort`。该同步不删除镜像多余文件；源码发生删除或重命名时需另行核对。不要把镜像依赖、自动生成产物或缓存批量复制回 SSD。

## 下一阶段

- 气泡、自定义字体、描边/阴影/背景颜色与数值参数；多选、直接缩放/旋转手柄和更完整的裁剪比例交互。
- 可导入模板包的 schema、参数绑定、离线包和缺依赖错误；当前仅有内置原创文字预设，剪映目录卡片与完整可运行包仍分开统计。
- Electron 原生文件系统存储、项目包打包与重开、垃圾回收、并发写入事务及跨进程锁。
- CLI/API 的创建、编辑、渲染和封面绑定接口。
- 原生 Electron 实机 E2E、复杂多图层/转场场景的逐像素验证。基础视频导入与取帧已经在浏览器 UI 实测；当前静帧渲染路径仍有原有转场边界差异，不能据此宣称剪映完整视觉对齐。
- 验证复制、删除的真实浏览器生命周期；本轮这部分以单元测试和代码链路为主。

取消或更换来源留下的未引用内容目前保留到项目删除，不在编辑过程中即时回收，以免误删其他操作仍在引用的资源。多窗口并发发布及写盘成功但读回失败后的磁盘回滚，不属于已验证的事务保证。
