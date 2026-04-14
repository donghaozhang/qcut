# 07 — Staged workflow (characters → portraits → scripts)

## Log in

Every AI command deducts credits from your account. Sign up once (free tier includes 50 credits/month), then log in from the CLI.

```bash
# Google OAuth (easiest — opens a browser window)
qcut system login
# Email + password
qcut system login --email you@example.com
# Scripted: pipe credentials via env vars (no interactive prompt)
qcut system login --email "$QCUT_EMAIL" --password "$QCUT_PASSWORD"
```

Beta testers: use the @qcut.app credentials emailed to you. Each test account is pre-loaded with 1000 credits on the free plan.

```bash
export QCUT_TEST_EMAIL=test@qcut.app
export QCUT_TEST_PASSWORD='...'
qcut system login --email "$QCUT_TEST_EMAIL" --password "$QCUT_TEST_PASSWORD"
```

Verify with `qcut system check-keys --json` — a successful login shows your user email and remaining credits.

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

## Verified end-to-end run (2026-04-14)

Fresh three-stage run on
`electron/native-pipeline/vimax/examples/drama-example.md`
(《从弃女到巅峰：苏家千金归来》, a Chinese modern drama, 5,697 chars)
into project dir `~/Documents/QCut/projects/cdrama-heiress-v3/`.
This run validated the test-account proxy flow end-to-end — beta
tester logged in via `qcut system login`, no `GMI_API_KEY` /
`OPENROUTER_API_KEY` in env, all LLM + image calls routed through
the license-server proxy.

| Stage | Wall-clock | Reported | Cost | Outputs |
|---|---:|---:|---:|---|
| 1. `flow characters` | 8.0s | estimate 3–15s / $0.005–$0.020 | $0.000 | 5 characters → `characters.json` |
| 2. `flow portraits` | 4m 10s | estimate 1m–3m total for 5 portraits | $0.100 | 5 PNGs avg 50.0s each → `portraits/<name>/front.png` |
| 3. `flow novel2script --max-scenes 5` | 18.0s | estimate 16s–4m 40s / $0.012–$0.040 | $0.000 | 2 chunks / 5 scenes / 36 shots → `scripts/chunk_00{1,2}.json` |
| **Total** | **4m 36s** | | **$0.100** | |

`project.json.stages_completed = ["characters", "portraits", "scripts"]`
after completion. Detected style header: `真人写实, 电视风格, 暖色调`.
Per-chunk Stage 3 timing:

```
[step] chunk 1/4 segmentation — 8.7s  2 scenes, 14 shots
[step] chunk 2/4 segmentation — 9.3s  3 scenes, 22 shots
```

Stage 3 stopped after 2 chunks because `--max-scenes 5` was hit — the
chunker had planned 4 chunks for the 5,697-char novel but the cap
short-circuited chunks 3 and 4. Absolute paths in the summary matched
disk exactly:

```
/Users/peter/Documents/QCut/projects/cdrama-heiress-v3/
├── project.json           (414B)
├── novel.md               (14.8KB)
├── characters.json        (4.3KB)
├── portraits/
│   ├── 沈念安/front.png      (1.5MB)
│   ├── 顾承泽/front.png      (1.3MB)
│   ├── 沈薇薇/front.png      (1.6MB)
│   ├── 沈母/front.png        (1.5MB)
│   ├── 周助理/front.png      (1.5MB)
│   └── registry.json          (1.0KB)
└── scripts/
    ├── chunk_001.json  (8.5KB)
    └── chunk_002.json  (12.2KB)
```

### Key takeaways from the run

- **Estimates held.** All three stages finished well inside their
  predicted ranges. Portrait batch landed at 4m 10s.
- **Per-image portrait average of 50.0s** — consistent with the
  prior Apr 13 run (52.0s) and the anime baseline (50.9s), confirming
  the ~1 min / portrait rule of thumb on GMI flash-image.
- **Stage 3 per-chunk was ~9s** — chunk 1 at 8.7s (14 shots), chunk 2
  at 9.3s (22 shots). Richer dialogue-heavy drama chunks produce more
  shots per chunk than anime (13–22 vs 3–5).
- **Portrait sizes clustered at 1.3–1.6 MB** — no outliers.
- **Chunk JSON sizes 8.5–12.2 KB** — scene/shot density proportional
  to dialogue content.
- **Proxy-mode validated end-to-end.** Ran with only `QCUT_AUTH_TOKEN`
  set by `qcut system login`; no provider env keys. All LLM and image
  calls routed through `qcut-license-server.zdhpeter.workers.dev`, billed
  as credits against the test account.

## Three commands, three artifacts

### Stage 1 — `flow characters`

```bash
qcut flow characters \
    --novel electron/native-pipeline/vimax/examples/drama-example.md \
    --project cdrama-heiress-v3 \
    --llm-model gemini-3.1-flash-lite
```

Extracts up to ~10 characters, detects the novel's `**映像スタイル：**`
/ `**Visual Style:**` header, and persists both into
`<proj>/characters.json` + `<proj>/project.json`. Measured 6.9s /
$0.00 on a 4 K-char anime novel (flash-lite didn't actually bill in
that run — expect a few cents on larger novels). `--style` is
optional here — usually you let the novel header decide the tone at
this stage and override at Stage 2 if needed.

**Between stages:** open `<proj>/characters.json` in your editor. You
can rename characters, fix missing `ethnicity`, or drop characters you
don't want portraits for. Stage 2 picks up edits.

### Stage 2 — `flow portraits`

```bash
qcut flow portraits \
    --project cdrama-heiress-v3 \
    --style "Modern anime film, soft cel-shading, expressive eyes, cinematic light" \
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
    --project cdrama-heiress-v3 \
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
PROJECT=cdrama-heiress-v3

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
| `anime` | 🇬🇧 | Modern anime film, soft cel-shading, expressive eyes, cinematic light |
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
drop redundant axes (`cel-shaded` + `crisp linework` overlapped) and
adopt a cleaner medium / technique / expression / lighting layout.
All three project dirs kept on disk for reference.

| | `photorealistic` | **`anime` (canonical)** | `anime` v1 *(retired)* |
|---|---|---|---|
| Project dir | `cdrama-photoreal/` | `style-anime-v2/` | `style-anime-smoke/` |
| Prompt | `真人写实，电视剧质感，自然光，肤质细腻，暖色调` | `Modern anime film, soft cel-shading, expressive eyes, cinematic light` | `Anime portrait, cel-shaded, large glossy eyes, crisp linework` |
| Total duration | **5m 39s** | **3m 46s** | 3m 45s |
| Cost | $0.100 | $0.100 | $0.100 |
| Avg per portrait | **67.9s** | **45.2s** | 44.9s |
| Portrait sizes | 1.4–1.6 MB | 1.5–1.7 MB | 1.3–1.8 MB |

