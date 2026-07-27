---
name: qcut-cityfilm
description: Reproduce the look and structure of a reference city/travel promo film with your own or licensed footage — analyze the reference, gather clips, pick segments, write per-act copy, narrate it with emotional TTS, assemble the timeline in QCut, and mix the final audio bed. Use for 复刻宣传片, 城市宣传片, 旅行 vlog 剪辑, city film, travel promo, reference-driven edit, 参考片拆解, 素材复刻, 多语言配音成片, or turning a reference video into a repeatable edit plan.
---

# QCut City Film

Turn a reference film into a plan, then build your own cut from that plan. The
workflow is reference → plan → assets → assembly → mix → proof. Every stage
writes an artifact, so a later stage can be rerun without redoing the earlier
ones.

## Required Order

```text
reference film
  -> contact sheets + transcript + scene-cut pacing   (understand it)
  -> BREAKDOWN.md: acts, pacing, shot language, style  (write it down)
  -> shot-type queries -> licensed footage + MANIFEST  (gather)
  -> per-clip segment picks with in/out points         (choose)
  -> SHOTPLAN.md: act timing, copy, music placement    (plan the cut)
  -> emotional VO per cue, per language                (narrate)
  -> QCut project: import, timeline, subtitles, export (assemble)
  -> ffmpeg audio bed: ambience + music + VO + duck    (mix)
  -> measured levels + extracted frames                (prove)
```

Never skip the proof stage. A timeline that looks correct in the editor can
still export silent — see [Verification](#verification).

## Run

```bash
export CITYFILM_ROOT=".agents/skills/qcut-toolkit/qcut-cityfilm"

# Stage 1 — understand a reference film
bun "$CITYFILM_ROOT/scripts/main.ts" analyze /path/to/reference.mp4 \
  --output-dir /path/to/work/analysis

# Stage 6 — narrate a plan (one language at a time)
bun "$CITYFILM_ROOT/scripts/main.ts" vo --plan /path/to/work/plan-zh.json

# Stage 8 — mix the exported picture with music and narration
bun "$CITYFILM_ROOT/scripts/main.ts" mix --plan /path/to/work/plan-zh.json \
  --video /path/to/work/export.mp4 \
  --output /path/to/work/final-zh.mp4
```

Use `npx -y bun@1.3.10` when Bun is not installed globally. The runner resolves
this repository's `bun run pipeline` first, then `qcut` from `PATH`, and
prefers QCut's staged FFmpeg binaries.

## Stage 1 — Understand The Reference

Watch the whole film cheaply, then measure it.

```bash
bun "$CITYFILM_ROOT/scripts/main.ts" analyze reference.mp4 -o analysis
qcut analyze transcribe -i analysis/audio.mp3 -m scribe_v2 --srt -o analysis
```

`analyze` writes 5×5 contact sheets, `scene-cuts.txt`, `analysis.json`, and the
extracted `audio.mp3`. **Read every sheet image** — that is how the structure is
recovered. Tile `k` of sheet `n` maps to `((n-1)*25 + k) * duration/frames`
seconds.

Rules that matter here:

- FAL's speech-to-text rejects video containers; always transcribe the
  extracted MP3, never the source video.
- QCut's staged FFmpeg has no `drawtext` filter — do not try to burn timestamps
  into the sheets; compute them.
- Scene detection at `gt(scene,0.30)` is a good default for cut-heavy promos.

Write `BREAKDOWN.md` with: an act table (time range, content, purpose), the
per-minute cut counts, the shot-language inventory (which *types* of shots the
film uses — establishing aerials, walking POV, detail macros, portraits,
transport, night neon…), the grade and subtitle style, and the copy's
emotional arc. That inventory becomes the shopping list for stage 2.

## Stage 2 — Gather Licensed Footage

One search query per shot type from the inventory. On YouTube, append
`&sp=EgIwAQ%253D%253D` to filter to Creative Commons, then **verify each
candidate** — the filter is not trustworthy on its own:

```bash
yt-dlp "https://www.youtube.com/results?search_query=<q>&sp=EgIwAQ%253D%253D" \
  --flat-playlist -I 1:6 --print "%(id)s | %(duration)s | %(title)s"

yt-dlp --print "%(id)s | %(license)s | %(uploader)s" -- <video-id>
```

Keep only `Creative Commons Attribution license (reuse allowed)`. Download
capped at 1080p, and take only the useful stretch of long walking tours:

```bash
yt-dlp -f "bv*[height<=1080]+ba/b[height<=1080]/b" -S "res:1080,vcodec:h264" \
  --merge-output-format mp4 --download-sections "*00:00:00-00:03:00" \
  -o "<dir>/%(id)s - %(title).50s.%(ext)s" -- <video-id>
```

Write `MANIFEST.md` with folder, id, **uploader, and URL** for every clip plus
every music track. CC-BY requires attribution in the finished piece; the
manifest is what you paste into the credits. Also record which shots the stock
footage *cannot* cover (pieces to camera, product macros, candid portraits of
identifiable people) so the gap is explicit.

## Stage 3 — Pick Segments

Build a contact sheet per clip and choose in/out points against the act's
target shot length. Selection rules, learned from a real pass:

- Never include channel intros, title cards, watermark-heavy moments, or a
  presenter talking to camera.
- Prefer steady motion, good light, clean composition.
- Avoid close-ups of identifiable children.
- Round to 0.5s; keep every pick inside the clip's real duration.

Store picks as `SegmentPick[]` (see `scripts/types.ts`). With many categories,
fan this out — one agent per category folder, each returning its picks as JSON.

## Stage 4 — Plan The Cut

`SHOTPLAN.md` plus a machine-readable `plan-<lang>.json` (`CityFilmPlan`).

Pacing is the thing being copied. Derive it from the reference's per-minute cut
counts, e.g. a montage act at 1.2–1.5s per shot, dialogue/observation acts at
2–2.5s, the emotional act at 3–4s, and the closing card held long.

Copy rules:

- Write **original** lines. Copy the narrative arc (return → immersion →
  fatigue → healing → resolve), never the reference's sentences.
- One idea per cue; keep cues inside their act.
- Give every act an `emotion` directive in the copy's own language — it is fed
  verbatim to the TTS model.

## Stage 5 — Assemble In QCut

```bash
qcut editor:project:create --new-name "<name>" --json
qcut editor:project:update-settings --project-id <p> --data '{"fps":25,"width":1920,"height":1080}'
qcut editor:media:batch-import --project-id <p> --items @imports.json --json
qcut editor:timeline:import --project-id <p> --data @timeline.json --replace --json
qcut editor:export:start --project-id <p> --data '{"width":1920,"height":1080,"fps":25,"format":"mp4"}' \
  --output-dir <dir> --poll --timeout 900 --json
```

Build `timeline.json` from the plan: media elements laid end to end with
`trimStart`/`trimEnd` derived from each pick, one text element per cue, and a
black tail clip so the closing card has picture under it.

Editor facts that cost time when unknown:

| Fact | Consequence |
|---|---|
| Text `x`/`y` are canvas **pixels offset from center**, not fractions | `y: 0.87` puts the subtitle at the middle; use `y: 380` on a 1080p canvas |
| CJK and Latin need different sizing | Latin copy wants ~0.8× the font size and ~0.4× the letter spacing of the CJK cut |
| `timeline:import` drops `transitions` | Plan hard cuts; add fades as elements or in the mix |
| Export ends at the last **picture** element | A text-only tail is truncated — hold a black clip under the closing card |
| `batch-import` does not notify the renderer per item | Re-check the store before assuming media resolved; import stragglers individually |
| Elements resolve by `sourceName` | Import first, then import the timeline, or elements land on the wrong track |

Verify the timeline before exporting:

```bash
qcut editor:timeline:export --project-id <p> --json   # element count, track types
qcut editor:state:snapshot --project-id <p> --json     # what the renderer actually holds
```

## Stage 6 — Narrate With Emotion

ByteDance Seed Audio takes a parenthesised directive in front of the line. The
difference between a flat read and a directed one is large — always direct it.

```bash
bun "$CITYFILM_ROOT/scripts/main.ts" vo --plan plan-zh.json
# equivalent single call:
qcut gen tts -m seed_audio -o <dir> \
  -t "(用温柔、怀旧、带一点感慨的语气)好久不见,墨尔本。"
```

- One directive per act, written in the copy's language.
- Generate each language separately; English lines need their own directives,
  not translations of the Chinese ones.
- Check each cue's VO against its slot (`checkCueFit`) and shorten the line
  rather than speeding up the read.
- Seed Audio also accepts reference audio for voice cloning and `speed`/`pitch`
  when a specific voice is required.

## Stage 7 — Mix The Audio Bed

QCut's export currently drops CLI-imported audio from its mix, so the exported
picture supplies ambience only and the bed is assembled afterwards:

```bash
bun "$CITYFILM_ROOT/scripts/main.ts" mix --plan plan-zh.json \
  --video export.mp4 --output final-zh.mp4
```

The graph: ambience held low, music segmented per act with fades, each VO cue
delayed to its cue time, then the music+ambience bus ducked under a copy of the
VO bus via `sidechaincompress`, limited, and muxed with `-c:v copy`.

Two failure modes to respect: every declared filter label must be consumed or
FFmpeg aborts, and music cues that do not cover the timeline shorten the bed
unless the gaps are padded. `buildMixGraph` enforces both.

## Verification

Report a cut only after all four checks:

1. `ffprobe` duration matches the plan within 0.25s.
2. `volumedetect` over several windows — opening, a montage act, the emotional
   act, and the closing card — all show speech/music level, not −91 dB.
3. Extract frames at the title card, one mid-film subtitle, and the closing
   card, and **look at them**: correct language, no clipping, readable size.
4. The manifest's attribution list is present wherever the film will be
   published.

Check the exported file, never the timeline alone. A project whose timeline
contains music can still export silence.

## Output Contract

```text
<work-dir>/
├── analysis/
│   ├── sheet_01..NN.jpg
│   ├── scene-cuts.txt
│   ├── analysis.json
│   ├── audio.mp3
│   └── transcription.srt
├── BREAKDOWN.md
├── assets/
│   ├── <shot-type folders>/*.mp4
│   ├── music/*.mp3
│   ├── vo/vo-<lang>-<cueId>.mp3
│   └── MANIFEST.md
├── SHOTPLAN.md
├── plan-<lang>.json
├── timeline-<lang>.json
└── out/
    ├── export-<lang>.mp4        # picture from QCut, ambience only
    ├── final-<lang>.mp4         # after the mix — the deliverable
    └── frames/*.jpg
```

## Notes

- Keep the reference film out of the deliverable. This skill copies structure,
  pacing, and treatment — not footage, not copy.
- Attribution is not optional for CC-BY material.
- When the same cut ships in several languages, share the picture export and
  vary only subtitles and VO — but re-verify levels per language, since VO
  lengths differ.
