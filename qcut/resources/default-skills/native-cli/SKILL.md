---
name: native-cli
description: Run QCut's native TypeScript pipeline CLI for AI content generation, video analysis, transcription, YAML pipelines, ViMax agentic video production, and project management. Also use for editor HTTP automation tasks (state snapshots, events, transactions, and notification bridge control) when user needs deterministic state-aware control.
argument-hint: [command] [--flags]
---

# Native Pipeline CLI Skill

Run QCut's built-in TypeScript pipeline CLI (`qcut-pipeline` / `qcut`).

## Active CLI Version

- Active native CLI version: `1.0.0`
- Verify with: `qcut --version`

## Additional resources

- For standalone CLI commands (generate, analyze, transcribe, autoclip, models, help, output formats), see [REFERENCE.md](references/REFERENCE.md)
- For YAML pipelines, API key management, project management, see [reference-pipelines.md](references/reference-pipelines.md)
- For ViMax commands (idea2video, script2video, novel2movie, portraits), see [reference-vimax.md](references/reference-vimax.md)
- For editor core reference: connection, flags, batch limits, env vars, common workflows, see [editor-core.md](editor/editor-core.md)
- For editor media & project commands, project.json schema, see [editor-media.md](editor/editor-media.md)
- For editor timeline & editing commands, see [editor-timeline.md](editor/editor-timeline.md)
- For editor export, diagnostics, MCP, screen recording, UI, Moyin, screenshots, state control, see [editor-output.md](editor/editor-output.md)
- For editor AI commands: video analysis, transcription, AI generation, Remotion, navigator, see [editor-ai.md](editor/editor-ai.md)
- For editor state automation: snapshots, event streams, correlation IDs, transactions, capabilities, and notification bridge endpoints, see [editor-state-control.md](editor/editor-state-control.md)
- For agent automation: accessibility snapshots with refs, console capture, visual diffs, session persistence, and action policy, see [editor-agent.md](editor/editor-agent.md)
- For source file locations by responsibility (core, output, handlers, state, auth), see [reference-source-files.md](references/reference-source-files.md)
- For proxy mode, credit system, and admin tester management, see [reference-proxy-credits.md](references/reference-proxy-credits.md)

## Step 1: Ensure QCut is Running

Before any `editor:*` command, check if QCut is running. If not, build and launch it.

```bash
# Check if QCut is running
qcut editor:health --status-only --json || echo "NOT_RUNNING"
```

If NOT_RUNNING:

```bash
bun run build                # Build first
bun run electron &           # Launch in background
sleep 5                      # Wait for startup
```

## Step 2: Find Project, Media & Timeline

Most editor commands need `--project-id`, `--media-id`, or `--element-id`. Run these to discover them.

```bash
# 1. List projects → get project-id
qcut editor:navigator:projects

# 2. Open a project (navigates the editor)
qcut editor:navigator:open --project-id <project-id>

# 3. Switch to editor panel (navigator:open lands on the landing page, NOT the editor)
qcut editor:ui:switch-panel --panel video-edit

# 4. List media → get media-id values
qcut editor:media:list --project-id <project-id> --json

# 5. Export timeline → get track-id and element-id values
qcut editor:timeline:export --project-id <project-id> --json
```

Now you have the IDs needed for all other editor commands.

## How to Run

```bash
qcut <group> <action> [options]     # New group syntax (preferred)
qcut <command> [options]             # Legacy flat syntax (deprecated)
qcut-pipeline <group> <action> [options]         # Production binary
```

### Command Groups

| Group | Description | Example |
|-------|-------------|---------|
| `gen` | Generate images, videos, avatars, speech | `gen image -t "A cat"` |
| `analyze` | Analyze, transcribe, translate media | `analyze transcribe -i audio.mp3` |
| `edit` | Autoclip, upscale, motion, subtitle | `edit upscale --image img.png` |
| `flow` | ViMax pipelines, YAML workflows | `flow idea2video --idea "..."` |
| `system` | Auth, keys, models, project setup | `system models --json` |

Run `qcut <group> --help` for group details.

### Top-level commands (not in a group)

| Command | Description | Example |
|---------|-------------|---------|
| `record` | Standalone screen recording — spawns its own hidden QCut | `record --record-duration 10 -o demo.mp4` |
| `record-daemon` | Inspect / stop / start the headless recorder daemon | `record-daemon --status` |
| `youtube:upload` | Upload a file to YouTube via Google OAuth | `youtube:upload -i video.mp4 --title "demo"` |

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
qcut analyze video -i video.mp4 --analysis-type summary
qcut analyze transcribe -i audio.mp3 --srt
qcut flow run -c pipeline.yaml -i "A sunset" --no-confirm
qcut system cost -m veo3 -d 8s
qcut record --record-duration 10 -o demo.mp4   # standalone screen recording, no editor needed
```

## Auth Token Management

Get, set, or clear the QCut auth token directly from the CLI. No need for DevTools.

```bash
# Get current token (masked by default)
qcut editor:auth:token --json

# Get token with full value revealed
qcut editor:auth:token --reveal --json

# Set a token
qcut editor:auth:token --set <token> --json

# Activate license on this device
qcut editor:auth:activate --token <token> --json

# Clear token (logout)
qcut editor:auth:logout --json
```

| Command | Description |
|---------|-------------|
| `editor:auth:token` | Get current token (add `--reveal` for full value, `--set <val>` to set) |
| `editor:auth:activate` | Set token and activate license on this device |
| `editor:auth:logout` | Clear the current auth token |

## YouTube Upload

Upload videos to YouTube after authenticating with Google OAuth.

**Prerequisites:**
- Logged in via Google OAuth in QCut app
- YouTube Data API v3 enabled in Google Cloud Console
- YouTube channel created on the Google account
- Auth token set (use `qcut editor:auth:token --reveal --json` to check)

```bash
# Set auth token for CLI usage (preferred: use editor:auth:token --set)
qcut editor:auth:token --set <token> --json

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
qcut flow script2video --script script.json --portraits registry.json
qcut flow novel2movie --novel book.txt --max-scenes 20
```

## API Key Setup

Keys stored in `~/.qcut/.env` (mode `0600`).

```bash
qcut system setup          # Create .env template
qcut system set-key --name FAL_KEY   # Set a key (interactive)
qcut system check-keys     # Check configured keys
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

## project.json — Agent-Readable Project State

Two CLI commands export the full project state as structured JSON:

```bash
# Minimal (~200 tokens): counts + settings only
qcut editor:project:info --project-id <id> --json

# Full (~2000 tokens): settings + media[] + subtitles[] + generated[] + exports[] + jobs[]
qcut editor:project:info --project-id <id> --full --json

# Dump to disk
qcut editor:project:export-state --project-id <id>
```

See [editor-media.md](editor/editor-media.md) for the full project.json schema.

## Global Options

| Flag | Short | Description |
|------|-------|-------------|
| `--output-dir` | `-o` | Output directory (default: `./output`) |
| `--model` | `-m` | Model key |
| `--json` | | Output as JSON (includes `command_id`, `duration_ms`) |
| `--quiet` | `-q` | Suppress progress and exit metadata |
| `--verbose` | `-v` | Debug logging + JSONL debug events on stderr |
| `--stream` | | JSONL progress events on stderr + debug events |
| `--help` | `-h` | Print help |
| `--session` | | Session mode: read commands from stdin |
| `--skip-health` | | Skip editor health check |
| `--no-capability-check` | | Skip per-request capability warnings |

### Exit Metadata

In non-JSON, non-quiet mode, every command appends to stderr:
```
[exit:0 | 1.2s]
```

### Error Recovery Hints

When a command fails in non-JSON mode, actionable hints are printed below the error:
```
error: Missing API key for fal
hint: Set the key with: qcut-pipeline set-key --name <provider> --value <key>
```

### Debug Event Stream

With `--verbose` or `--stream`, structured JSONL events are emitted to stderr:
```jsonl
{"event":"command:start","command_id":"cmd-1741830000-a1b2c3","command":"generate-image","timestamp":"2026-03-12T10:00:00.000Z"}
{"event":"command:end","command_id":"cmd-1741830000-a1b2c3","command":"generate-image","exit_code":0,"duration_ms":3200,"timestamp":"2026-03-12T10:00:03.200Z"}
```

## Programmatic API (`run` / `runChain`)

For agent or programmatic use, import `run()` or `runChain()` directly instead of spawning a process:

```typescript
import { run, runChain } from "./cli-runner/index.js";

// Single command
const result = await run("generate-image -t 'A cat' --model flux");
// → { success, exit_code, duration_ms, command_id, outputPath?, ... }

// Chained commands (output piped as --input to next)
const results = await runChain([
  "generate-image -t 'A sunset'",
  "upscale-image --target 2160p",
]);
```

## Key Source Files

See [reference-source-files.md](references/reference-source-files.md) for the full source file map organized by responsibility (core, output, handlers, state, auth).
