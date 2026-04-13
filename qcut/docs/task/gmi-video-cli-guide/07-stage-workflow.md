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
`electron/native-pipeline/vimax/examples/drama-example.md`
(《从弃女到巅峰：苏家千金归来》, a Chinese modern drama, 5,697 chars)
into a new project dir
`~/Documents/QCut/projects/cdrama-heiress-returns/`:

| Stage | Wall-clock | Reported | Cost | Outputs |
|---|---:|---:|---:|---|
| 1. `flow characters` | 8.6s | estimate 3–15s / $0.005–$0.020 | $0.000 | 5 characters → `characters.json` |
| 2. `flow portraits` | 4m 20s | estimate 30s–1m 30s/portrait × 5 | $0.100 | 5 PNGs avg 52.0s each → `portraits/<name>/front.png` |
| 3. `flow novel2script --max-scenes 5` | 19.0s | estimate 16s–4m 40s / $0.012–$0.040 | $0.000 | 2 chunks / 5 scenes / 33 shots → `scripts/chunk_00{1,2}.json` |
| **Total** | **4m 48s** | | **$0.100** | |

`project.json.stages_completed = ["characters", "portraits", "scripts"]`
after completion. Detected style header: `真人写实, 电视风格, 暖色调`.
Per-chunk Stage 3 timing:

```
[step] chunk 1/4 segmentation — 9.6s  2 scenes, 13 shots
[step] chunk 2/4 segmentation — 9.4s  3 scenes, 20 shots
```

Stage 3 stopped after 2 chunks because `--max-scenes 5` was hit — the
chunker had planned 4 chunks for the 5,697-char novel but the cap
short-circuited chunks 3 and 4. Absolute paths in the summary matched
disk exactly:

```
/Users/peter/Documents/QCut/projects/cdrama-heiress-returns/
├── project.json           (419B)
├── novel.md               (14.8KB)
├── characters.json        (4.3KB)
├── portraits/
│   ├── 沈念安/front.png      (1.4MB)
│   ├── 顾承泽/front.png      (1.5MB)
│   ├── 沈薇薇/front.png      (1.5MB)
│   ├── 沈母/front.png        (1.4MB)
│   ├── 周助理/front.png      (1.4MB)
│   └── registry.json          (1.0KB)
└── scripts/
    ├── chunk_001.json  (8.2KB)
    └── chunk_002.json  (11.5KB)
```

### Key takeaways from the run

- **Estimates held.** All three stages finished well inside their
  predicted ranges. Portrait batch landed at 4m 20s vs the upper
  bound of 7m 30s.
- **Per-image portrait average of 52.0s** is consistent with the
  anime run (50.9s on the prior test), reinforcing the ~1 min / portrait
  rule of thumb on GMI flash-image.
- **Stage 3 per-chunk was ~9.5s** — slightly slower than the 3–5s
  anime run because the Chinese drama chunks produced richer scene /
  shot breakdowns (13–20 shots/chunk vs 3–5 for anime). More shots =
  more LLM output tokens.
- **Portrait sizes all clustered at 1.4–1.5 MB** this run — the
  occasional 10 MB outlier seen in the anime session was not a
  systemic pattern.
- **Chunk JSON sizes jumped** from ~2 KB (anime) to 8–12 KB (cdrama)
  because each scene has more dialogue-heavy shots in the drama source.

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
    --style "low-poly game render, flat colors, chunky shading" \
    --image-model gmi_gemini_31_flash_image
```

Reads `<proj>/characters.json`, renders one `front.png` per character
into `<proj>/portraits/<name>/`, and saves a
`<proj>/portraits/registry.json` that later stages consume. The
`--style` flag accepts a preset slug (see table above) or a free-form
prompt like the one shown — either overrides `<proj>/project.json.style`
and is persisted back there so subsequent stages pick it up.

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

## Choosing a visual style (`--style`)

`flow characters` / `flow portraits` / `flow novel2movie` all accept
`--style <value>`. The value is either a **preset slug** (expanded to
a tuned prompt) or **free-form text** (passed through).

| Slug | Lang | Prompt (prepended to every portrait) |
|---|---|---|
| `photorealistic` | 🇨🇳 | 真人写实，电视剧质感，自然光，肤质细腻，暖色调 |
| `anime` | 🇬🇧 | Anime portrait, cel-shaded, large glossy eyes, crisp linework |
| `ghibli` | 🇬🇧 | Ghibli hand-drawn, soft pastel, nostalgic, pastoral warmth |
| `3d-animation` | 🇬🇧 | Pixar-style 3D render, stylized, soft rim light |
| `chinese-ink` | 🇨🇳 | 水墨画风，留白意境，墨色浓淡，笔锋飘逸 |
| `watercolor` | 🇬🇧 | Watercolor painting, soft edges, paper texture, translucent |
| `cyberpunk` | 🇬🇧 | Cyberpunk neon, chromatic glow, rain-slick street, dystopian |
| `noir` | 🇬🇧 | Film noir, high-contrast black-and-white, deep shadows, smoky |

**Resolution order** for the final style used:

1. `--style <slug>` → preset prompt
2. `--style "<free-form text>"` → pass-through
3. Novel's `**Visual Style:**` / `**视频风格：**` header
4. Image model's internal default

When any of steps 1–3 produce a non-empty value it is **persisted into
`project.json.style`** so later stages (novel2script, storyboard) use
the same tone automatically.

Example — force anime portraits on the Chinese drama novel:

```bash
qcut flow characters --novel "$NOVEL" --project "$PROJECT" --style anime
qcut flow portraits  --project "$PROJECT"       # picks up style from project.json
```

Free-form also works when no preset fits — pass any descriptive phrase:

```bash
qcut flow portraits --project "$PROJECT" \
    --style "vintage 1970s film grain, muted earth tones, soft focus"
```

### Verified A/B on the cdrama novel (2026-04-13)

Same 5 characters from `drama-example.md`, the GMI flash-image model,
three prompt variants. The anime preset was rewritten mid-session to
address a presumed moé-bias concern, then **reverted** after side-by-
side review showed the original prompt actually produced a more
mature, drama-appropriate face. All three project dirs kept on disk
for reference.

| | `photorealistic` | **`anime` (canonical)** | `anime` alt *(retired)* |
|---|---|---|---|
| Project dir | `cdrama-photoreal/` | `style-anime-smoke/` | `style-anime-v2/` |
| Prompt | `真人写实，电视剧质感，自然光，肤质细腻，暖色调` | `Anime portrait, cel-shaded, large glossy eyes, crisp linework` | `Modern anime film, soft cel-shading, expressive eyes, cinematic light` |
| Total duration | **5m 39s** | **3m 45s** | 3m 46s |
| Cost | $0.100 | $0.100 | $0.100 |
| Avg per portrait | **67.9s** | **44.9s** | 45.2s |
| Portrait sizes | 1.4–1.6 MB | 1.3–1.8 MB | 1.5–1.7 MB |

Findings:

- **Anime prompts run ~34% faster** than photorealistic on flash-image
  — skin/texture detail in photoreal seems to burn more internal
  compute. Cost per image is flat regardless of prompt.
- **Empirical reversal of an a-priori critique.** I rewrote the anime
  preset assuming "large glossy eyes + crisp linework" would push the
  output toward moé/waifu — wrong on this dataset. On adult drama
  characters (沈念安 et al.), v1 produced a mature, expressive face
  with proportional eyes, and the "crisp linework" + "cel-shaded"
  combo gave a confident, polished feel. The "Modern anime film,
  cinematic light" alt was technically tidier on paper but
  empirically softer / less defined. **Lesson: validate prompt
  rewrites against real images before trusting taxonomy arguments.**
- Both anime variants beat the photoreal one on speed; cost is
  identical so the only consideration is wall-clock vs visual style.

Compare the same character across all three:

```bash
open ~/Documents/QCut/projects/cdrama-photoreal/portraits/沈念安/front.png
open ~/Documents/QCut/projects/style-anime-smoke/portraits/沈念安/front.png  # canonical
open ~/Documents/QCut/projects/style-anime-v2/portraits/沈念安/front.png     # alt
```

Same character, three different `--style` outcomes — all driven by
the flag with no manual prompt engineering.

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
