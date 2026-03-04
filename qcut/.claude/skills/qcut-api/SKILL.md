---
name: qcut-api
description: Control QCut editor programmatically via its REST API and Electron IPC. Use when the user asks to manipulate media files, timeline elements, project settings, export presets, video analysis, transcription, auto-editing, or diagnose errors in a running QCut instance.
argument-hint: [action description or project ID]
allowed-tools: Bash(curl *), Read, Grep
---

# QCut Editor Control API

Programmatically control a running QCut editor instance through its REST API (from Claude Code terminal) or Electron IPC (from renderer code).

**Reference files** (load only the one you need):
- `REF-MEDIA-TIMELINE.md` — Media + Timeline types, endpoints, curl examples
- `REF-ANALYSIS.md` — Transcription, scenes, frames, fillers, AICP analysis
- `REF-EDITING.md` — Cuts, auto-edit, range delete, cut suggestions
- `REF-PROJECT-EXPORT.md` — Project, export, generate, diagnostics, security, IPC

## Architecture

```
Claude Code CLI ──HTTP──> http://127.0.0.1:8765/api/claude/*
                                    |
                                    v
                          Electron Main Process
                                    |
                                    v
                          Zustand Stores (renderer)
```

- **HTTP REST API** — External control from terminal/scripts (port 8765)
- **Electron IPC** — Internal control from renderer via `window.electronAPI.claude.*`
- Both interfaces call the same extracted handler functions

## Quick Start

### Check if QCut is running

```bash
curl -s http://127.0.0.1:8765/api/claude/health | jq
```

### Authentication (optional)

If `QCUT_API_TOKEN` is set in QCut's environment:

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8765/api/claude/health
```

### Find project and track IDs

```bash
# List projects
ls ~/Documents/QCut/Projects/

# Get track IDs from timeline
curl -s http://127.0.0.1:8765/api/claude/timeline/$PROJECT_ID | \
  python3 -c "import sys,json; [print(f'{t[\"id\"]} - {t[\"name\"]} ({t[\"type\"]})') for t in json.load(sys.stdin)['data']['tracks']]"

# List media IDs
curl -s http://127.0.0.1:8765/api/claude/media/$PROJECT_ID | jq '.data[] | {id, name, type}'
```

## 12 API Modules

### 1. Media API — Manage project media files

| Action | Method | Endpoint |
|--------|--------|----------|
| List files | GET | `/media/:projectId` |
| File info | GET | `/media/:projectId/:mediaId` |
| Import local file | POST | `/media/:projectId/import` |
| Import from URL | POST | `/media/:projectId/import-from-url` |
| Batch import (max 20) | POST | `/media/:projectId/batch-import` |
| Extract video frame | POST | `/media/:projectId/:mediaId/extract-frame` |
| Rename | PATCH | `/media/:projectId/:mediaId/rename` |
| Delete | DELETE | `/media/:projectId/:mediaId` |

**Media IDs** are deterministic: `media_${base64url(filename)}`.

### 2. Timeline API — Read/write timeline data

| Action | Method | Endpoint |
|--------|--------|----------|
| Export (JSON or markdown) | GET | `/timeline/:projectId` (`?format=md`) |
| Import (JSON or markdown) | POST | `/timeline/:projectId/import` |
| Add single element | POST | `/timeline/:projectId/elements` |
| Batch add (max 50) | POST | `/timeline/:projectId/elements/batch` |
| Update single element | PATCH | `/timeline/:projectId/elements/:elementId` |
| Batch update (max 50) | PATCH | `/timeline/:projectId/elements/batch` |
| Delete single element | DELETE | `/timeline/:projectId/elements/:elementId` |
| Batch delete (max 50) | DELETE | `/timeline/:projectId/elements/batch` |
| Split element | POST | `/timeline/:projectId/elements/:elementId/split` |
| Move element | POST | `/timeline/:projectId/elements/:elementId/move` |
| Arrange elements | POST | `/timeline/:projectId/arrange` |
| Set selection | POST | `/timeline/:projectId/selection` |
| Get selection | GET | `/timeline/:projectId/selection` |
| Clear selection | DELETE | `/timeline/:projectId/selection` |

**Arrange modes:** `sequential`, `spaced`, `manual` (with custom order array).
**Split modes:** `split` (default), `keepLeft`, `keepRight`.
**Import options:** `replace: true` clears timeline before importing.

### 3. Cut List API — Batch cuts and range operations

| Action | Method | Endpoint |
|--------|--------|----------|
| Batch cuts on element | POST | `/timeline/:projectId/cuts` |
| Range delete | DELETE | `/timeline/:projectId/range` |

**Batch cuts**: Remove multiple time intervals from a single element. Validates overlapping/invalid intervals.
**Range delete**: Delete all content in a time range across tracks. Supports `ripple` and `crossTrackRipple`.

### 4. Auto-Edit API — AI-powered filler/silence removal

| Action | Method | Endpoint |
|--------|--------|----------|
| Auto-edit (sync) | POST | `/timeline/:projectId/auto-edit` |
| Auto-edit (async start) | POST | `/timeline/:projectId/auto-edit/start` |
| Auto-edit job status | GET | `/timeline/:projectId/auto-edit/jobs/:jobId` |
| List auto-edit jobs | GET | `/timeline/:projectId/auto-edit/jobs` |
| Cancel auto-edit job | POST | `/timeline/:projectId/auto-edit/jobs/:jobId/cancel` |

Supports `dryRun: true` to preview cuts without applying. Use async routes for videos >30s processing time.

### 5. Analysis API — Video understanding

| Action | Method | Endpoint |
|--------|--------|----------|
| Analyze video (AICP) | POST | `/analyze/:projectId` |
| List analysis models | GET | `/analyze/models` |
| Detect scenes (sync) | POST | `/analyze/:projectId/scenes` |
| Analyze frames (sync) | POST | `/analyze/:projectId/frames` |
| Detect fillers | POST | `/analyze/:projectId/fillers` |
| Suggest cuts (sync) | POST | `/analyze/:projectId/suggest-cuts` |
| Suggest cuts (async) | POST | `/analyze/:projectId/suggest-cuts/start` |
| Suggest-cuts job status | GET | `/analyze/:projectId/suggest-cuts/jobs/:jobId` |
| List suggest-cuts jobs | GET | `/analyze/:projectId/suggest-cuts/jobs` |
| Cancel suggest-cuts job | POST | `/analyze/:projectId/suggest-cuts/jobs/:jobId/cancel` |

**Note:** Scene detection and frame analysis are sync-only (no async job routes). Frame analysis uses a provider cascade: tries Anthropic first, falls back to OpenRouter. Requires at least one API key configured.

### 6. Transcription API — Speech to text

| Action | Method | Endpoint |
|--------|--------|----------|
| Transcribe (sync) | POST | `/transcribe/:projectId` |
| Transcribe (async start) | POST | `/transcribe/:projectId/start` |
| Transcription job status | GET | `/transcribe/:projectId/jobs/:jobId` |
| List transcription jobs | GET | `/transcribe/:projectId/jobs` |
| Cancel transcription job | POST | `/transcribe/:projectId/jobs/:jobId/cancel` |

Use async routes for videos >30s — sync route hits the 30s HTTP timeout.

### 7. Generate API — AI video/image generation

| Action | Method | Endpoint |
|--------|--------|----------|
| Start generation job | POST | `/generate/:projectId/start` |
| Job status | GET | `/generate/:projectId/jobs/:jobId` |
| List jobs | GET | `/generate/:projectId/jobs` |
| Cancel job | POST | `/generate/:projectId/jobs/:jobId/cancel` |
| List models | GET | `/generate/models` |
| Estimate cost | POST | `/generate/estimate-cost` |

### 8. Project API — Settings, stats, summary, reports

| Action | Method | Endpoint |
|--------|--------|----------|
| Get settings | GET | `/project/:projectId/settings` |
| Update settings | PATCH | `/project/:projectId/settings` |
| Get stats | GET | `/project/:projectId/stats` |
| Get summary (markdown) | GET | `/project/:projectId/summary` |
| Generate pipeline report | POST | `/project/:projectId/report` |

**Pipeline report** generates a markdown report of all Claude API operations performed in the session. Options: `outputPath` (full file path — directory is extracted automatically), `outputDir` (directory), `saveToDisk` (inferred from outputPath/outputDir), `clearLog` (boolean).

### 9. Export API — Presets, recommendations, and export jobs

| Action | Method | Endpoint |
|--------|--------|----------|
| List presets | GET | `/export/presets` |
| Get recommendation | GET | `/export/:projectId/recommend/:target` |
| Start export job | POST | `/export/:projectId/start` |
| Export job status | GET | `/export/:projectId/jobs/:jobId` |
| List export jobs | GET | `/export/:projectId/jobs` |

**Targets:** `youtube`, `youtube-4k`, `youtube-1080p`, `youtube-720p`, `tiktok`, `instagram-reel`, `instagram-post`, `instagram-landscape`, `twitter`, `linkedin`, `discord`

### 10. Diagnostics API — Error analysis

| Action | Method | Endpoint |
|--------|--------|----------|
| Analyze error | POST | `/diagnostics/analyze` |

### 11. PersonaPlex API — Speech-to-speech

| Action | Method | Endpoint |
|--------|--------|----------|
| Generate audio | POST | `/personaplex/generate` |

### 12. MCP App Preview

| Action | Method | Endpoint |
|--------|--------|----------|
| Forward HTML to preview | POST | `/mcp/app` |

## Async Job Pattern

Long-running operations (transcription, auto-edit, suggest-cuts, export, generation) use an async job pattern to avoid the 30s HTTP timeout:

```bash
# 1. Start job
JOB=$(curl -s -X POST http://127.0.0.1:8765/api/claude/<handler>/$PROJECT_ID/start \
  -H "Content-Type: application/json" -d '{"mediaId":"..."}' | jq -r '.data.jobId')

# 2. Poll until complete
curl -s http://127.0.0.1:8765/api/claude/<handler>/$PROJECT_ID/jobs/$JOB | jq '.data.status'

# 3. Get result when status is "completed"
curl -s http://127.0.0.1:8765/api/claude/<handler>/$PROJECT_ID/jobs/$JOB | jq '.data.result'
```

Job statuses: `queued` -> `running` -> `completed` | `failed` | `cancelled`

## Common Workflows

### Import media and add to timeline

```bash
# Batch import files
curl -s -X POST http://127.0.0.1:8765/api/claude/media/$PROJECT_ID/batch-import \
  -H "Content-Type: application/json" \
  -d '{"items":[{"path":"/path/to/clip1.mp4"},{"path":"/path/to/clip2.mp4"}]}'

# Add to timeline (works immediately after import)
curl -s -X POST http://127.0.0.1:8765/api/claude/timeline/$PROJECT_ID/elements/batch \
  -H "Content-Type: application/json" \
  -d '{"elements":[
    {"type":"video","trackId":"TRACK_ID","startTime":0,"duration":5,"sourceName":"clip1.mp4"},
    {"type":"video","trackId":"TRACK_ID","startTime":5,"duration":3,"sourceName":"clip2.mp4"}
  ]}'
```

### Transcribe and auto-edit a video

```bash
# Start async transcription
JOB=$(curl -s -X POST http://127.0.0.1:8765/api/claude/transcribe/$PROJECT_ID/start \
  -H "Content-Type: application/json" -d '{"mediaId":"MEDIA_ID"}' | jq -r '.data.jobId')

# Poll until done
curl -s http://127.0.0.1:8765/api/claude/transcribe/$PROJECT_ID/jobs/$JOB | jq '.data.status'

# Auto-edit: preview cuts (dry run)
curl -s -X POST http://127.0.0.1:8765/api/claude/timeline/$PROJECT_ID/auto-edit \
  -H "Content-Type: application/json" \
  -d '{"elementId":"EL_ID","mediaId":"MEDIA_ID","removeFillers":true,"removeSilences":true,"dryRun":true}'

# Auto-edit: apply cuts
curl -s -X POST http://127.0.0.1:8765/api/claude/timeline/$PROJECT_ID/auto-edit \
  -H "Content-Type: application/json" \
  -d '{"elementId":"EL_ID","mediaId":"MEDIA_ID","removeFillers":true,"removeSilences":true,"dryRun":false}'
```

### Export for a platform

```bash
# Get recommendation
curl -s http://127.0.0.1:8765/api/claude/export/$PROJECT_ID/recommend/tiktok | jq

# Apply settings
curl -s -X PATCH -H "Content-Type: application/json" \
  -d '{"width":1080,"height":1920,"fps":30}' \
  http://127.0.0.1:8765/api/claude/project/$PROJECT_ID/settings

# Start export (preset)
curl -s -X POST http://127.0.0.1:8765/api/claude/export/$PROJECT_ID/start \
  -H "Content-Type: application/json" -d '{"preset":"tiktok"}'

# Start export (custom settings — top-level or nested under "settings")
curl -s -X POST http://127.0.0.1:8765/api/claude/export/$PROJECT_ID/start \
  -H "Content-Type: application/json" -d '{"width":1280,"height":720,"fps":24,"format":"mp4"}'

# Poll export job
curl -s http://127.0.0.1:8765/api/claude/export/$PROJECT_ID/jobs/$JOB_ID | jq
```

### Inspect a project

```bash
# Project summary (markdown)
curl -s http://127.0.0.1:8765/api/claude/project/$PROJECT_ID/summary | jq -r '.data.markdown'

# Timeline as readable markdown
curl -s "http://127.0.0.1:8765/api/claude/timeline/$PROJECT_ID?format=md" | jq -r '.data'

# Pipeline report of all operations
curl -s -X POST http://127.0.0.1:8765/api/claude/project/$PROJECT_ID/report \
  -H "Content-Type: application/json" -d '{}' | jq -r '.data.markdown'
```

## Response Format

All responses use a consistent JSON envelope:

```json
{"success": true, "data": { ... }, "timestamp": 1707580800000}
```

Error responses:

```json
{"success": false, "error": "Error message", "timestamp": 1707580800000}
```

## Limits

| Limit | Value |
|-------|-------|
| Batch import items | 20 |
| Batch timeline operations | 50 |
| File size (URL import) | 5 GB |
| Download timeout | 5 min |
| Generation jobs stored | 50 |
| Transcription jobs stored | 50 |
| HTTP request timeout | 30 seconds |
| HTTP request body | 1 MB |

## Data Storage

```
Documents/QCut/Projects/{projectId}/
  project.json     # Settings (Project API)
  timeline.json    # Timeline data
  media/           # Media files (Media API)
```

## Source Files

| File | Purpose |
|------|---------|
| `electron/claude/index.ts` | Entry point, `setupAllClaudeIPC()` |
| `electron/claude/claude-http-server.ts` | HTTP REST server + core routes |
| `electron/claude/claude-http-analysis-routes.ts` | Analysis/transcription/editing routes |
| `electron/claude/claude-media-handler.ts` | Media operations (import, batch, frame extract) |
| `electron/claude/claude-timeline-handler.ts` | Timeline export/import, batch ops, arrange |
| `electron/claude/claude-project-handler.ts` | Project settings/stats |
| `electron/claude/claude-export-handler.ts` | Export presets, jobs, trigger |
| `electron/claude/claude-diagnostics-handler.ts` | Error analysis |
| `electron/claude/claude-transcribe-handler.ts` | Transcription (sync + async jobs) |
| `electron/claude/claude-scene-handler.ts` | Scene detection (sync + async jobs) |
| `electron/claude/claude-vision-handler.ts` | Frame analysis (sync + async jobs) |
| `electron/claude/claude-filler-handler.ts` | Filler word detection |
| `electron/claude/claude-cuts-handler.ts` | Batch cut-list execution |
| `electron/claude/claude-range-handler.ts` | Time-range delete |
| `electron/claude/claude-auto-edit-handler.ts` | Auto-edit (sync + async jobs) |
| `electron/claude/claude-suggest-handler.ts` | Cut suggestions (sync + async jobs) |
| `electron/claude/claude-analyze-handler.ts` | AICP video analysis |
| `electron/claude/claude-generate-handler.ts` | AI generation job tracking |
| `electron/claude/claude-summary-handler.ts` | Project summary + pipeline report |
| `electron/claude/claude-operation-log.ts` | In-memory operation log |
| `electron/claude/utils/http-router.ts` | HTTP router utility |
| `electron/claude/utils/helpers.ts` | Path/security utilities |
| `electron/types/claude-api.ts` | Shared type definitions |
| `apps/web/src/lib/claude-timeline-bridge.ts` | Frontend IPC bridge |
| `apps/web/src/lib/claude-timeline-bridge-helpers.ts` | Bridge helper functions |

**See REF-*.md files for types, endpoint details, and curl examples.**
