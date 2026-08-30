# QCut Filter Pipeline 与统一 Compose CLI 设计

日期：2026-08-30

## 结论

`qcut filter-lab pipeline` 已实现，用于把 2 到 16 张滤镜按命令顺序作用于同一张图片或同一段视频。它不生成剪映草稿，也不要求启动 QCut 编辑器：视频只解码一次、最终只编码一次；连续 FFmpeg 滤镜会融合成一个 graph，连续原生滤镜会共享一个有状态逐帧循环，两类后端可以交错。

滤镜、转场、音效和贴纸不能继续塞进纯滤镜命令。滤镜属于 clip，转场属于两个相邻 clip 的边界，贴纸属于视频 overlay track，音效属于 audio track。它们应由更高层的 `qcut compose` timeline recipe 描述，再选择无头直接导出或生成可继续编辑的 QCut 项目。

## 已实现命令

每一步独立指定强度：

```bash
qcut filter-lab pipeline \
  --filter-step 7644886476886478116:70 \
  --filter-step 7650536865895894282:35 \
  -i input.mp4 \
  --output filtered.mp4 \
  --json
```

多张滤镜使用同一强度：

```bash
qcut filter-lab pipeline \
  --resource-id 7644886476886478116 \
  --resource-id 7650536865895894282 \
  --filter-intensity 60 \
  -i input.mp4 \
  --output filtered.mp4 \
  --json
```

约束：

- 至少 2 步，最多 16 步。
- `--filter-step` 的格式为 `<resource-id>[:<0..100>]`。
- `--filter-step` 和 `--resource-id` 不能混用。
- 图片输出为 PNG，视频输出为 MP4。
- `--dry-run` 会解析每张卡的精确版本、backend、fidelity 和 verification，但不生成媒体。
- 输出先写入同目录临时文件，验证分辨率、时长、帧率、音频和非空文件后再发布。

## 渲染结构

```text
source media
  -> one FFmpeg RGBA decoder
  -> ordered raw-frame stages
       -> fused FFmpeg filter group
       -> stateful native filter group
       -> fused FFmpeg filter group
  -> one final PNG/MP4 encoder
  -> output verification
  -> atomic publish
```

原生 tracker、segmentation 和跨帧 cache 是有状态的，因此同一个原生 Session 内保持逐帧串行。不同原生滤镜可以在同一帧中按 pipeline 顺序串联，但不能为了速度乱序并发。

## 真实 E2E

证据目录：

```text
/Users/peter/Downloads/QCut-Filter-Category-Parity-2026-08-30/diagnostics
```

结果：

| 测试 | 结果 |
|---|---|
| 两张单 LUT 图片 pipeline | 成功 |
| pipeline 与传统两次 PNG 渲染逐像素对比 | PSNR `inf`，像素一致 |
| 两张单 LUT 视频 pipeline | `1.000000s`、30 fps、30/30 帧 |
| LUT 后接原生 Face AI 图片 | 成功 |
| LUT 后接原生 Face AI 视频 | `1.000000s`、30 fps、30/30 帧 |
| 带 AC3 音轨的视频 | 输出 `audioPreserved: true` |

主要输出：

```text
filter-pipeline-two-lut.png
filter-pipeline-two-lut.mp4
filter-pipeline-lut-face-ai.png
filter-pipeline-lut-face-ai.mp4
filter-pipeline-two-lut-audio.mp4
```

## 为什么统一编辑需要 Timeline Recipe

下面四类资源的时间语义不同：

| 类型 | 归属 | 必需时间信息 |
|---|---|---|
| Filter | 单个 clip | filter 顺序、强度、可选局部时间范围 |
| Transition | 两个相邻 clip | 左右 clip、切点、持续时间 |
| Sticker | overlay track | start、duration、位置、缩放、旋转、透明度 |
| Sound effect | audio track | start、trim、duration、音量、fade、ducking |

所以推荐的新命令不是继续扩展 `filter-lab pipeline`，而是：

```bash
qcut compose validate --config edit.qcut-compose.json --json
qcut compose render --config edit.qcut-compose.json --output final.mp4 --json
qcut compose project --config edit.qcut-compose.json --project-dir ./editable-project --json
```

- `validate`：只解析资源、版本、时间线和 runtime 能力。
- `render`：无头直接导出，不创建草稿。
- `project`：生成 QCut 自己的可编辑项目，不生成剪映草稿。

## 建议 Manifest

```json
{
  "schemaVersion": 1,
  "canvas": { "width": 1920, "height": 1080, "fps": 30 },
  "clips": [
    {
      "id": "clip-a",
      "source": "./a.mp4",
      "trim": { "in": 0, "out": 5 },
      "filters": [
        { "resourceId": "7644886476886478116", "intensity": 70 },
        { "resourceId": "7131507906737917220", "intensity": 40 }
      ]
    },
    {
      "id": "clip-b",
      "source": "./b.mp4",
      "trim": { "in": 1, "out": 7 },
      "filters": []
    }
  ],
  "transitions": [
    {
      "between": ["clip-a", "clip-b"],
      "preset": "jianying-local-traverse-3",
      "duration": 0.5
    }
  ],
  "overlays": [
    {
      "type": "sticker",
      "resourceId": "sticker-resource-id",
      "start": 1.2,
      "duration": 2.5,
      "transform": { "x": 0.8, "y": 0.2, "scale": 0.35, "rotation": 0 },
      "opacity": 1
    }
  ],
  "audio": [
    {
      "type": "sound-effect",
      "resourceId": "sound-resource-id",
      "start": 4.6,
      "trim": { "in": 0, "out": 1.5 },
      "volume": 0.8,
      "fadeIn": 0.02,
      "fadeOut": 0.08
    }
  ]
}
```

## Compose Compiler 分层

1. **Normalize**：解析相对路径、timebase、trim、默认 canvas 和轨道顺序。
2. **Resolve**：把 resource ID 固定到精确版本、私有缓存路径、backend 和内容 digest。
3. **Validate**：检查 clip 邻接、转场长度、overlay 边界、音频范围、runtime readiness 和离线可用性。
4. **Compile video**：每个 clip 编译滤镜 pipeline，转场连接相邻 clip，贴纸进入 overlay graph。
5. **Compile audio**：源音频、音效、fade、音量与 ducking 编译成独立 audio graph。
6. **Render**：每个输入只按需要解码，最终视频和音频各编码一次并 mux。
7. **Verify**：验证时长、帧率、帧数、音轨、黑帧/静帧异常和资源执行证据。
8. **Publish**：原子发布输出，并写出可复现的 `compose-lock.json` 与 `render-report.json`。

## 关键产品决定

- 默认直接导出，不生成任何草稿。
- 需要继续编辑时显式使用 `compose project`，只生成 QCut 项目。
- 所有资源必须锁定 ID、版本和 digest，避免同名卡或缓存更新导致结果漂移。
- 不把 `cached` 当作 `verified`；报告必须分别保留 cacheStatus、backend、fidelity 和 verification。
- 转场持续时间必须从两侧 clip 的可用帧中扣除，不能简单作为第三段视频追加。
- 贴纸坐标应使用标准化 canvas 坐标，项目生成和无头导出共享同一套变换语义。
- 音效以采样时间为准，最后再对齐视频 timebase，避免 29.97/30 fps 累积漂移。

## 推荐实现顺序

1. 已完成：多滤镜一次解码、一次编码 pipeline。
2. Compose MVP：本地 clip、现有 Transition Lab preset、本地 PNG/WebM 贴纸、本地音频文件。
3. 接入 Sticker Lab 与 Sound Effects Lab 的 resource ID resolver 和私有离线缓存。
4. 增加 `compose-lock.json`、dry-run 执行计划和失败恢复。
5. 增加 `compose project`，让同一 manifest 可以生成可编辑 QCut 项目。
6. 最后接入依赖剪映原生 runtime 的转场和贴纸，并分别保留兼容性门禁。
