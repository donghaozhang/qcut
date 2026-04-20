# AI Model Catalogue

**Source of truth for every model QCut's renderer can dispatch, its provider, its raw price, and its QCut credit cost.**

- Generated: 2026-04-20 (branch `credit-system`).
- Covers the renderer registry at
  `apps/web/src/components/editor/media-panel/views/ai/constants/`
  (text2video / image2video / image / avatar / speech / upscale / edit)
  cross-referenced with
  `apps/web/src/lib/credit-costs.ts`.
- Companion file: [`models.csv`](./models.csv) — same data, flat, one row per model.

> **1 credit ≈ US$0.10.** The renderer estimates credits via
> `estimateCreditCost(modelKey, { durationSeconds?, characterCount?, minutes? })`.
> When `modelKey` is missing from the cost tables, the estimate falls back to
> `1 credit` by default — those rows are flagged `— (fallback)` in the
> `credits` column below.
>
> **⚠️ Key-mismatch caveat:** some entries in `credit-costs.ts` use a
> **hyphenated display-style key** (e.g. `kling-v3-pro-i2v`) rather than
> the **underscored `modelKey`** the registry actually emits (e.g.
> `kling_v3_pro_i2v`). Those entries are **dead** at runtime today — they
> never match and the model falls back to the 1-credit default. They're
> marked `✗ key-mismatch` in the tables and called out in the gap list
> at the bottom.

---

## Text-to-Video (27)

| modelKey | Name | Provider | Price (raw) | Credits | Unit |
| --- | --- | --- | --- | --- | --- |
| `sora2_text_to_video` | Sora 2 Text-to-Video | OpenAI | $0.10/s | — (fallback) | — |
| `sora2_text_to_video_pro` | Sora 2 Text-to-Video Pro | OpenAI | $0.30–0.50 | — (fallback) | — |
| `kling_v3_pro_t2v` | Kling v3 Pro T2V | Kling AI | $0.336 | — (fallback) | — |
| `kling_v3_standard_t2v` | Kling v3 Standard T2V | Kling AI | $0.252 | — (fallback) | — |
| `kling_v26_pro_t2v` | Kling v2.6 Pro T2V | Kling AI | $0.70 | — (fallback) | — ✗ key-mismatch (`kling-v2.6-pro` exists but uses hyphens) |
| `wan_26_t2v` | WAN v2.6 T2V | WAN AI | $0.75 | — (fallback) | — ✗ key-mismatch (`wan-v2.6-1080p` exists but uses hyphens) |
| `ltxv2_pro_t2v` | LTX Video 2.0 Pro T2V | Lightricks | $0.06/s | — (fallback) | — |
| `ltxv2_fast_t2v` | LTX Video 2.0 Fast T2V | Lightricks | $0.04–0.16/s | — (fallback) | — ✗ key-mismatch (`ltxv2-fast-1080p` exists) |
| `ltx23_pro_t2v` | LTX Video 2.3 Pro T2V | Lightricks | $0.06–0.24/s | — (fallback) | — ✗ key-mismatch (`ltx23-pro-1080p` exists) |
| `ltx23_fast_t2v` | LTX Video 2.3 Fast T2V | Lightricks | $0.04–0.16/s | — (fallback) | — ✗ key-mismatch (`ltx23-fast-1080p` exists) |
| `veo31_fast_text_to_video` | Veo 3.1 Fast T2V | Google | $1.20 | — (fallback) | — ✗ key-mismatch (`veo-3-fast` exists) |
| `veo31_text_to_video` | Veo 3.1 T2V | Google | $3.20 | — (fallback) | — ✗ key-mismatch (`veo-3` exists) |
| `veo31_lite_text_to_video` | Veo 3.1 Lite T2V | Google | $0.05–0.08/s | — (fallback) | — |
| `hailuo23_standard_t2v` | Hailuo 2.3 Standard T2V | MiniMax | $0.28–0.56 | — (fallback) | — |
| `hailuo23_pro_t2v` | Hailuo 2.3 Pro T2V | MiniMax | $0.49 | — (fallback) | — |
| `seedance` | Seedance v1 Lite | ByteDance | $0.18 | — (fallback) | — |
| `seedance_pro` | Seedance v1 Pro | ByteDance | $0.62 | — (fallback) | — |
| `seedance2` | Seedance 2.0 | ByteDance | $0.30 | — (fallback) | — |
| `wan_25_preview` | WAN v2.5 Preview | WAN AI | $0.12 | — (fallback) | — |
| `kling_v2_5_turbo` | Kling v2.5 Turbo Pro | Kling AI | $0.18 | — (fallback) | — |
| `kling_v2_5_turbo_standard` | Kling v2.5 Turbo Standard | Kling AI | $0.10 | — (fallback) | — |
| `vidu_q3_t2v` | Vidu Q3 T2V | Vidu | $0.07–0.154/s | — (fallback) | — |
| `gmi_veo31_lite_t2v` | Veo 3.1 Lite (GMI) | Google | $0.03–0.08/s | **0.80** | per second |
| `gmi_skyreels_v4_t2v` | SkyReels V4 T2V (GMI) | SkyReels | $0.14/s | **1.40** | per second |
| `gmi_kling_v3_t2v` | Kling V3 T2V (GMI) | Kling AI | $0.168/s | **1.68** | per second |
| `gmi_kling_v3_omni_t2v` | Kling V3 Omni (GMI) | Kling AI | $0.084–0.14/s | **1.40** | per second |
| `gmi_seedance_2_0_260128_t2v` | Seedance 2.0 260128 (GMI) | ByteDance | $0.052/s | **0.52** | per second |
| `runway_gen45_t2v` | Runway Gen4.5 T2V | Runway | $0.50/s | **5.00** | per second |
| `runway_gen4_turbo_t2v` | Runway Gen4 Turbo T2V | Runway | $0.25/s | **2.50** | per second |

## Image-to-Video (38)

| modelKey | Name | Provider | Price (raw) | Credits | Unit |
| --- | --- | --- | --- | --- | --- |
| `sora2_image_to_video` | Sora 2 I2V | OpenAI | $0.10/s | — (fallback) | — |
| `sora2_image_to_video_pro` | Sora 2 I2V Pro | OpenAI | $0.30–0.50 | — (fallback) | — |
| `kling_v3_pro_i2v` | Kling v3 Pro I2V | Kling AI | $0.336 | — (fallback) | — ✗ key-mismatch (`kling-v3-pro-i2v` exists) |
| `kling_v3_standard_i2v` | Kling v3 Standard I2V | Kling AI | $0.252 | — (fallback) | — ✗ key-mismatch (`kling-v3-std-i2v` exists) |
| `kling_v26_pro_i2v` | Kling v2.6 Pro I2V | Kling AI | $0.70 | — (fallback) | — |
| `ltxv2_i2v` | LTX Video 2.0 I2V | Lightricks | $0.36 | — (fallback) | — |
| `ltxv2_fast_i2v` | LTX Video 2.0 Fast I2V | Lightricks | $0.04–0.16 | — (fallback) | — |
| `ltx23_fast_i2v` | LTX Video 2.3 Fast I2V | Lightricks | $0.04–0.16 | — (fallback) | — |
| `seedance_pro_fast_i2v` | Seedance v1 Pro Fast I2V | ByteDance | $0.24 | — (fallback) | — |
| `seedance_pro_i2v` | Seedance v1 Pro I2V | ByteDance | $0.62 | — (fallback) | — |
| `seedance2_i2v` | Seedance 2.0 I2V | ByteDance | $0.50 | — (fallback) | — |
| `seedance2_ref2v` | Seedance 2.0 Ref2V | ByteDance | $0.60 | — (fallback) | — |
| `kling_v2_5_turbo_i2v` | Kling v2.5 Turbo Pro I2V | Kling AI | $0.35 | — (fallback) | — |
| `wan_25_preview_i2v` | WAN v2.5 Preview I2V | WAN AI | $0.05–0.15/s | — (fallback) | — |
| `wan_26_i2v` | WAN v2.6 I2V | WAN AI | $0.10–0.15/s | — (fallback) | — |
| `veo31_fast_image_to_video` | Veo 3.1 Fast I2V | Google | $1.20 | — (fallback) | — |
| `veo31_fast_frame_to_video` | Veo 3.1 Fast Frame-to-Video | Google | $1.20 | — (fallback) | — |
| `veo31_image_to_video` | Veo 3.1 I2V | Google | $3.20 | — (fallback) | — |
| `veo31_frame_to_video` | Veo 3.1 Frame-to-Video | Google | $3.20 | — (fallback) | — |
| `hailuo23_standard` | Hailuo 2.3 Standard | MiniMax | $0.28–0.56 | — (fallback) | — |
| `hailuo23_fast_pro` | Hailuo 2.3 Fast Pro | MiniMax | $0.33 | — (fallback) | — |
| `hailuo23_pro` | Hailuo 2.3 Pro | MiniMax | $0.49 | — (fallback) | — |
| `vidu_q2_turbo_i2v` | Vidu Q2 Turbo I2V | Vidu | $0.05 | — (fallback) | — |
| `kling_o1_i2v` | Kling O1 I2V | Kling AI | $0.112 | — (fallback) | — |
| `vidu_q3_i2v` | Vidu Q3 I2V | Vidu | $0.07–0.154/s | — (fallback) | — |
| `veo31_lite_image_to_video` | Veo 3.1 Lite I2V | Google | $0.05–0.08/s | — (fallback) | — |
| `veo31_lite_frame_to_video` | Veo 3.1 Lite Frame-to-Video | Google | $0.05–0.08/s | — (fallback) | — |
| `pixverse_v6_i2v` | PixVerse v6 | PixVerse | $0.025–0.09/s | — (fallback) | — |
| `gmi_veo31_lite_i2v` | Veo 3.1 Lite I2V (GMI) | Google | $0.03–0.08/s | — (fallback) | — ⚠ not yet in costs table |
| `gmi_skyreels_v4_i2v` | SkyReels V4 I2V (GMI) | SkyReels | $0.14/s | — (fallback) | — ⚠ not yet in costs table |
| `gmi_kling_v3_i2v` | Kling V3 I2V (GMI) | Kling AI | $0.168/s | — (fallback) | — ⚠ not yet in costs table |
| `gmi_kling_v3_omni_i2v` | Kling V3 Omni I2V (GMI) | Kling AI | $0.084–0.14/s | — (fallback) | — ⚠ not yet in costs table |
| `gmi_kling_motion_control` | Kling 3 Motion Control (GMI) | Kling AI | $0.126–0.168/s | — (fallback) | — ⚠ not yet in costs table |
| `gmi_seedance_2_0_260128_i2v` | Seedance 2.0 260128 I2V (GMI) | ByteDance | $0.052/s | — (fallback) | — ⚠ not yet in costs table |
| `gmi_seedance_2_0_260128_ref2v` | Seedance 2.0 260128 Ref2V (GMI) | ByteDance | $0.052/s | — (fallback) | — ⚠ not yet in costs table |
| `runway_gen45_i2v` | Runway Gen4.5 I2V | Runway | $0.50/s | — (fallback) | — ⚠ not yet in costs table |
| `runway_gen4_turbo_i2v` | Runway Gen4 Turbo I2V | Runway | $0.25/s | — (fallback) | — ⚠ not yet in costs table |
| `runway_gen3a_turbo_i2v` | Runway Gen3a Turbo I2V | Runway | $0.10/s | — (fallback) | — ⚠ not yet in costs table |

## Text-to-Image (19)

| modelKey | Name | Provider | Price (raw) | Credits | Unit |
| --- | --- | --- | --- | --- | --- |
| `flux-pro-v11-ultra` | FLUX Pro v1.1 Ultra | Black Forest Labs | $0.05–0.09 | — (fallback) | — |
| `flux-2-flex` | FLUX 2 Flex | Black Forest Labs | $0.06/MP | — (fallback) | — |
| `imagen4-ultra` | Imagen4 Ultra | Google | $0.08–0.12 | — (fallback) | — ✗ key-mismatch (`imagen-4` exists → 0.4) |
| `nano-banana` | Nano Banana | Google | $0.039 | — (fallback) | — |
| `gemini-3-pro` | Gemini 3 Pro | Google | $0.15–0.30 | — (fallback) | — |
| `seeddream-v3` | SeedDream v3 | ByteDance | $0.03–0.06 | — (fallback) | — ✗ key-mismatch (`seedream-v3` exists → 0.2) |
| `seeddream-v4` | SeedDream v4 | ByteDance | $0.04–0.08 | — (fallback) | — |
| `seeddream-v4-5` | SeedDream v4.5 | ByteDance | $0.04–0.08 | — (fallback) | — |
| `seeddream-v4-5-edit` | SeedDream v4.5 Edit | ByteDance | $0.04–0.08 | — (fallback) | — |
| `wan-v2-2` | WAN v2.2 | fal.ai | $0.06–0.10 | — (fallback) | — |
| `qwen-image` | Qwen Image | Alibaba | $0.04–0.08 | — (fallback) | — |
| `reve-text-to-image` | Reve T2I | fal.ai | $0.04 | — (fallback) | — ✗ key-mismatch (`reve-t2i` exists → 0.5) |
| `z-image-turbo` | Z-Image Turbo | Tongyi-MAI | $0.03–0.05 | — (fallback) | — |
| `phota` | Phota | Photalabs | $0.05 | — (fallback) | — |
| `gpt-image-1-5` | GPT Image 1.5 | OpenAI | $0.04–0.08 | — (fallback) | — |
| `wan-v2-7-t2i` | Wan 2.7 T2I | WAN AI | $0.04–0.06 | — (fallback) | — |
| `wan-v2-7-pro-t2i` | Wan 2.7 Pro T2I | WAN AI | $0.06–0.10 | — (fallback) | — |
| `wan-v2-7-edit` | Wan 2.7 Edit | WAN AI | $0.04–0.06 | — (fallback) | — |
| `wan-v2-7-pro-edit` | Wan 2.7 Pro Edit | WAN AI | $0.06–0.10 | — (fallback) | — |

## Avatar / Lipsync / Video Transformation (15)

| modelKey | Name | Provider | Price (raw) | Credits | Unit |
| --- | --- | --- | --- | --- | --- |
| `wan_26_ref2v` | WAN v2.6 Ref2V | WAN AI | $0.10–0.15/s | — (fallback) | — |
| `wan_animate_replace` | WAN Animate/Replace | WAN AI | $0.075 | — (fallback) | — |
| `kling_avatar_v2_standard` | Kling Avatar v2 Standard | Kling AI | $0.0562 | — (fallback) | — ✗ key-mismatch (`kling-avatar-v2-std` exists → 0.6) |
| `kling_avatar_v2_pro` | Kling Avatar v2 Pro | Kling AI | $0.115 | — (fallback) | — ✗ key-mismatch (`kling-avatar-v2-pro` exists → 1.0) |
| `sync_lipsync_react1` | Sync Lipsync React-1 | Sync Labs | $0.10 | — (fallback) | — |
| `kling_o1_v2v_reference` | Kling O1 Video Reference | Kling AI | $0.112 | — (fallback) | — |
| `kling_o1_v2v_edit` | Kling O1 Video Edit | Kling AI | $0.168 | — (fallback) | — |
| `kling_o1_ref2video` | Kling O1 Reference-to-Video | Kling AI | $0.112 | — (fallback) | — |
| `grok_imagine_r2v` | Grok Imagine Ref-to-Video | xAI | $0.30 | — (fallback) | — |
| `bytedance_omnihuman_v1_5` | ByteDance OmniHuman v1.5 | ByteDance | $0.20 | — (fallback) | — ✗ key-mismatch (`omnihuman-v1.5` exists → 1.6/s) |
| `veo31_fast_extend_video` | Veo 3.1 Fast Extend | Google | $0.15/s | — (fallback) | — |
| `veo31_extend_video` | Veo 3.1 Extend | Google | $0.40/s | — (fallback) | — |
| `kling_avatar_pro` | Kling Avatar Pro | Kling AI | $0.25 | — (fallback) | — |
| `kling_avatar_standard` | Kling Avatar Standard | Kling AI | $0.15 | — (fallback) | — |
| `sora2_video_to_video_remix` | Sora 2 V2V Remix | OpenAI | $0.00 | — (fallback) | — |

## Speech / Audio (8)

| modelKey | Name | Provider | Price (raw) | Credits | Unit |
| --- | --- | --- | --- | --- | --- |
| `chatterbox_tts` | Chatterbox TTS | fal.ai | $0.025/1k chars | — (fallback) | — |
| `chatterbox_tts_turbo` | Chatterbox TTS Turbo | fal.ai | TBD | — (fallback) | — |
| `chatterbox_s2s` | Chatterbox Voice Convert | fal.ai | TBD | — (fallback) | — |
| `elevenlabs_v3` | ElevenLabs v3 | ElevenLabs | TBD | — (fallback) | — |
| `qwen3_tts` | Qwen3 TTS | Alibaba | TBD | — (fallback) | — |
| `qwen3_clone_voice` | Qwen3 Voice Clone | Alibaba | TBD | — (fallback) | — |
| `elevenlabs-tts` | ElevenLabs TTS | ElevenLabs | — | **0.001** | per character |
| `elevenlabs-scribe` | ElevenLabs Scribe | ElevenLabs | — | **0.10** | per minute |

## Upscale (5)

| modelKey | Name | Provider | Price (raw) | Credits | Unit |
| --- | --- | --- | --- | --- | --- |
| `crystal-upscaler` | Crystal Upscaler | fal.ai | $0.02/image | — (fallback) | — |
| `seedvr-upscale` | SeedVR Upscale | SeedVR Labs | $0.05/image | — (fallback) | — |
| `topaz-upscale` | Topaz Upscale | Topaz Labs | $0.10/image | — (fallback) | — |
| `bytedance-upscaler` | ByteDance Upscaler | ByteDance | — | **0.50** | per video |
| `flashvsr` | FlashVSR | fal.ai | — | **0.30** | per video |

## Image Edit (3)

| modelKey | Name | Provider | Price (raw) | Credits | Unit |
| --- | --- | --- | --- | --- | --- |
| `flux-kontext` | FLUX Kontext | Black Forest Labs | — | **0.30** | per image |
| `luma-photon` | Luma Photon | Luma | — | **0.20** | per image |
| `reve-t2i` | Reve T2I | fal.ai | — | **0.50** | per image |

## GMI Cloud LLM / Utility (5)

| modelKey | Name | Provider | Price (raw) | Credits | Unit |
| --- | --- | --- | --- | --- | --- |
| `openrouter-prompt` | Prompt Generation | OpenRouter | — | **0.10** | per request |
| `gemini-describe` | Gemini Describe | Google | — | **0.10** | per request |
| `gmi-glm-5.1` | GLM 5.1 | GMI Cloud | — | **0.10** | per request |
| `gmi-gemini-3.1-pro` | Gemini 3.1 Pro | GMI Cloud | — | **0.20** | per request |
| `gmi-gpt-5.4` | GPT-5.4 | GMI Cloud | — | **0.30** | per request |

---

## Coverage summary

| Category | Total models | **Priced** in credit-costs | Falls back to 1-credit default |
| --- | ---: | ---: | ---: |
| Text-to-Video | 29 | 7 | 22 |
| Image-to-Video | 38 | 0 | 38 |
| Text-to-Image | 19 | 0 | 19 |
| Avatar / Lipsync | 15 | 0 | 15 |
| Speech / Audio | 8 | 2 | 6 |
| Upscale | 5 | 2 | 3 |
| Image Edit | 3 | 3 | 0 |
| LLM / Utility | 5 | 5 | 0 |
| **Total** | **122** | **19** | **103** |

## Known key-mismatch bugs (dead entries in `credit-costs.ts`)

These exist in the cost table but **never match at runtime** because
the registry's `modelKey` uses underscores while the cost key uses
hyphens or a different shape:

| Cost-table key | Intended registry modelKey | Orphan credits |
| --- | --- | --- |
| `kling-v3-pro-i2v` | `kling_v3_pro_i2v` | 3.5 |
| `kling-v3-std-i2v` | `kling_v3_standard_i2v` | 2.5 |
| `kling-v2.6-pro` | `kling_v26_pro_t2v` | 0.7/s |
| `kling-v2.1-i2v` | no registry match (legacy) | 0.5 |
| `wan-v2.6-1080p` | `wan_26_t2v` | 1.5/s |
| `ltxv2-fast-1080p` | `ltxv2_fast_t2v` | 0.4/s |
| `ltx23-pro-1080p` | `ltx23_pro_t2v` | 0.6/s |
| `ltx23-fast-1080p` | `ltx23_fast_t2v` | 0.4/s |
| `veo-3` | `veo31_text_to_video` | 5/s |
| `veo-3-fast` | `veo31_fast_text_to_video` | 3/s |
| `sora-2` | `sora2_text_to_video` / `sora2_image_to_video` | 1/s |
| `omnihuman-v1.5` | `bytedance_omnihuman_v1_5` | 1.6/s |
| `veed-fabric-1.0` | no registry match yet | 1/s |
| `minimax-hailuo-02` | `hailuo23_standard` | 0.5 |
| `minimax-hailuo-02-pro` | `hailuo23_pro` | 1 |
| `kling-avatar-v2-std` | `kling_avatar_v2_standard` | 0.6 |
| `kling-avatar-v2-pro` | `kling_avatar_v2_pro` | 1 |
| `imagen-4` | `imagen4-ultra` | 0.4 |
| `seedream-v3` | `seeddream-v3` | 0.2 |
| `reve-t2i` | `reve-text-to-image` | 0.5 |
| `flux-schnell` | no registry match yet | 0.1 |
| `flux-dev` | no registry match yet | 0.3 |

Fixing this is a single PR: either rename the cost keys to match the
registry `modelKey`s, or add a canonicalizer inside
`estimateCreditCost`. Tracked separately from the GMI/Runway relay
rollout.

## How this catalogue is generated

Not auto-generated today — this file is the **authoritative handoff**
from reading the source registries. Update it whenever a model is
added / renamed / repriced. Long-term candidate for a
`scripts/generate-model-catalogue.ts` that diffs registry vs
credit-costs at build time and fails CI when a new model ships
unpriced (see `docs/task/gmi-video-cli-guide/10-credit-deduction-relay.md`
for the surrounding credit system).
