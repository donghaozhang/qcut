# Volcengine Ark Video Understanding — Implementation

## What was added

### New Provider: `volcengine`

Added Volcengine (火山方舟) as the 5th API provider in the native pipeline, alongside FAL, ElevenLabs, Google, and OpenRouter.

### New Model: `doubao_video_understanding`

Registered a new video understanding model using ByteDance's Doubao Seed 1.6 via the Volcengine Ark Chat Completions API.

| Property | Value |
|----------|-------|
| Key | `doubao_video_understanding` |
| Model ID | `doubao-seed-1-6-251015` |
| Provider | Volcengine |
| API | Chat Completions (OpenAI-compatible) |
| Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| Category | `image_understanding` |
| Default FPS | 1 |
| Max Tokens | 4096 |
| Cost Estimate | $0.005/request |

### API Key: `ARK_API_KEY`

New API key added to the key manager. Set it via:

```bash
# Environment variable
export ARK_API_KEY="your_api_key_here"

# Or via CLI
bun run pipeline set-key --name ARK_API_KEY --value "your_api_key_here"
```

Get your key at: https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey

## Files Modified

| File | Change |
|------|--------|
| `electron/native-pipeline/infra/api-caller.ts` | Added `volcengine` to `ProviderName`, base URL, headers (Bearer token), key resolution |
| `electron/native-pipeline/infra/key-manager.ts` | Added `ARK_API_KEY` to managed keys |
| `electron/native-pipeline/registry-data/image-understanding.ts` | Registered `doubao_video_understanding` model |
| `electron/native-pipeline/execution/step-executors.ts` | Added `volcengine` provider routing + `executeVolcengineVideoUnderstanding()` |

## CLI Usage

```bash
# Analyze a video URL with Doubao
bun run pipeline analyze-video \
  -i "https://example.com/video.mp4" \
  -m doubao_video_understanding \
  --prompt "Describe what happens in this video"

# Timeline analysis (default)
bun run pipeline analyze-video \
  -i "https://example.com/video.mp4" \
  -m doubao_video_understanding \
  --analysis-type timeline

# With custom FPS (higher = more detail, more tokens)
bun run pipeline analyze-video \
  -i "https://example.com/video.mp4" \
  -m doubao_video_understanding \
  --prompt "What actions occur?" \
  --fps 2
```

## How It Works

The Volcengine integration uses the **Chat Completions API** (OpenAI-compatible) with `video_url` content type:

```json
{
  "model": "doubao-seed-1-6-251015",
  "messages": [{
    "role": "user",
    "content": [
      {
        "type": "video_url",
        "video_url": {
          "url": "https://example.com/video.mp4",
          "fps": 1
        }
      },
      {
        "type": "text",
        "text": "Describe this video"
      }
    ]
  }],
  "max_tokens": 4096
}
```

### Video Input Methods

1. **Video URL** (current implementation): Public URL, max 50MB
2. **Base64 encoding**: For small videos <50MB (supported by the API, can be passed as URL with `data:video/mp4;base64,...` prefix)
3. **Files API upload**: For large videos up to 512MB (future enhancement using Responses API)

### FPS Control

The `fps` parameter controls frame sampling rate:
- `0.2` — Minimum, 1 frame every 5 seconds (static scenes)
- `1` — Default, 1 frame per second
- `2-5` — High detail for fast-moving content
- Single video max: 80k tokens

### Temporal Awareness

Doubao Seed supports time-aware analysis — it can identify when events occur in the video using timestamps, making it suitable for timeline generation and event detection.

## Supported Video Formats

| Format | Extension | Content-Type |
|--------|-----------|-------------|
| MP4 | .mp4 | `video/mp4` |
| AVI | .avi | `video/avi` |
| MOV | .mov | `video/quicktime` (URL) / `video/mov` (base64) |

## Prerequisites

1. Create a Volcengine account
2. Get an API key from the [Ark console](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)
3. Enable model access at the [Open Management page](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)
4. Set the `ARK_API_KEY` environment variable

## Future Enhancements

- **Files API support**: Upload large videos (up to 512MB) via the Responses API for repeated analysis
- **Streaming**: Real-time output for long video analysis
- **Base64 local upload**: Automatic local-file-to-base64 conversion for small videos
- **Additional Doubao models**: Seed 1.8, Seed 2.0 with higher frame limits (1280 frames)
