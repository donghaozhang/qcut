# AutoClip — Native QCut CLI Implementation

## Overview

Port the [AutoClip](https://github.com/zhouxiaoka/autoclip) subtitle-based video clip extraction pipeline from Python to TypeScript, integrated as a native QCut CLI command. The pipeline finds highlight clips in long-form video using only subtitles + LLM analysis — no vision models needed.

**Pipeline Flow**: `SRT subtitles → LLM outline → LLM timeline → LLM scoring → FFmpeg cut`

**Estimated effort**: ~3–4 hours (4 subtasks)

---

## Architecture Mapping: AutoClip (Python) → QCut (TypeScript)

| AutoClip Component | QCut Equivalent | Status |
|---|---|---|
| `LLMClient` (通义千问) | `callModelApi()` via OpenRouter | Exists |
| SRT parsing (`TextProcessor`) | `srt-generator.ts` + new parser | Partial — need SRT **reader** |
| FFmpeg video cutting (`VideoProcessor`) | `ffmpeg-handler.ts` / `ffmpeg-filter-cut.ts` | Exists |
| Prompt files (`.txt`) | Inline TS constants or `.md` files in `resources/` | New |
| `shared_config.py` | CLI flags + pipeline config | New |
| Step orchestrator | New CLI command `autoclip` | New |

### Key Design Decisions

1. **LLM Provider**: Use OpenRouter (already supported via `callModelApi`) with `google/gemini-2.5-flash` as default model — cheap, fast, large context window for subtitle text.
2. **Single command, multi-step**: `bun run pipeline autoclip --input video.mp4 --srt subs.srt` runs all 4 steps. Individual steps also runnable via `--step 1|2|3|4`.
3. **Output structure**: All intermediates saved to `<output-dir>/autoclip-metadata/` (outline.json, timeline.json, scores.json), final clips to `<output-dir>/clips/`.
4. **No new dependencies**: Reuse existing `callModelApi`, `getFFmpegPath`, SRT generator infrastructure.

---

## Subtask 1: SRT Parser + Text Chunker (~45 min)

**Goal**: Parse SRT/VTT files into structured data and chunk by time intervals for LLM processing.

AutoClip's `TextProcessor` does: parse SRT → extract timestamps + text → chunk by 30-min intervals.

### Files to Create

- **`electron/native-pipeline/autoclip/srt-parser.ts`** — SRT/VTT reader
  ```typescript
  interface SrtEntry {
    index: number;
    startTime: string;    // "HH:MM:SS,mmm"
    endTime: string;
    text: string;
    startSeconds: number; // parsed for sorting/comparison
    endSeconds: number;
  }

  interface SrtChunk {
    chunkIndex: number;
    entries: SrtEntry[];
    text: string;          // concatenated subtitle text
    startTime: string;
    endTime: string;
  }

  function parseSrt(filePath: string): SrtEntry[]
  function parseVtt(filePath: string): SrtEntry[]
  function chunkByInterval(entries: SrtEntry[], intervalMinutes?: number): SrtChunk[]
  ```

### Files to Reference

- `electron/native-pipeline/output/srt-generator.ts` — existing SRT **writer** (reuse time format utils)
- AutoClip `step1_outline.py` lines 56–65 — chunking logic

### Tests

- `electron/native-pipeline/autoclip/__tests__/srt-parser.test.ts`
  - Parse standard SRT with multi-line text
  - Parse VTT format
  - Chunk 90-min subtitle into 3 × 30-min chunks
  - Handle empty/malformed entries gracefully

---

## Subtask 2: LLM Pipeline Steps — Outline + Timeline + Scoring (~90 min)

**Goal**: Implement the 3 LLM-based steps as reusable functions.

### Files to Create

- **`electron/native-pipeline/autoclip/steps/step-outline.ts`** — Step 1: Outline extraction
  ```typescript
  interface OutlineTopic {
    title: string;
    subtopics: string[];
    chunkIndex: number;
  }

  async function extractOutline(
    chunks: SrtChunk[],
    options: { model?: string; onProgress?: ProgressFn }
  ): Promise<OutlineTopic[]>
  ```
  - For each chunk, send subtitle text to LLM with outline prompt
  - Parse structured response (numbered topics with subtopics)
  - Merge/deduplicate across chunks

- **`electron/native-pipeline/autoclip/steps/step-timeline.ts`** — Step 2: Timeline extraction
  ```typescript
  interface TimelineSegment {
    id: string;
    outline: string;
    content: string;
    startTime: string;   // "HH:MM:SS,mmm"
    endTime: string;
    chunkIndex: number;
  }

  async function extractTimeline(
    outlines: OutlineTopic[],
    chunks: SrtChunk[],
    options: { model?: string; onProgress?: ProgressFn }
  ): Promise<TimelineSegment[]>
  ```
  - Group outlines by chunkIndex, load matching SRT chunk
  - LLM identifies start/end timestamps per topic
  - Validate timestamps within chunk bounds, sort by time, assign sequential IDs

- **`electron/native-pipeline/autoclip/steps/step-scoring.ts`** — Step 3: Clip scoring
  ```typescript
  interface ScoredSegment extends TimelineSegment {
    finalScore: number;        // 0–10
    recommendReason: string;
  }

  async function scoreSegments(
    segments: TimelineSegment[],
    options: { model?: string; minScore?: number; onProgress?: ProgressFn }
  ): Promise<ScoredSegment[]>
  ```
  - Batch segments by chunk for LLM evaluation
  - LLM returns `{ final_score, recommend_reason }` per segment
  - Filter by `minScore` threshold (default: 7.0)

- **`electron/native-pipeline/autoclip/prompts.ts`** — All 3 LLM prompts as template literals

### Files to Reference

- `electron/native-pipeline/infra/api-caller.ts` — `callModelApi()` with `provider: "openrouter"`
- `electron/native-pipeline/infra/registry.ts` — model registry (may need to register LLM models)
- `electron/native-pipeline/execution/step-executors.ts` — pattern for step execution

### LLM Call Pattern

```typescript
import { callModelApi } from "../infra/api-caller";

const response = await callModelApi({
  endpoint: "chat/completions",
  provider: "openrouter",
  payload: {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: OUTLINE_PROMPT },
      { role: "user", content: JSON.stringify(inputData) }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  },
  retries: 2,
  signal
});
```

### Tests

- `electron/native-pipeline/autoclip/__tests__/steps.test.ts`
  - Mock `callModelApi` responses
  - Verify outline parsing and deduplication
  - Verify timeline timestamp validation and clamping
  - Verify score filtering at threshold

---

## Subtask 3: FFmpeg Video Cutter (~30 min)

**Goal**: Cut video segments by timestamp using existing FFmpeg infrastructure.

### Files to Create

- **`electron/native-pipeline/autoclip/steps/step-cut.ts`** — Step 4: Video cutting
  ```typescript
  interface CutResult {
    segmentId: string;
    title: string;
    outputPath: string;
    success: boolean;
    error?: string;
  }

  async function cutSegments(
    segments: ScoredSegment[],
    inputVideo: string,
    outputDir: string,
    options: { onProgress?: ProgressFn }
  ): Promise<CutResult[]>
  ```
  - For each segment: `ffmpeg -i input.mp4 -ss start -to end -c copy output.mp4`
  - Use `-c copy` for speed (no re-encode), fall back to re-encode if keyframe issues
  - Sanitize title for filename
  - Parallel execution with concurrency limit (3)

### Files to Reference

- `electron/ffmpeg-handler.ts` — `getFFmpegPath()`, `getFFprobePath()`
- `electron/ffmpeg-filter-cut.ts` — existing segment cutting logic
- `electron/ffmpeg-basic-handlers.ts` — basic FFmpeg operations

### Tests

- `electron/native-pipeline/autoclip/__tests__/step-cut.test.ts`
  - Verify FFmpeg command construction
  - Verify filename sanitization
  - Mock `execFile` and verify parallel execution

---

## Subtask 4: CLI Command Registration + Orchestrator (~45 min)

**Goal**: Wire everything together as a `autoclip` CLI command.

### Files to Modify

- **`electron/native-pipeline/cli/command-registry.ts`** — Register `autoclip` command
  ```typescript
  {
    name: "autoclip",
    description: "Extract highlight clips from video using subtitle analysis",
    category: "Analysis",
    flags: [
      { name: "input", short: "i", type: "string", required: true, description: "Input video file path" },
      { name: "srt", short: "s", type: "string", required: false, description: "SRT/VTT subtitle file (auto-transcribes if omitted)" },
      { name: "output", short: "o", type: "string", required: false, description: "Output directory (default: next to input)" },
      { name: "model", type: "string", required: false, description: "LLM model for analysis (default: google/gemini-2.5-flash)" },
      { name: "min-score", type: "number", required: false, description: "Minimum score threshold 0-10 (default: 7)" },
      { name: "step", type: "number", required: false, description: "Run only a specific step (1-4)" },
      { name: "chunk-minutes", type: "number", required: false, description: "Subtitle chunk interval in minutes (default: 30)" },
      { name: "dry-run", type: "boolean", required: false, description: "Run analysis only, skip video cutting" },
    ],
    examples: [
      "autoclip -i video.mp4 -s subs.srt",
      "autoclip -i video.mp4 --min-score 8 --model anthropic/claude-sonnet-4",
      "autoclip -i video.mp4 --dry-run",
      "autoclip -i video.mp4 --step 1 -s subs.srt",
    ]
  }
  ```

- **`electron/native-pipeline/cli/cli-runner/runner.ts`** — Add case for `autoclip` dispatch

### Files to Create

- **`electron/native-pipeline/autoclip/autoclip-runner.ts`** — Orchestrator
  ```typescript
  async function runAutoclip(options: AutoclipOptions, onProgress: ProgressFn, signal: AbortSignal): Promise<CLIResult>
  ```
  - Step 0 (optional): If no SRT provided, transcribe via existing `transcribe` command
  - Step 1: Parse SRT → chunk → extract outline → save `outline.json`
  - Step 2: Extract timeline → save `timeline.json`
  - Step 3: Score segments → save `scores.json` + `high_scores.json`
  - Step 4: Cut video → save clips to `clips/`
  - Support `--step N` to run individual steps (loads previous step output from metadata dir)
  - Support `--dry-run` to skip step 4
  - Print summary: total segments found, high-score count, clips generated

- **`electron/native-pipeline/autoclip/index.ts`** — Barrel export

### Files to Reference

- `electron/native-pipeline/cli/cli-runner/handler-pipeline.ts` — pattern for multi-step execution
- `electron/native-pipeline/cli/cli-runner/handler-generate.ts` — pattern for progress reporting
- `electron/gemini-transcribe-handler.ts` — auto-transcription fallback

### Tests

- `electron/native-pipeline/autoclip/__tests__/autoclip-runner.test.ts`
  - Full pipeline with mocked LLM + FFmpeg
  - `--step` flag runs only specified step
  - `--dry-run` skips cutting
  - Missing SRT triggers transcription

---

## File Structure Summary

```
electron/native-pipeline/autoclip/
├── index.ts                         # Barrel export
├── autoclip-runner.ts               # Orchestrator (main entry)
├── srt-parser.ts                    # SRT/VTT parser + chunker
├── prompts.ts                       # LLM prompt templates
├── steps/
│   ├── step-outline.ts              # Step 1: Outline extraction
│   ├── step-timeline.ts             # Step 2: Timeline extraction
│   ├── step-scoring.ts              # Step 3: Clip scoring
│   └── step-cut.ts                  # Step 4: FFmpeg video cutting
└── __tests__/
    ├── srt-parser.test.ts
    ├── steps.test.ts
    ├── step-cut.test.ts
    └── autoclip-runner.test.ts
```

## Usage Examples

```bash
# Full pipeline — auto-transcribe + analyze + cut
bun run pipeline autoclip -i ~/Videos/podcast-ep42.mp4

# With existing subtitles
bun run pipeline autoclip -i video.mp4 -s video.srt -o ./highlights

# Analysis only (no video cutting)
bun run pipeline autoclip -i video.mp4 -s video.srt --dry-run

# Only run scoring step (reuses previous outline + timeline)
bun run pipeline autoclip -i video.mp4 --step 3 -o ./highlights

# Higher quality threshold + different model
bun run pipeline autoclip -i video.mp4 -s video.srt --min-score 8.5 --model anthropic/claude-sonnet-4

# Shorter chunks for very dense content
bun run pipeline autoclip -i lecture.mp4 -s lecture.srt --chunk-minutes 15
```

## Output Structure

```
output-dir/
├── autoclip-metadata/
│   ├── step1_outline.json          # Topic outlines per chunk
│   ├── step2_timeline.json         # Timestamped segments
│   ├── step3_all_scores.json       # All segments with scores
│   ├── step3_high_scores.json      # Filtered high-score segments
│   └── chunks/                     # Intermediate SRT chunks
│       ├── chunk_0.json
│       └── chunk_1.json
└── clips/
    ├── 01_topic-title-here.mp4
    ├── 02_another-highlight.mp4
    └── ...
```
