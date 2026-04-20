# AI Model Catalogue

**Source of truth for every model QCut's renderer can dispatch, its provider, its raw price, and its QCut credit cost.**

- Generated: 2026-04-20 (branch `credit-system`).
- Policy: **1 credit ≈ $0.01.** Credits are computed at runtime from each
  model's registry `price` string by `estimateCreditCost(modelKey, params)`
  at `apps/web/src/lib/credit-costs.ts`. Range prices use the **upper
  bound** so premium tiers never under-bill.
- This table is a handoff snapshot; the runtime source of truth is
  `AI_MODELS` in
  `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts`.
- Companion: [`models.csv`](./models.csv) — same data as flat rows.

> **Math reminder.** For per-second models a 5s clip costs
> `round(amountUsd × 5 × 100)` credits, and for per-1k-chars a prompt
> of 2000 characters costs `round(amountUsd × 2000 / 1000 × 100)`.
> `Math.round(…)` with a floor of 1 credit — the code rounds the **total**,
> not the per-unit rate, so pricing is accurate for fractional durations.

---

## Text-to-Video (29)

| modelKey | Name | Provider | Price (raw) | Upper USD | Credits / s | Credits @ 5s |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `sora2_text_to_video` | Sora 2 | OpenAI | $0.10/s | 0.10 | 10 | 50 |
| `sora2_text_to_video_pro` | Sora 2 Pro | OpenAI | $0.30–0.50/s | 0.50 | 50 | 250 |
| `kling_v3_pro_t2v` | Kling v3 Pro | Kling AI | $0.336/s | 0.336 | 33.6 | 168 |
| `kling_v3_standard_t2v` | Kling v3 Standard | Kling AI | $0.252/s | 0.252 | 25.2 | 126 |
| `kling_v26_pro_t2v` | Kling v2.6 Pro | Kling AI | $0.70/s | 0.70 | 70 | 350 |
| `wan_26_t2v` | WAN v2.6 | WAN AI | $0.75/s | 0.75 | 75 | 375 |
| `ltxv2_pro_t2v` | LTX V2 Pro | Lightricks | $0.06/s | 0.06 | 6 | 30 |
| `ltxv2_fast_t2v` | LTX V2 Fast | Lightricks | $0.04–0.16/s | 0.16 | 16 | 80 |
| `ltx23_pro_t2v` | LTX 2.3 Pro | Lightricks | $0.06–0.24/s | 0.24 | 24 | 120 |
| `ltx23_fast_t2v` | LTX 2.3 Fast | Lightricks | $0.04–0.16/s | 0.16 | 16 | 80 |
| `veo31_fast_text_to_video` | Veo 3.1 Fast | Google | $1.20/s | 1.20 | 120 | 600 |
| `veo31_text_to_video` | Veo 3.1 | Google | $3.20/s | 3.20 | 320 | 1600 |
| `veo31_lite_text_to_video` | Veo 3.1 Lite | Google | $0.05–0.08/s | 0.08 | 8 | 40 |
| `hailuo23_standard_t2v` | Hailuo 2.3 Standard | MiniMax | $0.28–0.56/s | 0.56 | 56 | 280 |
| `hailuo23_pro_t2v` | Hailuo 2.3 Pro | MiniMax | $0.49/s | 0.49 | 49 | 245 |
| `seedance` | Seedance v1 Lite | ByteDance | $0.18/s | 0.18 | 18 | 90 |
| `seedance_pro` | Seedance v1 Pro | ByteDance | $0.62/s | 0.62 | 62 | 310 |
| `seedance2` | Seedance 2.0 | ByteDance | $0.30/s | 0.30 | 30 | 150 |
| `wan_25_preview` | WAN v2.5 Preview | WAN AI | $0.12/s | 0.12 | 12 | 60 |
| `kling_v2_5_turbo` | Kling v2.5 Turbo Pro | Kling AI | $0.18/s | 0.18 | 18 | 90 |
| `kling_v2_5_turbo_standard` | Kling v2.5 Turbo Std | Kling AI | $0.10/s | 0.10 | 10 | 50 |
| `vidu_q3_t2v` | Vidu Q3 | Vidu | $0.07–0.154/s | 0.154 | 15.4 | 77 |
| `gmi_veo31_lite_t2v` | Veo 3.1 Lite (GMI) | Google | $0.03–0.08/s | 0.08 | 8 | 40 |
| `gmi_skyreels_v4_t2v` | SkyReels V4 (GMI) | SkyReels | $0.14/s | 0.14 | 14 | 70 |
| `gmi_kling_v3_t2v` | Kling V3 (GMI) | Kling AI | $0.168/s | 0.168 | 16.8 | 84 |
| `gmi_kling_v3_omni_t2v` | Kling V3 Omni (GMI) | Kling AI | $0.084–0.14/s | 0.14 | 14 | 70 |
| `gmi_seedance_2_0_260128_t2v` | Seedance 2.0 260128 (GMI) | ByteDance | $0.052/s | 0.052 | 5.2 | 26 |
| `runway_gen45_t2v` | Runway Gen4.5 | Runway | $0.50/s | 0.50 | 50 | 250 |
| `runway_gen4_turbo_t2v` | Runway Gen4 Turbo | Runway | $0.25/s | 0.25 | 25 | 125 |

## Image-to-Video (38)

| modelKey | Name | Provider | Price (raw) | Upper USD | Credits / s | Credits @ 5s |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `sora2_image_to_video` | Sora 2 I2V | OpenAI | $0.10/s | 0.10 | 10 | 50 |
| `sora2_image_to_video_pro` | Sora 2 I2V Pro | OpenAI | $0.30–0.50/s | 0.50 | 50 | 250 |
| `kling_v3_pro_i2v` | Kling v3 Pro I2V | Kling AI | $0.336/s | 0.336 | 33.6 | 168 |
| `kling_v3_standard_i2v` | Kling v3 Std I2V | Kling AI | $0.252/s | 0.252 | 25.2 | 126 |
| `kling_v26_pro_i2v` | Kling v2.6 Pro I2V | Kling AI | $0.70/s | 0.70 | 70 | 350 |
| `ltxv2_i2v` | LTX V2 I2V | Lightricks | $0.36/s | 0.36 | 36 | 180 |
| `ltxv2_fast_i2v` | LTX V2 Fast I2V | Lightricks | $0.04–0.16/s | 0.16 | 16 | 80 |
| `ltx23_fast_i2v` | LTX 2.3 Fast I2V | Lightricks | $0.04–0.16/s | 0.16 | 16 | 80 |
| `seedance_pro_fast_i2v` | Seedance v1 Pro Fast | ByteDance | $0.24/s | 0.24 | 24 | 120 |
| `seedance_pro_i2v` | Seedance v1 Pro I2V | ByteDance | $0.62/s | 0.62 | 62 | 310 |
| `seedance2_i2v` | Seedance 2.0 I2V | ByteDance | $0.50/s | 0.50 | 50 | 250 |
| `seedance2_ref2v` | Seedance 2.0 Ref2V | ByteDance | $0.60/s | 0.60 | 60 | 300 |
| `kling_v2_5_turbo_i2v` | Kling v2.5 Turbo Pro I2V | Kling AI | $0.35/s | 0.35 | 35 | 175 |
| `wan_25_preview_i2v` | WAN v2.5 Preview I2V | WAN AI | $0.05–0.15/s | 0.15 | 15 | 75 |
| `wan_26_i2v` | WAN v2.6 I2V | WAN AI | $0.10–0.15/s | 0.15 | 15 | 75 |
| `veo31_fast_image_to_video` | Veo 3.1 Fast I2V | Google | $1.20/s | 1.20 | 120 | 600 |
| `veo31_fast_frame_to_video` | Veo 3.1 Fast Frame-to-Video | Google | $1.20/s | 1.20 | 120 | 600 |
| `veo31_image_to_video` | Veo 3.1 I2V | Google | $3.20/s | 3.20 | 320 | 1600 |
| `veo31_frame_to_video` | Veo 3.1 Frame-to-Video | Google | $3.20/s | 3.20 | 320 | 1600 |
| `hailuo23_standard` | Hailuo 2.3 Standard | MiniMax | $0.28–0.56/s | 0.56 | 56 | 280 |
| `hailuo23_fast_pro` | Hailuo 2.3 Fast Pro | MiniMax | $0.33/s | 0.33 | 33 | 165 |
| `hailuo23_pro` | Hailuo 2.3 Pro | MiniMax | $0.49/s | 0.49 | 49 | 245 |
| `vidu_q2_turbo_i2v` | Vidu Q2 Turbo I2V | Vidu | $0.05/s | 0.05 | 5 | 25 |
| `kling_o1_i2v` | Kling O1 I2V | Kling AI | $0.112/s | 0.112 | 11.2 | 56 |
| `vidu_q3_i2v` | Vidu Q3 I2V | Vidu | $0.07–0.154/s | 0.154 | 15.4 | 77 |
| `veo31_lite_image_to_video` | Veo 3.1 Lite I2V | Google | $0.05–0.08/s | 0.08 | 8 | 40 |
| `veo31_lite_frame_to_video` | Veo 3.1 Lite Frame-to-Video | Google | $0.05–0.08/s | 0.08 | 8 | 40 |
| `pixverse_v6_i2v` | PixVerse v6 | PixVerse | $0.025–0.09/s | 0.09 | 9 | 45 |
| `gmi_veo31_lite_i2v` | Veo 3.1 Lite I2V (GMI) | Google | $0.03–0.08/s | 0.08 | 8 | 40 |
| `gmi_skyreels_v4_i2v` | SkyReels V4 I2V (GMI) | SkyReels | $0.14/s | 0.14 | 14 | 70 |
| `gmi_kling_v3_i2v` | Kling V3 I2V (GMI) | Kling AI | $0.168/s | 0.168 | 16.8 | 84 |
| `gmi_kling_v3_omni_i2v` | Kling V3 Omni I2V (GMI) | Kling AI | $0.084–0.14/s | 0.14 | 14 | 70 |
| `gmi_kling_motion_control` | Kling 3 Motion Control (GMI) | Kling AI | $0.126–0.168/s | 0.168 | 16.8 | 84 |
| `gmi_seedance_2_0_260128_i2v` | Seedance 2.0 260128 I2V (GMI) | ByteDance | $0.052/s | 0.052 | 5.2 | 26 |
| `gmi_seedance_2_0_260128_ref2v` | Seedance 2.0 260128 Ref2V (GMI) | ByteDance | $0.052/s | 0.052 | 5.2 | 26 |
| `runway_gen45_i2v` | Runway Gen4.5 I2V | Runway | $0.50/s | 0.50 | 50 | 250 |
| `runway_gen4_turbo_i2v` | Runway Gen4 Turbo I2V | Runway | $0.25/s | 0.25 | 25 | 125 |
| `runway_gen3a_turbo_i2v` | Runway Gen3a Turbo I2V | Runway | $0.10/s | 0.10 | 10 | 50 |

## Text-to-Image (19)

Fixed-cost per image. Credits column is the rounded integer deducted.

| modelKey | Name | Provider | Price (raw) | Upper USD | Credits |
| --- | --- | --- | --- | ---: | ---: |
| `gemini-3-pro` | Gemini 3 Pro | Google | $0.15–0.30 | 0.30 | 30 |
| `imagen4-ultra` | Imagen 4 Ultra | Google | $0.08–0.12 | 0.12 | 12 |
| `wan-v2-2` | WAN v2.2 | fal.ai | $0.06–0.10 | 0.10 | 10 |
| `wan-v2-7-pro-t2i` | Wan 2.7 Pro T2I | WAN AI | $0.06–0.10 | 0.10 | 10 |
| `wan-v2-7-pro-edit` | Wan 2.7 Pro Edit | WAN AI | $0.06–0.10 | 0.10 | 10 |
| `flux-pro-v11-ultra` | FLUX Pro v1.1 Ultra | Black Forest Labs | $0.05–0.09 | 0.09 | 9 |
| `seeddream-v4` | SeedDream v4 | ByteDance | $0.04–0.08 | 0.08 | 8 |
| `seeddream-v4-5` | SeedDream v4.5 | ByteDance | $0.04–0.08 | 0.08 | 8 |
| `seeddream-v4-5-edit` | SeedDream v4.5 Edit | ByteDance | $0.04–0.08 | 0.08 | 8 |
| `qwen-image` | Qwen Image | Alibaba | $0.04–0.08 | 0.08 | 8 |
| `gpt-image-1-5` | GPT Image 1.5 | OpenAI | $0.04–0.08 | 0.08 | 8 |
| `seeddream-v3` | SeedDream v3 | ByteDance | $0.03–0.06 | 0.06 | 6 |
| `wan-v2-7-t2i` | Wan 2.7 T2I | WAN AI | $0.04–0.06 | 0.06 | 6 |
| `wan-v2-7-edit` | Wan 2.7 Edit | WAN AI | $0.04–0.06 | 0.06 | 6 |
| `flux-2-flex` | FLUX 2 Flex | Black Forest Labs | $0.06/MP | 0.06 | 6/MP |
| `z-image-turbo` | Z-Image Turbo | Tongyi-MAI | $0.03–0.05 | 0.05 | 5 |
| `phota` | Phota | Photalabs | $0.05 | 0.05 | 5 |
| `reve-text-to-image` | Reve T2I | fal.ai | $0.04 | 0.04 | 4 |
| `nano-banana` | Nano Banana | Google | $0.039 | 0.039 | 4 |

## Avatar / Lipsync / Video Transformation (15)

| modelKey | Name | Provider | Price (raw) | Upper USD | Credits / s | Credits @ 5s |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `wan_26_ref2v` | WAN v2.6 Ref2V | WAN AI | $0.10–0.15/s | 0.15 | 15 | 75 |
| `wan_animate_replace` | WAN Animate/Replace | WAN AI | $0.075 | 0.075 | 7.5 (fixed) | 8 |
| `kling_avatar_v2_standard` | Kling Avatar v2 Std | Kling AI | $0.0562/s | 0.0562 | 5.62 | 28 |
| `kling_avatar_v2_pro` | Kling Avatar v2 Pro | Kling AI | $0.115/s | 0.115 | 11.5 | 58 |
| `sync_lipsync_react1` | Sync Lipsync React-1 | Sync Labs | $0.10/s | 0.10 | 10 | 50 |
| `kling_o1_v2v_reference` | Kling O1 Video Reference | Kling AI | $0.112/s | 0.112 | 11.2 | 56 |
| `kling_o1_v2v_edit` | Kling O1 Video Edit | Kling AI | $0.168/s | 0.168 | 16.8 | 84 |
| `kling_o1_ref2video` | Kling O1 Reference-to-Video | Kling AI | $0.112/s | 0.112 | 11.2 | 56 |
| `grok_imagine_r2v` | Grok Imagine Ref-to-Video | xAI | $0.30/s | 0.30 | 30 | 150 |
| `bytedance_omnihuman_v1_5` | ByteDance OmniHuman v1.5 | ByteDance | $0.20/s | 0.20 | 20 | 100 |
| `veo31_fast_extend_video` | Veo 3.1 Fast Extend | Google | $0.15/s | 0.15 | 15 | 75 |
| `veo31_extend_video` | Veo 3.1 Extend | Google | $0.40/s | 0.40 | 40 | 200 |
| `kling_avatar_pro` | Kling Avatar Pro | Kling AI | $0.25/s | 0.25 | 25 | 125 |
| `kling_avatar_standard` | Kling Avatar Standard | Kling AI | $0.15/s | 0.15 | 15 | 75 |
| `sora2_video_to_video_remix` | Sora 2 V2V Remix | OpenAI | $0.00 | 0.00 | 0 | 0 |

## Speech / Audio (6 + 2 overrides)

Per-1k-chars or TBD. Override entries live in `COST_OVERRIDES` at
`apps/web/src/lib/credit-costs.ts` because their keys don't live in
`AI_MODELS` yet.

| modelKey | Name | Provider | Price (raw) | Credits |
| --- | --- | --- | --- | ---: |
| `chatterbox_tts` | Chatterbox TTS | fal.ai | $0.025/1k chars | 2.5 / 1k chars |
| `chatterbox_tts_turbo` | Chatterbox TTS Turbo | fal.ai | TBD | 1 (fallback) |
| `chatterbox_s2s` | Chatterbox Voice Convert | fal.ai | TBD | 1 (fallback) |
| `elevenlabs_v3` | ElevenLabs v3 | ElevenLabs | TBD | 1 (fallback) |
| `qwen3_tts` | Qwen3 TTS | Alibaba | TBD | 1 (fallback) |
| `qwen3_clone_voice` | Qwen3 Voice Clone | Alibaba | TBD | 1 (fallback) |
| `elevenlabs-tts` (override) | ElevenLabs TTS | ElevenLabs | — | 0.1 / 1k chars |
| `elevenlabs-scribe` (override) | ElevenLabs Scribe | ElevenLabs | — | 10 fixed |

## Upscale / Enhancement (registry + overrides)

Fixed per-video pricing from `AI_MODELS` or `COST_OVERRIDES`.

| modelKey | Name | Provider | Price (raw) | Credits |
| --- | --- | --- | --- | ---: |
| `bytedance_video_upscaler` | ByteDance Upscaler | ByteDance | $0.05 | 5 |
| `flashvsr_video_upscaler` | FlashVSR | fal.ai | $0.03 | 3 |
| `topaz_video_upscale` | Topaz Video AI | Topaz Labs | $0.50 | 50 |
| `shots_cinematic_angles` | SHOTS Cinematic Angles | — | $0.40 | 40 |
| `crystal-upscaler` | Crystal Upscaler | fal.ai | $0.02 / image | 2 |
| `seedvr-upscale` | SeedVR Upscale | SeedVR Labs | $0.05 / image | 5 |
| `topaz-upscale` | Topaz Upscale | Topaz Labs | $0.10 / image | 10 |

## Utility / LLM Overrides (5)

These keys don't live in `AI_MODELS`; they're used by internal prompt
and description flows. Priced via `COST_OVERRIDES`.

| modelKey | Name | Provider | Credits |
| --- | --- | --- | ---: |
| `openrouter-prompt` | Prompt Generation | OpenRouter | 10 |
| `gemini-describe` | Gemini Describe | Google | 10 |
| `gmi-glm-5.1` | GLM 5.1 | GMI Cloud | 10 |
| `gmi-gemini-3.1-pro` | Gemini 3.1 Pro | GMI Cloud | 20 |
| `gmi-gpt-5.4` | GPT-5.4 | GMI Cloud | 30 |

---

## Coverage summary

Measured at runtime by `credit-costs-coverage.test.ts` against the live
`AI_MODELS` registry — **92 dispatchable models, 87 priced from
their registry `price` string, 1 free-tier, 5 explicit TBD**:

| Category | In `AI_MODELS` | Priced | Free ($0.00) | Fallback (`TBD`) |
| --- | ---: | ---: | ---: | ---: |
| Text-to-Video | 29 | 28 | 1 | 0 |
| Image-to-Video | 38 | 38 | 0 | 0 |
| Avatar / Lipsync | 15 | 15 | 0 | 0 |
| Speech / Audio | 6 | 1 | 0 | 5 (TBD) |
| Upscale / Enhancement | 3 | 3 | 0 | 0 |
| Angles (fixed utility) | 1 | 1 | 0 | 0 |
| **In registry** | **92** | **87** | **1** | **5** |

The five fallbacks are all provider-side `TBD`s, not bugs:
`chatterbox_tts_turbo`, `chatterbox_s2s`, `elevenlabs_v3`, `qwen3_tts`,
`qwen3_clone_voice`. They become priced automatically when the provider
publishes numbers and someone updates the registry entry.

### Not-in-registry caveat

The text-to-image, image-edit, image-upscale, utility-LLM, and
transcription-override entries listed in the category tables above
**do not currently live in `AI_MODELS`**. They're either in sibling
constants (e.g. a separate `T2I_MODELS`) or covered by `COST_OVERRIDES`
in `credit-costs.ts` — which is why the coverage test reports 92, not
121.

Practical implication: T2I generation does **not** flow through
`estimateCreditCost` today, so the T2I numbers in the category tables
above are **notional** (what the deduction would be if/when T2I gets
wired to the license-server relay). One-line fix when that happens —
add `...Object.values(T2I_MODELS)` to the `AI_MODELS` spread in
`ai-constants.ts` and all 19 get priced automatically.

## How pricing works at runtime

```
renderer → estimateCreditCost(modelKey, { durationSeconds?, characterCount?, megapixels? })
           ↓
   COST_OVERRIDES[modelKey]?       → credits    (TTS / utility LLMs only)
           ↓
   AI_MODELS.find(m.id === modelKey)?.price
           ↓
   parsePriceString(price)         → { amountUsd, unit }
           ↓
   creditsFromParsedPrice(...)     → round(amountUsd × multiplier × <unit>)
           ↓
   max(1, rounded)                 → deducted
```

- `CREDIT_USD_MULTIPLIER = 100` ← the one number to change if the
  dollar-per-credit rate ever moves.
- Source files:
  - `apps/web/src/lib/credit-costs-parser.ts` — parser + compute.
  - `apps/web/src/lib/credit-costs.ts` — `estimateCreditCost`,
    `getCreditCostInfo`, `COST_OVERRIDES`.
  - `apps/web/src/lib/__tests__/credit-costs.test.ts` — regression
    tests covering upper-bound, rounding, per-second, per-1k-chars,
    overrides, and unknown-model fallback.

## How to regenerate this catalogue

Not auto-generated today. When adding or repricing a model:

1. Update its registry entry under
   `apps/web/src/components/editor/media-panel/views/ai/constants/…`.
2. Its credit cost updates automatically — no action in `credit-costs.ts`
   unless it's a non-registry entry (TTS/utility, then edit `COST_OVERRIDES`).
3. Refresh this file by hand or, long-term, point a
   `scripts/generate-model-catalogue.ts` at `AI_MODELS` + the parser and
   dump a CSV/Markdown at build time.
