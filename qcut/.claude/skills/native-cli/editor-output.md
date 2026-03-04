# QCut Editor CLI — Export, Recording & Utilities

See [editor-core.md](editor-core.md) for connection options, flags, and workflows.

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

Available left panels: `media`, `text`, `stickers`, `video-edit`, `effects`, `transitions`, `filters`, `text2image`, `nano-edit`, `ai`, `sounds`, `segmentation`, `remotion`, `pty`, `word-timeline`, `project-folder`, `upscale`, `moyin`

### Switch properties panel tab

```bash
bun run pipeline editor:ui:switch-panel --panel export
bun run pipeline editor:ui:switch-panel --panel api-keys
bun run pipeline editor:ui:switch-panel --panel properties
```

Available properties sub-tabs: `properties`, `export`, `api-keys`

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

## State Control Commands

### Undo / Redo

```bash
bun run pipeline editor:undo --json
bun run pipeline editor:redo --json
```

### State snapshot

```bash
# Full snapshot (all sections)
bun run pipeline editor:state:snapshot --json

# Partial snapshot (specific sections)
bun run pipeline editor:state:snapshot --include timeline,playhead --json
```

**Sections**: `timeline`, `selection`, `playhead`, `media`, `editor` (or `ui`), `project`

For advanced state automation (events, transactions, capabilities, notification bridge), see [editor-state-control.md](editor-state-control.md).
