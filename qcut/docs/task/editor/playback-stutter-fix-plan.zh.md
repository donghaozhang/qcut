# QCut 播放卡顿修复计划

状态：Proposed  
日期：2026-08-09  
当前分析分支：`draft-profile`

## 目标

修复 QCut 在播放普通 H.264 视频时出现的以下问题：

- 选择“流畅画质”后播放按钮显示为播放中，但画面停在首帧。
- 代理视频切换分片时出现停顿、退回原片或时间跳变。
- QCut 已经打开编辑器时，从 Finder 再打开视频可能得到空时间线和黑色预览。
- 开启调色示波器后 Renderer CPU 接近满核，普通视频播放也可能掉帧。
- 播放中的视频实际前进，但部分依赖 Zustand 的时间显示或处理逻辑仍读取旧时间。

本文只规划播放器和编辑器预览链路。视频文件本身不需要重新编码，转场实现也不在本任务范围内。

## 已确认事实

用于复现的视频具有以下属性：

| 项目 | 结果 |
| --- | --- |
| 容器 | MP4，`moov` 位于 `mdat` 前，可快速启动 |
| 视频 | H.264 High，1280x720，30 fps，`yuv420p` |
| 音频 | AAC，约 193 kbps |
| 时长 | 约 90 秒 |
| 完整软件解码 | 约 0.84 秒，约 107 倍实时速度，无错误 |
| 最大关键帧间隔 | 约 6 秒，只会影响随机定位，不足以解释连续播放卡死 |

运行时观察：

- “流畅画质”下，Store 的 `isPlaying` 为 `true`，但代理 `<video>` 停在 `currentTime = 0`，呈现帧不再增长。
- “原画质”下，同一个视频可以连续前进，说明媒体解码不是主要故障点。
- 开启 RGB Parade、Waveform 和 Vectorscope 时，Renderer CPU 约为 74% 到 101%。
- 关闭示波器后，播放期间 Renderer CPU 仍约为 52%，停止后降至约 18%。
- Finder 热打开失败时，新项目和媒体已经存在，但时间线为空并显示默认 7200 秒。

## 根因

### P0：播放开始后重新设置代理 `src`

`resolvePreviewVideoSource` 只在播放状态下选择代理。用户点击播放后，`VideoPlayer` 先对原片调用 `play()`，随后 React 提交新的代理源并设置 `video.src`。浏览器会终止正在进行的播放请求并重置媒体元素。

当前 `onCanPlay` 只执行时间校准，没有在确认播放仍被请求后重新调用 `play()`。播放错误又被静默吞掉，因此 UI 仍显示播放中。

相关文件：

- `apps/web/src/lib/preview/preview-video-source.ts`
- `apps/web/src/components/ui/video-player.tsx`
- `apps/web/src/components/ui/__tests__/video-player.test.tsx`
- `apps/web/src/test/e2e/preview-quality-proxy.e2e.ts`

### P0：代理窗口切换没有交接状态

代理窗口默认长度为 12 秒、重叠 2 秒、步长约 10 秒。窗口变化时，旧请求立即取消，状态变为 `generating`，播放器先退回原片；新代理完成后又切回代理。每个窗口可能触发两次媒体源重置。

相关文件：

- `apps/web/src/hooks/preview/use-video-enhancement-proxy.ts`
- `apps/web/src/components/editor/preview-panel/preview-element-renderer.tsx`
- `apps/web/src/hooks/preview/__tests__/use-video-enhancement-proxy.test.tsx`

### P0：Finder 热打开同时争用项目 Store

`FileOpenHandler` 在旧编辑器路由仍挂载时调用 `createNewProject`。该调用立即修改 `activeProject`，导致旧路由发现 URL 中的项目 ID 与 Store 不一致，并重新加载旧项目。新旧 `loadProject` 会清空和重建同一组媒体、时间线 Store。

相关文件：

- `apps/web/src/components/file-open-handler.tsx`
- `apps/web/src/routes/editor.$project_id.lazy.tsx`
- `apps/web/src/stores/project-store.ts`
- `apps/web/src/stores/media/media-store.ts`
- `apps/web/src/test/e2e/open-with-media.e2e.ts`

### P1：普通播放触发顶层 Preview 每帧 React 更新

`useScreenRecordingPreview` 无条件监听每个 `playback-update`，并通过 `setSmoothTime` 更新 React 状态。`smoothTime` 又传给所有 `PreviewElementRenderer`，所以即使项目只有一个普通视频，也会让预览子树每个动画帧重新渲染。

相关文件：

- `apps/web/src/components/editor/preview-panel/use-screen-recording-preview.ts`
- `apps/web/src/components/editor/preview-panel.tsx`
- `apps/web/src/components/editor/preview-panel/preview-element-renderer.tsx`

### P1：播放 Store 与示波器时间来源不一致

`playback-store.ts` 声明了 500 ms 的 Store 同步间隔，但播放循环只更新模块级 `_mutableCurrentTime` 和派发事件，没有按该间隔更新 Zustand。

`useScopeDockFrame` 虽然监听 `playback-update`，刷新时仍从 Zustand 读取旧 `currentTime`。这会重复分析旧时间对应的帧，并让依赖 Store 的 UI 看起来冻结或在暂停时跳动。

相关文件：

- `apps/web/src/stores/editor/playback-store.ts`
- `apps/web/src/hooks/preview/use-scope-dock-frame.ts`
- `apps/web/src/components/editor/timeline/timeline-toolbar.tsx`

### P1：示波器和时间线存在额外计算成本

- 示波器每次采样都创建 Canvas 并读取像素。
- 没有任何调色改动时，`processColorImageData` 仍复制并遍历整张采样图多次。
- 三个示波器分别扫描同一份像素数据并执行大量 Canvas 绘制。
- 空时间线默认 7200 秒，Ruler 会创建数千个刻度 DOM 节点。

相关文件：

- `apps/web/src/lib/color/color-analysis.ts`
- `apps/web/src/lib/color/color-pixel-processor.ts`
- `apps/web/src/lib/color/color-scopes.ts`
- `apps/web/src/components/editor/preview-panel/preview-scope-dock.tsx`
- `apps/web/src/constants/timeline-constants.ts`
- `apps/web/src/components/editor/timeline/timeline-ruler.tsx`

## 实施计划

### Subtask 1：确定性媒体换源

优先级：P0  
目标：任何原片、代理或代理分片切换后，播放器都处于与全局播放状态一致的状态。

实现：

1. 在 `VideoPlayer` 中增加统一的媒体源切换流程。
2. 为每次源变化生成递增的 load generation，过期事件不得修改当前播放器。
3. 只有源身份真正变化时才设置 `src`。
4. 等待 `loadedmetadata` 后，根据 timeline time 和 `sourceTimeOffset` 校准 `currentTime` 与 `playbackRate`。
5. 等待 `canplay` 后再次读取最新播放 Store；仅当 generation 仍有效、仍在 clip 范围且仍请求播放时调用 `play()`。
6. 暂停期间发生源变化时只定位，不恢复播放。
7. 只忽略由预期换源产生的 `AbortError`，记录其他 `play()` 失败原因。
8. 保留同步 `playback-play` 路径，避免破坏 iPad 的用户手势播放要求。

不采用：

- 只把 `videoSource` 加进现有播放 effect 的依赖。
- 只调整两个 React effect 的声明顺序。
- 使用 `key={src}` 强制重新挂载 `<video>`。

这些方案没有解决异步 `canplay`、快速连续换源、代理分片和用户手势问题。

测试：

- 播放中从原片切到代理，`play()` 在新源 ready 后再次执行。
- 换源后按照 `sourceTimeOffset` 恢复正确位置。
- 暂停中切换源不得调用 `play()`。
- A -> B -> C 快速切换时，B 的过期事件不得影响 C。
- E2E 验证代理 `currentTime`、`presentedFrames` 和时间线时间持续增长。

验收：

- 连续执行播放、暂停、播放 20 次，不出现 `isPlaying = true` 但媒体暂停。
- 原片和代理之间切换后音画时间误差不超过一帧。

### Subtask 2：代理分片预取和交接

优先级：P0  
目标：跨越每个代理窗口时不退回原片，不等待下一段生成。

实现：

1. 将代理状态拆为 `activeProxy` 和 `pendingProxy`。
2. 在当前窗口重叠区开始前生成下一窗口。
3. `pendingProxy` 未 ready 时继续使用 `activeProxy`。
4. 下一窗口 ready 且播放时间进入其范围后再原子替换 active。
5. 切换完成后再取消或释放上一请求和 URL。
6. seek 到远处时取消无关 pending 请求并生成目标窗口。
7. 先使用单 `<video>` 加预取方案；只有实测仍超过一帧停顿时再引入双播放器缓冲。

测试：

- 跨越 10 秒和 20 秒窗口边界，呈现帧持续增长。
- 下一代理生成较慢时仍保持当前代理，不退回原片。
- 快速 seek 不会应用过期代理。
- 代理失败时只降级一次到原片，并提供可诊断状态。

验收：

- 90 秒视频从头播放到尾，没有固定约 10 秒一次的冻结。
- E2E 中任何连续两帧的间隔不因换段超过既定容差；初始建议为 250 ms。

### Subtask 3：原子化 Finder 热打开

优先级：P0  
目标：旧编辑器路由和新项目导入不得并发加载不同项目。

实现：

1. 提取纯项目工厂，统一生成项目和主场景数据。
2. 增加不激活项目的持久化入口，或提取 `createProjectFromOpenedMedia` 服务。
3. 先把项目、媒体和时间线完整写入目标项目存储，不修改当前 live Store。
4. 使用目标项目自身的 `currentSceneId` 保存时间线，不能读取旧 `activeProject`。
5. 写入成功后导航到新项目，由新编辑器路由唯一执行 `loadProject`。
6. 任一步失败时清理本次创建的半成品项目，保留原项目 live state。
7. 保留当前串行队列，确保快速打开多个文件时按顺序处理。

测试：

- 冷启动 Open With 保持通过。
- 已打开项目 A 时热打开视频 B，最终路由、active project、媒体和时间线都属于 B。
- 连续打开 B、C 时分别创建两个完整项目，不混用媒体或 scene ID。
- 导入失败后项目 A 不被清空，也不留下不可见项目。

验收：

- 热打开后第一帧即可看到视频，时间线包含一个主轨媒体元素。
- 不出现默认 7200 秒空时间线。

### Subtask 4：拆分播放时钟和 React 渲染时钟

优先级：P1  
目标：普通单视频播放期间不让顶层 Preview 每个动画帧重新渲染。

实现：

1. 保留 `playback-update` 作为精确的命令式播放时钟。
2. 真正使用 500 ms 间隔同步 Zustand，供普通 UI 和辅助功能读取。
3. 将屏幕录制缩放、光标、转场和动画使用的 visual frame clock 与普通视频播放拆开。
4. `useScreenRecordingPreview` 仅在存在 zoom region 或可见 cursor overlay 时订阅逐帧时间。
5. 代理窗口在其 hook 内只在窗口 ID 变化时更新，不依赖顶层每帧 React state。
6. 普通视频只在 clip 边界、选择、seek、源变化或设置变化时重渲染。
7. 将无 selector 的 `usePlaybackStore()` 使用改为窄 selector，限制 Store 同步的影响范围。

测试：

- 普通视频播放 3 秒时，PreviewElementRenderer 渲染次数保持在固定低值。
- 启用转场、媒体关键帧、文字动画、cursor 或 zoom 时仍按照项目 fps 更新。
- 播放、暂停和 seek 后 Store 时间与精确时钟一致。

验收：

- 关闭示波器、无视觉动画的 720p 单视频播放不再保持约 50% Renderer CPU。
- 不牺牲转场、关键帧和屏幕录制动画的时间精度。

### Subtask 5：示波器和时间线性能

优先级：P1/P2  
目标：开启专业监看工具时仍可稳定播放，并让长时间线只渲染可见内容。

实现：

1. `useScopeDockFrame.refresh` 接收明确的播放时间；播放事件直接传入 `event.detail.time`。
2. 复用采样 Canvas，避免每 200 ms 新建 Canvas 和 backing store。
3. 没有调色编辑时直接返回采样帧，跳过 `processColorImageData` 的复制和逐像素变换。
4. 播放时降低采样尺寸或刷新率，暂停和 seek 后立即生成高质量示波器。
5. 如果主线程仍超预算，再把像素统计移动到 Worker/OffscreenCanvas。
6. 时间线 Ruler 根据 scroll viewport 和 overscan 只渲染可见刻度。
7. 将“两小时最大项目能力”和“空项目默认工作区长度”拆成两个概念，不依赖数千个不可见刻度证明长项目支持。

测试：

- 示波器使用播放事件时间，而不是旧 Store 时间。
- 无调色路径不调用逐像素颜色处理。
- 2 小时时间线仍能滚动定位，但刻度 DOM 数量有明确上限。
- 开启三个示波器播放 5 秒，视频时间和呈现帧持续增长。

验收：

- 开启三个示波器时 Renderer 不再接近持续满核。
- 7200 秒时间线的刻度节点数量与视口宽度相关，而不是与总时长线性相关。

## 测试矩阵

| 场景 | 原画质 | 流畅画质 | 自动画质 | 示波器 | 必须验证 |
| --- | --- | --- | --- | --- | --- |
| 单段 720p/30 H.264 | 是 | 是 | 是 | 关 | 时间、帧、音频连续 |
| 跨 10 秒代理边界 | 否 | 是 | 是 | 关 | 不冻结、不退回原片 |
| 播放中 seek | 是 | 是 | 是 | 关 | 新位置正确、旧请求失效 |
| 暂停高质量预览 | 是 | 是 | 是 | 关 | 保持暂停、帧清晰 |
| 三示波器播放 | 是 | 是 | 是 | 开 | 时间和示波器都前进 |
| Finder 冷启动打开 | 是 | 不限 | 不限 | 关 | 项目、媒体、时间线完整 |
| Finder 热打开 | 是 | 不限 | 不限 | 关 | 无旧项目回载 |
| 转场跨代理边界 | 否 | 是 | 是 | 关 | 转场进度和视频帧连续 |

## 实施顺序与提交边界

建议按以下原子提交推进：

1. `fix(preview): resume playback after media source changes`
2. `test(preview): assert proxy playback advances`
3. `fix(preview): prefetch and hand off proxy windows`
4. `test(preview): cover proxy window boundaries`
5. `fix(app): make open-with media import route-atomic`
6. `test(app): cover hot open-with media import`
7. `perf(preview): isolate frame-driven preview updates`
8. `perf(color): reduce scope sampling overhead`
9. `perf(timeline): virtualize ruler markers`

实现与其直接测试可以位于同一个最小原子提交；不要把五个 subtask 合并成一个难以回滚的大提交。

## 立即修复边界

当前应立即完成 Subtask 1、2、3，因为它们影响播放器正确性和转场验收可信度。

Subtask 4、5 可以随后完成。在此之前的临时规避方式是：

- 使用“原画质”。
- 关闭调色示波器。
- 从媒体面板确认视频已位于主轨道。

这些只是临时规避，不构成完成标准。

## 完成定义

任务只有在以下条件全部满足后才能标记完成：

- 同一 90 秒视频在原画质、流畅画质和自动画质下都能连续播放到结尾。
- 代理初次切换和每个窗口交接都不会留下暂停的 `<video>`。
- 播放时间、媒体时间和呈现帧同时前进。
- Finder 冷打开和热打开测试都通过。
- 开启示波器时仍满足基本实时播放要求。
- 新增单元测试和 Electron E2E 覆盖真实行为，不只检查属性或 URL。
- 测试媒体、生成代理和本地性能证据保持在忽略目录，不提交大型二进制文件。
