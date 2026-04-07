# GMI Cloud Provider Integration

Add GMI Cloud (gmicloud.ai) as a new video generation provider with 3 models:
- **veo-3.1-lite-generate-001** — Text-to-Video + Image-to-Video (first/last frame)
- **skyreels-v4-text-to-video** — Text-to-Video with sound effects
- **skyreels-v4-image-to-video** — Image-to-Video with sound effects

## Architecture: Provider Abstraction Layer

### Current Problem

All generators (`generate-video.ts`, `image-to-video.ts`, etc.) call `makeFalRequest()` directly.
The `endpoint` field in `ModelDefinition` is a FAL-style path (e.g., `fal-ai/kling-video/v3/pro/text-to-video`).
There is no concept of "which provider serves this model" at the routing level.

### Design Goal

**Default to FAL, but support alternative providers transparently.** When a model is available
from multiple providers, use FAL. When a model is only on GMI (like SkyReels V4), use GMI
automatically. No handler code should need to know which provider is being used.

### Proposed Solution: `ProviderRouter`

A thin routing layer between handlers and provider-specific clients:

```text
Handler → ProviderRouter.submit(modelKey, payload) → FAL or GMI client
Handler → ProviderRouter.poll(jobId) → FAL or GMI polling
```

The router decides which provider to use based on:
1. `ModelDefinition.providerBackend` — new field: `"fal"` (default) | `"gmi"` | `"fal+gmi"`
2. API key availability — if FAL key is missing but GMI key is set, use GMI
3. Explicit override — user can force a provider in settings (future)

This keeps handlers clean (they call `providerRouter.submit()`) and makes adding new
providers (Replicate, RunPod, etc.) a matter of adding a new client + registering it.

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

### Subtask 1: Provider Abstraction Types & Interface

Define the provider abstraction that lets handlers be provider-agnostic.

**Files to create:**
- `apps/web/src/lib/ai-video/core/provider-types.ts` — New file

```typescript
type ProviderBackend = "fal" | "gmi";

interface ProviderSubmitResult {
  requestId: string;
  provider: ProviderBackend;
}

interface ProviderPollResult {
  status: "queued" | "processing" | "completed" | "failed";
  progress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

interface ProviderClient {
  name: ProviderBackend;
  isAvailable(): Promise<boolean>;       // has API key?
  submit(model: string, payload: Record<string, unknown>): Promise<ProviderSubmitResult>;
  poll(requestId: string): Promise<ProviderPollResult>;
}
```

**Files to modify:**
- `electron/native-pipeline/infra/registry.ts` — Add `providerBackend?: ProviderBackend` to `ModelDefinitionInput`
  - Default: `"fal"` for all existing models
  - GMI-only models get `"gmi"`
  - Models on both get `"fal"` (FAL preferred)

### Subtask 2: GMI API Client

Create the GMI provider client implementing the `ProviderClient` interface.

**Files to create:**
- `apps/web/src/lib/ai-clients/gmi-client.ts` — New GMI client
  - `submit(model, payload)` → POST `https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests`
  - `poll(requestId)` → GET `/requests/{request_id}`, map to `ProviderPollResult`
  - `isAvailable()` → check if `GMI_API_KEY` / `VITE_GMI_API_KEY` is set
  - Bearer token auth, error handling

**Pattern to follow:** `apps/web/src/lib/ai-clients/fal-ai-client.ts` (but much simpler — GMI has one submit endpoint for all models)

**Key differences from FAL:**
- Auth: `Authorization: Bearer {key}` (not `Key {key}`)
- Single submit endpoint (model ID in request body)
- Response: `{ video_url, thumbnail_image_url }` (not FAL queue format)
- Polling: GET on request ID (not FAL queue polling)

### Subtask 3: FAL Provider Client Wrapper

Wrap the existing FAL code to implement `ProviderClient`, keeping all existing FAL logic intact.

**Files to create:**
- `apps/web/src/lib/ai-video/core/fal-provider.ts` — Wraps existing `makeFalRequest` + `pollQueueStatus`

```typescript
// Thin adapter — delegates to existing fal-request.ts and polling.ts
class FalProvider implements ProviderClient {
  name = "fal" as const;
  async isAvailable() { return !!(await getFalApiKeyAsync()); }
  async submit(endpoint, payload) { /* makeFalRequest + return requestId */ }
  async poll(requestId) { /* pollQueueStatus + normalize to ProviderPollResult */ }
}
```

**No existing FAL code changes.** This is purely an adapter.

### Subtask 4: Provider Router

The central router that picks the right provider for each model.

**Files to create:**
- `apps/web/src/lib/ai-video/core/provider-router.ts` — New file

```typescript
class ProviderRouter {
  private providers: Map<ProviderBackend, ProviderClient>;

  async submit(modelKey: string, payload): Promise<ProviderSubmitResult> {
    const backend = resolveProvider(modelKey); // check registry + key availability
    return this.providers.get(backend)!.submit(modelKey, payload);
  }

  async poll(requestId: string, provider: ProviderBackend): Promise<ProviderPollResult> {
    return this.providers.get(provider)!.poll(requestId);
  }
}
```

Resolution logic:
1. Look up `ModelDefinition.providerBackend` from registry
2. If `"fal"` → check FAL key available → use FAL, else check GMI → use GMI
3. If `"gmi"` → use GMI directly
4. If neither key available → throw descriptive error

**Files to modify:**
- `apps/web/src/lib/ai-video/core/index.ts` — Export `providerRouter` singleton

### Subtask 5: GMI Video Generators

Create generator functions that use the provider router (not FAL directly).

**Files to create:**
- `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` — New file
  - `generateGmiVeoLiteVideo(request)` — veo-3.1-lite T2V via provider router
  - `generateSkyreelsV4TextVideo(request)` — skyreels-v4 T2V via provider router
- `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts` — New file
  - `generateGmiVeoLiteImageVideo(request)` — veo-3.1-lite I2V (first+last frame)
  - `generateSkyreelsV4ImageVideo(request)` — skyreels-v4 I2V
- `apps/web/src/lib/ai-video/index.ts` — Add exports

**Pattern to follow:** `apps/web/src/lib/ai-video/generators/text-to-video/generate-video.ts`
but calling `providerRouter.submit()` instead of `makeFalRequest()`

### Subtask 6: Model Registry Registration

Register all GMI models in the native pipeline registry with `providerBackend`.

**Files to modify:**
- `electron/native-pipeline/registry-data/text-to-video.ts` — Add:
  - `gmi_veo31_lite_t2v` (providerBackend: `"gmi"`, endpoint: `"veo-3.1-lite-generate-001"`)
  - `gmi_skyreels_v4_t2v` (providerBackend: `"gmi"`, endpoint: `"skyreels-v4-text-to-video"`)
- `electron/native-pipeline/registry-data/image-to-video.ts` — Add:
  - `gmi_veo31_lite_i2v` (providerBackend: `"gmi"`, endpoint: `"veo-3.1-lite-generate-001"`)
  - `gmi_skyreels_v4_i2v` (providerBackend: `"gmi"`, endpoint: `"skyreels-v4-image-to-video"`)

### Subtask 7: UI Model Configuration

Add GMI models to the editor UI model selectors.

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` — Add GMI T2V entries
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` — Add capability flags
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` — Add to display order
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — Add GMI I2V entries

### Subtask 8: Generation Handlers

Wire up handlers for GMI models.

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` — Add `handleGmiVeoLiteT2V()`, `handleSkyreelsV4T2V()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` — Add `handleGmiVeoLiteI2V()`, `handleSkyreelsV4I2V()`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` — Add switch cases in `routeTextToVideoHandler()` and `routeImageToVideoHandler()`

### Subtask 9: API Key Management

Add GMI API key to the key management system.

**Files to modify:**
- `electron/native-pipeline/infra/key-manager.ts` — Add `GMI_API_KEY` to `KEY_NAMES`
- `CLAUDE.md` — Add `GMI_API_KEY` / `VITE_GMI_API_KEY` to environment variables section

### Subtask 10: Request Type Definitions

Add TypeScript types for GMI API requests and responses.

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` — Add:
  - `GmiVeoLiteRequest` — prompt, image?, lastFrame?, durationSeconds, aspectRatio, generateAudio, personGeneration?, seed?
  - `SkyreelsV4T2VRequest` — prompt, duration, aspect_ratio, sound, mode
  - `SkyreelsV4I2VRequest` — prompt, first_frame_image, duration, sound, mode
  - `GmiApiResponse` — video_url, thumbnail_image_url
  - `GmiRequestStatus` — id, status, outcome?

### Subtask 11: Tests

**Files to create/modify:**
- `apps/web/src/lib/ai-video/core/__tests__/provider-router.test.ts` — Provider routing logic tests (FAL default, GMI fallback, key availability)
- `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts` — GMI client unit tests
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handler-exports.test.ts` — Update handler counts
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts` — Add GMI routing tests
- `electron/__tests__/cli-commands-phase4.test.ts` — Verify GMI models registered

---

## Implementation Order

```text
Subtask 1  (provider types)
    ↓
Subtask 3  (FAL provider wrapper)  +  Subtask 2 (GMI client)   ← parallel
    ↓
Subtask 4  (provider router)
    ↓
Subtask 10 (request types)  +  Subtask 9 (API key mgmt)       ← parallel
    ↓
Subtask 5  (GMI generators)
    ↓
Subtask 6  (registry)  +  Subtask 7 (UI config)               ← parallel
    ↓
Subtask 8  (handlers)
    ↓
Subtask 11 (tests)
```

## Migration Strategy (Zero Breakage)

The provider abstraction is **additive** — existing FAL code is untouched:
1. `FalProvider` is a thin wrapper calling existing `makeFalRequest()` / `pollQueueStatus()`
2. All existing models default to `providerBackend: "fal"` (no registry changes needed)
3. New GMI models set `providerBackend: "gmi"`
4. New GMI generators use `providerRouter.submit()` instead of `makeFalRequest()`
5. Existing generators continue calling `makeFalRequest()` directly — no migration needed now
6. Future: gradually migrate existing generators to use `providerRouter` for multi-provider support

## Notes

- veo-3.1-lite supports both T2V and I2V via a single GMI model ID — the `image` param toggles the mode
- SkyReels `mode` param currently only supports `"std"` — register but don't expose `fast`/`pro` in UI yet
- SkyReels I2V has no aspect ratio param — output matches input image dimensions
- GMI also hosts Kling, Luma, Sora, etc. — future expansion possible but out of scope for v1
- Adding a new provider later = implement `ProviderClient` + register in router (2 files)
