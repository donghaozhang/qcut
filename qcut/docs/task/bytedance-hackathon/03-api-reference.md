# Seedance 2.0 — `tasks.create` API Reference

Verified against [docs.byteplus.com/en/docs/ModelArk/1520757](https://docs.byteplus.com/en/docs/ModelArk/1520757) on 2026-05-02. Auth is API key only — no SK/AK signing for this endpoint.

| | |
|---|---|
| Endpoint | `POST /api/v3/contents/generations/tasks` |
| Base URL (AP-Southeast) | `https://ark.ap-southeast.bytepluses.com` |
| Auth | `Authorization: Bearer <API_KEY>` |
| SDK | `from byteplussdkarkruntime import Ark` → `client.content_generation.tasks.create(...)` |

## Request body — top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `model` | string | ✅ | Model ID or endpoint ID. S2.0 verified ID: `dreamina-seedance-2-0-260128`. |
| `content` | object[] | ✅ | Array of input items (see content schema below). |
| `callback_url` | string | — | Webhook URL for task status changes (`queued`, `running`, `succeeded`, `failed`, `expired`). Retried 3× on 5s timeout. |
| `return_last_frame` | bool | — | Default `false`. When `true`, the response also exposes the last-frame PNG via the *Get task* endpoint — handy for chaining clips. |
| `service_tier` | string | — | `default` (online) or `flex` (offline, 50% price). **`flex` not supported on Seedance 2.0**. |
| `execution_expires_after` | int (s) | — | Default `172800` (48h). Range `[3600, 259200]`. Tasks past the threshold are marked `expired`. |
| `generate_audio` | bool | — | Default `true`. Only S2.0 / 2.0 fast / 1.5 pro. |
| `draft` | bool | — | Only S1.5 pro. Generates a 480p preview to validate scene/shots cheaply. |
| `safety_identifier` | string | — | Hashed user ID, ASCII ≤ 64 chars, used by BytePlus to flag policy violators. |
| `resolution`, `ratio`, `duration`, `frames`, `seed`, `camera_fixed`, `watermark` | mixed | — | Per-task generation specs. See [02-capabilities.md](./02-capabilities.md) for ranges per model. |

## `content` array — element schema

Each element has a `type` discriminator. The full schema:

```jsonc
// type: "text"
{
  "type": "text",
  "text": "<prompt; optionally with --param flags appended (legacy)>"
}

// type: "image_url"
{
  "type": "image_url",
  "image_url": { "url": "<https URL | data:image/<fmt>;base64,<...> | <asset URI>>" },
  "role": "first_frame" | "last_frame" | "reference_image"  // optional for I2V first frame
}

// type: "video_url"  (Seedance 2.0 only)
{
  "type": "video_url",
  "video_url": { "url": "<https URL | <asset URI>>" },  // base64 NOT supported for video
  "role": "reference_video"
}

// type: "audio_url"  (Seedance 2.0 only)
{
  "type": "audio_url",
  "audio_url": { "url": "<https URL | data:audio/<fmt>;base64,<...> | <asset URI>>" },
  "role": "reference_audio"
}

// type: "draft_task"  (Seedance 1.5 pro only)
{
  "type": "draft_task",
  "draft_task": { "id": "<draft task id>" }
}
```

`role` values:

| Role | Used with | Mode |
|---|---|---|
| `first_frame` (or omitted) | `image_url` | Image-to-video (first frame) |
| `last_frame` | `image_url` | Image-to-video (first + last frame) — paired with `first_frame` |
| `reference_image` | `image_url` | Multimodal reference-to-video (1–9 images) |
| `reference_video` | `video_url` | Multimodal reference-to-video |
| `reference_audio` | `audio_url` | Multimodal reference-to-video |

The three image scenarios are **mutually exclusive within a single task** — don't mix `first_frame` and `reference_image` items.

## Response

```jsonc
{
  "id": "cgt-20260503024954-slw8k"  // Task ID, retained 7 days
}
```

Async — poll [*Get a video generation task*](https://docs.byteplus.com/en/docs/ModelArk/1520757) until `status` reaches `succeeded`, `failed`, `cancelled`, or `expired`. On success, `content.video_url` returns a TOS pre-signed URL (~24h expiry).

## Payload examples

### Text-to-video (verified working)

```python
client.content_generation.tasks.create(
    model="dreamina-seedance-2-0-260128",
    content=[{"type": "text", "text": "cat walk on the moon"}],
    ratio="16:9",
    duration=5,
)
```

### Image-to-video — first frame

```python
client.content_generation.tasks.create(
    model="dreamina-seedance-2-0-260128",
    content=[
        {"type": "text", "text": "the boat sails out from the harbour at sunset"},
        {
            "type": "image_url",
            "image_url": {"url": "https://example.com/harbour.jpg"},
            "role": "first_frame",  # optional; default for image-to-video
        },
    ],
    ratio="adaptive",
    duration=5,
)
```

### Image-to-video — first + last frame

```python
content=[
    {"type": "text", "text": "smooth interpolation between the two frames"},
    {"type": "image_url", "image_url": {"url": "https://.../start.jpg"}, "role": "first_frame"},
    {"type": "image_url", "image_url": {"url": "https://.../end.jpg"},   "role": "last_frame"},
]
```

If the two frames have different aspect ratios, the first frame's ratio wins and the last frame is auto-cropped (centered).

### Multimodal reference-to-video — image + video + audio

```python
content=[
    {"type": "text",      "text": "[Image 1] the boy and [Image 2] the corgi run through [Image 3] the meadow, in the style of [Video 1], with audio matching [Audio 1]"},
    {"type": "image_url", "image_url": {"url": "https://.../boy.jpg"},     "role": "reference_image"},
    {"type": "image_url", "image_url": {"url": "https://.../corgi.jpg"},   "role": "reference_image"},
    {"type": "image_url", "image_url": {"url": "https://.../meadow.jpg"},  "role": "reference_image"},
    {"type": "video_url", "video_url": {"url": "https://.../style.mp4"},   "role": "reference_video"},
    {"type": "audio_url", "audio_url": {"url": "https://.../score.mp3"},   "role": "reference_audio"},
]
```

Up to 9 images, 3 videos (≤15s total), 3 audio clips (≤15s total) per task. Audio cannot appear without at least one image or video.

### Base64 image input

Inline a small image as a data URI:

```python
import base64, mimetypes
fmt = "jpeg"  # must be lowercase
data = base64.b64encode(open("subject.jpg", "rb").read()).decode()
content = [
    {"type": "text", "text": "the subject walks across the bridge"},
    {
        "type": "image_url",
        "image_url": {"url": f"data:image/{fmt};base64,{data}"},
        "role": "first_frame",
    },
]
```

Keep request body ≤ 64 MB; for large files use a public URL or an asset ID instead.

### Asset ID (digital character / authorized real-person)

```python
{"type": "image_url", "image_url": {"url": "<asset URI from digital character library>"}, "role": "first_frame"}
```

This is the supported path to put a real human face into a Seedance 2.0 task.

## Real-face refusal envelope (verified 2026-05-02)

A direct-upload first-frame image that contains a (real or synthetic) human face is refused **at submit**:

```
HTTP 400 Bad Request
{
  "error": {
    "code":    "InputImageSensitiveContentDetected.PrivacyInformation",
    "message": "The request failed because the input image may contain real person.",
    "type":    "BadRequest"
  }
}
```

In `byteplussdkarkruntime` this surfaces as `ArkBadRequestError`. Branch on `error.code` in client code:

```python
from byteplussdkarkruntime import Ark
from byteplussdkarkruntime._exceptions import ArkBadRequestError

try:
    task = client.content_generation.tasks.create(...)
except ArkBadRequestError as e:
    body = getattr(e, "body", {}) or {}
    if (body.get("error") or {}).get("code") == "InputImageSensitiveContentDetected.PrivacyInformation":
        # Face filter triggered — fall back to digital character / 30-day reuse / authorized asset
        ...
    else:
        raise
```

The filter runs visually, before quota/tasking, so failed face uploads cost nothing.

## Querying a task

```python
r = client.content_generation.tasks.get(task_id="cgt-...")
# r.status      ∈ {"queued","running","succeeded","failed","cancelled","expired"}
# r.content.video_url
# r.content.last_frame_url   # only when return_last_frame=true
# r.error.code, r.error.message  # only on failed/cancelled
# r.duration  # actual duration when duration=-1 was requested
# r.ratio     # actual ratio when ratio="adaptive" was requested
```

Task IDs are kept for **7 days** from `created_at`; download outputs promptly.

## Source

The above is reconstructed from the official BytePlus reference page extracted on 2026-05-02. Re-verify before shipping production payloads — BytePlus has been iterating on this API roughly every two weeks.

- [Create a video generation task — primary source](https://docs.byteplus.com/en/docs/ModelArk/1520757)
- [Get / List task endpoints](https://docs.byteplus.com/api/docs/ModelArk/1521675)
- [Model List (full ID catalog)](https://docs.byteplus.com/en/docs/ModelArk/1099455)
