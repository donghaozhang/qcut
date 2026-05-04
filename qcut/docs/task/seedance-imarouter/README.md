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

## Asset / Portrait endpoints

For real-people / portrait references, the platform recommends pre-uploading the image so it goes through review before the video call. The script's `--upload` flag wires this up automatically.

| Method | Path                          | Purpose                                                  |
| ------ | ----------------------------- | -------------------------------------------------------- |
| POST   | `/v1/assets/group/create`     | Create a material group (one-time, cached in `.env`)     |
| POST   | `/v1/assets/group/list`       | List existing groups                                     |
| POST   | `/v1/assets/create`           | Upload an image/video/audio URL into a group             |
| POST   | `/v1/assets/get`              | Poll an asset's review `Status`                          |
| POST   | `/v1/assets/list`             | List assets                                              |
| POST   | `/v1/assets/quota`            | Query asset quota                                        |

### Channel mapping (must match!)

Mixing channels yields an `asset://...` id that the video job will refuse.

| Video model                                  | Asset `model`        | Region    |
| -------------------------------------------- | -------------------- | --------- |
| `seedance-2.0`, `seedance-2.0-fast`          | `seedance-upload`    | overseas  |
| `seedance-2.0-cn`, `seedance-2.0-fast-cn`    | `ima-pro-upload-cn`  | domestic  |

### `POST /v1/assets/group/create` — minimum body

```json
{ "name": "seedance-cli", "model": "seedance-upload" }
```

Returns `{ "data": { "Id": "group-..." } }`.

### `POST /v1/assets/create` — minimum body

```json
{
  "group_id": "group-...",
  "url": "https://your-host.example.com/portrait.jpg",
  "asset_type": "Image",
  "model": "seedance-upload"
}
```

Returns `{ "data": { "Id": "asset-..." } }`. Feed back as `asset://asset-...` in `images[]`.

### Content policy

> "When using your own virtual characters or real-life materials, only **amateurs** are allowed, and **celebrity characters are not supported**."

Uploaded assets undergo mandatory review (≈10 s) — clear approve/reject before any video credit is spent.

## Files

- [`quickstart.md`](./quickstart.md) — how to run the script
- [`seedance-generate.mjs`](./seedance-generate.mjs) — the runnable script
