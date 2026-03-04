# Native Pipeline CLI - Full Reference

Complete flag-level reference for every command in the native pipeline CLI.

Split across these files:

- **REFERENCE.md** (this file) — Generation, Analysis, Script Parsing, Model Discovery, Help, Output Formats
- [reference-pipelines.md](reference-pipelines.md) — YAML Pipelines, API Key Management, Project Management
- [reference-vimax.md](reference-vimax.md) — ViMax Commands

For editor commands, see [editor-core.md](editor-core.md) and linked files.

## Generation Commands

### `generate-image`

Generate an image from a text prompt.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--text` | `-t` | string | Text prompt (required) |
| `--model` | `-m` | string | Model key, e.g. `flux_dev`, `flux_schnell` (default: `nano_banana_pro`) |
| `--aspect-ratio` | | string | e.g. `16:9`, `9:16`, `1:1` |
| `--resolution` | | string | e.g. `1080p`, `720p` |
| `--negative-prompt` | | string | Negative prompt |
| `--output-dir` | `-o` | string | Output directory |

Output: `.png` file

### `create-video`

Create a video from text or image input.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--text` | `-t` | string | Text prompt |
| `--image-url` | | string | Input image (for image-to-video) |
| `--model` | `-m` | string | Model key (required) |
| `--duration` | `-d` | string | Duration, e.g. `5s` |
| `--aspect-ratio` | | string | Aspect ratio |
| `--resolution` | | string | Resolution |
| `--negative-prompt` | | string | Negative prompt |

Output: `.mp4` file

### `generate-avatar`

Generate a talking avatar video.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--text` | `-t` | string | Script text |
| `--image-url` | | string | Avatar image |
| `--audio-url` | | string | Input audio URL |
| `--model` | `-m` | string | Model key |
| `--voice-id` | | string | Voice ID for TTS |
| `--reference-images` | | string[] | Reference images (repeatable) |
| `--duration` | `-d` | string | Duration |
| `--resolution` | | string | Resolution |

Output: `.mp4` file

### `transfer-motion`

Transfer motion from a reference video onto an image.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--image-url` | | string | | Source image (required) |
| `--video-url` | | string | | Reference motion video (required) |
| `--model` | `-m` | string | `kling_motion_control` | Model key |
| `--no-sound` | | boolean | `false` | Strip audio |
| `--text` | `-t` | string | | Motion prompt |
| `--orientation` | | string | | Motion orientation hint |

Output: `.mp4` file

### `generate-grid`

Generate a grid of images from a prompt.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--text` | `-t` | string | | Prompt (required) |
| `--model` | `-m` | string | `flux_dev` | Image model |
| `--layout` | | string | `2x2` | Grid: `2x2`, `3x3`, `2x3`, `3x2`, `1x2`, `2x1` |
| `--style` | | string | | Style prefix prepended to prompt |
| `--grid-upscale` | | float | | Upscale factor after compositing |

Output: composite `.png` file

### `upscale-image`

Upscale an image.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--image` | | string | | Local image path |
| `--image-url` | | string | | Image URL |
| `--input` | `-i` | string | | Image path or URL (alias) |
| `--model` | `-m` | string | `topaz` | Upscaling model |
| `--upscale` | | string | | Upscale factor (e.g. `2`) |
| `--target` | | string | | Target: `720p`(1x), `1080p`(2x), `1440p`(3x), `2160p`(4x) |
| `--output-format` | `-f` | string | `png` | Output format |

---

## Analysis Commands

### `analyze-video`

Analyze a video with AI vision.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--input` | `-i` | string | | Video file or URL (required) |
| `--video-url` | | string | | Alias for input |
| `--model` | `-m` | string | `gemini_qa` | Vision model |
| `--analysis-type` | | string | `timeline` | `timeline`, `summary`, `description`, `transcript` |
| `--prompt` | | string | | Custom prompt (overrides analysis-type) |
| `--text` | `-t` | string | | Alias for prompt |
| `--output-format` | `-f` | string | `md` | `md`, `json`, `both` |

### `transcribe`

Transcribe audio to text with optional SRT.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--input` | `-i` | string | | Audio file or URL (required) |
| `--audio-url` | | string | | Alias for input |
| `--model` | `-m` | string | `scribe_v2` | STT model |
| `--language` | | string | | Language code (e.g. `en`, `fr`) |
| `--srt` | | boolean | `false` | Generate `.srt` file |
| `--srt-max-words` | | integer | | Max words per SRT block |
| `--srt-max-duration` | | float | | Max seconds per SRT block |
| `--no-diarize` | | boolean | `false` | Disable speaker diarization |
| `--no-tag-events` | | boolean | `false` | Disable audio event tagging |
| `--keyterms` | | string[] | | Domain keywords (repeatable) |
| `--raw-json` | | boolean | `false` | Save raw JSON response |

### `query-video`

Query video segments for keep/cut analysis.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--input` | `-i` | string | | Video file or URL (required) |
| `--prompt` | | string | | Query prompt |
| `--text` | `-t` | string | | Alias for prompt |
| `--model` | `-m` | string | `gemini_qa` | Vision model |
| `--output-format` | `-f` | string | `json` | Output format |

---

## Script Parsing

### `moyin:parse-script`

Parse a screenplay into structured data (characters, scenes).

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--text` | `-t` | string | Script text or file path (required) |
| `--input` | `-i` | string | Alias for text |

Output: structured JSON with characters and scenes.

---

## Model Discovery

### `list-models`

List all available models. Use `--category` to filter.

| Flag | Type | Description |
|------|------|-------------|
| `--category` | string | Filter by category (see step types in [reference-pipelines.md](reference-pipelines.md)) |
| `--json` | boolean | JSON output |

### Specialized Lists

| Command | Description |
|---------|-------------|
| `list-avatar-models` | Avatar models only |
| `list-video-models` | Text-to-video models |
| `list-motion-models` | Motion transfer models |
| `list-speech-models` | Speech/TTS models |

### `estimate-cost`

Estimate cost for a model + parameters.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--model` | `-m` | string | Model key |
| `--duration` | `-d` | string | Duration |
| `--resolution` | | string | Resolution |

---

## 3-Level Progressive Help (JSON)

Use `--help --json` at any level to get structured JSON help output:

### Level 1: Root overview

```bash
bun run pipeline --help --json
```

Returns version, all categories, every command (name + description + category), and global flags.

### Level 2: Command detail

```bash
bun run pipeline generate-image --help --json
```

Returns command name, description, category, usage string, required flags, optional flags, and examples.

### Level 3: Parameter detail

```bash
bun run pipeline generate-image --help model --json
```

Returns a single flag's name, type, description, short alias, required status, default value, and enum values.

All levels return a unified JSON envelope: `{ "status": "ok", "data": { ... } }`.

---

## Output Formats

**Default (TTY):** Progress bar + final output path.

**`--json`:** Unified JSON envelope with `status` field:

Success:
```json
{
  "status": "ok",
  "data": {
    "schema_version": "1",
    "command": "generate-image",
    "success": true,
    "outputPath": "./output/cli-1234/output_1234.png",
    "cost": 0.005,
    "duration": 8.3
  }
}
```

Error:
```json
{
  "status": "error",
  "error": "Missing --project-id",
  "code": "editor:project:info:failed"
}
```

Pending (async jobs):
```json
{
  "status": "pending",
  "jobId": "abc-123"
}
```

**`--stream`:** JSONL events on stderr (for `run-pipeline`):

```json
{"type":"progress","stage":"processing","percent":42,"message":"Step 2/3","timestamp":"..."}
```

**Exit codes:** `0` success, `1` error, `2` unknown command
