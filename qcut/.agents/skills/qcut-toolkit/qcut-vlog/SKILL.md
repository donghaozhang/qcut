---
name: qcut-vlog
description: End-to-end workflow for turning talking-head or vlog footage into a verified social-ready edit and publishing package. Builds a clean QCut baseline, makes restrained sticker and SFX variants, researches and archives rights-aware B-roll, composes a richer version without breaking audio, cadence, color, or captions, writes playful Xiaohongshu titles and copy, and creates an exact 9:16 cover. Use for vlog editing, 口播剪辑, 去口头词, 去停顿, 人像滤镜, 背景判断, 自动字幕, QCut stickers, 音效, B-roll 搜集或替换, 素材授权归档, 小红书文案, 标题, 封面, or a complete short-video release package.
---

# QCut Vlog

Turn a source video into a clean, reversible baseline first. Build the richer edit
and publishing package as separate layers so an unsuccessful enhancement never
damages the good version.

## Isolate the Media Project

Keep the skill and every generated media artifact outside active source-code
repositories unless the user explicitly chooses otherwise. Use one self-contained
vlog project root:

```text
<project-root>/
├── source/                         # optional; immutable originals
├── baseline/
├── sticker-version/
├── broll-version/
└── publish/
```

Never overwrite source footage or downloaded originals. Resolve and report
absolute paths. Do not place renders, downloads, or generated covers in the QCut
repository merely because QCut supplies the tools.

## Establish the Brief

Inspect the source, transcript, existing versions, and project notes. Identify the
central claim, strongest hook, factual anchors, audience, platform, aspect ratio,
tone, and requested deliverables.

Keep the original background unless it is distracting, technically broken, or
explicitly rejected. A real setting usually preserves more personality and avoids
cutout artifacts. Read [editorial-pass.md](references/editorial-pass.md) before
adding visual or audio embellishment.

## Build the Clean Baseline

Run the copied baseline workflow from this skill:

```bash
export QCUT_VLOG_ROOT=".claude/skills/qcut-toolkit/qcut-vlog"

bun "$QCUT_VLOG_ROOT/scripts/main.ts" /path/to/talking-head.mov
bun "$QCUT_VLOG_ROOT/scripts/main.ts" /path/to/talking-head.mov \
  --output-dir /path/to/project/baseline
```

The runner resolves the current repository's `bun run pipeline` and bundled
FFmpeg automatically. When the skill runs from a copy outside the QCut
checkout, point it at one without writing into that checkout:

```bash
export QCUT_VLOG_REPO="/absolute/path/to/qcut"
```

Direct tool overrides remain available through `QCUT_VLOG_QCUT_BIN`,
`QCUT_VLOG_FFMPEG_BIN`, and `QCUT_VLOG_FFPROBE_BIN`.

Always preserve this order:

```text
source
  -> word-level transcript for edit decisions
  -> clean trim/concat
  -> restrained portrait treatment
  -> optional person cutout and background composite
  -> caption-free editable master
  -> transcribe the edited audio into a new SRT
  -> hard-captioned baseline
  -> verification
```

Never remap the pre-cut transcript into the final SRT. Re-transcribe after cutting
to avoid cumulative timestamp drift.

Use `--analyze-only` when the user wants to approve cuts before rendering:

```bash
bun "$QCUT_VLOG_ROOT/scripts/main.ts" input.mov --analyze-only
```

Inspect `clean-metadata/decisions.json`, `cuts.json`, and `keeps.json`. Do not
describe raw cut duration as final duration reduction because keep-padding changes
the rendered result.

Default to the restrained `soft-skin` portrait preset with `--beauty 25`. Reduce
it when texture looks waxy. Use the transparent `default` subtitle preset unless
the user requests a box.

Use `--resume` only when inputs and settings are unchanged. Use `--force` to
replace known workflow artifacts while retaining unrelated user files.

## Create the Sticker and SFX Version

Use the caption-free editable master as the visual source. Choose a small number
of transcript-driven cues and give each one an explicit semantic reason. Keep the
speaker's face, hands, and subtitle safe area clear.

Mix SFX beneath speech, then listen at every cue. Preserve:

- the caption-free visual master;
- a no-sticker baseline;
- the verified full-length Sticker/SFX audio as the downstream audio master;
- a cue sheet containing time, transcript phrase, visual, sound, and reason.

## Research and Compose B-roll

Read [broll-pipeline.md](references/broll-pipeline.md) before searching,
downloading, or editing external media.

Run the FFmpeg 8 preflight before any color-managed B-roll work:

```bash
bun "$QCUT_VLOG_ROOT/scripts/preflight.ts"
```

Start with the transcript and cue sheet, not a generic asset search. Prefer
official, public-domain, clearly licensed, or user-owned material. Treat social
posts as reference-only until reuse permission is clear. Archive exact URLs,
ownership, retrieval date, license status, local checksums, and the used segment.

Compose from the caption-free visual master and the verified Sticker/SFX audio
master. Mute B-roll source audio. Suppress a covered sticker visually, but retain
its SFX only when the sound still makes sense. Convert color deliberately rather
than relabeling it, preserve the base cadence, and burn corrected subtitles last.

Use short, semantically anchored inserts. Three or four inserts covering roughly
10–15% of a short talking-head video is a useful starting range, not a quota.
Compare the result with the baseline and remove any insert that makes the story
less clear, less credible, or less personal.

## Build the Xiaohongshu Package

Read [xiaohongshu-package.md](references/xiaohongshu-package.md). Base all claims
on the transcript and verified source material.

Deliver:

- three title options and one recommended title;
- a playful but credible body using concrete metaphors, familiar sayings, and a
  conversational rhythm;
- 6–10 relevant hashtags;
- an exact 1080×1920 cover with one main headline and at most one short kicker;
- a source and rights manifest for downloaded media.

Prefer a real frame of the speaker for the cover when recognizability matters.
Generated elements may support the concept but must not misrepresent the person,
product, or claims.

## Output Contract

```text
<project-root>/
├── baseline/
│   ├── <video-name>_clean.<source-extension>
│   ├── <video-name>_vlog_portrait.mp4      # caption-free editable master
│   ├── transcription.srt
│   ├── <video-name>_vlog.mp4               # hard-captioned baseline
│   ├── vlog-manifest.json
│   ├── clean-metadata/
│   ├── logs/
│   └── verification/
├── sticker-version/
│   ├── final.mp4
│   └── edit/
│       ├── cue-sheet.md
│       └── audio-master.*
├── broll-version/
│   ├── final.mp4
│   ├── sources.md
│   └── edit/
│       ├── downloads/
│       │   ├── originals/
│       │   └── archive/
│       ├── segments/
│       ├── frames/
│       └── logs/
└── publish/
    ├── xiaohongshu.md
    ├── cover-1080x1920.png
    └── verification-report.md
```

When background replacement is used, the baseline also contains the transparent
cutout and `<video-name>_vlog_editable.mp4`.

## Verify Before Delivery

Read [verification.md](references/verification.md) and run every applicable check.
At minimum:

1. Confirm the manifest stages completed or were safely skipped.
2. Confirm editable and final durations differ by no more than `0.25s`.
3. Confirm the SRT is non-empty and visually inspect caption frames.
4. Inspect the opening, every overlay boundary, every B-roll boundary, and the end.
5. Confirm speech remains continuous and intelligible and music or SFX never masks it.
6. Confirm dimensions, frame cadence, color tags, audio peak, source records, title,
   copy, and cover.
7. Decode the final video end to end and verify it opens from the reported path.

Report what changed, the durations, cut categories, caption count, audio result,
source-rights status, and absolute paths to the editable master, publishing video,
SRT, copy, cover, and verification artifacts.

Do not claim completion from command success alone. Inspect the result.
