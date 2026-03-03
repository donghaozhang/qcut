# QCut Editor CLI — Core Commands

Core `editor:*` commands for controlling a running QCut desktop instance: media, project, timeline, editing, export, diagnostics, and MCP.

## Quick Start

```bash
# Start QCut first
bun run electron:dev

# Run editor commands
bun run pipeline editor:<command> [options]

# Check connection
bun run pipeline editor:health
```

## Connection Options

| Flag | Description | Default |
|------|-------------|---------|
| `--host` | API host | `127.0.0.1` |
| `--port` | API port | `8765` |
| `--token` | API auth token | - |
| `--timeout` | Job timeout in seconds | `300` (export: `600`) |
| `--poll` | Auto-poll async jobs until complete | `false` |
| `--poll-interval` | Poll interval in seconds | `3` |

## JSON Input Modes

```bash
--data '{"type":"text","content":"Hello"}'   # Inline JSON
--data @element.json                          # From file
echo '{"type":"text"}' | ... --data -         # From stdin
```

---

## Media Commands

### List media

```bash
bun run pipeline editor:media:list --project-id <id>
```

### Get media info

```bash
bun run pipeline editor:media:info --project-id <id> --media-id <id>
```

### Import local file

```bash
bun run pipeline editor:media:import --project-id <id> --source /path/to/video.mp4
```

### Import from URL

```bash
bun run pipeline editor:media:import-url \
  --project-id <id> \
  --url "https://example.com/video.mp4" \
  --filename "my-video.mp4"
```

### Batch import (max 20 items)

```bash
bun run pipeline editor:media:batch-import \
  --project-id <id> \
  --items '[{"path":"/path/to/a.mp4"},{"url":"https://example.com/b.mp4"}]'

# "source" is also accepted as an alias for "path"
# From file: --items @imports.json
```

### Extract a frame

```bash
bun run pipeline editor:media:extract-frame \
  --project-id <id> \
  --media-id <id> \
  --start-time 5.0 \
  --output-format png
```

### Rename media

```bash
bun run pipeline editor:media:rename \
  --project-id <id> \
  --media-id <id> \
  --new-name "final-cut.mp4"
```

### Delete media

```bash
bun run pipeline editor:media:delete --project-id <id> --media-id <id>
```

---

## Project Commands

### Get settings

```bash
bun run pipeline editor:project:settings --project-id <id>
```

### Update settings

```bash
bun run pipeline editor:project:update-settings \
  --project-id <id> \
  --data '{"fps":30,"width":1920,"height":1080}'
```

### Get statistics

```bash
bun run pipeline editor:project:stats --project-id <id>
```

### Get summary (markdown)

```bash
bun run pipeline editor:project:summary --project-id <id>
```

### Generate pipeline report

```bash
bun run pipeline editor:project:report \
  --project-id <id> \
  --output-dir ./reports \
  --clear-log
```

### Create project

```bash
bun run pipeline editor:project:create --new-name "My New Project"
```

### Delete project

```bash
bun run pipeline editor:project:delete --project-id <id>
```

### Rename project

```bash
bun run pipeline editor:project:rename --project-id <id> --new-name "New Name"
```

### Duplicate project

```bash
bun run pipeline editor:project:duplicate --project-id <id>
```

### List all projects

```bash
bun run pipeline editor:project:list --json
```

Returns all projects with `id`, `name`, `createdAt`, `updatedAt`.

### Get project info (project.json)

```bash
# Minimal (~200 tokens): counts + settings only
bun run pipeline editor:project:info --project-id <id> --json

# Full (~2000 tokens): includes media[], subtitles[], generated[], exports[], jobs[]
bun run pipeline editor:project:info --project-id <id> --full --json
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--project-id` | string | | Project ID (required) |
| `--full` | boolean | `false` | Include all arrays (media, subtitles, generated, exports, jobs) |

### Export project state to disk

```bash
bun run pipeline editor:project:export-state --project-id <id>
bun run pipeline editor:project:export-state --project-id <id> --output ./state.json
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--project-id` | string | | Project ID (required) |
| `--output` | string | `./output/project-<id>.json` | Output file path |

### Import project state (planned)

```bash
bun run pipeline editor:project:import-state --project-id <id> --data @state.json
```

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |
| `--data` | string | JSON input (`@file.json`, inline, or `-` for stdin) (required) |

**Note**: This command is defined but not yet implemented.

---

## Timeline Commands

### Export timeline

```bash
bun run pipeline editor:timeline:export --project-id <id>
bun run pipeline editor:timeline:export --project-id <id> --json
bun run pipeline editor:timeline:export --project-id <id> --output-format json
```

### Import timeline

```bash
bun run pipeline editor:timeline:import \
  --project-id <id> \
  --data '{"name":"My Timeline","tracks":[{"id":"t1","type":"video","elements":[]}]}'

# From file / replace existing
bun run pipeline editor:timeline:import --project-id <id> --data @timeline.json --replace
```

**Notes**: Track `index` is optional (auto-assigned). Use `sourceName` (filename) in element data, not `mediaId`.

### Add element

```bash
# Media element (use sourceName to link to imported media)
bun run pipeline editor:timeline:add-element \
  --project-id <id> \
  --data '{"type":"video","sourceName":"my-video.mp4","startTime":0,"duration":10,"trackId":"track-1"}'

# Text element
bun run pipeline editor:timeline:add-element \
  --project-id <id> \
  --data '{"type":"text","content":"Hello World","startTime":0,"duration":5}'
```

### Batch add elements (max 50)

Each element **must** include `trackId`.

```bash
bun run pipeline editor:timeline:batch-add \
  --project-id <id> \
  --elements '[{"type":"text","content":"Title","startTime":0,"trackId":"track-1"},{"type":"text","content":"End","startTime":10,"trackId":"track-1"}]'
```

### Update element

```bash
bun run pipeline editor:timeline:update-element \
  --project-id <id> \
  --element-id <id> \
  --changes '{"startTime":5,"duration":15}'
```

### Batch update elements (max 50)

```bash
bun run pipeline editor:timeline:batch-update \
  --project-id <id> \
  --updates '[{"elementId":"e1","changes":{"startTime":0}},{"elementId":"e2","changes":{"startTime":10}}]'
```

### Delete element

```bash
bun run pipeline editor:timeline:delete-element \
  --project-id <id> \
  --element-id <id>
```

### Batch delete elements (max 50)

```bash
# Simple: plain element ID array
bun run pipeline editor:timeline:batch-delete \
  --project-id <id> \
  --elements '["elem1","elem2","elem3"]' \
  --ripple

# Explicit: with trackId per element
bun run pipeline editor:timeline:batch-delete \
  --project-id <id> \
  --elements '[{"trackId":"t1","elementId":"elem1"}]' \
  --ripple
```

### Split element

```bash
bun run pipeline editor:timeline:split \
  --project-id <id> \
  --element-id <id> \
  --split-time 10
```

### Move element

```bash
bun run pipeline editor:timeline:move \
  --project-id <id> \
  --element-id <id> \
  --to-track <track-id> \
  --start-time 15.0
```

**Known issue**: Moving within the same track may cause the element to disappear. Use different `--to-track` values.

### Arrange elements on a track

```bash
# Sequential (end-to-end, no gaps)
bun run pipeline editor:timeline:arrange \
  --project-id <id> --track-id <id> --mode sequential

# Spaced (with gap)
bun run pipeline editor:timeline:arrange \
  --project-id <id> --track-id <id> --mode spaced --gap 2.0

# Manual order
bun run pipeline editor:timeline:arrange \
  --project-id <id> --track-id <id> --mode manual \
  --data '["elem3","elem1","elem2"]' --start-time 0
```

### Selection

```bash
bun run pipeline editor:timeline:select \
  --project-id <id> \
  --elements '[{"trackId":"t1","elementId":"e1"}]'

bun run pipeline editor:timeline:get-selection --project-id <id>
bun run pipeline editor:timeline:clear-selection --project-id <id>
```

### Get timeline info

```bash
bun run pipeline editor:timeline:info --project-id <id> --json
```

Returns timeline state: tracks, elements, duration, playhead position.

### Add media clip to timeline

```bash
bun run pipeline editor:timeline:add-clip --project-id <id> --media-id <media-id>
bun run pipeline editor:timeline:add-clip --project-id <id> --media-id <media-id> --track-id <track-id> --start-time 5.0
```

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |
| `--media-id` | string | Media ID to add (required) |
| `--track-id` | string | Target track ID |
| `--start-time` | number | Start position in seconds |

### Trim element

```bash
bun run pipeline editor:timeline:trim --project-id <id> --element-id <eid> --start-time 2.0 --end-time 8.0
```

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |
| `--element-id` | string | Element ID (required) |
| `--start-time` | number | New start time in seconds (required) |
| `--end-time` | number | New end time in seconds (required) |

### Playback controls

```bash
bun run pipeline editor:timeline:play --project-id <id>
bun run pipeline editor:timeline:pause --project-id <id>
bun run pipeline editor:timeline:toggle-play --project-id <id>
bun run pipeline editor:timeline:seek --project-id <id> --time 15.0
```

---

## Editing Commands

### Batch cuts

```bash
bun run pipeline editor:editing:batch-cuts \
  --project-id <id> \
  --element-id <id> \
  --cuts '[{"start":2,"end":4},{"start":8,"end":10}]' \
  --ripple
```

### Delete time range

```bash
bun run pipeline editor:editing:delete-range \
  --project-id <id> \
  --start-time 5.0 \
  --end-time 15.0 \
  --ripple

# Limit to specific tracks
bun run pipeline editor:editing:delete-range \
  --project-id <id> \
  --start-time 5.0 --end-time 15.0 \
  --track-id "track-1,track-2" \
  --cross-track-ripple
```

### Auto-edit (remove fillers/silences)

```bash
# Synchronous
bun run pipeline editor:editing:auto-edit \
  --project-id <id> --element-id <id> --media-id <id> \
  --remove-fillers --remove-silences --threshold 0.5

# Async with polling
bun run pipeline editor:editing:auto-edit \
  --project-id <id> --element-id <id> --media-id <id> \
  --remove-fillers --poll --poll-interval 2

# Dry run
bun run pipeline editor:editing:auto-edit \
  --project-id <id> --element-id <id> --media-id <id> \
  --remove-silences --dry-run
```

### Auto-edit job management

```bash
bun run pipeline editor:editing:auto-edit-status --project-id <id> --job-id <id>
bun run pipeline editor:editing:auto-edit-list --project-id <id>
```

### AI-suggested cuts

```bash
bun run pipeline editor:editing:suggest-cuts \
  --project-id <id> --media-id <id> \
  --include-fillers --include-silences --include-scenes

# Async with polling
bun run pipeline editor:editing:suggest-cuts \
  --project-id <id> --media-id <id> --poll --timeout 120

bun run pipeline editor:editing:suggest-status --project-id <id> --job-id <id>
```

---

## Export Commands

### List presets

```bash
bun run pipeline editor:export:presets
```

### Get recommended settings

```bash
bun run pipeline editor:export:recommend --project-id <id> --target tiktok
```

Targets: `youtube`, `tiktok`, `instagram-reel`, `twitter`, etc.

### Start export

```bash
# With preset
bun run pipeline editor:export:start \
  --project-id <id> --preset youtube-1080p --poll

# Custom settings
bun run pipeline editor:export:start \
  --project-id <id> \
  --data '{"width":1920,"height":1080,"fps":30,"format":"mp4"}' \
  --output-dir ./exports --poll --timeout 600
```

### Job management

```bash
bun run pipeline editor:export:status --project-id <id> --job-id <id>
bun run pipeline editor:export:list-jobs --project-id <id>
```

---

## Diagnostics Commands

```bash
bun run pipeline editor:diagnostics:analyze \
  --message "Canvas rendering failed" \
  --stack "Error at line 42 in renderer.ts"

# With context
bun run pipeline editor:diagnostics:analyze \
  --message "Export stalled at 50%" \
  --data '{"exportFormat":"mp4","resolution":"4k"}'
```

---

## MCP Commands

```bash
# Inline HTML
bun run pipeline editor:mcp:forward-html \
  --html "<h1>Hello World</h1>"

# From file
bun run pipeline editor:mcp:forward-html \
  --html @preview.html --tool-name "my-mcp-tool"
```

---

## All Editor Flags

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project identifier |
| `--media-id` | string | Media file identifier |
| `--element-id` | string | Timeline element identifier |
| `--job-id` | string | Async job identifier |
| `--track-id` | string | Track identifier (comma-separated for multiple) |
| `--to-track` | string | Target track for move operations |
| `--split-time` | number | Split point in seconds |
| `--start-time` | number | Start time in seconds |
| `--end-time` | number | End time in seconds |
| `--new-name` | string | New name for rename operations |
| `--source` | string | Source file path or source specifier |
| `--data` | string | JSON input (inline, `@file.json`, or `-` for stdin) |
| `--changes` | string | JSON changes object |
| `--updates` | string | JSON updates array |
| `--elements` | string | JSON elements array |
| `--cuts` | string | JSON cuts array |
| `--items` | string | JSON items array for batch import |
| `--url` | string | URL for import |
| `--filename` | string | Override filename |
| `--preset` | string | Export preset name |
| `--target` | string | Export target platform |
| `--threshold` | number | Detection threshold (0-1) |
| `--timestamps` | string | Comma-separated timestamps |
| `--gap` | number | Gap between elements / frame interval |
| `--mode` | string | Arrange mode: `sequential`, `spaced`, `manual` |
| `--output-format` | string | Output format |
| `--replace` | boolean | Replace timeline on import |
| `--ripple` | boolean | Ripple edit (close gaps) |
| `--cross-track-ripple` | boolean | Ripple across all tracks |
| `--remove-fillers` | boolean | Remove filler words |
| `--remove-silences` | boolean | Remove silences |
| `--poll` | boolean | Auto-poll async jobs |
| `--poll-interval` | number | Poll interval in seconds |
| `--timeout` | number | Job timeout in seconds |
| `--dry-run` | boolean | Preview changes without applying |
| `--add-to-timeline` | boolean | Auto-add generated content to timeline |
| `--html` | string | HTML content (inline or `@file.html`) |
| `--message` | string | Error message for diagnostics |
| `--stack` | string | Stack trace for diagnostics |
| `--tool-name` | string | MCP tool name |
| `--clear-log` | boolean | Clear log after report |
| `--load-speech` | boolean | Load transcription into Smart Speech panel |

## Batch Limits

| Operation | Max Items |
|-----------|-----------|
| `editor:media:batch-import` | 20 |
| `editor:timeline:batch-add` | 50 |
| `editor:timeline:batch-update` | 50 |
| `editor:timeline:batch-delete` | 50 |

## Async Job Statuses

`queued` | `running` | `completed` | `failed` | `cancelled`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `QCUT_API_HOST` | Override editor API host (default: `127.0.0.1`) |
| `QCUT_API_PORT` | Override editor API port (default: `8765`) |

---

## Screen Recording Commands

### List capture sources

```bash
bun run pipeline editor:screen-recording:sources
```

### Start recording

```bash
bun run pipeline editor:screen-recording:start --source-id <id> --filename "recording.mp4"
```

### Stop recording

```bash
bun run pipeline editor:screen-recording:stop
bun run pipeline editor:screen-recording:stop --discard   # discard recording
```

### Get recording status

```bash
bun run pipeline editor:screen-recording:status
```

---

## UI Commands

### Switch editor panel

```bash
bun run pipeline editor:ui:switch-panel --panel media
```

Available panels: `media`, `text`, `stickers`, `video-edit`, `effects`, `transitions`, `filters`, `text2image`, `nano-edit`, `ai`, `sounds`, `segmentation`, `remotion`, `pty`, `word-timeline`, `project-folder`, `upscale`, `moyin`

---

## Moyin Script Direction Commands

### Set script

```bash
bun run pipeline editor:moyin:set-script --text "Scene 1: A dark room..."
bun run pipeline editor:moyin:set-script --script @screenplay.txt
```

### Parse script

```bash
bun run pipeline editor:moyin:parse
```

Triggers the "Parse Script" button in the director panel.

### Get pipeline status

```bash
bun run pipeline editor:moyin:status
```

Returns `parseStatus` and pipeline step progress.

---

## Screenshot Commands

### Capture screenshot

```bash
bun run pipeline editor:screenshot:capture --filename "qcut-screenshot.png"
```

Takes a screenshot of the QCut editor window.

---

## project.json Schema

The `editor:project:info` command returns structured project state in two modes:

### Minimal mode (default, ~200 tokens)

```json
{
  "version": "1.0",
  "projectId": "abc-123",
  "name": "My Project",
  "createdAt": "2026-03-01T00:00:00.000Z",
  "updatedAt": "2026-03-04T12:00:00.000Z",
  "settings": {
    "width": 1920, "height": 1080, "fps": 30,
    "aspectRatio": "16:9", "outputFormat": "mp4"
  },
  "counts": {
    "media": { "video": 3, "audio": 1, "image": 2 },
    "subtitles": 0, "generated": 0, "tracks": 2, "elements": 5
  },
  "totalDuration": 120.5,
  "lastExport": null,
  "apiKeys": {
    "fal": true, "elevenlabs": false, "openrouter": true,
    "gemini": true, "anthropic": true, "openai": false, "freesound": false
  }
}
```

### Full mode (`--full`, ~2000 tokens)

Adds these arrays to the minimal schema:

| Array | Entry fields |
|-------|-------------|
| `media[]` | `id`, `type`, `name`, `path`, `duration`, `width`, `height`, `fps`, `importedAt` |
| `subtitles[]` | `id`, `mediaId`, `path`, `language`, `wordCount`, `generatedAt` |
| `generated[]` | `id`, `type`, `model`, `prompt`, `path`, `cost`, `generatedAt` |
| `exports[]` | `id`, `path`, `preset`, `format`, `width`, `height`, `size`, `duration`, `exportedAt` |
| `jobs[]` | `jobId`, `command`, `status`, `startedAt`, `completedAt`, `error` |

Also includes full `settings` with `backgroundColor`, `backgroundType`, `outputQuality`, `trackCount`, `elementCount`, `totalDuration`.

### API key status

The `apiKeys` object shows which keys are configured (boolean). Never exposes actual key values. Checked keys: `fal`, `elevenlabs`, `openrouter`, `gemini`, `anthropic`, `openai`, `freesound`.

### Source files

| Component | File |
|-----------|------|
| Schema types | `electron/native-pipeline/cli/project-json-types.ts` |
| Builder | `electron/native-pipeline/cli/project-json-builder.ts` |

---

## Common Workflows

### Import media and add to timeline

```bash
PROJECT=my-project

bun run pipeline editor:media:import --project-id $PROJECT --source /path/to/video.mp4
bun run pipeline editor:media:list --project-id $PROJECT --json
bun run pipeline editor:timeline:add-element \
  --project-id $PROJECT \
  --data '{"type":"video","sourceName":"video.mp4","startTime":0,"duration":30}'
```

### Split and rearrange clips

```bash
PROJECT=my-project

bun run pipeline editor:timeline:export --project-id $PROJECT --json
bun run pipeline editor:timeline:split --project-id $PROJECT --element-id elem-1 --split-time 10
bun run pipeline editor:timeline:delete-element --project-id $PROJECT --element-id elem-1-right
bun run pipeline editor:timeline:arrange --project-id $PROJECT --track-id track-1 --mode sequential
```

### Export for social media

```bash
PROJECT=my-project

bun run pipeline editor:export:recommend --project-id $PROJECT --target tiktok
bun run pipeline editor:export:start --project-id $PROJECT --preset tiktok --poll --timeout 600
```
