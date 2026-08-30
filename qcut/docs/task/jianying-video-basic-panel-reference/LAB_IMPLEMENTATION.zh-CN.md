# QCut 实验室本地视频实现与 E2E

> 实现日期：2026-08-30
>
> 范围：防闪烁、光流运动模糊、智能运镜、智能裁剪、镜头追踪、眼神修正、本地超分，以及已有的防抖、降噪和补帧

## 用户现在能看到什么

选中视频片段后，进入 `画面 > 基础`。属性栏默认展开 `实验室本地视频`，其中新增了七个明确带“实验室”前缀的入口：

- `实验室防闪烁`
- `实验室光流运动模糊`
- `实验室智能运镜`
- `实验室智能裁剪`
- `实验室镜头追踪`
- `实验室眼神修正`
- `实验室本地超分`

界面实测截图：

![QCut 实验室本地视频面板](./evidence/qcut-media-lab-ui.png)

面板特写：`evidence/qcut-media-lab-panel.png`

## 十项能力的实际状态

| 目标能力 | QCut 入口 | 本地执行 | 当前实现边界 |
| --- | --- | --- | --- |
| 防闪烁 | 实验室防闪烁 | 是 | FFmpeg `deflicker`，强度映射到 3 至 31 帧的奇数时域窗口 |
| 视频防抖 | 视频防抖 > 本地防抖 | 是 | 已有 FFmpeg `deshake`；不是剪映 VAS 2.0.0 |
| ByteNN 降噪 | 画质增强 > 视频降噪 | 是 | 已有 FFmpeg `hqdn3d`；ByteNN 私有模型仍只是探针，不冒充已接入 |
| UMVFI 补帧 | 变速 > 智能补帧 | 是 | 已有 FFmpeg `minterpolate` 运动补偿；不是 UMVFI 3.2.0 |
| 光流运动模糊 | 实验室光流运动模糊 | 是 | `minterpolate` 四倍帧率、`tmix` 时域积分、恢复项目帧率 |
| 智能运镜 | 实验室智能运镜 | 是 | 读取本地 MediaPipe/光流人物轨迹，生成平移和缓慢推近关键帧 |
| 智能裁剪 | 实验室智能裁剪 | 是 | 按主体框生成安全缩放和平移关键帧，输出仍可手动编辑 |
| 镜头追踪 | 实验室镜头追踪 | 是 | 把本地目标中心轨迹转换为 X/Y 画面关键帧 |
| 眼神修正 | 实验室眼神修正 | 本机是 | 调用已有本地人像运行时的亮眼和眼袋修正；不是视线朝向摄像机的重定向 |
| AI 超分 | 实验室本地超分 | 是 | Lanczos 2x/4x、轻锐化、回到目标尺寸；是本地细节重建，不称为 AI 模型 |

## 数据和渲染路径

四个连续参数保存在片段的 `MediaEnhancements`：

```text
labDeflicker
labOpticalFlowMotionBlur
labEyeCorrection
labLocalSuperResolution
```

防闪烁、运动模糊和本地超分进入同一条 FFmpeg 预览代理、单帧预览和最终导出滤镜链。防闪烁的前置上下文按窗口和项目帧率动态计算，最大窗口不会再只拿固定 0.5 秒历史帧。

智能运镜、智能裁剪和镜头追踪不生成隐藏的派生视频。它们读取状态为 `ready`、来源为 `mediapipe` 或 `optical-flow` 的本地 Mask 轨迹，生成普通的 `x`、`y`、`scaleX`、`scaleY` 关键帧。生成结果可以撤销、继续编辑并由现有导出器消费。

实验室眼神修正会合并进现有本地人像状态，并强制选择固定时间戳的本地 Renderer 导出路径，避免只在预览生效。它只做眼部细节处理，不检测或改写视线方向。

## 本机可用性边界

- FFmpeg 三项和三种关键帧工具不需要网络。
- 智能工具需要先在抠像/跟踪流程产生一个完成的本地人物轨迹；没有轨迹时按钮保持禁用并提示先创建轨迹。
- 眼部处理依赖本机 QCut 私有人像运行时。当前机器已有私有运行时和模型快照；这些剪映私有文件不进入 Git、安装包或公共下载。
- `inspect({ refresh: true })` 的一次独立诊断超过 90 秒未返回，已终止。属性面板没有调用这个阻塞接口；后续若显示运行时状态，应使用缓存结果并设置超时。
- ByteNN、UMVFI、VAS 和剪映眼神模型目前只有探针等级证据，没有完整公开帧处理 ABI，因此 UI 使用可验证的 QCut 本地实现，不使用这些私有品牌名。

## 已完成验证

### 单元与集成测试

```bash
bun x vitest run \
  electron/__tests__/video-lab-filter.test.ts \
  electron/__tests__/video-enhancement-filter.test.ts \
  electron/__tests__/video-frame-preview.test.ts \
  electron/__tests__/video-preview-proxy.test.ts \
  apps/web/src/lib/portrait/__tests__/media-lab-eye-correction.test.ts \
  apps/web/src/lib/video/__tests__/media-lab-smart-tools.test.ts \
  apps/web/src/lib/video/__tests__/video-properties.test.ts \
  apps/web/src/lib/export/__tests__/jianying-local-color-export.test.ts \
  apps/web/src/components/editor/properties-panel/__tests__/media-lab-properties.test.tsx \
  apps/web/src/hooks/preview/__tests__/use-native-video-enhancement-preview.test.tsx \
  apps/web/src/hooks/preview/__tests__/use-video-enhancement-proxy.test.tsx \
  electron/__tests__/ffmpeg-video-transform.test.ts \
  packages/jianying-draft-export/src/__tests__/runtime-unknown-keys.test.ts
```

结果：13 个测试文件、95 项测试全部通过。

### 构建

- `bun run build:electron`：通过。
- `cd apps/web && bun x tsc --noEmit`：通过。
- `cd apps/web && bun run build:electron`：通过；只有仓库已有的路由命名、动态导入和大 Chunk 警告。

### 真实 FFmpeg

使用 QCut 打包的 `ffmpeg-static`，对三秒闪烁测试视频执行完整实验室链：

```text
deflicker -> minterpolate -> tmix -> fps -> 2x Lanczos -> unsharp -> target size
```

结果：

| 项 | 值 |
| --- | --- |
| 编码 | H.264 |
| 尺寸 | 640 x 360 |
| 帧率 | 30 fps |
| 帧数 | 90 |
| 时长 | 3.000 秒 |
| 输出大小 | 1,314,690 bytes |
| 本机处理时间 | 5.66 秒 |

证据文件：

- `evidence/qcut-lab-source.mp4`
- `evidence/qcut-lab-render.mp4`
- `evidence/qcut-media-lab-panel.png`
- 源 SHA-256：`baf7ff3b48c36aa4cf1501b37aa12e1aa4ba4b64a7a506ee17d53cd9c025a8b4`
- 输出 SHA-256：`150cb93205fcc5590115a0263bf69d0179d79b0817a82a2a708ee44a2d9f855a`

### Electron E2E

```bash
bun x playwright test \
  apps/web/src/test/e2e/media-lab-properties.e2e.ts \
  --project=electron
```

结果：1 项通过，19.3 秒。测试真实创建项目、导入视频、拖到时间线、把播放头移动到片段内部、注入已完成的本地人物轨迹，用 Playwright 鼠标拖动防闪烁滑杆，设置运动模糊、眼神修正和 2x 本地超分，再逐个点击三种智能工具。最后直接检查片段状态中的增强参数和 X/Y 关键帧数量，并确认中央预览不是空画面。

## 仍需后续升级

1. 为防闪烁、运动模糊和超分建立后台派生媒体缓存，长片不应每次拖动都重算。
2. 用真实人物素材为实验室眼部处理增加前后像素对比和固定阈值，而不只复用人像运行时的已有 E2E。
3. 如果以后获得合法、稳定、可分发的本地 AI Provider，再把 ByteNN、UMVFI、视线重定向和 AI 超分作为独立 Provider 接入；当前不能根据模型存在就宣称产品能力完成。
