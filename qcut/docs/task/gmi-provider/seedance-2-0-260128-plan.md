# GMI Seedance 2.0 (`seedance-2-0-260128`) — Integration Plan

> **Status:** ✅ Implemented on 2026-04-14 (branch `cli-movie`).
>
> Target model: **`seedance-2-0-260128`** served via GMI Cloud at
> `https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests`.
> Pricing: **$0.052 / second** (length-based).
>
> Capabilities: text-to-video, image-to-video (first / last frame),
> reference images, reference videos, reference audios, native audio
> generation, web-search grounding.

## Implementation summary (2026-04-14)

Subtasks 1–5 landed, plus a follow-up **Ref2V variant**
(`gmi_seedance_2_0_260128_ref2v`) that mirrors the FAL
`seedance2_ref2v` UX — same model endpoint, but a distinct model tile
that takes a reference image (uploaded via `settings.selectedImage`)
and submits `reference_images` only (no `first_frame`).

Subtask 6 (docs page + proxy allowlist) deferred — the license-server
allowlist whitelists GMI video endpoints wholesale, so no per-model
change was required. Rollout step 6 remains optional follow-up for the
user-facing GMI models guide.

### Variants registered

| Key | Category | Required inputs | Notes |
|-----|----------|-----------------|-------|
| `gmi_seedance_2_0_260128_t2v` | text_to_video | `prompt` | Pure T2V |
| `gmi_seedance_2_0_260128_i2v` | image_to_video | `prompt` + `first_frame` | First-frame anchored, optional `last_frame` |
| `gmi_seedance_2_0_260128_ref2v` | image_to_video | `prompt` + `reference_images` (≥1) | Character-consistent, no first-frame |

### Image-source resolver (FAL CDN → data URI fallback)

GMI Cloud has **no public media-upload API** (research summary in
`docs/task/gmi-provider/seedance-2-0-260128-plan.md` history; the only
upload in the GMI Python SDK is the artifact-scoped `/get_bigfile_upload_url`
for ML model checkpoints, which doesn't return a video-API-compatible URL).

To unblock GMI-only users (no FAL key), **all** GMI I2V handlers
route image inputs through
`apps/web/src/lib/ai-video/generators/gmi-image-source.ts`:

- `handleGmiVeoLiteI2V` (Veo 3.1 Lite)
- `handleSkyreelsV4I2V` (SkyReels V4)
- `handleGmiKlingV3I2V` (Kling V3)
- `handleGmiKlingOmniI2V` (Kling V3 Omni)
- `handleGmiKlingMotionControl` (Kling 3 Motion Control)
- `handleSeedance260128I2V`
- `handleSeedance260128Ref2V`

- **Primary**: `settings.uploadImageToFal(file)` → public FAL CDN URL
  (kept as default — keeps GMI request bodies small and offloads
  bandwidth from the renderer).
- **Fallback**: on uploader rejection (typically "No FAL API key
  configured"), encode the file via `FileReader.readAsDataURL` and
  pass `data:image/<type>;base64,...` directly to GMI.
- **Size guard**: refuses to inline files above 10 MB (matches GMI's
  documented inline-input limit on Kling Omni / Seedance) — surfaces
  a clear error directing the user to configure `FAL_KEY`.

Tests live in `apps/web/src/lib/ai-video/generators/__tests__/gmi-image-source.test.ts`.

### Files changed

- `electron/native-pipeline/registry-data/text-to-video.ts` — added
  `gmi_seedance_2_0_260128_t2v` entry.
- `electron/native-pipeline/registry-data/image-to-video.ts` — added
  `gmi_seedance_2_0_260128_i2v` entry.
- `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` —
  added `Seedance260128Params` type, `applySeedance260128OptionalFields`
  helper, and `generateSeedance260128TextVideo`.
- `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts` —
  added `Seedance260128ImageParams` +
  `generateSeedance260128ImageVideo` (throws on missing first-frame),
  and `Seedance260128ReferenceParams` +
  `generateSeedance260128ReferenceVideo` (throws on empty
  `referenceImages`).
- `apps/web/src/lib/ai-video/index.ts` — re-exports both functions +
  both param types.
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`
  — added `gmi_seedance_2_0_260128_t2v` UI model.
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts`
  — added capability entry.
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts`
  — appended to GMI Cloud block.
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`
  — added UI model + order entry.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts`
  — added `handleSeedance260128T2V`.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers-gmi.ts`
  — added `handleSeedance260128I2V` and `handleSeedance260128Ref2V`.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts`
  — imports + routing cases for all three new handlers (T2V, I2V, Ref2V).
- `apps/web/src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts`
  — 4 new tests (payload shape, omit undefined, reference array gating,
  failed-poll).
- `apps/web/src/lib/ai-video/generators/__tests__/gmi-image-to-video.test.ts`
  — 3 new tests (firstFrame mapping, missing-first-frame throw,
  failed-poll).
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts`
  — extended T2V + I2V routing matrices with the Seedance cases.

### Test results

- `bunx vitest run apps/web/src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts apps/web/src/lib/ai-video/generators/__tests__/gmi-image-to-video.test.ts` → **25 tests passed**.
- `bunx vitest run apps/web/src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts` → **16 tests passed**.
- `bunx vitest run src/lib/ai-video/generators/__tests__/ src/components/editor/media-panel/views/ai/hooks/generation/__tests__/` (from `apps/web/`) → **50 tests passed** (full generator + routing suites).
- `bunx vitest run electron/native-pipeline/infra/__tests__/api-caller-gmi.test.ts` → **8 tests passed** (no regression in existing GMI plumbing).
- `bunx tsc -p apps/web/tsconfig.json --noEmit` → clean.

### Shared helper

To avoid duplicating optional-field mapping between the T2V and I2V
generators, `applySeedance260128OptionalFields(target, params)` lives
in `gmi-text-to-video.ts` and is imported by `gmi-image-to-video.ts`.
That keeps the payload contract (ratio / generate_audio / reference_*
mapping) in exactly one place.

## Summary

Add `seedance-2-0-260128` as a **dual-category** GMI model (T2V + I2V)
routed through the existing GMI backend
(`electron/native-pipeline/infra/api-caller.ts` → `pollGmiQueue`). Reuse
the `kling-v3-omni` wiring pattern; the only new shape is the payload
(uses `first_frame` / `last_frame` / `reference_*` instead of
`image_list` / `video_list`).

No new provider adapter, no new auth, no new polling path —
`provider: "gmi"` + the new registry entries cover the backend.

## Scope (estimated ~60 minutes → split into 6 subtasks)

| # | Subtask | Status | Doc |
|---|---------|:-----:|-----|
| 1 | Registry entries (T2V + I2V) | ✅ | [01-registry.md](./seedance-2-0-260128/01-registry.md) |
| 2 | Generator functions (ai-video + ViMax) | ✅ | [02-generators.md](./seedance-2-0-260128/02-generators.md) |
| 3 | UI model config (T2V + I2V) | ✅ | [03-ui-config.md](./seedance-2-0-260128/03-ui-config.md) |
| 4 | Model handler wiring | ✅ | [04-handlers.md](./seedance-2-0-260128/04-handlers.md) |
| 5 | Unit tests | ✅ | [05-tests.md](./seedance-2-0-260128/05-tests.md) |
| 6 | Docs + provider-key allowlist | ⏸ deferred | [06-docs-and-proxy.md](./seedance-2-0-260128/06-docs-and-proxy.md) |

## Guiding principles

- **Long-term maintainability** — follow the existing GMI pattern (keys
  prefixed `gmi_`, endpoint = raw model id, `providerBackend: "gmi"`).
  Do not introduce a new category, router, or adapter.
- **Simplicity first** — reuse `callModelApi({ provider: "gmi" })`; do
  not hand-roll a new HTTP client.
- **No silent defaults** — when a parameter is not provided by the
  caller, omit it from the payload rather than guessing (GMI API
  documents the server-side defaults).

## Cross-cutting changes at a glance

| File | Change |
|------|--------|
| `electron/native-pipeline/registry-data/text-to-video.ts` | register `gmi_seedance_2_0_260128_t2v` |
| `electron/native-pipeline/registry-data/image-to-video.ts` | register `gmi_seedance_2_0_260128_i2v` |
| `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` | add `generateSeedance260128TextVideo` |
| `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts` | add `generateSeedance260128ImageVideo` |
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` | add entry |
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` | add entry |
| `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` | append to GMI block |
| `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` | add entry |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` | add `handleSeedance260128T2V` |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers-gmi.ts` | add `handleSeedance260128I2V` |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` | route to new handlers |
| `electron/native-pipeline/vimax/adapters/video-adapter.ts` | works automatically via registry lookup (no change) |
| `packages/license-server/src/services/provider-keys.ts` | no change required — the existing GMI endpoint allowlist already covers `seedance-2-0-260128` |
| `apps/web/src/lib/credit-costs.ts` | optional per-second cost entry |
| `docs/task/gmi-video-cli-guide/04-gmi-models.md` | document the new model |

## Payload contract (authoritative reference)

Request body sent to `POST /api/v1/ie/requestqueue/apikey/requests`:

```jsonc
{
  "model": "seedance-2-0-260128",
  "payload": {
    "prompt": "string (required)",
    "duration": 5,                 // 4–15
    "resolution": "720p",          // "480p" | "720p" | "1080p"
    "ratio": "16:9",               // 16:9|4:3|1:1|3:4|9:16|21:9|adaptive
    "seed": 42,                    // optional, 0–4294967295
    "watermark": false,
    "generate_audio": true,
    "web_search": false,
    "first_frame": "https://...",         // optional, I2V anchor
    "last_frame": "https://...",          // optional, end anchor
    "reference_images": ["https://..."],  // optional
    "reference_videos": ["https://..."],  // optional
    "reference_audios": ["https://..."],  // optional
    "reference_asset_ids": ["asset-id"]   // optional
  }
}
```

**Duration**: integer seconds. `duration` is required to be numeric
(not a string like Kling Omni). The generator must coerce any string
input to a number before sending.

**Resolution / ratio** are both top-level payload fields (unlike
`aspectRatio` used by Veo). Do not use Kling's `aspect_ratio` key.

## Status polling

No change — `pollGmiQueue` already handles `queued → processing →
success/failed/cancelled` and reads `outcome.video_url` /
`outcome.media_urls[0].url` which this model already returns. Confirmed
by the response example in the user-supplied API spec.

## Rollout steps (in order)

1. Land subtask 1 (registry) — unlocks the ViMax adapter path.
2. Land subtask 2 (generators) — unblocks UI calls.
3. Land subtasks 3 + 4 (UI config + handler) together — UI needs both.
4. Land subtask 5 (tests) — can be parallel with 3/4.
5. Land subtask 6 (docs + proxy allowlist) last.

Each subtask is independently shippable; failures don't block the
others because the registry entry alone makes the model available to
the CLI / ViMax pipelines, and the UI entries are gated by their own
capability map.

## References

- API spec (user-supplied): `seedance-2-0-260128 API Usage Guide` —
  the canonical payload / response contract.
- Existing GMI pattern reference: `gmi_kling_v3_omni_t2v` registration
  in `registry-data/text-to-video.ts:501-518` and
  `registry-data/image-to-video.ts:909-938`.
- GMI polling: `electron/native-pipeline/infra/api-caller.ts:476-556`
  (`pollGmiQueue`).
- ViMax video adapter routing: `electron/native-pipeline/vimax/adapters/video-adapter.ts:72-87`
  (already registry-driven, auto-picks up new entries).
