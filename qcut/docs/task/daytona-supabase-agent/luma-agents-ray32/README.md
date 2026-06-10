# Luma Agents Ray 3.2 Integration Notes

Source docs checked on 2026-06-10:

- https://docs.agents.lumalabs.ai/
- https://docs.agents.lumalabs.ai/guides/model/
- https://docs.agents.lumalabs.ai/guides/videos/generation/
- https://docs.agents.lumalabs.ai/guides/rate-limits/
- https://docs.agents.lumalabs.ai/guides/error-handling/

## Why This Matters

Luma Agents exposes image and video generation through one async REST API. For QCut/Daytona work, the relevant video model is `ray-3.2`, which supports text-to-video, image-to-video, extension from a previous generation, video editing, and video reframing.

The operational shape matches the current Daytona agent pattern:

1. Submit a generation request.
2. Poll the generation until it is `completed` or `failed`.
3. Download the output from a presigned URL.
4. Store the generated asset in the sandbox output directory.

This means Luma can fit behind the same kind of queued or terminal-driven agent flow already used for generated media.

## API Shape

Base URL:

```text
https://agents.lumalabs.ai/v1
```

Authentication:

```text
Authorization: Bearer $LUMA_AGENTS_API_KEY
```

Main endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/generations` | Submit image/video generation, edit, or reframe work. |
| `GET` | `/v1/generations/{generation_id}` | Poll generation state and retrieve output URLs. |

Every request should attach a stable opaque `user_id` when the request is made on behalf of a QCut user. Do not send PII.

## Ray 3.2 Video Request

Minimal text-to-video request:

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

For image-to-video, pass anchors under `video.start_frame` and/or `video.end_frame`:

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

## Supported Ray 3.2 Parameters

| Field | Notes |
|---|---|
| `model` | Use `ray-3.2` for video. |
| `type` | Use `video` for generation. Other video flows use `video_edit` or `video_reframe`. |
| `prompt` | Required, 1-6,000 characters. Include subject, motion, camera movement, lighting, and pacing. |
| `aspect_ratio` | `9:16`, `3:4`, `1:1`, `4:3`, `16:9`, `21:9`, or omitted. |
| `video.resolution` | `540p`, `720p`, `1080p`; default is `720p`. |
| `video.duration` | `5s` or `10s`; default is `5s`. |
| `video.start_frame` | Optional image ref by URL, base64 data, or prior `generation_id`. |
| `video.end_frame` | Optional image ref for the final frame; valid for `type: "video"`. |
| `video.loop` | Create-only loop mode; not valid with `10s`, HDR, or `end_frame`. |
| `video.hdr` | Requires `720p` or `1080p`; not valid with `10s` or loop. |
| `video.exr_export` | Requires `video.hdr: true`. |

Important constraints:

- `10s` is rejected with HDR, `start_frame`, or `end_frame`.
- `540p` is rejected with HDR.
- `video.edit` and `source` are not valid for plain `type: "video"`.
- Input image refs have size and dimension limits; validate before upload or fail with a clear error.

## Polling And Downloads

For production polling:

- Use a hard timeout so a stuck generation cannot hang the agent.
- Luma recommends not polling immediately for image generation; video should use a longer initial wait and a longer hard timeout.
- A reasonable starting point for Ray 3.2 is a 30-second initial wait and a 10-minute hard timeout.
- Poll `GET /v1/generations/{generation_id}` until `state` is `completed` or `failed`.

When completed, output is delivered as a presigned URL. Download promptly; the docs state that generated image and video presigned URLs expire after 1 hour. Polling the generation again can refresh the URL.

## Error Handling

Handle synchronous HTTP errors separately from async generation failures.

Synchronous errors to map into QCut UI/agent messages:

| Status | Meaning | Retry |
|---|---|---|
| `400` | Invalid parameters | No; fix request. |
| `401` | Missing/invalid API key | No; fix secret/config. |
| `402` | Insufficient balance | No; add funds. |
| `403` | Access denied | No; contact/support/config issue. |
| `413` | Input media too large | No; resize/compress. |
| `422` | Invalid combination or bad media | No; fix request/media. |
| `429` | RPM or concurrency rate limit | Yes; honor `Retry-After`. |
| `502` | Upstream unavailable | Yes; retry with backoff. |
| `503` | Image ingestion unavailable | Yes; retry or use base64. |

Async `failure_code` values to branch on:

| Failure code | Handling |
|---|---|
| `content_moderated` | Do not retry; ask for a safer prompt/input. |
| `generation_failed` | Retry with bounded attempts. |
| `budget_exhausted` | Stop; surface billing/funds issue. |
| `output_not_found` | Retry same request or poll again. |
| `image_too_large` | Resize/compress input. |
| `unsupported_format` | Convert input media. |
| `corrupt_input` | Re-encode or replace input media. |
| `invalid_request` | Fix request parameters. |
| `rate_limited` | Retry with backoff. |

Also capture `X-Request-Id` and `X-API-Version` from responses for debugging.

## Suggested QCut/Daytona Implementation

Recommended files if this is added to the existing agent stack:

| Concern | Suggested file |
|---|---|
| Luma HTTP client | `packages/agent-worker/src/luma/luma-client.ts` |
| Request validation | `packages/agent-worker/src/luma/luma-validation.ts` |
| Polling/download workflow | `packages/agent-worker/src/luma/luma-generation-runner.ts` |
| CLI command wiring | `packages/agent-worker/src/run-luma-ray32.ts` |
| Agent prompt/tool docs | `docs/task/daytona-supabase-agent/luma-agents-ray32/` |

Runtime environment:

```text
LUMA_AGENTS_API_KEY=...
LUMA_AGENTS_BASE_URL=https://agents.lumalabs.ai/v1
```

Sandbox output convention:

```text
/tmp/qcut-output/luma-ray32/{generation_id}.mp4
/tmp/qcut-output/luma-ray32/{generation_id}.json
```

The JSON sidecar should store:

- request payload
- generation id
- terminal state
- output URL metadata
- downloaded file path
- request id / API version headers
- failure reason and failure code if failed

## Integration Risks

- Presigned URLs expire, so the worker should download immediately and not store the URL as the only asset reference.
- Concurrency and RPM limits are per API client, so QCut needs a queue or limiter if multiple users can submit Ray jobs.
- `10s`, HDR, loop, and anchor-frame combinations have constraints that should be validated before submission.
- Content moderation failures should be surfaced as user-actionable prompt changes, not retried blindly.
- The API key must stay server-side or inside the Daytona/worker runtime, never in browser code.
