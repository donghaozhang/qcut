---
name: qcut-toolkit
description: Unified QCut media toolkit — organize project files, process media with FFmpeg, generate AI content, control the QCut editor via API, generate video prompts, and test MCP preview. Use when the user asks about any media workflow, file organization, video processing, AI generation, editor control, video prompts, or content pipeline task.
argument-hint: [task description]
---

# QCut Toolkit

Unified entry point for QCut's seven sub-skills. Route tasks to the appropriate sub-skill based on what the user needs.

## Sub-Skills

### 1. native-cli — Project Setup & Native Pipeline Commands
**When:** Setting up a project, cleaning up files, organizing workspace, importing media
**Invoke:** `/native-cli`
**Skill path:** `.claude/skills/native-cli/SKILL.md`

Handles:
- Initializing the standard project layout (`input/*`, `output/*`, `config/`)
- Organizing media by extension with `organize-project`
- Running structure audits with `structure-info`
- Running additional native pipeline commands when needed

### 2. ffmpeg-skill — Media Processing
**When:** Converting, compressing, trimming, resizing, extracting audio, adding subtitles, creating GIFs, applying effects
**Invoke:** `/ffmpeg-skill`
**Skill path:** `.claude/skills/ffmpeg-skill/Skill.md`

Handles:
- Format conversion (MP4, MKV, WebM, MP3, etc.)
- Video compression (`-crf`), resizing (`scale=`), trimming (`-ss`/`-t`)
- Audio extraction, subtitle burn-in, text overlays
- GIF creation, speed changes, merging/concatenation
- Streaming (HLS, DASH, RTMP) and complex filtergraphs

### 3. ai-content-pipeline — AI Content Generation & Analysis
**When:** Generating images/videos/avatars, transcribing audio, analyzing video, running AI pipelines
**Invoke:** `/ai-content-pipeline`
**Skill path:** `.claude/skills/ai-content-pipeline/Skill.md`

Handles:
- Text-to-image (FLUX, Imagen 4, Nano Banana Pro, GPT Image)
- Image-to-video (Veo 3, Sora 2, Kling, Hailuo)
- Avatar/lipsync generation (OmniHuman, Fabric, Multitalk)
- Speech-to-text transcription with word-level timestamps (Scribe v2)
- Video analysis with Gemini 3 Pro
- YAML pipeline orchestration with parallel execution
- Motion transfer between images and videos

### 4. qcut-api — Editor Control API
**When:** Controlling QCut programmatically, managing media/timeline/project via REST or IPC, getting export presets, diagnosing errors
**Invoke:** `/qcut-api`
**Skill path:** `.claude/skills/qcut-api/SKILL.md`

Handles:
- HTTP REST API at `http://127.0.0.1:8765/api/claude/*` (18 endpoints)
- Media management (list, import, delete, rename files)
- Timeline read/write (export JSON/Markdown, add/update/remove elements)
- Project settings (get/update name, resolution, FPS, format)
- Export presets and platform recommendations (YouTube, TikTok, Instagram, etc.)
- Error diagnostics with system info

### 5. seedance — Video Prompt Engineering
**When:** Writing video prompts, Seedance/即梦 workflows, AI video prompt generation, video descriptions (Chinese or English)
**Invoke:** `/seedance`
**Skill path:** `.claude/skills/seedance/SKILL.md`

Handles:
- Seedance 2.0 (即梦) prompt generation in Chinese
- Multi-modal video prompts (text-to-video, image-to-video, video extension)
- Short drama (短剧), advertising video, and cinematic prompt templates
- Prompt engineering best practices for ByteDance video models

### 6. qcut-mcp-preview-test — MCP Preview Testing
**When:** Testing MCP app preview, toggling "MCP Media App" mode, debugging iframe rendering, troubleshooting `mcp:app-html` events or `/api/claude/mcp/app`
**Invoke:** `/qcut-mcp-preview-test`
**Skill path:** `.claude/skills/qcut-mcp-preview-test/SKILL.md`

Handles:
- Switching preview panel between video preview and MCP app mode
- Validating iframe srcDoc rendering for MCP HTML content
- Debugging IPC (`mcp:app-html`) and HTTP (`/api/claude/mcp/app`) delivery
- Crafting prompts that modify MCP media app UI safely

### 7. pr-comments — PR Review Processing
**When:** Exporting PR comments, evaluating code reviews, fixing review feedback from CodeRabbit/Gemini bots
**Invoke:** `/pr-comments`
**Skill path:** `.claude/skills/pr-comments/SKILL.md`

Handles:
- Export review comments from GitHub PRs to markdown files
- Preprocess comments into evaluation task files
- Analyze comment groupings by source file
- Evaluate, fix, or reject individual review comments
- Batch process all comments with bottom-up line ordering
- Resolve threads on GitHub and track completed tasks

## Routing Logic

When the user's request involves multiple sub-skills, chain them in this order:

1. **Organize first** — Ensure project structure exists before processing
2. **Process with FFmpeg** — Convert, trim, or prepare source media
3. **Generate with AI** — Create new content or analyze existing media
4. **Write prompts** — Generate video prompts for Seedance/即梦 if needed
5. **Control editor** — Use the API to update timeline, settings, or import results
6. **Organize output** — Place results in `media/generated/` or `output/`

### Quick Routing Table

| User says | Route to |
|-----------|----------|
| "organize", "set up project", "clean up files" | native-cli |
| "convert", "compress", "trim", "resize", "extract audio", "gif", "subtitle" | ffmpeg-skill |
| "generate image", "generate video", "avatar", "lipsync", "transcribe", "analyze video", "AI pipeline" | ai-content-pipeline |
| "add to timeline", "update project settings", "list media", "export preset", "configure for TikTok" | qcut-api |
| "import media via API", "get project stats", "diagnose error" | qcut-api |
| "video prompt", "Seedance", "即梦", "视频提示词", "write video description" | seedance |
| "test MCP preview", "MCP app mode", "debug iframe", "mcp:app-html" | qcut-mcp-preview-test |
| "export PR comments", "fix review feedback", "process code review" | pr-comments |
| "process this video and generate thumbnails" | ffmpeg-skill → ai-content-pipeline |
| "import media and organize" | native-cli |
| "generate content and add to timeline" | ai-content-pipeline → qcut-api |
| "set up project then generate content" | native-cli → ai-content-pipeline |
| "write prompt then generate video" | seedance → ai-content-pipeline |

### Multi-Step Workflow Example

User: "Take my raw footage, trim the first 30 seconds, compress it, then generate AI thumbnails"

1. `/native-cli` — Run `init-project` / `organize-project` to prepare the project structure and source media
2. `/ffmpeg-skill` — `ffmpeg -ss 00:00:30 -i input.mp4 -c copy trimmed.mp4` then compress
3. `/ai-content-pipeline` — Extract a frame, generate styled thumbnail with `flux_dev`
4. Place output in `input/`, `output/`, or `media/generated/` as needed

## Output Structure

All sub-skills follow the same project structure:

```
Documents/QCut/Projects/{project-name}/
├── input/              ← native-cli init-project / organize-project
│   ├── images/
│   ├── videos/
│   ├── audio/
│   ├── text/
│   └── pipelines/
├── output/             ← final exports
│   ├── images/
│   ├── videos/
│   └── audio/
├── config/
└── media/generated/    ← ai-content-pipeline outputs (when used)
```

## Full Production Workflow

```
$ARGUMENTS
```

Break the request into steps, invoke each sub-skill in sequence, and report progress after each step. Always confirm destructive operations (overwriting files, deleting temp data) before executing.
