# GMI Video CLI Guide — Quick Start

Generate AI videos from novels and scripts using GMI Cloud through
QCut's pipeline CLI. Five-minute onboarding here; full details in
[08-reference.md](08-reference.md).

## 1. Install

```bash
which qcut         # → /Users/peter/.bun/bin/qcut
qcut --version     # → 1.0.0
bun run build      # rebuild after pulling
```

## 2. Authenticate (pick one)

| Mode | Setup | When to use |
|---|---|---|
| **BYOK** | `qcut system set-key --name GMI_API_KEY` | You have your own GMI key |
| **Proxy / beta tester** | `qcut system login --email "$EMAIL" --password "$PASSWORD"` | No GMI key; pay with credits (1000 free per beta account) |

Verify either way: `qcut system check-keys`.

## 3. Pick a workflow

### A. Staged (recommended) — three independent steps

Each stage writes a checkpoint to `~/Documents/QCut/projects/<slug>/`
that the next stage consumes. Inspect or edit between stages.

```bash
NOVEL=electron/native-pipeline/vimax/examples/japanese-anime-example.md
PROJECT=japanese-anime-example

qcut flow characters   --novel "$NOVEL" --project "$PROJECT"
qcut flow portraits    --project "$PROJECT"
qcut flow novel2script --novel "$NOVEL" --project "$PROJECT" --max-scenes 20
```

Full recipe + per-stage flags: [07-stage-workflow.md](07-stage-workflow.md).

### B. Monolithic — one command, end-to-end

```bash
qcut flow novel2movie \
  --novel "$NOVEL" \
  --max-scenes 20 --max-clips 5 \
  --image-model gmi_gemini_31_flash_image \
  --video-model gmi_kling_v3_omni_i2v
```

All flags + cost notes: [08-reference.md](08-reference.md#flow-novel2movie).

## 4. Generate real videos from a script

After staged or monolithic, turn an existing script into MP4s:
[03-script2video-walkthrough.md](03-script2video-walkthrough.md).

## Guide layout

| File | Covers |
|---|---|
| [03-script2video-walkthrough.md](03-script2video-walkthrough.md) | Generate real MP4s from an existing script via GMI Kling omni |
| [04-gmi-models.md](04-gmi-models.md) | Which GMI model for what + cost cheat sheet |
| [05-troubleshooting.md](05-troubleshooting.md) | Failure modes + diagnosis recipes |
| [06-stage-decomposition-plan.md](06-stage-decomposition-plan.md) | Why we split `novel2movie` into stages |
| [07-stage-workflow.md](07-stage-workflow.md) | Detailed staged-workflow recipe |
| [08-reference.md](08-reference.md) | Deep reference: every key type, login flow, all flags, novel format, output tree |

## Known issues to keep in mind

- ❌ **`gmi_veo31_lite_i2v`** — Veo's content-safety filter rejects most
  Japanese drama prompts (error code `58061214`). Use Kling instead.
- ⚠️ **`gmi_kling_v3_i2v` (non-omni)** — intermittent 500s; Kling Omni
  is more reliable.
- ⚠️ **Storyboard filename collisions** — same `shot_type` shots
  overwrite each other on disk (videos still render fine).
- ⚠️ **`flow script2video` defaults to `/tmp/`** — pass `--output-dir`
  explicitly.

Full diagnosis recipes: [05-troubleshooting.md](05-troubleshooting.md).
