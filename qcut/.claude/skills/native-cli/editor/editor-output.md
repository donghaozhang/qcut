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

Targets: `youtube` (YouTube), `tiktok` (TikTok), `instagram-reel` (Instagram Reels), `twitter` (X/Twitter), etc.

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

# With cursor + auto-zoom enhancements
bun run pipeline editor:export:start \
  --project-id <id> --preset youtube-1080p \
  --cursor-sway 1.0 --cursor-blur 0.3 --auto-zoom --poll

# GIF export with options
bun run pipeline editor:export:start \
  --project-id <id> --format gif \
  --gif-fps 20 --gif-loop --gif-quality 10 --poll
```

### Enhancement flags

| Flag | Type | Description |
|------|------|-------------|
| `--cursor-sway` | number (0-2) | Spring-smoothed cursor wobble intensity |
| `--cursor-blur` | number (0-1) | Cursor motion blur ghost trail |
| `--cursor-loop` | boolean | Seamless cursor return for loop exports |
| `--auto-zoom` | boolean | Auto-generate zoom regions from cursor clicks/dwells |
| `--zoom-blur` | number (0-1) | Motion blur during zoom transitions |
| `--gif-fps` | number | GIF frame rate (15, 20, 25, 30) |
| `--gif-loop` | boolean | GIF infinite loop |
| `--gif-quality` | number (1-20) | GIF quality (lower = better visual, slower) |
| `--mic` | boolean | Capture microphone audio |
| `--system-audio` | boolean | Capture system audio |

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
# Record default screen
bun run pipeline editor:screen-recording:start --project-id <id>

# Record specific source
bun run pipeline editor:screen-recording:start \
  --project-id <id> --source-id "screen:2:0" --filename my-recording

# Force-stop existing session first
bun run pipeline editor:screen-recording:start --project-id <id> --force
```

### Stop recording

```bash
bun run pipeline editor:screen-recording:stop --project-id <id>
bun run pipeline editor:screen-recording:stop --project-id <id> --discard
```

### Force-stop (emergency)

```bash
bun run pipeline editor:screen-recording:force-stop --project-id <id> --force
```

### Get recording status

```bash
bun run pipeline editor:screen-recording:status --project-id <id>
```

### Record → Enhance → Export workflow

```bash
PROJECT=<project-id>

# 1. List sources
bun run pipeline editor:screen-recording:sources

# 2. Record
bun run pipeline editor:screen-recording:start \
  --project-id $PROJECT --source-id "screen:2:0" --filename demo

# ... do your demo ...

# 3. Stop
bun run pipeline editor:screen-recording:stop --project-id $PROJECT

# 4. Import into project
bun run pipeline editor:media:import \
  --project-id $PROJECT --source ~/Movies/QCut\ Recordings/demo.mp4

# 5. Add to timeline
bun run pipeline editor:timeline:add-element \
  --project-id $PROJECT --data '{"type":"video","mediaId":"<media-id>","startTime":0}'

# 6. Export with enhancements
bun run pipeline editor:export:start \
  --project-id $PROJECT --preset youtube-1080p \
  --cursor-sway 1.0 --cursor-blur 0.3 --auto-zoom --poll
```

Recordings save to `~/Movies/QCut Recordings/` with a `.cursor.json` telemetry sidecar for cursor position tracking. The `--auto-zoom` flag uses this telemetry to generate zoom regions from click clusters and cursor dwell areas.

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
