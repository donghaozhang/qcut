# Luma Agents Ray 3.2 集成笔记

官方文档检查时间：2026-06-10

- https://docs.agents.lumalabs.ai/
- https://docs.agents.lumalabs.ai/guides/model/
- https://docs.agents.lumalabs.ai/guides/videos/generation/
- https://docs.agents.lumalabs.ai/guides/rate-limits/
- https://docs.agents.lumalabs.ai/guides/error-handling/

## 为什么相关

Luma Agents 用同一套异步 REST API 做图片和视频生成。对 QCut/Daytona 这条线，重点模型是 `ray-3.2`，它支持文生视频、图生视频、基于已有 generation 延长视频、视频编辑、视频重构比例。

它的运行形态和当前 Daytona agent 很接近：

1. 提交 generation request。
2. 轮询 generation，直到 `completed` 或 `failed`。
3. 从 presigned URL 下载输出。
4. 把生成资产保存到 sandbox output 目录。

因此 Luma 可以放到现有媒体生成 agent 流程后面，既可以做 queued job，也可以做 terminal-driven 的 agent 命令。

## API 形态

Base URL:

```text
https://agents.lumalabs.ai/v1
```

鉴权：

```text
Authorization: Bearer $LUMA_AGENTS_API_KEY
```

核心 endpoint:

| Method | Path | 用途 |
|---|---|---|
| `POST` | `/v1/generations` | 提交图片/视频生成、编辑、reframe 任务。 |
| `GET` | `/v1/generations/{generation_id}` | 轮询状态并获取输出 URL。 |

如果是代表 QCut 用户发起请求，建议传稳定、不含 PII 的 `user_id`，用于用量归因和 trust/safety 归因。

## Ray 3.2 视频请求

最小文生视频请求：

```json
{
  "model": "ray-3.2",
  "type": "video",
  "prompt": "A slow dolly shot through a misty greenhouse at sunrise",
  "aspect_ratio": "16:9",
  "video": {
    "resolution": "720p",
    "duration": "5s"
  },
  "user_id": "qcut-user-or-project-id"
}
```

图生视频可以在 `video.start_frame` 和/或 `video.end_frame` 里传入锚点图片：

```json
{
  "model": "ray-3.2",
  "type": "video",
  "prompt": "The character turns to face the camera and smiles",
  "aspect_ratio": "16:9",
  "video": {
    "resolution": "720p",
    "duration": "5s",
    "start_frame": { "url": "https://example.com/opening-frame.jpg" },
    "end_frame": { "url": "https://example.com/closing-frame.jpg" }
  }
}
```

## Ray 3.2 支持参数

| 字段 | 说明 |
|---|---|
| `model` | 视频使用 `ray-3.2`。 |
| `type` | 生成视频使用 `video`；视频编辑和比例重构分别用 `video_edit` / `video_reframe`。 |
| `prompt` | 必填，1-6,000 字符；需要描述主体、运动、镜头、光线和节奏。 |
| `aspect_ratio` | `9:16`, `3:4`, `1:1`, `4:3`, `16:9`, `21:9`，也可以省略。 |
| `video.resolution` | `540p`, `720p`, `1080p`；默认 `720p`。 |
| `video.duration` | `5s` 或 `10s`；默认 `5s`。 |
| `video.start_frame` | 可选，支持图片 URL、base64 data，或已有 `generation_id`。 |
| `video.end_frame` | 可选，表示最终帧；仅适用于 `type: "video"`。 |
| `video.loop` | 生成时使用的循环视频；不能和 `10s`、HDR、`end_frame` 同用。 |
| `video.hdr` | 需要 `720p` 或 `1080p`；不能和 `10s` 或 loop 同用。 |
| `video.exr_export` | 需要 `video.hdr: true`。 |

重要约束：

- `10s` 不能和 HDR、`start_frame`、`end_frame` 同用。
- `540p` 不能和 HDR 同用。
- 普通 `type: "video"` 不能带 `video.edit` 和 `source`。
- 输入图片有大小和尺寸限制，提交前应先校验，失败时给清晰错误。

## 轮询和下载

生产环境轮询建议：

- 必须有 hard timeout，避免 generation 卡住后 worker 一直挂着。
- 图片不需要立刻高频轮询；视频应使用更长的 initial wait 和 timeout。
- Ray 3.2 可以先用 30 秒 initial wait、10 分钟 hard timeout 作为起点。
- 轮询 `GET /v1/generations/{generation_id}`，直到 `state` 是 `completed` 或 `failed`。

完成后，输出通过 presigned URL 提供。官方文档说明图片和视频的 presigned URL 会在 1 小时后过期，所以 worker 应该尽快下载，不要只保存 URL。重新 poll generation 可以刷新 URL。

## 错误处理

需要分开处理同步 HTTP 错误和异步 generation failure。

同步错误建议映射：

| Status | 含义 | 是否重试 |
|---|---|---|
| `400` | 参数无效 | 否，修参数。 |
| `401` | API key 缺失或无效 | 否，修 secret/config。 |
| `402` | 余额不足 | 否，充值或换账号。 |
| `403` | 权限拒绝 | 否，账号/配置/支持问题。 |
| `413` | 输入媒体太大 | 否，压缩或缩放。 |
| `422` | 参数组合非法或媒体数据坏 | 否，修请求/媒体。 |
| `429` | RPM 或并发限流 | 是，遵守 `Retry-After`。 |
| `502` | 上游不可用 | 是，backoff 重试。 |
| `503` | 图片摄取不可用 | 是，重试或改用 base64。 |

异步 `failure_code` 建议分支：

| Failure code | 处理方式 |
|---|---|
| `content_moderated` | 不重试，让用户改安全一点的 prompt/input。 |
| `generation_failed` | 有界重试。 |
| `budget_exhausted` | 停止，提示余额/账单问题。 |
| `output_not_found` | 可重试同一请求或重新 poll。 |
| `image_too_large` | 缩放或压缩输入。 |
| `unsupported_format` | 转换媒体格式。 |
| `corrupt_input` | 重新编码或替换输入。 |
| `invalid_request` | 修请求参数。 |
| `rate_limited` | backoff 重试。 |

同时记录响应里的 `X-Request-Id` 和 `X-API-Version`，方便 debug。

## 建议的 QCut/Daytona 实现位置

如果要接入现有 agent stack，建议拆这些文件：

| 关注点 | 建议文件 |
|---|---|
| Luma HTTP client | `packages/agent-worker/src/luma/luma-client.ts` |
| 请求校验 | `packages/agent-worker/src/luma/luma-validation.ts` |
| 轮询和下载 workflow | `packages/agent-worker/src/luma/luma-generation-runner.ts` |
| CLI command wiring | `packages/agent-worker/src/run-luma-ray32.ts` |
| agent prompt/tool docs | `docs/task/daytona-supabase-agent/luma-agents-ray32/` |

运行环境变量：

```text
LUMA_AGENTS_API_KEY=...
LUMA_AGENTS_BASE_URL=https://agents.lumalabs.ai/v1
```

Sandbox 输出约定：

```text
/tmp/qcut-output/luma-ray32/{generation_id}.mp4
/tmp/qcut-output/luma-ray32/{generation_id}.json
```

JSON sidecar 建议保存：

- request payload
- generation id
- 最终状态
- output URL metadata
- 下载后的本地文件路径
- request id / API version headers
- 失败时的 failure reason 和 failure code

## 集成风险

- Presigned URL 会过期，worker 必须尽快下载，不要把 URL 当长期资产。
- RPM 和并发限制按 API client 计算，多用户提交时需要 queue 或 limiter。
- `10s`、HDR、loop、anchor frame 的组合约束不少，应该提交前校验。
- 内容审核失败应该提示用户修改 prompt，不应该盲目重试。
- API key 必须只在服务端或 Daytona/worker runtime 使用，不能进入浏览器代码。
