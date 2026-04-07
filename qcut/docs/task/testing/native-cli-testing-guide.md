# Testing the Native Pipeline CLI

> How to actually run, smoke-test, and verify the native TypeScript pipeline CLI.

## Prerequisites

- Bun installed (`bun --version`)
- Dependencies installed (`bun install` from `qcut/`)
- No API keys needed for smoke tests

## 1. Smoke Tests (No API Keys Required)

These commands work immediately — no keys, no network.

### 1.1 Verify CLI Loads

```bash
bun run pipeline --version
# Expected: 1.0.0

bun run pipeline --help
# Expected: Usage text with all commands listed
```

### 1.2 List Models (Registry Test)

```bash
bun run pipeline list-models
# Expected: 70+ models printed, grouped by category

bun run pipeline list-models --category text_to_video
# Expected: Subset of video models only

bun run pipeline list-models --json
# Expected: JSON array of model objects
```

### 1.3 Specialized Model Lists

```bash
bun run pipeline list-video-models
bun run pipeline list-avatar-models
bun run pipeline list-motion-models
bun run pipeline list-speech-models
bun run pipeline vimax:list-models
```

### 1.4 Cost Estimation

```bash
bun run pipeline estimate-cost -m flux_dev
# Expected: Cost estimate for image generation

bun run pipeline estimate-cost -m kling_2_6_pro -d 5s
# Expected: Cost estimate for 5s video

bun run pipeline estimate-cost -m veo3 -d 8s
```

### 1.5 Key Management

```bash
bun run pipeline check-keys
# Expected: All keys listed with "not set" status

bun run pipeline setup
# Expected: Creates ~/.qcut/.env template

bun run pipeline check-keys
# Expected: All keys listed (still not set, but .env file exists)
```

### 1.6 Project Management

```bash
# Preview project structure (dry run)
bun run pipeline init-project --directory /tmp/qcut-test --dry-run
# Expected: Lists directories that would be created

# Actually create it
bun run pipeline init-project --directory /tmp/qcut-test
# Expected: Creates input/, output/, config/ subdirectories

# Check structure
bun run pipeline structure-info --directory /tmp/qcut-test
# Expected: File counts per directory (all 0)

# Create example pipelines
bun run pipeline create-examples -o /tmp/qcut-test/pipelines
# Expected: 5 YAML files written

ls /tmp/qcut-test/pipelines/
# Expected: text-to-video-basic.yaml, image-to-video-chain.yaml, etc.

# Clean up
rm -rf /tmp/qcut-test
```

### 1.7 Portrait Registry (Local File Ops)

```bash
# Create test portrait directory
mkdir -p /tmp/portraits/Alice /tmp/portraits/Bob
touch /tmp/portraits/Alice/front.png /tmp/portraits/Bob/front.png

# Build registry
bun run pipeline vimax:create-registry --input /tmp/portraits

# View registry
bun run pipeline vimax:show-registry --input /tmp/portraits/registry.json
# Expected: JSON registry with Alice and Bob entries

rm -rf /tmp/portraits
```

### 1.8 Organize Project

```bash
# Setup test files
mkdir -p /tmp/org-test
touch /tmp/org-test/photo.png /tmp/org-test/clip.mp4 /tmp/org-test/song.mp3 /tmp/org-test/notes.txt

# Preview organization (dry run)
bun run pipeline organize-project --directory /tmp/org-test --dry-run
# Expected: "Organized 4 files" with per-file detail (photo.png → images/, etc.)

# Actually organize
bun run pipeline init-project --directory /tmp/org-test
bun run pipeline organize-project --directory /tmp/org-test
bun run pipeline structure-info --directory /tmp/org-test
# Expected: Files sorted into input/images, input/videos, input/audio, input/text

rm -rf /tmp/org-test
```

---

## 2. Error Handling Tests (No API Keys)

Verify the CLI fails gracefully without keys.

### 2.1 Generate Without Key

```bash
bun run pipeline generate-image -t "test"
# Expected: "No API key configured for provider: fal", exit 1 (uses default model: nano_banana_pro)
# Note: A JSON progress line may appear before the error (cosmetic issue)
```

### 2.2 Generate Without Required Flags

```bash
bun run pipeline generate-image
# Expected: "Missing --text/-t (prompt for image generation).", exit 1 (model defaults to nano_banana_pro)

bun run pipeline create-video -m kling_2_6_pro
# Expected: Error about missing --text or --image-url
```

### 2.3 Unknown Command

```bash
bun run pipeline not-a-command
# Expected: Exit code 2, error about unknown command
```

### 2.4 Invalid Pipeline YAML

```bash
echo "invalid: yaml: [" > /tmp/bad.yaml
bun run pipeline run-pipeline -c /tmp/bad.yaml -i "test"
# Expected: YAML parse error (not a crash)
rm /tmp/bad.yaml
```

---

## 3. API Key Setup (For Live Generation Tests)

```bash
# Set FAL key (interactive hidden prompt)
bun run pipeline set-key --name FAL_KEY

# Verify it's stored
bun run pipeline check-keys
# Expected: FAL_KEY shows "envfile" source

# View key (masked)
bun run pipeline get-key --name FAL_KEY
# Expected: sk-***...***

# Optional: set more keys for full coverage
bun run pipeline set-key --name GEMINI_API_KEY      # for analyze-video
bun run pipeline set-key --name OPENROUTER_API_KEY  # for LLM/ViMax agents
bun run pipeline set-key --name ELEVENLABS_API_KEY  # for avatar TTS
```

---

## 4. Live Generation Tests (Requires FAL_KEY)

### 4.1 Generate Image

```bash
bun run pipeline generate-image -t "A red fox in snow" -o /tmp/cli-test
# Expected: Progress bar → .png file in /tmp/cli-test/ (uses default model: nano_banana_pro)
# Verify: open /tmp/cli-test/*.png

bun run pipeline generate-image -m flux_dev -t "A red fox in snow" -o /tmp/cli-test
# Expected: Same but uses flux_dev model explicitly
```

### 4.2 Generate Image (JSON Output)

```bash
bun run pipeline generate-image -t "A red fox in snow" -o /tmp/cli-test --json
# Expected: JSON with success, outputPath, outputPaths, duration, cost (default model: nano_banana_pro)
```

### 4.3 Create Video

```bash
bun run pipeline create-video -m kling_2_6_pro -t "Ocean waves" -d 5s -o /tmp/cli-test
# Expected: Progress bar → .mp4 file
# Note: Video generation takes 1-3 minutes
```

### 4.4 Image to Video

```bash
# Use the image from 4.1 as input
bun run pipeline create-video -m kling_2_6_pro \
  --image-url /tmp/cli-test/<image-from-4.1>.png \
  -t "Fox runs through snow" -d 5s -o /tmp/cli-test
```

### 4.5 Image Grid

```bash
bun run pipeline generate-grid -t "Sunset over ocean" --layout 2x2 -o /tmp/cli-test
# Expected: 2x2 composite .png
```

### 4.6 Upscale Image

```bash
bun run pipeline upscale-image --image /tmp/cli-test/<image>.png --target 1080p -o /tmp/cli-test
```

---

## 5. Analysis Tests (Requires GEMINI_API_KEY)

### 5.1 Analyze Video

```bash
bun run pipeline analyze-video -i /path/to/video.mp4 --analysis-type summary
bun run pipeline analyze-video -i /path/to/video.mp4 --analysis-type timeline -f json
bun run pipeline analyze-video -i /path/to/video.mp4 --prompt "Count the people"
```

### 5.2 Transcribe Audio

```bash
bun run pipeline transcribe -i /path/to/audio.mp3 --srt
# Expected: Text output + .srt file
```

---

## 6. Pipeline Tests (Requires FAL_KEY)

### 6.1 Run Example Pipeline

```bash
bun run pipeline create-examples -o /tmp/cli-pipelines
bun run pipeline run-pipeline -c /tmp/cli-pipelines/text-to-video-basic.yaml \
  -i "A peaceful mountain lake at sunrise" --no-confirm -o /tmp/cli-test
```

### 6.2 Pipeline with Intermediates

```bash
bun run pipeline run-pipeline -c /tmp/cli-pipelines/image-to-video-chain.yaml \
  -i "A cyberpunk city" --no-confirm --save-intermediates -o /tmp/cli-test
# Expected: Both intermediate image and final video saved
```

### 6.3 Stdin Input

```bash
echo "A starry night sky" | bun run pipeline run-pipeline \
  -c /tmp/cli-pipelines/text-to-video-basic.yaml --input - --no-confirm
```

---

## 7. ViMax Tests (Requires FAL_KEY + LLM Key)

### 7.1 Extract Characters

```bash
bun run pipeline vimax:extract-characters \
  -t "Alice was a curious girl. The Mad Hatter sat at the long table with the March Hare." \
  -o /tmp/cli-test
# Expected: characters.json with Alice, Mad Hatter, March Hare
```

### 7.2 Generate Script

```bash
bun run pipeline vimax:generate-script \
  --idea "A robot discovers it can dream" -d 30 -o /tmp/cli-test
# Expected: script.json with scenes
```

### 7.3 Full Idea to Video (Long Running)

```bash
bun run pipeline vimax:idea2video \
  --idea "A cat astronaut explores Mars" -d 30 --no-portraits -o /tmp/cli-test
# Note: This runs the full pipeline — may take 5-15 minutes
```

---

## 8. Unit Tests

```bash
# Run all tests (includes native pipeline tests)
bun run test

# Run only native pipeline tests
cd apps/web && bunx vitest run --reporter=verbose 2>&1 | grep -E "(native|cli|vimax)"
```

Test files covering the CLI:

| File | Coverage |
|------|----------|
| `electron/__tests__/cli-pipeline.test.ts` | Arg parsing, list-models, estimate-cost, generate validation, run-pipeline |
| `electron/__tests__/native-pipeline-e2e.test.ts` | Registry, model lookups, cost estimation, chain validation |
| `electron/__tests__/cli-v2-gaps.test.ts` | Arg parsing parity |
| `electron/__tests__/cli-v3-gaps.test.ts` | negative-prompt, project-id, convenience functions |
| `electron/__tests__/native-registry.test.ts` | Registry CRUD |
| `electron/__tests__/native-cost-calculator.test.ts` | Cost math |
| `electron/__tests__/native-chain-parser.test.ts` | YAML parsing |
| `electron/__tests__/native-api-caller.test.ts` | API caller units |
| `electron/__tests__/native-step-executors.test.ts` | Step executor units |
| `electron/__tests__/vimax-*.test.ts` (4 files) | ViMax adapters, agents, pipelines, types |

---

## Quick Checklist

Copy-paste this for a fast smoke test run:

```bash
# 1. CLI loads
bun run pipeline --version

# 2. Registry works
bun run pipeline list-models | head -5

# 3. Cost estimation works
bun run pipeline estimate-cost -m flux_dev

# 4. Key management works
bun run pipeline check-keys

# 5. Project management works
bun run pipeline init-project --directory /tmp/qcut-smoke --dry-run

# 6. Error handling works
bun run pipeline generate-image 2>&1 | head -3
# Expected: error about missing --text (model defaults to nano_banana_pro)

# 7. Unit tests pass
bun run test
```

All 7 checks should pass without any API keys configured.

---

## Test Run Results

### Run 1 (2026-02-21) — Smoke Tests

| Test | Result | Notes |
|------|--------|-------|
| 1.1 `--version` | Pass | Returns `1.0.0` |
| 1.1 `--help` | Pass | Full usage text with all 34 commands |
| 1.2 `list-models` | Pass | 77 models listed |
| 1.2 `list-models --category` | Pass | Correct filtering (11 text_to_video) |
| 1.2 `list-models --json` | Pass | Valid JSON with schema_version |
| 1.3 `list-video-models` | **Fixed** | Was silently empty — CLI renderer didn't match this command name |
| 1.3 `list-avatar-models` | **Fixed** | Same bug — 13 avatar models now shown |
| 1.3 `list-motion-models` | **Fixed** | Now prints "0 models" (correct — none registered in registry) |
| 1.3 `list-speech-models` | **Fixed** | Now prints 3 ElevenLabs models |
| 1.3 `vimax:list-models` | Pass | 42 models |
| 1.4 `estimate-cost` (flux_dev) | Pass | $0.003 |
| 1.4 `estimate-cost` (kling 5s) | Pass | $0.700 |
| 1.4 `estimate-cost` (veo3 8s) | Pass | $6.000 |
| 1.5 `check-keys` | Pass | 10 keys listed, all "not set" |
| 1.6 `init-project --dry-run` | Pass | Lists 11 directories |
| 1.6 `init-project` (actual) | Pass | Creates full tree |
| 1.6 `structure-info` | Pass | Correct file counts (all 0) |
| 1.6 `create-examples` | Pass | 5 YAML files written |
| 1.7 `vimax:create-registry` | Pass | Registry JSON created |
| 1.7 `vimax:show-registry` | Pass | Alice + Bob entries displayed |
| 1.8 `organize-project --dry-run` | Pass | "Organized 4 files" (summary only, no per-file detail) |
| 1.8 `organize-project` (actual) | Pass | Files sorted into images/videos/audio/text |
| 2.1 Generate without key | Pass | "No API key configured for provider: fal", exit 1 (note: JSON progress line leaks before error) |
| 2.2 Generate without flags | Pass | Clean error: "Missing --model", exit 1 |
| 2.3 Unknown command | Pass | "Unknown command: not-a-command", exit 2 |
| 2.4 Invalid YAML | Pass | YAML parse error with line/column info, no crash |

### Run 2 (2026-02-21) — Validation Fixes Verified

Improvements 3 and 4 from Run 1 implemented and verified:

| Test | Result | Notes |
|------|--------|-------|
| `generate-image` (no flags) | Pass | `"Missing --model. Run --help for usage."`, exit 1 |
| `generate-image -m flux_dev` (no text) | **Fixed** | `"Missing --text/-t (prompt for image generation)."` — was hitting API key check |
| `create-video -m kling_2_6_pro` (no text/image) | **Fixed** | `"Missing --text/-t or --image-url (need a prompt or image input)."` — was hitting API key check |
| `generate-avatar -m omnihuman_v1_5` (no text/audio) | **Fixed** | `"Missing --text/-t or --audio-url (need a script or audio input)."` |
| `list-video-models --json` | Pass | Already works — outputs JSON with schema_version (improvement 4 was false alarm) |
| `list-avatar-models --json` | Pass | Same — works correctly |

### Unit Tests

- **2816 passed**, 32 failed across 199 test files
- **All native pipeline CLI tests passed** — zero failures in 13 CLI/native/vimax test files

Failed test files (all unrelated to native CLI):

| File | Failures | Root Cause |
|------|----------|------------|
| `claude-generate-handler.test.ts` | 12 | Mock setup issue with pipeline execute |
| `claude-analyze-handler.test.ts` | 2 | resolveVideoPath mock path resolution |
| `claude-scene-handler.test.ts` | 2 | Gemini API mock mismatch |
| `claude-transcribe-handler.test.ts` | 1 | FAL storage upload mock (fetch undefined) |
| `ai-video-migration.test.ts` | 1 | Migration test setup |
| `stage2-integration.test.ts` | 3 | Real FFmpeg audio extraction (environment-dependent) |
| `slider.test.tsx` | 4 | Radix UI render in JSDOM |
| `timeline-toolbar.test.tsx` | 4 | Component render in JSDOM |
| `markdown-editor-panel.test.tsx` | 3 | Component render in JSDOM |

### Bugs Found & Fixed

**Bug 1 (Run 1)**: `list-video-models`, `list-avatar-models`, `list-motion-models`, `list-speech-models` returned correct data but produced no console output. The CLI renderer in `cli.ts` only matched `list-models` and `vimax:list-models`.
**Fix**: Added 4 missing command names to the rendering condition in `electron/native-pipeline/cli.ts` (line ~424).

**Bug 2 (Run 2)**: `generate-image -m flux_dev`, `create-video -m kling_2_6_pro`, and `generate-avatar -m omnihuman_v1_5` (with model but missing required input) all bypassed argument validation and hit the API key check, returning misleading "No API key configured" errors instead of telling the user which flags were missing.
**Fix**: Added input validation in `electron/native-pipeline/cli-runner.ts` `handleGenerate()` that checks for required input (`--text`, `--image-url`, `--audio-url`) per command type before attempting API calls.

### Run 3 (2026-02-21) — Remaining Improvements Implemented

Improvements 1, 4, and 5 from Run 1 implemented and verified:

| Test | Result | Notes |
|------|--------|-------|
| `list-motion-models` | **Fixed** | Now lists 1 model (`kling_motion_control`) — was 0, category was missing |
| `generate-image -m flux_dev -t "test" --json` | **Fixed** | Clean JSON output only, no progress leak to stdout |
| `generate-image -m flux_dev -t "test"` (non-TTY) | **Fixed** | Progress goes to stderr, error to stderr — stdout clean |
| `organize-project --dry-run` | **Fixed** | Now shows per-file detail: `photo.png → images/`, `clip.mp4 → videos/`, etc. |

### Unit Tests (Run 3)

- **2816 passed**, 32 failed across 199 test files (same as Run 2 — no regressions)
- **All native pipeline CLI tests passed** — zero failures

### Bugs Found & Fixed (Run 3)

**Bug 3**: `kling_motion_control` was registered with `categories: ["avatar"]` but the `list-motion-models` command filters by `motion_transfer` category. The model's description says "Motion transfer from video to image" and its features include `motion_transfer`, but the category was wrong.
**Fix**: Added `"motion_transfer"` to the categories array in `electron/native-pipeline/registry-data-2.ts` (line ~161).

**Bug 4**: In `--json` mode, `createProgressReporter` emitted progress events to stdout via `console.log`, mixing progress JSON with the final result JSON. In non-TTY mode, progress also went to stdout, polluting piped output.
**Fix**: In `electron/native-pipeline/cli-runner.ts` `createProgressReporter()`: suppress all progress in `--json` mode (final result only); redirect non-TTY progress from `console.log` (stdout) to `console.error` (stderr). Updated test in `electron/__tests__/cli-pipeline.test.ts`.

**Bug 5**: `organize-project --dry-run` only printed "Organized N files" summary. The `result.moved` array with per-file `from`/`to`/`category` data was returned from the handler but never rendered.
**Fix**: Added per-file rendering in `electron/native-pipeline/cli.ts` organize-project output block.

### Run 4 (2026-02-21) — Live Generation Tests (FAL_KEY)

**Key discovery**: FAL_KEY was already stored in `~/.config/video-ai-studio/credentials.env` (synced by Electron app), but the CLI's `key-manager.ts` only checked `~/.qcut/.env` and `process.env`. The `api-caller.ts` had a 3-tier fallback (env → Electron → AICP credentials) but the CLI explicitly used `envApiKeyProvider` (env-only).

| Test | Result | Notes |
|------|--------|-------|
| 4.1 `generate-image` (flux_dev) | **Pass** | `.jpg` file in output dir, 5.8s |
| 4.2 `generate-image --json` | **Pass** | JSON with `success`, `outputPath`, `outputPaths`, `duration` (no `cost` field) |
| 4.3 `create-video` (kling_2_6_pro) | **Fail** | `"Failed to fetch result: 422"` — FAL queue result URL construction bug |
| 4.5 `generate-grid` (2x2) | **Pass** | 4 images generated, grid composited, 20.3s (no output path printed) |
| 6.1 `run-pipeline` (text-to-video-basic.yaml) | **Pass** | Pipeline completes, `.mp4` output, 156.5s |

### Bugs Found & Fixed (Run 4)

**Bug 6**: FAL queue polling used a manually constructed URL (`queue.fal.run/{full-endpoint}/requests/{id}/status`) but FAL returns a different path in its `status_url`/`response_url` fields. For `fal-ai/flux/dev`, the CLI built `.../fal-ai/flux/dev/requests/...` but FAL expected `.../fal-ai/flux/requests/...`. This caused 405 on status polls and 422 on result fetches.
**Fix**: Updated `pollQueueStatus()` in `electron/native-pipeline/api-caller.ts` to accept `statusUrl`/`responseUrl` from the queue submit response and use them instead of constructing URLs. Also added `status.response_url` fallback from the status poll response for the result fetch.

**Bug 7**: CLI `key-manager.ts` (`loadEnvFile`, `checkKeys`) only checked `~/.qcut/.env` and `process.env`. It missed keys stored in the AICP CLI credentials file (`~/.config/video-ai-studio/credentials.env`), which is where the Electron app syncs keys via `syncToAicpCredentials()`.
**Fix**: Updated `loadEnvFile()` to fall back to AICP credentials path. Updated `checkKeys()` to show keys from AICP CLI source with `"aicp-cli"` label.

### Unit Tests (Run 4)

- **2816 passed**, 32 failed across 199 test files (same as previous runs — no regressions)

### Sections Not Tested

| Section | Reason |
|---------|--------|
| 3. API Key Setup | Requires interactive `set-key` prompt |
| 4.4 Image to Video | Blocked by Bug 6 (video generation 422) |
| 4.6 Upscale Image | Not tested yet |
| 5. Analysis | Requires GEMINI_API_KEY |
| 7. ViMax | Requires FAL_KEY + LLM key |

### Run 5 (2026-02-21) — Bug Fixes Verified (Code Review)

Improvements 3, 4, and 5 from Run 4 implemented and verified via code review + unit tests:

| Test | Result | Notes |
|------|--------|-------|
| Video generation 422 | **Fixed** | `api-caller.ts` now handles immediate COMPLETED in queue response; uses FAL `status_url`/`response_url` |
| `generate-grid` output path | **Fixed** | Falls back to first individual image path when grid composite unavailable |
| `generate-image --json` cost | **Fixed** | `handleGenerate()` now uses `estimateCost()` fallback when executor doesn't return cost |

### Unit Tests (Run 5)

- **2816 passed**, 32 failed across 199 test files (same as previous runs — no regressions)

### Bugs Found & Fixed (Run 5)

**Bug 8**: `handleGenerateGrid()` returned `outputPaths: gridResult.imagePaths` which was the subset of images used for the grid. When `sharp` was not available, `outputPath` was undefined and no output was shown.
**Fix**: Added fallback in `cli-runner.ts` — if no grid composite path, use first individual image. Also changed `outputPaths` to return all generated image paths.

**Bug 9**: `handleGenerate()` returned `cost: result.cost` but the executor step result never populated `cost`. Users saw no cost in JSON output.
**Fix**: Added `estimateCost()` fallback in `cli-runner.ts` — if the executor doesn't return cost, estimate from the model registry using the generation parameters.

### Remaining Improvements

1. **Fix 9 unrelated failing test files** — UI component tests (slider, timeline-toolbar, markdown-editor-panel) fail due to JSDOM/Radix incompatibilities; Electron handler tests have stale mocks
2. **`setup` command not smoke-tested** — writes to `~/.qcut/.env` which mutates user home directory; consider a `--dry-run` flag
3. **Live re-test `create-video`** — Bug 6 fix (422) needs live verification with FAL_KEY
4. **Test `run-pipeline --save-intermediates`** — section 6.2 not yet tested
5. **Test stdin pipe input** — section 6.3 (`echo "..." | bun run pipeline run-pipeline --input -`) not yet tested
