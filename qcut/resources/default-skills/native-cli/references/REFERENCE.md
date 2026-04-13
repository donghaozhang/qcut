# Native Pipeline CLI - Full Reference

Complete flag-level reference for every command in the native pipeline CLI.

Split across these files:

- **REFERENCE.md** (this file) — Generation, Analysis, Script Parsing, Model Discovery, Help, Output Formats
- [reference-pipelines.md](reference-pipelines.md) — YAML Pipelines, API Key Management, Project Management
- [reference-vimax.md](reference-vimax.md) — Flow (ViMax) Commands

For editor commands, see [editor-core.md](../editor/editor-core.md) and linked files.

## Generation Commands

### `gen image`

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

### `gen video`

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

### `gen avatar`

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

### `edit motion`

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

### `gen image --grid`

Generate a grid of images from a prompt. Use `--grid` with `gen image` to produce a composite grid.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--text` | `-t` | string | | Prompt (required) |
| `--model` | `-m` | string | `flux_dev` | Image model |
| `--grid` | | string | | Grid layout: `2x2`, `3x3`, `2x3`, `3x2`, `1x2`, `2x1` |
| `--style` | | string | | Style prefix prepended to prompt |
| `--grid-upscale` | | float | | Upscale factor after compositing |

Output: composite `.png` file

### `edit upscale`

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

### `analyze video`

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

### `analyze transcribe`

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

### `analyze query`

Query video segments for keep/cut analysis.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--input` | `-i` | string | | Video file or URL (required) |
| `--prompt` | | string | | Query prompt |
| `--text` | `-t` | string | | Alias for prompt |
| `--model` | `-m` | string | `gemini_qa` | Vision model |
| `--output-format` | `-f` | string | `json` | Output format |

### `edit autoclip`

Extract highlight clips from a video using subtitle-based LLM analysis. Runs a 4-step pipeline: outline extraction → timeline segmentation → scoring → ffmpeg cutting.

**Prerequisites:** An SRT/VTT subtitle file. If not provided via `--srt-file`, the CLI looks for a `.srt`/`.vtt` file next to the input video. Use `whisper` or `transcribe` to generate one first.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--input` | `-i` | string | | Input video file path (required) |
| `--srt-file` | `-s` | string | | SRT/VTT subtitle file (auto-detects if omitted) |
| `--output` | `-o` | string | | Output directory for clips and metadata |
| `--model` | `-m` | string | `google/gemini-3-flash-preview` | LLM model for analysis |
| `--min-score` | | number | `0.7` | Minimum score threshold 0–1 |
| `--step` | | number | | Run only a specific step (1–4) |
| `--chunk-minutes` | | number | `30` | Subtitle chunk interval in minutes |
| `--dry-run` | | boolean | `false` | Run analysis only, skip video cutting |

**Pipeline steps:**

1. **Outline** — LLM extracts topics/subtopics from subtitle chunks
2. **Timeline** — LLM maps topics to time segments with start/end times
3. **Scoring** — LLM scores each segment for highlight worthiness (0–1)
4. **Cut** — ffmpeg extracts clips for segments above `--min-score`

**Output structure:**
```
<output-dir>/
├── clips/                        # Extracted video clips
│   ├── 1_Topic Title.mp4
│   └── 3_Another Topic.mp4
└── autoclip-metadata/            # Pipeline intermediate data
    ├── chunks.json
    ├── step1_outline.json
    ├── step2_timeline.json
    ├── step3_all_scores.json
    └── step3_high_scores.json
```

**Examples:**
```bash
# Basic usage (auto-detect subtitle file)
qcut autoclip -i video.mp4 -o /tmp/clips

# With explicit SRT and higher threshold
qcut autoclip -i video.mp4 -s subs.srt --min-score 0.8

# Dry run (analysis only, no cutting)
qcut autoclip -i video.mp4 -s subs.srt --dry-run

# Run only step 1 (outline extraction)
qcut autoclip -i video.mp4 -s subs.srt --step 1

# Full workflow: transcribe → autoclip
whisper video.mp4 --model small --output_format srt --output_dir /tmp/
qcut autoclip -i video.mp4 -s /tmp/video.srt -o /tmp/clips
```

---

## Video Translation

### `analyze translate`

Translate video or audio into another language using HeyGen Translate (Speed) via FAL. Supports local files (uploaded to FAL CDN) and URLs. Audio input (`.mp3`, `.wav`, `.m4a`, etc.) is automatically wrapped in a dummy video for translation. Requires `FAL_KEY`.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--input` | `-i` | string | | Input video or audio file path/URL (required) |
| `--language` | `-l` | string | | Target language, e.g. Spanish, Chinese (required) |
| `--output` | `-o` | string | `./output` | Output directory |
| `--audio-only` | | boolean | `false` | Translate audio only (keep original video) |
| `--output-audio` | | boolean | `false` | Output translated audio file (auto-enabled for audio input) |
| `--no-dynamic-duration` | | boolean | `false` | Disable dynamic duration adjustment |
| `--speakers` | | number | | Number of speakers in the video |

**Model:** `heygen_translate_speed` (FAL endpoint: `fal-ai/heygen/v2/translate/speed`)

**Output:** Downloaded `.mp4` video file and/or `.m4a` audio file, plus a JSON metadata file.

**Examples:**
```bash
# Translate local video to Spanish
qcut analyze translate -i video.mp4 -l Spanish

# Translate audio file to Chinese (auto-outputs audio)
qcut analyze translate -i podcast.mp3 -l Chinese

# Translate video, output audio file
qcut analyze translate -i video.mp4 -l Japanese --output-audio

# Multi-speaker video to Japanese
qcut analyze translate -i interview.mp4 -l Japanese --speakers 2 -o /tmp/translated
```

---

## Script Parsing

### `moyin:parse-script` (legacy)

Parse a screenplay into structured data (characters, scenes).

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--text` | `-t` | string | Script text or file path (required) |
| `--input` | `-i` | string | Alias for text |

Output: structured JSON with characters and scenes.

---

## Model Discovery

### `system models`

List all available models. Use `--category` to filter.

| Flag | Type | Description |
|------|------|-------------|
| `--category` | string | Filter by category (see step types in [reference-pipelines.md](reference-pipelines.md)) |
| `--json` | boolean | JSON output |

### Specialized Lists

| Command | Description |
|---------|-------------|
| `system models-avatar` | Avatar models only |
| `system models-video` | Text-to-video models |
| `system models-motion` | Motion transfer models |
| `system models-speech` | Speech/TTS models |

### `system cost`

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
qcut --help --json
```

Returns version, all categories, every command (name + description + category), and global flags.

### Level 2: Command detail

```bash
qcut generate-image --help --json
```

Returns command name, description, category, usage string, required flags, optional flags, and examples.

### Level 3: Parameter detail

```bash
qcut generate-image --help model --json
```

Returns a single flag's name, type, description, short alias, required status, default value, and enum values.

All levels return a unified JSON envelope: `{ "status": "ok", "data": { ... } }`.

---

## Output Formats

**Default (TTY):** Progress bar + final output path + `[exit:N | Xs]` metadata on stderr.

**Error output (TTY):** Error message on stderr, with an optional recovery hint when available:
```text
error: Missing API key for fal
hint: Set the key with: qcut-pipeline set-key --name <provider> --value <key>
[exit:4 | 0.1s]
```

**`--json`:** Unified JSON envelope with `status`, `command_id`, and `duration_ms` fields:

Success:
```json
{
  "status": "ok",
  "command_id": "cmd-1741830000-a1b2c3",
  "duration_ms": 8300,
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
  "command_id": "cmd-1741830000-a1b2c3",
  "duration_ms": 500,
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

**`--stream` / `--verbose`:** JSONL debug events on stderr for all commands:

```jsonl
{"event":"command:start","command_id":"cmd-1741830000-a1b2c3","command":"generate-image","timestamp":"2026-03-12T10:00:00.000Z"}
{"event":"command:end","command_id":"cmd-1741830000-a1b2c3","command":"generate-image","exit_code":0,"duration_ms":3200,"timestamp":"2026-03-12T10:00:03.200Z"}
```

Pipeline-specific JSONL progress events (also on stderr with `--stream`):
```json
{"schema_version":"1","event":"step_progress","timestamp":1741830001,"elapsed_seconds":1.5,"duration_ms":1500,"step_index":1,"percent":42,"message":"Processing..."}
```

## Standalone Screen Recording

Top-level commands that record the screen without needing the editor UI
open. Spawn a hidden headless QCut instance, record, exit. Added in
Phase 1 of the dual-mode recording plan — see
`docs/task/recordly/22-cli-standalone-phase1-record-command.md` for
architecture and
`docs/task/recordly/23-cli-standalone-phase2-editor-commands.md` for the
auto-spawn behaviour of the existing `editor:screen-recording:*` group.

### `record`

One-shot standalone screen recording.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--source` | | string | Capture source ID from `editor:screen-recording:sources`. Defaults to the primary screen. |
| `--record-duration` | | number | Auto-stop after N seconds. Omit to wait for Ctrl-C. |
| `--output` | `-o` | string | Output file name (default: `recording-<ts>.mp4`) |
| `--cursor-sway` | | number | Cursor wobble intensity 0–2 (export compositor) |
| `--cursor-loop` | | boolean | Smooth loop return for cursor path |
| `--zoom-blur` | | number | Motion blur during zoom transitions 0–1 |
| `--mic` | | boolean | Capture microphone audio |
| `--system-audio` | | boolean | Capture system audio (default: `true`) |
| `--no-auto-launch` | | boolean | Fail instead of spawning a headless recorder |

Output: `.mp4` file plus optional `.cursor.json` telemetry sidecar.

Examples:

```bash
qcut record --record-duration 10 -o demo.mp4
qcut record --source screen:0:0 --cursor-sway 1.0 -o polished.mp4
qcut record -o long-demo.mp4   # Ctrl-C to stop
```

### `record-daemon`

Manage the headless recorder daemon. Useful only for troubleshooting —
the daemon auto-spawns when any `editor:screen-recording:*` command runs
against a closed editor, and self-exits after 30 s of idle.

| Flag | Type | Description |
|------|------|-------------|
| `--status` | boolean | Print `{ running, pid, port }`. Default if no flag is given. |
| `--stop` | boolean | SIGTERM the running daemon (if any) |
| `--start` | boolean | Spawn a fresh daemon (no-op if one is running) |

State files: `~/.qcut/.headless-record.pid`, `~/.qcut/.headless-record.port`.

Examples:

```bash
qcut record-daemon --json           # { "running": true, "pid": 12345, "port": 8765 }
qcut record-daemon --stop --json    # { "stopped": true, "pid": 12345, ... }
qcut record-daemon --start --json   # { "started": true, "port": 8765 }
```

### Auto-spawn scope for `editor:screen-recording:*`

When QCut is closed and any of these commands runs, the CLI launches a
hidden headless recorder transparently (opt out with `--no-auto-launch`):

- `editor:screen-recording:sources`
- `editor:screen-recording:status`
- `editor:screen-recording:start`
- `editor:screen-recording:stop`
- `editor:screen-recording:force-stop`

Other `editor:*` commands (media, timeline, export, etc.) still require
a visibly-running editor because they mutate project state that only
exists in the live renderer.

---

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments / unknown command |
| `3` | Model not found |
| `4` | API key missing |
| `5` | API call failed |
| `6` | Pipeline failed |
| `7` | File not found |
| `8` | Permission denied |
| `9` | Timeout |
| `10` | Cancelled |
