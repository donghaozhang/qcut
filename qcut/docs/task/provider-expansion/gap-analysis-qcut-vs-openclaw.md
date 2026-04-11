# QCut vs OpenClaw — Video Generation Gap Analysis (Corrected)

> **Date:** 2026-04-07
> **Purpose:** Identify provider and architecture gaps QCut should close, informed by OpenClaw's 12-provider system.

---

## Current State Summary

### QCut (3 backends, 90+ models)
| Backend | Providers Routed | Modes |
|---------|-----------------|-------|
| **FAL** | Sora 2, Kling (v2.5-v3, O1, O3), WAN, LTX Video, Veo 3.1, Hailuo, Seedance, Vidu, PixVerse | T2V, I2V, V2V, Avatar, Upscale |
| **GMI Cloud** | Veo 3.1 Lite, SkyReels V4, Kling V3/Omni/Motion Control, Gemini Image | T2V, I2V |
| **xAI** (direct) | Grok Imagine Video (edit, R2V) | V2V, R2V |

**V2V models QCut already has:**
- Kling O1 V2V Reference + Edit (via FAL)
- Kling O3 Standard/Pro V2V Edit + Reference (4 models, via FAL)
- Sora 2 V2V Remix (via FAL)
- Grok Video Edit (via xAI)
- Veo 3.1 Extend / Fast Extend (via FAL)

**Avatar models QCut already has (15):**
- Kling Avatar v2 Standard/Pro, v1 Standard/Pro
- ByteDance OmniHuman v1.5
- Sync Lipsync React-1
- VEED Fabric 1.0 / Fast / TTS
- AI Avatar Multi (multi-person)
- Grok Imagine R2V, WAN v2.6 R2V, WAN Animate/Replace
- Kling Motion Control

**Upscale/Audio models:**
- Topaz Video Upscale, ByteDance Upscaler, FlashVSR
- ThinkSound (add audio to video)

### OpenClaw (12 direct providers)
| Provider | Models | Modes |
|----------|--------|-------|
| OpenAI | Sora-2, Sora-2 Pro | T2V, I2V, V2V |
| Runway | gen4.5, gen4_turbo, gen4_aleph, gen3a_turbo, veo3.1/3 | T2V, I2V, V2V |
| Google | Veo 3.1 (fast/standard/lite), Veo 3.0, Veo 2.0 | T2V, I2V, V2V |
| Alibaba | Wan 2.6 T2V/I2V/R2V, Wan 2.7 R2V | T2V, I2V, V2V |
| BytePlus | Seedance 1.0 Lite/Pro, Seedance 1.5 Pro | T2V, I2V |
| ComfyUI | Workflow-based (any model) | T2V, I2V |
| fal.ai | MiniMax Live, Kling 2.1, Wan 2.2 | T2V, I2V |
| MiniMax | Hailuo 2.3, Hailuo 02, I2V-01 Director/Live | T2V, I2V |
| Qwen | Wan 2.6/2.7 (DashScope) | T2V, I2V, V2V |
| Together | Wan 2.2, Hailuo 02, Kling 2.1 | T2V, I2V |
| Vydra | Kling + default | T2V, I2V |
| xAI | Grok Imagine Video | T2V, I2V, V2V |

---

## What QCut Already Covers Well

- **T2V**: 36+ models across 10+ model families — comprehensive
- **I2V**: 40+ models — comprehensive
- **V2V**: 8+ models (Kling O1/O3, Sora 2 Remix, Grok Edit, Veo Extend) — good coverage
- **Avatar/R2V**: 15 models — strong coverage, better than OpenClaw
- **Upscale/Audio**: Topaz, ByteDance, FlashVSR, ThinkSound — good
- **xAI**: Already integrated (Grok edit, R2V) — OpenClaw gap analysis was wrong

---

## Remaining Gaps

### GAP 1: No Runway Provider [HIGH PRIORITY]
**What QCut lacks:** Runway (gen4.5, gen4_turbo, gen4_aleph, gen3a_turbo) — one of the most popular video AI providers.

**Why it matters:** Runway gen4.5 is industry-leading for quality. gen4_aleph is the only Runway model with V2V. Many users expect Runway support. OpenClaw routes Veo 3.1/3.0 through Runway too.

**OpenClaw reference:** `extensions/runway/video-generation-provider.ts` — polling `/v1/tasks/{taskId}`, supports T2V/I2V/V2V.

---

### GAP 2: No Direct Google Veo API [MEDIUM PRIORITY]
**What QCut lacks:** Direct Google Veo integration. Currently routes through FAL and GMI only.

**Why it matters:** Direct API is cheaper (no middleman markup), supports audio generation flag, and gets new models faster (Veo 3.0, 2.0 not available via FAL/GMI).

**OpenClaw reference:** `extensions/google/video-generation-provider.ts` — uses GoogleGenAI SDK with operations-based polling.

---

### GAP 3: No Automatic Fallback Chain [MEDIUM PRIORITY]
**What QCut lacks:** When a provider fails, QCut shows an error. No automatic retry with alternative providers.

**Why it matters:** QCut has the same model available via multiple backends (e.g., Veo 3.1 via FAL, GMI, and potentially direct Google). Should auto-fallback on failure.

**OpenClaw reference:** `src/video-generation/runtime.ts` — sequential fallback through candidate providers.

---

### GAP 4: No Together AI Provider [LOW PRIORITY]
**What QCut lacks:** Together AI as an alternative routing backend.

**Why it matters:** Together offers Wan 2.2, Hailuo 02, Kling 2.1 via a single API key — useful as a fallback when FAL is down.

**OpenClaw reference:** `extensions/together/video-generation-provider.ts` — polls `/videos/{videoId}`.

---

### GAP 5: No Direct MiniMax API [LOW PRIORITY]
**What QCut lacks:** Direct MiniMax/Hailuo API. Currently routes through FAL.

**Why it matters:** Direct API access to I2V-01 Director (cinematic camera control), I2V-01 Live. Lower latency, potentially lower cost.

**OpenClaw reference:** `extensions/minimax/video-generation-provider.ts` — polls `/v1/query/video_generation`.

---

### GAP 6: No ComfyUI Integration [LOW PRIORITY]
**What QCut lacks:** ComfyUI workflow execution for video generation.

**Why it matters:** Power users want custom workflows. ComfyUI enables running any open-source model locally or on cloud.

**OpenClaw reference:** `extensions/comfy/video-generation-provider.ts` — workflow-based execution with prompt ID tracking.

---

### GAP 7: No Plugin/Provider SDK [LOW PRIORITY — LONG TERM]
**What QCut lacks:** A formal plugin SDK for adding new providers. Each provider requires touching multiple files (config, handler, generator, registry).

**Why it matters:** OpenClaw's plugin architecture (`definePluginEntry()`) lets providers be self-contained packages. QCut's approach requires 6+ file changes per provider.

**OpenClaw reference:** `packages/plugin-sdk/`, `src/plugins/registry.ts`, `extensions/*/index.ts`.

---

## ~~Gaps that turned out not to be gaps~~

| Initially flagged | Reality |
|-------------------|---------|
| ~~No V2V mode~~ | QCut has 8+ V2V models: Kling O1/O3, Sora 2 Remix, Grok Edit, Veo Extend |
| ~~No xAI~~ | QCut has Grok Video Edit + Grok R2V in both web and native pipeline |
| ~~No Avatar~~ | QCut has 15 avatar models — stronger than OpenClaw |

---

## Revised Priority Matrix

| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| Runway Provider | High — most-requested missing provider | Medium | **P0** |
| Direct Google Veo | Medium — cost savings, more models | Low | **P1** |
| Fallback Chain | Medium — reliability with multi-backend models | Low | **P1** |
| Together AI | Low — redundant but useful fallback | Low | **P2** |
| Direct MiniMax | Low — marginal benefit over FAL | Low | **P2** |
| ComfyUI | Low — power user feature | High | **P2** |
| Plugin SDK | Low now, high later | High | **P3** |

---

## Recommended Implementation Order

1. **Phase 1 — Runway** (P0): Add Runway as direct provider (gen4.5, gen4_turbo, gen4_aleph V2V)
2. **Phase 2 — Direct Google Veo + Fallback Chain** (P1): Cost savings + reliability
3. **Phase 3 — Together + Direct MiniMax** (P2): Alternative routing backends
4. **Phase 4 — ComfyUI + Plugin SDK** (P3): Long-term extensibility

See individual implementation plans for each gap.
