# GMI Video CLI Guide

Step-by-step recipes for generating AI videos from novels and scripts
using GMI Cloud models through QCut's pipeline CLI. Written after a
live end-to-end validation session on branch `cli-drama`.

## What works (validated in this guide)

- ✅ **Novel → 5 GMI-rendered character portraits + 1 storyboard image**
  via `flow novel2movie --max-images 1`. See
  [02-novel2movie-walkthrough.md](02-novel2movie-walkthrough.md).
- ✅ **Script → 5 GMI-rendered storyboard images + 5 GMI-Kling MP4s +
  concatenated final video** via `flow script2video` with
  `--video-model gmi_kling_v3_omni_i2v`. See
  [03-script2video-walkthrough.md](03-script2video-walkthrough.md).
- ✅ **Novel-header style propagation** — `映像スタイル` / `视频风格` /
  `Image Style` lines are parsed and flow through to every portrait
  + storyboard prompt.
- ✅ **Retry with backoff** on transient GMI 5xx / network timeouts.

## What's still broken or flaky

- ❌ **`gmi_veo31_lite_i2v`** — Google's Veo has an aggressive content
  safety filter that rejects most Japanese drama prompts (see error
  code `58061214`). Not a QCut bug. Use Kling-family models instead.
- ⚠️ **`gmi_kling_v3_i2v` (non-omni)** — intermittent 500 / "context
  deadline exceeded" timeouts. Retries help but it's less reliable
  than Kling Omni.
- ⚠️ **Storyboard filename collisions** — shots sharing the same
  `shot_type` overwrite each other on disk (`scene_001_medium_*.png`).
  Doesn't block video generation but reduces PNG count on disk.
- ⚠️ **`flow script2video` default output is `/tmp/`** — only
  `novel2movie` auto-defaults to `~/Documents/QCut/Exports/`. Pass
  `--output-dir` or the files land in a temp folder.
- ⚠️ **`--max-scenes` doesn't really cap scenes** — segmentation runs
  on the full novel. Use `--max-images N` to cap cost instead.

## Key commits on `cli-drama`

| Commit | Purpose |
|---|---|
| `19cd9f184` | Route vimax video adapter through `ModelRegistry` so GMI models work |
| `cc0458f76` | Respect novel style + character ethnicity in portrait generation |
| `f84b418df` | Provider-specific image payload (`image` for GMI, `image_url` for FAL) |
| `bb4039bd6` | Retry with exponential backoff on transient video API failures |

## Guide layout

| File | Covers |
|---|---|
| [01-prerequisites.md](01-prerequisites.md) | `qcut` CLI install, `GMI_API_KEY` in `~/.qcut/.env`, verify via `system check-keys` |
| [02-novel2movie-walkthrough.md](02-novel2movie-walkthrough.md) | Full `flow novel2movie` recipe with Japanese drama/anime examples |
| [03-script2video-walkthrough.md](03-script2video-walkthrough.md) | Generate real MP4s from an existing script via GMI Kling omni |
| [04-gmi-models.md](04-gmi-models.md) | Which GMI model for what + cost/duration cheat sheet |
| [05-troubleshooting.md](05-troubleshooting.md) | Every failure mode observed in this session + how to diagnose |

## Session recap (for context)

Generated during verification:

| Artifact | Path |
|---|---|
| J-drama portraits | `~/Documents/QCut/Exports/novel2movie/japanese-drama-example_202604121356/portraits/` |
| Anime portraits | `~/Documents/QCut/Exports/novel2movie/japanese-anime-example_202604121404/portraits/` |
| 5-shot Kling MP4s + final | `/tmp/script2video-5shot/videos/星降る夜のカフェ_—_5-shot_sampler/` |

Total cost across 6 runs: ~$2.50 (1 successful 5-video render + 5 test runs at image-only spend).
