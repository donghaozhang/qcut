# QCut Screen Recording — CLI Guide

Quick reference for recording, enhancing, and exporting screen recordings via the QCut CLI.

---

## Prerequisites

```bash
# Start QCut editor (must be running for CLI commands)
bun run electron:dev

# All commands use the pipeline CLI
bun run pipeline <command> [flags]
```

---

## 1. Screen Recording

### List available capture sources

```bash
bun run pipeline editor:screen-recording:sources
```

Returns a list of screens and windows you can record.

### Start recording

```bash
# Record the default screen
bun run pipeline editor:screen-recording:start --project-id <id>

# Record a specific source
bun run pipeline editor:screen-recording:start \
  --project-id <id> \
  --source-id <source-id> \
  --filename my-recording

# Force-stop any existing session first
bun run pipeline editor:screen-recording:start \
  --project-id <id> \
  --force
```

### Stop recording

```bash
# Save the recording
bun run pipeline editor:screen-recording:stop --project-id <id>

# Discard the recording
bun run pipeline editor:screen-recording:stop --project-id <id> --discard
```

### Check status

```bash
bun run pipeline editor:screen-recording:status --project-id <id>
```

### Force-stop (emergency)

```bash
bun run pipeline editor:screen-recording:force-stop --project-id <id>
```

---

## 2. Export with Enhancements

### Basic export

```bash
# Export with a preset
bun run pipeline editor:export:start \
  --project-id <id> \
  --preset youtube-1080p \
  --poll

# Export as GIF
bun run pipeline editor:export:start \
  --project-id <id> \
  --format gif \
  --poll
```

`--poll` waits for the export to finish and reports progress.

### GIF-specific options

```bash
bun run pipeline editor:export:start \
  --project-id <id> \
  --format gif \
  --gif-fps 20 \
  --gif-loop \
  --gif-quality 10 \
  --poll
```

| Flag | Type | Values | Default | Description |
|------|------|--------|---------|-------------|
| `--gif-fps` | number | 15, 20, 25, 30 | preset fps | Frame rate |
| `--gif-loop` | boolean | true/false | true | Loop forever |
| `--gif-quality` | number | 1–20 | 10 | Lower = better visual quality, slower encode |

### Cursor enhancements

```bash
bun run pipeline editor:export:start \
  --project-id <id> \
  --cursor-sway 1.0 \
  --cursor-blur 0.5 \
  --cursor-loop \
  --poll
```

| Flag | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `--cursor-sway` | number | 0–2 | 0 | Natural wobble during movement |
| `--cursor-blur` | number | 0–1 | 0 | Ghost trail on fast movement |
| `--cursor-loop` | boolean | — | false | Smooth return to start for seamless loops |

### Zoom enhancements

```bash
bun run pipeline editor:export:start \
  --project-id <id> \
  --zoom-blur 0.5 \
  --poll
```

| Flag | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `--zoom-blur` | number | 0–1 | 0 | Motion blur during zoom transitions |

### Audio options

```bash
bun run pipeline editor:export:start \
  --project-id <id> \
  --mic \
  --system-audio \
  --poll
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--mic` | boolean | false | Capture microphone audio |
| `--system-audio` | boolean | true | Capture system audio from display |

### Full example — polished GIF with all enhancements

```bash
bun run pipeline editor:export:start \
  --project-id my-project \
  --format gif \
  --gif-fps 25 \
  --gif-loop \
  --gif-quality 8 \
  --cursor-sway 0.8 \
  --cursor-blur 0.3 \
  --cursor-loop \
  --zoom-blur 0.4 \
  --filename demo-recording \
  --poll
```

### Full example — MP4 with audio

```bash
bun run pipeline editor:export:start \
  --project-id my-project \
  --preset youtube-1080p \
  --mic \
  --system-audio \
  --cursor-sway 1.2 \
  --zoom-blur 0.3 \
  --filename tutorial-video \
  --poll
```

---

## 3. Export Job Management

### Check export progress

```bash
bun run pipeline editor:export:status \
  --project-id <id> \
  --job-id <job-id>
```

### List all export jobs

```bash
bun run pipeline editor:export:list-jobs --project-id <id>
```

### Get recommended settings for a platform

```bash
bun run pipeline editor:export:recommend \
  --project-id <id> \
  --target youtube    # youtube | tiktok | instagram | twitter | discord
```

### List available presets

```bash
bun run pipeline editor:export:presets --project-id <id>
```

---

## 4. Record → Enhance → Export Workflow

A typical end-to-end workflow:

```bash
PROJECT=my-project

# 1. List sources, pick one
bun run pipeline editor:screen-recording:sources

# 2. Start recording
bun run pipeline editor:screen-recording:start \
  --project-id $PROJECT \
  --source-id "screen:0:0"

# ... do your demo ...

# 3. Stop recording
bun run pipeline editor:screen-recording:stop --project-id $PROJECT

# 4. Export with enhancements
bun run pipeline editor:export:start \
  --project-id $PROJECT \
  --preset youtube-1080p \
  --cursor-sway 1.0 \
  --cursor-blur 0.3 \
  --zoom-blur 0.3 \
  --mic \
  --system-audio \
  --poll

# 5. Check result
bun run pipeline editor:export:list-jobs --project-id $PROJECT
```

---

## 5. JSON Output

Add `--json` to any command for machine-readable output:

```bash
bun run pipeline editor:screen-recording:status --project-id <id> --json
bun run pipeline editor:export:start --project-id <id> --preset youtube-1080p --json
```

---

## Quick Reference

```text
Screen Recording:
  editor:screen-recording:sources       List capture sources
  editor:screen-recording:start         Start recording [--source-id] [--filename] [--force]
  editor:screen-recording:stop          Stop recording [--discard]
  editor:screen-recording:force-stop    Emergency stop
  editor:screen-recording:status        Check if recording

Export:
  editor:export:presets                 List available presets
  editor:export:recommend              Recommend settings [--target]
  editor:export:start                  Start export [--preset] [--format] [--poll]
                                         GIF:    [--gif-fps] [--gif-loop] [--gif-quality]
                                         Cursor: [--cursor-sway] [--cursor-blur] [--cursor-loop]
                                         Zoom:   [--zoom-blur]
                                         Audio:  [--mic] [--system-audio]
  editor:export:status                 Check job [--job-id]
  editor:export:list-jobs              List all jobs
```
