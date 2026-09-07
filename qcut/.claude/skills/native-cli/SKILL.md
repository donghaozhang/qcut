---
name: native-cli
description: Run QCut's native TypeScript CLI (`qcut`) for AI content generation, video analysis, transcription, YAML pipelines, ViMax agentic video production, compose manifests, the Filter/Effect/Text/Sticker labs, Jianying draft interop, and project management. Also use for editor HTTP automation (state snapshots, events, transactions, tracks, stickers, pointer input, and notification bridge control) when the user needs deterministic state-aware control of a running QCut editor.
argument-hint: [group] [action] [--flags]
---

# Native Pipeline CLI Skill

Run QCut's built-in TypeScript CLI (`qcut`, legacy name `qcut-pipeline`).

## Active CLI Version

- Active native CLI version: `1.0.0`
- Verify with: `qcut --version`
- Inventory on 2026-09-07: 280 registered commands in 14 groups (163 of them
  under `editor`). Check `qcut --help --json` for the live list.

## Additional resources

- For standalone CLI commands (generate, analyze, transcribe, autoclip, models, help, output formats), see [REFERENCE.md](references/REFERENCE.md)
- For audio/voice generation, Kling elements, analysis indexes, edit planning and cleanup, portrait, subtitles, sound/sticker search, Phota, Replicate, the newer ViMax stages, `system update/doctor/keys`, and `instances`, see [reference-media-extras.md](references/reference-media-extras.md)
- For `compose`, `filter-lab`, `effect-lab`, `text-lab`, `sticker-lab`, `transition`, `draft` (Jianying import/export), and `edit deflicker`, see [reference-labs-compose.md](references/reference-labs-compose.md)
- For YAML pipelines, API key management, project management, see [reference-pipelines.md](references/reference-pipelines.md)
- For ViMax commands (idea2video, script2video, novel2movie, scenes, portraits), see [reference-vimax.md](references/reference-vimax.md)
- For editor core reference: connection, flags, batch limits, env vars, common workflows, see [editor-core.md](editor/editor-core.md)
- For editor media & project commands, project.json schema, see [editor-media.md](editor/editor-media.md)
- For editor timeline & editing commands, see [editor-timeline.md](editor/editor-timeline.md)
- For editor tracks, element patching, timeline manifests, stickers, transcript search, audio/caption export, keyboard, UI waits, demo runs, Moyin, and pointer automation, see [editor-tracks-stickers-search.md](editor/editor-tracks-stickers-search.md)
- For editor export, diagnostics, MCP, screen recording, UI, screenshots, state control, see [editor-output.md](editor/editor-output.md)
- For editor AI commands: video analysis, transcription, AI generation, Remotion, navigator, see [editor-ai.md](editor/editor-ai.md)
- For editor state automation: snapshots, event streams, correlation IDs, transactions, capabilities, and notification bridge endpoints, see [editor-state-control.md](editor/editor-state-control.md)
- For agent automation: accessibility snapshots with refs, console capture, visual diffs, session persistence, and action policy, see [editor-agent.md](editor/editor-agent.md)
- For source file locations by responsibility (core, output, handlers, state, auth), see [reference-source-files.md](references/reference-source-files.md)
- For proxy mode, credit system, and admin tester management, see [reference-proxy-credits.md](references/reference-proxy-credits.md)

## Step 1: Ensure QCut is Running

Before any `editor` command, check if QCut is running. If not, build and launch it.

```bash
# Check if QCut is running
qcut editor health --status-only --json || echo "NOT_RUNNING"
```

If NOT_RUNNING:

```bash
bun run build                # Build first (source checkout)
bun run electron &           # Launch in background
sleep 5                      # Wait for startup
```

Only one QCut instance runs per user-data directory; a second launch exits
silently. With several editors open, pick the target with
`qcut instances list --json` and `qcut instances use --port <port>`.

## Step 2: Find Project, Media & Timeline

Most editor commands need `--project-id`, `--media-id`, or `--element-id`. Run these to discover them.

```bash
# 1. List projects → get project-id
qcut editor navigator projects --json

# 2. Open a project (navigates the editor)
qcut editor navigator open --project-id <project-id> --json

# 3. Switch to editor panel (navigator open lands on the landing page, NOT the editor)
qcut editor ui switch-panel --panel video-edit --json

# 4. List media → get media-id values
qcut editor media list --project-id <project-id> --json

# 5. Export timeline → get track-id and element-id values
qcut editor timeline export --project-id <project-id> --json
```

Now you have the IDs needed for all other editor commands.

## How to Run

```bash
qcut <group> <action> [options]            # Group syntax (preferred)
qcut editor <area> <action> [options]      # Editor commands are three-level
qcut <command> [options]                   # Legacy flat syntax (e.g. editor:timeline:export)
qcut-pipeline <group> <action> [options]   # Legacy binary name, same CLI
```

Where the `qcut` binary comes from:

- Source checkout: `bun run qcut -- <args>` runs the TypeScript entry directly;
  `bun run build` produces `dist/electron/native-pipeline/cli/cli.js`, which
  `package.json` exposes as the `qcut` and `qcut-pipeline` bins. Rebuild after
  adding registry entries or handlers.
- Packaged desktop app: the same `cli.js` ships inside `app.asar`. Run it with
  `ELECTRON_RUN_AS_NODE=1 "<QCut executable>" "<Resources>/app.asar/electron/native-pipeline/cli/cli.js" <args>`;
  the agent plugin runner resolves this automatically and also honors
  `QCUT_CLI_PATH`.

## Output Directory Contract

For website Daytona Chat Agent sessions, uploaded files are under
`/tmp/qcut-input` and downloadable outputs must land under
`/tmp/qcut-output`.

For image generation, the CLI default model is `gpt_image_2_ima`. Do not pass
`--model/-m` unless the user explicitly requests a specific image model.

The CLI default output directory is `$QCUT_OUTPUT_DIR` or
`~/Documents/QCut/exports`. Override it with:

```bash
export QCUT_OUTPUT_DIR=/tmp/qcut-output
```

When running generation, analysis, transcription, music, translation, or
pipeline commands in that sandbox, use `-o /tmp/qcut-output` when a command
supports `--output-dir/-o`, or move final user-requested files into
`/tmp/qcut-output` before finishing. Keep scratch files and package installs
under `/tmp/qcut-tools` or `/tmp`.

## Video Review / 审片

Use QCut's review mode when the user asks for video review, 审片, timestamped
feedback, CSV/JSON comments, or human-style short-drama notes. Do not use
generic `aicp analyze-video` for this workflow.

```bash
QCUT_DEBUG_OPENROUTER_VIDEO=1 \
QCUT_OUTPUT_DIR=/tmp/qcut-output \
qcut analyze video \
  -i /tmp/qcut-input/video.mp4 \
  --analysis-type review \
  --review-language zh \
  --max-tokens 16000 \
  -m openrouter_gemini_3_5_flash_video \
  --json \
  -o /tmp/qcut-output
```

For English review comments, use `--review-language en`. The review output is
written under `/tmp/qcut-output`:

```text
review-comments.json
review-comments.csv
review-feedback-browser.html
review-feedback-summary.html
review-agent-report.md
review-agent-prompts/
raw-analysis.json
review-split-manifest.json   # only when the video is split
```

Long local videos are split automatically when the estimated base64 payload is
too large. If a part fails because OpenRouter returned truncated JSON, inspect
`review-split-manifest.json` and rerun the failed part rather than rerunning the
whole episode. The parser salvages complete comments from partial JSON arrays,
so non-empty `raw-analysis.json` with empty CSV usually means the model did not
emit complete comment objects.

In Daytona Chat Agent sessions, local host paths such as `/Users/peter/...` are
not available. First upload the file into the session, use its `/tmp/qcut-input`
path, or use a public/network URL that the model provider can read.

### Command Groups

| Group | Description | Example |
|-------|-------------|---------|
| `editor` | Control the open editor, timeline, tracks, pointer, and export (three-level: `editor <area> <action>`) | `editor timeline export --project-id <id> --json` |
| `gen` | Generate images, videos, avatars, speech, music, and voices | `gen image -t "A cat"` |
| `analyze` | Analyze, index, transcribe, translate, and query media | `analyze transcribe -i audio.mp3 --srt` |
| `edit` | Autoclip, upscale, motion, subtitles, cleanup, portrait, deflicker, stickers, sound search | `edit upscale --image img.png` |
| `compose` | Snapshot, plan, validate, apply, render, and package multi-resource edits | `compose render --config edit.qcut-compose.json --output final.mp4` |
| `filter-lab` | Browse, render, stack, and verify locally cached filters; QCut's own Metal renderer | `filter-lab render-independent --resource-id <id> -i in.png --output out.png` |
| `effect-lab` | Search and render locally cached video effects | `effect-lab render --effect "胶片框" --input in.mp4 --output out.mp4` |
| `text-lab` | Browse and render cached flower text and text animations | `text-lab animations --slot loop --json` |
| `sticker-lab` | Browse private local sticker reference batches | `sticker-lab search --query "安排" --json` |
| `transition` | Inspect and render transitions through the local Jianying runtime | `transition render --preset <preset> --input-a a.mp4 --input-b b.mp4` |
| `draft` | Inspect, import, verify, and export Jianying Professional drafts | `draft inspect --draft "<draft folder>" --json` |
| `instances` | Discover running QCut apps and select the CLI target | `instances list --json` |
| `flow` | ViMax pipelines, YAML workflows, script/character generation | `flow run -c pipeline.yaml -i "A sunset"` |
| `system` | Update, auth, keys, models, cost, project setup, diagnostics | `system doctor --json --skip-health` |

Run `qcut <group> --help` for group details. `qcut editor --help` does not
list its actions; use the editor reference files above or
`qcut editor <area> <action> --help --json`.

### Top-level commands (not in a group)

| Command | Description | Example |
|---------|-------------|---------|
| `update` | Check, download, verify, and install the latest QCut app (also `system update`) | `update --check --json` |
| `record` | Standalone screen recording — spawns its own hidden QCut | `record --record-duration 10 -o demo.mp4` |
| `record-daemon` | Inspect / stop / start the headless recorder daemon | `record-daemon --status` |
| `youtube:upload` | Upload a file to YouTube via Google OAuth | `youtube:upload -i video.mp4 --title "demo"` |
| `generate-grid` | Generate an image grid in one call | `generate-grid -t "Seasons" --layout 2x2` |
| `create-element`, `list-elements`, `delete-element` | Reusable Kling V3 Omni character/object elements | `list-elements --json` |
| `moyin:parse-script` | Parse a screenplay file into structured data | `moyin:parse-script --script screenplay.txt --json` |
| `phota:edit`, `phota:enhance`, `phota:profile` | Phota image editing, enhancement, identity profiles | `phota:enhance -i photo.jpg` |
| `replicate`, `replicate:analyze`, `replicate:generate` | Replicate a video: analyze → recipe → generate | `replicate:analyze --source input.mp4 --json` |
| `vimax:list-models` | List ViMax-specific models | `vimax:list-models --json` |

`record` and `record-daemon` do not require QCut to be open — they
auto-launch a hidden recorder. See
[editor-output.md](editor/editor-output.md#standalone-recording--qcut-record-no-editor-needed)
for flags and examples.

## Project Setup & Organization

Use these commands for project setup, file categorization, and structure audits:

- `qcut system project-init`
- `qcut system project-organize`
- `qcut system project-info`

Standard structure:

```text
{project-dir}/
├── input/
│   ├── images/
│   ├── videos/
│   ├── audio/
│   ├── text/
│   └── pipelines/
├── output/
│   ├── images/
│   ├── videos/
│   └── audio/
└── config/
```

Safe default workflow:

```bash
# 1) Create missing folders
qcut system project-init --directory ./my-project

# 2) Preview file moves first
qcut system project-organize \
  --directory ./my-project \
  --source ./incoming-media \
  --recursive \
  --dry-run

# 3) Execute organization
qcut system project-organize \
  --directory ./my-project \
  --source ./incoming-media \
  --recursive

# 4) Verify final structure and counts
qcut system project-info --directory ./my-project --json
```

Safety rules:

- Run `--dry-run` before moving user files.
- Use `--source` for external ingest folders.
- Use `--recursive` only when nested scan is needed.
- Avoid `--include-output` unless reorganizing output is intentional.

## Quick Commands

```bash
qcut system models                        # List all models
qcut gen image -t "A cinematic portrait at golden hour"
qcut gen video -m kling_2_6_pro -t "Ocean waves at sunset" -d 5s
qcut gen avatar -m omnihuman_v1_5 -t "Hello world" --image-url avatar.png
qcut gen music -t "Upbeat pop, warm female vocal, 104 BPM"
qcut analyze video -i video.mp4 --analysis-type summary
qcut analyze transcribe -i audio.mp3 --srt
qcut edit portrait-filter --list-presets --json
qcut flow run -c pipeline.yaml -i "A sunset" --no-confirm
qcut system cost -m veo3 -d 8s
qcut record --record-duration 10 -o demo.mp4   # standalone screen recording, no editor needed
qcut filter-lab catalog-independent --json      # filters QCut's own Metal renderer supports
qcut compose validate --config edit.qcut-compose.json --json
qcut draft inspect --draft "~/Movies/JianyingPro Drafts/my-draft" --json
qcut update --check --json
```

## Auth Token Management

Get, set, or clear the QCut auth token directly from the CLI. No need for DevTools.

```bash
# Get current token (masked by default)
qcut editor auth token --json

# Get token with full value revealed
qcut editor auth token --reveal --json

# Set a token
qcut editor auth token --set <token> --json

# Activate license on this device
qcut editor auth activate --token <token> --json

# Clear token (logout)
qcut editor auth logout --json
```

| Command | Description |
|---------|-------------|
| `editor auth token` | Get current token (add `--reveal` for full value, `--set <val>` to set) |
| `editor auth activate` | Set token and activate license on this device |
| `editor auth logout` | Clear the current auth token |

Never paste a revealed token into prompts, logs, or generated files.

## YouTube Upload

Upload videos to YouTube after authenticating with Google OAuth.

**Prerequisites:**
- Logged in via Google OAuth in QCut app
- YouTube Data API v3 enabled in Google Cloud Console
- YouTube channel created on the Google account
- Auth token set (use `qcut editor auth token --reveal --json` to check)

```bash
# Set auth token for CLI usage (preferred: use editor auth token --set)
qcut editor auth token --set <token> --json

# Upload a video (private by default)
qcut youtube:upload -i video.mp4 --title "My Video"

# Upload with all options
qcut youtube:upload \
  -i video.mp4 \
  --title "My Video" \
  --text "Video description" \
  --mode unlisted \
  --data "tag1,tag2,tag3" \
  --category 22 \
  --image thumbnail.jpg \
  --json
```

| Flag | Description |
|------|-------------|
| `--input`, `-i` | Path to video file (required) |
| `--title` | Video title (required) |
| `--text` | Video description |
| `--data` | Comma-separated tags |
| `--mode` | Privacy: `public`, `unlisted`, `private` (default: `public`) |
| `--category` | YouTube category ID (default: `22` = People & Blogs) |
| `--image` | Path to thumbnail image |

**Auth flow:** CLI token → license server `/api/youtube/token` → Google access token → YouTube Data API v3 resumable upload.

**Key files:**
- CLI handler: `electron/native-pipeline/cli/cli-handlers-youtube.ts`
- License server endpoint: `packages/license-server/src/routes/youtube.ts`
- Electron IPC handler: `electron/youtube-handler.ts`

## ViMax Quick Start

```bash
qcut flow idea2video --idea "A detective in 1920s Paris" -d 120
qcut flow script2video --script script.json
qcut flow novel2movie --novel book.txt --max-scenes 20
qcut flow scenes --novel book.txt -o /tmp/qcut-output --json
qcut flow storyboard --scenes /tmp/qcut-output/scenes.json --image-model gpt_image_2_ima --concurrency 3 --json
qcut flow novel2script --novel book.txt --project my-story   # decomposed stage 3
qcut flow novel2video --project my-story --cost-gate          # decomposed stage 4
```

## API Key Setup

Keys stored in `~/.qcut/.env` (mode `0600`).

```bash
qcut system setup          # Create .env template
qcut system set-key --name FAL_KEY   # Set a key (interactive)
qcut system keys           # Show configured and missing keys
qcut system check-keys     # Check configured keys
qcut system sync-keys      # Pull keys from the cloud vault (requires login)
```

**Supported keys:** `FAL_KEY`, `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `RUNWAY_API_KEY`, `HEYGEN_API_KEY`, `DID_API_KEY`, `SYNTHESIA_API_KEY`, `QCUT_AUTH_TOKEN`

## Unified JSON Output

All commands support `--json` for machine-readable output using a consistent envelope:

```bash
qcut gen image -t "A cat" --json
```

Three possible envelope shapes:

| Status | Shape | When |
|--------|-------|------|
| `ok` | `{ "status": "ok", "command_id": "cmd-...", "duration_ms": 1234, "data": { ... } }` | Command succeeded |
| `error` | `{ "status": "error", "command_id": "cmd-...", "duration_ms": 500, "error": "msg", "code": "cmd:failed" }` | Command failed |
| `pending` | `{ "status": "pending", "jobId": "abc-123" }` | Async job started |

Every `ok` and `error` envelope includes:
- `command_id` — unique correlation ID (`cmd-{timestamp}-{random}`) for tracing
- `duration_ms` — integer wall-clock execution time in milliseconds

See [REFERENCE.md](references/REFERENCE.md) for full envelope docs.

## 3-Level Progressive Help (JSON)

The CLI provides structured help at three levels when using `--help --json`:

```bash
# Level 1: Root — list all groups, commands, global flags
qcut --help --json

# Level 2: Command — flags (required/optional), examples, usage
qcut gen image --help --json

# Level 3: Parameter — type, enum values, default, description
qcut gen image --help model --json
```

Each level returns a JSON envelope (`{ "status": "ok", "data": { ... } }`).
Flags that a handler accepts but the registry does not declare are not listed,
and `--help <flag> --json` exits 1 for them; prefer the declared spelling.

## project.json — Agent-Readable Project State

Two CLI commands export the full project state as structured JSON:

```bash
# Minimal (~200 tokens): counts + settings only
qcut editor project info --project-id <id> --json

# Full (~2000 tokens): settings + media[] + subtitles[] + generated[] + exports[] + jobs[]
qcut editor project info --project-id <id> --full --json

# Dump to disk
qcut editor project export-state --project-id <id>
```

See [editor-media.md](editor/editor-media.md) for the full project.json schema.

## Global Options

| Flag | Short | Description |
|------|-------|-------------|
| `--output-dir` | `-o` | Output directory (default: `$QCUT_OUTPUT_DIR` or `~/Documents/QCut/exports`) |
| `--model` | `-m` | Model key (e.g. `gpt_image_2_ima`, `kling_2_6_pro`) |
| `--json` | | Output as JSON (includes `command_id`, `duration_ms`) |
| `--quiet` | `-q` | Suppress progress and exit metadata |
| `--verbose` | `-v` | Debug logging + JSONL debug events on stderr |
| `--force` | | Bypass action-policy confirmations when the policy allows it |
| `--policy` | | Path to a JSON action policy file |
| `--resume` | | Resume and autosave a named CLI session |
| `--focus` | | Bring the editor window to the target project |
| `--session` | | Session mode: read commands from stdin |
| `--skip-health` | | Skip editor health check |
| `--no-capability-check` | | Skip per-request capability warnings |
| `--host` | | Editor API host (default `127.0.0.1`) |
| `--port` | | Editor API port (auto-selected when omitted; see `instances use`) |
| `--token` | | Editor API auth token |
| `--help` | `-h` | Print help |
| `--version` | | Print the CLI version |

`--stream` is not a global flag; `flow run` and `moyin:parse-script` accept it
to emit JSONL progress events on stderr.

### Exit Metadata

In non-JSON, non-quiet mode, every command appends to stderr:
```
[exit:0 | 1.2s]
```

### Error Recovery Hints

When a command fails in non-JSON mode, actionable hints are printed below the error:
```
error: Missing API key for fal
hint: Set the key with: qcut system set-key --name <provider> --value <key>
```

### Debug Event Stream

With `--verbose` (or `--stream` on the commands that support it), structured JSONL events are emitted to stderr:
```jsonl
{"event":"command:start","command_id":"cmd-1741830000-a1b2c3","command":"generate-image","timestamp":"2026-03-12T10:00:00.000Z"}
{"event":"command:end","command_id":"cmd-1741830000-a1b2c3","command":"generate-image","exit_code":0,"duration_ms":3200,"timestamp":"2026-03-12T10:00:03.200Z"}
```

## Programmatic API (`run` / `runChain`)

For agent or programmatic use, import `run()` or `runChain()` directly instead of spawning a process:

```typescript
import { run, runChain } from "./cli-runner/index.js";

// Single command
const result = await run("generate-image -t 'A cat'");
// → { success, exit_code, duration_ms, command_id, outputPath?, ... }

// Chained commands (output piped as --input to next)
const results = await runChain([
  "generate-image -t 'A sunset'",
  "upscale-image --target 2160p",
]);
```

## Key Source Files

See [reference-source-files.md](references/reference-source-files.md) for the full source file map organized by responsibility (core, output, handlers, state, auth).
