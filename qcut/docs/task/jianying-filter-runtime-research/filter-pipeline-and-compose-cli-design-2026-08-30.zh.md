# QCut Filter Pipeline 与统一 Compose CLI 设计

日期：2026-08-30

## 结论

`qcut filter-lab pipeline` 已实现，用于把 2 到 16 张滤镜按命令顺序作用于同一张图片或同一段视频。它不生成剪映草稿，也不要求启动 QCut 编辑器：视频只解码一次、最终只编码一次；连续 FFmpeg 滤镜会融合成一个 graph，连续原生滤镜会共享一个有状态逐帧循环，两类后端可以交错。

`qcut compose validate/render/project` MVP 也已实现。滤镜属于 clip，转场属于两个相邻 clip 的边界，贴纸属于视频 overlay track，音效属于 audio track；四类资源由同一个 timeline manifest 描述。`render` 无头导出 MP4，`project` 复制用户媒体并生成可搬运、可重渲染的 compose 包。

当前边界：转场只支持 `crossfade`；贴纸和音效使用本地文件路径；`compose project` 还不能导入 QCut 编辑器时间线，含滤镜的包仍要求目标机器有对应的本地 Filter Lab 缓存。

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
~/Downloads/QCut-Filter-Category-Parity-2026-08-30/diagnostics
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

因此已增加更高层命令：

```bash
qcut compose validate --config edit.qcut-compose.json --json
qcut compose render --config edit.qcut-compose.json --output final.mp4 --json
qcut compose project --config edit.qcut-compose.json --project-dir ./editable-project --json
```

- `validate`：解析素材、滤镜精确版本、时间线和 runtime 能力；可选写出 lock。
- `render`：无头直接导出，不创建草稿；同时写出 lock 和 render report。
- `project`：复制用户媒体，改写相对路径，并生成 portable compose 包；当前不生成编辑器时间线或剪映草稿。

## Compose Manifest v1

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
      "preset": "crossfade",
      "duration": 0.5
    }
  ],
  "overlays": [
    {
      "type": "sticker",
      "source": "./badge.svg",
      "start": 1.2,
      "duration": 2.5,
      "transform": { "x": 0.8, "y": 0.2, "scale": 0.35, "rotation": 0 },
      "opacity": 1
    }
  ],
  "audio": [
    {
      "type": "sound-effect",
      "source": "./impact.wav",
      "start": 4.6,
      "trim": { "in": 0, "out": 1.5 },
      "volume": 0.8,
      "fadeIn": 0.02,
      "fadeOut": 0.08
    }
  ]
}
```

MVP 约束：1 到 8 个 clips；每个 clip 最多 16 张滤镜；最多 7 个转场、50 个贴纸和 50 个音效。贴纸支持 PNG、JPEG、WebP 和 SVG。验证阶段会检查 trim、相邻 clip、转场时长、时间线边界、素材可读性和滤镜本地 runtime。

## Compose Compiler 分层

1. **Normalize**：解析相对路径、timebase、trim、默认 canvas 和轨道顺序。
2. **Resolve**：把 resource ID 固定到精确版本、私有缓存路径、backend 和内容 digest。
3. **Validate**：检查 clip 邻接、转场长度、overlay 边界、音频范围、runtime readiness 和离线可用性。
4. **Prepare clips**：不同 clips 并发标准化；每个 clip 的 Filter Lab pipeline 保持内部顺序。
5. **Compile timeline**：视频 xfade/concat 与音频 acrossfade/concat 分成两个 FFmpeg graph 并发执行，再 stream-copy mux。
6. **Finish**：贴纸进入 overlay graph，音效按采样时间 trim、fade、delay 和 mix。
7. **Verify**：发布前验证分辨率、帧率、时长和音轨，并保留资源执行证据。
8. **Publish**：原子发布输出，并写出可复现的 `compose-lock.json` 与 `render-report.json`。

视频和音频时间线必须分开编译。本项目捆绑的 `ffmpeg-static` 在同一个 `filter_complex` 同时运行 `xfade` 与 `acrossfade` 时，视频会退化为硬切；拆分后逐帧证明确认为渐变，并且 mux 不再重编码。

## Compose 真实 E2E

证据目录：

```text
~/Downloads/QCut-Compose-E2E-2026-08-30
```

测试 manifest 同时包含：2 个 clips、3 次 Filter Lab 应用、1 个 crossfade、1 个 SVG 贴纸和 1 个 WAV 音效。使用的滤镜锁定为：

| Clip | 滤镜 | Resource ID | 强度 | Backend | Verification |
|---|---|---:|---:|---|---|
| landscape | 晴朗增蓝 | `7644886476886478116` | 65 | `ffmpeg-lut` | `close` |
| landscape | 情绪大片 | `7650536865895894282` | 25 | `ffmpeg-lut` | `close` |
| portrait | 情绪大片 | `7650536865895894282` | 55 | `ffmpeg-lut` | `close` |

真实执行：

```bash
qcut compose validate \
  --config ~/Downloads/QCut-Compose-E2E-2026-08-30/edit.qcut-compose.json \
  --output ~/Downloads/QCut-Compose-E2E-2026-08-30/validate-lock.json \
  --json

qcut compose render \
  --config ~/Downloads/QCut-Compose-E2E-2026-08-30/edit.qcut-compose.json \
  --output ~/Downloads/QCut-Compose-E2E-2026-08-30/final-compose.mp4 \
  --json --force

qcut compose project \
  --config ~/Downloads/QCut-Compose-E2E-2026-08-30/edit.qcut-compose.json \
  --project-dir ~/Downloads/QCut-Compose-E2E-2026-08-30/portable-project \
  --json --force

qcut compose render \
  --config ~/Downloads/QCut-Compose-E2E-2026-08-30/portable-project/compose.json \
  --output ~/Downloads/QCut-Compose-E2E-2026-08-30/portable-rerender.mp4 \
  --json --force
```

结果：

| 检查 | 结果 |
|---|---|
| 最终视频 | H.264、640x360、24 fps、3.750 s、90 帧、AAC 音轨 |
| 四类资源 | 滤镜、crossfade、SVG 贴纸、WAV 音效均进入最终输出 |
| clip 准备 | 2 个 clips 并发执行 |
| crossfade | 5 张连续帧显示从 A 到 B 的渐进混合，不是硬切 |
| 滤镜像素变化 | PSNR `27.258164`、SSIM `0.941487`，确认不是旁路 |
| portable project | 4 个用户素材复制到 `assets/`，manifest 只使用相对路径 |
| 重渲染一致性 | 原输出与 portable 重渲染 SHA-256 均为 `9e0db416e0c0a0853a011b67534e9a851a449c2902ccab67f65004367ae02027` |

主要证据：`final-compose.mp4`、`fixed-transition-sequence.png`、`filter-before-after.png`、`audio-spectrogram.png`、`final-compose.compose-lock.json`、`final-compose.render-report.json` 和 `portable-project/`。

## 关键产品决定

- 默认直接导出，不生成任何草稿。
- 需要搬运或稳定重渲染时显式使用 `compose project`；`project.json` 明示 `editorTimelineImportSupported: false`。
- 所有资源必须锁定 ID、版本和 digest，避免同名卡或缓存更新导致结果漂移。
- 不把 `cached` 当作 `verified`；报告必须分别保留 cacheStatus、backend、fidelity 和 verification。
- 转场持续时间必须从两侧 clip 的可用帧中扣除，不能简单作为第三段视频追加。
- 贴纸坐标应使用标准化 canvas 坐标，项目生成和无头导出共享同一套变换语义。
- 音效以采样时间为准，最后再对齐视频 timebase，避免 29.97/30 fps 累积漂移。

## 当前状态与下一步

1. 已完成：多滤镜一次解码、一次编码 pipeline。
2. 已完成：本地 clips、Filter Lab cards、crossfade、本地静态贴纸、本地音效统一渲染。
3. 已完成：`compose-lock.json`、render report、dry-run、原子输出和 portable project。
4. 待完成：Sticker Lab 与 Sound Effects Lab 的 resource ID resolver 和私有离线缓存。
5. 待完成：Transition Lab/Jianying-local preset 接入；当前仅支持 crossfade。
6. 待完成：从 portable compose manifest 创建可在 QCut UI 继续编辑的 timeline state。
7. 待优化：减少 normalize、Filter Lab 和 finishing 间的中间编码 pass；现阶段优先保证资源语义与可复现性。
