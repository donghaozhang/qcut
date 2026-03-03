# Native Pipeline CLI - Full Reference

Complete flag-level reference for every command in the native pipeline CLI.

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

## YAML Pipelines

### `run-pipeline`

Run a multi-step YAML pipeline.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--config` | `-c` | string | | YAML pipeline file (required) |
| `--input` | `-i` | string | | Input text, file, or `-` for stdin |
| `--text` | `-t` | string | | Alias for input |
| `--prompt-file` | | string | | Read input from file |
| `--save-intermediates` | | boolean | `false` | Save each step's output |
| `--parallel` | | boolean | `false` | Parallel step execution |
| `--max-workers` | | integer | `8` | Max concurrent workers |
| `--no-confirm` | | boolean | `false` | Skip cost confirmation |
| `--stream` | | boolean | `false` | JSONL progress on stderr |

### Pipeline YAML Schema

```yaml
name: my-pipeline
steps:
  - type: text_to_image       # ModelCategory value
    model: flux_dev            # model key
    params:                    # model-specific params
      image_size: landscape_16_9
    enabled: true              # optional, default true
    retry_count: 0             # optional

  - type: parallel_group       # parallel execution
    merge_strategy: COLLECT_ALL
    steps:
      - type: text_to_image
        model: flux_schnell

config:
  output_dir: ./output
  save_intermediates: true
  parallel: false
  max_workers: 8
```

**Step types:** `text_to_image`, `image_to_image`, `text_to_video`, `image_to_video`, `video_to_video`, `avatar`, `motion_transfer`, `upscale`, `upscale_video`, `add_audio`, `text_to_speech`, `speech_to_text`, `image_understanding`, `prompt_generation`

### `create-examples`

Write bundled example YAML pipelines to a directory.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--output-dir` | `-o` | string | `./examples` | Output directory |

Creates: `text-to-video-basic.yaml`, `image-to-video-chain.yaml`, `multi-step-pipeline.yaml`, `parallel-pipeline.yaml`, `avatar-generation.yaml`

---

## Model Discovery

### `list-models`

List all available models. Use `--category` to filter.

| Flag | Type | Description |
|------|------|-------------|
| `--category` | string | Filter by category (see step types above) |
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

## API Key Management

Keys stored in `~/.qcut/.env` (or `--config-dir/.env`).

### `setup`

Create `.env` template with all known keys.

### `set-key`

| Flag | Type | Description |
|------|------|-------------|
| `--name` | string | Key name (e.g. `FAL_KEY`) |
| `--value` | string | Key value (optional — interactive prompt if omitted) |

### `get-key`

| Flag | Type | Description |
|------|------|-------------|
| `--name` | string | Key name |
| `--reveal` | boolean | Show full unmasked value |

### `delete-key`

| Flag | Type | Description |
|------|------|-------------|
| `--name` | string | Key name |

### `check-keys`

Show status of all known keys (source: `env` / `envfile` / `aicp-cli` / `none`).

---

## Project Management

### `init-project`

Initialize a QCut project directory structure.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--directory` | string | `./output` | Project root |
| `--dry-run` | boolean | `false` | Preview without creating |

Creates: `input/{images,videos,audio,text,pipelines}`, `output/{images,videos,audio}`, `config/`

### `organize-project`

Sort loose media files into category subdirectories by extension.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--directory` | string | `./output` | Project root |
| `--source` | string | | Source directory (defaults to root) |
| `--dry-run` | boolean | `false` | Preview moves |
| `--recursive` | boolean | `false` | Scan recursively |
| `--include-output` | boolean | `false` | Also categorize output/ files |

**Extension mapping:**
- images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.svg`, `.tiff`
- videos: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.flv`, `.wmv`
- audio: `.mp3`, `.wav`, `.flac`, `.aac`, `.ogg`, `.m4a`, `.wma`
- text: `.txt`, `.md`, `.json`, `.yaml`, `.yml`, `.csv`

### `structure-info`

Show file counts per directory.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--directory` | string | `./output` | Project root |

---

## ViMax Commands

All `vimax:*` commands share these override flags:

| Flag | Description |
|------|-------------|
| `--llm-model` | Override LLM agent model |
| `--image-model` | Override image generation model |
| `--video-model` | Override video generation model |
| `--output-dir`, `-o` | Output directory |

### `vimax:idea2video`

Full pipeline: idea -> screenplay -> characters -> portraits -> storyboard -> video.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--idea` | | string | | Story idea (required) |
| `--text` | `-t` | string | | Alias for idea |
| `--duration` | `-d` | string | | Target duration (seconds) |
| `--no-portraits` | | boolean | `false` | Skip portrait generation |
| `--no-references` | | boolean | `false` | Disable character references |
| `--config` | `-c` | string | | YAML config overrides |
| `--project-id` | | string | | Project ID for registry |

### `vimax:script2video`

Script -> storyboard -> video (from existing script.json).

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--script` | | string | Script JSON path (required) |
| `--input` | `-i` | string | Alias for script |
| `--portraits` | `-p` | string | Portrait registry JSON path |
| `--no-references` | | boolean | Disable character references |

### `vimax:novel2movie`

Novel text file -> chapter extraction -> screenplay -> video.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--novel` | | string | | Novel text file (required) |
| `--input` | `-i` | string | | Alias |
| `--title` | | string | | Override title |
| `--max-scenes` | | integer | | Cap total scenes |
| `--no-portraits` | | boolean | `false` | Skip portraits |
| `--scripts-only` | | boolean | `false` | Stop after scripts |
| `--storyboard-only` | | boolean | `false` | Stop after storyboard |

### `vimax:extract-characters`

Extract character descriptions from text.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--text` | `-t` | string | Input text or file path (required) |
| `--input` | `-i` | string | Alias (reads file if path exists) |
| `--llm-model` | | string | LLM override |

Output: `characters.json`

### `vimax:generate-script`

Generate screenplay from an idea.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--idea` | | string | Story idea (required) |
| `--text` | `-t` | string | Alias |
| `--duration` | `-d` | string | Target duration (seconds) |
| `--llm-model` | | string | LLM override |

Output: `script.json`

### `vimax:generate-portraits`

Generate character portrait images.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--text` | `-t` | string | | Text or characters.json path (required) |
| `--input` | `-i` | string | | Alias |
| `--max-characters` | | integer | `5` | Max characters |
| `--views` | | string | | Comma-separated: `front,side,back,three_quarter` |
| `--image-model` | | string | | Image model override |
| `--llm-model` | | string | | LLM override (for extraction) |
| `--save-registry` | | boolean | `true` | Save registry.json |
| `--project-id` | | string | `cli-project` | Project ID |

Output: `portraits/` directory + `registry.json`

### `vimax:generate-storyboard`

Generate storyboard images from a script.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--script` | | string | Script JSON path (required) |
| `--input` | `-i` | string | Alias |
| `--portraits` | `-p` | string | Portrait registry path |
| `--image-model` | | string | Image model override |
| `--style` | | string | Style prefix for prompts |
| `--reference-model` | | string | Reference injection model |
| `--reference-strength` | | float | Reference strength (0.0-1.0) |

### `vimax:create-registry`

Build portrait registry from existing portrait directory.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--input` | `-i` | string | Portraits directory (required) |
| `--project-id` | | string | Project ID |

Expected structure: `portraits/<CharacterName>/<view>.png`

### `vimax:show-registry`

Display contents of a portrait registry.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--input` | `-i` | string | Path to registry.json (required) |

### `vimax:list-models`

List ViMax-relevant models (image, video, image-to-video, image-to-image).

---

## New Unified JSON API Commands

### `editor:project:list`

List all projects in the editor.

| Flag | Type | Description |
|------|------|-------------|
| (none) | | No additional flags required |

### `editor:project:info`

Get project info (settings, metadata).

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |

### `editor:timeline:info`

Get timeline state for a project (tracks, elements, duration).

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |

### `editor:timeline:add-clip`

Add a media clip to the timeline.

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |
| `--media-id` | string | Media ID to add (required) |
| `--track-id` | string | Target track ID |
| `--start-time` | float | Start position (seconds) |

### `editor:timeline:trim`

Trim an element's start/end times.

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |
| `--element-id` | string | Element ID (required) |
| `--start-time` | float | New start time (seconds) |
| `--end-time` | float | New end time (seconds) |

### `editor:project:export-state`

Dump the full project.json to disk (settings, media, subtitles, generated, exports, jobs).

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--project-id` | string | | Project ID (required) |
| `--output` | string | `./output/project-<id>.json` | Output file path |

```bash
bun run pipeline editor:project:export-state --project-id my-proj
bun run pipeline editor:project:export-state --project-id my-proj --output ./state.json
```

### `editor:project:import-state`

Load a project.json file into the editor (not yet implemented).

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |
| `--data` | string | JSON input (`@file.json`, inline, or `-` for stdin) (required) |

```bash
bun run pipeline editor:project:import-state --project-id my-proj --data @state.json
```

### `pipeline:status`

Get pipeline job status/progress.

| Flag | Type | Description |
|------|------|-------------|
| `--job-id` | string | Job ID to check (required) |

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
