---
name: ai-content-pipeline
description: Generate AI content (images, videos, audio, avatars) and analyze videos with AICP in QCut. Primary mode uses QCut's bundled AICP binary with secure API key injection.
---

# AI Content Pipeline Skill

Generate AI content (images, videos, audio) and analyze media using AICP.

Reference files:
- `REFERENCE.md` - model specs, API endpoints, troubleshooting
- `EXAMPLES.md` - YAML pipeline examples

## FAL API Key Setup

QCut resolves the FAL key from a **3-tier fallback** (highest priority wins):

| Tier | Source | How to set |
|------|--------|------------|
| 1 | Environment variable | `export FAL_KEY=your_key` |
| 2 | QCut Electron store | Editor -> Settings -> API Keys |
| 3 | AICP CLI credential store | `aicp set-key FAL_KEY` |

**Recommended for Claude Code / CLI workflows:**

```bash
# Set FAL key persistently (secure hidden prompt, stored at ~/.config/video-ai-studio/credentials.env)
aicp set-key FAL_KEY

# Verify the key is stored
aicp check-keys

# Or use the bundled binary directly
./electron/resources/bin/aicp/darwin-arm64/aicp set-key FAL_KEY
```

Once set via any tier, QCut automatically injects the key when spawning AICP for generation commands. No `.env` file or GUI interaction is required.

**Quick check** — verify FAL key is available before generating:

```bash
aicp check-keys
```

If `FAL_KEY` shows `not set`, set it using any method above.

## Usage Modes

### Mode 1 (Recommended): QCut Bundled AICP

Use this when working inside QCut.

What QCut handles for you:
- bundled `aicp` binary (no local Python or pip required)
- 3-tier API key resolution (env > Electron store > AICP CLI store)
- `FAL_KEY` injection at spawn time for generation commands
- output path recovery and optional media auto-import in app flow

Setup steps:
1. Set your FAL key via CLI (`aicp set-key FAL_KEY`) or GUI (Editor -> Settings -> API Keys).
2. Use AI generation features from the app or CLI.

Notes:
- No `.env` file is required for normal QCut usage.
- If key is missing, app should fail fast with actionable guidance.
- Settings UI shows a source badge (env/app/cli) next to each key.

### Mode 2: Standalone CLI (Debug/Dev)

Use this for local debugging outside QCut.

```bash
# Use bundled binary directly
./electron/resources/bin/aicp/darwin-arm64/aicp --version
./electron/resources/bin/aicp/darwin-arm64/aicp --help
```

Set keys via the CLI credential store (persistent, secure):

```bash
aicp set-key FAL_KEY
# optional
aicp set-key GEMINI_API_KEY
aicp set-key ELEVENLABS_API_KEY
```

Or export keys manually per session:

```bash
export FAL_KEY=your_fal_key
```

### Mode 3: QCut CLI Key Management

QCut's Electron binary can also delegate key management headlessly:

```bash
./QCut set-key FAL_KEY      # Delegates to bundled aicp set-key
./QCut check-keys           # Shows all key statuses
./QCut delete-key FAL_KEY   # Removes a stored key
```

## Quick Commands

Always inspect available models first in your current environment:

```bash
aicp list-models
```

Then use a model returned by your local `list-models` output.

### Generate Image

```bash
aicp generate-image \
  --text "A cinematic portrait at golden hour" \
  --model MODEL_FROM_LIST_MODELS
```

### Generate Video

```bash
aicp create-video --text "A serene mountain lake at sunset" --model wan_2_6
```

### Generate Avatar (Lipsync)

```bash
aicp generate-avatar \
  --image-url "https://..." \
  --audio-url "https://..." \
  --model omnihuman_v1_5
```

### Transfer Motion

```bash
aicp transfer-motion -i person.jpg -v dance.mp4
```

### Analyze Video (CLI)

```bash
aicp analyze-video -i video.mp4
aicp analyze-video -i video.mp4 -t timeline -m gemini-2.5-flash
aicp analyze-video -i video.mp4 -t transcribe
aicp analyze-video -i video.mp4 -t describe -f json
```

### Analyze Video (HTTP API)

QCut exposes video analysis through the Claude HTTP server (port 8765).
Accepts video from timeline elements, media panel items, or file paths.

```bash
# Analyze from file path
curl -X POST http://localhost:8765/api/claude/analyze/PROJECT_ID \
  -H "Content-Type: application/json" \
  -d '{"source":{"type":"path","filePath":"/path/to/video.mp4"},"analysisType":"timeline","model":"gemini-2.5-flash"}'

# Analyze from media panel
curl -X POST http://localhost:8765/api/claude/analyze/PROJECT_ID \
  -H "Content-Type: application/json" \
  -d '{"source":{"type":"media","mediaId":"MEDIA_ID"},"analysisType":"timeline"}'

# Analyze from timeline element
curl -X POST http://localhost:8765/api/claude/analyze/PROJECT_ID \
  -H "Content-Type: application/json" \
  -d '{"source":{"type":"timeline","elementId":"ELEMENT_ID"},"analysisType":"transcribe"}'

# List available analysis models
curl http://localhost:8765/api/claude/analyze/models
```

### Run YAML Pipeline

```bash
PIPELINE_PARALLEL_ENABLED=true aicp run-chain --config pipeline.yaml
```

## Model and Feature Availability

Do not assume all documented models are enabled in every runtime.

Availability depends on:
- packaged binary build contents
- provider modules present in runtime
- API keys and account/provider access

Practical rule:
- treat `aicp list-models` as source of truth for your current machine/runtime

## Known CLI Caveats

- `list-models` may emit provider initialization warnings in standalone mode.
- `list-models` does not reliably support `--json` in current upstream behavior.
- `generate-image` can fail if selected model is not actually available in your runtime.

## Output Structure

Generated content should follow QCut project structure:

```text
media/generated/
├── images/
├── videos/
└── audio/
```

This aligns with native-cli project-organization commands (`init-project`, `organize-project`, `structure-info`).

## FAL API Direct Access

For direct API calls (not via CLI), model keys still map to endpoint slugs.
See `REFERENCE.md` for endpoint mappings.

## Key Files Reference

| Component | File |
|-----------|------|
| Key storage & fallback | `electron/api-key-handler.ts` |
| AICP spawn + key injection | `electron/ai-pipeline-handler.ts` |
| Binary manager | `electron/binary-manager.ts` |
| Settings UI (key source badges) | `apps/web/src/components/editor/properties-panel/settings-view.tsx` |
| CLI key delegation | `electron/main.ts` (CLI_KEY_COMMANDS block) |
| Binary manifest | `resources/bin/manifest.json` |
| Video analysis handler | `electron/claude/claude-analyze-handler.ts` |
| Analysis types & API | `electron/types/claude-api.ts` (AnalyzeSource, AnalyzeOptions, AnalyzeResult) |
| Analysis HTTP routes | `electron/claude/claude-http-server.ts` |
| Analysis tests | `electron/__tests__/claude-analyze-handler.test.ts` |
| Fallback tests | `electron/__tests__/api-key-aicp-fallback.test.ts` |
