# AutoClip — Highlight Clip Extraction

AutoClip is a CLI-only pipeline that automatically picks the best moments out of a long video and cuts them into standalone highlight clips. It works off the video's **subtitle file** (SRT/VTT), not the video pixels — so subtitles are required.

- **Source**: `electron/native-pipeline/autoclip/`
- **CLI command**: `qcut-pipeline autoclip`
- **Registry**: `electron/native-pipeline/cli/command-registry.ts:595`
- **Default LLM**: `google/gemini-3-flash-preview` (override with `--model`)

## When to use it

- You have a long talking-head video (podcast, interview, lecture, livestream).
- You have an SRT or VTT next to the video, OR you can pass one in via `--srt-file`.
- You want the system to propose ~3–6 minute highlight segments scored by quality.

If you don't have subtitles yet, run a transcription pipeline first to produce an `.srt` file beside the video.

## Pipeline (4 steps)

| # | Step | File | What it does |
|---|------|------|--------------|
| 1 | **Outline** | `steps/step-outline.ts` | LLM reads subtitle chunks (default 30 min/chunk) and extracts topics + subtopics. Targets ≥95% coverage. |
| 2 | **Timeline** | `steps/step-timeline.ts` | Maps each topic to precise SRT timestamps. Enforces ≥90s minimum, 3–6 min target per segment. |
| 3 | **Scoring** | `steps/step-scoring.ts` | LLM rates each segment on 4 criteria → `finalScore` 0.0–1.0 + recommendation reason. Filtered by `--min-score`. |
| 4 | **Cut** | `steps/step-cut.ts` | FFmpeg `stream copy` to extract the surviving segments in parallel. Fast, no re-encode. |

Orchestrated by `autoclip-runner.ts` → `runAutoclip()`.

## Scoring criteria (Step 3)

Defined in `prompts.ts` → `SCORING_PROMPT`:

1. **Information Value** — unique insights, knowledge density.
2. **Emotional Resonance** — evokes strong emotion, distinctive viewpoint.
3. **Viral Potential** — shareable quotes / discussion hooks.
4. **Structural Completeness** — has a clear beginning and end.

Each segment receives a `finalScore` and a `recommendReason`. Anything ≥ `--min-score` (default 0.7) is kept; the rest are dropped before cutting.

## Outputs

Inside `<videoDir>/autoclip-output/` (override with `--output`):

```
autoclip-output/
├── autoclip-metadata/
│   ├── chunks.json
│   ├── step1_outline.json
│   ├── step2_timeline.json
│   ├── step3_all_scores.json     # every segment + score
│   └── step3_high_scores.json    # only segments above threshold
└── clips/
    └── <segment>.mp4 ...         # the actual highlight clips
```

Step outputs are reused: re-running a later `--step` will load existing JSON from earlier steps instead of recomputing.

## Required setup

- `OPENROUTER_API_KEY` (or whichever provider key matches the `--model` value) in `~/.qcut/.env` — needed for Steps 1–3.
- `ffmpeg` on PATH or bundled — needed for Step 4.
- A working subtitle file in SRT or VTT format.
