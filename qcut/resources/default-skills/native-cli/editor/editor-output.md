# QCut Editor CLI — Export, Recording & Utilities

See [editor-core.md](editor-core.md) for connection options, flags, and workflows.

---

## Export Commands

### List presets

```bash
qcut editor:export:presets
```

### Get recommended settings

```bash
qcut editor:export:recommend --project-id <id> --target tiktok
```

Targets: `youtube` (YouTube), `tiktok` (TikTok), `instagram-reel` (Instagram Reels), `twitter` (X/Twitter), etc.

### Start export

```bash
# With preset
qcut editor:export:start \
  --project-id <id> --preset youtube-1080p --poll

# Custom settings
qcut editor:export:start \
  --project-id <id> \
  --data '{"width":1920,"height":1080,"fps":30,"format":"mp4"}' \
  --output-dir ./exports --poll --timeout 600

# With cursor + auto-zoom enhancements
qcut editor:export:start \
  --project-id <id> --preset youtube-1080p \
  --cursor-sway 1.0 --cursor-blur 0.3 --auto-zoom --poll

# GIF export with options
qcut editor:export:start \
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
qcut editor:export:status --project-id <id> --job-id <id>
qcut editor:export:list-jobs --project-id <id>
```

---

## Diagnostics Commands

```bash
qcut editor:diagnostics:analyze \
  --message "Canvas rendering failed" \
  --stack "Error at line 42 in renderer.ts"

# With context
qcut editor:diagnostics:analyze \
  --message "Export stalled at 50%" \
  --data '{"exportFormat":"mp4","resolution":"4k"}'
```

---

## MCP Commands

```bash
# Inline HTML
qcut editor:mcp:forward-html \
  --html "<h1>Hello World</h1>"

# From file
qcut editor:mcp:forward-html \
  --html @preview.html --tool-name "my-mcp-tool"
```

---

## Screen Recording Commands

> **Auto-spawn behaviour (Phase 2 dual-mode recording):** every
> `editor:screen-recording:*` command auto-launches a hidden headless
> QCut if the editor app isn't already running. You do not need to
> start QCut manually. Pass `--no-auto-launch` to opt out and get the
> old "Cannot connect to QCut" error instead.
>
> For a one-shot command that doesn't need the editor UI at all, use
> `qcut record` (see the "Standalone Recording" section below).

### List capture sources

```bash
qcut editor:screen-recording:sources
```

### Start recording

```bash
# Record default screen
qcut editor:screen-recording:start --project-id <id>

# Record specific source
qcut editor:screen-recording:start \
  --project-id <id> --source-id "screen:2:0" --filename my-recording

# Force-stop existing session first
qcut editor:screen-recording:start --project-id <id> --force
```

### Stop recording

```bash
qcut editor:screen-recording:stop --project-id <id>
qcut editor:screen-recording:stop --project-id <id> --discard
```

### Force-stop (emergency)

```bash
qcut editor:screen-recording:force-stop --project-id <id> --force
```

### Get recording status

```bash
qcut editor:screen-recording:status --project-id <id>
```

### Record → Enhance → Export workflow

```bash
PROJECT=<project-id>

# 1. List sources
qcut editor:screen-recording:sources

# 2. Record
qcut editor:screen-recording:start \
  --project-id $PROJECT --source-id "screen:2:0" --filename demo

# ... do your demo ...

# 3. Stop
qcut editor:screen-recording:stop --project-id $PROJECT

# 4. Import into project
qcut editor:media:import \
  --project-id $PROJECT --source ~/Movies/QCut\ Recordings/demo.mp4

# 5. Add to timeline
qcut editor:timeline:add-element \
  --project-id $PROJECT --data '{"type":"video","mediaId":"<media-id>","startTime":0}'

# 6. Export with enhancements
qcut editor:export:start \
  --project-id $PROJECT --preset youtube-1080p \
  --cursor-sway 1.0 --cursor-blur 0.3 --auto-zoom --poll
```

Recordings save to `~/Movies/QCut Recordings/` with a `.cursor.json` telemetry sidecar for cursor position tracking. The `--auto-zoom` flag uses this telemetry to generate zoom regions from click clusters and cursor dwell areas.

### Standalone recording — `qcut record` (no editor needed)

`qcut record` spawns its own hidden QCut instance, captures for a fixed
duration, writes an MP4, and exits. Ideal for scripts and CI jobs where
opening the editor UI is overkill.

```bash
# Record primary screen for 10 seconds
qcut record --record-duration 10 -o demo.mp4

# Pick a source (use editor:screen-recording:sources to discover IDs)
qcut record --source "screen:0:0" --record-duration 15 -o demo.mp4

# Interactive — press Ctrl-C to stop
qcut record -o long-demo.mp4
```

| Flag | Description |
|------|-------------|
| `--record-duration` | Auto-stop after N seconds (omit for Ctrl-C mode) |
| `--source` | Capture source ID (default: primary screen) |
| `--output`, `-o` | Output file name (default: `recording-<ts>.mp4`) |
| `--cursor-sway` | Cursor wobble 0–2 (export compositor) |
| `--cursor-loop` | Smooth loop return for cursor path |
| `--zoom-blur` | Motion blur during zoom transitions 0–1 |
| `--mic` | Capture microphone audio |
| `--system-audio` | Capture system audio (default: true) |
| `--no-auto-launch` | Fail if no headless recorder can be spawned |

### Daemon management — `qcut record-daemon`

When `editor:screen-recording:*` auto-spawns a headless recorder, it
stays alive for 30s of inactivity to amortise cold-start across
subsequent CLI calls. Manual control is rarely needed but available:

```bash
qcut record-daemon             # --status (default): print pid + port
qcut record-daemon --stop      # SIGTERM the running daemon
qcut record-daemon --start     # Spawn a daemon explicitly (no-op if one is running)
```

State files: `~/.qcut/.headless-record.pid` and `~/.qcut/.headless-record.port`.

See [docs/task/recordly/22-cli-standalone-phase1-record-command.md] and
[docs/task/recordly/23-cli-standalone-phase2-editor-commands.md] for
architecture details.

---

## UI Commands

### Switch editor panel

```bash
qcut editor:ui:switch-panel --panel media
```

Available left panels: `media`, `text`, `stickers`, `video-edit`, `effects`, `transitions`, `filters`, `text2image`, `nano-edit`, `ai`, `sounds`, `segmentation`, `remotion`, `pty`, `word-timeline`, `project-folder`, `upscale`, `moyin`

### Switch properties panel tab

```bash
qcut editor:ui:switch-panel --panel export
qcut editor:ui:switch-panel --panel api-keys
qcut editor:ui:switch-panel --panel properties
```

Available properties sub-tabs: `properties`, `export`, `api-keys`

---

## Moyin Script Direction Commands

### Set script

```bash
qcut editor:moyin:set-script --text "Scene 1: A dark room..."
qcut editor:moyin:set-script --script @screenplay.txt
```

### Parse script

```bash
qcut editor:moyin:parse
```

Triggers the "Parse Script" button in the director panel.

### Get pipeline status

```bash
qcut editor:moyin:status
```

Returns `parseStatus` and pipeline step progress.

---

## Screenshot Commands

### Capture screenshot

```bash
qcut editor:screenshot:capture --filename "qcut-screenshot.png"
```

Takes a screenshot of the QCut editor window.

---

## State Control Commands

### Undo / Redo

```bash
qcut editor:undo --json
qcut editor:redo --json
```

### State snapshot

```bash
# Full snapshot (all sections)
qcut editor:state:snapshot --json

# Partial snapshot (specific sections)
qcut editor:state:snapshot --include timeline,playhead --json
```

**Sections**: `timeline`, `selection`, `playhead`, `media`, `editor` (or `ui`), `project`

For advanced state automation (events, transactions, capabilities, notification bridge), see [editor-state-control.md](editor-state-control.md).
