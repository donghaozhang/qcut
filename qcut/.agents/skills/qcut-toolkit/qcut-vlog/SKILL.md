---
name: qcut-vlog
description: End-to-end QCut CLI workflow for cleaning talking-head and vlog footage, applying restrained portrait filters and skin smoothing, optionally cutting out the speaker and replacing the background, regenerating time-aligned SRT captions after the cuts, and exporting both an editable MP4 plus SRT and a hard-captioned MP4. Use for vlog editing, talking-head cleanup, portrait enhancement, background replacement, 口播剪辑, 剪口播, 去口头词, 去停顿, 人像滤镜, 美颜, 抠像换背景, 自动字幕, 中文字幕, or exporting a captioned social video.
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
  -> apply a restrained portrait filter and skin smoothing
  -> optional person cutout and background composite
  -> preserve the composite as the editable MP4
  -> extract audio from that editable video
  -> transcribe that clean audio into a new SRT
  -> preserve the SRT beside the editable MP4
  -> burn the SRT into a separate publishing MP4
  -> verify durations and inspect background/subtitle frames
```

Never remap or reuse the pre-cut transcription as the final SRT. Re-transcribing
after cutting avoids cumulative timestamp drift.

## Run

```bash
export QCUT_VLOG_ROOT=".claude/skills/qcut-toolkit/qcut-vlog"

bun "$QCUT_VLOG_ROOT/scripts/main.ts" /path/to/talking-head.mov
bun "$QCUT_VLOG_ROOT/scripts/main.ts" /path/to/talking-head.mov \
  --output-dir /path/to/output

bun "$QCUT_VLOG_ROOT/scripts/main.ts" /path/to/talking-head.mov \
  --background /path/to/office.png \
  --background-fit cover \
  --output-dir /path/to/output
```

Use `npx -y bun@1.3.10` instead when Bun is not installed globally.

The runner resolves the current repository's `bun run pipeline` first. Outside a
QCut checkout, it uses `qcut` or `qcut-pipeline` from `PATH`. It prefers QCut's
staged FFmpeg/FFprobe binaries when available.

Background replacement uses `qcut edit person-cutout`, which requires a working
QCut/FAL API configuration. It writes a transparent VP9 WebM before compositing
the supplied image with the cleaned speaker video and original audio. Portrait
processing splits and restores the alpha channel, so it affects the speaker
without restoring the removed source background or recoloring the replacement.

The default portrait treatment is `soft-skin` with `--beauty 25`. It is
intentionally restrained: reduce uneven redness while retaining skin texture.
List all presets or use the standalone filter command with:

```bash
bun run pipeline edit portrait-filter --list-presets --json
bun run pipeline edit portrait-filter -i input.mp4 --preset soft-skin --beauty 25 --output portrait.mp4
```

## Optional Sticker And SFX Pass

When the user asks for stickers, keep the normal hard-captioned MP4 as the
no-sticker version and render a second publishing candidate. Search the catalog
before writing the plan so every `stickerId` is known to exist:

```bash
bun run pipeline edit sticker-search \
  --query detective \
  --collection fluent-emoji-flat \
  --limit 12 \
  --json

bun run pipeline edit sticker-overlay \
  -i video_vlog.mp4 \
  --plan sticker-plan.json \
  --output video_vlog-stickers-sfx.mp4 \
  --save-intermediates \
  --json
```

The versioned JSON plan contains timed `stickerId` or local `source` entries,
canvas positions, sizes, fades, and optional local sound effects. Keep
talking-head treatments restrained:

- Use about 6 to 8 semantic accents in a four-minute video.
- Match each sticker to the spoken idea instead of adding generic decoration.
- Keep stickers out of the face and hard-caption safe area.
- Alternate upper-left and upper-right placement when the framing allows it.
- Start SFX volume around `0.08` to `0.18`; preserve intelligible speech and
  keep the final peak below `0 dB`.
- Save the plan and materialized assets beside the enhanced output.
- Decode the full output, compare duration and frame count, inspect every cue,
  and measure audio peaks before reporting success.

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
  --background /path/to/office.png \
  --portrait-filter soft-skin \
  --beauty 25 \
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
reruns portrait processing when the cleaned video is newer, reruns
cutout/composition when the cleaned video or background is newer, regenerates
audio when the editable video is newer, regenerates SRT when audio is newer, and
re-burns the video when either the editable video or SRT is newer.

## Options

| Option | Purpose |
|---|---|
| `-o, --output-dir <path>` | Choose the artifact directory |
| `--final-name <name.mp4>` | Choose the final MP4 filename |
| `-b, --background <image>` | Cut out the person and composite a still background |
| `--background-fit <mode>` | `cover`, `contain`, or `stretch`; default `cover` |
| `--portrait-filter <name>` | QCut portrait preset; default `soft-skin`, or `none` to disable the LUT |
| `--filter-intensity <0-100>` | Override the preset's default intensity |
| `--beauty <0-100>` | Skin smoothing amount; default `25`, or `0` to disable |
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
├── <video-name>_vlog_portrait.mp4           # without --background; no burned captions
├── <video-name>_cutout.webm                 # when --background is used
├── <video-name>_vlog_editable.mp4           # when --background is used; no burned captions
├── <video-name>_clean_audio.mp3
├── transcription.srt                        # edit this if captions need correction
├── <video-name>_vlog.mp4                     # hard-captioned publishing version
├── sticker-version/                          # when stickers were requested
│   ├── <video-name>_vlog-no-stickers.mp4
│   ├── <video-name>_vlog-stickers-sfx.mp4
│   ├── sticker-plan.json
│   └── verification/
├── vlog-manifest.json
├── clean-metadata/
│   ├── words.json
│   ├── decisions.json
│   ├── cuts.json
│   └── keeps.json
├── logs/
└── verification/
    ├── background-preview.png                # when --background is used
    └── subtitle-preview.png
```

If no cuts are needed, the workflow uses the source as the clean working video
without copying it. Without `--background`, `artifacts.editableVideo` points to
the portrait-filtered MP4. If both `--portrait-filter none` and `--beauty 0`
are supplied, it points to the clean/source video instead. The sidecar SRT
remains editable, while `<video-name>_vlog.mp4` always contains hard-burned
captions.

## Completion Checks

Before reporting success:

1. Read `vlog-manifest.json` and confirm all seven stages completed or were safely skipped.
2. Confirm final-video duration differs from editable-video duration by no more than `0.25s`.
3. Confirm `transcription.srt` contains at least one entry.
4. When a background was requested, open `verification/background-preview.png` and confirm the person, background, orientation, edge quality, and framing.
5. Open `verification/subtitle-preview.png` and verify readable text, no unwanted box, correct orientation, and no clipping.
6. Report source/editable/final durations, actual removed duration, cut categories, subtitle count, editable MP4 path, SRT path, hard-captioned MP4 path, and both preview paths.

Do not treat the obsolete `<name>_clean.mp3` pattern from earlier ad hoc runs as
authoritative. The runner's `<name>_clean_audio.mp3` is tied to the clean video's
modification time and recorded in the manifest.
