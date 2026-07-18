---
name: qcut-vlog
description: End-to-end QCut CLI workflow for cleaning talking-head and vlog footage, removing filler words, stutters, and long pauses, regenerating time-aligned SRT captions after the cuts, and burning transparent-background subtitles into the final MP4. Use for requests such as vlog editing, talking-head cleanup, 口播剪辑, 剪口播, 去口头词, 去停顿, 自动字幕, 中文字幕, or exporting a captioned social video.
---

# QCut Vlog

Produce a clean talking-head video without modifying the source. Use the bundled
runner so cut metadata, logs, subtitle timing, and verification artifacts remain
reproducible.

## Required Order

Always preserve this sequence:

```text
source video
  -> word-level transcription for edit decisions
  -> clean-audio trim/concat
  -> extract audio from the completed clean video
  -> transcribe that clean audio into a new SRT
  -> burn the new SRT into the clean video
  -> verify durations and inspect a subtitle frame
```

Never remap or reuse the pre-cut transcription as the final SRT. Re-transcribing
after cutting avoids cumulative timestamp drift.

## Run

```bash
export QCUT_VLOG_ROOT=".claude/skills/qcut-toolkit/qcut-vlog"

bun "$QCUT_VLOG_ROOT/scripts/main.ts" /path/to/talking-head.mov
bun "$QCUT_VLOG_ROOT/scripts/main.ts" /path/to/talking-head.mov \
  --output-dir /path/to/output
```

Use `npx -y bun` instead when Bun is not installed globally.

The runner resolves the current repository's `bun run pipeline` first. Outside a
QCut checkout, it uses `qcut` or `qcut-pipeline` from `PATH`. It prefers QCut's
staged FFmpeg/FFprobe binaries when available.

## Modes

### Analyze Before Rendering

Use when the user asks to inspect proposed cuts first:

```bash
bun "$QCUT_VLOG_ROOT/scripts/main.ts" input.mov --analyze-only
```

Read `clean-metadata/cuts.json`, `decisions.json`, and `keeps.json`. Report the
number and categories of cuts. Do not describe raw cut duration as the final
duration reduction because `keep-padding` removes additional time around each
cut.

### Complete Workflow

Use the default mode when the user asks to process or finish the video. The
`default` subtitle preset is yellow text with a black outline and no background
box. It is the preferred pure-subtitle style.

```bash
bun "$QCUT_VLOG_ROOT/scripts/main.ts" input.mov \
  --preset default \
  --silence-threshold 1.0 \
  --keep-padding 0.15 \
  --srt-max-words 8 \
  --srt-max-duration 4
```

Only use `minimal` or `news` when the user explicitly wants a background box.
Use `--style '{"bgOpacity":0}'` to keep custom styles transparent.

### Resume Or Replace

```bash
# Reuse only artifacts newer than all of their inputs
bun "$QCUT_VLOG_ROOT/scripts/main.ts" input.mov --output-dir output --resume

# Replace known workflow artifacts while leaving unrelated files alone
bun "$QCUT_VLOG_ROOT/scripts/main.ts" input.mov --output-dir output --force
```

`--resume` rejects changed settings and stale dependencies. In particular, it
regenerates audio when the clean video is newer, regenerates SRT when audio is
newer, and re-burns the video when either the clean video or SRT is newer.

## Options

| Option | Purpose |
|---|---|
| `-o, --output-dir <path>` | Choose the artifact directory |
| `--final-name <name.mp4>` | Choose the final MP4 filename |
| `--preset <name>` | `default`, `cinematic`, `bold`, `minimal`, `karaoke`, or `news` |
| `--style <json>` | Apply subtitle style overrides |
| `--model <name>` | Select transcription model; default `scribe_v2` |
| `--language <code>` | Hint transcription language |
| `--silence-threshold <sec>` | Set long-pause threshold; default `1.0` |
| `--keep-padding <sec>` | Remove extra time around each cut; default `0.15` per side |
| `--srt-max-words <count>` | Limit tokens per subtitle card; default `8` |
| `--srt-max-duration <sec>` | Limit card duration; default `4` |
| `--keep-fillers` | Disable filler removal |
| `--keep-silences` | Disable long-pause removal |
| `--analyze-only` | Stop after writing cut metadata |
| `--resume` | Reuse fresh artifacts from a matching manifest |
| `--force` | Rebuild known artifacts |
| `--json` | Emit the final manifest as JSON |

## Output Contract

```text
<video-name>-vlog/
├── <video-name>_clean.<source-extension>
├── <video-name>_clean_audio.mp3
├── transcription.srt
├── <video-name>_vlog.mp4
├── vlog-manifest.json
├── clean-metadata/
│   ├── words.json
│   ├── decisions.json
│   ├── cuts.json
│   └── keeps.json
├── logs/
└── verification/
    └── subtitle-preview.png
```

If no cuts are needed, the workflow uses the source as the clean working video
without copying it. The final MP4 still goes into the output directory.

## Completion Checks

Before reporting success:

1. Read `vlog-manifest.json` and confirm all five stages completed or were safely skipped.
2. Confirm final-video duration differs from clean-video duration by no more than `0.25s`.
3. Confirm `transcription.srt` contains at least one entry.
4. Open `verification/subtitle-preview.png` and visually verify readable text, no unwanted box, correct orientation, and no clipping.
5. Report source duration, clean duration, actual removed duration, cut categories, subtitle count, final path, SRT path, and preview path.

Do not treat the obsolete `<name>_clean.mp3` pattern from earlier ad hoc runs as
authoritative. The runner's `<name>_clean_audio.mp3` is tied to the clean video's
modification time and recorded in the manifest.
