# 08 — Detailed reference

Deep dive on prerequisites and the monolithic `flow novel2movie`
command. Read [00-overview.md](00-overview.md) first for the
five-minute version.

## Contents

- [Install + key store](#install--key-store)
- [Authentication: BYOK keys](#authentication-byok-keys)
- [Authentication: proxy / beta-tester login](#authentication-proxy--beta-tester-login)
- [Sanity-check GMI connectivity](#sanity-check-gmi-connectivity)
- [Workspace setup](#workspace-setup)
- [Cheap test image (round-trip in 2 min)](#cheap-test-image-round-trip-in-2-min)
- [`flow novel2movie`](#flow-novel2movie)
- [Novel format + style header](#novel-format--style-header)
- [Output directory tree](#output-directory-tree)
- [Verifying GMI actually ran](#verifying-gmi-actually-ran)
- [Common variations](#common-variations)

## Install + key store

QCut ships a Bun-installed `qcut` binary that symlinks into the
monorepo's `dist/electron/native-pipeline/cli/cli.js`.

```bash
which qcut         # → /Users/peter/.bun/bin/qcut (symlink)
qcut --version     # → 1.0.0
bun run build      # rebuild after pulling new code
```

Keys live in `~/.qcut/.env` (mode `0600`).

## Authentication: BYOK keys

```bash
# Interactive — paste your key when prompted
qcut system set-key --name GMI_API_KEY

# Verify
qcut system check-keys --json | jq '."GMI_API_KEY"'
# → "set"
```

| Key | Used by |
|---|---|
| `GMI_API_KEY` | GMI Cloud video + image + LLM (the happy path) |
| `FAL_KEY` | FAL provider (Kling v1/v2, Veo 3, Hailuo, etc.) |
| `GEMINI_API_KEY` | Google Gemini LLM fallback |
| `OPENROUTER_API_KEY` | OpenRouter LLM fallback |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS |
| `QCUT_AUTH_TOKEN` | License-server proxy mode (server-managed keys) |

## Authentication: proxy / beta-tester login

Skip BYOK and pay with credits via the license-server proxy. 11 beta
test accounts are pre-loaded with 1000 credits each — ask a
maintainer for the email + password.

### Log in

```bash
# Interactive password prompt
qcut system login --email your-tester@qcut.app

# Scripted (CI-friendly)
qcut system login \
    --email "$QCUT_TEST_EMAIL" \
    --password "$QCUT_TEST_PASSWORD"
```

The session JWT lands in `~/.qcut/.env` as `QCUT_AUTH_TOKEN`.

### Verify the token was persisted

```bash
qcut system check-keys --json | jq '."QCUT_AUTH_TOKEN"'
# → "set"

# Inspect the JWT itself
qcut system get-key --name QCUT_AUTH_TOKEN --reveal
```

### Check your credit balance

```bash
curl -H "Authorization: Bearer $(qcut system get-key --name QCUT_AUTH_TOKEN --reveal)" \
    https://qcut-license-server.zdhpeter.workers.dev/api/credits/balance
# → {"balance": 1000, ...}
```

Endpoint source: `packages/license-server/src/routes/credits.ts:82`.

### Force a proxy-routed call

With a local `GMI_API_KEY` present the adapter short-circuits to BYOK
(`api-caller.ts:579` — `useProxy = !apiKey && isProxyAvailable()`).
Hide the local key for one invocation to actually exercise the proxy
path:

```bash
env -u GMI_API_KEY qcut gen video \
    --model gmi_veo31_lite_t2v \
    --text "a cat walking through a sunlit kitchen" \
    --output-dir /tmp/qcut-proxy-ping
```

Look for `[api_caller] Using proxy mode (QCUT_AUTH_TOKEN)` in the log
and a credit debit when re-checking balance.

### Log out

```bash
qcut system logout
# Clears QCUT_AUTH_TOKEN from ~/.qcut/.env
```

Full BYOK-vs-proxy decision tree:
[reference-proxy-credits.md](../../../.claude/skills/native-cli/references/reference-proxy-credits.md).

> ⚠️ Legacy aliases `qcut login` / `qcut logout` / `qcut check-keys` /
> `qcut get-key` / `qcut create-video` still work but emit deprecation
> warnings. Always prefer `qcut system …` and `qcut gen video`.

## Sanity-check GMI connectivity

```bash
qcut system models --category image_to_video --json \
  | jq '.data | map(select(.providerBackend == "gmi")) | .[].key'
```

Expected output includes `gmi_kling_v3_i2v`, `gmi_kling_v3_omni_i2v`,
`gmi_skyreels_v4_i2v`, `gmi_veo31_lite_i2v`. Hangs/HTTP errors here
mean the CLI couldn't reach the license server.

## Workspace setup

`--novel` / `--script` / `--output-dir` paths are resolved relative
to cwd; `system models` and key commands work from anywhere.

For every snippet in this guide:

```bash
cd ~/Desktop/code/qcut/qcut
```

so paths like `electron/native-pipeline/vimax/examples/japanese-anime-example.md`
resolve.

## Cheap test image (round-trip in 2 min)

Shortest call that exercises the GMI image pipeline:

```bash
qcut gen image \
    --model gmi_gemini_31_flash_image \
    --text "A Japanese anime schoolgirl, soft pastel, Shinkai style, 16:9" \
    --aspect-ratio 16:9 \
    --output-dir /tmp/qcut-ping
```

Expect ~1–2 min, one PNG, ~$0.02 cost printed at end.

## `flow novel2movie`

End-to-end pipeline: characters → portraits → script segmentation →
storyboard images → Kling videos → concatenation. The
[staged workflow](07-stage-workflow.md) is preferred for iteration —
this monolith stays useful when you want a single-shot run.

```bash
qcut flow novel2movie \
  --novel electron/native-pipeline/vimax/examples/japanese-anime-example.md \
  --llm-model gemini-3.1-flash-lite \
  --image-model gmi_gemini_31_flash_image \
  --video-model gmi_kling_v3_omni_i2v \
  --max-images 1 \
  --verbose --stream
```

Output lands at `~/Documents/QCut/Exports/novel2movie/<slug>_<timestamp>/`.

### Flag reference

| Flag | Why |
|---|---|
| `--novel <path>` | Markdown novel. Bundled examples: `drama-example.md` (Chinese J-TV), `japanese-drama-example.md` (live-action), `japanese-anime-example.md` (Shinkai/KyoAni anime). Bundled-fallback **doesn't work from the installed binary** because the build doesn't copy `.md` into `dist/`; pass the path explicitly. |
| `--llm-model` | `gemini-3.1-flash-lite` is the cheapest GMI LLM alias ($0.00005 in / $0.0002 out per 1K tokens). Used for character extraction + segmentation. |
| `--image-model` | `gmi_gemini_31_flash_image` is the cheap flash variant ($0.02/image). Renders portraits + storyboards. |
| `--video-model` | Sets the registry entry passed to the video adapter. **Not called when `--max-images` is set** (preview mode skips video gen). Worth setting so it lands in `summary.json`. |
| `--max-images N` | Caps storyboard image count and **skips video generation entirely** (preview mode). Cheap-test switch. |
| `--max-scenes N` | Caps scenes processed across all chunks; chunk loop breaks early once hit. Useful for long novels when you only want a preview. |
| `--max-clips N` | Caps the number of shot videos generated. Truncates each chunk's storyboard to remaining headroom before the camera generator runs. Pair with `--max-scenes 20 --max-clips 5` for a 5-clip sizzle reel. |
| `--no-portraits` | Skip portrait generation (saves ~$0.10 for 5 characters). |
| `--storyboard-only` | Stop after storyboard images — no video spend regardless of `--max-images`. |
| `--scripts-only` | Stop after segmentation — no images, no video. |
| `--verbose --stream` | JSONL events on stderr; grep `"provider":"gmi"` for routing evidence. |

## Novel format + style header

`novel2movie` expects a markdown novel with a style-header block at
the top. The pipeline auto-parses three style-line conventions from
the first 2000 characters (first match wins):

| Language | Line pattern |
|---|---|
| Japanese | `**映像スタイル：** …` or `**画像スタイル：** …` |
| Chinese (simplified) | `**视频风格：** …` or `**画面风格：** …` |
| English | `**Image Style:** …` or `**Visual Style:** …` |

The matched value becomes `pipelineConfig.visual_style` and is
forwarded into both `CharacterExtractor.portrait_style` and
`CharacterPortraitsGenerator.style`. Without this fix
(commit `cc0458f76`), every portrait got a hardcoded LinkedIn-style
wrapper.

Character paragraphs can — and should — include ethnicity. The schema
asks the LLM to populate `portrait.ethnicity` so Japanese characters
don't render Caucasian by default.

Full example structure:

```markdown
# 星降る夜のカフェ

**映像スタイル：** 現代日本のアニメ映画風、新海誠と京都アニメーションの影響
**画像スタイル：** Modern Japanese anime film style, Shinkai / KyoAni influence
**アスペクト比：** 16:9

---

## あらすじ
…

## 登場人物

### 星野すばる（ほしの すばる）、17歳

Japanese high-school girl, seventeen, large expressive dark brown
anime eyes, medium-length black hair pulled into a loose low ponytail.
Wearing a pale cream cotton cardigan over a white summer dress.
Cel-shaded style, soft cel-shading, NOT a photograph, NOT a 3D render.
```

## Output directory tree

```
~/Documents/QCut/Exports/novel2movie/japanese-anime-example_<ts>/
├── novel.md                 source copy
├── characters.json          LLM character extraction
├── portrait_registry.json   name → portrait path lookup
├── scripts/
│   ├── chunk_001.json       script segmentation, chunk 1
│   ├── chunk_002.json       …
│   └── chunk_N.json
├── portraits/
│   ├── <character 1>/front.png
│   ├── <character 2>/front.png
│   └── …
├── storyboard/
│   └── chapter_001_untitled/
│       └── scene_001_*.png  (1 image with --max-images 1)
└── summary.json             success / cost / errors
```

Typical `summary.json` after a 5-character novel:

```json
{
  "success": true,
  "script_count": 4,
  "total_shots": 75,
  "character_count": 5,
  "portrait_count": 5,
  "used_character_references": true,
  "total_cost": 0.12,
  "errors": []
}
```

The default output path is **baked into the `novel2movie` handler**
(`pipeline-handlers.ts:243-246`) so artifacts don't vanish on reboot.
Pass `--output-dir /tmp/…` for throwaway runs.

## Verifying GMI actually ran

```bash
jq -r '.[0] | .portrait_prompt' \
  ~/Documents/QCut/Exports/novel2movie/japanese-anime-example_*/characters.json | head -1
```

Output should **start with the novel's style line** (e.g.
`現代日本のアニメ映画風…`) and should **not** contain
`photorealistic front portrait, shot on professional camera` or
`plain white background, soft studio lighting` — those were the
old FAL-only hardcoded wrappers that commit `cc0458f76` removed.

## Common variations

**Full video production** (expensive — skip the video cap):

```bash
qcut flow novel2movie \
  --novel electron/native-pipeline/vimax/examples/japanese-anime-example.md \
  --llm-model gemini-3.1-flash-lite \
  --image-model gmi_gemini_31_flash_image \
  --video-model gmi_kling_v3_omni_i2v \
  --verbose
```

With ~75 shots × ($0.02 image + $0.42 video), that's $33+ per chunk.
Run only after a dry-run validates the script.

**Cap to 5 clips out of 20 scenes** (sizzle reel, ~$2):

```bash
… --max-scenes 20 --max-clips 5 …
```

**Portraits only**:

```bash
… --max-images 1   # also skips video
```

**Skip character portraits** (~$0.10 saved on 5 characters):

```bash
… --no-portraits …
```

**Stop after storyboards** (no video spend):

```bash
… --storyboard-only …
```
