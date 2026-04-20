# 04 — GMI model picker

Which GMI model to pick for which step, with observed pricing + caveats
from this session's live testing.

## LLM models (for script extraction + character analysis)

| Alias | Endpoint | Pricing (per 1K tok in/out) | Notes |
|---|---|---|---|
| `gemini-3.1-flash-lite` | `gmi/google/gemini-3.1-flash-lite-preview` | $0.00005 / $0.0002 | **Cheapest, used in this guide.** Fine for novel character extraction. |
| `gemini-3.1-pro` | `gmi/google/gemini-3.1-pro-preview` | $0.00125 / $0.005 | 25× more expensive. Use only for long-context or very large novels. |
| `glm-5.1` | `gmi/zai-org/GLM-5.1-FP8` | — | Strong Chinese reasoning. Needs separate GMI Cloud activation per the integration doc. |
| `gpt-5.4` | `gmi/openai/gpt-5.4` | $0.005 / $0.015 | General purpose. Expensive. Also needs activation. |

Set via `--llm-model <alias>`. The adapter routes through the `gmi-llm`
provider automatically.

## Image models (for storyboard + character portraits)

| Key | Endpoint | Cost per image | When to use |
|---|---|---|---|
| `gmi_gemini_31_flash_image` | `gemini-3.1-flash-image-preview` | $0.02 | **Default cheap choice.** 768×1376 / 1376×768 portraits. Fast, photorealistic, anime-capable. |
| `gmi_gemini_3_pro_image` | `gemini-3-pro-image-preview` | $0.04 | 2× cost, slightly better coherence. |
| `gmi_seedream_4` | `seedream-4.0` | $0.02 | Alternative if Gemini is saturated. |
| `gmi_seedream_5_lite` | `seedream-5.0-lite` | $0.003 | Cheapest. Try first if budget is tight. |

Set via `--image-model <key>`.

## Video models (image-to-video)

| Key | Endpoint | Valid durations (s) | Pricing | Upstream | Verdict from this session |
|---|---|---|---|---|---|
| `gmi_kling_v3_omni_i2v` | `kling-v3-omni` | 3, 5, 8, 10, 15 | `{std: 0.084, std_sound: 0.112, pro: 0.112, pro_sound: 0.14}` per-second | Kling via GMI | ✅ **Recommended.** All 5 shots succeeded first try, zero retries, produced clean 5s MP4s. |
| `gmi_kling_v3_i2v` | `kling-v3-image-to-video` | 3, 5, 8, 10, 15 | `{no_sound: 0.168, with_sound: 0.252}` flat | Kling via GMI | ⚠️ Hit 500 "context deadline exceeded" twice in a row on identical payloads. Retry logic helps. Avoid unless you specifically need the flat-rate pricing. |
| `gmi_skyreels_v4_i2v` | `skyreels-v4-image-to-video` | 3, 5, 8, 10, 15 | `{per_second: 0.14}` | SkyReels | 💸 Expensive ($3.50 for a 5×5s run) but supports 15s clips without concatenation. Untested this session. |
| `gmi_veo31_lite_i2v` | `veo-3.1-lite-generate-001` | 4, 6, 8 | `{720p: 0.03, 1080p: 0.05, 720p_audio: 0.05, 1080p_audio: 0.08}` flat | Google Veo | ❌ **Blocked by Google's safety filter** on anime/drama prompts in this session. Error includes `Support codes: 58061214`. Works for benign English prompts. |

Set via `--video-model <key>`.

## Credit pricing for the editor UI

Logged-in users spend QCut credits instead of paying GMI directly. The
renderer computes the deduction from `estimateCreditCost(modelKey,
{ durationSeconds })` in
`apps/web/src/lib/credit-costs.ts`. At 1 credit ≈ $0.10 and using the
worst-case tier per model (so there are no surprise bills on audio /
1080p runs):

| modelKey                           | Credits / s | Example — 5s clip |
| ---------------------------------- | ----------- | ----------------- |
| `gmi_seedance_2_0_260128_t2v`      | 0.52        | 2.60              |
| `gmi_veo31_lite_t2v`               | 0.80        | 4.00              |
| `gmi_skyreels_v4_t2v`              | 1.40        | 7.00              |
| `gmi_kling_v3_t2v`                 | 1.68        | 8.40              |
| `gmi_kling_v3_omni_t2v`            | 1.40        | 7.00              |
| `runway_gen45_t2v`                 | 5.00        | 25.00             |
| `runway_gen4_turbo_t2v`            | 2.50        | 12.50             |

Failed / cancelled / timed-out jobs are refunded automatically via
`POST /api/ai/refund` on the license server
(`packages/license-server/src/routes/ai-proxy.ts`). The refund is
capped at the total amount deducted for the same user + model in the
last 24 hours minus any prior refunds.

Offline / self-hosted / CLI users with `VITE_GMI_API_KEY` set bypass
credits entirely — they pay GMI Cloud directly on their own account.

## Authentication for the editor UI

All GMI text/image-to-video models work out of the box for logged-in QCut
users — the renderer's `gmi-client` falls back to the license-server
relay when no local `VITE_GMI_API_KEY` is set (implementation in
`apps/web/src/lib/ai-clients/gmi-client.ts` and the shared relay helpers
at `apps/web/src/lib/ai-video/core/license-relay.ts`).

Offline / self-hosted / CLI use still requires `VITE_GMI_API_KEY` in the
environment or Electron secure storage — the relay only activates when a
session token is present.

## Payload-shape differences (handled automatically)

The vimax `VideoGeneratorAdapter` sends provider-specific payloads via
`buildImageField()` (`video-adapter.ts`, commit `f84b418df`):

| Provider | Field name | Local file handling |
|---|---|---|
| FAL | `image_url` | Converts to `data:image/png;base64,…` data URI |
| GMI | `image` | Raw base64 string (no `data:…` prefix) |

URLs (`http://` / `https://`) and existing data URIs pass through
untouched for either provider.

## Retry policy (same for all video models)

`callVideoApiWithRetry()` wraps every video call:

- 3 attempts max
- Backoff: 5s → 15s → (cap 60s)
- Retry on: 5xx, timeouts, network errors
- Skip retry on: 4xx client errors, content-policy rejections

Observation from this session: Kling omni succeeded first try × 5
shots; the only retries that ever fired in testing were against the
non-omni `gmi_kling_v3_i2v` when upstream Kling was overloaded.

## "5s vs 5 shots" cost calculation caveat

Registry `pricing` objects are read by `extractCostPerSecond()` which
takes the minimum numeric value and multiplies by `duration`. That's
correct for Kling omni (`std: 0.084` really is per-second) but it
**underestimates** Kling v3 i2v where `no_sound: 0.168` is a flat
per-call rate, not per-second.

If you're precision-budgeting, always multiply the registry's min value
by your shot's `duration_seconds` AND verify with your GMI billing
dashboard after a single-shot test.

## Model selection flowchart

```
Script has Japanese/Chinese drama content?
├─ Yes → gmi_kling_v3_omni_i2v (Kling's safety model is lenient)
└─ No
    └─ Budget-critical?
        ├─ Yes → gmi_veo31_lite_i2v at 720p ($0.03/clip, 6s fixed)
        └─ No
            └─ Long clips needed?
                ├─ 15s+ → gmi_kling_v3_omni_i2v or gmi_skyreels_v4_i2v
                └─ ≤8s  → gmi_veo31_lite_i2v or gmi_kling_v3_omni_i2v
```

## Checking live model availability

```bash
qcut system models --category image_to_video --json \
  | jq '.data | map(select(.providerBackend == "gmi"))
               | map({key, name, endpoint, durations: .durationOptions})'
```

Returns the current registry snapshot. The registry is populated in
`electron/native-pipeline/registry-data/image-to-video.ts` — that's
where to add new GMI video endpoints when GMI ships them.
