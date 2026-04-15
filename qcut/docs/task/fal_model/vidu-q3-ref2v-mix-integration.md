# Vidu Q3 Reference-to-Video (`mix`) — Integration Plan

> **Status:** ✅ Implemented on 2026-04-14 (subtasks 1–3 + plan
> update). Live verification (subtask 4) deferred — same shape as
> the FAL Seedance ref2v path we validated end-to-end this morning,
> so the smoke test is optional unless the user wants the cost +
> wall-clock baseline recorded.
>
> **Target endpoint:** `fal-ai/vidu/q3/reference-to-video/mix`
> **Source spec:** [fal.ai/models/fal-ai/vidu/q3/reference-to-video/mix/api](https://fal.ai/models/fal-ai/vidu/q3/reference-to-video/mix/api)
> **Date:** 2026-04-14

## Implementation summary (2026-04-14)

### Files changed

- `electron/native-pipeline/registry-data/image-to-video.ts` — added
  `vidu_q3_ref2v_mix` registry entry (FAL provider, `audio: true`
  default, `inputRequirements.required: ["prompt", "reference_image_urls"]`).
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — added
  UI model entry + appended to `I2V_MODEL_ORDER` next to `vidu_q3_i2v`.
- `electron/native-pipeline/cli/command-registry.ts` — added
  `vidu_q3_ref2v_mix` to the `create-video --model` enum so
  `gen video -m vidu_q3_ref2v_mix` clears CLI validation.
- `electron/native-pipeline/execution/step-executors.ts` — new
  branch in `executeImageToVideo` mapping `input.imageUrl` →
  `payload.reference_image_urls = [url]`. Duration left as integer
  (Vidu accepts numeric, unlike FAL Seedance 2.0 which forces
  string).
- **New**: `electron/native-pipeline/execution/__tests__/step-executors-vidu.test.ts` —
  6 tests covering payload shape + 2 regression guards for
  Seedance branches.

### Test results

- `bunx vitest run electron/native-pipeline/execution/__tests__/step-executors-vidu.test.ts`
  → **6 tests passed**
- `bunx vitest run electron/native-pipeline/execution/ electron/native-pipeline/cli/vimax-cli-handlers/__tests__/`
  → **53 tests passed** (no regressions)
- `bunx tsc -p apps/web/tsconfig.json --noEmit` → clean

### How it gets used

```bash
qcut gen video -m vidu_q3_ref2v_mix \
  -t "<prompt>" \
  --image-url <public-https-url> \
  -d 4s --resolution 720p --aspect-ratio 16:9
```

The image URL gets wrapped in a length-1 array and passed as
`reference_image_urls` (the field name Vidu Q3 mix requires).
Multi-image (1–4) support is the first follow-up — needs an
`--image-urls` array flag in the CLI plus the executor branch
already in place.

### Design choices recorded

- **Per-key branch in `executeImageToVideo` instead of an
  abstraction.** Three providers, three field names:
  - GMI Seedance 260128 ref2v → `reference_images`
  - FAL Seedance 2.0 ref2v → `image_urls`
  - **Vidu Q3 mix → `reference_image_urls` (new)**
  Three is too few to abstract and they won't converge — each
  provider picked its own. Revisit when a fifth ref2v model lands.
- **Did not register `vidu_q3_i2v` in the electron registry.** That
  model is only referenced by the apps/web UI today; the CLI
  doesn't gate on it. Adding it isn't this plan's scope.
- **`flow novel2video` Stage 4 untouched.** Its shot adapter is
  Seedance-family-only; integrating Vidu would force a third
  payload-builder family for what's currently a one-off CLI
  capability. Defer.

## Summary

Add `vidu_q3_ref2v_mix` as a FAL-backed image-to-video model so users
can hand 1–4 reference images + a prompt and get back a video that
keeps subject/scene appearance consistent across the shot. Wires
into both `gen video` (single-shot) and the editor UI (model picker
+ shot generation flow). Stays a **single new model entry** — no
shared-adapter refactor — to keep blast radius small.

## Scope

Total estimate: **~30 min** → split into 4 subtasks (planit rule:
>20 min ⇒ subtasks).

| # | Subtask | Status | Doc |
|---|---------|:-----:|-----|
| 1 | Registry + UI model config | ✅ | [01-registry-and-ui.md](./vidu-q3-ref2v-mix/01-registry-and-ui.md) |
| 2 | CLI enum + step-executor field mapping | ✅ | [02-cli-and-executor.md](./vidu-q3-ref2v-mix/02-cli-and-executor.md) |
| 3 | Unit tests | ✅ | [03-tests.md](./vidu-q3-ref2v-mix/03-tests.md) |
| 4 | Live verification + docs | ⏸ deferred | [04-docs-and-verify.md](./vidu-q3-ref2v-mix/04-docs-and-verify.md) |

## Endpoint contract (verified from FAL docs)

```jsonc
POST https://queue.fal.run/fal-ai/vidu/q3/reference-to-video/mix
Authorization: Key $FAL_KEY
Content-Type: application/json

{
  "prompt": "A character walking through a beach catching an apple.",
  "reference_image_urls": [                        // REQUIRED, 1-4 URLs
    "https://example.com/ref1.png",
    "https://example.com/ref2.png"
  ],
  "duration": 5,                                    // 1-16, default 5
  "seed": 42,                                       // optional
  "aspect_ratio": "16:9",                           // 16:9|9:16|4:3|3:4|1:1
  "resolution": "720p",                             // 360p|540p|720p|1080p
  "audio": true                                     // default true
}
```

**Critical field-name notes** (these diverge from other models we
already support):

- Reference images: **`reference_image_urls`** (plural list), NOT
  `image_urls`, `reference_images`, or `image_url`. The standard
  `executeImageToVideo` in `step-executors.ts` writes `image_url` —
  this model needs a dedicated branch (same pattern we already use
  for Seedance ref2v variants).
- Audio toggle: **`audio`** boolean, NOT `generate_audio` (Vidu Q3
  i2v uses `generate_audio`). Don't accidentally reuse the i2v
  default-params block.
- Duration: integer (Vidu accepts numeric; do NOT stringify like
  the FAL Seedance 2.0 schema requires).

**Output shape:** `{ "video": { "url": "https://v3b.fal.media/..." } }`
— matches FAL's standard image-to-video response, so
`extractOutputUrl` in `infra/api-caller.ts` already pulls it via the
`video.url` accessor (no change needed).

## Pricing

Public docs page does not list a per-second figure. Vidu Q3 i2v is
priced `0.07–0.154/s` depending on resolution
(`registry-data/image-to-video.ts:565`). Until FAL publishes the mix
variant rate, **assume the same `perSecondPricing` table**:

```ts
perSecondPricing: {
  "360p": 0.07,
  "540p": 0.07,
  "720p": 0.154,
  "1080p": 0.154,
}
```

Subtask 4 includes a one-shot live test that records the actual cost
returned by the FAL API; if it diverges, update the registry.

## Guiding principles

- **Long-term maintainability** — model the new entry the same way
  `vidu_q3_i2v` is registered (sibling in the same file, matching
  config style). Don't introduce a generic "ref2v" abstraction
  layer — three field-name conventions (`image_urls` for Seedance,
  `reference_image_urls` for Vidu, `reference_images` for GMI) is
  not enough to abstract over. A small per-model branch in
  `executeImageToVideo` is the honest fix.
- **Don't touch `flow novel2video`** — that pipeline is currently
  Seedance-family only via `--model gmi_seedance_2_0_260128 |
  seedance_2_0`. Vidu mix is a different shape (image_count up to
  4, character consistency mode); shoehorning it would force the
  shot adapter to grow a third payload-builder family. Defer to a
  follow-up unless a user explicitly asks for it.
- **Single image first, multi-image as follow-up** — `gen video
  --image-url <url>` already exists. We pass `[url]` (length-1 array)
  to satisfy `reference_image_urls`. Multi-image (`--image-urls`
  flag, up to 4) is a clean follow-up that doesn't block initial
  shipping.

## Cross-cutting changes at a glance

| File | Change |
|------|--------|
| `electron/native-pipeline/registry-data/image-to-video.ts` | register `vidu_q3_ref2v_mix` |
| `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` | UI model entry + add to `I2V_MODEL_ORDER` |
| `electron/native-pipeline/cli/command-registry.ts` | add `vidu_q3_ref2v_mix` to `create-video --model` enum |
| `electron/native-pipeline/execution/step-executors.ts` | branch in `executeImageToVideo` to write `reference_image_urls: [url]` |
| `electron/native-pipeline/cli/__tests__/...` | new payload-shape tests |
| `electron/native-pipeline/execution/__tests__/step-executors-vidu.test.ts` (new) | unit test for the new branch |
| `docs/task/gmi-video-cli-guide/...` (or new fal-cli doc) | usage example + verified-run section |

## Validation flow

After landing subtasks 1–3, validate live with:

```bash
qcut gen video -m vidu_q3_ref2v_mix \
  -t "A young woman walks gently into frame, soft cinematic light" \
  --image-url https://v3b.fal.media/files/.../front.png \
  -d 4s --resolution 720p --aspect-ratio 16:9
```

Cost: ~$0.15/s × 4s ≈ **$0.62** for one 720p test. Wall-clock
unknown — Vidu Q3 i2v isn't documented either, budget 2–5 min.

## Rollout order

1. Subtask 1 (registry + UI) — unblocks model picker + listing
2. Subtask 2 (CLI + executor) — makes `gen video -m` work end-to-end
3. Subtask 3 (tests) — locks in payload shape so future refactors
   don't silently regress
4. Subtask 4 (live verify + docs) — only after 1-3 land

Each subtask is independently shippable; failures don't block the
others.

## Out of scope (explicit non-goals)

- **Multi-image flag in CLI.** `--image-urls a.png b.png c.png` is
  a clean follow-up but adds CLI parsing surface. Single-image
  works for character-consistency tests.
- **`flow novel2video` integration.** Vidu mix's payload doesn't
  match the Seedance shot adapter's schema; would require a third
  family. Defer.
- **Per-resolution price probe.** We assume parity with `vidu_q3_i2v`
  pricing until FAL publishes a delta. Subtask 4's live test
  records the actual returned cost; update only if it differs.
- **Editor UI generation flow handler.** UI model picker will list
  the entry, but the generation handler (`handlers/image-to-video-handlers.ts`)
  isn't touched in this round — adding it requires settings UI for
  multi-image input, which is its own design exercise.

## References

- Authoritative spec: [fal.ai vidu q3 ref2v mix API](https://fal.ai/models/fal-ai/vidu/q3/reference-to-video/mix/api)
- Sibling model entry: `vidu_q3_i2v` — see `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts:546-571` and `electron/native-pipeline/registry-data/image-to-video.ts` (vidu_q3 entries)
- Step-executor pattern reference: Seedance 260128 ref2v / FAL Seedance 2.0 ref2v branches in `electron/native-pipeline/execution/step-executors.ts:executeImageToVideo`
