# 逐项实现拆解

本文件说明剪映专业版 11.3.0 中“画面 > 基础”各项能力的实现边界。字段名和公开符号用于说明架构，不代表允许复制剪映私有实现或资源。

## 1. 位置大小

### 数据

- `clip.scale.x/y`：横纵缩放。
- `uniform_scale.on/value`：等比缩放开关和统一倍率。
- `clip.transform.x/y`：二维位置。
- `clip.rotation`：旋转角度。
- `clip.flip.horizontal/vertical`：翻转。
- `common_keyframes`、`keyframe_refs`：时间变化。

### 执行

这是标准二维合成变换。UI 修改参数后即可在当前帧重算矩阵，不需要生成新视频。对齐按钮本质是根据画布和变换后包围盒计算 `transform`。

## 2. 混合

混合由两部分组成：

1. `clip.alpha` 控制整体透明度。
2. `mix_mode` 效果把当前图层和下方合成结果送入混合着色器。

安装包的 `Resources/MixMode/MixMode.json` 列出了 10 个资源，包括正片叠底、颜色减淡、变暗、线性加深、柔光、滤色、叠加、变亮等。每项都带独立材质和着色器包。

**QCut 对应实现**：统一使用预乘 Alpha，明确源色/目标色的线性或 sRGB 空间，并为每种模式做透明边缘和 HDR 输入测试。

## 3. 变形

截图中的“变形”是四角自由拖动，不是美颜面板中的脸部手动形变。

- 视频素材保存 `corner_pin`。
- 四角分别对应左上、右上、左下、右下的相对偏移。
- UI 明确提示输入 `0` 可恢复角点。
- 该模式与位置/大小关键帧及部分动画互斥，说明内部需要单独的投影映射。

渲染可由四边形到矩形的单应矩阵或网格透视变换完成。角点越界时必须定义采样、透明区域和包围盒行为。

## 4. 视频防抖

草稿中的 `stable` 包含：

- `matrix_path`：分析产生的稳定矩阵序列。
- `stable_level`：裁切与稳定程度。
- `time_range`：有效区间。

运行库提供 `VideoStableClient::startVideoStabProcess`、取消接口和 `VideoClient::setVideoStable`。UI 提供“裁切最少”和“最稳定”等等级。

典型流水线：

1. 检测特征点或估计相机运动。
2. 平滑运动轨迹。
3. 对每帧应用逆向变换。
4. 根据等级计算动态裁切/缩放，避免黑边。
5. 把矩阵序列缓存，预览和导出复用。

## 5. 一键画质提升

这不是单一滤镜。UI 文案是“按素材属性开启画质增强、色彩增强、光影修复等功能”。运行包还存在以下来源标记：

- `is_image_quality_enhance_from_one_click`
- `is_motion_interpolation_from_one_click`
- `is_relight_from_one_click`
- `is_super_resolution_from_one_click`

因此它应被建模为一次分析和一组建议操作。关闭它时，剪映会提示已添加的画面提升效果将被关闭，这也说明子能力仍是独立状态。

**QCut 对应实现**：编排器只决定建议和参数，不拥有底层算法；结果应可展开、逐项关闭和撤销。

## 6. 超清画质

剪映明确显示授权说明：所选素材需要上传到服务器，处理完成后删除上传内容；素材最长 30 分钟。功能说明称它会综合提升分辨率、降噪、去频闪、人物清晰度和色彩。

草稿使用 `video_algorithm.quality_enhance`，运行库提供：

- `QualityEnhanceClient::startConvertQualityEnhance`
- `getQualityEnhancePath`
- `notifyQualityEnhanceComplete`
- `cancelQualityEnhance`

这表明服务端生成完成后，编辑器把结果作为派生视频路径接入时间线，而不是在导出阶段临时套一个 LUT。

## 7. 画面降噪

UI 提供两种模型：

- 本地：“在当前设备处理，速度更快”。
- 云端：“上传云端处理，效果更优”。

本地安装包含 `models/noise_reduction/nn_denoise.bytenn`。运行库具有开始、暂停、恢复、取消和结果路径查询接口，草稿保存 `video_algorithm.noise_reduction`；另有 `materials.realtime_denoises` 用于实时降噪状态。

**QCut 对应实现**：区分实时预览降噪与高质量离线降噪，避免预览参数无意中改变最终导出算法。

## 8. AI 补帧

UI 同样提供本地/云端模式，并明确说明本地更快、云端更流畅。

本地路径包含：

- `lens_vfi_v1.0.model`
- `umvfi.metallib`
- `liblens.dylib` 中的 UMVFI 3.2.0
- `bidir`、`bilat`、`cover`、`nn` 等执行模式

草稿同时保留 `complement_frame_config` 和 `smart_complement_frame`，对应常规本地补帧与服务器智能补帧。导出帧率高于素材帧率时，补帧结果才会被实际消费。

## 9. 补分辨率

UI 支持 2K 和 4K，有处理进度、取消、重复添加和冲突管理。草稿字段是 `video_algorithm.super_resolution`，运行库提供 `isSupportSuperResolution`、开始转换、完成通知和结果路径查询。

目前可以确认：

- 它是独立异步任务，而非播放器缩放。
- 它会产生可复用的结果路径。
- 编辑器会先做能力/素材检查。

目前不能仅凭静态证据确认 11.3.0 的所有模式都在本机执行，还是会按账号、硬件或实验组切换服务端。因此 QCut 设计应把执行位置留给 Provider，而不是写死。

## 10. 视频去频闪

本地 `liblens` 包含 Deflicker 2.0.0 和 Metal 后端，支持延迟型与闪烁型处理，并覆盖 NV12/RGBA 及多种位深。运行库提供完整的转换任务与结果路径接口。

该算法需要观察连续帧亮度变化，不适合做无状态单帧滤镜。合理实现是检测周期/突变、估计稳定曝光曲线，再做时域亮度或颜色补偿。

## 11. AI 消除

交互和生成分成两段：

1. 本地记录涂抹蒙版，或用智能选择辅助生成蒙版；本地缓存目录包括 `AIInpaintingSmartSelect` 和 `AIInpaintingMask`。
2. UI 明确提示素材将上传服务端，生成式修复结果异步返回。

草稿使用 `video_algorithm.ai_in_painting_config[]`。本地库中存在 DeepInpaint 能力，只能证明客户端具备相关预览/推理组件，不能推翻当前 UI 明示的服务端处理路径。

## 12. 运动模糊

UI 文案直接说明“使用光流法”。参数包括方向、模糊程度、融合程度和采样倍率；跨片段使用前需要建立复合片段。

草稿字段为 `motion_blur_config`。运行库提供 `MotionBlurClient::startConvertMotionBlur` 和结果路径查询。本地 Lens 后端显示它会用运动估计和双边融合一类的时域合成，而不是简单的方向模糊卷积。

## 13. 智能运镜

智能运镜的产物是可编辑的镜头运动：

- 草稿素材保存 `smart_motion`。
- `SmartMotion` 保存 `keyframes`、`motion_param`、`cache_path` 和启用状态。
- 运行库提供添加单个/临时关键帧以及重建关键帧接口。
- UI 参数包括移动距离、速度和缩放。

因此它的核心是识别主体/构图后生成平移和缩放关键帧。它与智能裁剪互斥，因为二者都会控制同一套空间构图。

## 14. AI 扩展

这是生成式画外扩展，不是普通背景填充。UI 明确提示素材会上传服务端，并支持提示词、重新生成和队列状态。

草稿通过 `video_algorithm.ai_background_configs[]` 保存任务和结果。QCut 必须同时保存源裁剪区域、目标比例、提示词、任务 ID、结果资产和内容安全状态，才能可靠重开草稿。

## 15. 镜头追踪

本地安装包含单目标跟踪、对象跟踪和显著性模型。运行库存在 V1/V2/V3 跟踪入口，结果对象包含：

- `map_path` / `result_path`
- 跟踪器数组
- 目标中心、宽高和旋转
- 缩放、相对距离及关键帧转换开关

这说明镜头追踪先获得目标轨迹，再把轨迹转换成画面位移/缩放，让主体保持在期望构图位置。它不是把贴纸绑定目标的普通“运动跟踪”，两者虽复用跟踪基础设施，但消费者不同。

## 16. 智能裁剪

智能裁剪会为目标比例生成随时间变化的裁剪窗口。安装包有：

- `lvop_intelligent_crop/algo`
- 显著性分割模型
- `saliencyseg_crop_script.model`
- `SmartCropClient::runSmartCropAlgorithm`

草稿将结果放在 `materials.smart_crops`。UI 还暴露目标比例和镜头位移速度，并与手动裁剪、防抖、智能运镜、运动跟踪、镜头追踪互斥。

## 17. 眼神修正

UI 说明只支持单一面部。安装包内存在眼部拟合、视线估计模型和本地 Bach 算法：

- `tt_eyegrad_v1.0.model`
- `tt_eyefitting_v1.0.model`
- `AlgorithmGazeEstimation`
- `AlgorithmEyeFitting`

草稿功能助手保存 `eye_correction` 和目标片段列表。当前静态证据证明客户端具备本地视线估计和眼部拟合能力，且未发现这一入口的上传授权提示；但还没有完成一次运行时调用跟踪，因此不把具体帧调度和所有模型版本写成定论。

## 18. AI 对口型

AI 对口型支持音频和文案模式。真人素材可能要求本人校验，校验照片明确上传服务端；UI 还存在生成队列、预计等待时间、积分和生成模式。

草稿使用 `video_algorithm.mouth_shape_driver`，并保存：

- 文案模式或音频模式参数
- 原始文件和原始片段时长
- 口型模式与提示词
- 服务端输出视频路径

运行库的 `setMouthShapeDriver` 和 `updateLipSyncOutputPath` 说明生成完成后通过派生视频替换/叠加口型结果。

## 19. 背景填充

背景填充是普通画布材质。`materials.canvases` 支持：

- `canvas_color`
- `canvas_image`
- `canvas_blur`

材质字段包括颜色、图片、模糊强度和来源信息，片段通过 `extra_material_refs` 引用。它在本地合成阶段渲染，不需要上传，也不会凭空生成画面内容。

## 建议的统一任务协议

QCut 的重型能力可以共享以下协议，但算法实现应保持独立：

```ts
type VideoAlgorithmJob = {
  id: string;
  kind: string;
  provider: "local" | "cloud";
  sourceFingerprint: string;
  parameters: Record<string, unknown>;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "canceled";
  progress: number;
  artifactPath?: string;
  analysisPath?: string;
  errorCode?: string;
};
```

需要额外保证：

- 缓存键包含源文件指纹、裁切时间、算法版本和参数。
- 源素材永远不被覆盖。
- 派生视频与分析轨迹分开存储。
- 保存重开后能恢复完成、失败和处理中状态。
- 导出前验证派生文件完整性，缺失时给出可操作错误。
- 本地和云端 Provider 使用同一 UI 状态机，但授权与计费状态独立。
