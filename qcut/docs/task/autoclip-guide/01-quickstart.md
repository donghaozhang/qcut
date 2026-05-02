# AutoClip — Quickstart

## 0. Make sure the CLI is built

```bash
bun run build
```

This compiles `electron/native-pipeline/` so the global `qcut-pipeline` binary picks up the latest handler code. The compiled CLI lives under `dist/electron/`.

## 1. Place the subtitle next to the video (optional but easiest)

```
my-folder/
├── interview.mp4
└── interview.srt        ← same basename, AutoClip auto-detects this
```

If they're in the same folder with the same basename, you can omit `--srt-file`.

## 2. Run the full pipeline

```bash
qcut-pipeline autoclip -i ./my-folder/interview.mp4
```

Or with an explicit subtitle path:

```bash
qcut-pipeline autoclip -i ./interview.mp4 -s ./interview.srt
```

You'll see progress for each stage: `parse → outline → timeline → scoring → cutting → done`.

When it finishes, the highlight clips are in:

```
./my-folder/autoclip-output/clips/
```

## 3. Common variations

**Be more selective** (default 0.7 → 0.85):

```bash
qcut-pipeline autoclip -i video.mp4 --min-score 0.85
```

**Be more inclusive** (catch more clips):

```bash
qcut-pipeline autoclip -i video.mp4 --min-score 0.5
```

**Just analyse, don't cut** (cheap dry run — skips FFmpeg, leaves all metadata JSON):

```bash
qcut-pipeline autoclip -i video.mp4 --dry-run
```

**Custom output folder**:

```bash
qcut-pipeline autoclip -i video.mp4 -o ./highlights/
```

**Use a different LLM**:

```bash
qcut-pipeline autoclip -i video.mp4 --model anthropic/claude-sonnet-4-6
```

**Smaller chunk window** (good for shorter videos or denser subtitles):

```bash
qcut-pipeline autoclip -i video.mp4 --chunk-minutes 15
```

## 4. Recommended workflow

1. **Dry-run first** to inspect topic/segment quality without burning FFmpeg time:
   ```bash
   qcut-pipeline autoclip -i video.mp4 --dry-run
   ```
2. Open `autoclip-output/autoclip-metadata/step3_all_scores.json` and check the scores + reasons.
3. Adjust `--min-score`, then re-run **only Step 4** (cutting):
   ```bash
   qcut-pipeline autoclip -i video.mp4 --step 4 --min-score 0.65
   ```
   Step 4 reuses the existing `step3_high_scores.json`, so this is near-instant.

## 5. Troubleshooting

| Problem | Fix |
|---------|-----|
| `No subtitle file found` | Pass `--srt-file <path>` or rename the SRT to match the video basename. |
| `No segments scored above threshold` | Lower `--min-score` (try 0.5) and re-run with `--step 4`. |
| Step hangs on the LLM call | Check `OPENROUTER_API_KEY` (or your provider key) in `~/.qcut/.env`. |
| New flag not recognised | Re-run `bun run build` — the global `qcut` binary is a compiled snapshot. |
| FFmpeg failures | Check `ffmpeg -version` is on PATH; segment errors are listed in the `failures` array of the final result. |
