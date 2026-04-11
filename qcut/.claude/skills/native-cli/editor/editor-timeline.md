# QCut Editor CLI — Timeline & Editing Commands

See [editor-core.md](editor-core.md) for connection options, flags, and workflows.

---

## Timeline Commands

### Export timeline

```bash
qcut editor:timeline:export --project-id <id>
qcut editor:timeline:export --project-id <id> --json
qcut editor:timeline:export --project-id <id> --output-format json
```

### Import timeline

```bash
qcut editor:timeline:import \
  --project-id <id> \
  --data '{"name":"My Timeline","tracks":[{"id":"t1","type":"video","elements":[]}]}'

# From file / replace existing
qcut editor:timeline:import --project-id <id> --data @timeline.json --replace
```

**Notes**: Track `index` is optional (auto-assigned). Use `sourceName` (filename) in element data, not `mediaId`.

### Add element

```bash
# Media element (use sourceName to link to imported media)
qcut editor:timeline:add-element \
  --project-id <id> \
  --data '{"type":"video","sourceName":"my-video.mp4","startTime":0,"duration":10,"trackId":"track-1"}'

# Text element
qcut editor:timeline:add-element \
  --project-id <id> \
  --data '{"type":"text","content":"Hello World","startTime":0,"duration":5}'
```

### Batch add elements (max 50)

Each element **must** include `trackId`.

```bash
qcut editor:timeline:batch-add \
  --project-id <id> \
  --elements '[{"type":"text","content":"Title","startTime":0,"trackId":"track-1"},{"type":"text","content":"End","startTime":10,"trackId":"track-1"}]'
```

### Update element

```bash
qcut editor:timeline:update-element \
  --project-id <id> \
  --element-id <id> \
  --changes '{"startTime":5,"duration":15}'
```

### Batch update elements (max 50)

```bash
qcut editor:timeline:batch-update \
  --project-id <id> \
  --updates '[{"elementId":"e1","changes":{"startTime":0}},{"elementId":"e2","changes":{"startTime":10}}]'
```

### Delete element

```bash
qcut editor:timeline:delete-element \
  --project-id <id> \
  --element-id <id>
```

### Batch delete elements (max 50)

```bash
# Simple: plain element ID array
qcut editor:timeline:batch-delete \
  --project-id <id> \
  --cuts '["elem1","elem2","elem3"]' \
  --ripple

# Explicit: with trackId per element
qcut editor:timeline:batch-delete \
  --project-id <id> \
  --cuts '[{"trackId":"t1","elementId":"elem1"}]' \
  --ripple
```

### Split element

```bash
qcut editor:timeline:split \
  --project-id <id> \
  --element-id <id> \
  --split-time 10
```

### Move element

```bash
qcut editor:timeline:move \
  --project-id <id> \
  --element-id <id> \
  --time 15.0
```

### Arrange elements on a track

```bash
# Sequential (end-to-end, no gaps)
qcut editor:timeline:arrange \
  --project-id <id> --track-id <id> --mode sequential

# Spaced (with gap)
qcut editor:timeline:arrange \
  --project-id <id> --track-id <id> --mode spaced --gap 2.0

# Manual order
qcut editor:timeline:arrange \
  --project-id <id> --track-id <id> --mode manual \
  --data '["elem3","elem1","elem2"]' --start-time 0
```

### Selection

```bash
qcut editor:timeline:select \
  --project-id <id> \
  --elements '[{"trackId":"t1","elementId":"e1"}]'

qcut editor:timeline:get-selection --project-id <id>
qcut editor:timeline:clear-selection --project-id <id>
```

### Get timeline info

```bash
qcut editor:timeline:info --project-id <id> --json
```

Returns timeline state: tracks, elements, duration, playhead position.

### Add media clip to timeline

```bash
qcut editor:timeline:add-clip --project-id <id> --media-id <media-id>
qcut editor:timeline:add-clip --project-id <id> --media-id <media-id> --track-id <track-id> --start-time 5.0
```

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |
| `--media-id` | string | Media ID to add (required) |
| `--track-id` | string | Target track ID |
| `--start-time` | number | Start position in seconds |

### Trim element

```bash
qcut editor:timeline:trim --project-id <id> --element-id <eid> --start-time 2.0 --end-time 8.0
```

| Flag | Type | Description |
|------|------|-------------|
| `--project-id` | string | Project ID (required) |
| `--element-id` | string | Element ID (required) |
| `--start-time` | number | New start time in seconds (required) |
| `--end-time` | number | New end time in seconds (required) |

### Playback controls

```bash
qcut editor:timeline:play --project-id <id>
qcut editor:timeline:pause --project-id <id>
qcut editor:timeline:toggle-play --project-id <id>
qcut editor:timeline:seek --project-id <id> --time 15.0
```

---

## Editing Commands

### Batch cuts

```bash
qcut editor:editing:batch-cuts \
  --project-id <id> \
  --element-id <id> \
  --cuts '[{"start":2,"end":4},{"start":8,"end":10}]' \
  --ripple
```

### Delete time range

```bash
qcut editor:editing:delete-range \
  --project-id <id> \
  --start-time 5.0 \
  --end-time 15.0 \
  --ripple

# Limit to specific tracks
qcut editor:editing:delete-range \
  --project-id <id> \
  --start-time 5.0 --end-time 15.0 \
  --track-id "track-1,track-2" \
  --cross-track-ripple
```

### Auto-edit (remove fillers/silences)

```bash
# Synchronous
qcut editor:editing:auto-edit \
  --project-id <id> --element-id <id> --media-id <id> \
  --remove-fillers --remove-silences --threshold 0.5

# Async with polling
qcut editor:editing:auto-edit \
  --project-id <id> --element-id <id> --media-id <id> \
  --remove-fillers --poll --poll-interval 2

# Dry run
qcut editor:editing:auto-edit \
  --project-id <id> --element-id <id> --media-id <id> \
  --remove-silences --dry-run
```

### Auto-edit job management

```bash
qcut editor:editing:auto-edit-status --project-id <id> --job-id <id>
qcut editor:editing:auto-edit-list --project-id <id>
```

### AI-suggested cuts

```bash
qcut editor:editing:suggest-cuts \
  --project-id <id> --media-id <id> \
  --include-fillers --include-silences --include-scenes

# Async with polling
qcut editor:editing:suggest-cuts \
  --project-id <id> --media-id <id> --poll --timeout 120

qcut editor:editing:suggest-status --project-id <id> --job-id <id>
```
