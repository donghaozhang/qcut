# Native Pipeline CLI — Pipelines, Keys & Project Management

See [REFERENCE.md](REFERENCE.md) for generation, analysis, and model commands.

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

### `pipeline:status`

Get pipeline job status/progress.

| Flag | Type | Description |
|------|------|-------------|
| `--job-id` | string | Job ID to check (required) |

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
