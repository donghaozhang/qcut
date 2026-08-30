# 证据、复查命令与未决项

## 证据等级

| 等级 | 含义 |
| --- | --- |
| 已证实 | UI 文案、草稿字段和运行库/模型至少两类证据相互吻合 |
| 强证据 | 静态结构完整，但尚未记录一次该功能的运行时调用链 |
| 推断 | 符合架构和行为，但缺少足够直接证据 |
| 未确认 | 当前证据不能安全区分多个实现路径 |

本文没有把“安装包中存在某个模型”单独当作功能完成证据。模型、UI、草稿字段、任务接口、实际预览和导出需要分别验证。

## 已检查的证据面

### 1. 产品与界面

- 剪映专业版：`/Applications/VideoFusion-macOS.app`
- Bundle：`com.lemon.lvpro`
- 版本：`11.3.0`
- 中文资源：`Contents/Resources/po/zh-Hans.po`
- 用户提供的两张“画面 > 基础”面板截图

本地化文案给出了本地/云端模式、上传授权、队列、冲突、时长限制和算法说明。其中最关键的明示证据包括：

- 超清画质：上传服务器处理。
- 画面降噪：本地和云端两种模式。
- AI 补帧：本地和云端两种模式。
- AI 消除、AI 扩展：上传服务端。
- 运动模糊：明确使用光流法。
- AI 对口型：服务端校验、队列和输出任务。

### 2. 草稿结构

只读检查了现有明文 `subdraft/draft_content.json`，没有修改个人项目。关键结构包括：

```text
tracks[].segments[].clip
tracks[].segments[].uniform_scale
tracks[].segments[].common_keyframes
materials.canvases
materials.smart_crops
materials.smart_relights
materials.video_trackings
materials.videos[].crop
materials.videos[].corner_pin
materials.videos[].stable
materials.videos[].smart_motion
materials.videos[].video_algorithm
```

`video_algorithm` 中观察到的槽位包括：

```text
ai_background_configs
ai_in_painting_config
complement_frame_config
deflicker
motion_blur_config
mouth_shape_driver
noise_reduction
quality_enhance
smart_complement_frame
super_resolution
```

这些字段在样本草稿中多数为默认空值，因此可以证明 schema 和所有权边界，但不能证明某一具体效果已在该草稿成功运行。

### 3. 本地运行库

`libvideoeditor.dylib` 暴露了对应任务接口：

```text
VideoStableClient::startVideoStabProcess
DeflickerClient::startConvertDeflicker
InterpolationClient::startConvertSlowMotion
MotionBlurClient::startConvertMotionBlur
NoiseReductionClient::startConvertNoiseReduction
QualityEnhanceClient::startConvertQualityEnhance
SuperResolutionClient::startConvertSuperResolution
SmartCropClient::runSmartCropAlgorithm
VideoClient::addVideoSmartMotion
VideoClient::setMouthShapeDriver
VideoClient::updateLipSyncOutputPath
```

大量任务还提供暂停、恢复、取消、完成通知或结果路径查询。这是“任务 + 派生结果 + 缓存”架构的直接证据。

运行时进程中还观察到独立 `--lvve-service`，说明算法执行与 UI/CEF 渲染进程分离。

### 4. 本地模型与 GPU 后端

与截图功能直接相关的安装资源包括：

```text
models/interpolation/lens_vfi_v1.0.model
models/umvfi/umvfi.bundle/umvfi.metallib
models/deflicker/deflicker.bundle/deflicker.metallib
models/noise_reduction/nn_denoise.bytenn
models/object_tracking/bingo_objectTracking_v1.0.dat
models/single_object_tracking_v1.0.model
models/saliency_seg_model/bingo_saliency_seg_v1.0.model
models/nh_script/saliencyseg_crop_script.model
models/idream/tt_eyegrad_v1.0.model
models/tt_eyefitting/tt_eyefitting_v1.0.model
```

`liblens.dylib` 还显示 UMVFI 3.2.0、Deflicker 2.0.0，以及 Metal、NV12/RGBA、多位深和多种补帧模式支持。

### 5. 混合模式资源

`Resources/MixMode/MixMode.json` 列出 10 个独立混合资源。每个资源都有材质、预制体和编译后的着色器。研究只记录名称和架构，不复制着色器内容。

## 可复查命令

以下命令均为只读：

```bash
plutil -extract CFBundleShortVersionString raw \
  /Applications/VideoFusion-macOS.app/Contents/Info.plist
```

```bash
rg -n -C 5 \
  'pc_smart_Image_quality|pc_feature_image_enhance|pc_new_denoise|pc_smart_frame|pc_super_resolution|pc_inpainting|pc_outpainting|pc_lipsync' \
  /Applications/VideoFusion-macOS.app/Contents/Resources/po/zh-Hans.po
```

```bash
nm -gU \
  /Applications/VideoFusion-macOS.app/Contents/Frameworks/libvideoeditor.dylib \
  | c++filt \
  | rg 'VideoStableClient|DeflickerClient|InterpolationClient|MotionBlurClient|NoiseReductionClient|QualityEnhanceClient|SuperResolutionClient|SmartCropClient|SmartMotion'
```

```bash
find /Applications/VideoFusion-macOS.app/Contents/Resources/models \
  -maxdepth 3 -type f \
  | rg 'vfi|deflick|denoise|track|saliency|eye'
```

草稿检查应只针对专用实验项目或明文副本，且只读取：

```bash
jq '{
  segment: ([.tracks[] | select(.type == "video") | .segments[]][0]
    | {clip, uniform_scale, common_keyframes, keyframe_refs}),
  video: (.materials.videos[0]
    | {crop, corner_pin, stable, smart_motion, surface_trackings, video_algorithm}),
  canvas: .materials.canvases[0]
}' /path/to/lab/subdraft/draft_content.json
```

## 尚未完全确认

### 补分辨率的实际部署位置

已确认它有本机能力检查、独立转换 Client、2K/4K 模式和结果路径；尚未通过网络隔离实验确定所有账号/硬件组合是否完全本地。文档因此不把它武断归为纯本地或纯云端。

### 眼神修正的完整帧调度

已确认本地视线估计、眼部拟合模型、单脸约束和草稿功能标记；尚未记录一次开关前后的库调用、缓存文件和导出差异。

### 精确渲染顺序

可以确定“派生媒体任务、分析元数据、实时空间合成”是不同阶段，但没有完成逐帧 hook 来证明每个子阶段的绝对顺序。QCut 设计时应通过显式渲染图定义顺序，而不是依赖 UI 的上下排列。

### 服务端模型和接口

静态包和授权文案足以判断某些功能需要上传，但本文不记录私有接口、鉴权参数或服务端模型名称，也不尝试绕过账号、会员、授权或内容安全限制。

## 后续运行时验证方案

为每项功能建立一个 8 到 12 秒、1080p、30 fps 的专用实验素材，并执行以下 E2E：

1. 记录源文件 `ffprobe`、首尾帧和哈希。
2. 在剪映中只开启一个功能，记录 UI 参数、耗时、CPU/GPU/网络活动和新增缓存。
3. 保存并关闭项目，重新打开确认状态和预览仍存在。
4. 导出同分辨率视频，检查时长、帧率、像素差和音画同步。
5. 对本地能力断网重跑；对云端能力验证授权拒绝、取消、失败、重试和队列恢复。
6. 重复相同参数，确认缓存命中且输出稳定。
7. 改一个参数，确认缓存键变化且旧结果不会被误用。

验收时必须分别报告：UI 可操作、草稿可持久化、任务成功、预览生效、导出生效、重开恢复和缓存复用。任何一项都不能替代其他项。
