---
name: qcut-toolkit
description: Unified QCut media toolkit — organize project files, process media with FFmpeg, generate AI content, control the QCut editor with native CLI commands, generate video prompts, and test MCP preview. Use when the user asks about any media workflow, file organization, video processing, AI generation, editor control, video prompts, or content pipeline task.
argument-hint: [task description]
---

# QCut Toolkit

Unified entry point for QCut's sub-skills. Route tasks to the appropriate sub-skill based on what the user needs.

## Voiceover Policy

Finished narration must use ByteDance Seed Audio through QCut:

```bash
bun run pipeline gen tts -m seed_audio -t "<directed narration>" \
  --audio-format mp3 --sample-rate 48000
```

- Route voiceover generation to `ai-content-pipeline`; promo-specific timing
  and mixing rules live in `qcut-shot` and `qcut-cityfilm`.
- Never ship macOS `say`, Windows SAPI, `espeak`, or another operating-system
  voice. System TTS may only create a temporary timing placeholder.
- If Seed Audio or its provider credentials are unavailable, fail explicitly
  and keep the previous deliverable unchanged. Do not silently fall back to
  system TTS.

## Sub-Skills

### 1. native-cli — Project Setup & Native Pipeline Commands
**When:** Setting up a project, cleaning up files, organizing workspace, importing media
**Invoke:** `/native-cli`
**Skill path:** `.claude/skills/native-cli/SKILL.md`

Handles:
- Initializing the standard project layout (`input/*`, `output/*`, `config/`)
- Organizing media by extension with `organize-project`
- Running structure audits with `structure-info`
- Running editor media/timeline/export/diagnostic commands (`editor:*`)
- Running additional native pipeline commands when needed

### 2. qcut-vlog — Talking-Head Edit & Publishing Package
**When:** Turning talking-head/vlog footage into a verified social-ready edit and publishing package: clean baseline, restrained sticker/SFX variant, rights-aware B-roll version, Xiaohongshu copy, and a 9:16 cover
**Invoke:** `/qcut-vlog`
**Skill path:** `.claude/skills/qcut-toolkit/qcut-vlog/SKILL.md`

Handles:
- Word-level transcription for filler, stutter, and silence decisions
- Non-destructive FFmpeg trim/concat with retained cut metadata
- Shared QCut portrait filters and restrained skin smoothing through the native CLI
- Person cutout and still-image background replacement through the native CLI
- Post-cut retranscription so subtitle timing cannot drift
- Editable MP4 plus sidecar SRT, alongside a hard-captioned publishing MP4
- Sticker/SFX variant with a semantic cue sheet and a preserved audio master
- B-roll research with license archiving, FFmpeg 8 color preflight, and boundary checks
- Xiaohongshu titles, body copy, hashtags, and an exact 1080×1920 cover
- Safe resume based on artifact dependency timestamps

### 3. qcut-cityfilm — Reference-Driven City / Promo Films
**When:** Reproducing the structure and feel of a reference city, travel, or promo film with your own or licensed footage, including multi-language narration
**Invoke:** `/qcut-cityfilm`
**Skill path:** `.claude/skills/qcut-toolkit/qcut-cityfilm/SKILL.md`

Handles:
- Reference breakdown: contact sheets, transcript, and scene-cut pacing profile
- Shot-language inventory turned into licensed-footage search queries with attribution manifest
- Segment picking against per-act target shot lengths
- Per-act emotional narration through Seed Audio, one pass per language
- QCut project assembly (import, timeline, subtitles, export) via the editor CLI
- Final audio bed mixed outside the editor: ambience, segmented music, ducked narration
- Level and frame verification of the exported file, not just the timeline

### 4. ffmpeg-skill — Media Processing
**When:** Converting, compressing, trimming, resizing, extracting audio, adding subtitles, creating GIFs, applying effects
**Invoke:** `/ffmpeg-skill`
**Skill path:** `.claude/skills/qcut-toolkit/ffmpeg-skill/SKILL.md`

Handles:
- Format conversion (MP4, MKV, WebM, MP3, etc.)
- Video compression (`-crf`), resizing (`scale=`), trimming (`-ss`/`-t`)
- Audio extraction, subtitle burn-in, text overlays
- GIF creation, speed changes, merging/concatenation
- Streaming (HLS, DASH, RTMP) and complex filtergraphs

### 5. ai-content-pipeline — AI Content Generation & Analysis
**When:** Generating images/videos/avatars, transcribing audio, analyzing video, running AI pipelines
**Invoke:** `/ai-content-pipeline`
**Skill path:** `.claude/skills/qcut-toolkit/ai-content-pipeline/SKILL.md`

Handles:
- Text-to-image (FLUX, Imagen 4, Nano Banana Pro, GPT Image)
- Image-to-video (Veo 3, Sora 2, Kling, Hailuo)
- Avatar/lipsync generation (OmniHuman, Fabric, Multitalk)
- Speech-to-text transcription with word-level timestamps (Scribe v2)
- Video analysis with Gemini 3 Pro
- YAML pipeline orchestration with parallel execution
- Motion transfer between images and videos

### 6. seedance — Video Prompt Engineering
**When:** Writing video prompts, Seedance/即梦 workflows, AI video prompt generation, video descriptions (Chinese or English)
**Invoke:** `/seedance`
**Skill path:** `.claude/skills/qcut-toolkit/seedance/SKILL.md`

Handles:
- Seedance 2.0 (即梦) prompt generation in Chinese
- Multi-modal video prompts (text-to-video, image-to-video, video extension)
- Short drama (短剧), advertising video, and cinematic prompt templates
- Prompt engineering best practices for ByteDance video models

### 7. qcut-mcp-preview-test — MCP Preview Testing
**When:** Testing MCP app preview, toggling "MCP Media App" mode, debugging iframe rendering, troubleshooting `mcp:app-html` events or `/api/claude/mcp/app`
**Invoke:** `/qcut-mcp-preview-test`
**Skill path:** `.claude/skills/qcut-toolkit/qcut-mcp-preview-test/SKILL.md`

Handles:
- Switching preview panel between video preview and MCP app mode
- Validating iframe srcDoc rendering for MCP HTML content
- Debugging IPC (`mcp:app-html`) and HTTP (`/api/claude/mcp/app`) delivery
- Crafting prompts that modify MCP media app UI safely

### 8. ipad-cli — Real iPad & Simulator Automation
**When:** Installing on iPad, testing on iPad, taking iPad screenshots, running E2E device tests, sending CLI commands to the iPad app
**Invoke:** `/ipad-cli`
**Skill path:** `.claude/skills/qcut-toolkit/ipad-cli/SKILL.md`

Handles:
- Building, deploying, and launching QCut on real iPad or simulator
- Sending deep link commands via Darwin notifications (real device) or `simctl openurl` (simulator)
- Taking screenshots remotely (`pymobiledevice3` tunnel for device, `simctl io` for simulator)
- E2E testing: navigate to editor, trigger exports, check state, FPS benchmarks
- Managing pymobiledevice3 tunnels for advanced device access

### 9. jianying-reference — Jianying Effect Reverse-Engineering
**When:** Matching a QCut effect to Jianying's (剪映) behavior, finding out exactly how a Jianying text animation / filter / transition is implemented, harvesting its effect-package source, capturing stepped reference frames
**Invoke:** `/jianying-reference`
**Skill path:** `.claude/skills/qcut-toolkit/jianying-reference/SKILL.md`

Handles:
- Mapping a Jianying effect card to its on-disk package via mtime markers
- Reading TextAnim.lua / Transform.lua tweens for exact easing, distances, and per-character timing
- Node-graph (lsproj/lsanim) parameter extraction where the Lua tier is absent
- Stepped-frame capture protocol in the Jianying UI (playhead anchoring, preview-contamination checks)
- Porting the math into editor-core presets and locking it with frame-parity tests

### 10. pr-comments — PR Review Processing
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
2. **Use the dedicated vlog flow** — Route talking-head cleanup through qcut-vlog instead of manually chaining generic tools
3. **Process with FFmpeg** — Convert, trim, or prepare other source media
4. **Generate with AI** — Create new content or analyze existing media
5. **Write prompts** — Generate video prompts for Seedance/即梦 if needed
6. **Control editor** — Use native-cli `editor:*` commands to update timeline, settings, or import results
7. **Organize output** — Place results in `media/generated/` or `output/`

### Quick Routing Table

| User says | Route to |
|-----------|----------|
| "organize", "set up project", "clean up files" | native-cli |
| "vlog", "talking head", "剪口播", "去口头词", "去停顿", "人像滤镜", "美颜", "口播字幕", "抠像换背景", "B-roll", "小红书文案", "封面", "发布包" | qcut-vlog |
| "复刻宣传片", "城市宣传片", "参考片拆解", "city film", "travel promo", "reference-driven edit", "多语言配音成片" | qcut-cityfilm |
| "对标剪映", "对齐剪映", "剪映怎么实现的", "剪映参照", "逆向剪映", "match Jianying", "剪映动画", "剪映特效分析" | jianying-reference |
| "convert", "compress", "trim", "resize", "extract audio", "gif", "subtitle" | ffmpeg-skill |
| "generate image", "generate video", "avatar", "lipsync", "transcribe", "analyze video", "AI pipeline" | ai-content-pipeline |
| "add to timeline", "update project settings", "list media", "export preset", "configure for TikTok" | native-cli |
| "import media", "get project stats", "diagnose error" | native-cli |
| "video prompt", "Seedance", "即梦", "视频提示词", "write video description" | seedance |
| "test MCP preview", "MCP app mode", "debug iframe", "mcp:app-html" | qcut-mcp-preview-test |
| "install on iPad", "test on iPad", "iPad screenshot", "E2E iPad", "deploy to device" | ipad-cli |
| "export PR comments", "fix review feedback", "process code review" | pr-comments |
| "process this video and generate thumbnails" | ffmpeg-skill → ai-content-pipeline |
| "import media and organize" | native-cli |
| "generate content and add to timeline" | ai-content-pipeline → native-cli |
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
