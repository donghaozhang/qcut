# Implementation Plan: Direct Google Veo API

> **Priority:** P1 | **Estimated Effort:** >20 min — subtasks below
> **Depends on:** None
> **Reference:** OpenClaw `extensions/google/video-generation-provider.ts`

---

## Overview

Add direct Google Veo API integration alongside existing FAL/GMI routing. Benefits:
- Lower cost (no middleman markup)
- Access to Veo 3.0 and 2.0 (not available via FAL/GMI)
- Audio generation flag
- Faster access to new models

Uses the `@google/genai` SDK with operations-based async polling.

---

## Subtasks

### 1. Add Google Provider Backend and Client
**Files:**
- `apps/web/src/lib/ai-video/core/provider-types.ts` — add `"google"` to `ProviderBackend`
- `apps/web/src/lib/ai-video/core/provider-router.ts` — add Google routing (use direct when `GEMINI_API_KEY` available, fall back to FAL/GMI)
- `apps/web/src/lib/ai-video/core/google-veo-client.ts` — new file

**Google Veo client:**
- Auth: `GEMINI_API_KEY` (already in QCut env)
- SDK: `@google/genai` or raw REST
- Submit: Create video generation operation
- Poll: Check operation status (max 90 attempts @ 10s = 15 min timeout)
- Download: Async file download from operation result
- Audio: `generateAudio: true` flag for Veo 3.x

**Models:**
- `veo-3.1-fast-generate-preview` (fast)
- `veo-3.1-generate-preview` (standard)
- `veo-3.1-lite-generate-preview` (budget)
- `veo-3.0-fast-generate-001` (legacy fast)
- `veo-3.0-generate-001` (legacy standard)
- `veo-2.0-generate-001` (legacy)

**Tests:**
- `apps/web/src/lib/ai-video/core/__tests__/google-veo-client.test.ts`

---

### 2. Create Google Veo Generators
**Files:**
- `apps/web/src/lib/ai-video/generators/google-veo-generators.ts` — new file
- `apps/web/src/lib/ai-video/index.ts` — export

**Functions:**
- `generateGoogleVeoTextToVideo(settings)` — T2V with audio option
- `generateGoogleVeoImageToVideo(settings)` — I2V
- `generateGoogleVeoVideoToVideo(settings)` — V2V (when V2V mode exists)

**Capabilities per model:**
- Duration: 4, 6, 8 seconds (fixed steps)
- Aspect ratios: 16:9, 9:16
- Resolutions: 720P, 1080P

**Tests:**
- `apps/web/src/lib/ai-video/generators/__tests__/google-veo-generators.test.ts`

---

### 3. Register Direct Veo Models (Separate from FAL-routed)
**Files:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` — add direct Veo models
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — add direct Veo I2V

**Models to add (distinct from existing FAL-routed ones):**
| Model ID | Name | Via |
|----------|------|-----|
| `google_veo31_t2v` | Veo 3.1 (Direct) | Google API |
| `google_veo31_fast_t2v` | Veo 3.1 Fast (Direct) | Google API |
| `google_veo30_t2v` | Veo 3.0 | Google API |
| `google_veo20_t2v` | Veo 2.0 | Google API |

**Note:** Only show direct models when `GEMINI_API_KEY` is set. FAL-routed models remain as fallback.

---

### 4. Create Handlers + Smart Routing
**Files:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` — add direct Veo handlers
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` — register
- `electron/native-pipeline/registry-data/text-to-video.ts` — register direct Veo models
- `electron/native-pipeline/infra/api-caller.ts` — add Google operations-based polling

**Smart routing logic:** If user has `GEMINI_API_KEY`, prefer direct API. Otherwise, route through FAL/GMI as today.

**Tests:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/google-veo-handlers.test.ts`

---

## Acceptance Criteria

- [ ] Direct Google Veo API works with `GEMINI_API_KEY`
- [ ] Veo 3.0 and 2.0 models available (not via FAL)
- [ ] Audio generation flag works on Veo 3.x
- [ ] Smart routing: direct when key available, FAL/GMI fallback otherwise
- [ ] Operations-based polling handles long generation times (up to 15 min)
- [ ] Existing FAL-routed Veo models continue to work unchanged
- [ ] Unit tests for client, generators, handlers
