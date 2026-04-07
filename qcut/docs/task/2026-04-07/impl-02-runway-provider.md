# Implementation Plan: Runway Provider Integration

> **Priority:** P0 | **Estimated Effort:** >20 min — subtasks below
> **Depends on:** V2V Mode (for gen4_aleph V2V support)
> **Reference:** OpenClaw `extensions/runway/video-generation-provider.ts`

---

## Overview

Add Runway as a direct provider in QCut. Runway offers gen4.5 (best quality), gen4_turbo (fast), gen4_aleph (V2V), and gen3a_turbo (legacy). This is the most-requested missing provider.

**API pattern:** Submit request → poll `/v1/tasks/{taskId}` → download video URL.

---

## Subtasks

### 1. Add Runway Provider Backend
**Files:**
- `apps/web/src/lib/ai-video/core/provider-types.ts` — add `"runway"` to `ProviderBackend` union
- `apps/web/src/lib/ai-video/core/provider-router.ts` — add Runway routing logic
- `apps/web/src/lib/ai-video/core/runway-client.ts` — new file: Runway API client

**Runway API client implements:**
- Auth: `Authorization: Bearer {RUNWAY_API_KEY}`, header `X-Runway-Version: 2024-11-06`
- Submit: POST `/v1/text_to_video`, `/v1/image_to_video`, `/v1/video_to_video`
- Poll: GET `/v1/tasks/{taskId}` until `status === "SUCCEEDED"` or `"FAILED"`
- Polling: 120 attempts @ 5s interval

**Tests:**
- `apps/web/src/lib/ai-video/core/__tests__/runway-client.test.ts`

---

### 2. Add Runway API Key Configuration
**Files:**
- `apps/web/src/env.ts` — add `VITE_RUNWAY_API_KEY`
- `electron/api-key-handler.ts` — add `runway` to API key store
- `apps/web/src/types/electron.d.ts` — update API key types

**Environment variable:** `VITE_RUNWAY_API_KEY` / `RUNWAY_API_KEY`

---

### 3. Create Runway Generator Functions
**Files:**
- `apps/web/src/lib/ai-video/generators/runway-generators.ts` — new file
- `apps/web/src/lib/ai-video/index.ts` — export Runway generators

**Functions:**
- `generateRunwayTextToVideo(settings)` — gen4.5/gen4_turbo T2V
- `generateRunwayImageToVideo(settings)` — gen4.5/gen4_turbo/gen3a_turbo I2V
- `generateRunwayVideoToVideo(settings)` — gen4_aleph V2V

**Tests:**
- `apps/web/src/lib/ai-video/generators/__tests__/runway-generators.test.ts`

---

### 4. Register Runway Models in Config
**Files:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` — add Runway T2V models
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` — add capabilities
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` — add to display order
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — add Runway I2V models

**Models:**
| Model ID | Name | Mode | Max Duration | Resolutions |
|----------|------|------|--------------|-------------|
| `runway_gen45_t2v` | Runway Gen4.5 T2V | T2V | 10s | 720p, 1080p |
| `runway_gen4_turbo_t2v` | Runway Gen4 Turbo T2V | T2V | 10s | 720p |
| `runway_gen45_i2v` | Runway Gen4.5 I2V | I2V | 10s | 720p, 1080p |
| `runway_gen4_turbo_i2v` | Runway Gen4 Turbo I2V | I2V | 10s | 720p |
| `runway_gen3a_turbo_i2v` | Runway Gen3a Turbo I2V | I2V | 10s | 720p |

**Aspect ratios:**
- T2V: 16:9, 9:16
- I2V: 1:1, 16:9, 9:16, 3:4, 4:3, 21:9

---

### 5. Create Runway Handlers
**Files:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` — add `handleRunwayGen45TextToVideo`, `handleRunwayGen4TurboTextToVideo`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` — add Runway I2V handlers
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` — register handlers

**Tests:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/runway-handlers.test.ts`

---

### 6. Register in Native Pipeline
**Files:**
- `electron/native-pipeline/registry-data/text-to-video.ts` — add Runway T2V models
- `electron/native-pipeline/registry-data/image-to-video.ts` — add Runway I2V models
- `electron/native-pipeline/registry-data/video-to-video.ts` — add gen4_aleph V2V
- `electron/native-pipeline/infra/api-caller.ts` — add Runway API caller with polling

**Tests:**
- `electron/__tests__/runway-pipeline.test.ts`

---

## Acceptance Criteria

- [ ] Runway API client handles auth, submit, poll, download
- [ ] gen4.5, gen4_turbo, gen3a_turbo models registered for T2V and I2V
- [ ] gen4_aleph registered for V2V (depends on V2V mode implementation)
- [ ] API key configurable via settings
- [ ] Media panel shows Runway models in model selector
- [ ] Native pipeline supports Runway
- [ ] Unit tests for client, generators, and handlers
