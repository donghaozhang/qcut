# QCut Editor CLI — Core Commands

Core `editor:*` commands for controlling a running QCut desktop instance. Commands are split across these files:

- **editor-core.md** (this file) — Quick start, connection, flags, workflows
- [editor-media.md](editor-media.md) — Media & Project commands, project.json schema
- [editor-timeline.md](editor-timeline.md) — Timeline & Editing commands
- [editor-output.md](editor-output.md) — Export, Diagnostics, MCP, Screen Recording, UI, Moyin, Screenshots, State Control

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

## All Editor Flags

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project identifier |
| `--media-id` | string | Media file identifier |
| `--element-id` | string | Timeline element identifier |
| `--job-id` | string | Async job identifier |
| `--track-id` | string | Track identifier (comma-separated for multiple) |
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
| `--include` | string | Comma-separated state sections for `editor:state:snapshot` |

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
