# Video Replicate — One-Click Video Recreation

## CLI Usage

```bash
# Full replicate (analyze + generate + assemble + export)
qcut-pipeline replicate --source input.mp4 --output output.mp4

# Analysis only (extract recipe)
qcut-pipeline replicate:analyze --source input.mp4 --json

# Generate from recipe (with custom media)
qcut-pipeline replicate:generate --recipe recipe.json --media-dir ./my-clips/

# Step-by-step
qcut-pipeline replicate:analyze --source input.mp4 -o recipe.json
qcut-pipeline replicate:generate --recipe recipe.json -o output.mp4
```

## Architecture

```
Source Video
    │
    ▼
┌─────────────────────┐
│  Step 1: Analyze     │  Gemini Vision → shot segmentation, style, timing
│  (replicate-analyzer)│  Output: VideoRecipe JSON
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Step 2: Plan        │  Map each shot to generation strategy
│  (replicate-planner) │  (AI generate / user media / stock)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Step 3: Generate    │  LTX/Kling/Wan per shot, or match user clips
│  (replicate-generator)│  Parallel generation with progress
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Step 4: Assemble    │  Build timeline matching original rhythm
│  (replicate-assembler)│  Add transitions, text, audio
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Step 5: Export      │  FFmpeg CLI export pipeline
│  (existing export)   │
└─────────────────────┘
```

## VideoRecipe Schema

```typescript
interface VideoRecipe {
  version: 1;
  source: {
    filename: string;
    duration: number;
    resolution: { width: number; height: number };
    fps: number;
  };
  style: {
    genre: string;           // "tutorial", "vlog", "cinematic", "commercial"
    mood: string;            // "energetic", "calm", "dramatic"
    colorPalette: string[];  // dominant colors
    pacing: "fast" | "medium" | "slow";
  };
  audio: {
    hasBGM: boolean;
    bgmStyle?: string;
    hasVoiceover: boolean;
    voiceoverLanguage?: string;
    transcript?: string;
  };
  shots: ShotRecipe[];
}

interface ShotRecipe {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  type: "wide" | "medium" | "closeup" | "detail" | "transition" | "title";
  camera: "static" | "pan-left" | "pan-right" | "zoom-in" | "zoom-out" | "tracking";
  description: string;     // what's happening in this shot
  prompt: string;          // AI generation prompt
  transition: "cut" | "dissolve" | "fade" | "wipe" | "none";
  hasText: boolean;
  textContent?: string;
  hasSubtitle: boolean;
  subtitleText?: string;
}
```

## Files to Create

### Core Pipeline (electron/native-pipeline/replicate/)
1. `replicate-types.ts` — VideoRecipe, ShotRecipe interfaces
2. `replicate-analyzer.ts` — Gemini Vision analysis → VideoRecipe
3. `replicate-planner.ts` — Map shots to generation strategies
4. `replicate-generator.ts` — Parallel AI video/image generation per shot
5. `replicate-assembler.ts` — Build QCut timeline from recipe + generated media
6. `replicate-runner.ts` — Orchestrate the full pipeline
7. `replicate-prompts.ts` — System prompts for Gemini analysis

### CLI Registration
8. `cli/cli-handlers-replicate.ts` — CLI command handlers
9. `cli/command-registry.ts` — Add `replicate` category + commands

### Tests
10. `replicate/__tests__/replicate-analyzer.test.ts`
11. `replicate/__tests__/replicate-assembler.test.ts`

## Files to Modify
- `electron/native-pipeline/cli/command-registry.ts` — Add replicate category
- `electron/native-pipeline/cli/cli-runner/runner.ts` — Register replicate handlers
- `electron/native-pipeline/cli/cli-help.ts` — Add help text

## Implementation Phases

### Phase 1: Video Analysis (Steps 1-3) — ~2 days
- VideoRecipe types
- Gemini Vision analyzer (shot segmentation + style extraction)
- Analysis prompts

### Phase 2: Generation (Steps 4-5) — ~2 days
- Shot-to-prompt planner
- Parallel generation runner (reuse existing fal.ai / LTX infra)

### Phase 3: Assembly + Export (Steps 6-7) — ~1.5 days
- Timeline builder (reuse claude-timeline-bridge patterns)
- FFmpeg export integration

### Phase 4: CLI + Tests (Steps 8-11) — ~1.5 days
- CLI handlers + command registry
- Unit tests

**Total: ~7 days**

## Existing Code to Reuse

| Component | Existing Location | Reuse For |
|-----------|------------------|-----------|
| Gemini video analysis | `gemini-chat-handler.ts` | Shot segmentation + style analysis |
| LLM utilities | `autoclip/llm-utils.ts` | Prompt formatting, response parsing |
| Video generation | `execution/step-executors.ts` | fal.ai image/video generation |
| Timeline assembly | `claude-timeline-bridge-helpers.ts` | Programmatic timeline building |
| SRT parser | `autoclip/srt-parser.ts` | Subtitle extraction from source |
| FFmpeg export | `lib/export/export-engine-cli.ts` | Final video export |
| CLI patterns | `cli-handlers-subtitle.ts` | CLI handler structure |
| ViMax pipeline | `vimax/` | Script→video flow reference |

## Key Design Decisions

1. **Gemini Vision over frame-by-frame** — Upload video directly to Gemini 2.5 Pro for holistic analysis (cheaper, faster, better context than frame extraction + individual analysis)
2. **Recipe as intermediate format** — JSON recipe enables: save/edit/share/replay without re-analyzing
3. **Parallel shot generation** — Generate all shots concurrently with progress tracking
4. **Graceful degradation** — If AI generation fails for a shot, fall back to placeholder or skip
5. **Reuse ViMax patterns** — The replicate pipeline is structurally similar to `vimax:script2video` (script → shots → generate → assemble)
