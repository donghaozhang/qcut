# QCut 平面跟踪详细实现设计

> 状态：Proposed
>
> 更新时间：2026-08-31
>
> 关联概览：[剪映运动跟踪与平面跟踪：实现研究与 QCut 落地方案](./README.zh-CN.md)
>
> 目标：在不依赖或分发剪映私有二进制、模型和工程数据的前提下，为 QCut 实现可编辑、可保存、可导出、可测试的平面跟踪。

## 1. 要实现的用户结果

用户在一段视频上框选四个角，QCut 分析该平面在每个源视频帧中的位置。贴纸、图片或文字绑定到这个平面后，应随它一起平移、缩放、旋转、剪切和产生透视变化。

完整流程是：

```text
选择贴纸
  -> 跟踪模式选择“平面跟踪”
  -> 选择被跟踪的视频
  -> 在当前画面编辑四个角
  -> 选择向前、向后或双向
  -> 开始跟踪
  -> 查看进度和失败区间
  -> 必要时在某一帧修正四角并重算局部区间
  -> 保存工程
  -> 重开后结果仍然存在
  -> 预览和导出 MP4 得到一致的贴合效果
```

第一版完成的定义不是“界面上有一个平面跟踪按钮”，而是以上链路中从视频解码到最终导出的每一层都有真实数据。

## 2. 非目标

第一版不处理以下问题：

- 不做三维相机求解或真实 3D 空间重建。
- 不跟踪衣服、旗帜、皮肤等非刚性曲面形变。
- 不承诺长时间完全遮挡后的自动重识别。
- 不承诺与剪映逐帧坐标或逐像素完全一致。
- 不读取、调用、打包或发布剪映私有跟踪引擎。
- 不把逐帧大结果直接塞进 timeline JSON。
- 不在 TypeScript 中从零手写 LK 光流或 RANSAC 求解器。

## 3. 当前 QCut 基础与缺口

### 3.1 已有能力

当前仓库已经有以下可复用能力：

| 能力 | 现有位置 | 用途 |
| --- | --- | --- |
| 四角透视类型 | `packages/editor-core/src/types/timeline.ts` 的 `MediaPerspective` | 表达贴纸或视频的四角 |
| Homography 求解和点投影 | `apps/web/src/lib/video/video-perspective.ts` | 从矩形到四边形并投影点 |
| Canvas 透视绘制 | `apps/web/src/lib/stickers/sticker-canvas-perspective.ts` | 将贴纸绘制到四边形 |
| FFmpeg perspective 导出 | `electron/ffmpeg/sticker-filter-graph.ts` | 导出动态四角 |
| 贴纸运动跟随 | `apps/web/src/lib/stickers/sticker-tracking.ts` | 现有绑定和求值入口 |
| 跟踪导出烘焙 | `apps/web/src/lib/stickers/sticker-tracking-export.ts` | 将运行结果变为导出关键帧 |
| 源视频时间映射 | `apps/web/src/lib/video/video-timing.ts` | 处理裁剪、变速、倒放、定格 |
| 按 PTS 解码视频帧 | `mediabunny` 的 `VideoSampleSink` | 顺序读取真实视频帧与时间戳 |
| 可取消跟踪运行时 | `apps/web/src/lib/segmentation/mask-tracking-runtime.ts` | 复用任务注册和取消思路 |
| Worker 资产加载模式 | `apps/web/src/lib/segmentation/person-cutout-client.ts` | 隔离 WASM 计算 |

### 3.2 当前缺口

需要新增的是真正的平面跟踪中间层：

```text
源视频帧
  -> 特征点
  -> 逐帧光流
  -> RANSAC Homography
  -> 质量判定
  -> 逐帧四角 sidecar
  -> 平面与贴纸绑定
  -> 统一预览/导出求值
```

当前贴纸属性面板中的平面跟踪仍是不可用提示；`StickerElement.tracking` 也只接受 `StickerMotionTracking`。

## 4. 核心技术决策

### 4.1 求解器使用 OpenCV，不手写视觉内核

首个可发布 provider 建议使用本地 OpenCV.js/WASM，并放在 Web Worker 中运行。所需核心接口均来自成熟实现：

- `goodFeaturesToTrack`：检测 Shi-Tomasi 角点。
- `calcOpticalFlowPyrLK`：金字塔 Lucas-Kanade 稀疏光流。
- `findHomography`：使用 RANSAC 从匹配点估计单应矩阵。
- `perspectiveTransform`：将初始四角投影到当前帧。

OpenCV 官方文档明确提供了 [OpenCV.js 的 Lucas-Kanade 光流接口](https://docs.opencv.org/4.7.0/db/d7f/tutorial_js_lucas_kanade.html)，并将 Homography 定义为两个平面之间的透视变换，具有八个自由度。[Homography 基础](https://docs.opencv.org/4.x/d9/dab/tutorial_homography.html) 和 [`findHomography`](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html) 可作为实现与测试依据。

选择 Worker 的原因：

- 光流和 RANSAC 不阻塞 React、画布交互和播放线程。
- WASM 内存和 `cv.Mat` 生命周期集中在一个边界内。
- provider 可以独立取消、销毁和重启。
- 后续可替换为 Electron 原生 OpenCV provider，而不修改 UI 和工程模型。

### 4.2 视频解码复用 Mediabunny

QCut 已经使用 Mediabunny 解码 alpha 视频。平面跟踪应抽出通用帧源，而不是重新使用 `HTMLVideoElement.currentTime` 做逐帧 seek。

Mediabunny 的 [`VideoSampleSink`](https://mediabunny.dev/api/VideoSampleSink) 可以按展示顺序迭代范围内的帧，并返回真实 `timestamp`；这正好满足 VFR 视频和非零起始 PTS。它的 `samples(startTimestamp, endTimestamp)` 也允许只解码可见区间。

关键规则：

- sidecar 时间一律保存源视频 PTS 微秒。
- 不用 `frameIndex / fps` 替代源时间。
- 每个 `VideoSample` 在使用后立即 `close()`。
- 解码只负责给出方向正确的帧序列，不做算法状态管理。

### 4.3 分析结果归源视频所有，贴纸只保存绑定

同一个平面结果可以被多个贴纸、文字或图片复用。因此：

- 被跟踪视频拥有 `PlanarTrackingReference`。
- 大体积逐帧结果存放在 project sidecar。
- 贴纸只引用 `sourceElementId` 和 `surfaceTrackingId`。
- 删除一个贴纸不会删除仍被其他目标引用的结果。

这与“分析一次，多处消费”的职责边界一致，也接近剪映中源视频持有 `surface_trackings`、目标素材引用 `surface_id` 的结构。

### 4.4 坐标保存为源显示空间归一化坐标

跟踪结果坐标定义为：

```text
source-display-normalized
```

含义是：

- 已应用视频文件自身的旋转 metadata。
- 已校正非方形像素比例。
- 尚未应用 QCut 元素的裁剪、fit、x/y、scale、rotation、flip 或 perspective。
- 左上角为 `(0, 0)`，右下角为 `(1, 1)`。

这样改变 QCut 中的视频布局不会迫使算法重新分析原视频，只需重新做坐标投影。

### 4.5 预览和导出必须使用同一个几何求值器

禁止分别实现“预览四角算法”和“导出四角算法”。两端只能调用同一个纯函数：

```ts
resolvePlanarAttachmentGeometry({
  attachment,
  result,
  sourceElement,
  targetElement,
  timelineTime,
  canvasSize,
})
```

这个函数返回当前输出帧中的目标四角。预览直接绘制；FFmpeg 导出把同一结果烘焙成 `x/y/width/height` 与八个 perspective 关键帧。

## 5. 总体架构

```text
StickerTrackingProperties
  |
  +-- PlanarTrackingOverlay（编辑四角）
  |
  +-- PlanarTrackingJobStore（进度、取消、错误）
          |
          v
PlanarTrackingService
  |
  +-- PlanarFrameSource
  |     `-- Mediabunny VideoSampleSink
  |
  +-- PlanarTrackingProvider
  |     `-- OpenCvPlanarTrackingProvider
  |             `-- planar-tracking-worker
  |
  +-- PlanarTrackingResultStore
        |-- Electron: project/analysis/tracking/*.json
        `-- Browser/iPad: IndexedDB

Timeline / Sticker binding
  |
  v
resolvePlanarAttachmentGeometry（纯函数）
  |-- Preview Canvas
  |-- Sticker overlay
  `-- Export keyframe baking -> FFmpeg perspective
```

## 6. 建议的数据模型

### 6.1 基础几何类型

新建 `packages/editor-core/src/tracking/planar-types.ts`：

```ts
export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface PlanarQuad {
  topLeft: NormalizedPoint;
  topRight: NormalizedPoint;
  bottomRight: NormalizedPoint;
  bottomLeft: NormalizedPoint;
}

export type PlanarTrackingDirection = "forward" | "backward" | "both";

export type PlanarSampleStatus =
  | "tracked"
  | "lost"
  | "corrected";
```

角点顺序必须固定为顺时针：左上、右上、右下、左下。任何模块不得根据当前坐标重新猜角点身份。

### 6.2 源视频上的结果引用

```ts
export type PlanarTrackingReferenceStatus =
  | "idle"
  | "processing"
  | "paused"
  | "ready"
  | "partial"
  | "stale"
  | "error";

export interface PlanarTrackingReference {
  schemaVersion: 1;
  id: string;
  sourceMediaId: string;
  resultUri?: string;
  resultSha256?: string;
  seedPtsUs: number;
  seedQuad: PlanarQuad;
  direction: PlanarTrackingDirection;
  provider: "opencv-wasm";
  providerVersion: string;
  analysisWidth: number;
  analysisHeight: number;
  status: PlanarTrackingReferenceStatus;
  sampleCount?: number;
  trackedRange?: { startPtsUs: number; endPtsUs: number };
  errorCode?: PlanarTrackingErrorCode;
}
```

在 `MediaElement` 上新增：

```ts
surfaceTrackings?: PlanarTrackingReference[];
```

持久化 `processing` 状态是允许的，但工程重开时必须规范化为 `paused`，不能假装后台任务仍然存在。

### 6.3 贴纸绑定

```ts
export interface StickerPlanarTracking {
  mode: "planar";
  sourceElementId: string;
  surfaceTrackingId: string;
  seedPtsUs: number;
  seedTargetQuad: PlanarQuad;
  lostBehavior: "hold" | "hide";
}

export type StickerTracking =
  | StickerMotionTracking
  | StickerPlanarTracking;
```

`seedTargetQuad` 表示绑定时贴纸四角在源显示空间的位置。它保留用户在种子帧上设置的贴纸大小、旋转和已有透视。

### 6.4 逐帧结果 sidecar

第一版使用易检查、易迁移的 JSON：

```ts
export interface PlanarTrackingSample {
  ptsUs: number;
  quad: PlanarQuad;
  status: PlanarSampleStatus;
  confidence: number;
  diagnostics?: {
    trackedPoints: number;
    inliers: number;
    inlierRatio: number;
    medianSymmetricErrorPx: number;
    coverage: number;
  };
}

export interface PlanarTrackingSidecarV1 {
  schemaVersion: 1;
  coordinateSpace: "source-display-normalized";
  timebase: "microseconds";
  source: {
    mediaId: string;
    contentSha256: string;
    displayWidth: number;
    displayHeight: number;
  };
  provider: {
    id: "opencv-wasm";
    version: string;
    parametersHash: string;
  };
  seed: {
    ptsUs: number;
    quad: PlanarQuad;
  };
  direction: PlanarTrackingDirection;
  samples: PlanarTrackingSample[];
}
```

约束：

- `ptsUs` 严格递增且不得重复。
- 所有数值必须有限。
- `confidence` 限制在 `[0, 1]`。
- tracked/corrected 四边形必须凸且面积大于下限。
- lost 样本可以沿用最后有效四角用于 UI，但消费者必须依据 `status` 决定 hold 或 hide。
- sidecar 不允许绝对文件路径。

若真实项目证明 JSON 体积过大，再升级为带版本头的二进制数组；第一版不提前引入双格式复杂度。

## 7. 时间模型

### 7.1 三种时间不能混用

```text
项目时间 timelineTime
  -> 元素局部时间 localTimelineTime
  -> 源视频时间 sourceTime
  -> sidecar PTS ptsUs
```

转换方式：

```ts
const localTimelineTime = timelineTime - sourceElement.startTime;
const sourceTime = getMediaSourcePlaybackTime({
  element: sourceElement,
  localTimelineTime,
  fps,
});
const ptsUs = Math.round(sourceTime * 1_000_000);
```

`getMediaSourcePlaybackTime` 已经处理 `trimStart`、变速曲线、倒放和定格。平面跟踪不得重新实现一份时间公式。

### 7.2 VFR 视频的求值

sidecar 保存每个真实帧的 PTS。播放到任意 `ptsUs` 时，默认选择最后一个 `sample.ptsUs <= ptsUs` 的样本，即 sample-and-hold。

这是第一版的正确默认，因为视频解码器在下一帧展示时间到来前同样保持上一帧。直接按两个样本线性插值四角，反而可能让贴纸在静止视频帧上提前移动。

### 7.3 变速、倒放和定格

- 变速不改变源 PTS 的轨迹，只改变 timeline 到 source 的映射。
- 倒放不需要重新求解，只会反向访问已有样本。
- 定格期间使用同一个源 PTS，因此四角保持不动。
- 改变项目 FPS 不需要重跑跟踪，但导出烘焙需要重新采样。

## 8. 坐标系统

### 8.1 五个坐标空间

实现中必须明确区分：

1. **coded pixel**：视频编码帧的原始像素。
2. **source display**：应用旋转 metadata 和 pixel aspect ratio 后的画面。
3. **analysis pixel**：等比例缩小后的 OpenCV 输入。
4. **media local**：QCut 视频元素内部，已考虑 crop 和 fit。
5. **project canvas**：最终预览与导出画布。

sidecar 只使用 source display normalized；OpenCV 只使用 analysis pixel；UI 和渲染只在边界处转换。

### 8.2 分析像素与归一化坐标

如果分析图像大小为 `Wa x Ha`：

```text
x_px = x_normalized * Wa
y_px = y_normalized * Ha

x_normalized = x_px / Wa
y_normalized = y_px / Ha
```

如果 OpenCV 返回分析像素中的矩阵 `H_px`，归一化矩阵为：

```text
S = diag(Wa, Ha, 1)
H_normalized = inverse(S) * H_px * S
```

不要把不同分辨率下得到的像素矩阵直接用于输出视频。

### 8.3 UI 四点反投影

用户拖动的是 project canvas 上的点，算法需要 source display 点。因此必须新增可逆坐标工具：

```ts
sourceDisplayPointToCanvas(...)
canvasPointToSourceDisplay(...)
```

逆变换顺序与正向变换严格相反：

```text
canvas point
  -> 撤销元素平移
  -> 撤销元素旋转
  -> 撤销 scale 与 flip
  -> 撤销元素 perspective
  -> 撤销 fit/crop
  -> source display normalized point
```

当前 `sticker-tracking.ts` 中的 `targetCanvasPoint` 只有正向逻辑。实现平面跟踪前应把媒体坐标转换抽到独立模块，并补齐矩阵求逆和往返测试。

## 9. 平面跟踪算法

### 9.1 输入

一次 provider 请求包含：

```ts
export interface PlanarTrackingRequest {
  requestId: string;
  source: File;
  sourceMediaId: string;
  visibleRange: { startPtsUs: number; endPtsUs: number };
  seedPtsUs: number;
  seedQuad: PlanarQuad;
  direction: PlanarTrackingDirection;
  analysisMaxWidth: number;
  parameters: PlanarTrackingParameters;
}
```

请求创建前必须验证：

- 视频可以解码。
- seed PTS 位于可见范围。
- 四角有限、顺序正确、凸且不自交。
- 四边形面积不能过小。
- 四边形至少有一部分在源画面内。

### 9.2 预处理

每帧执行：

1. 通过 `CanvasSink` 或 `VideoSample.draw` 生成等比例分析帧。
2. 转为单通道灰度图。
3. 只在当前预测四边形内建立 mask。
4. 对 mask 向内收缩少量像素，避免把平面边界外的背景特征加入跟踪。
5. 不默认使用强锐化、降噪或 CLAHE；这些会成为 provider 参数并进入缓存键。

默认分析宽度建议从 `960` 开始，保留原始宽高比。这个值是待基准测试的起点，不是剪映参数。

### 9.3 初始特征

种子帧使用 `goodFeaturesToTrack` 检测角点：

```text
seed gray + eroded quad mask
  -> Shi-Tomasi response
  -> 空间网格分桶
  -> 每格保留有限数量的强点
  -> 形成分布均匀的 seed features
```

不能只取全局最强的前 N 个点，否则特征会集中在一个小角落，Homography 对整个平面的约束很弱。

建议把四边形区域分为 `6 x 6` 网格，每格最多保留若干点。种子帧少于最低点数时，直接返回 `insufficient-texture`，不要生成看似成功的恒定四角。

### 9.4 相邻帧光流

从前一帧到当前帧运行金字塔 LK：

```text
prevGray + currGray + prevPoints
  -> calcOpticalFlowPyrLK
  -> currPoints + status + error
```

随后再做一次反向光流：

```text
currGray + prevGray + currPoints
  -> backwardPoints
```

对每个点计算 forward-backward error：

```text
fbError = distance(prevPoint, backwardPoint)
```

过滤条件包括：

- 正向或反向 `status` 失败。
- LK error 超过上限。
- forward-backward error 超过上限。
- 当前点离开帧边界。
- 当前点明显离开上一帧预测平面的扩张区域。
- 点值出现 NaN 或 Infinity。

### 9.5 Canonical 特征坐标

每个活动特征同时保存：

```ts
interface CanonicalFeature {
  seedPoint: PixelPoint;
  previousPoint: PixelPoint;
}
```

`seedPoint` 永远位于种子平面坐标；`previousPoint` 是上一帧位置。当前 Homography 始终拟合：

```text
seedPoint -> currentPoint
```

而不是简单累乘每一帧的增量矩阵。这样可以减少连续矩阵乘法带来的数值漂移。

### 9.6 RANSAC Homography

通过过滤后的对应点调用：

```text
H_t = findHomography(seedPoints, currentPoints, RANSAC, threshold)
```

数学关系为：

```text
s [x_t, y_t, 1]^T = H_t [x_seed, y_seed, 1]^T
```

Homography 理论上只需四组点，但产品实现必须要求更多点和足够分布。建议第一版至少 `12` 个 RANSAC 内点。

### 9.7 对称重投影误差

只看 OpenCV 返回的 inlier mask 不够。对每个内点计算：

```text
forwardError  = distance(currentPoint, H_t(seedPoint))
backwardError = distance(seedPoint, inverse(H_t)(currentPoint))

symmetricError = (forwardError + backwardError) / 2
```

记录中位数和 P90。中位数用于总体质量，P90 用于发现少量但严重的错误点。

### 9.8 四角投影

将种子四角投影到当前帧：

```text
Q_t = perspectiveTransform(Q_seed, H_t)
```

输出前检查：

- 四点有限。
- 四边形保持相同绕序。
- 四边形凸且不自交。
- 每条边大于最小像素长度。
- 面积不接近零。
- 相邻帧面积比例、中心位移和边长变化未超过安全上限。
- Homography 在四个角上的齐次分母不接近零。

任何一项失败都不能把该矩阵传播到下一帧。

### 9.9 特征补充

随着遮挡和出画，活动点会减少。只有当前帧 Homography 已通过全部质量门时，才允许在当前四边形内补充特征：

1. 在当前帧重新检测角点。
2. 排除与已有点距离过近的候选。
3. 用 `inverse(H_t)` 将新点映射回种子坐标。
4. 保存新的 canonical feature。

低置信度帧禁止补点，否则容易把遮挡物上的特征误认为原平面的一部分。

### 9.10 失败与恢复

单帧质量失败时按以下顺序尝试：

1. 使用上一有效帧的原始特征，以更宽 LK window 重试一次。
2. 若上一帧仍可靠，在其预测四边形内重新检测特征并重试。
3. 仍失败则输出 `lost`，停止该方向继续传播。

第一版不在 lost 后跨很长区间自动重识别。错误地贴到另一个物体上比明确停止更糟。

### 9.11 向前、向后和双向

向前：

```text
seed PTS -> visible end PTS
```

向后：

```text
seed PTS -> visible start PTS
```

Mediabunny 按展示顺序输出帧。向后跟踪不能把整段长视频全部放进内存，建议使用有重叠的时间块：

```text
解码 [chunkStart, chunkEnd) 的小段帧
  -> 在内存中反向送入 worker
  -> 保留边界帧作为下一块起点
  -> 释放当前块
```

时间块初始可设为约两秒，并根据分析分辨率限制内存。双向模式分别从相同种子状态运行两次，最后：

- 种子样本只保留一次。
- 合并后按 `ptsUs` 排序。
- 种子四角必须与用户输入逐值相同。
- 两个方向各自保留独立的 lost 边界。

## 10. 参数起点与质量门

以下只是 QCut 首轮测试参数，不是剪映参数，也不能未经基准测试直接固化：

| 参数 | 初始值 | 说明 |
| --- | ---: | --- |
| analysis max width | 960 px | 等比缩放 |
| max features | 240 | 网格分布后总数 |
| Shi-Tomasi quality | 0.01 | 低纹理素材可再降低 |
| min feature distance | 8 px | 分析分辨率下 |
| LK window | 21 x 21 | 失败重试可放大 |
| LK pyramid levels | 3 | 兼顾快速位移 |
| forward-backward limit | 1.5 px | 随分析缩放校正 |
| minimum inliers | 12 | 少于此值直接失败 |
| minimum inlier ratio | 0.55 | 防止多数点已漂移 |
| median symmetric error | 2.5 px | 超过则失败 |
| minimum grid coverage | 0.15 | 防止点集中在小区域 |
| reseed threshold | 80 points | 仅高质量帧补点 |

RANSAC 阈值应根据分析图像对角线自适应，例如：

```text
thresholdPx = clamp(diagonal * 0.0025, 1.5, 4.0)
```

置信度不应只用一个指标平均后掩盖失败。建议取关键指标得分的最小值：

```text
confidence = min(
  inlierRatioScore,
  reprojectionScore,
  coverageScore,
  quadGeometryScore
)
```

## 11. Worker 与 provider 协议

### 11.1 Provider 接口

```ts
export interface PlanarTrackingProgress {
  requestId: string;
  processedFrames: number;
  totalFrames?: number;
  progress: number;
  direction: "forward" | "backward";
  lastPtsUs?: number;
}

export interface PlanarTrackingProvider {
  readonly id: string;
  readonly version: string;
  initialize(): Promise<void>;
  track({
    request,
    onProgress,
    signal,
  }: {
    request: PlanarTrackingRequest;
    onProgress?: (event: PlanarTrackingProgress) => void;
    signal?: AbortSignal;
  }): Promise<PlanarTrackingSidecarV1>;
  dispose(): void;
}
```

UI 不得 import OpenCV 类型。所有 `cv.Mat`、RANSAC mask 和内部特征都只存在于 provider/worker 内。

### 11.2 Worker 消息

建议协议：

```ts
type PlanarWorkerRequest =
  | { type: "initialize"; opencvUrl: string; wasmUrl: string }
  | { type: "begin"; requestId: string; seedPtsUs: number; seedQuad: PlanarQuad; parameters: PlanarTrackingParameters }
  | { type: "frame"; requestId: string; ptsUs: number; frame: ImageBitmap }
  | { type: "reset-to-seed"; requestId: string }
  | { type: "finish"; requestId: string }
  | { type: "cancel"; requestId: string }
  | { type: "close" };
```

响应：

```ts
type PlanarWorkerResponse =
  | { type: "ready" }
  | { type: "sample-batch"; requestId: string; samples: PlanarTrackingSample[] }
  | { type: "progress"; requestId: string; processedFrames: number }
  | { type: "lost"; requestId: string; ptsUs: number; reason: PlanarTrackingErrorCode }
  | { type: "complete"; requestId: string }
  | { type: "error"; requestId?: string; code: PlanarTrackingErrorCode; message: string };
```

帧通过 transferable `ImageBitmap` 发送。worker 消费后必须 `close()`。样本按小批量返回，避免每帧一次 `postMessage` 造成主线程开销。

### 11.3 WASM 资源

建议使用自定义裁剪的 OpenCV.js 构建，只包含：

- core
- imgproc
- video
- calib3d
- features2d 中实际使用部分

资源必须：

- 随 QCut 本地分发，不依赖运行时 CDN。
- 在资产 manifest 中记录版本、大小和 SHA-256。
- 包含对应第三方许可证说明。
- 初始化失败时返回 `provider-unavailable`，不能让属性面板永久卡在 processing。

## 12. 任务生命周期

### 12.1 状态机

```text
idle
  -> queued
  -> processing
       |-> paused
       |-> partial
       |-> ready
       |-> error
       `-> cancelled（瞬时状态，最终回到 idle 或 paused）
```

建议把实时 job 状态放入独立 Zustand store，不在每一帧把 progress 写回 timeline。否则自动保存和撤销历史会被大量无意义更新污染。

只在以下时刻写 timeline 历史：

- 创建平面定义。
- 完成并绑定结果。
- 用户修正四角。
- 清除或切换跟踪模式。

### 12.2 并发规则

- 首版全应用只运行一个 OpenCV planar job，其他请求排队。
- 每个请求有唯一 `requestId`。
- 旧请求的事件在 requestId 不匹配时必须丢弃。
- 切换项目、切换场景、删除源视频或替换媒体时立即 abort。
- 暂停后若 worker 状态仍在内存可 resume；应用重开后从最近 correction/seed 重新运行未完成区间。
- 取消必须在目标 250 ms 内停止继续送帧，并尽快释放 `cv.Mat`。

### 12.3 错误代码

```ts
export type PlanarTrackingErrorCode =
  | "provider-unavailable"
  | "decode-failed"
  | "invalid-seed-quad"
  | "insufficient-texture"
  | "tracking-lost"
  | "degenerate-homography"
  | "result-write-failed"
  | "result-corrupt"
  | "cancelled";
```

UI 映射为短、可操作的本地化文案，不显示 WASM 栈或文件系统细节。

## 13. 结果保存

### 13.1 Electron 项目目录

新增第一方目录：

```text
<project>/analysis/tracking/<surfaceTrackingId>.json
```

不要放进 `cache/`，因为用户保存并重开工程时仍需要该结果。项目打包、复制和清理逻辑必须把 `analysis/tracking` 视为工程内容，而不是临时缓存。

### 13.2 写入协议

Electron IPC 写入必须：

1. 校验 projectId 和 trackingId 只作为安全路径片段。
2. 校验 schema、样本数、单调 PTS 和所有数值。
3. 限制最大请求和最大文件大小。
4. 写入同目录临时文件。
5. 完成后原子 rename。
6. 返回 project-relative URI 和 SHA-256。
7. timeline 只在写入成功后切换为 ready。

读取时重新计算或核对 SHA-256。文件缺失或损坏时将 reference 标记为 `stale`/`error`，不得默默回退为恒定四角。

### 13.3 Browser/iPad

定义 `PlanarTrackingResultStore` 接口：

```ts
export interface PlanarTrackingResultStore {
  write({ projectId, result }: { projectId: string; result: PlanarTrackingSidecarV1 }): Promise<StoredPlanarTrackingResult>;
  read({ projectId, resultUri }: { projectId: string; resultUri: string }): Promise<PlanarTrackingSidecarV1>;
  remove({ projectId, resultUri }: { projectId: string; resultUri: string }): Promise<void>;
}
```

Electron 实现写项目文件；浏览器/iPad 实现写 IndexedDB。timeline 中的 URI 使用带 scheme 的逻辑引用，例如 `project-tracking:<id>`，不保存平台绝对路径。

### 13.4 垃圾回收

- Undo 解除绑定时不立即删 sidecar，避免 redo 失效。
- 保存或项目关闭时统计所有 `surfaceTrackings` 引用。
- 未被任何媒体 reference 引用的结果进入延迟清理队列。
- 删除源媒体时，先取消任务，再删除其 references；sidecar 可在保存后回收。

## 14. 缓存与失效

### 14.1 求解缓存键

```text
sha256(
  schemaVersion
  + sourceContentSha256
  + seedPtsUs
  + normalizedSeedQuad
  + requestedSourceRange
  + direction
  + providerId
  + providerVersion
  + parameterHash
  + sourceDisplayGeometry
)
```

### 14.2 哪些变化需要重跑

| 变化 | 是否重跑求解器 | 原因 |
| --- | --- | --- |
| 替换源文件或内容 hash 改变 | 是 | 像素已经变化 |
| 修改种子 PTS | 是 | 初始参考帧变化 |
| 修改种子四角 | 是 | 平面定义变化 |
| provider/参数版本变化 | 是 | 轨迹不可复用 |
| 扩大可见源时间范围 | 可能 | 可复用已有区间，只补缺失部分 |
| trim 改变 | 可能 | 结果仍有效，但覆盖范围可能不足 |
| 变速曲线改变 | 否 | 只改变时间映射 |
| reverse 改变 | 否 | 只改变访问顺序 |
| freeze frame 改变 | 否 | 同一源 PTS 继续复用 |
| 视频元素 x/y/scale/rotation/flip | 否 | 只重新投影到画布 |
| 视频 crop/fit/perspective 改变 | 否 | 跟踪仍在 source display 空间 |
| 贴纸大小、位置或样式改变 | 否 | 只更新附件锚点或二次调整 |

这一区分很重要：把结果存成 source-space 后，编辑器布局变化不应触发昂贵的视频重分析。

## 15. 从轨迹到贴纸四角

### 15.1 相对 Homography

设种子平面的四角为 `Q_seed`，当前四角为 `Q_t`：

```text
H_seed = homography(unitSquare -> Q_seed)
H_t    = homography(unitSquare -> Q_t)

H_relative(t) = H_t * inverse(H_seed)
```

对绑定时贴纸的四个源空间角点 `T_seed`：

```text
T_t = H_relative(t) * T_seed
```

然后把 `T_t` 经过源视频元素当前的 crop、fit、perspective、scale、rotation 和 position 映射到 project canvas。

不能直接令贴纸四角等于平面四角，否则用户在平面内部设置的贴纸位置和大小会丢失。

### 15.2 lost 行为

绑定提供两个明确选项：

- `hold`：保持最后一个有效四角。
- `hide`：在 lost 区间将目标 opacity 置为零。

不做隐式长区间线性插值。跨遮挡插值可能穿过完全错误的位置，只有用户建立两端 correction 后才能提供显式补间策略。

### 15.3 输出为可导出的几何

当前目标四角为 canvas pixel 中的 `P0..P3`。构造轴对齐包围盒：

```text
left   = min(Pi.x)
right  = max(Pi.x)
top    = min(Pi.y)
bottom = max(Pi.y)
```

再得到：

```text
centerX = (left + right) / 2
centerY = (top + bottom) / 2
width   = right - left
height  = bottom - top

perspectivePoint_i = (
  (Pi.x - left) / width,
  (Pi.y - top) / height
)
```

这样八个 perspective 坐标自然落在 `[0, 1]`，能进入现有 FFmpeg sticker perspective 链路，同时 x/y/width/height 表达整体包围盒移动。

宽高接近零或四边形退化时必须返回无效几何，而不是除以极小数。

## 16. 与贴纸动画和关键帧的组合顺序

建议固定为：

```text
贴纸基础几何
  -> 普通贴纸关键帧/用户二次调整
  -> 种子帧附件锚点
  -> 平面相对 Homography
  -> 入场/出场/循环动画
  -> opacity/blend
```

第一版约束：绑定后直接修改普通 `x/y/width/height/rotation/perspective` 时，编辑器将它解释为当前帧的附件二次调整，并换算到平面局部坐标。不要同时让普通画布关键帧和附件关键帧争夺同一字段。

后续可增加独立结构：

```ts
interface PlanarAttachmentAdjustment {
  ptsUs: number;
  offsetU: number;
  offsetV: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}
```

## 17. 用户修正与分段重跟踪

### 17.1 Correction 数据

```ts
export interface PlanarTrackingCorrection {
  id: string;
  ptsUs: number;
  quad: PlanarQuad;
}
```

用户在某帧拖动跟踪四角后生成 correction，不应直接覆盖原始 sidecar 某一个样本而让相邻帧保持断裂。

### 17.2 重算规则

把 corrections 加上初始 seed 按 PTS 排序。每个 correction 是一个新的局部锚点：

- 向前重算到下一个 correction 或可见区间结束。
- 向后重算到上一个 correction 或可见区间开始。
- correction 自身四角逐值保留。
- 新结果原子替换受影响区间，其他区间保持不变。

第一版可以只提供“从当前修正帧向选定方向重新跟踪”。局部双锚点融合是后续增强，但数据模型现在就应允许多个 correction。

## 18. UI 设计

### 18.1 属性面板

贴纸的跟踪页使用互斥分段控件：

```text
[ 无 ] [ 运动跟踪 ] [ 平面跟踪 ]
```

平面跟踪状态下显示：

- 源视频选择菜单。
- 四点编辑按钮。
- 跟踪方向菜单。
- 开始、暂停/继续、取消或重试命令。
- 进度条。
- lost 区间行为选择。
- 完成后的修正当前帧、重新跟踪和解除绑定命令。

模式、方向和二元选项分别使用 segmented control、菜单和开关，不用一组外观相同的文字胶囊按钮。

### 18.2 画布四点编辑器

新增 `PlanarTrackingOverlay`：

- 四个可拖拽角点。
- 四条边和轻量半透明内部区域。
- 当前失效或 lost 时使用错误状态颜色。
- 角点在任意画布缩放下保持稳定可点击尺寸。
- 拖动时实时验证凸性；跨越相邻边时阻止提交。
- 键盘方向键可微调选中角点。
- Escape 取消本次编辑，Enter 提交。

默认四角位于当前可见视频区域中央，不能超出实际视频画面后才依赖算法报错。

### 18.3 进度与撤销

- progress 只更新 job store，不进入 undo history。
- 点击开始时保留旧的 ready 结果，直到新结果成功写入。
- 新任务失败时继续使用旧结果，并显示重试状态。
- 完成后用一个原子 timeline 更新替换 reference 和绑定。

## 19. 导出实现

### 19.1 复用现有 FFmpeg 能力

当前 FFmpeg sticker filter 已支持动态：

- x/y
- width/height
- 八个 perspective 属性

因此无需让 FFmpeg 运行 OpenCV。跟踪只在分析阶段运行一次，导出时读取 sidecar 并烘焙几何关键帧。

### 19.2 扩展导出属性

把当前：

```ts
type TrackingExportProperty = "x" | "y" | "width" | "height";
```

扩展为包含：

```text
topLeftX, topLeftY
topRightX, topRightY
bottomRightX, bottomRightY
bottomLeftX, bottomLeftY
opacity（仅 hide lost 时）
```

每个导出帧：

1. 使用导出 timeline time。
2. 映射到源 PTS。
3. 从 sidecar 求当前平面四角。
4. 调用统一附件几何求值器。
5. 生成包围盒和 perspective 属性。

### 19.3 轨迹简化

逐帧烘焙可能触及现有 `18,001` 样本上限。不能分别对十二个数值做普通 RDP，因为每个字段的小误差可能组合成较大的角点误差。

应按视觉几何简化：

1. 尝试在线性插值下移除一个中间样本。
2. 重建该时刻四个 canvas 角点。
3. 计算与原始四角的最大像素距离。
4. 超过容差则保留该样本。
5. correction、lost 边界、种子和方向接缝永远保留。

初始视觉容差可设为 `0.5 px`，之后通过真实导出测试校准。

## 20. 文件级实施清单

### 20.1 Editor Core

```text
packages/editor-core/src/tracking/planar-types.ts
packages/editor-core/src/tracking/planar-geometry.ts
packages/editor-core/src/tracking/planar-result-validation.ts
packages/editor-core/src/tracking/__tests__/planar-geometry.test.ts
packages/editor-core/src/tracking/__tests__/planar-result-validation.test.ts
packages/editor-core/src/types/timeline.ts
```

职责：共享类型、纯矩阵/四边形运算、schema 校验和 timeline 联合类型。

### 20.2 Web runtime

```text
apps/web/src/lib/tracking/planar/planar-frame-source.ts
apps/web/src/lib/tracking/planar/planar-tracking-provider.ts
apps/web/src/lib/tracking/planar/open-cv-planar-provider.ts
apps/web/src/lib/tracking/planar/planar-worker-client.ts
apps/web/src/lib/tracking/planar/planar-worker-types.ts
apps/web/src/lib/tracking/planar/planar-tracking-service.ts
apps/web/src/lib/tracking/planar/planar-result-store.ts
apps/web/src/lib/tracking/planar/planar-cache-key.ts
apps/web/src/lib/tracking/planar/planar-attachment-evaluator.ts
apps/web/src/lib/tracking/planar/planar-export-keyframes.ts
apps/web/src/lib/tracking/planar/__tests__/*
```

每个文件只负责一个边界，避免把解码、OpenCV、状态、存储和渲染堆进属性面板。

### 20.3 Worker 与资产

```text
apps/web/public/opencv-planar/opencv.js
apps/web/public/opencv-planar/opencv.wasm
apps/web/public/opencv-planar/planar-tracking-worker.js
apps/web/src/lib/assets/qcut-asset-manifest.ts
```

这些必须是 QCut 可合法分发的 OpenCV 构建及许可证，不包含剪映文件。

### 20.4 UI

```text
apps/web/src/components/editor/properties-panel/sticker-tracking-properties.tsx
apps/web/src/components/editor/preview-panel/planar-tracking-overlay.tsx
apps/web/src/stores/planar-tracking-job-store.ts
apps/web/src/lib/i18n/translations.ts
```

### 20.5 Electron sidecar

```text
electron/planar-tracking/planar-tracking-path.ts
electron/planar-tracking/planar-tracking-store.ts
electron/planar-tracking/planar-tracking-ipc.ts
electron/preload-types/api-types/planar-tracking-api.ts
electron/preload.ts
electron/lib/project-structure.ts
```

### 20.6 现有渲染和导出接入

```text
apps/web/src/lib/stickers/timeline-sticker-visual.ts
apps/web/src/lib/stickers/sticker-tracking-export.ts
apps/web/src/lib/export-cli/sources/sticker-sources.ts
electron/ffmpeg/sticker-filter-graph.ts
```

FFmpeg filter 本身预计不需要新算法，只需要验证动态四角和负画布坐标的既有表达式满足跟踪输出。

## 21. 测试设计

### 21.1 纯几何单元测试

- unit square 到任意凸四边形的 Homography。
- 矩阵逆与组合往返误差。
- analysis pixel 与 normalized 坐标往返。
- source display 与 project canvas 往返。
- 四边形凸性、自交、绕序、面积和退化检查。
- `H_relative(seed)` 必须为 identity。
- 对 seed target quad 应用已知 H 后得到准确目标四角。
- 四角到 x/y/width/height/perspective 再还原的像素误差。

### 21.2 合成算法夹具

程序生成一张带多尺度纹理的平面图，逐帧应用已知变换：

- 纯平移。
- 等比与非等比缩放。
- 旋转。
- 透视梯形。
- 组合变换。
- 部分出画。
- 局部遮挡。
- 运动模糊。
- 降低纹理和亮度变化。

worker 输出四角与真值比较：

```text
corner RMSE
max corner error
tracked frame ratio
first lost PTS
false-success frame count
```

最重要的失败指标是 false success：明显跟错却仍标记 tracked。它必须比“提前 lost”受到更严格限制。

### 21.3 时间测试

- 24/25/30/60 fps。
- VFR 不规则 PTS。
- 非零 first timestamp。
- trimStart/trimEnd。
- 0.5x、2x 和速度曲线。
- reverse。
- freeze frame。
- 不同项目 FPS 下同一 source PTS 得到相同四角。

### 21.4 生命周期测试

- 初始化失败不会卡住 processing。
- cancel 后不再接受旧 worker 样本。
- project/scene 切换取消请求。
- 暂停与恢复不重复 seed 样本。
- 应用重开把 processing 规范化为 paused。
- 写 sidecar 失败时旧 ready 结果仍可用。
- 删除贴纸不会误删共享结果。
- 删除源视频会取消任务并清理引用。

### 21.5 UI 测试

- 无/运动/平面三模式互斥。
- 四点拖拽、键盘微调、取消和提交。
- 不允许提交自交四边形。
- 方向、开始、暂停、继续、重试和解除绑定。
- lost 行为切换。
- correction 创建和局部重跑。
- Undo/redo 不受 progress 更新污染。

### 21.6 预览与真实导出

至少保留三类真实视频：

1. 清晰屏幕或路牌，轻度透视。
2. 手持相机造成平移、旋转和明显透视变化。
3. 包含遮挡、模糊和出画的失败样本。

验收动作：

```text
运行跟踪
  -> 绑定贴纸
  -> 截取多个 PTS 的预览画面
  -> 保存并重开
  -> 导出 MP4
  -> 在相同 PTS 解码导出帧
  -> 比较贴纸四角和像素位置
```

不能只检查“导出文件存在”。必须检查非空帧、持续时长、多个时刻的实际贴合，以及预览/导出误差。

## 22. 建议验收阈值

以下是首版目标，需要由合成和真实夹具共同校准：

| 项目 | 目标 |
| --- | ---: |
| 合成清晰样本平均角点误差 | <= 2 px（分析分辨率） |
| 合成清晰样本最大角点误差 | <= 5 px |
| 预览与导出四角误差 | <= 1 输出像素 |
| seed 帧误差 | 0 |
| false-success 严重漂移 | 0 帧 |
| cancel 到停止送帧 | <= 250 ms |
| Worker 峰值内存 | 目标 <= 256 MB |
| 主线程跟踪期间交互长任务 | 不出现持续性 > 50 ms 阻塞 |

性能速度需要在固定参考机器和固定素材上记录，初版不先写“实时”承诺。先保证不漂移和可取消，再优化吞吐。

## 23. 分阶段提交方案

每个阶段保持可测试和可回退，建议一个关注点一个 commit：

### Commit 1：共享类型与纯几何

- 新增 planar types、矩阵、quad 校验和测试。
- 扩展 timeline 的 source reference 与 sticker binding union。
- 不接 UI，不接 OpenCV。

完成标准：所有几何与 schema 单元测试通过。

### Commit 2：sidecar 存储

- Electron 安全路径、原子读写、hash、schema 验证。
- Browser IndexedDB adapter。
- 项目结构和 preload API。

完成标准：写入、重开、损坏、路径穿越和大小限制测试通过。

### Commit 3：帧源与 OpenCV worker

- 从现有 alpha tracking 中抽出 Mediabunny 帧迭代模式。
- 加入 OpenCV.js 资产、worker client 和 provider。
- 完成合成平移/旋转/透视测试。

完成标准：真实逐帧四角 sidecar 生成，cancel 和内存释放通过。

### Commit 4：任务状态与四点 UI

- 平面模式、源视频选择、四点编辑、方向和进度。
- job store、暂停/取消/错误处理。

完成标准：真实 UI 能启动任务并保存 ready/partial 结果。

### Commit 5：预览绑定

- 相对 Homography 和附件 evaluator。
- 贴纸预览、overlay 同步、lost hold/hide。

完成标准：播放、seek、变速、倒放和定格时贴纸正确跟随。

### Commit 6：FFmpeg 导出

- 扩展跟踪导出到八个 perspective 属性。
- 几何误差驱动的轨迹简化。
- 真实 MP4 预览/导出对照测试。

完成标准：多个 PTS 的预览与导出角点误差不超过一个输出像素。

### Commit 7：修正帧与鲁棒性

- correction、局部重跑、共享结果清理。
- 遮挡、模糊、低纹理和出画夹具。
- 性能和内存基准。

完成标准：错误素材明确 lost，不产生错误的持续漂移。

## 24. 第一轮最小可用范围

为了尽快得到真实端到端结果，第一轮只承诺：

- 一个源视频绑定一个静态贴纸。
- 清晰、纹理足够的近似刚性平面。
- 向前和双向跟踪。
- source PTS sidecar。
- hold/hide lost 行为。
- 保存、重开、预览和 FFmpeg 导出。
- 无 correction 或只支持“当前帧作为新 seed 重新运行”。

不应该把范围缩小成“只做四点 UI”，因为那无法验证数据模型和渲染方向是否正确；也不应该第一轮就加入神经网络重识别、多人协作或复杂曲面，这会掩盖基础坐标和时间问题。

## 25. 最大风险与提前验证

### 风险 1：OpenCV.js 构建缺少所需绑定

第一件 spike 应在独立 Worker 中实际调用 `goodFeaturesToTrack`、`calcOpticalFlowPyrLK` 和 `findHomography`，并验证销毁所有 `cv.Mat` 后内存稳定。不要先做完整 UI 再发现 WASM 构建缺模块。

### 风险 2：canvas 到 source 的逆变换不完整

先为 crop、fit、flip、rotation 和现有 perspective 做往返测试。若逆映射不准确，用户框选的位置和算法实际跟踪区域会从第一帧就不同。

### 风险 3：FFmpeg 关键帧语义与 Web 预览不同

在 worker 之前先用人工生成的四角轨迹走一遍预览和真实 FFmpeg 导出。这样能把渲染问题与跟踪算法问题分开。

### 风险 4：长视频反向解码内存过高

先实现两秒级有界 chunk，并加入内存测试。禁止为了双向方便而把整段灰度帧留在数组中。

### 风险 5：结果“完成”但实际已漂移

产品状态必须由 quality gate 决定，不由循环是否跑到结尾决定。真实验收要记录 false-success，而不只是完成率。

## 26. 与剪映对照的方法

在 QCut 独立实现完成后，可使用同一段短视频和相同种子四角做黑盒对照：

1. 在剪映运行平面跟踪并导出贴纸结果。
2. 在 QCut 使用相同输入和种子运行。
3. 在若干相同 PTS 截取画面。
4. 比较四角轨迹、lost 区间和最终贴纸像素位置。
5. 分开报告算法差异与渲染差异。

可以声明：

- QCut 支持同类平面跟踪工作流。
- 在指定夹具上的角点误差和视觉误差达到测量阈值。

不能在没有测量时声明“完美复刻”或“与剪映一模一样”。剪映私有模型、阈值、平滑和重识别策略仍然未知。

## 27. 实施前的三个 spike

正式开发前先完成三个可丢弃 spike，每个都必须输出测试结果：

1. **OpenCV Worker spike**

   两张已知透视变换图片，输出 Homography 和角点误差；验证取消和内存释放。

2. **坐标往返 spike**

   对带 crop、flip、rotation、perspective 的视频元素执行 canvas -> source -> canvas，最大误差目标小于 `0.5 px`。

3. **导出四角 spike**

   使用人工正弦运动和透视轨迹驱动贴纸，验证 Web 预览与 FFmpeg 导出在多个时间点小于一个输出像素误差。

这三个 spike 通过后，再连接真实视频跟踪 UI。它们分别隔离求解器、坐标系统和导出系统，是整个实现中最值得提前验证的三处边界。
