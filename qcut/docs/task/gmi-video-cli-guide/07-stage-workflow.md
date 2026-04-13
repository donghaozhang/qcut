# 07 — Staged workflow (characters → portraits → scripts)

Instead of running the monolithic `flow novel2movie` and hoping every
step produces good output, break the pipeline into three independent
commands that each write their artifact to a shared **project
directory** you can inspect and edit between runs.

This guide covers stages 1–3 only. Storyboard + video + concat stay on
the `flow novel2movie` monolith for now — expanding the staged layout
to those stages is tracked in
[06-stage-decomposition-plan.md](06-stage-decomposition-plan.md).

## The project directory

Every staged command reads and writes files under a single predictable
root:

```
~/Documents/QCut/projects/<slug>/
├── project.json              # {schema_version, slug, style, stages_completed, ...}
├── novel.md                  # copy of source novel
├── characters.json           # stage 1 output
├── portraits/
│   ├── <character>/front.png
│   └── registry.json         # stage 2 output
└── scripts/
    ├── chunk_001.json
    └── chunk_NNN.json        # stage 3 output
```

The slug defaults to `safeProjectSlug(<novel-basename>)` — so re-running
the same command on the same novel reuses the same directory, letting
you iterate without building up timestamped junk.

Relocate the root by exporting `QCUT_PROJECTS_DIR=/path/to/elsewhere`.

## Pre-flight estimates + per-step timing

Every staged command now prints three things you can use to sanity-check
a run:

1. **Pre-flight banner** with expected duration + cost range before any
   LLM call burns credits.
2. **Per-step wall-clock timing** as each sub-step (chunk, batch,
   extraction call) completes on stderr.
3. **End-of-stage summary** listing every generated file with its
   absolute path and byte size.

Example stderr for `flow novel2script`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Stage 3 — Segment novel into scripts
────────────────────────────────────────────────────────────
  Input:     novel 4,082 chars → ~3 chunks (2000/200)
  Expected:  12.0s–3m 30s  ($0.009–$0.030)
  Note:      Per-chunk variance is high — LLM can return in 4s or stall to 60s+
  Note:      Use --max-scenes N to cap the run once N scenes have been produced
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [step] split novel into chunks — 0.0s  3 chunks
  [step] chunk 1/3 segmentation — 5.4s  1 scenes, 3 shots
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Stage 3 — Segment novel into scripts — complete
────────────────────────────────────────────────────────────
  Duration:  5.4s
  Cost:      $0.000
  Chunks emitted:  1/3
  Outputs:
    •  project metadata: /Users/peter/Documents/QCut/projects/.../project.json (601B)
    •  novel copy:       /Users/peter/Documents/QCut/projects/.../novel.md (5.7KB)
    •  chunk 1 ...:      /Users/peter/Documents/QCut/projects/.../scripts/chunk_001.json (1.8KB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The banner + per-step markers land on stderr, so machine-parsable
`--json` / `--stream` stdout is unaffected.

## Verified end-to-end run (2026-04-13)

Fresh three-stage run on
`electron/native-pipeline/vimax/examples/japanese-anime-example.md`
into a new project dir
`~/Documents/QCut/projects/anime-demo-fresh/`:

| Stage | Wall-clock | Reported | Cost | Outputs |
|---|---:|---:|---:|---|
| 1. `flow characters` | 6.9s | estimate 3–15s / $0.005–$0.020 | $0.000 | 5 characters → `characters.json` |
| 2. `flow portraits` | 4m 14s | estimate 30s–1m 30s/portrait × 5 | $0.100 | 5 PNGs avg 50.9s each → `portraits/<name>/front.png` |
| 3. `flow novel2script --max-scenes 5` | 12.2s | estimate 12s–3m 30s / $0.009–$0.030 | $0.000 | 3 chunks / 5 scenes / 12 shots → `scripts/chunk_00{1,2,3}.json` |
| **Total** | **4m 33s** | | **$0.100** | |

`project.json.stages_completed = ["characters", "portraits", "scripts"]`
after completion. Per-chunk Stage 3 timing:

```
[step] chunk 1/3 segmentation — 4.9s  1 scenes, 3 shots
[step] chunk 2/3 segmentation — 3.4s  2 scenes, 5 shots
[step] chunk 3/3 segmentation — 3.9s  2 scenes, 4 shots
```

Stage 3 emitted all three chunks even though `--max-scenes 5` was set
because the cap is checked at chunk boundaries — chunk 3's first two
scenes filled the remaining quota before it bailed. Absolute paths
printed in the end-of-stage summary matched exactly what landed on
disk:

```
/Users/peter/Documents/QCut/projects/anime-demo-fresh/
├── project.json            (595B)
├── novel.md                (5.7KB)
├── characters.json         (6.0KB)
├── portraits/
│   ├── 三輪ゆきね/front.png      (1.8MB)
│   ├── 天沢灯/front.png          (10.1MB)
│   ├── 影の男/front.png          (1.6MB)
│   ├── 星野すばる/front.png      (1.7MB)
│   ├── 星野源三郎/front.png      (1.3MB)
│   └── registry.json             (1.1KB)
└── scripts/
    ├── chunk_001.json  (1.8KB)
    ├── chunk_002.json  (2.9KB)
    └── chunk_003.json  (2.3KB)
```

### Key takeaways from the run

- **Estimates held.** All three stages finished inside their predicted
  ranges. Portrait batch came in at the fast end of `1m 30s × 5 = 7m
  30s` (actual 4m 14s).
- **Per-image portrait average of 50.9s** is a good number to quote when
  sizing future runs on GMI flash-image.
- **Stage 3 per-chunk was 3–5s** at flash-lite, meaningfully faster
  than the pre-run 4–70s range suggests — because flash-lite returned
  well-formatted JSON every time, no retry loop.
- **`天沢灯/front.png` came out 10.1MB** versus the others at 1.3–1.8MB
  — GMI flash-image occasionally returns a much larger PNG (suspect a
  higher-res internal render on certain prompts). Not an error, just
  worth knowing if you're disk-conscious.

## Three commands, three artifacts

### Stage 1 — `flow characters`

```bash
qcut flow characters \
    --novel electron/native-pipeline/vimax/examples/drama-example.md \
    --project cdrama-heiress-returns \
    --llm-model gemini-3.1-flash-lite
```

Extracts up to ~10 characters, detects the novel's `**映像スタイル：**`
/ `**Visual Style:**` header, and persists both into
`<proj>/characters.json` + `<proj>/project.json`. Measured 6.9s /
$0.00 on a 4 K-char anime novel (flash-lite didn't actually bill in
that run — expect a few cents on larger novels).

**Between stages:** open `<proj>/characters.json` in your editor. You
can rename characters, fix missing `ethnicity`, or drop characters you
don't want portraits for. Stage 2 picks up edits.

### Stage 2 — `flow portraits`

```bash
qcut flow portraits \
    --project cdrama-heiress-returns \
    --image-model gmi_gemini_31_flash_image
```

Reads `<proj>/characters.json`, renders one `front.png` per character
into `<proj>/portraits/<name>/`, and saves a
`<proj>/portraits/registry.json` that later stages consume. Style is
taken from `<proj>/project.json.style` unless overridden with `--style`.

Measured run: 4m 14s for 5 characters / $0.100 (GMI Gemini 3.1 flash
image). Budget ~1 min per portrait as a rule of thumb.

### Stage 3 — `flow novel2script` (new in this workflow)

```bash
qcut flow novel2script \
    --novel electron/native-pipeline/vimax/examples/drama-example.md \
    --project cdrama-heiress-returns \
    --llm-model gemini-3.1-flash-lite \
    --max-scenes 20
```

Chunks the novel using the same splitter the monolithic `novel2movie`
uses, runs the `NovelSegmenter` on each chunk, and writes
`scripts/chunk_NNN.json` files with scene/shot breakdowns. Respects
`--max-scenes` to cap the total across chunks.

Accepts `--chunk-size` (default 2000 chars) and `--overlap` (default
200) if you need to tweak chunking for very long novels.

## Full three-stage run

```bash
NOVEL=electron/native-pipeline/vimax/examples/drama-example.md
PROJECT=cdrama-heiress-returns

qcut flow characters --novel "$NOVEL" --project "$PROJECT" \
    --llm-model gemini-3.1-flash-lite

# (inspect / edit ~/Documents/QCut/projects/$PROJECT/characters.json)

qcut flow portraits --project "$PROJECT" \
    --image-model gmi_gemini_31_flash_image

qcut flow novel2script --novel "$NOVEL" --project "$PROJECT" \
    --llm-model gemini-3.1-flash-lite --max-scenes 20

jq '.stages_completed' ~/Documents/QCut/projects/$PROJECT/project.json
# → ["characters", "portraits", "scripts"]
```

## Why this is less drama-prone than `flow novel2movie`

- Each stage is a standalone command — if stage 2 misfires you only
  re-run stage 2.
- `characters.json` is hand-editable before portraits run, so you can
  override ethnicity, rename duplicates, or drop phantoms.
- `scripts/chunk_*.json` are plain JSON and small — easy to diff across
  LLM runs and spot variance.
- Cost bounded per stage — no 36-minute, $5 commitment just to find
  out the style header was wrong.

## Re-running / idempotency

Re-running any stage overwrites its output (`characters.json`,
portraits, chunk files). `project.json.stages_completed` is advisory
and uses a set-merge, so re-running stage 1 after stage 3 keeps the
full completed list.

There's no `--force` gate yet; if you want to start fresh, delete the
project directory:

```bash
rm -rf ~/Documents/QCut/projects/cdrama-heiress-returns
```

## What's *not* in this iteration

- Storyboard / video / concat still live in `flow novel2movie` or the
  existing `flow storyboard` / `flow script2video` commands.
- No per-character portrait retry command — if one portrait is
  unsatisfactory you re-run `flow portraits` and all 5 regenerate.
- No interactive wizard. All commands remain scriptable.
