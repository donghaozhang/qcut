# QCut 渲染管线优化：音频按需 Worklet 与贴纸并发准备

## 范围与基线

- 分支：`codex/render-pipeline-optimization`
- 固定基线：`2b9f355bd7accfd24a0e02a584e6ab6f223853d0`
- 基线 worktree：`/Users/peter/Desktop/code/qcut-render-pipeline-baseline-wt/qcut`
- 优化 worktree：`/Users/peter/Desktop/code/qcut-render-pipeline-opt-wt/qcut`
- 没有委派给 Claude，也没有改动原工作区中的 Compose WIP。

两边都从同一个父提交构建。基线 worktree 只临时复制了 benchmark 和探针代码，
没有复制生产优化。每个方案分别跑三轮真实 Electron E2E，本文用三轮中位数，
不使用单次最好成绩。

## 优化一：音频变调按需加载

### 原问题

`media-audio-preview-graph.ts` 原来会为每个预览媒体元素立即注册
`FormantCorrectionNode` processor，并创建一颗 pitch Worklet 节点。即使项目从未
启用变调，节点也会进入音频图，并在每次预览更新中收到参数写入。

### 实现

默认播放不再加载 pitch 模块。只有状态同时满足以下条件时才初始化：

1. `settings.pitch.enabled === true`
2. `Math.abs(settings.pitch.semitones) >= 0.01`

首次触发后：

- 动态加载 `@soundtouchjs/formant-correction-worklet`；
- 每个 `AudioContext` 只注册一次 processor；
- 每个真正使用 pitch 的媒体元素只创建一颗节点；
- 异步初始化完成后重新应用最新状态，避免加载期间的参数变化丢失；
- 加载期间保持 dry signal，失败时沿用 `unavailable` 回退状态。

没有从预览图 `WeakMap` 中删除媒体元素。浏览器通常不允许同一个媒体元素在同一
context 中重复创建 `MediaElementAudioSourceNode`，删除后再次 acquire 可能让预览
永久回退。

## 优化二：贴纸准备并发、画布合成串行

### 原问题

时间线贴纸原来在主合成循环中逐张 `await`。动态 GIF、atlas、PNG sequence 和
alpha-video 的资源解析与帧准备彼此独立，但六张贴纸会把六段等待串起来。

### 实现

- 每帧先收集活跃时间线贴纸；
- 资源解析、图片加载和 runtime frame 准备使用有界并发，最大并发为 `6`；
- 所有 `drawImage` 仍按原始时间线合成顺序串行执行，保持 z-order；
- 所有准备任务先把成功或错误收敛为结果，避免未等待任务产生 unhandled rejection；
- 错误仍在对应贴纸原本的合成位置抛出；
- 静态图片增加共享的 in-flight load，重复 URL 不会并发创建多个 `Image` 请求；
- `ctx.restore()` 放在 `finally` 中，绘制失败也不会污染后续画布状态。

单元测试使用八张延迟图片证明：同时加载的峰值严格为 `6`，而八次
`drawImage` 的顺序与时间线合成顺序一致。

## 真实 Electron E2E 方法

### 贴纸导出

每轮依次导出五个场景：无贴纸、单静态贴纸、三张重叠贴纸、单动态 runtime、
六张动态 runtime。每个输出均为：

- `1280x720`
- `30 fps`
- `6 秒 / 180 帧`
- 带音频

门禁同时检查输出文件、ffprobe 元数据、帧数、非空像素和探针结果。三轮 baseline
与三轮 optimized 全部通过。

六张动态 runtime 是本次并发优化的目标压力场景：

| 指标（三轮中位数） | Baseline | Optimized | 变化 |
| --- | ---: | ---: | ---: |
| 端到端导出 wall time | 1906.295 ms | 1675.370 ms | **-12.11%** |
| 每帧 p95 | 11.320 ms | 9.470 ms | **-16.34%** |
| `render-frame` 累计 | 986.905 ms | 308.985 ms | **-68.69%** |
| 串行 `sticker-timeline` 等待 | 720.010 ms | 20.545 ms | **-97.15%** |

相对同一轮“无贴纸”场景，六动态贴纸增加的 wall time 中位数从
`310.710 ms` 降到 `9.085 ms`，减少 `97.08%`。optimized 第一轮仍有明显冷缓存
离群值，因此最终结论采用三轮中位数。

并发阶段的 profiler 累计时间会互相重叠，不能与 wall time 相加。优化后编码器更早
收到帧，等待位置也从 `render-frame` 移到 `mp4-finalize`：finalize 中位数从
`33.355 ms` 变为 `763.720 ms`。这不代表 finalize 本身退化了约 730 ms；总 wall
time 才是跨流水线阶段可比较的主指标。

其他场景的 wall time 中位数如下：

| 场景 | Baseline | Optimized | 变化 |
| --- | ---: | ---: | ---: |
| 无贴纸 | 1614.795 ms | 1661.315 ms | +2.88% |
| 单静态贴纸 | 1622.920 ms | 1727.445 ms | +6.44% |
| 三张重叠贴纸 | 1710.850 ms | 1766.760 ms | +3.27% |
| 单动态 runtime | 1634.585 ms | 1679.065 ms | +2.72% |
| 六动态 runtime | 1906.295 ms | 1675.370 ms | **-12.11%** |

“无贴纸”也出现了 `+2.88%`，说明这些轻场景的 45-105 ms 差值主要落在 Electron、
系统负载和异步编码 finalizer 的运行间抖动内。当前证据只能证明多张独立动态贴纸
显著受益，不能声称单贴纸或无贴纸场景变快。

报告：

- Baseline：`output/playwright/sticker-export-benchmark/sticker-benchmark-baseline*.json`
- Optimized：`output/playwright/sticker-export-benchmark/sticker-benchmark-optimized*.json`

### 音频实时预览

每轮依次运行 1、4、8、8 muted control、16 个重叠音频层。每个场景播放 3 秒，
并验证 pause/resume、四次 seek 和主时钟健康状态。三轮 baseline 与三轮 optimized
全部通过。

默认无变调场景的结构差异是确定性的：

| 指标（完整一轮） | Baseline | Optimized |
| --- | ---: | ---: |
| pitch Worklet module 注册 | 1 | **0** |
| pitch Worklet 节点连接（累计） | 37 | **0** |

`per clip / per tick` 表示每个预览时钟 tick 的 `AudioParam` 调度写入次数，不是耗时：

| 场景 | Baseline | Optimized | 变化 |
| --- | ---: | ---: | ---: |
| 1 层 | 31.264 | 28.188 | -9.84% |
| 4 层 | 31.011 | 27.901 | -10.03% |
| 8 层 | 30.986 | 27.910 | -9.93% |
| 8 层静音控制 | 30.904 | 27.885 | -9.77% |
| 16 层 | 30.947 | 27.853 | -10.00% |

被探针包裹的 AudioParam 方法累计 JS 时间在五个场景中下降 `2.06%-15.19%`，
下降比例中位数为 `10.47%`。启动延迟则没有稳定方向：8 层和静音控制较快，
1/4/16 层较慢，16 层中位数为 `38.23 -> 45.47 ms`。因此这里只认定“普通播放
少创建 Worklet、少约 10% 参数写入”，不认定启动延迟或整进程 CPU 已稳定改善。

报告：

- Baseline：`output/playwright/audio-preview-benchmark/audio-preview-baseline-*.json`
- Optimized：`output/playwright/audio-preview-benchmark/audio-preview-optimized-*.json`

## 正确性与构建验证

已验证：

- 默认无 pitch 不导入、不注册、不创建 Worklet；
- 有效 pitch 首次出现时进入 loading，连续更新只初始化一次；
- 初始化完成后应用最新 formant 和 playback rate；
- 八张贴纸准备峰值并发为 6，最终绘制顺序不变；
- 六轮贴纸导出 E2E 全部生成可探测、非空、带音频的视频；
- 六轮音频预览 E2E 的播放、暂停、恢复、seek 和时钟门禁全部通过；
- Web production build 与 Electron build 均通过。

本机安装依赖时使用了 `--ignore-scripts`，第一次 Electron E2E 因本地 Electron binary
尚未下载而无法启动。运行 `node node_modules/electron/install.js` 后，基线和优化两边
都正常执行；这属于 worktree 环境准备，不是产品运行失败。Playwright 的失败录像
辅助路径仍会报告缺少 `ffmpeg-static`，但被测导出使用系统 FFmpeg，实际 MP4 与
ffprobe/像素门禁均通过。

## 结论

本轮有两个可复现收益：

1. 默认无变调预览彻底不创建 pitch Worklet，参数调度写入稳定减少约 10%。
2. 六张独立动态贴纸的真实 Electron 导出 wall time 中位数减少 12.11%，每帧 p95
   减少 16.34%，且输出与合成顺序门禁通过。

它不是“整个导出系统普遍快 12%”。单贴纸、无贴纸、音频启动时间和进程 CPU 尚无
稳定提升证据。

## 下一步优先级

### P1：编码器 backpressure 与 finalize

贴纸并发后，主要等待转移到 YUV/encoder/finalize。下一步应记录生产者提交帧与编码器
消费帧的队列深度、等待时间和内存峰值，再决定批量提交还是主动背压；不能只看某个
stage 的累计值。

### P1：GPU readback stall

当前 GPU buffer 使用和读回路径仍可能强制等待。先分别记录 GPU 绘制、readback、
YUV 转换耗时与 fence 等待，再测试 staging buffer/ring buffer，保持逐帧 hash 门禁。

### P1：其余音频支路按需构建

reverb、echo、telephone 的节点在普通播放中仍会创建。应逐个延迟构建，并验证效果
开关瞬间无爆音、无重复连接、seek/reopen 行为一致。

### P2：预览与导出的统一基准

继续把转场、滤镜、特效、文字和贴纸放入同一固定素材、固定提交、冷/热启动分开的
benchmark，统一记录 wall time、每帧 p50/p95、decode/prepare/composite/encode、
资源创建次数，以及输出帧 hash、音频峰值与时长。
