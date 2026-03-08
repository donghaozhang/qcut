---
name: native-cli
description: Run QCut's native TypeScript pipeline CLI for AI content generation, video analysis, transcription, YAML pipelines, ViMax agentic video production, and project management. Also use for editor HTTP automation tasks (state snapshots, events, transactions, and notification bridge control) when user needs deterministic state-aware control.
argument-hint: [command] [--flags]
---

# Native Pipeline CLI Skill

Run QCut's built-in TypeScript pipeline CLI (`qcut-pipeline` / `bun run pipeline`).

## Active CLI Version

- Active native CLI version: `1.0.0`
- Verify with: `bun run pipeline --version`

## Additional resources

- For standalone CLI commands (generate, analyze, transcribe, models, help, output formats), see [REFERENCE.md](references/REFERENCE.md)
- For YAML pipelines, API key management, project management, see [reference-pipelines.md](references/reference-pipelines.md)
- For ViMax commands (idea2video, script2video, novel2movie, portraits), see [reference-vimax.md](references/reference-vimax.md)
- For editor core reference: connection, flags, batch limits, env vars, common workflows, see [editor-core.md](editor/editor-core.md)
- For editor media & project commands, project.json schema, see [editor-media.md](editor/editor-media.md)
- For editor timeline & editing commands, see [editor-timeline.md](editor/editor-timeline.md)
- For editor export, diagnostics, MCP, screen recording, UI, Moyin, screenshots, state control, see [editor-output.md](editor/editor-output.md)
- For editor AI commands: video analysis, transcription, AI generation, Remotion, navigator, see [editor-ai.md](editor/editor-ai.md)
- For editor state automation: snapshots, event streams, correlation IDs, transactions, capabilities, and notification bridge endpoints, see [editor-state-control.md](editor/editor-state-control.md)

## Step 1: Ensure QCut is Running

Before any `editor:*` command, check if QCut is running. If not, build and launch it.

```bash
# Check if QCut is running
bun run pipeline editor:health --status-only --json || echo "NOT_RUNNING"
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
bun run pipeline editor:navigator:projects

# 2. Open a project (navigates the editor)
bun run pipeline editor:navigator:open --project-id <project-id>

# 3. Switch to editor panel (navigator:open lands on the landing page, NOT the editor)
bun run pipeline editor:ui:switch-panel --panel video-edit

# 4. List media → get media-id values
bun run pipeline editor:media:list --project-id <project-id> --json

# 5. Export timeline → get track-id and element-id values
bun run pipeline editor:timeline:export --project-id <project-id> --json
```

Now you have the IDs needed for all other editor commands.

## How to Run

```bash
bun run pipeline <command> [options]            # Dev (recommended)
bun run electron/native-pipeline/cli/cli.ts <command> [options]  # Direct source
qcut-pipeline <command> [options]               # Production binary
```

## Project Setup & Organization

Use these commands for project setup, file categorization, and structure audits:

- `bun run pipeline init-project`
- `bun run pipeline organize-project`
- `bun run pipeline structure-info`

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
bun run pipeline init-project --directory ./my-project

# 2) Preview file moves first
bun run pipeline organize-project \
  --directory ./my-project \
  --source ./incoming-media \
  --recursive \
  --dry-run

# 3) Execute organization
bun run pipeline organize-project \
  --directory ./my-project \
  --source ./incoming-media \
  --recursive

# 4) Verify final structure and counts
bun run pipeline structure-info --directory ./my-project --json
```

Safety rules:

- Run `--dry-run` before moving user files.
- Use `--source` for external ingest folders.
- Use `--recursive` only when nested scan is needed.
- Avoid `--include-output` unless reorganizing output is intentional.

## Quick Commands

```bash
bun run pipeline list-models                          # List all models
bun run pipeline generate-image -t "A cinematic portrait at golden hour"
bun run pipeline create-video -m kling_2_6_pro -t "Ocean waves at sunset" -d 5s
bun run pipeline generate-avatar -m omnihuman_v1_5 -t "Hello world" --image-url avatar.png
bun run pipeline analyze-video -i video.mp4 --analysis-type summary
bun run pipeline transcribe -i audio.mp3 --srt
bun run pipeline run-pipeline -c pipeline.yaml -i "A sunset" --no-confirm
bun run pipeline estimate-cost -m veo3 -d 8s
```

## Auth Token Management

Get, set, or clear the QCut auth token directly from the CLI. No need for DevTools.

```bash
# Get current token (masked by default)
bun run pipeline editor:auth:token --json

# Get token with full value revealed
bun run pipeline editor:auth:token --reveal --json

# Set a token
bun run pipeline editor:auth:token --set <token> --json

# Activate license on this device
bun run pipeline editor:auth:activate --token <token> --json

# Clear token (logout)
bun run pipeline editor:auth:logout --json
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
- Auth token set (use `bun run pipeline editor:auth:token --reveal --json` to check)

```bash
# Set auth token for CLI usage (preferred: use editor:auth:token --set)
bun run pipeline editor:auth:token --set <token> --json

# Upload a video (private by default)
bun run pipeline youtube:upload -i video.mp4 --title "My Video"

# Upload with all options
bun run pipeline youtube:upload \
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
bun run pipeline vimax:idea2video --idea "A detective in 1920s Paris" -d 120
bun run pipeline vimax:script2video --script script.json --portraits registry.json
bun run pipeline vimax:novel2movie --novel book.txt --max-scenes 20
```

## API Key Setup

Keys stored in `~/.qcut/.env` (mode `0600`).

```bash
bun run pipeline setup          # Create .env template
bun run pipeline set-key --name FAL_KEY   # Set a key (interactive)
bun run pipeline check-keys     # Check configured keys
```

**Supported keys:** `FAL_KEY`, `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `RUNWAY_API_KEY`, `HEYGEN_API_KEY`, `DID_API_KEY`, `SYNTHESIA_API_KEY`, `QCUT_AUTH_TOKEN`

## Unified JSON Output

All commands support `--json` for machine-readable output using a consistent envelope:

```bash
bun run pipeline generate-image -t "A cat" --json
```

Three possible envelope shapes:

| Status | Shape | When |
|--------|-------|------|
| `ok` | `{ "status": "ok", "data": { ... } }` | Command succeeded |
| `error` | `{ "status": "error", "error": "msg", "code": "cmd:failed" }` | Command failed |
| `pending` | `{ "status": "pending", "jobId": "abc-123" }` | Async job started |

See [REFERENCE.md](references/REFERENCE.md) for full envelope docs.

## 3-Level Progressive Help (JSON)

The CLI provides structured help at three levels when using `--help --json`:

```bash
# Level 1: Root — list all commands, categories, global flags
bun run pipeline --help --json

# Level 2: Command — flags (required/optional), examples, usage
bun run pipeline generate-image --help --json

# Level 3: Parameter — type, enum values, default, description
bun run pipeline generate-image --help model --json
```

Each level returns a JSON envelope (`{ "status": "ok", "data": { ... } }`).

## project.json — Agent-Readable Project State

Two CLI commands export the full project state as structured JSON:

```bash
# Minimal (~200 tokens): counts + settings only
bun run pipeline editor:project:info --project-id <id> --json

# Full (~2000 tokens): settings + media[] + subtitles[] + generated[] + exports[] + jobs[]
bun run pipeline editor:project:info --project-id <id> --full --json

# Dump to disk
bun run pipeline editor:project:export-state --project-id <id>
```

See [editor-media.md](editor/editor-media.md) for the full project.json schema.

## Global Options

| Flag | Short | Description |
|------|-------|-------------|
| `--output-dir` | `-o` | Output directory (default: `./output`) |
| `--model` | `-m` | Model key |
| `--json` | | Output as JSON |
| `--quiet` | `-q` | Suppress progress |
| `--verbose` | `-v` | Debug logging |
| `--stream` | | JSONL progress events on stderr |
| `--help` | `-h` | Print help |
| `--session` | | Session mode: read commands from stdin |
| `--skip-health` | | Skip editor health check |
| `--no-capability-check` | | Skip per-request capability warnings |

## Key Source Files

| Component | File |
|-----------|------|
| CLI entry point | `electron/native-pipeline/cli/cli.ts` |
| Command router | `electron/native-pipeline/cli/cli-runner/runner.ts` |
| Command registry (core) | `electron/native-pipeline/cli/command-registry.ts` |
| Command registry (editor) | `electron/native-pipeline/cli/command-registry-editor.ts` |
| Command registry types | `electron/native-pipeline/cli/command-registry-types.ts` |
| JSON output helpers | `electron/native-pipeline/cli/json-output.ts` |
| project.json types | `electron/native-pipeline/cli/project-json-types.ts` |
| project.json builder | `electron/native-pipeline/cli/project-json-builder.ts` |
| Editor dispatch | `electron/native-pipeline/cli/cli-handlers-editor.ts` |
| Admin handlers | `electron/native-pipeline/cli/cli-handlers-admin.ts` |
| Media handlers | `electron/native-pipeline/cli/cli-handlers-media.ts` |
| ViMax handlers | `electron/native-pipeline/cli/vimax-cli-handlers.ts` |
| Remotion handler | `electron/native-pipeline/cli/cli-handlers-remotion.ts` |
| Moyin handler | `electron/native-pipeline/cli/cli-handlers-moyin.ts` |
| YouTube handler | `electron/native-pipeline/cli/cli-handlers-youtube.ts` |
| Auth routes (HTTP) | `electron/claude/http/claude-http-server.ts` |
| Auth routes (utility) | `electron/utility/utility-http-server.ts` |
| Auth bridge | `electron/utility/utility-bridge.ts` |
| License handler | `electron/license-handler.ts` |
| Key manager | `electron/native-pipeline/key-manager.ts` |
