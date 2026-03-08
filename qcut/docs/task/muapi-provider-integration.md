# MUAPI Provider Integration — Implementation Plan

> **Goal**: Add MUAPI as a fifth provider to QCut's native pipeline, enabling 100+ additional models (Seedance 2, Midjourney v7, Suno V5, lipsync, video effects) alongside existing FAL/Google/ElevenLabs/OpenRouter providers. Include intent mapping (cinema director) as a prompt transformer.

---

## Architecture Decision

**Approach**: Extend the existing multi-provider pattern — NOT a new system.

QCut already has a clean provider abstraction:
```
ProviderName = "fal" | "elevenlabs" | "google" | "openrouter"
     → add "muapi"
```

The intent mapping layer (cinema-director style) becomes a **prompt transformer** that runs before any provider call. It doesn't know or care which provider generates the result.

```
User intent → Intent Mapper (provider-agnostic) → Model Registry (picks provider) → API Caller (routes request)
```

---

## Subtask Breakdown

### Subtask 1: Add MUAPI to API Caller (~15 min)

**File**: `electron/native-pipeline/infra/api-caller.ts`

**Changes:**

1. **Line 15** — Add `"muapi"` to `ProviderName` type union:
   ```typescript
   export type ProviderName = "fal" | "elevenlabs" | "google" | "openrouter" | "muapi";
   ```

2. **Add MUAPI constants** (after line 159):
   ```typescript
   const MUAPI_BASE = "https://api.muapi.ai/api/v1";
   ```

3. **`buildHeaders()`** (line 237–258) — Add MUAPI case:
   ```typescript
   case "muapi":
     headers["x-api-key"] = apiKey;
     break;
   ```

4. **`buildUrl()`** (line 262–276) — Add MUAPI case:
   ```typescript
   case "muapi":
     return `${MUAPI_BASE}/${endpoint}`;
   ```

5. **`getApiKey()` chain** — Add MUAPI to both `envApiKeyProvider` (line 179) and `defaultApiKeyProvider` (line 197):
   ```typescript
   case "muapi":
     return Promise.resolve(process.env.MUAPI_KEY || process.env.MUAPI_API_KEY || "");
   ```
   In `defaultApiKeyProvider`:
   ```typescript
   case "muapi":
     return process.env.MUAPI_KEY || process.env.MUAPI_API_KEY || keys.muapiKey || "";
   ```

6. **`callModelApi()`** (line 452–604) — Add MUAPI async handling branch. MUAPI uses the same submit-then-poll pattern as FAL but with different response shapes:
   - Submit: returns `{ request_id: string }`
   - Poll: `GET /predictions/{id}/result` returns `{ status: "completed"|"failed", outputs: [url] }`
   - Completed status string is `"completed"` (lowercase), not `"COMPLETED"` (FAL)

   Add `pollMuapiStatus()` function (modeled on `pollQueueStatus()`):
   ```typescript
   export async function pollMuapiStatus(
     requestId: string,
     options?: {
       onProgress?: (percent: number, message: string) => void;
       signal?: AbortSignal;
       timeoutMs?: number;
     }
   ): Promise<ApiCallResult> {
     const startTime = Date.now();
     const timeout = options?.timeoutMs ?? 600_000;
     const apiKey = await getApiKey("muapi");
     const headers = buildHeaders("muapi", apiKey);
     let lastPercent = 0;

     while (Date.now() - startTime < timeout) {
       if (options?.signal?.aborted) {
         return { success: false, error: "Cancelled", duration: (Date.now() - startTime) / 1000 };
       }
       const res = await fetch(`${MUAPI_BASE}/predictions/${requestId}/result`, { headers, signal: options?.signal });
       if (!res.ok) {
         return { success: false, error: `MUAPI status check failed: ${res.status}`, duration: (Date.now() - startTime) / 1000 };
       }
       const data = await res.json();
       if (data.status === "completed") {
         const outputUrl = Array.isArray(data.outputs) ? data.outputs[0] : undefined;
         return { success: true, data, outputUrl, duration: (Date.now() - startTime) / 1000 };
       }
       if (data.status === "failed") {
         return { success: false, error: data.output?.error || "Generation failed", duration: (Date.now() - startTime) / 1000 };
       }
       lastPercent = Math.min(lastPercent + 5, 90);
       options?.onProgress?.(lastPercent, `Processing... (${data.status})`);
       const interval = getAdaptivePollInterval(Date.now() - startTime);
       await new Promise(r => setTimeout(r, interval));
     }
     return { success: false, error: `Timeout after ${timeout / 1000}s`, duration: (Date.now() - startTime) / 1000 };
   }
   ```

7. **`extractOutputUrl()`** (line 417–445) — Add MUAPI response shape:
   ```typescript
   // MUAPI returns { outputs: [url1, url2, ...] }
   if (Array.isArray(obj.outputs) && obj.outputs.length > 0) {
     if (typeof obj.outputs[0] === "string") return obj.outputs[0];
   }
   ```

**Test file**: `electron/native-pipeline/__tests__/api-caller-muapi.test.ts`
- Test `buildHeaders("muapi", key)` returns `x-api-key` header
- Test `buildUrl("muapi", "predictions")` returns correct URL
- Test `extractOutputUrl` handles `{ outputs: ["url"] }` shape
- Test `pollMuapiStatus` handles completed/failed/timeout states (mock fetch)

---

### Subtask 2: Add MUAPI Key to Key Manager (~5 min)

**File**: `electron/native-pipeline/infra/key-manager.ts`

**Changes:**

1. **Line 14–25** — Add `"MUAPI_KEY"` to `KEY_NAMES` array:
   ```typescript
   const KEY_NAMES = [
     "FAL_KEY",
     "GEMINI_API_KEY",
     // ...existing
     "MUAPI_KEY",  // ← add
   ] as const;
   ```

**File**: `electron/api-key-handler.ts`

2. Add `muapiKey` to the encrypted key storage interface and decrypt/encrypt functions (same pattern as `falApiKey`, `elevenLabsApiKey`, etc.)

**File**: `apps/web/src/types/electron.d.ts`

3. Add `muapiKey` to the API keys type definition so the renderer can read/write it via settings UI.

---

### Subtask 3: Route MUAPI in Step Executors (~5 min)

**File**: `electron/native-pipeline/execution/step-executors.ts`

**Changes:**

1. **`getProviderForEndpoint()`** (line 86–97) — Add MUAPI prefix detection and update return type:
   ```typescript
   function getProviderForEndpoint(
     endpoint: string
   ): "fal" | "elevenlabs" | "google" | "openrouter" | "muapi" {
     if (endpoint.startsWith("muapi/")) return "muapi";
     if (endpoint.startsWith("elevenlabs/")) return "elevenlabs";
     // ...existing
   }
   ```

2. **All executor function signatures** — Update provider type union to include `"muapi"`:
   ```typescript
   // Line 155, 173, 212, etc. — update all provider parameter types
   provider: "fal" | "elevenlabs" | "google" | "openrouter" | "muapi"
   ```

   Better: Extract to a shared type at the top of the file:
   ```typescript
   import type { ProviderName } from "../infra/api-caller.js";
   // Then use ProviderName everywhere instead of the inline union
   ```

3. **Local file upload** — MUAPI has its own CDN upload (`upload.sh`). For now, only FAL uploads are needed since MUAPI accepts direct URLs. Add a comment noting this for future reference.

---

### Subtask 4: Register MUAPI Models (~20 min)

**New file**: `electron/native-pipeline/registry-data/muapi-models.ts`

Register models that are **MUAPI-exclusive** (not available on FAL). Models available on both providers stay registered under FAL (it's the established default).

```typescript
import { ModelRegistry } from "../infra/registry.js";

export function registerMuapiModels(): void {
  // --- Text-to-Video (MUAPI-exclusive) ---
  ModelRegistry.register({
    key: "seedance_v2_t2v",
    name: "Seedance 2.0 Text-to-Video",
    provider: "muapi",
    endpoint: "muapi/seedance-v2.0-t2v",
    categories: ["text_to_video"],
    description: "ByteDance director-level video with native audio sync",
    pricing: { type: "per_video", cost: 0.15 },
    durationOptions: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "4:3", "3:4"],
    features: ["audio_sync", "multi_image_reference", "video_extension"],
    maxDuration: 15,
    costEstimate: 0.15,
    processingTime: 120,
  });

  // Seedance 2.0 Image-to-Video
  ModelRegistry.register({
    key: "seedance_v2_i2v",
    name: "Seedance 2.0 Image-to-Video",
    provider: "muapi",
    endpoint: "muapi/seedance-v2.0-i2v",
    categories: ["image_to_video"],
    description: "Animate 1-9 reference images with director-level control",
    pricing: { type: "per_video", cost: 0.15 },
    durationOptions: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "4:3", "3:4"],
    features: ["multi_image", "audio_sync", "tag_references"],
    maxDuration: 15,
    costEstimate: 0.15,
    processingTime: 120,
  });

  // Midjourney v7 (MUAPI-exclusive)
  ModelRegistry.register({
    key: "midjourney_v7",
    name: "Midjourney v7",
    provider: "muapi",
    endpoint: "muapi/midjourney-v7",
    categories: ["text_to_image"],
    description: "Midjourney v7 via MUAPI",
    pricing: { type: "per_image", cost: 0.05 },
    features: ["high_quality", "artistic"],
    costEstimate: 0.05,
    processingTime: 30,
  });

  // Suno V5 Music (MUAPI-exclusive)
  ModelRegistry.register({
    key: "suno_v5",
    name: "Suno V5 Music",
    provider: "muapi",
    endpoint: "muapi/suno-v5",
    categories: ["text_to_speech"], // closest existing category
    description: "AI music generation — create, remix, extend",
    pricing: { type: "per_song", cost: 0.10 },
    features: ["create", "remix", "extend", "text_to_audio"],
    costEstimate: 0.10,
    processingTime: 60,
  });

  // Lipsync (MUAPI-exclusive)
  ModelRegistry.register({
    key: "lipsync_sync",
    name: "Sync Labs Lipsync",
    provider: "muapi",
    endpoint: "muapi/sync-lipsync",
    categories: ["video_to_video"],
    description: "Sync video lip movement to audio",
    pricing: { type: "per_video", cost: 0.08 },
    features: ["lipsync", "audio_driven"],
    costEstimate: 0.08,
    processingTime: 90,
  });

  // Video Effects (MUAPI-exclusive)
  ModelRegistry.register({
    key: "ai_video_effects",
    name: "AI Video Effects",
    provider: "muapi",
    endpoint: "muapi/ai-video-effects",
    categories: ["image_to_video"],
    description: "360 rotation, dance, face-swap, style transfer, and more",
    pricing: { type: "per_video", cost: 0.05 },
    features: ["effects", "style_transfer", "face_swap"],
    costEstimate: 0.05,
    processingTime: 60,
  });
}
```

**File**: `electron/native-pipeline/registry-data/index.ts` (or wherever models are bulk-registered)

Add the import and call:
```typescript
import { registerMuapiModels } from "./muapi-models.js";
// In the registration function:
registerMuapiModels();
```

**Note**: Model keys, endpoints, and pricing should be verified against `schema_data.json` and the muapi.ai dashboard. The values above are approximations from the shell scripts.

**Test file**: `electron/native-pipeline/__tests__/muapi-models.test.ts`
- Test all registered models resolve via `ModelRegistry.get()`
- Test `listByCategory("text_to_video")` includes seedance models
- Test provider routing: `getProviderForEndpoint("muapi/seedance-v2.0-t2v")` returns `"muapi"`

---

### Subtask 5: Intent Mapper — Prompt Transformer (~20 min)

**New file**: `electron/native-pipeline/infra/intent-mapper.ts`

This is the valuable knowledge from Generative Media Skills' SKILL.md files, ported to TypeScript.

```typescript
/**
 * Intent Mapper — translates creative intent into technical director prompts.
 *
 * Ported from Generative-Media-Skills/library/motion/cinema-director/SKILL.md
 * and seedance-2/SKILL.md intent mapping tables.
 *
 * @module electron/native-pipeline/intent-mapper
 */

export type CreativeIntent =
  | "reveal"
  | "tense"
  | "epic"
  | "melancholy"
  | "introspective"
  | "cinematic";  // default fallback

interface DirectorBrief {
  framing: string;
  movement: string;
  lighting: string;
  lens: string;
}

const INTENT_MAP: Record<CreativeIntent, DirectorBrief> = {
  reveal: {
    framing: "Extreme wide shot",
    movement: "Slow crane up and tilt down",
    lighting: "Golden hour, volumetric god rays",
    lens: "Deep focus, high clarity",
  },
  tense: {
    framing: "Dutch angle, close-up",
    movement: "Handheld jittery movement",
    lighting: "Low key, harsh shadows, flickering neon",
    lens: "Shallow depth of field, anamorphic lens flare",
  },
  epic: {
    framing: "Low angle wide shot",
    movement: "Dolly in with circular orbit",
    lighting: "Dramatic rim lighting, high contrast",
    lens: "Anamorphic, 35mm film grain",
  },
  melancholy: {
    framing: "Medium shot, profile",
    movement: "Slow dolly out",
    lighting: "Blue hour, soft desaturated tones",
    lens: "Shallow bokeh, soft focus",
  },
  introspective: {
    framing: "Close-up",
    movement: "Slow push in",
    lighting: "Soft Rembrandt, window light",
    lens: "50mm, shallow depth of field",
  },
  cinematic: {
    framing: "Cinematic medium shot",
    movement: "Smooth pan",
    lighting: "Natural studio lighting",
    lens: "Standard 50mm",
  },
};

export function isCreativeIntent(value: string): value is CreativeIntent {
  return value in INTENT_MAP;
}

/**
 * Build a technical director prompt from a subject and creative intent.
 * Returns the raw subject if no valid intent is provided.
 */
export function buildDirectorPrompt(
  subject: string,
  intent?: string
): string {
  if (!intent || !isCreativeIntent(intent)) {
    return subject;
  }

  const brief = INTENT_MAP[intent];
  return [
    "[DIRECTOR_BRIEF]",
    `SCENE: ${subject}`,
    `FRAMING: ${brief.framing}`,
    `CAMERA_MOTION: ${brief.movement}`,
    `LIGHTING_DESIGN: ${brief.lighting}`,
    `OPTICS: ${brief.lens}`,
    "[EXECUTE] High-fidelity cinematic footage. Professional color grade, hyper-realistic physics.",
  ].join("\n");
}

/**
 * Build a Seedance 2 Director Brief from structured components.
 * Follows the Scene/Subject/Action/Camera/Style hierarchy.
 */
export function buildSeedanceBrief(components: {
  scene: string;
  subject: string;
  action?: string;
  camera?: string;
  style?: string;
}): string {
  const parts = [
    `[SCENE] ${components.scene}`,
    `[SUBJECT] ${components.subject}`,
  ];
  if (components.action) parts.push(`[ACTION] ${components.action}`);
  if (components.camera) parts.push(`[CAMERA] ${components.camera}`);
  if (components.style) parts.push(`[STYLE] ${components.style}`);
  return parts.join("\n");
}
```

**Test file**: `electron/native-pipeline/__tests__/intent-mapper.test.ts`
- Test each intent produces correct director brief structure
- Test unknown intent returns raw subject
- Test `isCreativeIntent()` validates correctly
- Test `buildSeedanceBrief()` assembles all components
- Test `buildDirectorPrompt()` with `undefined` intent returns raw subject

---

### Subtask 6: Wire Intent Mapper into CLI (~10 min)

**File**: `electron/native-pipeline/cli/cli-handlers-generate.ts` (or equivalent)

Add `--intent` flag to `generate-video` and `create-video` CLI commands:

```typescript
// When --intent is provided, transform the prompt before sending
import { buildDirectorPrompt } from "../infra/intent-mapper.js";

if (args.intent) {
  prompt = buildDirectorPrompt(prompt, args.intent);
}
```

This means the CLI supports:
```bash
bun run pipeline create-video --prompt "a samurai in a blizzard" --intent epic --model seedance_v2_t2v
```

And the intent mapper expands it to the full director brief before the API call.

**File**: `electron/native-pipeline/cli/command-registry.ts`

Add `--intent` to the command definition for video generation commands:
```typescript
{
  name: "intent",
  description: "Creative intent: reveal, tense, epic, melancholy, introspective",
  type: "string",
  required: false,
}
```

---

### Subtask 7: Add MUAPI Key to Settings UI (~10 min)

**File**: `apps/web/src/components/settings/api-keys-section.tsx` (or equivalent settings panel)

Add a MUAPI key input field following the same pattern as FAL/Gemini/ElevenLabs keys:
- Label: "MUAPI Key"
- Placeholder: "Your muapi.ai API key"
- Link: "Get your key at https://muapi.ai/dashboard"
- Stored via `window.electronAPI.apiKeys.set("muapiKey", value)`

**File**: `electron/api-key-handler.ts`

Add `muapiKey` to the encrypt/decrypt key object.

---

### Subtask 8: Integration Test — End-to-End (~15 min)

**New file**: `electron/native-pipeline/__tests__/muapi-integration.test.ts`

Test the full flow without hitting the real API (mock `fetch`):

1. Register MUAPI models
2. Look up `seedance_v2_t2v` from registry
3. Route to MUAPI provider via `getProviderForEndpoint()`
4. Apply intent mapping: `buildDirectorPrompt("a dragon", "epic")`
5. Call `executeStep()` with mocked MUAPI response
6. Verify polling handles `"completed"` status
7. Verify `extractOutputUrl()` parses `{ outputs: [url] }` shape
8. Verify error handling for `"failed"` status

---

## File Summary

| File | Action | Subtask |
|:-----|:-------|:--------|
| `electron/native-pipeline/infra/api-caller.ts` | Modify | 1 |
| `electron/native-pipeline/infra/key-manager.ts` | Modify | 2 |
| `electron/native-pipeline/execution/step-executors.ts` | Modify | 3 |
| `electron/native-pipeline/registry-data/muapi-models.ts` | **New** | 4 |
| `electron/native-pipeline/infra/intent-mapper.ts` | **New** | 5 |
| `electron/native-pipeline/cli/cli-handlers-generate.ts` | Modify | 6 |
| `electron/native-pipeline/cli/command-registry.ts` | Modify | 6 |
| `electron/api-key-handler.ts` | Modify | 2, 7 |
| `apps/web/src/types/electron.d.ts` | Modify | 2 |
| Settings UI component | Modify | 7 |
| `electron/native-pipeline/__tests__/api-caller-muapi.test.ts` | **New** | 1 |
| `electron/native-pipeline/__tests__/muapi-models.test.ts` | **New** | 4 |
| `electron/native-pipeline/__tests__/intent-mapper.test.ts` | **New** | 5 |
| `electron/native-pipeline/__tests__/muapi-integration.test.ts` | **New** | 8 |

## Execution Order

```
Subtask 1 (api-caller) ──┐
Subtask 2 (key-manager) ──┤── can be done in parallel
Subtask 5 (intent-mapper) ┘
         │
         ▼
Subtask 3 (step-executors) ── depends on Subtask 1 (ProviderName type)
         │
         ▼
Subtask 4 (registry models) ── depends on Subtask 3 (routing works)
         │
         ▼
Subtask 6 (CLI wiring) ── depends on Subtask 4 + 5
         │
         ▼
Subtask 7 (Settings UI) ── depends on Subtask 2
         │
         ▼
Subtask 8 (Integration test) ── depends on all above
```

**Total estimated scope**: ~100 min (2 new files of logic, 6 modifications, 4 test files)

## Design Principles

1. **No new abstraction** — MUAPI slots into the existing provider pattern. Same `callModelApi()`, same `executeStep()`, same `ModelRegistry`.
2. **Provider-agnostic intent mapping** — The intent mapper doesn't know about providers. It transforms prompts. The registry decides routing.
3. **FAL stays default** — Models available on both FAL and MUAPI keep their FAL registration. MUAPI registrations are for exclusive models only. This avoids breaking existing workflows.
4. **Polling is consistent** — `pollMuapiStatus()` follows the same adaptive interval pattern as FAL's `pollQueueStatus()`.
5. **Schema validation later** — The full 18K-line `schema_data.json` runtime parsing is deferred. Start with hardcoded TypeScript model registrations (consistent with existing FAL model registrations). If MUAPI model catalog changes frequently, add JSON schema loading in a follow-up.
