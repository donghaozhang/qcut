# Seedance via IMA Router

API reference and runnable script for Bytedance Seedance video generation through [IMA Router](https://doc.imarouter.com/).

Source spec: <https://doc.imarouter.com/#en/tag/seedance/POST/v1/videos>

## Endpoints

| Method | Path                    | Purpose                       |
| ------ | ----------------------- | ----------------------------- |
| POST   | `/v1/videos`            | Create a video generation job |
| GET    | `/v1/videos/{task_id}`  | Poll job status & result URL  |

Base URL: `https://api.imarouter.com`

## Authentication

```
Authorization: Bearer $IMAROUTER_API_KEY
```

Get a key at <https://imarouter.com>.

## Models

| Model                    | Notes                                           |
| ------------------------ | ----------------------------------------------- |
| `seedance-2.0`           | Pro — supports up to 1080p                      |
| `seedance-2.0-fast`      | Speed-optimized, 720p recommended              |
| `seedance-2.0-cn`        | China region, pro                              |
| `seedance-2.0-fast-cn`   | China region, fast                             |

## Request body — `POST /v1/videos`

| Field                              | Type      | Req | Description                                              |
| ---------------------------------- | --------- | --- | -------------------------------------------------------- |
| `model`                            | string    | yes | One of the model IDs above                              |
| `prompt`                           | string    | *   | Required for text-to-video; optional with images        |
| `images`                           | string[]  | no  | 1–14 image URLs (or `asset://...`)                      |
| `duration`                         | integer   | yes | Seconds (model-dependent, typically 5–15)               |
| `size`                             | string    | no  | `WxH`, e.g. `1280x720`                                  |
| `metadata.resolution`              | string    | no  | `480p` \| `720p` \| `1080p`                             |
| `metadata.aspect_ratio`            | string    | no  | e.g. `16:9`, `9:16`, `4:3`                              |
| `metadata.audio`                   | boolean   | no  | Generate background audio                               |
| `metadata.role_mode`               | string    | no  | `reference` (default) \| `frame`                        |
| `metadata.reference_video_urls`    | string[]  | no  | Max 3, total ≤15 s, each ≥ 640×640                      |
| `metadata.reference_audio_urls`    | string[]  | no  | Max 1, ≤15 s                                            |

### Example — text-to-video

```json
{
  "model": "seedance-2.0-fast",
  "prompt": "Time-lapse of a city at dawn, warm cinematic colors.",
  "duration": 5,
  "metadata": { "resolution": "720p" }
}
```

### Example — image-to-video

```json
{
  "model": "seedance-2.0",
  "prompt": "Camera slowly pans over the steaming tea cup",
  "images": ["https://file.fashionlabs.cn/doc_image/r2v_tea_pic1.jpg"],
  "duration": 10,
  "metadata": {
    "aspect_ratio": "16:9",
    "audio": true,
    "role_mode": "reference"
  }
}
```

## Response — `GET /v1/videos/{task_id}`

```json
{
  "id": "task_202603131631387ETKUBM91MTD72X9",
  "task_id": "task_202603131631387ETKUBM91MTD72X9",
  "object": "video",
  "model": "seedance-2.0-fast",
  "status": "in_progress | completed | failed",
  "progress": 0,
  "amount_usd": 0.0,
  "created_at": 1773395498,
  "completed_at": 1773395598,
  "results": [
    {
      "url": "https://cdn.example.com/video.mp4",
      "width": 1280,
      "height": 720,
      "duration": 5,
      "content_type": "video"
    }
  ],
  "usage": { "input_tokens": 100, "output_tokens": 200, "total_tokens": 300 }
}
```

### Error shape

```json
{ "code": "invalid_request", "message": "Error description", "data": null }
```

## Constraints & gotchas

- `frame` role mode is incompatible with reference video / audio.
- Reference videos: max 3 clips, ≤15 s combined, ≥409 600 px each (≈640×640).
- No callback URL — you must poll the GET endpoint.

## Files

- [`quickstart.md`](./quickstart.md) — how to run the script
- [`seedance-generate.mjs`](./seedance-generate.mjs) — the runnable script
