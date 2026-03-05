# AI Content Pipeline - Detailed Reference

This file contains detailed specifications for models, API endpoints, and troubleshooting.

## Current Integration Notes (QCut)

- Primary workflow is QCut bundled AICP (no local Python/pip setup required).
- In QCut app mode, set API keys in `Editor -> Settings -> API Keys`.
- QCut injects `FAL_KEY` for generation commands at process spawn.
- In standalone CLI mode, you must export keys manually (for example `FAL_KEY`).
- Treat `aicp list-models` output as source of truth for local model availability.
- `list-models` may emit provider/runtime warnings in standalone mode.
- `list-models` may not reliably support `--json` in current upstream behavior.

## FAL API Endpoint Reference

For direct API calls (not using the CLI), use these endpoint formats:

| Model Key | FAL API Endpoint |
|-----------|------------------|
| `nano_banana_pro` | `https://fal.run/fal-ai/nano-banana-pro` |
| `nano_banana_pro_edit` | `https://fal.run/fal-ai/nano-banana-pro/edit` |
| `flux_dev` | `https://fal.run/fal-ai/flux/dev` |
| `flux_schnell` | `https://fal.run/fal-ai/flux/schnell` |
| `flux_kontext` | `https://fal.run/fal-ai/flux-pro/kontext` |
| `gpt_image_1_5` | `https://fal.run/fal-ai/gpt-image-1/5` |
| `veo_3` | `https://fal.run/fal-ai/veo3` |
| `sora_2` | `https://fal.run/fal-ai/sora/v2` |
| `kling_2_6_pro` | `https://fal.run/fal-ai/kling-video/v2.6/pro/image-to-video` |
| `hailuo` | `https://fal.run/fal-ai/minimax/video-01/image-to-video` |

**Note:** Model keys use underscores (`nano_banana_pro`), but API endpoints use hyphens (`nano-banana-pro`).

### Direct API Example

```python
import requests

url = "https://fal.run/fal-ai/nano-banana-pro"
headers = {
    "Authorization": f"Key {FAL_KEY}",
    "Content-Type": "application/json"
}
payload = {
    "prompt": "A cute banana character",
    "image_size": "landscape_16_9"
}
response = requests.post(url, headers=headers, json=payload)
result = response.json()
image_url = result["images"][0]["url"]
```

## Complete Model Reference

### Text-to-Image Models

#### FLUX.1 Dev (`flux_dev`)
- **Provider**: FAL AI
- **Parameters**: 12B
- **Best for**: High-quality, detailed images
- **Cost**: ~$0.003 per image
- **Options**: width, height, num_inference_steps, guidance_scale

#### FLUX.1 Schnell (`flux_schnell`)
- **Provider**: FAL AI
- **Best for**: Fast prototyping, batch generation
- **Cost**: ~$0.001 per image
- **Speed**: 4x faster than Dev

#### Imagen 4 (`imagen_4`)
- **Provider**: Google Cloud
- **Best for**: Photorealistic images
- **Requires**: GCP authentication

#### Seedream v3 (`seedream_v3`)
- **Provider**: FAL AI
- **Best for**: Multilingual prompts, artistic styles

#### Nano Banana Pro (`nano_banana_pro`)
- **Provider**: FAL AI
- **Best for**: Fast, high-quality generation
- **Cost**: ~$0.002 per image
- **Speed**: Optimized for quick inference

#### GPT Image 1.5 (`gpt_image_1_5`)
- **Provider**: FAL AI
- **Best for**: Natural language understanding, creative prompts
- **Cost**: ~$0.003 per image

### Image-to-Video Models

#### Veo 3 (`veo_3`)
- **Provider**: Google Cloud
- **Best for**: Highest quality video generation
- **Cost**: ~$0.50-6.00 per video
- **Duration**: Up to 8 seconds
- **Resolution**: Up to 1080p
- **Requires**: GCP Project with Veo API enabled

#### Veo 2 (`veo_2`)
- **Provider**: Google Cloud
- **Best for**: Budget-conscious high-quality video
- **Cost**: ~$0.30-2.00 per video

#### Veo 3.1 Fast (`veo_3_1_fast`)
- **Provider**: FAL AI (Google)
- **Best for**: Fast video generation with optional audio
- **Cost**: ~$0.10/s without audio, ~$0.15/s with audio
- **Duration**: 6s, 8s
- **Features**: Native audio generation support
- **Options**: duration, generate_audio

#### Sora 2 (`sora_2`)
- **Provider**: FAL AI (OpenAI)
- **Best for**: High-quality video from images
- **Cost**: ~$0.30 per second
- **Duration**: 4, 8 seconds
- **Resolution**: auto, 720p
- **Options**: duration, resolution, aspect_ratio

#### Sora 2 Pro (`sora_2_pro`)
- **Provider**: FAL AI (OpenAI)
- **Best for**: Professional-tier video, 1080p support
- **Cost**: ~$0.30/s (720p), ~$0.50/s (1080p)
- **Duration**: 4, 8 seconds
- **Resolution**: auto, 720p, 1080p
- **Features**: Higher resolution, better quality

#### Hailuo (`hailuo`)
- **Provider**: FAL AI (MiniMax)
- **Best for**: Consistent motion, character animation
- **Cost**: ~$0.05 per second
- **Duration**: 6, 10 seconds
- **Options**: prompt_optimizer (enabled by default)

#### Kling v2.1 (`kling_2_1`)
- **Provider**: FAL AI
- **Best for**: Creative video effects, controllable generation
- **Cost**: ~$0.05 per second
- **Duration**: 5, 10 seconds
- **Options**: negative_prompt, cfg_scale (0-1)

#### Kling v2.6 Pro (`kling_2_6_pro`)
- **Provider**: FAL AI
- **Best for**: Professional video production
- **Cost**: ~$0.10 per second
- **Duration**: 5, 10 seconds
- **Features**: Professional tier, higher quality
- **Options**: negative_prompt, cfg_scale (0-1)

#### Seedance v1.5 Pro (`seedance_1_5_pro`)
- **Provider**: FAL AI (ByteDance)
- **Best for**: Reproducible video generation with seed control
- **Cost**: ~$0.08 per second
- **Duration**: 5, 10 seconds
- **Features**: Seed control for reproducibility
- **Options**: seed (optional), duration

### Image-to-Image Models

#### Photon Flash (`photon_flash`)
- **Best for**: Quick creative modifications
- **Strength**: 0.0-1.0 (higher = more change)

#### Photon Base (`photon_base`)
- **Best for**: Standard image transformations

#### Clarity Upscaler (`clarity_upscaler`)
- **Best for**: 2x-4x resolution enhancement
- **Preserves**: Original image details

#### Nano Banana Pro Edit (`nano_banana_pro_edit`)
- **Provider**: FAL AI
- **Best for**: Fast image editing
- **Cost**: ~$0.015 per image
- **Strength**: 0.0-1.0

#### GPT Image 1.5 Edit (`gpt_image_1_5_edit`)
- **Provider**: FAL AI
- **Best for**: GPT-powered image editing, natural language
- **Cost**: ~$0.02 per image

### Image Understanding Models

#### Gemini Flash (`gemini_flash`)
- **Tasks**: Description, classification, OCR
- **Speed**: Fastest response time

#### Gemini Pro (`gemini_pro`)
- **Tasks**: Complex analysis, detailed Q&A
- **Quality**: Highest accuracy

### Prompt Generation Models

#### Claude via OpenRouter (`claude_openrouter`)
- **Best for**: Video prompt optimization
- **Output**: Detailed, cinematic prompts

### Speech-to-Text Models

#### ElevenLabs Scribe v2 (`scribe_v2`)
- **Provider**: FAL AI (ElevenLabs)
- **Endpoint**: `fal-ai/elevenlabs/speech-to-text`
- **Best for**: High-accuracy transcription with word-level timestamps
- **Cost**: ~$0.008 per minute
- **Features**:
  - 99 language support with auto-detection
  - Word-level timestamps (start/end in seconds)
  - Speaker diarization (identifies different speakers)
  - Audio event tagging (laughter, applause, music, etc.)

**CLI Options:**

| Option | Description |
|--------|-------------|
| `-i, --input` | Input audio/video file path or URL (required) |
| `-o, --output` | Output directory (default: `output`) |
| `--save-json FILENAME` | Save detailed metadata as JSON file |
| `--language CODE` | Language code (e.g., `eng`, `spa`, `fra`). Default: auto-detect |
| `--diarize` | Enable speaker diarization (default: enabled) |
| `--no-diarize` | Disable speaker diarization |
| `--tag-events` | Tag audio events like laughter, applause (default: enabled) |
| `--no-tag-events` | Disable audio event tagging |
| `--keyterms TERM1 TERM2` | Terms to bias transcription toward (+30% cost) |

**Output Files:**
- `{filename}_transcript_{timestamp}.txt` - Plain text transcript
- `{filename}.json` (if `--save-json` used) - Basic metadata

**Python API for Word-Level Timestamps:**

The CLI `--save-json` option saves basic metadata. For full word-level timestamps with speaker IDs, use the Python API directly:

```python
import fal_client
import json

# Upload and transcribe
audio_url = fal_client.upload_file("audio.mp3")
result = fal_client.subscribe(
    "fal-ai/elevenlabs/speech-to-text",
    arguments={
        "audio_url": audio_url,
        "diarize": True,
        "tag_audio_events": True,
    }
)

# Save full result with word timestamps
with open("transcript_words.json", "w") as f:
    json.dump(result, f, indent=2)

# Access word timestamps
for word in result["words"]:
    if word["type"] == "word":
        print(f"{word['text']}: {word['start']:.2f}s - {word['end']:.2f}s ({word['speaker_id']})")
```

**Word Timestamp JSON Structure:**

```json
{
  "text": "Full transcript text...",
  "language_code": "eng",
  "language_probability": 0.98,
  "words": [
    {
      "text": "Hello",
      "start": 0.2,
      "end": 0.5,
      "type": "word",
      "speaker_id": "speaker_0"
    },
    {
      "text": " ",
      "start": 0.5,
      "end": 0.52,
      "type": "spacing",
      "speaker_id": "speaker_0"
    },
    {
      "text": "(laughter)",
      "start": 1.0,
      "end": 1.5,
      "type": "audio_event",
      "speaker_id": null
    }
  ]
}
```

**Word Entry Types:**
- `word` - Spoken word with timestamps and speaker
- `spacing` - Space between words
- `audio_event` - Non-speech audio (laughter, applause, music, etc.)
- `punctuation` - Punctuation marks

**Supported Languages (99 total):**
Common codes: `eng` (English), `spa` (Spanish), `fra` (French), `deu` (German), `ita` (Italian), `por` (Portuguese), `rus` (Russian), `zho` (Chinese), `jpn` (Japanese), `kor` (Korean), `ara` (Arabic), `hin` (Hindi)

## Video Analysis HTTP API

QCut's Claude HTTP server (port 8765) exposes video analysis endpoints that accept video from three sources.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/claude/analyze/:projectId` | Analyze a video |
| `GET` | `/api/claude/analyze/models` | List available analysis models |

### POST /api/claude/analyze/:projectId

**Request Body:**

```json
{
  "source": {
    "type": "path | media | timeline",
    "filePath": "/absolute/path/to/video.mp4",
    "mediaId": "media_abc123",
    "elementId": "element_xyz"
  },
  "analysisType": "timeline | describe | transcribe",
  "model": "gemini-2.5-flash",
  "format": "md | json | both"
}
```

**Source Types:**

| Type | Required Field | Resolution |
|------|----------------|------------|
| `path` | `filePath` | Uses absolute file path directly |
| `media` | `mediaId` | Looks up media file in project by ID |
| `timeline` | `elementId` | Finds element in timeline, resolves its source media |

**Analysis Types:**

| Type | Description | Provider |
|------|-------------|----------|
| `timeline` (default) | Detailed second-by-second breakdown | FAL (Gemini via OpenRouter) |
| `describe` | Video description and summary | Gemini direct |
| `transcribe` | Audio transcription with timestamps | Gemini direct |

**Available Models:**

| Key | Provider | Model ID | Notes |
|-----|----------|----------|-------|
| `gemini-2.5-flash` (default) | FAL | `google/gemini-2.5-flash` | Fast, cost-effective |
| `gemini-2.5-pro` | FAL | `google/gemini-2.5-pro` | Higher quality |
| `gemini-3-pro` | FAL | `google/gemini-3-pro-preview` | Highest quality |
| `gemini-direct` | Gemini | `gemini-2.0-flash-exp` | Requires GEMINI_API_KEY |

**Response:**

```json
{
  "success": true,
  "markdown": "# Detailed Video Timeline Analysis\n\n...",
  "json": { "timeline": "...", "provider": "fal", "model": "...", "usage": {} },
  "outputFiles": [
    "/Users/.../Projects/my-project/analysis/video_detailed_timeline.md",
    "/Users/.../Projects/my-project/analysis/video_detailed_timeline.json"
  ],
  "videoPath": "/Users/.../Projects/my-project/media/video.mp4",
  "duration": 12.5,
  "cost": 0.001637
}
```

**Output directory:** `~/Documents/QCut/Projects/{projectId}/analysis/`

### Electron IPC

Frontend code can also call via the preload bridge:

```typescript
const result = await window.electronAPI.claude?.analyze.run(projectId, {
  source: { type: "path", filePath: "/path/to/video.mp4" },
  analysisType: "timeline",
  model: "gemini-2.5-flash",
});

const { models } = await window.electronAPI.claude?.analyze.models();
```

### Key Files

| File | Purpose |
|------|---------|
| `electron/claude/claude-analyze-handler.ts` | Core handler (resolveVideoPath, analyzeVideo, listAnalyzeModels) |
| `electron/types/claude-api.ts` | Type definitions (AnalyzeSource, AnalyzeOptions, AnalyzeResult) |
| `electron/claude/claude-http-server.ts` | HTTP route registration |
| `electron/preload-integrations.ts` | IPC bridge for renderer |
| `electron/__tests__/claude-analyze-handler.test.ts` | Unit tests |

## Pipeline Configuration Options

### Step Types
- `text_to_image`: Generate image from text
- `image_to_image`: Transform existing image
- `image_to_video`: Create video from image
- `text_to_video`: Full text-to-video pipeline
- `image_understanding`: Analyze/describe image
- `prompt_generation`: Optimize prompts
- `text_to_speech`: Generate audio
- `upscale_video`: Enhance video quality

### Common Parameters

#### Image Generation
```yaml
params:
  prompt: "Your prompt here"
  negative_prompt: "What to avoid"
  width: 1920
  height: 1080
  num_inference_steps: 30
  guidance_scale: 7.5
  seed: 12345  # For reproducibility
```

#### Video Generation
```yaml
params:
  image: "{{step_N.output}}"  # or file path
  prompt: "Motion description"
  duration: 5  # seconds
  fps: 24
  aspect_ratio: "16:9"
```

### Parallel Execution

Enable for independent steps:
```bash
PIPELINE_PARALLEL_ENABLED=true aicp run-chain --config config.yaml
```

Benefits:
- 2-3x speedup for multi-step pipelines
- Automatic dependency resolution
- Thread-based execution

## Troubleshooting

### Common Issues

**"API key not found"**
- QCut app mode:
  - Open `Editor -> Settings -> API Keys`
  - Set `FAL API Key`
  - Retry generation
- Standalone CLI mode:
  - Export `FAL_KEY` in the shell before running commands
  - Verify it exists with `echo $FAL_KEY`

**"Model not available"**
- Run `aicp list-models` and select a model from that output.
- Verify model spelling matches exactly.
- Confirm provider account access where required.
- If standalone mode shows provider directory/module warnings, use QCut app mode or rebuild runtime with required integrations.

**"Output directory not found"**
- For CLI usage, pass `--output-dir` to a writable path.
- If CLI ignores output dir, inspect default `output/` folder.
- In QCut app mode, output path recovery is handled by app-side fallback logic.

**"GCP authentication failed"**
- Run `gcloud auth login`
- Run `gcloud auth application-default login`
- Verify project configuration/environment variables for your GCP setup

### Debug Mode

Run with verbose output:
```bash
LOG_LEVEL=DEBUG aicp run-chain --config config.yaml
```

## Output Organization

Generated files follow QCut's standard project structure:
```
media/
├── generated/
│   ├── images/           # AI-generated images
│   │   └── YYYY-MM-DD_HHMMSS_image.png
│   ├── videos/           # AI-generated videos
│   │   └── YYYY-MM-DD_HHMMSS_video.mp4
│   └── audio/            # AI-generated audio/speech
│       └── YYYY-MM-DD_HHMMSS_audio.mp3
└── temp/                 # Processing intermediates
    └── frames/           # Extracted frames for analysis
```

Pipeline metadata is saved to:
```
media/generated/pipeline_results.json
```

Results JSON contains:
- Step execution times
- Model parameters used
- Output file paths
- Cost breakdown

**Note:** This structure aligns with QCut's native-cli project-organization commands (`init-project`, `organize-project`, `structure-info`).
