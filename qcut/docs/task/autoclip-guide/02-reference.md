# AutoClip — Reference

## CLI flags

Source: `electron/native-pipeline/cli/command-registry.ts:595-637`

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--input` | `-i` | string | — (required) | Input video file path. |
| `--srt-file` | `-s` | string | auto-detect | SRT/VTT subtitle file. If omitted, AutoClip looks for `<videoBaseName>.srt` or `.vtt` next to the video. |
| `--output` | `-o` | string | `<videoDir>/autoclip-output` | Output directory for metadata + clips. |
| `--model` | `-m` | string | `google/gemini-3-flash-preview` | LLM model used for outline / timeline / scoring steps. Anything routable through the configured provider works. |
| `--min-score` | — | number | `0.7` | Score threshold (0.0–1.0). Segments below are dropped before cutting. |
| `--step` | — | number | run all | Run only one step: `1` (outline), `2` (timeline), `3` (scoring), `4` (cut). |
| `--chunk-minutes` | — | number | `30` | How many minutes of subtitles each LLM call sees in Step 1. |
| `--dry-run` | — | boolean | `false` | Run analysis only, skip FFmpeg cutting. |

## Running individual steps

Each step writes its output JSON to `autoclip-output/autoclip-metadata/`. Later steps load those files instead of recomputing — so the pipeline is fully resumable.

```bash
# Step 1 only — extract topic outline
qcut-pipeline autoclip -i video.mp4 --step 1

# Step 2 — needs step1_outline.json + chunks.json on disk
qcut-pipeline autoclip -i video.mp4 --step 2

# Step 3 — needs step2_timeline.json on disk
qcut-pipeline autoclip -i video.mp4 --step 3 --min-score 0.7

# Step 4 — needs step3_high_scores.json on disk
qcut-pipeline autoclip -i video.mp4 --step 4
```

Trying to skip ahead without earlier outputs returns an error: `Step N requires previous step outputs. Run step N-1 first.`

## Output files

```
<output>/
├── autoclip-metadata/
│   ├── chunks.json              # raw subtitle chunks (Step 1 input)
│   ├── step1_outline.json       # OutlineTopic[]
│   ├── step2_timeline.json      # TimelineSegment[]
│   ├── step3_all_scores.json    # ScoredSegment[] — every segment
│   └── step3_high_scores.json   # ScoredSegment[] — above threshold only
└── clips/
    └── <sanitized-title>.mp4    # one file per surviving segment
```

### `ScoredSegment` shape (`steps/step-scoring.ts:18`)

```ts
{
  // from TimelineSegment:
  outline: string;          // topic title
  content: string;          // summary of what's said
  startTime: string;        // "HH:MM:SS,mmm"
  endTime: string;          // "HH:MM:SS,mmm"
  chunkIndex: number;

  // added by Step 3:
  finalScore: number;       // 0.0–1.0
  recommendReason: string;  // human-readable justification
}
```

This is what to read when deciding the right `--min-score` for a given video.

## Scoring criteria (verbatim from `prompts.ts:83`)

```
1. Information Value: Unique insights, knowledge density?
2. Emotional Resonance: Evokes strong emotions? Distinctive viewpoints?
3. Viral Potential: Shareable quotes or hooks? Likely to spark discussion?
4. Structural Completeness: Logically clear with proper beginning/end?
```

The LLM blends these into a single `finalScore`. There are no per-criterion weights exposed.

## Segment length constraints (Step 2)

- **Minimum**: 90 seconds.
- **Target**: 3–6 minutes.
- Boundaries are placed at natural semantic breaks rather than fixed intervals.

If a topic is too short to hit the 90s minimum, it gets merged with an adjacent topic.

## Cutting behaviour (Step 4)

- Uses FFmpeg `stream copy` (no re-encode) → fast, but cut points snap to the nearest keyframe.
- Runs segments in parallel with a concurrency cap.
- Output filenames are derived from the segment title, sanitised to be filesystem-safe.
- Failures don't abort the run — the final result includes a `failures: [{id, title, error}]` array.

## Programmatic usage

`runAutoclip()` from `autoclip-runner.ts` is the entry point if you want to call this from another Node/Electron process instead of the CLI:

```ts
import { runAutoclip } from "./electron/native-pipeline/autoclip/autoclip-runner.js";

const result = await runAutoclip(
  {
    input: "/path/to/video.mp4",
    srt: "/path/to/video.srt",
    minScore: 0.75,
    dryRun: false,
  },
  (progress) => console.log(progress.stage, progress.percent, progress.message),
  new AbortController().signal
);
```

Returns a `CLIResult` with `success`, `outputPath`, `outputPaths`, and a `data` payload mirroring the CLI JSON output.
