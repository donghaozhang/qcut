# Sticker CLI Plan

Add native CLI commands for placing stickers on the timeline with precise position, time, and size control.

## Current State

### What exists:
- **Timeline type:** `StickerElement` in `packages/editor-core/src/types/timeline.ts`
  - Fields: `stickerId`, `mediaId` (inherits `x`, `y`, `width`, `height`, `rotation` from `BaseTimelineElement`)
- **FFmpeg export:** `ffmpeg-args-builder.ts` supports `stickerFilterChain` + `stickerSources` for overlay compositing
- **Export handler:** `ffmpeg-export-handler.ts` validates sticker config and disables direct copy when stickers present
- **E2E test:** `electron/__tests__/sticker-export-real.test.ts` — verifies FFmpeg overlay pipeline
- **UI panel:** `editor:ui:switch-panel --panel stickers` switches to sticker browser
- **Timeline ops:** `claude-timeline-operations.ts` recognizes `"sticker"` type for track routing

### What's missing:
- **No CLI command** to list available stickers
- **No CLI command** to add a sticker with position/time params
- **No CLI command** to update sticker position/size after placement
- **No HTTP API endpoint** for sticker catalog browsing
- Generic `editor:timeline:add-element` works but requires knowing internal `stickerId` and `mediaId`

## Proposed CLI Commands

### 1. `editor:sticker:list`

List available stickers from the sticker catalog.

```bash
bun run pipeline editor:sticker:list [--category <name>] [--search <query>] [--limit <n>] --json
```

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--category` | `-c` | string | Filter by category (e.g. "emoji", "animals", "arrows") |
| `--search` | `-q` | string | Search stickers by name/tag |
| `--limit` | `-n` | number | Max results (default: 20) |

**Output:**
```json
{
  "stickers": [
    {
      "stickerId": "stk_emoji_thumbsup",
      "name": "Thumbs Up",
      "category": "emoji",
      "previewUrl": "/stickers/emoji/thumbsup.png",
      "width": 256,
      "height": 256
    }
  ]
}
```

### 2. `editor:sticker:add`

Add a sticker to the timeline at a specific position and time range.

```bash
bun run pipeline editor:sticker:add \
  --project-id <PID> \
  --sticker-id <ID> \
  --x <pixels> \
  --y <pixels> \
  --time-start <seconds> \
  --time-end <seconds> \
  [--width <pixels>] \
  [--height <pixels>] \
  [--rotation <degrees>] \
  [--opacity <0-1>] \
  --json
```

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--project-id` | `-p` | string | | Project ID (required) |
| `--sticker-id` | `-s` | string | | Sticker ID from catalog (required) |
| `--x` | | number | 0 | X position in pixels from left |
| `--y` | | number | 0 | Y position in pixels from top |
| `--time-start` | | number | 0 | Start time in seconds on timeline |
| `--time-end` | | number | | End time in seconds (required) |
| `--width` | `-w` | number | auto | Width in pixels (auto = original size) |
| `--height` | `-h` | number | auto | Height in pixels (auto = aspect ratio) |
| `--rotation` | `-r` | number | 0 | Rotation in degrees |
| `--opacity` | | number | 1.0 | Opacity (0 = transparent, 1 = opaque) |

**Example:**
```bash
# Place a thumbs-up emoji at center-bottom, visible from 2s to 5s
bun run pipeline editor:sticker:add \
  --project-id abc-123 \
  --sticker-id stk_emoji_thumbsup \
  --x 860 --y 900 \
  --time-start 2 --time-end 5 \
  --width 200 --height 200 \
  --json
```

**Output:**
```json
{
  "elementId": "element_xxx_yyy",
  "stickerId": "stk_emoji_thumbsup",
  "position": { "x": 860, "y": 900 },
  "time": { "start": 2, "end": 5 },
  "size": { "width": 200, "height": 200 }
}
```

### 3. `editor:sticker:add-custom`

Add a custom image file as a sticker overlay (not from catalog).

```bash
bun run pipeline editor:sticker:add-custom \
  --project-id <PID> \
  --source <path-to-image> \
  --x <pixels> --y <pixels> \
  --time-start <seconds> --time-end <seconds> \
  [--width <pixels>] [--height <pixels>] \
  [--rotation <degrees>] [--opacity <0-1>] \
  --json
```

| Flag | Type | Description |
|------|------|-------------|
| `--source` | string | Path to image file (PNG/JPG/WebP/GIF) — required |

This imports the image as media first, then places it as a sticker overlay.

### 4. `editor:sticker:update`

Update position, size, or time of an existing sticker element.

```bash
bun run pipeline editor:sticker:update \
  --project-id <PID> \
  --element-id <EID> \
  [--x <pixels>] [--y <pixels>] \
  [--time-start <seconds>] [--time-end <seconds>] \
  [--width <pixels>] [--height <pixels>] \
  [--rotation <degrees>] [--opacity <0-1>] \
  --json
```

### 5. `editor:sticker:remove`

Remove a sticker from the timeline.

```bash
bun run pipeline editor:sticker:remove --project-id <PID> --element-id <EID> --json
```

## Implementation Plan

### Phase 1: Core Commands (MVP)

**Files to create:**
- `electron/native-pipeline/cli/cli-handlers-sticker.ts` — Handler implementations
- HTTP route additions in `electron/claude/http/claude-http-shared-routes.ts`

**Files to modify:**
- `electron/native-pipeline/cli/command-registry-editor.ts` — Register new commands
- `electron/native-pipeline/cli/cli-runner/runner.ts` — Route to sticker handler
- `electron/native-pipeline/cli/cli-runner/types.ts` — Add sticker command types
- `electron/claude/handlers/claude-timeline-operations.ts` — Add sticker placement helper

**Steps:**
1. Add `editor:sticker:list` — Query sticker catalog via IPC/HTTP
2. Add `editor:sticker:add` — Create `StickerElement` with position/time params
3. Add `editor:sticker:add-custom` — Import image → create sticker element
4. Add `editor:sticker:update` — Update element via `editor:timeline:update-element`
5. Add `editor:sticker:remove` — Delete element via existing timeline delete

### Phase 2: Enhanced Features

- **Batch add:** `editor:sticker:batch-add` — Place multiple stickers in one call
- **Preset positions:** `--position center|top-left|top-right|bottom-left|bottom-right` shorthand
- **Animation:** `--animate fade-in|slide-in|bounce` with `--animate-duration` 
- **Sticker search API:** Full-text search across sticker names/tags

## Coordinate System

```
(0,0) ─────────────────────────── (1920,0)
  │                                    │
  │    Sticker at (860, 900)           │
  │    ┌──────┐                        │
  │    │ 👍   │ 200×200px              │
  │    └──────┘                        │
  │                                    │
(0,1080) ──────────────────────── (1920,1080)
```

- Origin (0,0) = top-left corner
- X increases right, Y increases down
- Coordinates are in **output resolution pixels** (e.g. 1920×1080 for youtube-1080p)
- Sticker anchor point = top-left corner of sticker bounding box

## Timeline Placement

```
Timeline:
0s ────────────────────────────── 30s
         │← sticker visible →│
      time-start=5        time-end=15

duration = time-end - time-start = 10s
startTime = time-start = 5s
```

## Testing

```bash
# List stickers
bun run pipeline editor:sticker:list --json

# Add sticker at center, visible 2-5s
bun run pipeline editor:sticker:add -p <PID> -s stk_emoji_fire \
  --x 860 --y 440 --time-start 2 --time-end 5 --width 200 --json

# Add custom image as sticker
bun run pipeline editor:sticker:add-custom -p <PID> \
  --source /tmp/logo.png --x 50 --y 50 \
  --time-start 0 --time-end 10 --width 100 --json

# Export and verify sticker appears in output
bun run pipeline editor:export:start -p <PID> --preset youtube-1080p \
  --filename sticker-test.mp4 --poll --json
```

## Success Criteria

- [ ] `editor:sticker:list` returns available stickers with IDs
- [ ] `editor:sticker:add` places sticker at exact x/y coordinates
- [ ] Sticker appears at correct time range in exported video
- [ ] Custom image sticker works (PNG with transparency)
- [ ] `editor:sticker:update` moves/resizes existing sticker
- [ ] `editor:sticker:remove` cleanly removes from timeline
- [ ] FFmpeg export correctly overlays stickers at specified positions
