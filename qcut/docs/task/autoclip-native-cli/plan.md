# AutoClip — Native QCut CLI Implementation

## Overview

Port the [AutoClip](https://github.com/zhouxiaoka/autoclip) subtitle-based video clip extraction pipeline from Python to TypeScript, integrated as a native QCut CLI command. The pipeline finds highlight clips in long-form video using only subtitles + LLM analysis — no vision models needed.

**Pipeline Flow**: `SRT subtitles → LLM outline → LLM timeline → LLM scoring → FFmpeg cut`

**Estimated effort**: ~3–4 hours (4 subtasks)

---

## Python Reference Files

All original AutoClip source files are saved locally for reference during implementation:

```
docs/task/autoclip-native-cli/python-reference/
├── step1_outline.py              # Pipeline step 1 — outline extraction
├── step2_timeline.py             # Pipeline step 2 — timeline extraction
├── step3_scoring.py              # Pipeline step 3 — clip scoring
├── step6_video.py                # Pipeline step 4 — FFmpeg video cutting
├── utils/
│   ├── llm_client.py             # LLM client wrapper (call, retry, JSON parsing)
│   ├── text_processor.py         # SRT parsing, time-based chunking, time↔seconds conversion
│   └── video_processor.py        # FFmpeg clip extraction, filename sanitization, collection creation
├── core/
│   └── shared_config.py          # Config constants, prompt file paths, video categories, settings
└── prompts/
    ├── 大纲.txt                   # Outline prompt (Chinese original)
    ├── outline_EN.txt             # Outline prompt (English translation)
    ├── 时间点.txt                  # Timeline prompt (Chinese original)
    ├── timeline_EN.txt            # Timeline prompt (English translation)
    ├── 推荐理由.txt                # Scoring/recommendation prompt (Chinese original)
    ├── scoring_EN.txt             # Scoring prompt (English translation)
    ├── 标题生成.txt                # Title generation prompt (Chinese original)
    ├── title_generation_EN.txt    # Title generation prompt (English translation)
    ├── 主题聚类.txt                # Topic clustering prompt (Chinese original)
    ├── topic_clustering_EN.txt    # Topic clustering prompt (English translation)
    ├── collection_title.txt       # Collection title prompt (Chinese original)
    ├── collection_title_EN.txt    # Collection title prompt (English translation)
    └── {7 category dirs}/         # Category-specific prompt overrides (business, knowledge, etc.)
```

### Prompt File Mapping (Chinese → English)

| Chinese Original | English Translation | Used In Step | Purpose |
|---|---|---|---|
| `大纲.txt` | `outline_EN.txt` | Step 1 | Extract topic outlines from subtitle text |
| `时间点.txt` | `timeline_EN.txt` | Step 2 | Locate precise timestamps for each topic |
| `推荐理由.txt` | `scoring_EN.txt` | Step 3 | Score segments and generate recommendation reasons |
| `标题生成.txt` | `title_generation_EN.txt` | (Optional) | Generate viral titles for high-score clips |
| `主题聚类.txt` | `topic_clustering_EN.txt` | (Optional) | Cluster clips into themed collections |
| `collection_title.txt` | `collection_title_EN.txt` | (Optional) | Generate collection titles |

> **Note**: For our TypeScript implementation, use the English translations in `prompts.ts`. The original Chinese prompts are kept as reference for understanding the exact intent and nuances. Steps 1-3 are core pipeline; title generation and clustering are optional enhancements for later.

---

## Architecture Mapping: AutoClip (Python) → QCut (TypeScript)

| AutoClip Component | QCut Equivalent | Status |
|---|---|---|
| `LLMClient` → `utils/llm_client.py` | `callModelApi()` via OpenRouter | Exists |
| SRT parsing → `utils/text_processor.py` | `srt-generator.ts` + new parser | Partial — need SRT **reader** |
| FFmpeg cutting → `utils/video_processor.py` | `ffmpeg-handler.ts` / `ffmpeg-filter-cut.ts` | Exists |
| Prompt files → `prompts/*.txt` | Inline TS constants in `prompts.ts` | New |
| Config → `core/shared_config.py` | CLI flags + pipeline config | New |
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

### Python Reference Files to Study

| File | What to Port | Key Logic |
|---|---|---|
| **`utils/text_processor.py`** lines 182–222 | `parse_srt()` | Uses `pysrt` library to parse SRT → list of `{start_time, end_time, text, index}` |
| **`utils/text_processor.py`** lines 81–179 | `chunk_srt_data()` | Time-based chunking with pause detection: finds natural 1s+ pauses near 30-min boundaries (90%-110% of target), falls back to nearest timestamp if no pause found |
| **`utils/text_processor.py`** lines 258–279 | `time_to_seconds()` | Parse `HH:MM:SS,mmm` → float seconds |
| **`utils/text_processor.py`** lines 281–295 | `seconds_to_time()` | Float seconds → `HH:MM:SS` string |
| **`utils/video_processor.py`** lines 68–79 | `convert_srt_time_to_ffmpeg_time()` | Simply replaces `,` with `.` for FFmpeg compatibility |

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
  function timeToSeconds(timeStr: string): number
  function secondsToTime(seconds: number): string
  ```

### QCut Files to Reference

- `electron/native-pipeline/output/srt-generator.ts` — existing SRT **writer** (reuse time format utils)

### Implementation Notes

- Python uses `pysrt` library — we parse manually in TS (SRT format is simple: `index\nHH:MM:SS,mmm --> HH:MM:SS,mmm\ntext\n\n`)
- The chunking algorithm's key insight: search for 1s+ pauses within 90%-110% of the target cut time, avoiding mid-sentence splits
- VTT differs from SRT: has `WEBVTT` header, uses `.` instead of `,` for milliseconds, supports CSS styling tags

### Tests

- `electron/native-pipeline/autoclip/__tests__/srt-parser.test.ts`
  - Parse standard SRT with multi-line text
  - Parse VTT format
  - Chunk 90-min subtitle into 3 × 30-min chunks
  - Handle empty/malformed entries gracefully
  - Verify `timeToSeconds` and `secondsToTime` round-trip

---

## Subtask 2: LLM Pipeline Steps — Outline + Timeline + Scoring (~90 min)

**Goal**: Implement the 3 LLM-based steps as reusable functions.

### Python Reference Files to Study

#### Step 1: Outline Extraction

| File | What to Port | Key Logic |
|---|---|---|
| **`step1_outline.py`** lines 53–80 | `extract_outline()` | For each SRT chunk: send concatenated text to LLM with outline prompt, parse numbered response |
| **`step1_outline.py`** lines 108–135 | `_parse_outline_response()` | Regex parsing: `^\d+\.\s*\*\*` for topic headers, `-` for subtopics, tracks `chunk_index` |
| **`step1_outline.py`** lines 137–144 | `_merge_outlines()` | Dedup by title — keeps first occurrence |
| **Prompt**: `prompts/outline_EN.txt` | System prompt | Instructs LLM to extract 2-5 topics per 30-min chunk with subtopics, coverage-first principle |

#### Step 2: Timeline Extraction

| File | What to Port | Key Logic |
|---|---|---|
| **`step2_timeline.py`** lines 52–130 | `extract_timeline()` | Groups outlines by `chunk_index`, loads matching SRT chunk JSON, sends both to LLM, validates timestamps |
| **`step2_timeline.py`** lines 131–200 | `_parse_and_validate_response()` | JSON parsing with multi-layer fallback, validates time format (`HH:MM:SS,mmm`), clamps timestamps within chunk bounds |
| **`step2_timeline.py`** lines 202–211 | `_validate_time_format()` | Regex: `^\d{2}:\d{2}:\d{2},\d{3}$` |
| **`utils/llm_client.py`** lines 145–267 | `parse_json_response()` | Multi-layer JSON extraction: markdown code blocks → direct parse → regex extraction → auto-fix (missing commas, Chinese quotes, unmatched brackets) |
| **Prompt**: `prompts/timeline_EN.txt` | System prompt | Instructs LLM to output JSON array with precise timestamps, min 90s per segment, merge short segments |

#### Step 3: Scoring

| File | What to Port | Key Logic |
|---|---|---|
| **`step3_scoring.py`** lines 37–73 | `score_clips()` | Groups timeline data by `chunk_index`, sends each group to LLM for batch evaluation |
| **`step3_scoring.py`** lines 75–115 | `_get_llm_evaluation()` | Sends cleaned clip data to LLM, expects `{final_score, recommend_reason}` per clip, validates array length matches input |
| **`core/shared_config.py`** line 114 | `MIN_SCORE_THRESHOLD = 0.7` | Score range is 0.0–1.0 (not 0–10), threshold for "high score" filtering |
| **Prompt**: `prompts/scoring_EN.txt` | System prompt | Evaluates information value, emotional resonance, viral potential, structural completeness; returns 0.0–1.0 score |

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
    options: { model?: string; onProgress?: ProgressFn; signal?: AbortSignal }
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
    options: { model?: string; onProgress?: ProgressFn; signal?: AbortSignal }
  ): Promise<TimelineSegment[]>
  ```
  - Group outlines by chunkIndex, build SRT text for each chunk
  - LLM identifies start/end timestamps per topic
  - Validate timestamps within chunk bounds, sort by time, assign sequential IDs

- **`electron/native-pipeline/autoclip/steps/step-scoring.ts`** — Step 3: Clip scoring
  ```typescript
  interface ScoredSegment extends TimelineSegment {
    finalScore: number;        // 0.0–1.0
    recommendReason: string;
  }

  async function scoreSegments(
    segments: TimelineSegment[],
    options: { model?: string; minScore?: number; onProgress?: ProgressFn; signal?: AbortSignal }
  ): Promise<ScoredSegment[]>
  ```
  - Batch segments by chunk for LLM evaluation
  - LLM returns `{ final_score, recommend_reason }` per segment
  - Filter by `minScore` threshold (default: 0.7)

- **`electron/native-pipeline/autoclip/prompts.ts`** — All LLM prompts as template literals
  - Port from `prompts/outline_EN.txt`, `prompts/timeline_EN.txt`, `prompts/scoring_EN.txt`
  - Export as `OUTLINE_PROMPT`, `TIMELINE_PROMPT`, `SCORING_PROMPT`

- **`electron/native-pipeline/autoclip/llm-utils.ts`** — LLM response parsing utilities
  - Port JSON extraction logic from `utils/llm_client.py` lines 79–267
  - `parseJsonResponse(text: string)`: markdown code block extraction → direct parse → regex fallback → auto-fix
  - `fixCommonJsonErrors(json: string)`: missing commas, Chinese quotes, unmatched brackets

### QCut Files to Reference

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
  - Verify JSON parsing with malformed LLM responses (markdown blocks, Chinese quotes, missing commas)

---

## Subtask 3: FFmpeg Video Cutter (~30 min)

**Goal**: Cut video segments by timestamp using existing FFmpeg infrastructure.

### Python Reference Files to Study

| File | What to Port | Key Logic |
|---|---|---|
| **`utils/video_processor.py`** lines 128–181 | `extract_clip()` | `ffmpeg -ss {start} -i {input} -t {duration} -c:v copy -c:a copy -avoid_negative_ts make_zero -y {output}` |
| **`utils/video_processor.py`** lines 39–65 | `sanitize_filename()` | Remove `<>:"|?*\\/`, strip spaces/dots, limit to 100 chars |
| **`utils/video_processor.py`** lines 349–387 | `batch_extract_clips()` | Sequential extraction with `{id}_{sanitized_title}.mp4` naming |
| **`utils/video_processor.py`** lines 68–79 | `convert_srt_time_to_ffmpeg_time()` | Replace `,` → `.` for FFmpeg |

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
  - For each segment: `ffmpeg -ss start -i input.mp4 -t duration -c copy -avoid_negative_ts make_zero output.mp4`
  - Note: Python uses `-ss` before `-i` (input seeking, faster but less precise) with `-t` duration (not `-to` end time)
  - Use `-c copy` for speed (no re-encode), fall back to re-encode if keyframe issues
  - Sanitize title for filename: `{id}_{sanitized_title}.mp4`
  - Parallel execution with concurrency limit (3)

### QCut Files to Reference

- `electron/ffmpeg-handler.ts` — `getFFmpegPath()`, `getFFprobePath()`
- `electron/ffmpeg-filter-cut.ts` — existing segment cutting logic
- `electron/ffmpeg-basic-handlers.ts` — basic FFmpeg operations

### Tests

- `electron/native-pipeline/autoclip/__tests__/step-cut.test.ts`
  - Verify FFmpeg command construction (especially `-ss` before `-i` order)
  - Verify filename sanitization
  - Mock `execFile` and verify parallel execution

---

## Subtask 4: CLI Command Registration + Orchestrator (~45 min)

**Goal**: Wire everything together as a `autoclip` CLI command.

### Python Reference Files to Study

| File | What to Port | Key Logic |
|---|---|---|
| **`core/shared_config.py`** lines 113–122 | Config constants | `MIN_SCORE_THRESHOLD=0.7`, `CHUNK_SIZE=5000`, chunk interval 30min |
| **`core/shared_config.py`** lines 372–394 | `get_prompt_files()` | Category-based prompt override system (optional — can add later) |

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
      { name: "min-score", type: "number", required: false, description: "Minimum score threshold 0-1.0 (default: 0.7)" },
      { name: "step", type: "number", required: false, description: "Run only a specific step (1-4)" },
      { name: "chunk-minutes", type: "number", required: false, description: "Subtitle chunk interval in minutes (default: 30)" },
      { name: "dry-run", type: "boolean", required: false, description: "Run analysis only, skip video cutting" },
    ],
    examples: [
      "autoclip -i video.mp4 -s subs.srt",
      "autoclip -i video.mp4 --min-score 0.8 --model anthropic/claude-sonnet-4",
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

### QCut Files to Reference

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

### New Files to Create

```
electron/native-pipeline/autoclip/
├── index.ts                         # Barrel export
├── autoclip-runner.ts               # Orchestrator (main entry)
├── srt-parser.ts                    # SRT/VTT parser + chunker
├── prompts.ts                       # LLM prompt templates (English, from *_EN.txt)
├── llm-utils.ts                     # JSON response parsing (from llm_client.py)
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

### Existing Files to Modify

| File | Change |
|---|---|
| `electron/native-pipeline/cli/command-registry.ts` | Add `autoclip` command definition |
| `electron/native-pipeline/cli/cli-runner/runner.ts` | Add `autoclip` case to dispatch switch |

### Python → TypeScript File Mapping

| Python Source | TypeScript Target | What Gets Ported |
|---|---|---|
| `utils/text_processor.py` | `srt-parser.ts` | `parse_srt`, `chunk_srt_data`, `time_to_seconds`, `seconds_to_time` |
| `utils/llm_client.py` | `llm-utils.ts` | `parse_json_response`, `_preprocess_llm_response`, `fix_common_json_errors` |
| `utils/video_processor.py` | `steps/step-cut.ts` | `extract_clip`, `sanitize_filename`, `batch_extract_clips` |
| `step1_outline.py` | `steps/step-outline.ts` | `extract_outline`, `_parse_outline_response`, `_merge_outlines` |
| `step2_timeline.py` | `steps/step-timeline.ts` | `extract_timeline`, `_parse_and_validate_response`, `_validate_time_format` |
| `step3_scoring.py` | `steps/step-scoring.ts` | `score_clips`, `_get_llm_evaluation` |
| `step6_video.py` | `autoclip-runner.ts` | Orchestration logic (but simplified — no collections in v1) |
| `prompts/outline_EN.txt` | `prompts.ts` → `OUTLINE_PROMPT` | English prompt as template literal |
| `prompts/timeline_EN.txt` | `prompts.ts` → `TIMELINE_PROMPT` | English prompt as template literal |
| `prompts/scoring_EN.txt` | `prompts.ts` → `SCORING_PROMPT` | English prompt as template literal |
| `core/shared_config.py` | CLI flags + constants in runner | `MIN_SCORE_THRESHOLD`, chunk interval, topic duration constraints |

---

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
bun run pipeline autoclip -i video.mp4 -s video.srt --min-score 0.85 --model anthropic/claude-sonnet-4

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
