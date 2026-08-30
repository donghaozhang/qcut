# 剪映运动跟踪与平面跟踪：实现研究与 QCut 落地方案

> 调研对象：剪映专业版 macOS 11.3.0
>
> 文档目的：说明运动跟踪、平面跟踪各自由哪些部分组成，剪映工程数据如何表达，以及 QCut 当前已有能力、缺口与实现顺序。
>
> 边界：本文只记录界面观察、脱敏工程数据、静态符号和公开算法原理；不提交剪映二进制、模型、工程文件或原始跟踪数据。

## 1. 结论先行

剪映的“运动跟踪”和“平面跟踪”不是同一算法的两个 UI 开关，而是两条不同的数据与渲染链路：

| 能力 | 运动跟踪 | 平面跟踪 |
| --- | --- | --- |
| 用户输入 | 一个目标矩形区域 | 平面上的四个角点 |
| 每帧核心结果 | 目标包围框，可附带角度、状态 | 四角坐标，等价于逐帧单应矩阵（Homography） |
| 可表达运动 | 平移、缩放，部分场景可跟随旋转 | 平移、缩放、旋转、剪切、透视形变 |
| 典型用途 | 字幕、贴纸、马赛克跟随人物或物体 | 贴纸、图片、文字贴合屏幕、墙面、路牌等平面 |
| 主要失败模式 | 遮挡、目标出画、外观剧变 | 低纹理、运动模糊、平面出画、四点退化、错误匹配 |

QCut 目前已经具备一条可用但较简化的“运动跟随”链路：从人物或物体分割蒙版提取轴对齐包围框，再驱动贴纸的位置和可选缩放。它还不是剪映式的专用单目标跟踪器。

QCut 也已经具备平面跟踪所需的主要渲染积木，包括四角透视数据、`matrix3d` 计算、画布透视投影和关键帧属性。真正缺少的是：

1. 平面跟踪求解器及其异步任务生命周期。
2. 带 PTS 的逐帧四角结果和质量状态。
3. “被跟踪视频 -> 跟踪结果 -> 贴纸/文字附件”的统一绑定模型。
4. 预览、保存、重开和导出共用的结果求值器。

因此，第一阶段可以先完整建立 UI、数据模型和任务状态，并复用现有蒙版包围框实现运动跟随；平面跟踪按钮先接入明确的未运行/运行中/失败/完成状态。第二阶段再接入独立求解器，不需要等待所有算法都完成才开始做界面。

## 2. 证据等级

本文使用以下等级，避免把静态推断误写成已经运行验证：

- **运行观察**：在剪映界面操作后直接看到的 UI、进度和脱敏 sidecar 结构。
- **静态强证据**：应用动态库符号、序列化字段、算法配置和随包模型能相互印证。
- **架构推断**：能解释现象且符合现有符号，但尚未捕获完整运行调用链。
- **待确认**：私有枚举、阈值、插值策略或具体模型版本无法从现有证据可靠确定。

## 3. 剪映 UI 由哪些部分组成

### 3.1 公共入口

贴纸或其他可附着素材的属性面板中，跟踪页包含三个互斥模式：

- 无
- 运动跟踪
- 平面跟踪

切换到另一种跟踪会替换当前跟踪关系，不是同时叠加两个求解器。

### 3.2 运动跟踪

运动跟踪界面至少包含：

- 画面上的目标矩形框，用于指定初始目标。
- 跟踪方向：向前、向后或双向。
- 缩放跟随开关。
- 相对距离相关选项。
- 开始跟踪、进度、失败后重试。
- 跟踪完成后的画布位置调整。

用户选择的是“谁被跟踪”，而当前贴纸、文字或其他素材是“谁消费跟踪结果”。这两个对象需要独立建模。

### 3.3 平面跟踪

平面跟踪界面至少包含：

- 四点平面编辑器：把四个角拖到目标平面上。
- 当前跟踪平面或源视频标识。
- 跟踪方向：向前、向后或双向。
- 开始跟踪、进度和失败状态。
- 完成后的全局调整、关键帧调整和重新跟踪入口。

四点不是普通裁剪框。它定义了初始平面的几何位置，后续每帧都需要输出对应四角，渲染端再把贴纸或文字映射到该四边形上。

## 4. 剪映内部结构

根据动态库符号、依赖关系、模型配置和工程 sidecar，可以把实现分成四层：

```text
属性面板 / 画布编辑器
        |
        v
业务编排与任务状态
ObjectTrackingHelper / SurfaceTrackingHelper
        |
        v
跟踪服务与工程模型
VideoTracking / SurfaceTracking / CornerPin
        |
        v
算法运行时
单目标跟踪 / 光流 / Homography / 神经网络模型
        |
        v
逐帧 sidecar + 工程绑定
        |
        v
贴纸、文字、马赛克等消费者的预览与导出渲染
```

### 4.1 UI 与业务编排层

`libVECreator.dylib` 中出现了以下强相关符号：

- `ObjectTrackingHelper`、`ObjectTrackingHelperImpl::startTrackV3`
- `startMotionTracking`、`saveTrackingData`
- `onVideoTrackingProgress`、`onVideoTrackingFinished`
- `SurfaceTrackingHelper`
- `PlanarTrackingEditControlModel`
- `PlanarTrackingEditControlViewModel`
- `VideoCornerPinViewModel`

这层负责接收用户框选或四点编辑、创建跟踪任务、转发进度、保存结果，以及通知画布刷新。它不是算法本身。

### 4.2 工程模型与服务层

`libvideoeditor.dylib` 中出现了：

- `MaterialVideoTracking`
- `VideoTrackingConfig`
- `VideoTracker`
- `SurfaceTracking`
- `SurfaceTrackingConfig`
- `CornerPin`、`CornerPinInfo`
- `StickerService::startVideoTrackingV3`

这层负责把源视频、目标素材、初始区域、结果文件及二次编辑配置连接起来，并持久化到工程。

### 4.3 算法层

`libcccreator.dylib` 中可见：

- `SINGLE_OBJECT_TRACKING`
- `OPTICAL_FLOW_TRACK`
- `SURFACE_TRACKER`
- `SparsePyrLKOpticalFlow`
- `findHomography`
- `Homography inliers`
- `Homography invalid`
- `surface_tracker::ReprojectCostFunction`

随包配置还能看到单目标跟踪、区域跟踪和 `surface_tracker` 节点。依赖关系显示业务库会连接 `libcccreator`、`libfastcv` 和 `libbytenn`。这些是“运动跟踪使用目标跟踪，平面跟踪使用特征/光流与单应矩阵”的静态强证据。

需要特别排除一个容易误判的库：`libTracking.dylib` 的符号主要是事件埋点、数据库和网络上传，它不是这里的视觉跟踪求解器。

## 5. 剪映工程由哪些数据组成

### 5.1 运动跟踪工程模型

静态序列化符号显示，运动跟踪至少涉及以下字段：

```text
MaterialVideoTracking
  config
  version
  map_path
  result_path
  enable_video_tracking
  tracker_type
  enable_scale
  enable_relative_distance
  trackers
  tracking_time_range
  tracker_data_id

VideoTrackingConfig
  width, height
  center_x, center_y
  rotation

VideoTracker
  target_segment_id
  src_segment_id
  data_path
  type
  surface_id
  surface_second_edit_config
  second_edit_media_time
```

从命名关系推断：`src_segment_id` 指向被分析的视频，`target_segment_id` 指向消费结果的贴纸或其他素材，`result_path` / `data_path` 指向逐帧结果文件。

### 5.2 平面跟踪工程模型

平面跟踪相关字段包括：

```text
SurfaceTracking
  name
  generate_seg_id
  data_path
  surface_tracking_config

SurfaceTrackingConfig
  left_up_x, left_up_y
  right_up_x, right_up_y
  left_down_x, left_down_y
  right_down_x, right_down_y

CornerPinInfo
  upper_left_x, upper_left_y
  upper_right_x, upper_right_y
  lower_left_x, lower_left_y
  lower_right_x, lower_right_y
```

明文工程骨架中，平面结果归在视频素材的 `surface_trackings` 一侧；目标素材再通过 `surface_id` 一类字段引用它。完整非空工程的顶层映射仍需进一步运行验证，因此这里不把字段归属写成最终兼容规范。

### 5.3 逐帧 sidecar

一次平面跟踪会在工程私有目录下生成 `desc.json` 和 `data.json`。脱敏后的结构如下：

```json
{
  "baselinePts": 0,
  "startTime": 0,
  "endTime": 0,
  "resType": 4
}
```

```json
{
  "baseline": {},
  "data": [
    {
      "p_x1": 0.35,
      "p_y1": 0.35,
      "p_x2": 0.65,
      "p_y2": 0.35,
      "p_x3": 0.65,
      "p_y3": 0.65,
      "p_x4": 0.35,
      "p_y4": 0.65,
      "pts": 916667,
      "status": 0
    }
  ]
}
```

运行观察中的平面结果有以下特征：

- `resType` 为 `4`。
- 每帧记录四个角点、PTS 和状态。
- 24 fps 素材的相邻 PTS 差约为 `41666/41667` 微秒。
- 一段高噪声、强模糊测试素材仅首帧保留有效四角，后续记录归零，说明任务完成不等于跟踪质量成功。

另一个已有运动跟踪结果表现为：

```json
{
  "left": 0.1,
  "top": 0.2,
  "right": 0.4,
  "bottom": 0.6,
  "angle": 0,
  "pts": 1000000,
  "status": 1
}
```

该结果的 `resType` 为 `1`，每条记录是矩形、角度、PTS 和状态，并有独立 `baseline`。目前不能可靠确定 `status=0/1/4` 的完整枚举含义，QCut 不应直接照抄这些数字作为公开类型。

## 6. 两种算法实际在做什么

### 6.1 运动跟踪

典型处理流程：

```text
用户框选初始目标
  -> 提取目标外观或深度特征
  -> 在下一帧搜索候选位置
  -> 更新目标框、尺度、角度与置信度
  -> 遮挡或置信度过低时标记 lost
  -> 双向模式分别计算并在种子帧附近合并
```

渲染时，目标素材相对初始框建立锚点：

```text
offset(t) = trackedCenter(t) - trackedCenter(seed)
scale(t)  = trackedSize(t) / trackedSize(seed)
angle(t)  = trackedAngle(t) - trackedAngle(seed)
```

消费者可以选择只使用位移，也可以附加缩放或旋转。

### 6.2 平面跟踪

典型的干净实现路径：

```text
用户给出初始四边形
  -> 在平面区域检测稳定特征点
  -> 用金字塔 Lucas-Kanade 光流追踪到下一帧
  -> 前后向一致性过滤错误点
  -> RANSAC 估计 Homography
  -> 检查内点数量、重投影误差和矩阵退化
  -> 把初始四角投影为当前帧四角
  -> 质量不足时标记 lost，等待修正或重新跟踪
```

单应矩阵满足：

```text
[x', y', 1]^T ~ H(t) [x, y, 1]^T
```

目标素材不是直接使用当前视频四角，而是使用相对于种子帧的变换：

```text
H_relative(t) = H_surface(t) * inverse(H_surface(seed))
```

这样用户在种子帧上对贴纸做的大小、位置和透视调整可以被保留，再随平面运动。

## 7. QCut 当前已有能力

### 7.1 已有运动跟随

当前 `StickerMotionTracking` 只支持：

- `mode: "motion"`
- 目标元素与蒙版引用
- 初始锚点
- `followScale`

运行链路从 MediaPipe、SAM3 或 optical-flow 蒙版读取逐帧中心和宽高，再把媒体变换投影到画布，输出贴纸 `x/y` 和可选 `width/height`。导出端会按项目帧率展开这些值。

这足以支持一部分“贴纸跟着人或物体移动”的效果，但与剪映仍有明显差别：

- 依赖分割蒙版，而不是专用单目标 tracker。
- 结果以轴对齐包围框为主。
- 没有正式的目标丢失、置信度与重试语义。
- 没有完整旋转、相对距离、双向合并和逐帧 PTS 模型。
- Jianying draft 导入导出当前明确标记为需要原生映射。

### 7.2 已有平面渲染积木

QCut 已有：

- `MediaPerspective`：四个归一化角点，共八个坐标。
- 四角坐标的关键帧属性。
- `buildPerspectiveMatrix3d` 和点投影工具。
- Canvas 透视网格渲染。

所以平面跟踪不是从零开始。求解器只要能稳定输出逐帧四角，现有透视系统就能成为渲染层基础。

## 8. QCut 真正缺少什么

| 层 | 当前状态 | 缺口 |
| --- | --- | --- |
| UI | 运动目标与缩放已有；平面入口是不可用提示 | 四点编辑、方向、进度、失败、修正、重跟踪 |
| 数据模型 | 仅 `StickerMotionTracking` | motion/planar 联合类型、PTS、状态、结果引用、锚点 |
| 任务系统 | 分割任务可复用部分基础设施 | 可取消、可恢复、可重试的 tracking job |
| 运动求解 | 蒙版 bbox 跟随 | 专用单目标跟踪、lost、角度、双向合并 |
| 平面求解 | 无 | 特征、光流、Homography、质量门控 |
| 渲染 | 运动位置/缩放和透视积木已有 | 统一 attachment evaluator、相对 Homography |
| 时间 | 导出按项目 FPS 展开 | 源 PTS、变速、倒放、裁剪和插值语义 |
| 持久化 | 运动绑定随 timeline 保存 | 大结果 sidecar、缓存键、失效规则、重开恢复 |
| Jianying 互操作 | 未支持 | 先验证完整明文映射，再做读写；不可猜 opaque 字段 |

## 9. 推荐的数据模型

分析结果与素材绑定必须分开，避免一个结果只能服务一个贴纸。

```ts
type TrackingSampleStatus = "tracked" | "lost" | "interpolated";

interface MotionTrackingSample {
  ptsUs: number;
  box: { left: number; top: number; right: number; bottom: number };
  angleRadians?: number;
  confidence?: number;
  status: TrackingSampleStatus;
}

interface PlanarTrackingSample {
  ptsUs: number;
  corners: {
    upperLeft: { x: number; y: number };
    upperRight: { x: number; y: number };
    lowerRight: { x: number; y: number };
    lowerLeft: { x: number; y: number };
  };
  confidence?: number;
  status: TrackingSampleStatus;
}

type TrackingResult =
  | { kind: "motion"; samples: MotionTrackingSample[] }
  | { kind: "planar"; samples: PlanarTrackingSample[] };

interface TrackingAttachment {
  sourceElementId: string;
  targetElementId: string;
  resultId: string;
  seedPtsUs: number;
  followPosition: boolean;
  followScale: boolean;
  followRotation: boolean;
}
```

所有坐标应明确规定为源媒体可见画面的归一化坐标，角点顺序固定，并且时间使用源 PTS 微秒。不要用数组下标暗示时间，也不要把剪映私有 `status` 数字直接暴露到 QCut 模型。

任务状态建议独立建模：

```text
idle -> queued -> running -> ready
                  |   |
                  |   +-> failed
                  +-----> cancelled
```

## 10. 分阶段实现计划

### 阶段 A：先把 UI 和公共骨架建好

目标是让用户流程完整，即使平面算法暂时只有 provider 占位。

1. 把“无 / 运动跟踪 / 平面跟踪”做成互斥分段控件。
2. 运动模式保留目标选择和缩放跟随，补充方向、运行状态与重试。
3. 平面模式加入四点编辑按钮、方向、开始/取消、进度、失败信息。
4. 画布提供运动矩形和四角控制点；编辑状态与普通选择状态分离。
5. 建立 `TrackingJob`、`TrackingResult`、`TrackingAttachment` 和 provider 接口。
6. 平面 provider 未接入时显示明确状态，不生成伪结果。

这一阶段可以用现有蒙版 bbox 作为 motion provider，优先打通创建、保存、重开、取消和导出调用路径。

### 阶段 B：统一现有运动跟随

1. 把蒙版关键帧转换为带 PTS 的 `MotionTrackingSample`。
2. 固定 source-space -> timeline-space -> canvas-space 的转换顺序。
3. 实现种子锚点、位移与缩放的统一 evaluator。
4. 让预览和导出调用同一个 evaluator，避免两套插值。
5. 增加 lost 区间策略：保持最后值、隐藏目标或允许用户选择。
6. 为裁剪、变速、倒放、旋转和透视媒体添加测试。

### 阶段 C：专用运动跟踪 provider

1. 使用成熟的单目标跟踪实现，不在 UI 层手写视觉算法。
2. 输入首帧矩形，输出 bbox、角度、置信度和状态。
3. 分别实现向前、向后，再实现以种子帧为中心的双向合并。
4. 对遮挡、目标出画和重新出现定义可预测行为。
5. 增加旋转跟随与相对距离；默认行为继续兼容当前 QCut 项目。

### 阶段 D：平面跟踪 provider

优先实现把握较高、可测试的传统视觉方案：

1. 在初始四边形内检测并均匀采样特征点。
2. 用金字塔 LK 光流逐帧追踪。
3. 用前后向误差和边界检查过滤错误点。
4. 用 RANSAC 求 Homography，并检查内点率、重投影误差和矩阵条件。
5. 将初始四角重投影为当前四角，输出 `PlanarTrackingSample`。
6. 质量不足时输出 `lost`，禁止传播退化四边形。
7. 支持向前、向后和双向结果合并。
8. 支持用户在失败处修正四角，并只重算受影响区间。

后续如果传统方案对模糊、低纹理素材不够稳定，可在 provider 内替换或组合神经特征与匹配模型，UI、数据和渲染层不需要重写。

### 阶段 E：平面附件渲染

1. 把跟踪四角从源媒体坐标经过裁剪、旋转、缩放和媒体透视映射到画布。
2. 从种子帧和当前帧计算相对 Homography。
3. 将相对变换作用于贴纸初始四角，而不是覆盖用户的初始布局。
4. 复用现有 `MediaPerspective`、矩阵和 Canvas 网格渲染。
5. Web 预览、桌面预览和导出统一使用同一四角求值结果。
6. 对四角顺序、凸性、自交和接近零面积做保护。

### 阶段 F：缓存、工程保存与互操作

跟踪结果应作为 sidecar 保存，timeline 只保留稳定引用和摘要。缓存键至少包含：

- 媒体内容指纹。
- 源时间范围、裁剪、变速和倒放。
- 初始 bbox 或四角及种子 PTS。
- 跟踪方向。
- provider 与模型版本。
- 影响源像素几何的预处理版本。

素材替换、裁剪、变速、倒放、旋转或种子区域变化时必须使缓存失效。

Jianying draft 互操作应作为独立阶段：先用完整非空明文工程确认顶层所有权、ID 连接和时间单位，再实现只读导入，最后才考虑写出。不能依据符号名称猜测私有字段后直接生成工程。

## 11. 主要技术难点

1. **坐标空间组合**：源像素、裁剪后画面、媒体局部坐标、画布和导出分辨率必须有唯一转换顺序。
2. **时间映射**：裁剪、变速、倒放、VFR 视频和项目 FPS 会让“第 N 帧”等价关系失效，必须以 PTS 为主。
3. **双向跟踪合并**：种子附近不能跳变，正向和反向质量不同时需要明确选择策略。
4. **遮挡与丢失**：任务跑完不代表结果有效，状态和置信度必须进入产品模型。
5. **平面退化**：共线点、自交四边形、低内点率或极端透视会产生数值不稳定矩阵。
6. **二次编辑**：用户修正某帧后，哪些区间重算、已有结果如何保留，需要提前定义。
7. **预览与导出一致性**：如果两端各自插值或各自计算矩阵，会出现肉眼可见漂移。
8. **缓存失效**：漏掉任一影响源画面或时间的参数，都会复用错误轨迹。
9. **性能与取消**：长视频分析需要分段、进度、取消、后台执行和项目重开恢复。
10. **剪映完全一致性**：即使工程结构相同，私有模型权重、阈值、特征预处理和插值策略不同，也无法承诺逐像素或逐轨迹完全相同。

## 12. 验收标准

### UI 与状态

- 三种模式互斥，切换行为可撤销。
- 四点与矩形控制器在缩放、旋转和高 DPI 下命中正确。
- 运行、取消、失败、lost、重试和完成状态可保存并在重开后恢复。

### 算法

- 合成平移、缩放、旋转和透视夹具可计算已知真值误差。
- 模糊、遮挡、出画、低纹理和镜头切换不会产生无限值或自交四边形。
- 双向结果在种子帧连续。

### 时间与渲染

- 24/25/30/60 fps 及 VFR 输入按 PTS 对齐。
- 裁剪、变速、倒放、媒体旋转和已有透视变换组合正确。
- 预览、保存后重开和 MP4 导出使用同一轨迹，关键帧处无跳变。

### 对照验证

使用同一短视频、相同种子框或四点，在剪映与 QCut 分别运行：

- 对运动跟踪比较逐帧中心、宽高、角度和 lost 区间。
- 对平面跟踪比较逐帧四角误差、重投影误差和最终视觉贴合。
- 再做导出视频的对齐画面或差分比较。

这可以证明“行为接近”并定位偏差，但只有在持续测量达到阈值后，才能声明具体级别的兼容；不能仅凭 UI 相似就声称完美复刻。

## 13. 建议优先做的代表性功能

为了尽快得到可信的端到端结果，建议先选择三个把握较高的代表场景：

1. **运动跟踪：贴纸跟随清晰人物头部**

   复用现有人物蒙版，验证方向、锚点、缩放、保存和导出全链路。

2. **运动跟踪：贴纸跟随普通物体**

   先使用现有对象蒙版，再替换为专用单目标 provider，能够直接量化升级收益。

3. **平面跟踪：贴纸贴在清晰、纹理丰富、轻度透视的屏幕或路牌上**

   这是 LK 光流加 Homography 成功率最高的首个场景，适合验证四点 UI、结果格式和渲染组合。

第一版不要把无纹理墙面、长时间完全遮挡、强运动模糊和严重滚动快门作为通过条件；这些应作为后续鲁棒性里程碑，而不是阻塞公共架构落地。

## 14. 当前未知项与边界

- 剪映私有 `status` 数字的完整枚举仍未确认。
- 运动跟踪实际选择的具体模型别名与版本仍未做运行捕获。
- 平面跟踪的阈值、重检测策略、插值和平滑参数未知。
- 完整非空 draft 中 motion target/source 与 planar `surface_id` 的所有顶层连接仍需脱敏验证。
- 剪映模型和二进制只能用于本机只读研究，不能进入 QCut 仓库或发布包。

QCut 可以按上述公开算法和自身数据模型实现干净、可发布的同类能力；在缺少剪映私有模型、阈值和运行时细节的情况下，不应承诺 bit-exact 或逐像素完全复刻。
