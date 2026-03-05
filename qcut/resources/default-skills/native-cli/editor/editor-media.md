# QCut Editor CLI — Media & Project Commands

See [editor-core.md](editor-core.md) for connection options, flags, and workflows.

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
