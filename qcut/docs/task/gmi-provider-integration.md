# GMI Cloud Provider Integration

Add GMI Cloud (gmicloud.ai) as a new video generation provider with 3 models:
- **veo-3.1-lite-generate-001** — Text-to-Video + Image-to-Video (first/last frame)
- **skyreels-v4-text-to-video** — Text-to-Video with sound effects
- **skyreels-v4-image-to-video** — Image-to-Video with sound effects

## Why a New Provider (Not FAL)

GMI Cloud has its own REST API — it is **not** a FAL-proxied provider. This means:
- New API client (like `fal-ai-client.ts` but for GMI)
- New polling mechanism (GMI uses request queue, not FAL queue)
- New API key management (`GMI_API_KEY`)

## GMI API Summary

| Detail | Value |
|--------|-------|
| Base URL | `https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey` |
| Auth | `Authorization: Bearer {API_KEY}` |
| Submit | `POST /requests` with `{ model, payload }` |
| Poll | `GET /requests/{request_id}` |
| Statuses | `queued` → `processing` → `success` / `failed` |
| Result | `{ video_url, thumbnail_image_url }` |

## Model Details

### veo-3.1-lite-generate-001

| Field | Value |
|-------|-------|
| Type | T2V + I2V (first + last frame) |
| Pricing | $0.03-$0.08/sec (720p/1080p, with/without audio) |
| Durations | 4, 6, 8 seconds |
| Aspect Ratios | 16:9, 9:16 |
| Resolution | 720p, 1080p |
| Audio | Built-in (`generateAudio: true`) |
| Params | `prompt`, `image?`, `lastFrame?`, `durationSeconds`, `aspectRatio`, `generateAudio`, `personGeneration`, `seed` |
| Prompt max | 2000 chars |

### skyreels-v4-text-to-video

| Field | Value |
|-------|-------|
| Type | T2V |
| Pricing | $0.14/sec |
| Durations | 3-15 seconds (continuous) |
| Aspect Ratios | 16:9, 4:3, 1:1, 9:16, 3:4 |
| Resolution | 1080p |
| Sound | Optional (`sound: true`) |
| Params | `prompt`, `duration`, `aspect_ratio`, `sound`, `mode` |
| Prompt max | 1280 tokens |

### skyreels-v4-image-to-video

| Field | Value |
|-------|-------|
| Type | I2V (first frame required) |
| Pricing | $0.14/sec |
| Durations | 3-15 seconds (continuous) |
| Aspect Ratios | From input image |
| Resolution | 1080p |
| Sound | Optional (`sound: true`) |
| Params | `prompt`, `first_frame_image`, `duration`, `sound`, `mode` |
| Prompt max | 1280 tokens |

---

## Subtasks

### Subtask 1: GMI API Client

Create the core HTTP client for GMI Cloud API requests.

**Files to create/modify:**
- `apps/web/src/lib/ai-clients/gmi-client.ts` — New GMI API client class
  - `submitRequest(model, payload)` → POST `/requests`
  - `getRequestStatus(requestId)` → GET `/requests/{request_id}`
  - `listModels()` → GET `/models`
  - Bearer token auth, error handling, response typing
- `apps/web/src/lib/ai-clients/index.ts` — Export `gmiClient`

**Pattern to follow:** `apps/web/src/lib/ai-clients/fal-ai-client.ts`

**Key differences from FAL:**
- Auth header: `Bearer` (not `Key`)
- Submit endpoint: single endpoint for all models (model specified in body)
- Response shape: `{ video_url, thumbnail_image_url }` (not FAL queue format)

### Subtask 2: GMI Polling Integration

Add GMI request queue polling alongside existing FAL polling.

**Files to create/modify:**
- `apps/web/src/lib/ai-video/core/gmi-polling.ts` — New polling module
  - `pollGmiRequest(requestId, options)` — Poll until `success`/`failed`
  - Map GMI statuses (`queued`/`processing`/`success`/`failed`) to UI progress
- `apps/web/src/lib/ai-video/core/gmi-request.ts` — Core request helper
  - `makeGmiRequest(model, payload, options)` — Submit + return request ID

**Pattern to follow:** `apps/web/src/lib/ai-video/core/polling.ts`, `apps/web/src/lib/ai-video/core/fal-request.ts`

### Subtask 3: GMI Video Generators

Create generator functions for the 3 GMI models.

**Files to create/modify:**
- `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` — New file
  - `generateGmiVeoLiteVideo(request)` — veo-3.1-lite T2V
  - `generateSkyreelsV4TextVideo(request)` — skyreels-v4 T2V
- `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts` — New file
  - `generateGmiVeoLiteImageVideo(request)` — veo-3.1-lite I2V (first+last frame)
  - `generateSkyreelsV4ImageVideo(request)` — skyreels-v4 I2V
- `apps/web/src/lib/ai-video/index.ts` — Add exports

**Pattern to follow:** `apps/web/src/lib/ai-video/generators/text-to-video.ts`

### Subtask 4: Model Registry Registration

Register all 3 GMI models in the native pipeline registry.

**Files to modify:**
- `electron/native-pipeline/registry-data/text-to-video.ts` — Add veo-3.1-lite T2V + skyreels-v4 T2V
- `electron/native-pipeline/registry-data/image-to-video.ts` — Add veo-3.1-lite I2V + skyreels-v4 I2V

**Registry keys (proposed):**
- `gmi_veo31_lite_t2v` — veo-3.1-lite text-to-video
- `gmi_veo31_lite_i2v` — veo-3.1-lite image-to-video
- `gmi_skyreels_v4_t2v` — skyreels-v4 text-to-video
- `gmi_skyreels_v4_i2v` — skyreels-v4 image-to-video

**Pattern to follow:** Existing entries in `text-to-video.ts` and `image-to-video.ts`

### Subtask 5: UI Model Configuration

Add GMI models to the editor UI model selectors.

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` — Add GMI T2V entries
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` — Add capability flags
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` — Add to display order
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — Add GMI I2V entries

### Subtask 6: Generation Handlers

Wire up the model handlers that route UI requests to the GMI generators.

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` — Add `handleGmiVeoLiteT2V()`, `handleSkyreelsV4T2V()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` — Add `handleGmiVeoLiteI2V()`, `handleSkyreelsV4I2V()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` — Add switch cases for GMI model IDs in `routeTextToVideoHandler()` and `routeImageToVideoHandler()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handler-types.ts` — Add any GMI-specific settings if needed

### Subtask 7: API Key Management

Add GMI API key to the key management system.

**Files to modify:**
- `electron/native-pipeline/infra/key-manager.ts` — Add `GMI_API_KEY` to `KEY_NAMES`
- `apps/web/src/lib/ai-video/core/gmi-request.ts` — Read key from env/Electron storage
- `CLAUDE.md` — Add `GMI_API_KEY` to environment variables section

**Env var:** `GMI_API_KEY` (backend) / `VITE_GMI_API_KEY` (frontend)

### Subtask 8: Request Type Definitions

Add TypeScript types for GMI API requests and responses.

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` — Add GMI request interfaces

**Types needed:**
- `GmiVeoLiteRequest` — prompt, image?, lastFrame?, durationSeconds, aspectRatio, generateAudio, personGeneration?, seed?
- `SkyreelsV4T2VRequest` — prompt, duration, aspect_ratio, sound, mode
- `SkyreelsV4I2VRequest` — prompt, first_frame_image, duration, sound, mode
- `GmiApiResponse` — video_url, thumbnail_image_url
- `GmiRequestStatus` — id, status, outcome?

### Subtask 9: Tests

Add unit tests for the new GMI integration.

**Files to create/modify:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handler-exports.test.ts` — Update handler counts
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts` — Add GMI routing tests
- `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts` — GMI client unit tests
- `electron/__tests__/cli-commands-phase4.test.ts` — Verify GMI models are registered

---

## Implementation Order

```
Subtask 8 (types) → Subtask 1 (client) → Subtask 2 (polling)
    → Subtask 3 (generators) → Subtask 4 (registry) → Subtask 5 (UI config)
    → Subtask 6 (handlers) → Subtask 7 (API key) → Subtask 9 (tests)
```

## Notes

- veo-3.1-lite supports both T2V and I2V via a single GMI model ID — the `image` param toggles the mode
- SkyReels `mode` param currently only supports `"std"` — register but don't expose `fast`/`pro` in UI yet
- SkyReels I2V has no aspect ratio param — output matches input image dimensions
- GMI also hosts Kling, Luma, Sora, etc. — future expansion possible but out of scope for v1
