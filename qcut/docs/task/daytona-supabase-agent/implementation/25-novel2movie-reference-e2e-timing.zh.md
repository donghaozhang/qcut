# Novel2Movie Reference E2E 时间分析

日期：2026-05-21

被测命令：

```bash
qcut flow novel2movie --novel story.txt --max-scenes 20 --max-clips 5
```

场景：中式 / 东亚 K-pop 超模时装故事，两个成年角色：Lin Yue 和 Park Mina。

输出：

- 本地运行目录：`/tmp/qcut-kpop-asian-ref-e2e/output/story_202605210740`
- 下载的 artifact 目录：`/Users/peter/Downloads/qcut-kpop-asian-ref-e2e-artifacts`
- Final movie：`/Users/peter/Downloads/qcut-kpop-asian-ref-e2e-artifacts/final_movie.mp4`
- Reference audit：`/Users/peter/Downloads/qcut-kpop-asian-ref-e2e-artifacts/videos/Shanghai_Neon_Runway/video_reference_audit.json`

## 结果

运行成功完成。

- Scripts：1
- Shots：5
- Storyboard 图片：5
- Video clips：5
- Final video 时长：52.2 秒
- Final video 大小：50 MB
- QCut 报告的 provider 总成本：`$15.888`
- Summary errors：`[]`

## Reference 使用

视频阶段使用 `storyboard+references` 模式。

| Clip | Storyboard image | Portrait reference count | 备注 |
| --- | --- | ---: | --- |
| `SHOT_001` | yes | 0 | 建立/环境镜头，没有角色 ref |
| `SHOT_002` | yes | 1 | 单角色 reference |
| `SHOT_003` | yes | 1 | 单角色 reference |
| `SHOT_004` | yes | 2 | 多 reference：Lin Yue + Park Mina |
| `SHOT_005` | yes | 2 | 多 reference：Lin Yue + Park Mina |

这证明目标路径在单个视频 clip 带多个 portrait reference 时工作正常：

```text
storyboard image + Lin Yue portrait + Park Mina portrait
```

## 各阶段时间

下面的时间来自 `summary.json`、文件 mtime 和实时命令日志。由于 CLI 还没有持久化每个阶段的时间戳，数据为近似值。

| 阶段 | 证据 | 大约时间 | 并发？ | 备注 |
| --- | --- | ---: | --- | --- |
| Setup / novel save | `summary.started_at` 00:40:24, `novel.txt` 00:40:24 | <1s | 否 | 仅本地文件准备 |
| 角色抽取 | `characters.json` 00:40:28 | ~4s | 否 | 一次 LLM 调用 |
| Portrait 生成 | portrait 文件 00:41:06 和 00:41:07 | ~39s | 是 | 两个角色 portrait 并发跑；输出相差 1s |
| Script 切分 | `scripts/chunk_001.json` 00:41:12 | ~5s | 否 | 一次 LLM segmentation |
| Storyboard 生成 | 第一张 storyboard 00:41:54，最后一张 00:42:30 | ~78s | 是 | 5 个图片任务以 concurrency 5 跑 |
| Video `SHOT_001` | video 文件 00:47:59 | ~5m29s | 否 | 视频生成等待完成才开始下一个 |
| Video `SHOT_002` | video 文件 00:53:10 | ~5m11s | 否 | 串行 |
| Video `SHOT_003` | video 文件 00:57:55 | ~4m45s | 否 | 串行 |
| Video `SHOT_004` | video 文件 01:03:39 | ~5m44s | 否 | 串行，使用 2 个 portrait reference |
| Video `SHOT_005` | video 文件 01:10:37 | ~6m58s | 否 | 串行，使用 2 个 portrait reference |
| 合并 final movie | `final_movie.mp4` 01:10:37 | <1s | 否 | 此次的 FFmpeg concat 成本很低 |

总 wall time：30m13s（`2026-05-21T07:40:24Z` 到 `2026-05-21T08:10:37Z`）。

## 为什么花了这么久

主要成本是远端 Seedance Ref2V 视频生成。当前 `CameraImageGenerator` 串行处理视频：

```text
for each shot:
  await videoAdapter.generate(...)
```

也就是 5 个远端任务被序列化。之前的 portrait 和 storyboard 阶段已经用了并发，但视频阶段没有。

## 本次 E2E 通过前做的修复

- `novel2movie` 现在默认使用 `imarouter_seedance_2_0_ref2v`，这样命令可以消费多个 reference 而不需要 `--video-model`。
- Video mode 默认是 `storyboard+references`。
- Camera 生成会写 `video_reference_audit.json`，记录每个镜头的源图片、reference 数量和 reference URL。
- 角色 portrait registry 在可用时存储 provider URL，使得视频 reference asset 创建可以避免本地上传凭证过期。
- 当主图片模型不支持 reference edit 时，storyboard reference 生成会 fallback 到 `gpt_image_2_ima`。
- IMA Router Seedance Ref2V 默认设置 `metadata.audio=false`，避免无关的音频内容审核失败。
- 视频和 storyboard 失败现在会传播到 pipeline 的 `errors`；失败的视频运行不应返回虚假的 success 结果。

## 后续

如果想让这条命令在 `--max-clips 5` 时更快，下一步工程要做的是有界视频并发，大致是 `--video-concurrency`，默认 1，硬上限 2 或 3。这需要考虑 provider 成本，因为并发 Seedance 任务会更快消耗 credit，也可能撞到上游限流。

## 并发视频实验

为 `CameraImageGenerator` 实现了有界视频并发。

新增 CLI 选项：

```bash
qcut flow novel2movie --novel story.txt --max-scenes 20 --max-clips 2 --video-concurrency 2
```

默认值和上限：

- 默认 `video_concurrency`：`1`
- 硬上限：`6`
- `novel2movie` 优先使用 `--video-concurrency`
- 现有通用 `--concurrency` 也作为 fallback 接受
- 即使远端任务乱序完成，输出视频和 `video_reference_audit.json` 仍按 script shot 顺序

真实 E2E 命令：

```bash
bun /Users/peter/Desktop/code/qcut/qcut/electron/native-pipeline/cli/cli.ts \
  flow novel2movie \
  --novel story.txt \
  --max-scenes 20 \
  --max-clips 2 \
  --video-concurrency 2 \
  -o /tmp/qcut-kpop-parallel-e2e/output \
  --json
```

真实 E2E 输出：

- 运行目录：`/tmp/qcut-kpop-parallel-e2e/output/story_202605211559`
- 下载的 artifact 目录：`/Users/peter/Downloads/qcut-kpop-parallel-e2e-artifacts`
- Final movie：`/Users/peter/Downloads/qcut-kpop-parallel-e2e-artifacts/final_movie.mp4`
- Final 时长：22.08 秒
- Final 大小：31 MB
- 生成 clip：2
- QCut 报告的 provider 成本：`$6.762`
- Summary errors：`[]`

日志证据：

```text
[camera_gen] Running 2 video task(s) with concurrency 2
[camera_gen] SHOT_001: video refs=0, storyboard=yes
[camera_gen] SHOT_005: video refs=2, storyboard=yes
[vimax.video] imarouter_seedance_2_0_ref2v: 100% completed
[vimax.video] imarouter_seedance_2_0_ref2v: 100% completed
```

这确认了两段 clip 在视频阶段并发提交。

时间：

| 阶段 | 证据 | 大约时间 | 并发？ | 备注 |
| --- | --- | ---: | --- | --- |
| 整个命令 | `/usr/bin/time`：`real 984.65` | 16m25s | 混合 | 全流程，包括 LLM/图片/视频 |
| 角色抽取 | `characters.json` 08:59:37 | ~4s | 否 | 一次 LLM 调用 |
| Portrait 生成 | portrait 文件 09:00:07 和 09:00:10 | ~33s | 是 | 两个 portrait 任务重叠 |
| Storyboard 生成 | storyboard 文件 09:00:45 和 09:01:21 | ~71s | 是 | 两个图片任务，concurrency 2 |
| 视频生成 | `SHOT_001` 09:11:10，`SHOT_005` 09:15:58 | ~14m37s | 是 | 同时启动，但一个 provider 任务完成时间晚很多 |
| 合并 final movie | final movie 09:15:58 | <1s | 否 | 本地 concat 很便宜 |

Reference audit：

| Clip | Storyboard image | Portrait reference count | 备注 |
| --- | --- | ---: | --- |
| `SHOT_001` | yes | 0 | 建立/环境镜头 |
| `SHOT_005` | yes | 2 | 多 reference：Lin Yue + Park Mina |

结论：在 IMA Router Seedance Ref2V 上并发 clip 生成可用，但 provider 仍可能让一个任务比另一个晚很多才完成或排队。生产环境默认 `1` 仍然最稳；当用户主动请求且能接受成本/限流风险时，可以用 `--video-concurrency 2` 加速。
