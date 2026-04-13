# GMI Video CLI Guide

Step-by-step recipes for generating AI videos from novels and scripts
using GMI Cloud models through QCut's pipeline CLI.

## Guide layout

| File | Covers |
|---|---|
| [01-prerequisites.md](01-prerequisites.md) | `qcut` CLI install, login (BYOK or proxy), keys in `~/.qcut/.env` |
| [02-novel2movie-walkthrough.md](02-novel2movie-walkthrough.md) | Monolithic `flow novel2movie` recipe with Japanese drama/anime examples |
| [03-script2video-walkthrough.md](03-script2video-walkthrough.md) | Generate real MP4s from an existing script via GMI Kling omni |
| [04-gmi-models.md](04-gmi-models.md) | Which GMI model for what + cost/duration cheat sheet |
| [05-troubleshooting.md](05-troubleshooting.md) | Every failure mode observed in past sessions + how to diagnose |
| [06-stage-decomposition-plan.md](06-stage-decomposition-plan.md) | Why + how we split `novel2movie` into independent stages |
| [07-stage-workflow.md](07-stage-workflow.md) | Recipe: `flow characters` → `flow portraits` → `flow novel2script` with a shared project dir |

## Known issues to keep in mind

- ❌ **`gmi_veo31_lite_i2v`** — Google's Veo content-safety filter rejects
  most Japanese drama prompts (error code `58061214`). Not a QCut bug.
  Use Kling-family models instead.
- ⚠️ **`gmi_kling_v3_i2v` (non-omni)** — intermittent 500 / "context
  deadline exceeded" timeouts. Retries help but Kling Omni is more
  reliable.
- ⚠️ **Storyboard filename collisions** — shots sharing the same
  `shot_type` overwrite each other on disk. Doesn't block video
  generation (in-memory image array survives) but reduces PNG count
  on disk.
- ⚠️ **`flow script2video` default output is `/tmp/`** — only
  `novel2movie` and the staged commands auto-default to a stable
  location. Pass `--output-dir` for `script2video` or the files land
  in a temp folder.

Full diagnosis recipes for each: [05-troubleshooting.md](05-troubleshooting.md).
