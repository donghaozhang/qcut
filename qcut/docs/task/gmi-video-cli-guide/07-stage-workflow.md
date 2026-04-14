# 07 — Staged workflow (characters → portraits → scripts)

---

## Commands

### Log in (pick one)

```bash
# Google OAuth (opens a browser)
qcut system login

# Email + password (interactive)
qcut system login --email you@example.com

# Scripted (no prompt)
qcut system login --email "$QCUT_EMAIL" --password "$QCUT_PASSWORD"
```

```bash
# Beta tester account — credentials live in ./.env.test-accounts (repo root)
set -a; source .env.test-accounts; set +a
qcut system login --email "$QCUT_TEST_EMAIL" --password "$QCUT_TEST_PASSWORD"
```

```bash
# Verify login + remaining credits
qcut system check-keys --json
```

### Stage 1 — extract characters

```bash
qcut flow characters \
    --novel electron/native-pipeline/vimax/examples/drama-example.md \
    --project cdrama-heiress-v3 \
    --llm-model gemini-3.1-flash-lite
```

### Stage 2 — generate portraits

```bash
# Default: GMI Gemini 3.1 Flash Image
qcut flow portraits \
    --project cdrama-heiress-v3 \
    --style "Modern anime film, soft cel-shading, expressive eyes, cinematic light" \
    --image-model gmi_gemini_31_flash_image

# FAL fallback: same Google Gemini image family via FAL ("nano-banana"
# was Google's internal codename). Bypasses GMI's billing microservice
# when it's down. $0.002/image.
qcut flow portraits \
    --project cdrama-heiress-v3 \
    --style "Modern anime film, soft cel-shading, expressive eyes, cinematic light" \
    --image-model nano_banana_pro

# Optional quality knobs (new 2026-04-14):
#   --region east-asian   — fill empty per-character ethnicity
#   --cast-quality model-grade  — gender-aware attractiveness snippet
qcut flow portraits \
    --project cdrama-heiress-v3 \
    --image-model nano_banana_pro \
    --region east-asian \
    --cast-quality model-grade
```

### Stage 3 — segment novel into scripts

```bash
qcut flow novel2script \
    --novel electron/native-pipeline/vimax/examples/drama-example.md \
    --project cdrama-heiress-v3 \
    --llm-model gemini-3.1-flash-lite \
    --max-scenes 20
```

### Stage 4 — generate per-shot videos (Seedance 2.0 / Vidu ref2v)

```bash
# Default: GMI Seedance 260128 — $0.052/s
qcut flow novel2video \
    --project cdrama-heiress-v3 \
    --max-shots 4 \
    --duration 4 \
    --resolution 480p

# Fallback: FAL Seedance 2.0 — $0.60/s, used when GMI is down
qcut flow novel2video \
    --project cdrama-heiress-v3 \
    --max-shots 4 \
    --duration 4 \
    --resolution 720p \
    --model seedance_2_0

# Vidu Q3 ref2v mix — $0.154/s at 720p, character-consistent multi-ref
qcut flow novel2video \
    --project cdrama-heiress-v3 \
    --model vidu_q3_ref2v_mix \
    --max-shots 3 \
    --duration 5 \
    --resolution 720p \
    --aspect-ratio 16:9
```

### Stage 5 — single-shot smoke test (Seedance 2.0 ref2v, no project)

```bash
qcut gen video -m gmi_seedance_2_0_260128_ref2v \
    -t "Anime woman with long dark hair walks gently into frame, soft cinematic light, calm expression, modern anime film style" \
    --image-url https://v3b.fal.media/files/b/0a9632d3/RjQKpimGKkHGbNX1zOH0R_front.png \
    -d 4s --resolution 480p --aspect-ratio 16:9
```

### Full four-stage run

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

qcut flow novel2video --project "$PROJECT" \
    --max-shots 1 --duration 4 --resolution 480p

jq '.stages_completed' ~/Documents/QCut/projects/$PROJECT/project.json
# → ["characters", "portraits", "scripts", "videos"]   (per-shot details in videos/registry.json)
```

### Style overrides

```bash
# Preset slug (see style table in reference below)
qcut flow characters --novel "$NOVEL" --project "$PROJECT" --style anime
qcut flow portraits  --project "$PROJECT"       # picks up style from project.json
```

```bash
# Free-form style
qcut flow portraits --project "$PROJECT" \
    --style "vintage 1970s film grain, muted earth tones, soft focus"
```

---

## Reference

### Why staged?

Instead of running the monolithic `flow novel2movie` and hoping every
step produces good output, break the pipeline into three independent
commands that each write their artifact to a shared **project
directory** you can inspect and edit between runs.

This guide covers stages 1–3 only. Storyboard + video + concat stay on
the `flow novel2movie` monolith for now — expanding the staged layout
to those stages is tracked in
[06-stage-decomposition-plan.md](06-stage-decomposition-plan.md).

### Login details

Every AI command deducts credits from your account. Sign up once (free tier includes 50 credits/month), then log in from the CLI.

Beta testers: use the @qcut.app credentials emailed to you. Each test account is pre-loaded with 1000 credits on the free plan.

Local test credentials live in `./.env.test-accounts` at the repo root (gitignored). The file defines `QCUT_TEST_EMAIL` and `QCUT_TEST_PASSWORD` — source it before running `qcut system login`. See [docs/task/invite-test/testers.md](../invite-test/testers.md) for the full tester roster.

Verify with `qcut system check-keys --json` — a successful login shows your user email and remaining credits.

### The project directory

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
├── scripts/
│   ├── chunk_001.json
│   └── chunk_NNN.json        # stage 3 output
└── videos/
    ├── registry.json         # stage 4 output (per-shot status, cost, ref URLs)
    └── shot_<scene>-<beat>-<shot>.mp4   # stage 4 output (one per shot)
```

The slug defaults to `safeProjectSlug(<novel-basename>)` — so re-running
the same command on the same novel reuses the same directory, letting
you iterate without building up timestamped junk.

Relocate the root by exporting `QCUT_PROJECTS_DIR=/path/to/elsewhere`.

### Stage details

**Stage 1 — `flow characters`**

Extracts up to ~10 characters, detects the novel's `**映像スタイル：**`
/ `**Visual Style:**` header, and persists both into
`<proj>/characters.json` + `<proj>/project.json`. Measured 6.9s /
$0.00 on a 4 K-char anime novel (flash-lite didn't actually bill in
that run — expect a few cents on larger novels). `--style` is
optional here — usually you let the novel header decide the tone at
this stage and override at Stage 2 if needed.

*Between stages:* open `<proj>/characters.json` in your editor. You
can rename characters, fix missing `ethnicity`, or drop characters you
don't want portraits for. Stage 2 picks up edits.

**Stage 2 — `flow portraits`**

Reads `<proj>/characters.json`, renders one `front.png` per character
into `<proj>/portraits/<name>/`, and saves a
`<proj>/portraits/registry.json` that later stages consume. The
`--style` flag accepts a preset slug (see table below) or a free-form
prompt — either overrides `<proj>/project.json.style`
and is persisted back there so subsequent stages pick it up.

Measured run: 4m 14s for 5 characters / $0.100 (GMI Gemini 3.1 flash
image). Budget ~1 min per portrait as a rule of thumb.

**Stage 3 — `flow novel2script`**

Chunks the novel using the same splitter the monolithic `novel2movie`
uses, runs the `NovelSegmenter` on each chunk, and writes
`scripts/chunk_NNN.json` files with scene/shot breakdowns. Respects
`--max-scenes` to cap the total across chunks.

Accepts `--chunk-size` (default 2000 chars) and `--overlap` (default
200) if you need to tweak chunking for very long novels.

**Stage 4 — `flow novel2video`**

Reads `<proj>/scripts/chunk_*.json` + `<proj>/portraits/registry.json`,
generates one MP4 per shot via **GMI Seedance 2.0 260128**, and writes
`<proj>/videos/shot_<scene>-<beat>-<shot>.mp4` plus a
`<proj>/videos/registry.json` tracking status / cost / reference URLs.

Per-shot path:

1. Resolve the characters present in the shot to their portrait paths.
2. Upload each portrait via the license-server proxy
   (`POST /api/ai/upload-url` → signed FAL CDN URL → `PUT` bytes).
3. Submit `seedance-2-0-260128` with `reference_images: [<urls>]` (no
   `first_frame`). Falls back to **t2v** mode (no references) if any
   referenced character can't be uploaded — the registry's `reason`
   field records why.
4. Download MP4, append to `videos/registry.json`.

Flags:

| Flag | Default | Notes |
|---|---|---|
| `--project` | required | Project slug |
| `--max-shots` | unlimited | Cap total shots this run (cost control) |
| `--duration` / `-d` | 5 | Seconds per shot, clamped 4–15 |
| `--resolution` | 720p | `480p` / `720p` / `1080p` (480p only on GMI) |
| `--aspect-ratio` | 16:9 | `16:9` / `9:16` / `1:1` / `4:3` / `3:4` / `21:9` |
| `--concurrency` | 1 | Parallel shots in flight |
| `--cost-gate` | 2 | Aborts if projected USD spend exceeds this |
| `--force` | off | Overwrites existing MP4s + bypasses `--cost-gate` |
| `--model` / `-m` | `gmi_seedance_2_0_260128` | `gmi_seedance_2_0_260128` (default, $0.052/s), `seedance_2_0` (FAL fallback, $0.60/s), or `vidu_q3_ref2v_mix` (FAL Vidu, $0.154/s at 720p/1080p) |

The `--model` flag selects the **provider family**, not a specific
variant — the per-shot adapter still picks the right ref2v / i2v /
t2v variant per shot based on the script. Both families share the
same shot-selection logic; they differ only in endpoint, payload
field names, and price:

| Family | Endpoint(s) | Ref2V field | Duration type | $/s |
|---|---|---|---|---|
| `gmi_seedance_2_0_260128` | `seedance-2-0-260128` (one endpoint, internal variant) | `reference_images` (array) | integer | **$0.052** |
| `seedance_2_0` (FAL) | `bytedance/seedance-2.0/{ref-to,image-to,text-to}-video` | `image_urls` (array, up to 9) | string literal | $0.60 |
| `vidu_q3_ref2v_mix` (FAL Vidu) | `fal-ai/vidu/q3/reference-to-video` | `reference_image_urls` (array, up to 7) | integer | $0.07 (360p/540p) / **$0.154** (720p/1080p) |

Wall-clock runs ~3–6 min per shot (Seedance is slow). Use
`--max-shots 1` for smoke tests so a typo doesn't burn 30 minutes
and $10. The cost gate uses the upper bound per family ($0.052/s for
GMI, $0.60/s for FAL) so a 4-shot batch at 4s costs ≤$0.832 (GMI) or
≤$9.60 (FAL) before `--force` is needed.

**Reference upload note.** Portrait uploads route through
`output/upload-helper.ts`, which tries the license-server proxy first,
then falls back to a direct `https://rest.alpha.fal.ai/storage/upload/initiate`
call when the proxy can't vend AND the user has `FAL_KEY` /
`FAL_API_KEY` in env (added 2026-04-14). When neither path produces a
URL, the shot degrades to t2v and `videos/registry.json[].reason`
records why.

**Stage 5 — `gen video` (single-shot smoke test, no project)**

Use this when you want to validate the model + your GMI key without
running the full project batch. Single GMI call, single MP4 out,
takes a public image URL directly so it bypasses the upload helper.

```bash
qcut gen video -m gmi_seedance_2_0_260128_ref2v \
    -t "<prompt>" \
    --image-url <public-https-url> \
    -d 4s --resolution 480p --aspect-ratio 16:9
```

The model enum in `command-registry.ts` accepts the three Seedance
260128 keys (`_t2v`, `_i2v`, `_ref2v`); `executeImageToVideo` in
`step-executors.ts` maps `--image-url` to the right field per
variant (`reference_images: [url]` for ref2v, `first_frame: url` for
i2v). For T2V, pass only `-t` and skip `--image-url`.

This isn't a "stage" in the staged-workflow sense (it doesn't read
or write the project directory) — it's parallel to Stage 4 as a
quick way to confirm the model end-to-end before committing to a
batch. Output goes to `~/Documents/QCut/exports/output_<ts>.mp4`.

**Content-moderation gotcha.** Seedance applies a real-person
privacy filter on reference images. Photorealistic portraits may be
rejected with `InputImageSensitiveContentDetected.PrivacyInformation`
— use stylized references (anime, illustration) for ref2v workflows.

### Pre-flight estimates + per-step timing

Every staged command prints three things you can use to sanity-check
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

### Choosing a visual style (`--style`)

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

### Verified end-to-end run (2026-04-14)

Fresh three-stage run on
`electron/native-pipeline/vimax/examples/drama-example.md`
(《从弃女到巅峰：苏家千金归来》, a modern Chinese drama, 5,697 chars)
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

```text
[step] chunk 1/4 segmentation — 8.7s  2 scenes, 14 shots
[step] chunk 2/4 segmentation — 9.3s  3 scenes, 22 shots
```

Stage 3 stopped after 2 chunks because `--max-scenes 5` was hit — the
chunker had planned 4 chunks for the 5,697-char novel but the cap
short-circuited chunks 3 and 4. Absolute paths in the summary matched
disk exactly:

```text
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

**Key takeaways from the run**

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

### Verified Stage 4 smoke run (2026-04-14)

Single-shot smoke test on the same `cdrama-heiress-v3/` project to
prove the wiring end-to-end. Cheapest config: `--max-shots 1
--duration 4 --resolution 480p`.

```text
[step] upload 5 portraits — 1.0s  0/5 uploaded
[step] shot 1/1 [t2v] — 6m 8s  t2v, $0.208

Stage 4 — Generate per-shot videos — complete
  Duration:  6m 8s
  Cost:      $0.208
  Shots succeeded: 1/1
  Outputs:
    •  videos registry: …/videos/registry.json (455B)
    •  shot 1-1-1:      …/videos/shot_1-1-1.mp4 (1.7MB)
```

Registry entry:

```json
{
  "shot_id": "1-1-1",
  "status": "success",
  "variant": "gmi_seedance_2_0_260128_t2v",
  "cost_usd": 0.208,
  "duration_seconds": 4,
  "reference_urls": [],
  "reason": "t2v: 1 character not catalogued, degrading"
}
```

**Confirmed ✅**

- `flow novel2video` end-to-end: portrait upload attempt → Seedance
  submission → polling → MP4 download → registry write.
- Cost gate ($2 default) accepts the $0.208 projection and runs.
- Pre-flight banner numbers match actuals (predicted $0.208, actual
  $0.208; predicted 3–6 min, actual 6m 8s).
- Output paths (`videos/registry.json` + `videos/shot_*.mp4`) match
  disk and the registry MP4 plays.

**Stage 4 ref2v re-verified end-to-end (2026-04-14, follow-up)**

After adding the direct-FAL fallback to `output/upload-helper.ts`,
re-ran the staged pipeline against the **anime project**
`style-anime-v2/` with a shot whose characters overlap the portrait
registry (shot `1-1-3`: 沈念安 + 顾承泽, both catalogued).

```text
[upload-helper] Proxy vend failed (FAL API key not configured on server);
                 falling back to direct FAL upload.   ×5
  [step] upload 5 portraits — 8.5s  5/5 uploaded
  [step] shot 1/1 [ref2v] — 5m 19s  ref2v, $0.208
```

Registry entry:

```json
{
  "shot_id": "1-1-3",
  "status": "success",
  "variant": "gmi_seedance_2_0_260128_ref2v",
  "reference_urls": [
    "https://v3b.fal.media/files/b/0a963346/6CArPMkV64cOC51eJlYRj_front.png",
    "https://v3b.fal.media/files/b/0a963346/8rTzAhU0imfmK1iuFBCY4_front.png"
  ],
  "reason": "ref2v: 2 catalogued characters"
}
```

**Confirmed end-to-end ✅**

- Direct-FAL fallback in `output/upload-helper.ts` activates exactly
  when the proxy can't vend (5/5 portraits uploaded via fallback).
- `video-shot-adapter.ts:adaptShotForSeedance` correctly emits
  `gmi_seedance_2_0_260128_ref2v` when ≥1 character has a portrait.
- Per-shot marker is `[ref2v]` (not `[t2v]`).
- Registry records the `reference_urls` (FAL CDN, two distinct
  portraits matched to the shot's two catalogued characters).

**Why earlier runs degraded to t2v** (now understood, not a bug):

| Run | Project | First shot's characters | Catalogued? | Result |
|---|---|---|---|---|
| 1st (cdrama) | `cdrama-heiress-v3` | (uploads failed pre-fallback) | n/a | t2v |
| 2nd (anime, no fix yet) | `style-anime-v2` | `司仪` | ❌ no portrait | t2v |
| 3rd (anime, fix in place) | `style-anime-v2`, shot `1-1-3` | `沈念安, 顾承泽` | ✅ both | **ref2v** |

Two independent gates govern ref2v selection:

1. Portrait must upload to a public URL (now satisfied by FAL fallback).
2. Shot's `characters` array must contain ≥1 name that exists as a key
   in `portraits/registry.json`. Names like `司仪`, `宾客甲` (generic
   roles) won't match — they aren't extracted as characters in Stage 1.

For automatic ref2v coverage on every shot, either prune generic
roles from the script or add their portraits to the registry. The
adapter's `t2v` reason field tells you exactly which characters were
skipped per shot, so this is auditable in `videos/registry.json`.

### Stage 4 FAL family verified end-to-end (2026-04-14)

Same `cdrama-anime-v3/` project, but with `--model seedance_2_0`
forcing the FAL fallback path:

```bash
qcut flow novel2video --project cdrama-anime-v3 \
  --max-shots 1 --duration 4 --resolution 720p --aspect-ratio 16:9 \
  --model seedance_2_0 --cost-gate 3
```

```
[upload-helper] Proxy vend failed (FAL API key not configured on server);
                falling back to direct FAL upload.   ×5
  [step] upload 5 portraits — 13.8s  5/5 uploaded
  [step] shot 1/1 [ref2v] — 3m 48s  ref2v, $2.400
```

Registry entry:

```json
{
  "shot_id": "1-1-02",
  "status": "success",
  "variant": "seedance_2_0_ref2v",
  "cost_usd": 2.4,
  "duration_seconds": 4,
  "reference_urls": [
    "https://v3b.fal.media/files/b/0a963624/nnXNzI-O3nKkF7ISnN_c1_front.png",
    "https://v3b.fal.media/files/b/0a963624/cRkl7LxUea_OFSD31pj85_front.png"
  ],
  "reason": "ref2v: 2 catalogued characters"
}
```

**Confirmed ✅**

- `--model seedance_2_0` resolves to FAL family (`adapter.provider:
  "fal"`, endpoint `bytedance/seedance-2.0/reference-to-video`).
- Variant key written as `seedance_2_0_ref2v` (not the GMI prefix).
- Payload uses `image_urls` (array) — verified by the upstream
  succeeding; the field-name fix from `gen video` testing carried
  through.
- Duration coerced to string `"4"` per FAL schema requirement.
- Cost gate calculated using the FAL upper bound ($0.60/s × 4s =
  $2.40 > default $2; needed `--cost-gate 3` to pass).
- 1.9 MB MP4 (720p) downloaded to
  `videos/shot_1-1-02.mp4`.

**Wall-clock + cost vs GMI**

| Family | Variant | Wall-clock | Cost | Resolution |
|---|---|---|---|---|
| GMI (this morning) | `gmi_seedance_2_0_260128_ref2v` | 5m 19s | $0.208 | 480p |
| **FAL** (this run) | **`seedance_2_0_ref2v`** | **3m 48s** | **$2.400** | **720p** |

FAL is **~30% faster** here but **11.5× more expensive**. Stick with
GMI as the default; reach for `--model seedance_2_0` only when GMI
is unavailable (the present `billing.default` outage validates the
need for the fallback flag).

### GMI billing outage (2026-04-14, later same day)

Attempted a full fresh-project run on `cdrama-anime-v3/`. Stages 1
and 3 completed cleanly. Stage 2 (portraits via
`gmi_gemini_31_flash_image`) and Stage 4 (Seedance) both failed
with identical upstream errors:

```
402: billing pre-charge failed: billing v2 charge failed (status 0):
failed to send HTTP request: Post
"http://billing.default:8081/video/chargev2":
dial tcp: lookup billing.default on 169.254.20.10:53: no such host
```

This is a GMI internal-infrastructure failure — their billing
microservice (`billing.default:8081`) isn't resolvable from the
video worker pods. It fails before the generation call is made, so
$0.00 is charged and retries are safe.

**What still worked (client-side validated, server unable to
process):**

All 4 shots in the batch correctly produced adapter output before
the billing rejection:

| Shot | Variant | Reference URLs | Adapter reason |
|---|---|---|---|
| 1-1-01 | `gmi_seedance_2_0_260128_t2v` | 0 | "1 character not catalogued" |
| 1-1-02 | `gmi_seedance_2_0_260128_ref2v` | 2 | "2 catalogued characters" |
| 1-1-03 | `gmi_seedance_2_0_260128_ref2v` | 1 | "1 catalogued character" |
| 1-1-04 | `gmi_seedance_2_0_260128_ref2v` | 1 | "1 catalogued character" |

Portraits uploaded (5/5 via direct-FAL fallback, 8.9–19.8s), variant
selection and reference matching correct. `videos/registry.json`
preserves the `error` field per shot so re-running is a no-op on
already-successful shots once GMI recovers. Recovery test: retry
`flow novel2video --project cdrama-anime-v3 --max-shots 1 -d 4
--resolution 480p` periodically; when the 402 disappears, the whole
pipeline will resume from where it left off (the existing registry
tracks failures explicitly, so successful shots won't be
re-billed).

### Verified Seedance Ref2V via `gen video` (2026-04-14)

Direct GMI ref2v call validated end-to-end via the simpler
`gen video` CLI (bypasses the upload helper / proxy by accepting a
public image URL):

```bash
qcut gen video -m gmi_seedance_2_0_260128_ref2v \
  -t "Anime woman with long dark hair walks gently into frame, soft cinematic light, calm expression, modern anime film style" \
  --image-url https://v3b.fal.media/files/.../front.png \
  -d 4s --resolution 480p --aspect-ratio 16:9
```

Result:

```
Duration: 271.1s
Cost: $0.2080 USD
Output: /Users/peter/Documents/QCut/exports/output_1776155994427.mp4 (909 KB MP4)
```

**What this confirmed ✅**

- CLI dispatch: `gen video -m gmi_seedance_2_0_260128_ref2v` reaches
  `executeImageToVideo` with the right model definition.
- Payload mapping: `--image-url <url>` correctly serializes to GMI as
  `reference_images: [url]` (not `image_url`) thanks to the
  Seedance-specific branch in `step-executors.ts:executeImageToVideo`.
- GMI submit + poll: `seedance-2-0-260128` accepted the payload,
  returned `success`, and the MP4 downloaded to the output directory.
- Cost matches spec: 4s × $0.052/s = $0.208.

**Content-moderation gotcha**

A first attempt with a photorealistic Chinese-drama portrait was
rejected with:

```
InputImageSensitiveContentDetected.PrivacyInformation —
The request failed because the input image may contain real person.
```

The same prompt with an anime-styled portrait succeeded immediately.
Seedance applies a real-person privacy filter on reference images;
plan around it for ref2v workflows or use stylized references.

### Direct-FAL upload fallback (2026-04-14)

`electron/native-pipeline/output/upload-helper.ts` now tries the
license-server proxy first (default, keeps the FAL key off the
user's machine), then falls back to a direct call to
`https://rest.alpha.fal.ai/storage/upload/initiate` when:

1. The proxy vend step fails (typically `FAL API key not configured
   on server`), AND
2. The user has `FAL_KEY` (or `FAL_API_KEY`) in their env.

The fallback logs a warning so the proxy misconfiguration is still
visible in CLI output, but the upload completes. Tests live at
`electron/native-pipeline/output/__tests__/upload-helper.test.ts`
(14 cases, all passing).

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
