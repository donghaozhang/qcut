# Volcengine Ark Video Understanding — API Reference

> Source: https://www.volcengine.com/docs/82379/1895586

## Supported APIs

| API | Video Input | Use Case |
|-----|-------------|----------|
| **Responses API** | File ID, Base64, URL | Recommended — simpler context management, supports Files API upload |
| **Chat Completions API** | Base64, URL | Legacy — widely used, OpenAI-compatible |
| **Files API** | Local file upload | Upload large files (up to 512MB) for reuse across requests |

## Base URL

```
https://ark.cn-beijing.volces.com/api/v3
```

## Authentication

```
Authorization: Bearer $ARK_API_KEY
```

Get API key: https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey
Enable models: https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement

---

## Supported Models

| Model ID | Generation | Max Frames | Single Frame Tokens | Notes |
|----------|-----------|------------|---------------------|-------|
| `doubao-seed-1-6-251015` | Seed 1.6 | 640 | 128–640 discrete | Older, widely supported |
| `doubao-seed-1-8-*` | Seed 1.8 | 1280 | 64–384 discrete | Higher frame density |
| `doubao-seed-2-0-pro-260215` | Seed 2.0 Pro | 1280 | 64–384 continuous | Deep thinking, best quality |
| `doubao-seed-2-0-lite-260215` | Seed 2.0 Lite | 1280 | 64–384 continuous | Fast, cost-effective |

---

## Video Input Methods

### 1. Video URL (simplest)

**Limits**: File ≤ 50MB, public URL required.

#### Responses API

```json
{
  "model": "doubao-seed-2-0-lite-260215",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_video",
          "video_url": "https://example.com/video.mp4",
          "fps": 1
        },
        {
          "type": "input_text",
          "text": "Describe this video"
        }
      ]
    }
  ]
}
```

#### Chat Completions API

```json
{
  "model": "doubao-seed-1-6-251015",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "video_url",
          "video_url": {
            "url": "https://example.com/video.mp4",
            "fps": 2
          }
        },
        {
          "type": "text",
          "text": "What is in the video?"
        }
      ]
    }
  ],
  "max_tokens": 4096
}
```

### 2. Base64 Encoding

**Limits**: File ≤ 50MB, request body ≤ 64MB.

Format: `data:{mime_type};base64,{base64_data}`

#### Responses API

```json
{
  "model": "doubao-seed-2-0-lite-260215",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_video",
          "video_url": "data:video/mp4;base64,AAAAIGZ0eX...",
          "fps": 1
        }
      ]
    }
  ]
}
```

#### Chat Completions API

```json
{
  "model": "doubao-seed-1-6-251015",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "video_url",
          "video_url": {
            "url": "data:video/mp4;base64,AAAAIGZ0eX..."
          }
        },
        {
          "type": "text",
          "text": "What is in the video?"
        }
      ]
    }
  ],
  "max_tokens": 300
}
```

### 3. Files API Upload (recommended for large files)

**Limits**: File ≤ 512MB. Files stored 7 days (configurable 1–30 days). Responses API only.

#### Step 1: Upload file

```bash
curl https://ark.cn-beijing.volces.com/api/v3/files \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -F 'purpose=user_data' \
  -F 'file=@/path/to/video.mp4' \
  -F 'preprocess_configs[video][fps]=0.3'
```

Response returns `file.id` (e.g., `file-20251018****`).

#### Step 2: Poll until processing complete

```
GET /api/v3/files/{file_id}
```

Wait until `status` != `"processing"`.

#### Step 3: Use file_id in Responses API

```json
{
  "model": "doubao-seed-2-0-pro-260215",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_video",
          "file_id": "file-20251018****"
        },
        {
          "type": "input_text",
          "text": "Describe the actions in this video"
        }
      ]
    }
  ]
}
```

---

## Response Formats

### Responses API Output

```json
{
  "model": "doubao-seed-2-0-pro-260215",
  "status": "completed",
  "output": [
    {
      "type": "reasoning",
      "summary": [{ "type": "summary_text", "text": "thinking..." }],
      "status": "completed"
    },
    {
      "type": "message",
      "role": "assistant",
      "content": [
        { "type": "output_text", "text": "The video shows..." }
      ],
      "status": "completed"
    }
  ],
  "usage": {
    "input_tokens": 5000,
    "output_tokens": 200,
    "total_tokens": 5200,
    "input_tokens_details": { "cached_tokens": 0 },
    "output_tokens_details": { "reasoning_tokens": 142 }
  }
}
```

### Chat Completions API Output

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "The video shows..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 5000,
    "completion_tokens": 200,
    "total_tokens": 5200
  }
}
```

---

## Streaming

Add `"stream": true` to the request. Supported by both APIs.

### Responses API Stream Events

| Event Type | Description |
|-----------|-------------|
| `response.reasoning_summary_text.delta` | Thinking/reasoning chunk |
| `response.output_item.added` | New output item started |
| `response.output_text.delta` | Text content chunk |
| `response.output_text.done` | Text content complete |
| `response.output_item.done` | Output item complete |
| `response.completed` | Full response done (includes `usage`) |

---

## Video Format Support

| Format | Extension | Content-Type |
|--------|-----------|-------------|
| MP4 | `.mp4` | `video/mp4` |
| AVI | `.avi` | `video/avi` |
| MOV (URL) | `.mov` | `video/quicktime` |
| MOV (Base64) | `.mov` | `video/mov` |

> Format must be lowercase. Not all variants are guaranteed to work — test first.
> TS format not directly supported — convert to MP4 first.

---

## FPS Control

Controls frame sampling rate from the video.

| FPS | Interval | Use Case |
|-----|----------|----------|
| `0.2` | 1 frame / 5 sec | Static scenes, people counting |
| `0.3` | 1 frame / 3.3 sec | Slow-moving content |
| `0.5` | 1 frame / 2 sec | Moderate change |
| `1` (default) | 1 frame / sec | General purpose |
| `2` | 2 frames / sec | Faster action |
| `5` (max) | 5 frames / sec | Fast action, counting movements |

**Higher FPS = more detail + more tokens + slower processing**

---

## Frame Extraction Strategy

**Max token budget per video: 80,000 tokens**

### Seed 1.6 and earlier

| Parameter | Value |
|-----------|-------|
| Single frame tokens | 128, 160, 256, 384, 512, 640 (discrete) |
| Single frame max pixels | tokens × 28 × 28 (100K–500K px) |
| Frame count range | 16–640 frames |
| Max frames calculation | 80K tokens ÷ 128 tokens/frame = 640 frames |

### Seed 1.8, 2.0

| Parameter | Seed 1.8 | Seed 2.0 |
|-----------|----------|----------|
| Single frame tokens | 64, 128, 192, 256, 320, 384 (discrete) | 64–384 (continuous) |
| Single frame max pixels | tokens × 42 × 42 (110K–670K px) | tokens × 42 × 42 |
| Frame count range | 16–1280 frames | 16–1280 frames |
| Max frames calculation | 80K ÷ 64 = 1280 frames | 80K ÷ 64 = 1280 frames |

### Overflow/Underflow Behavior

- **Too many frames** (fps × duration > max): Uniformly sample max frames at interval `duration/max_frames`
- **Too few frames** (fps × duration < 16):
  - Video has ≥16 total frames → uniformly sample 16
  - Video has <16 total frames → use all frames

---

## How Video Understanding Works

The model processes video as **"timestamp + image" structured sequences**:

1. Extract frames at the configured FPS rate
2. Insert timestamp text before each frame: `[{seconds} second]`
3. Feed the ordered sequence to the model

### Example at FPS=1 (5-second video):

```
[0.0 second] <IMAGE>
[1.0 second] <IMAGE>
[2.0 second] <IMAGE>
[3.0 second] <IMAGE>
[4.0 second] <IMAGE>
[5.0 second] <IMAGE>
```

This is equivalent to a multi-image request with interleaved timestamp text.

---

## Limitations

- **No audio understanding** — only visual frames are analyzed
- **Video format variants** — not all container variants guaranteed to work
- **Single video max tokens**: 80K — constrained by model context window and max input length
- **Deep thinking mode** further limits max input tokens
- **Files are deleted after processing** — Ark does not retain user data for training

---

## OpenAI SDK Compatibility

The Volcengine Ark API is OpenAI-compatible. Use the OpenAI SDK with a custom base URL:

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.ARK_API_KEY,
});

// Responses API
const response = await client.responses.create({
  model: "doubao-seed-2-0-lite-260215",
  input: [
    {
      role: "user",
      content: [
        { type: "input_video", video_url: "https://example.com/video.mp4", fps: 1 },
        { type: "input_text", text: "What happens in this video?" },
      ],
    },
  ],
});

// Chat Completions API
const completion = await client.chat.completions.create({
  model: "doubao-seed-1-6-251015",
  messages: [
    {
      role: "user",
      content: [
        { type: "video_url", video_url: { url: "https://example.com/video.mp4", fps: 1 } },
        { type: "text", text: "What is in the video?" },
      ],
    },
  ],
});
```

---

## Content Type Differences Between APIs

| Field | Responses API | Chat Completions API |
|-------|--------------|---------------------|
| Video | `type: "input_video"` | `type: "video_url"` |
| Image | `type: "input_image"` | `type: "image_url"` |
| Text | `type: "input_text"` | `type: "text"` |
| File reference | `file_id: "file-xxx"` | Not supported |
| Video URL field | `video_url: "https://..."` | `video_url: { url: "https://..." }` |
| FPS field | `fps: 1` (top-level on content item) | `fps: 1` (inside video_url object) |
| Messages field | `input: [...]` | `messages: [...]` |
