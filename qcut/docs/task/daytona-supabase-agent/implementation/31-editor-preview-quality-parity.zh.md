# 编辑器预览画质对齐

日期：2026-07-25

## 这次做了什么

先实现了最贴近剪映截图的一块：预览性能/预览画质切换。

- 新增四档预览画质：
  - 原画质
  - 清晰画质
  - 流畅画质
  - 低清画质
- 在编辑器预览工具条里新增「预览画质」下拉菜单。
- 把选择状态放进 playback store。
- 非原画质模式会复用已有 Electron FFmpeg preview proxy 管线。
- 预览 proxy 会提前生成，但只在播放时切换到 proxy；暂停时恢复素材源，保证静帧清晰。
- 不改导出数据：这个设置只影响编辑器预览播放，不影响最终导出。
- 补了单元测试和 Electron E2E，覆盖画质配置、无视觉增强时强制生成 proxy、真实视频播放 source/proxy 切换。

随后补了一块蒙版画布体验：

- 把原来的单个右下角缩放点升级为八向控制点：
  - 左上、上、右上、右、右下、下、左下、左
- 拖拽边缘控制点时只改对应轴，并让相反边视觉上保持锚定。
- 拖拽角点时支持锁定比例。
- 旋转后的蒙版 resize 会按蒙版本地坐标换算回画布坐标。
- 羽化不再只靠 glow 暗示：普通形状显示羽化范围虚线，线性蒙版显示上下羽化线，钢笔蒙版沿路径显示羽化 guide。
- 新增真实 Electron E2E，确认导入视频、打开「画面 / 蒙版」、选择矩形蒙版后，画布上能看到八向控制点和羽化 guide。

## 实现说明

底层 proxy 能力之前已经存在：

- `electron/ffmpeg/video-preview-proxy.ts`
- `electron/video-preview-proxy-handler.ts`
- `apps/web/src/hooks/preview/use-video-enhancement-proxy.ts`

这次主要把它接到用户可见的画质菜单：

- `apps/web/src/lib/preview/preview-quality.ts`
- `apps/web/src/lib/preview/preview-video-source.ts`
- `apps/web/src/stores/editor/playback-store.ts`
- `apps/web/src/components/editor/preview-panel-components.tsx`
- `apps/web/src/components/editor/preview-panel/preview-element-renderer.tsx`

蒙版画布控制点相关：

- `apps/web/src/components/editor/preview-panel/media-mask-overlay-utils.ts`
- `apps/web/src/components/editor/preview-panel/media-mask-overlay.tsx`
- `apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay-utils.test.ts`
- `apps/web/src/components/editor/preview-panel/__tests__/media-mask-overlay.test.tsx`
- `apps/web/src/test/e2e/media-mask-overlay-handles.e2e.ts`

非原画质时会强制走 proxy：

- 清晰画质：最长边 1280px
- 流畅画质：最长边 854px
- 低清画质：最长边 480px

原画质保持原来的素材源逻辑。

播放源选择规则：

- 暂停：永远优先使用原素材源，避免暂停画面变糊。
- 播放：如果 proxy 已经生成，切换到 `app://video-preview-proxy/...`。
- 播放：如果 proxy 还没生成，继续使用原素材源，不阻塞用户操作。

## 验证结果

命令：

```bash
bunx vitest run apps/web/src/hooks/preview/__tests__/use-video-enhancement-proxy.test.tsx apps/web/src/lib/preview/__tests__/preview-quality.test.ts
bun run build:web && bun run build:electron
bunx playwright test apps/web/src/test/e2e/preview-quality-proxy.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/native-video-enhancement-preview.e2e.ts --project=electron
bunx playwright test apps/web/src/test/e2e/media-mask-overlay-handles.e2e.ts --project=electron
```

结果：

- 预览画质相关 Vitest 通过。
- `preview-quality-proxy.e2e.ts` 通过，真实导入视频后确认暂停用原素材、播放用 proxy、再次暂停恢复原素材。
- `native-video-enhancement-preview.e2e.ts` 通过，确认真实 FFmpeg preview frame、文字、贴纸刷新和增强 proxy 播放链路没有回归。
- `media-mask-overlay-handles.e2e.ts` 通过，确认真实 Electron 画布里有移动、旋转、八向缩放控制点和羽化 guide。
- `bun run build:web && bun run build:electron` 通过。
- 当前全量 `cd apps/web && bunx tsc --noEmit --pretty false` 仍被既有测试类型问题挡住：`src/lib/audio/__tests__/timeline-beats.test.ts` 里的 `speedKeyframes.easing` 被推断成 `string`，不是这次蒙版/预览改动引入。

截图证据：

- `output/playwright/preview-quality-proxy/01-paused-source-preview.png`
- `output/playwright/preview-quality-proxy/02-playing-proxy-preview.png`
- `output/playwright/preview-quality-proxy/03-paused-restored-source-preview.png`
- `output/playwright/native-video-enhancement-preview/01-native-composition-ready.png`
- `output/playwright/native-video-enhancement-preview/02-native-composition-refreshed.png`
- `output/playwright/native-video-enhancement-preview/03-native-composition-text.png`
- `output/playwright/native-video-enhancement-preview/04-native-composition-sticker.png`
- `output/playwright/native-video-enhancement-preview/05-enhanced-proxy-playback.png`
- `output/playwright/media-mask-overlay/01-rectangle-mask-eight-handles-feather.png`

Playwright E2E 用真实 `sample-video.mp4` 走 Electron 路径，选择「流畅画质」后等待 FFmpeg proxy ready，并检查 `<video data-video-preview-source>` 的 source 状态。

## 还缺什么

预览性能：

- 已完成手动画质档位和播放/暂停 source 切换。
- 还缺自动策略：比如时间线很重、分辨率很高、机器吃紧时自动临时降级。
- 还缺 proxy cache 管理 UI：查看缓存大小、清理缓存、失败重试提示。
- frame cache 还需要进一步感知当前画质档位，避免原画和低清缓存互相污染。

蒙版对齐：

- 现在已经有矩形、圆形、线性、镜面、钢笔、文字、星形、爱心、人物、物体。
- 也已有位置、大小、旋转、羽化、圆角、扩展、透明度、反选、跟踪入口。
- 已补齐基础画布控制点：中心移动、旋转、八向边/角缩放。
- 已补基础羽化可视化：普通形状、线性、钢笔都有画布 guide。
- 还缺镜面/反选 UX 打磨：方向、范围、边界预览更像剪映。
- 还缺跟踪进度 UX、重新分析和修正关键帧流程。

时间线对齐：

- 现在已有选择、切割、吸附、ripple 相关逻辑和编辑模式。
- 还需要把工具条整理成更像剪映的常用操作区，把联动编辑做成明显开关，并补更多日常快捷操作的 E2E 覆盖。
