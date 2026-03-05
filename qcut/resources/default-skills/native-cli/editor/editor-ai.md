# QCut Editor CLI — AI & Analysis Commands

AI-powered `editor:*` commands: video analysis, transcription, content generation, Remotion generation, and editor navigation.

Requires QCut running (e.g., `bun run electron:dev` for dev or `bun run electron` for packaged mode). See [editor-core.md](editor-core.md) for connection options and JSON input modes.

---

## Video Analysis Commands

### Analyze video

```bash
# By media ID
bun run pipeline editor:analyze:video \
  --project-id <id> \
  --source "media:<media-id>" \
  --analysis-type describe \
  --model gemini

# By file path
bun run pipeline editor:analyze:video \
  --project-id <id> \
  --source "path:/path/to/video.mp4"

# By timeline element
bun run pipeline editor:analyze:video \
  --project-id <id> \
  --source "timeline:<element-id>"

# Custom prompt with JSON output
bun run pipeline editor:analyze:video \
  --project-id <id> \
  --source "media:<id>" \
  --prompt "Count people in each scene" \
  --output-format json
```

Source format: `media:<id>`, `path:/file/path`, `timeline:<elementId>`, or bare `/file/path`

### List analysis models

```bash
bun run pipeline editor:analyze:models
```

### Detect scenes

```bash
bun run pipeline editor:analyze:scenes \
  --project-id <id> \
  --media-id <id> \
  --threshold 0.5 \
  --model gemini
```

`--threshold` is a float 0-1. Lower values detect more scene changes.

### Analyze frames

```bash
# At specific timestamps
bun run pipeline editor:analyze:frames \
  --project-id <id> \
  --media-id <id> \
  --timestamps "0,5,10,15,20"

# At regular intervals
bun run pipeline editor:analyze:frames \
  --project-id <id> \
  --media-id <id> \
  --gap 5 \
  --prompt "Describe the mood of this frame"
```

### Detect filler words

```bash
# Auto-transcribe and detect fillers
bun run pipeline editor:analyze:fillers \
  --project-id <id> \
  --media-id <id>

# With pre-existing word data
bun run pipeline editor:analyze:fillers \
  --project-id <id> \
  --data @words.json
```

### Analysis options

| Flag | Type | Description |
|------|------|-------------|
| `--source` | string | Source: `media:<id>`, `path:/file`, `timeline:<id>` |
| `--media-id` | string | Media file identifier |
| `--analysis-type` | string | `describe`, `summary`, custom |
| `--model` | string | AI model key (e.g., `gemini`) |
| `--output-format` | string | `json`, `md` |
| `--prompt` | string | Custom analysis prompt |
| `--threshold` | number | Scene detection threshold (0-1) |
| `--timestamps` | string | Comma-separated frame timestamps |
| `--gap` | number | Interval in seconds between frames |

---

## Transcription Commands

### Transcribe (synchronous)

```bash
bun run pipeline editor:transcribe:run \
  --project-id <id> \
  --media-id <id> \
  --language en \
  --provider deepgram

# Transcribe and load into Smart Speech panel
bun run pipeline editor:transcribe:run \
  --project-id <id> \
  --media-id <id> \
  --load-speech
```

### Transcribe (async with polling)

```bash
# Start and poll until complete
bun run pipeline editor:transcribe:start \
  --project-id <id> \
  --media-id <id> \
  --poll \
  --poll-interval 2 \
  --timeout 120

# Transcribe, poll, and load into Smart Speech panel
bun run pipeline editor:transcribe:start \
  --project-id <id> \
  --media-id <id> \
  --poll \
  --load-speech
```

The `--load-speech` flag sends the result to the Smart Speech panel. Words appear as clickable chips for timestamp navigation.

### Job management

```bash
bun run pipeline editor:transcribe:status --project-id <id> --job-id <id>
bun run pipeline editor:transcribe:list-jobs --project-id <id>
bun run pipeline editor:transcribe:cancel --project-id <id> --job-id <id>
```

### Transcription options

| Flag | Type | Description |
|------|------|-------------|
| `--language` | string | Language code (e.g., `en`, `zh`) |
| `--provider` | string | Provider (e.g., `deepgram`) |
| `--no-diarize` | boolean | Disable speaker diarization |
| `--load-speech` | boolean | Load result into Smart Speech panel |
| `--poll` | boolean | Auto-poll until complete |
| `--poll-interval` | number | Poll interval in seconds (default: 3) |
| `--timeout` | number | Job timeout in seconds (default: 300) |

---

## Generation Commands

AI content generation within the editor.

### Start generation

```bash
# Text-to-image/video
bun run pipeline editor:generate:start \
  --project-id <id> \
  --model flux_dev \
  --text "A beautiful sunset" \
  --aspect-ratio "16:9"

# Image-to-video
bun run pipeline editor:generate:start \
  --project-id <id> \
  --model kling_2_6_pro \
  --text "The scene comes alive" \
  --image-url "/path/to/image.png" \
  --duration 5

# With polling
bun run pipeline editor:generate:start \
  --project-id <id> \
  --model flux_dev \
  --text "Ocean waves" \
  --poll --poll-interval 5

# Auto-add to timeline
bun run pipeline editor:generate:start \
  --project-id <id> \
  --model flux_dev \
  --text "Title card" \
  --add-to-timeline --track-id track-1 --start-time 0
```

### Job management

```bash
bun run pipeline editor:generate:status --project-id <id> --job-id <id>
bun run pipeline editor:generate:list-jobs --project-id <id>
bun run pipeline editor:generate:cancel --project-id <id> --job-id <id>
```

### List generation models

```bash
bun run pipeline editor:generate:models
```

### Estimate cost

```bash
bun run pipeline editor:generate:estimate-cost \
  --model kling_2_6_pro --duration 10 --resolution 1080p
```

### Generation flags

| Flag | Type | Description |
|------|------|-------------|
| `--model` | string | Model key (required) |
| `--text` | string | Generation prompt |
| `--image-url` | string | Input image for image-to-video |
| `--aspect-ratio` | string | e.g., `16:9` |
| `--duration` | string | Duration in seconds, e.g., `5` |
| `--add-to-timeline` | boolean | Auto-add result to timeline |
| `--track-id` | string | Target track (with `--add-to-timeline`) |
| `--start-time` | number | Timeline position (with `--add-to-timeline`) |

**Suggest-cuts flags** (used with `editor:suggest-cuts`, not generation):

| Flag | Type | Description |
|------|------|-------------|
| `--include-fillers` | boolean | Include filler detection in suggest-cuts |
| `--include-silences` | boolean | Include silence detection in suggest-cuts |
| `--include-scenes` | boolean | Include scene detection in suggest-cuts |

---

## Remotion Generation Command

Generate Remotion animation projects from text prompts using Claude Code with best-practice skills.

### Basic generation

```bash
bun run pipeline generate-remotion \
  --prompt "a bouncing ball with trail effect"

# Custom duration and component name
bun run pipeline generate-remotion \
  --prompt "a cinematic title card with particle effects" \
  --duration 8 \
  --filename "TitleCard"
```

### Generate and add to timeline

```bash
bun run pipeline generate-remotion \
  --prompt "A sleek QCut promotional demo" \
  --duration 8 \
  --add-to-timeline \
  --project-id <id>
```

### How it works

1. Locates the Remotion skill at `.agents/skills/remotion-best-practices/SKILL.md`
2. Invokes `claude -p` with all tools — Claude reads the skill, learns best practices, then writes files
3. Generates a folder at `output/<ComponentName>/src/`:
   - `Root.tsx` — `<Composition>` declarations
   - `<ComponentName>.tsx` — main animation component
   - `package.json` — minimal dependencies
4. When `--add-to-timeline` is set: imports via `remotion-folder:import` pipeline

### Remotion options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--prompt` / `-t` | string | (required) | Animation description |
| `--filename` | string | from prompt | Component name (PascalCase) |
| `--duration` / `-d` | number | `5` | Duration in seconds |
| `--output-dir` / `-o` | string | `./output` | Output directory |
| `--add-to-timeline` | boolean | `false` | Import to editor timeline |
| `--project-id` | string | - | Project ID (required with `--add-to-timeline`) |

### Remotion constraints

- Animations driven by `useCurrentFrame()` + `interpolate()` with `extrapolateRight: "clamp"`
- CSS animations and Tailwind animation classes forbidden
- Inline styles only — no external CSS
- No dependencies beyond `remotion` and `react`
- Fixed canvas: 1920x1080 at 30fps

---

## Editor Remotion Commands

Manage Remotion animation elements on the timeline.

### List Remotion elements

```bash
bun run pipeline editor:remotion:list --project-id <id>
```

### Inspect element

```bash
bun run pipeline editor:remotion:inspect --project-id <id> --element-id <id>
```

### Update element props

```bash
bun run pipeline editor:remotion:update-props \
  --project-id <id> \
  --element-id <id> \
  --data '{"color":"#ff0000","speed":2}'
```

### Export with Remotion engine

```bash
bun run pipeline editor:remotion:export --project-id <id> --preset default
```

---

## Editor Navigator Commands

List projects and navigate the running QCut editor.

### List all projects

```bash
bun run pipeline editor:navigator:projects
```

Returns project list with `id`, `name`, `createdAt`, `updatedAt`, and `activeProjectId`.

### Open project in editor

```bash
bun run pipeline editor:navigator:open --project-id <id>
```

Navigates the editor to the project, loads timeline, media, and skills.

---

## Common Workflows

### End-to-end: Generate Remotion and preview

```bash
bun run pipeline editor:navigator:projects
bun run pipeline editor:navigator:open --project-id <id>
bun run pipeline generate-remotion \
  --prompt "a bouncing ball" --duration 5 \
  --add-to-timeline --project-id <id>
bun run pipeline editor:timeline:export --project-id <id>
```

### Analyze video, then auto-edit

```bash
PROJECT=<id>  MEDIA=<media-id>  ELEMENT=<element-id>

bun run pipeline editor:analyze:scenes --project-id $PROJECT --media-id $MEDIA --threshold 0.3
bun run pipeline editor:analyze:frames --project-id $PROJECT --media-id $MEDIA --gap 10
bun run pipeline editor:transcribe:start --project-id $PROJECT --media-id $MEDIA --poll --load-speech
bun run pipeline editor:editing:auto-edit \
  --project-id $PROJECT --element-id $ELEMENT --media-id $MEDIA \
  --remove-fillers --remove-silences --poll
```

### Generate AI content and add to timeline

```bash
bun run pipeline editor:generate:start \
  --project-id <id> --model flux_dev \
  --text "Professional title card: QCut Tutorial" \
  --add-to-timeline --poll
```

---

## Key Source Files

| Component | File |
|-----------|------|
| Editor command dispatch | `electron/native-pipeline/cli/cli-handlers-editor.ts` |
| Analysis handlers | `electron/native-pipeline/editor/editor-handlers-analysis.ts` |
| Remotion handler | `electron/native-pipeline/cli/cli-handlers-remotion.ts` |
| Navigator IPC handler | `electron/claude/handlers/claude-navigator-handler.ts` |
| Navigator bridge | `apps/web/src/lib/claude-bridge/claude-navigator-bridge.ts` |
| Remotion skills | `.agents/skills/remotion-best-practices/SKILL.md` |
| HTTP API server | `electron/claude/http/claude-http-server.ts` |
