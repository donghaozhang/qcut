# 编辑器预览画质对齐

日期：2026-07-25

## 这次做了什么

先实现了最贴近剪映截图的一块：预览性能/预览画质切换。

- 新增「自动」和四档手动预览画质：
  - 自动
  - 原画质
  - 清晰画质
  - 流畅画质
  - 低清画质
- 在编辑器预览工具条里新增「预览画质」下拉菜单。
- 把选择状态放进 playback store。
- 默认使用「自动」：轻量素材保持原素材预览，高分辨率素材或带视频增强的素材会自动进入 proxy 预览策略。
- 非原画质模式会复用已有 Electron FFmpeg preview proxy 管线。
- 预览 proxy 会提前生成，但只在播放时切换到 proxy；暂停时恢复素材源，保证静帧清晰。
- Electron 侧补了 preview proxy 缓存统计和清理 API。
- 画质下拉菜单底部现在会显示 preview proxy 缓存大小、文件数量和缓存上限，并提供「打开缓存目录」和「清理预览缓存」入口。
- frame cache 的 hash 现在会包含当前预览画质和实际预览尺寸，避免「流畅/低清/原画」或不同面板尺寸之间互相误用缓存状态。
- frame cache 现在不再只是写入：暂停状态 seek 到已缓存时间点时，会把缓存 `ImageData` 画到预览 canvas，目标视频帧真正呈现后再自动撤下；开始播放也会立即撤下缓存层。
- 缓存捕获面已经从整个预览编辑区域收窄到纯画面层，编辑控制点、安全框和渲染状态不会被烙进缓存图。
- 视频帧事件现在带 timeline time；只有所有当前视频层都已经呈现目标时间点，才允许写入该时间点的缓存，避免 seek 后误存上一帧。
- 自动模式现在有第一版运行时播放健康监测：播放时如果连续出现较慢的 `playback-update` 间隔，会把实际预览画质临时降到「流畅」或「低清」；暂停或手动切换画质会清掉临时降级。
- 运行时播放健康现在也会监听 `requestVideoFrameCallback` 的真实视频帧呈现节奏。也就是说，即使 app 层播放循环还在 tick，视频解码/呈现本身卡住，也能触发自动模式降到「流畅」或「低清」。
- 自动降档现在会保留触发快照，并在画质菜单里直接显示「预览渲染慢帧 / 视频解码帧停顿 / 两者同时卡顿」以及界面帧、视频帧的平均间隔和停顿次数。暂停、稳定恢复或手动选档时会同时清掉诊断。
- 预览专用效果渲染现在会跟随实际预览画质降级：播放时「流畅」进入 reduced 模式，跳过高成本 distortion/person-tracking 预览 canvas；播放时「低清」进入 minimal 模式，进一步跳过 composite/particle/decoration 预览 canvas；暂停时永远恢复 full 预览效果。
- 不改导出数据：这个设置只影响编辑器预览播放，不影响最终导出。
- 补了单元测试和 Electron E2E，覆盖画质配置、无视觉增强时强制生成 proxy、真实视频播放 source/proxy 切换。

随后补了一块蒙版画布体验：

- 把原来的单个右下角缩放点升级为八向控制点：
  - 左上、上、右上、右、右下、下、左下、左
- 拖拽边缘控制点时只改对应轴，并让相反边视觉上保持锚定。
- 拖拽角点时支持锁定比例。
- 旋转后的蒙版 resize 会按蒙版本地坐标换算回画布坐标。
- 羽化不再只靠 glow 暗示：普通形状显示羽化范围虚线，线性蒙版显示上下羽化线，钢笔蒙版沿路径显示羽化 guide。
- 线性蒙版现在在预览画布上有上下羽化范围 handle，可以直接拖动，也可以用键盘微调，实时改蒙版的 feather 值。
- 镜面蒙版新增中心轴线和左右方向提示，并且只保留左右边界缩放控制点。
- 镜面蒙版现在有明确的方向模式：左侧、双向、右侧。右侧属性面板提供同样的方向切换；预览画布上也有就地左/双/右按钮、有效范围 guide，以及专门的左右范围控制点。
- 线性/镜面蒙版的真实 SVG mask 渲染现在会跟随几何属性，不再是固定全画布 gradient：线性蒙版使用蒙版中心和旋转，并按本地垂直方向渐变；镜面蒙版使用蒙版中心、宽度和旋转，并按本地水平方向渐变。这样预览/导出 mask 会和画布控制点保持一致。
- 镜面方向现在也会影响真实 SVG mask：双向保留原来的对称镜面效果，左侧/右侧会渲染单边镜面渐变，所以导出语义和画布/属性面板一致。
- 反转文案改成「反选」，反选状态会在画布上显示斜线 guide。
- 新增真实 Electron E2E，确认导入视频、打开「画面 / 蒙版」、选择矩形蒙版后，画布上能看到八向控制点和羽化 guide；再切到镜面蒙版后确认镜面轴线、反选 guide 和左右边界控制点。

然后补了第一版蒙版跟踪流程：

- 扩展蒙版 tracking metadata，支持暂停状态、进度、锚点帧、已跟踪帧数量、已修正帧记录。
- 跟踪控件现在会显示进度、处理中/已暂停/完成/失败状态，并提供暂停/继续、重新分析、修正当前帧按钮。
- 从蒙版跟踪请求启动 SAM3 或本地人物分割时，真实处理进度会回写到目标蒙版。
- 「修正当前帧」会在当前局部帧写入位置、尺寸、旋转 correction keyframes。
- SAM3 物体跟踪和本地人物跟踪在处理期间现在会注册 active runtime handle，所以点「暂停」会取消真实运行中的任务，不只是把 UI 状态改成暂停。
- 被取消的 generated tracking request 现在会把目标蒙版写回 `paused`，保留进度和锚点帧，记录暂停原因，并清掉 pending segmentation request。
- 「继续」会先尝试 active runtime 的 resume hook；如果 runtime 已经因为取消退出，则回退为从面板重新启动同方向跟踪。
- 每次蒙版跟踪请求现在都有 `requestId`。SAM3/MediaPipe 结果回写 timeline 前必须匹配当前 request，所以暂停或重新分析后，旧任务晚返回也不会把过期蒙版插回当前 clip。
- 从右侧蒙版面板点跟踪后，AI 分割工作区会按同一个 `requestId` 自动启动对应任务，不再要求用户进入工作区后再点一次「生成并应用」。
- 主 AI 分割工作区的 SAM3 持久任务现在也会注册蒙版 runtime；右侧「暂停跟踪」会取消真实的 `AbortController` 任务，并把蒙版状态写回 `paused`。
- 本地人物自动启动会按 `requestId` 去重；同一请求即使组件重渲染也只启动一次，继续/重新分析产生的新请求可以再次自动启动。
- 新增真实 MediaPipe Electron E2E，从人物蒙版的「双向跟踪」按钮开始，覆盖自动启动、真实暂停、继续后完成、跟踪关键帧、当前帧修正和重新分析。

然后整理了时间线日常操作工具条：

- 新增直接裁剪按钮，会打开当前选中媒体片段的 crop controls。
- 和选区相关的动作现在会在没有兼容选区时正确禁用：切割、保留左侧、保留右侧、分离音频、复制、裁剪、删除。
- 吸附和联动 ripple editing 现在有 pressed 状态、测试 ID 和更清楚的 tooltip。
- 删除按钮会根据联动 ripple 状态更新 accessible label 和 tooltip。
- 裁剪按钮上显示的快捷键现在是真的：QCut 和 CapCut keybinding profile 会把单键 `C` 映射到 `crop-selected`，旧的非自定义 QCut/CapCut profile 也会通过迁移补上这个绑定。
- 新增真实 Electron E2E 覆盖时间线日常动作：导入真实视频，从工具条复制 clip，用 `C` 快捷键打开裁剪，把裁剪值写进 timeline element，从工具条删除复制出来的 clip，再用 Delete 快捷键删除剩余 clip。
- 同一个 Electron E2E 继续扩展了相邻真实 clips：覆盖切割、保留右侧 trim、联动 ripple 删除。测试会检查 timeline state，不只是检查按钮存在。
- 联动 ripple 删除现在有 store 级别的多选批量操作。多选 clips 会先转成合并后的时间范围，只压入一次 undo 快照，然后删除范围内内容，并让联动轨道上的后方 clips 只整体前移一次，不再由 toolbar 逐个删除选区。
- Electron E2E 再补了两条 media track 的多选联动场景：两轨各选中一段 clip，通过真实工具条 ripple 删除按钮触发，并验证两条联动轨道上的后方 clip 都前移到时间线起点。

## 实现说明

底层 proxy 能力之前已经存在：

- `electron/ffmpeg/video-preview-proxy.ts`
- `electron/video-preview-proxy-handler.ts`
- `apps/web/src/hooks/preview/use-video-enhancement-proxy.ts`
- `apps/web/src/components/editor/preview-panel-components.tsx`
- `electron/preload.ts`
- `packages/platform-core/src/types/media-api.ts`
- `packages/platform-desktop/src/index.ts`

这次主要把它接到用户可见的画质菜单：

- `apps/web/src/lib/preview/preview-quality.ts`
- `apps/web/src/lib/preview/preview-video-source.ts`
- `apps/web/src/stores/editor/playback-store.ts`
- `apps/web/src/components/editor/preview-panel-components.tsx`
- `apps/web/src/components/editor/preview-panel/preview-element-renderer.tsx`
- `apps/web/src/hooks/timeline/use-frame-cache.ts`
- `apps/web/src/hooks/preview/use-cached-preview-frame.ts`
- `apps/web/src/lib/preview/preview-frame-cache-readiness.ts`
- `apps/web/src/hooks/preview/use-playback-health-preview-quality.ts`
- `apps/web/src/lib/preview/preview-health-events.ts`
- `apps/web/src/components/editor/preview-panel.tsx`
- `apps/web/src/components/editor/timeline/index.tsx`
- `apps/web/src/components/ui/video-player.tsx`

蒙版画布控制点相关：

- `apps/web/src/components/editor/preview-panel/media-mask-overlay-utils.ts`
- `apps/web/src/components/editor/preview-panel/media-mask-overlay.tsx`
- `apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay-utils.test.ts`
- `apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay.test.tsx`
- `apps/web/src/lib/video/media-mask-svg.ts`
- `apps/web/src/lib/video/__tests__/media-mask-svg.test.ts`
- `packages/editor-core/src/types/timeline.ts`
- `apps/web/src/test/e2e/media-mask-overlay-handles.e2e.ts`

蒙版跟踪相关：

- `packages/editor-core/src/types/timeline.ts`
- `apps/web/src/lib/video/media-mask-tracking.ts`
- `apps/web/src/lib/segmentation/mask-tracking-runtime.ts`
- `apps/web/src/lib/segmentation/generated-mask-attachment.ts`
- `apps/web/src/components/editor/properties-panel/media-mask-tracking-controls.tsx`
- `apps/web/src/components/editor/properties-panel/media-mask-properties.tsx`
- `apps/web/src/components/editor/properties-panel/media-tracking-properties.tsx`
- `apps/web/src/components/editor/segmentation/LocalPersonCutoutPanel.tsx`
- `apps/web/src/stores/ai/segmentation-store.ts`
- `apps/web/src/components/editor/segmentation/index.tsx`
- `apps/web/src/hooks/use-persistent-ai-task.ts`
- `apps/web/src/test/e2e/media-mask-tracking.e2e.ts`

时间线工具条相关：

- `apps/web/src/components/editor/timeline/timeline-toolbar.tsx`
- `apps/web/src/components/editor/timeline/__tests__/timeline-toolbar.test.tsx`
- `apps/web/src/stores/timeline/timeline-track-ops.ts`
- `apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts`
- `apps/web/src/stores/timeline/types.ts`
- `apps/web/src/test/e2e/timeline-daily-actions.e2e.ts`
- `apps/web/src/constants/keybinding-profiles.ts`
- `apps/web/src/stores/editor/keybindings-store.ts`
- `apps/web/src/constants/__tests__/keybinding-profiles.test.ts`

自动模式规则：

- 素材最长边 >= 2160px：自动使用「流畅画质」proxy。
- 素材最长边 >= 1440px：自动使用「清晰画质」proxy。
- 带稳定、降噪、清晰度、超分、补光、美颜等视频增强时：自动使用「清晰画质」proxy。
- 轻量素材且无增强：保持原素材预览。

手动画质规则：

- 清晰画质：最长边 1280px
- 流畅画质：最长边 854px
- 低清画质：最长边 480px

原画质保持原来的素材源逻辑。

播放源选择规则：

- 暂停：永远优先使用原素材源，避免暂停画面变糊。
- 播放：如果 proxy 已经生成，切换到 `app://video-preview-proxy/...`。
- 播放：如果 proxy 还没生成，继续使用原素材源，不阻塞用户操作。

预览专用效果渲染规则：

- 暂停：永远 `full`。
- 播放时原画质/清晰画质：`full`。
- 播放时流畅画质：`reduced`，保留轻量预览效果，但跳过 distortion 和 person-tracking 预览 canvas。
- 播放时低清画质：`minimal`，跳过高成本预览 canvas、粒子预览和装饰预览。
- 导出不受影响，因为这个开关只控制编辑器 preview 组件是否渲染。

## 验证结果

命令：

```bash
bunx vitest run apps/web/src/hooks/preview/__tests__/use-video-enhancement-proxy.test.tsx apps/web/src/lib/preview/__tests__/preview-quality.test.ts
bunx vitest run apps/web/src/test/integration/playback-state.test.ts
bunx vitest run apps/web/src/hooks/timeline/__tests__/use-frame-cache.test.tsx
bunx vitest run electron/__tests__/video-preview-proxy.test.ts
bunx vitest run apps/web/src/lib/video/__tests__/media-mask-svg.test.ts apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay.test.tsx apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay-utils.test.ts
bunx vitest run apps/web/src/lib/video/__tests__/media-mask-tracking.test.ts apps/web/src/components/editor/properties-panel/__tests__/media-tracking-properties.test.tsx
bunx vitest run apps/web/src/components/editor/properties-panel/__tests__/media-tracking-properties.test.tsx apps/web/src/lib/segmentation/__tests__/mask-tracking-runtime.test.ts apps/web/src/lib/segmentation/__tests__/generated-mask-attachment.test.ts apps/web/src/lib/video/__tests__/media-mask-tracking.test.ts
bunx vitest run apps/web/src/stores/ai/__tests__/segmentation-store.test.ts apps/web/src/lib/segmentation/__tests__/generated-mask-attachment.test.ts apps/web/src/components/editor/properties-panel/__tests__/media-tracking-properties.test.tsx apps/web/src/lib/segmentation/__tests__/mask-tracking-runtime.test.ts
bunx vitest run apps/web/src/components/editor/timeline/__tests__/timeline-toolbar.test.tsx
bunx vitest run apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts apps/web/src/components/editor/timeline/__tests__/timeline-toolbar.test.tsx
bunx vitest run apps/web/src/constants/__tests__/keybinding-profiles.test.ts apps/web/src/hooks/keyboard/__tests__/use-professional-editor-actions.test.tsx apps/web/src/components/editor/timeline/__tests__/timeline-toolbar.test.tsx
cd apps/web && bunx tsc --noEmit --pretty false
bun run build:web && bun run build:electron
bunx playwright test apps/web/src/test/e2e/timeline-daily-actions.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/preview-quality-proxy.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/native-video-enhancement-preview.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/media-mask-overlay-handles.e2e.ts --project=electron
QCUT_PERSON_VIDEO_PATH=/absolute/path/to/person-video.mp4 bunx playwright test apps/web/src/test/e2e/media-mask-tracking.e2e.ts --project=electron
```

结果：

- 预览画质相关 Vitest 通过。
- 运行时预览降级测试通过，覆盖自动模式慢帧降到「流畅」、严重慢帧降到「低清」、稳定后恢复，以及手动画质不被覆盖。
- 运行时预览健康测试现在也覆盖真实视频帧呈现卡顿：慢 `requestVideoFrameCallback` 间隔会进入同一套自动「流畅/低清」降级判断。
- 自动降档归因单测通过，覆盖预览渲染慢帧、视频帧停顿、混合卡顿和稳定恢复后清理诊断。
- 预览专用效果渲染模式单测通过，覆盖「流畅/reduced」「低清/minimal」「暂停/full」「清晰/full」。
- playback store 测试通过，确认暂停和手动切换画质会清掉运行时临时降级。
- frame cache 身份隔离 Vitest 通过，确认不同画质和不同预览尺寸不能互相复用缓存帧。
- 缓存帧读取/overlay 单测通过，覆盖命中后真实 `putImageData`、忽略其他时间点的视频帧、目标帧到达后撤下、cache miss 和播放开始清理。
- 缓存写入 readiness 单测通过，确认 image-only 画面可直接缓存，而多视频层必须全部呈现目标 timeline frame。
- 自动画质策略 Vitest 通过，覆盖高分辨率、增强素材、轻量素材和手动档位不被覆盖。
- Electron preview proxy 单测通过，覆盖 cache key、缓存统计和缓存清理。
- `preview-quality-proxy.e2e.ts` 通过，真实导入视频后确认暂停用原素材、播放用 proxy、再次暂停恢复原素材。
- 加入真实视频帧健康事件后，重新跑 `preview-quality-proxy.e2e.ts` 通过，确认额外 telemetry 不会破坏真实 proxy 播放链路。第一次尝试在 app 启动前遇到 Electron `firstWindow` timeout，随后同一条测试重跑通过。
- `preview-quality-proxy.e2e.ts` 也验证了预览专用效果质量切换：流畅画质播放时进入 `reduced`，暂停后恢复 `full`。
- `preview-quality-proxy.e2e.ts` 也验证了画质菜单里的 proxy cache 状态、「打开缓存目录」和「清理预览缓存」入口，清理后 UI 显示 `0 MB`。
- `preview-quality-proxy.e2e.ts` 现在还会让真实视频进入自动降档，确认网页画质菜单显示「视频解码帧出现停顿」和真实毫秒/停顿次数；暂停后按钮恢复为「自动」。第一次诊断断言绑定了固定 `95ms / 5`，但真实 `requestVideoFrameCallback` 更早上报了首帧停顿，因此改为验证真实指标结构和原因后重跑通过。
- `preview-quality-proxy.e2e.ts` 现在还会在真实视频上缓存一个已呈现时间点、seek 到别处再返回，确认 lookup 为 `hit`、缓存 canvas 短暂可见、canvas 内有非空彩色像素，并在目标视频帧到达后自动隐藏。
- `native-video-enhancement-preview.e2e.ts` 通过，确认真实 FFmpeg preview frame、文字、贴纸刷新和增强 proxy 播放链路没有回归。
- `media-mask-overlay-handles.e2e.ts` 通过，确认真实 Electron 画布里有移动、旋转、八向缩放控制点、矩形羽化 guide、线性蒙版上下羽化范围 handle 且能真实写入 feather、镜面轴线、反选 guide 和镜面左右边界控制点。
- `media-mask-overlay-handles.e2e.ts` 现在也验证了真实画布里的镜面方向切换：点击右侧镜像按钮会把 timeline 写成 `mirrorMode: "right"`，截图里能看到画布上的左/双/右控制和有效范围 guide。
- Mask SVG 单测通过，确认线性渐变跟随本地垂直几何，镜面渐变跟随中心、宽度和旋转，且左侧/右侧镜面模式会生成单边渐变，而不是旧的固定对称 mask。
- 蒙版跟踪单测通过，覆盖 progress/status metadata、当前帧 correction keyframes、跟踪 tab 暂停/修正操作。
- 蒙版跟踪 runtime 单测通过：4 个文件 15 个测试覆盖 active runtime cancel/resume 路由、旧 runtime unregister 不误删新任务、generated tracking 暂停状态落盘、tracking tab 调用真实 cancel hook。
- tracking request identity 单测通过：4 个文件 13 个测试覆盖 request metadata、active runtime 路由，以及 stale SAM3/MediaPipe 跟踪结果不会在暂停或新请求后继续改 timeline。
- 最新核心回归共 23 个 Vitest 文件、131 个测试通过，覆盖预览画质/视频源/缓存帧、播放健康、时间线工具条/ripple、蒙版变换/跟踪、持久 AI runtime 和本地人物自动启动。
- 真实 `person-cutout.e2e.ts` 通过，3.2 秒人物素材在 26.7 秒内产出 1.5 MB 透明 WebM，并确认人物蒙版、中心/尺寸关键帧和画布回放。
- 新增的 `media-mask-tracking.e2e.ts` 使用 1 秒真实人物视频在 49.0 秒内通过：跟踪按钮自动拉起 MediaPipe，暂停后状态稳定为 `paused`，继续后完成并写入 7 个跟踪帧，当前帧修正落盘，重新分析再次进入真实进度后可暂停。
- 第一次用 3.2 秒素材跑完整「完成后再完整重分析」时，第二次分析已到 93%，但触发了 180 秒测试总超时；首次完成、暂停/继续、40 个跟踪帧和修正均已成功。测试随后改为验证重新分析真实启动和产生进度，再主动暂停清理，避免重复等待同一模型结论。
- 时间线工具条单测通过，覆盖裁剪入口、吸附/联动开关、无选区禁用状态、冻结帧、紧凑轨道、切割和 markdown 插入。
- 多选批量 ripple 单测通过：timeline ripple store 和 toolbar 共 18 个测试确认 toolbar 会对多选调用一次联动删除操作，store 会合并选区时间范围、清空选区、只压入一次历史、删除重叠范围，并让联动轨道后方 clips 只前移一次。
- keybinding profile 测试通过，确认 QCut 和 CapCut profile 里的 `C` 就是工具条上写的裁剪快捷键。
- `timeline-daily-actions.e2e.ts` 通过，确认真实导入视频后可以从工具条复制、通过 `C` 快捷键和 crop controls 裁剪、从工具条删除复制 clip，并通过 Delete 快捷键删除剩余 clip。
- `timeline-daily-actions.e2e.ts` 也通过了相邻真实 clip 测试：playhead 切割会生成左右片段并保留后方 clip；保留右侧会写入非零 trim；联动 ripple 删除会把后方 clip 前移来闭合时间线空隙。
- `timeline-daily-actions.e2e.ts` 现在也通过了多轨多选联动 ripple：两条 media track 上的选中 clips 通过真实工具条删除，后方 clips 都从 `2s` 前移到 `0s`。
- 最后一轮 Electron 回归共 6/6 通过，串行覆盖蒙版画布控制、proxy/缓存帧、以及四条时间线日常动作场景，总耗时约 1.2 分钟。
- 完整 `cd apps/web && bunx tsc --noEmit --pretty false` 通过。
- `bun run build:web && bun run build:electron` 通过。

截图证据：

- `output/playwright/preview-quality-proxy/01-paused-source-preview.png`
- `output/playwright/preview-quality-proxy/00-auto-quality-default.png`
- `output/playwright/preview-quality-proxy/00-cached-frame-scrub-hit.png`
- `output/playwright/preview-quality-proxy/01-auto-downgrade-diagnostic.png`
- `output/playwright/preview-quality-proxy/02-playing-proxy-preview.png`
- `output/playwright/preview-quality-proxy/03-paused-restored-source-preview.png`
- `output/playwright/preview-quality-proxy/04-proxy-cache-actions.png`
- `output/playwright/preview-quality-proxy/05-proxy-cache-cleared.png`
- `output/playwright/native-video-enhancement-preview/01-native-composition-ready.png`
- `output/playwright/native-video-enhancement-preview/02-native-composition-refreshed.png`
- `output/playwright/native-video-enhancement-preview/03-native-composition-text.png`
- `output/playwright/native-video-enhancement-preview/04-native-composition-sticker.png`
- `output/playwright/native-video-enhancement-preview/05-enhanced-proxy-playback.png`
- `output/playwright/media-mask-overlay/01-rectangle-mask-eight-handles-feather.png`
- `output/playwright/media-mask-overlay/02-linear-mask-feather-handles.png`
- `output/playwright/media-mask-overlay/03-mirror-mask-invert-guide.png`
- `output/playwright/media-mask-tracking/01-person-mask-ready.png`
- `output/playwright/media-mask-tracking/02-tracking-running.png`
- `output/playwright/media-mask-tracking/03-tracking-paused.png`
- `output/playwright/media-mask-tracking/04-tracking-completed.png`
- `output/playwright/media-mask-tracking/05-current-frame-corrected.png`
- `output/playwright/media-mask-tracking/06-reanalysis-running.png`
- `output/playwright/timeline-daily-actions/01-selected-real-video-clip.png`
- `output/playwright/timeline-daily-actions/02-copied-real-video-clip.png`
- `output/playwright/timeline-daily-actions/03-crop-controls-open-and-applied.png`
- `output/playwright/timeline-daily-actions/04-delete-actions-cleared-timeline.png`
- `output/playwright/timeline-daily-actions/05-split-adjacent-real-clips.png`
- `output/playwright/timeline-daily-actions/06-keep-right-trim-applied.png`
- `output/playwright/timeline-daily-actions/07-ripple-delete-closed-gap.png`
- `output/playwright/timeline-daily-actions/08-multi-track-ripple-before.png`
- `output/playwright/timeline-daily-actions/09-multi-track-ripple-after.png`

Playwright E2E 用真实 `sample-video.mp4` 走 Electron 路径，选择「流畅画质」后等待 FFmpeg proxy ready，并检查 `<video data-video-preview-source>` 的 source 状态。

## 核心目标状态与后续增强

本任务定义的核心范围已经完成：预览画质/proxy、暂停恢复原画、缓存帧、播放时效果降级、蒙版形状与画布控制、人物/物体跟踪操作，以及时间线切割/裁剪/复制/删除/吸附/ripple 都已有实现和自动化证据。下面是可继续增强的工程项，不是本轮核心功能缺失。

预览性能：

- 已完成自动画质、手动画质档位和播放/暂停 source 切换。
- 已完成第一版运行时播放健康降级：自动模式下慢帧会临时切到「流畅/低清」，暂停后恢复用户选择的画质。
- 已完成第一版播放时高成本预览效果降级：流畅/低清播放时降低 preview-only 效果成本，暂停时恢复 full 效果预览。
- 已完成 preview proxy 缓存统计/清理底层 API 和画质菜单 UI，包括缓存大小、文件数量、缓存上限、打开缓存目录、清理预览缓存。
- frame cache 现在已经会捕获、持久化、按画质/尺寸隔离，并在 seek 命中时真实显示缓存帧；目标视频帧到达或开始播放时会撤下。
- 播放健康现在包含 app 层播放 cadence 和真实视频呈现/解码卡顿 cadence，画质菜单也会显示粗粒度归因和触发快照。还缺基于实际 renderer/GPU timing 的耗时拆分，以及单个 effect cost 归因。
- 可继续补全局 proxy cache 设置入口和更详细的失败诊断。画布上的 proxy 失败重试按钮和缓存目录打开入口已经有了。
- 可继续做更激进的相邻帧预测预热和专门的长时间 scrub 性能基准；当前缓存的是已经停留并正确呈现过的时间点。

蒙版对齐：

- 现在已经有矩形、圆形、线性、镜面、钢笔、文字、星形、爱心、人物、物体。
- 也已有位置、大小、旋转、羽化、圆角、扩展、透明度、反选、跟踪入口。
- 已补齐基础画布控制点：中心移动、旋转、八向边/角缩放。
- 已补基础羽化可视化：普通形状、线性、钢笔都有画布 guide。
- 线性蒙版现在可以在画布上直接拖上下羽化范围 handle。
- 已补基础镜面/反选可视化：镜面轴线、左右边界控制点、方向提示、反选斜线 guide。
- 镜面方向切换已经补上：属性面板和画布都支持左侧/双向/右侧；画布上有有效范围 guide 和专门的范围控制点。
- 线性/镜面的真实预览和导出 mask 现在使用和画布控制一致的几何语义。
- 可继续增强镜面/反选细节：方向变化动效、键盘循环切换快捷键，以及更接近剪映的边界阴影预览。
- 已补第一版跟踪流程控件：进度状态、暂停/继续、重新分析、当前帧 correction keyframes。
- 主 AI 工作区和属性面板内的 active cancellation 都已经接到 SAM3 物体跟踪和本地人物跟踪。
- 暂停或重新分析后的 stale-result protection 已经接到 SAM3/MediaPipe 跟踪结果回写。
- 当前「继续」会重新执行同方向分析；可继续做进程退出/应用重启后的真正中帧 checkpoint 续跑、失败任务的详细诊断，以及时间线上的逐帧跟踪审阅 UI。
- 3.2 秒真实跟踪回归曾出现 Chromium 的 `AudioSample was garbage collected without first being closed` 警告；结果不受影响，但 WebCodecs 音频样本释放值得单独做资源审计。

时间线对齐：

- 现在已有选择、切割、吸附、ripple 相关逻辑和编辑模式。
- 工具条现在已经更清楚地暴露常用操作：切割、保留左/右、分离音频、复制、裁剪、冻结帧、删除、吸附、联动 ripple editing。
- 裁剪按钮提示和真实快捷键现在一致：在非文本输入区域按 `C` 会触发同一条打开 crop controls 的事件链路。
- 真实 Electron 覆盖现在已经证明导入视频 clip 上的复制、裁剪、删除链路可用。
- 真实 Electron 覆盖现在也已经证明相邻导入视频 clip 上的切割、保留右侧 trim、联动 ripple 删除链路可用。
- 多选联动 ripple 删除现在已经走一条 store 级操作，并有单测和真实 Electron 截图/E2E 覆盖多轨前移。
- 可继续做小屏下更紧凑的文字布局，以及更多混合轨道里的拖拽/trim ripple 覆盖。
