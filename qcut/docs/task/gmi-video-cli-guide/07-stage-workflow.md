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

## Three commands, three artifacts

### Stage 1 — `flow characters`

```bash
qcut flow characters \
    --novel electron/native-pipeline/vimax/examples/japanese-anime-example.md \
    --project japanese-anime-example \
    --llm-model gemini-3.1-flash-lite
```

Extracts up to ~10 characters, detects the novel's `**映像スタイル：**`
/ `**Visual Style:**` header, and persists both into
`<proj>/characters.json` + `<proj>/project.json`. Roughly 5s / $0.01.

**Between stages:** open `<proj>/characters.json` in your editor. You
can rename characters, fix missing `ethnicity`, or drop characters you
don't want portraits for. Stage 2 picks up edits.

### Stage 2 — `flow portraits`

```bash
qcut flow portraits \
    --project japanese-anime-example \
    --image-model gmi_gemini_31_flash_image
```

Reads `<proj>/characters.json`, renders one `front.png` per character
into `<proj>/portraits/<name>/`, and saves a
`<proj>/portraits/registry.json` that later stages consume. Style is
taken from `<proj>/project.json.style` unless overridden with `--style`.

Typical run: ~5 min for 5 characters / $0.10 (GMI Gemini 3.1 flash
image).

### Stage 3 — `flow novel2script` (new in this workflow)

```bash
qcut flow novel2script \
    --novel electron/native-pipeline/vimax/examples/japanese-anime-example.md \
    --project japanese-anime-example \
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
NOVEL=electron/native-pipeline/vimax/examples/japanese-anime-example.md
PROJECT=japanese-anime-example

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
rm -rf ~/Documents/QCut/projects/japanese-anime-example
```

## What's *not* in this iteration

- Storyboard / video / concat still live in `flow novel2movie` or the
  existing `flow storyboard` / `flow script2video` commands.
- No per-character portrait retry command — if one portrait is
  unsatisfactory you re-run `flow portraits` and all 5 regenerate.
- No interactive wizard. All commands remain scriptable.
