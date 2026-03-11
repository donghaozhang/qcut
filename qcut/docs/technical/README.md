# QCut Technical Documentation

Technical reference documentation for QCut's architecture, workflows, and implementation details.

## Directory Structure

```
docs/technical/
├── architecture/       # System architecture and code structure
├── ai/                 # AI video generation and models
│   └── models/         # Per-model documentation
├── testing/            # Testing guides and infrastructure
├── workflows/          # Sequence diagrams and process flows
└── guides/             # How-to guides and commands
```

## Quick Links

### Architecture

| Document | Description |
|----------|-------------|
| [source-code-structure.md](architecture/source-code-structure.md) | Complete codebase structure with file counts |
| [terminal-architecture.md](architecture/terminal-architecture.md) | xterm.js integration and terminal system |
| [virtual-folder-system.md](architecture/virtual-folder-system.md) | Media organization metadata system |
| [remotion-sequence-visualization.md](architecture/remotion-sequence-visualization.md) | Sequence/transition visualization in timeline |

### Remotion Integration

| Document | Description |
|----------|-------------|
| [remotion-timeline-rendering.md](remotion-timeline-rendering.md) | Remotion component rendering on timeline |
| [remotion-sequence-visualization.md](architecture/remotion-sequence-visualization.md) | AST-based sequence detection and visualization |

### AI Video Generation

| Document | Description |
|----------|-------------|
| [workflow.md](ai/workflow.md) | End-to-end AI video generation workflow |
| [skills-system.md](ai/skills-system.md) | How skills work in QCut |
| [models/](ai/models/) | Per-category model documentation |

### AI Models by Category

| Category | Path | Models |
|----------|------|--------|
| Text-to-Video | [ai/models/text-to-video/](ai/models/text-to-video/) | 18 models: Sora 2, Veo 3/3.1, Kling v2-v3, Hailuo, Seedance, LTX, WAN, Vidu |
| Image-to-Video | [ai/models/image-to-video/](ai/models/image-to-video/) | 22 models: Sora 2, Veo 3.1, Kling v2-v3, Hailuo, Seedance, LTX, WAN, Vidu |
| Avatar | [ai/models/avatar/](ai/models/avatar/) | 14 models: Kling, OmniHuman, Hailuo, WAN, Sora 2 |
| Transcription | [ai/models/transcription/](ai/models/transcription/) | Gemini 2.5 Pro |
| Text-to-Image | [ai/models/text-to-image/](ai/models/text-to-image/) | 13 models: Gemini 3, GPT Image, SeedDream, FLUX, Imagen4, WAN |
| Image Upscale | [ai/models/image-upscale/](ai/models/image-upscale/) | 3 models: ByteDance, FlashVSR, Topaz |
| Segmentation | [ai/models/segmentation/](ai/models/segmentation/) | SAM-3 |
| Adjustment | [ai/models/adjustment-panel/](ai/models/adjustment-panel/) | 10 models: AI image editing and color grading |

### Testing

| Document | Description |
|----------|-------------|
| [infrastructure.md](testing/infrastructure.md) | Test setup, mocking, Vitest config |
| [e2e.md](testing/e2e.md) | End-to-end testing with Playwright |

### Workflows

| Document | Description |
|----------|-------------|
| [effects-sequence.md](workflows/effects-sequence.md) | Video effects pipeline flow |
| [drawing-canvas-sequence.md](workflows/drawing-canvas-sequence.md) | Canvas drawing implementation |

### Reference

| Document | Description |
|----------|-------------|
| [media-panel-reference.md](media-panel-reference.md) | All 18 editor panels documented |

### AI Content Pipeline

| Document | Description |
|----------|-------------|
| [ai-content-pipeline-submodule.md](ai/ai-content-pipeline-submodule.md) | AICP git submodule integration |

### Guides

| Document | Description |
|----------|-------------|
| [build-commands.md](guides/build-commands.md) | Build, run, and deploy commands |
| [nexusai-website-submodule.md](guides/nexusai-website-submodule.md) | NexusAI website submodule workflow |
