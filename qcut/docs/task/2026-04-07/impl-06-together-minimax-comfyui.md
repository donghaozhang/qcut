# Implementation Plan: Together AI, Direct MiniMax, ComfyUI

> **Priority:** P2-P3 | **Estimated Effort:** >20 min each — subtasks below
> **Reference:** OpenClaw `extensions/together/`, `extensions/minimax/`, `extensions/comfy/`

---

## Part A: Together AI Provider [P2]

### Overview
Together AI provides Wan 2.2, Hailuo 02, and Kling 2.1 via a single API. Useful as a fallback when FAL is down.

### Subtasks

#### A1. Together AI Client
**Files:**
- `apps/web/src/lib/ai-video/core/together-client.ts` — new file

**API pattern:**
- Auth: `Authorization: Bearer {TOGETHER_API_KEY}`
- Submit: POST `/videos` with model, prompt, reference_images
- Poll: GET `/videos/{videoId}` until status is completed
- Size: Parsed as `WIDTHxHEIGHT` string

**Tests:**
- `apps/web/src/lib/ai-video/core/__tests__/together-client.test.ts`

#### A2. Register Together Models
**Files:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`
- `electron/native-pipeline/registry-data/text-to-video.ts`

**Models:**
| Model ID | Together Model | Mode |
|----------|---------------|------|
| `together_wan22_t2v` | Wan-AI/Wan2.2-T2V-A14B | T2V |
| `together_wan22_i2v` | Wan-AI/Wan2.2-I2V-A14B | I2V |
| `together_hailuo02` | minimax/Hailuo-02 | T2V |
| `together_kling21` | Kwai/Kling-2.1-Master | T2V |

#### A3. Together Handlers + Generator
**Files:**
- `apps/web/src/lib/ai-video/generators/together-generators.ts` — new file
- Handler registration in existing handler files

**Tests:**
- `apps/web/src/lib/ai-video/generators/__tests__/together-generators.test.ts`

---

## Part B: Direct MiniMax API [P2]

### Overview
Direct MiniMax/Hailuo API enables access to I2V-01 Director (cinematic control) and I2V-01 Live, not available via FAL.

### Subtasks

#### B1. MiniMax Client
**Files:**
- `apps/web/src/lib/ai-video/core/minimax-client.ts` — new file

**API pattern:**
- Auth: `Authorization: Bearer {MINIMAX_API_KEY}`
- Submit: POST `/v1/video_generation`
- Poll: GET `/v1/query/video_generation?task_id={taskId}`
- Download: GET `/v1/files/retrieve?file_id={fileId}` (alternative to video_url)
- Polling: 90 attempts @ 10s

**Tests:**
- `apps/web/src/lib/ai-video/core/__tests__/minimax-client.test.ts`

#### B2. Register Direct MiniMax Models
**Files:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`

**New models (not available via FAL):**
| Model ID | MiniMax Model | Mode | Feature |
|----------|--------------|------|---------|
| `minimax_i2v_director` | I2V-01-Director | I2V | Cinematic camera control |
| `minimax_i2v_live` | I2V-01-live | I2V | Real-time preview quality |

#### B3. MiniMax Handlers + Generator
**Files:**
- `apps/web/src/lib/ai-video/generators/minimax-generators.ts` — new file
- Handler registration

**Tests:**
- `apps/web/src/lib/ai-video/generators/__tests__/minimax-generators.test.ts`

---

## Part C: ComfyUI Integration [P3 — Long Term]

### Overview
ComfyUI workflow execution enables running any open-source model locally or on cloud. This is a power-user feature with high complexity.

### Subtasks

#### C1. ComfyUI Workflow Engine
**Files:**
- `apps/web/src/lib/ai-video/core/comfyui-client.ts` — new file
- `electron/comfyui-handler.ts` — Electron IPC handler for local ComfyUI

**Supports:**
- Local ComfyUI instance (user runs ComfyUI server)
- Cloud ComfyUI service (ComfyUI Cloud API)
- Custom workflow JSON upload
- Prompt ID tracking and output node mapping

**Tests:**
- `apps/web/src/lib/ai-video/core/__tests__/comfyui-client.test.ts`

#### C2. ComfyUI UI
**Files:**
- `apps/web/src/components/editor/media-panel/views/ai/` — ComfyUI workflow panel
  - Workflow file selector
  - Node parameter editor
  - Output preview

#### C3. Workflow Templates
**Files:**
- `resources/comfyui-workflows/` — bundled workflow templates
  - `text-to-video-basic.json`
  - `image-to-video-basic.json`

---

## Acceptance Criteria

### Together AI
- [ ] Single API key accesses 4 models
- [ ] Works as fallback in fallback chain config
- [ ] Unit tests

### Direct MiniMax
- [ ] I2V-01 Director cinematic control works
- [ ] File ID download fallback when video_url missing
- [ ] Unit tests

### ComfyUI
- [ ] Local ComfyUI server connection works
- [ ] Cloud ComfyUI API connection works
- [ ] Custom workflow upload and execution
- [ ] Output node mapping to video result
- [ ] Unit tests
