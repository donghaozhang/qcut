# Wan 2.7 Text-to-Image & Edit Integration

**Branch**: `wan27`
**Date**: 2026-04-02
**Estimated effort**: ~45 minutes (4 subtasks)

## Overview

Add Wan 2.7 image generation models to QCut. Four new FAL.ai endpoints:

| Model | Endpoint | Type |
|-------|----------|------|
| Wan 2.7 T2I | `fal-ai/wan/v2.7/text-to-image` | Text-to-Image |
| Wan 2.7 Pro T2I | `fal-ai/wan/v2.7/pro/text-to-image` | Text-to-Image |
| Wan 2.7 Edit | `fal-ai/wan/v2.7/edit` | Image Edit (1-4 ref images) |
| Wan 2.7 Pro Edit | `fal-ai/wan/v2.7/pro/edit` | Image Edit (1-4 ref images) |

## API Summary

### Text-to-Image (Standard & Pro)
Both share the same schema:
- **Required**: `prompt` (string, supports Chinese/English)
- **Optional**: `negative_prompt` (max 500 chars), `image_size` (enum or `{width, height}`), `max_images` (1-5), `seed` (0-2147483647), `enable_safety_checker` (default true)
- **Image size presets**: `square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9`
- **Output**: `{ images: [{ url, content_type, file_name, file_size }], seed }`

### Edit (Standard & Pro)
Both share the same schema:
- **Required**: `prompt` (string), `image_urls` (array of 1-4 image URLs, order matters)
- **Optional**: `negative_prompt` (max 500 chars), `image_size` (same presets), `num_images` (1-4), `enable_prompt_expansion` (default true), `seed`, `enable_safety_checker` (default true)
- **Output**: `{ images: [{ url, content_type, file_name, file_size }], seed }`

### Key Differences from Existing Wan v2.2
- v2.7 uses `max_images` (T2I) and `num_images` (Edit) instead of v2.2's single-image model
- v2.7 uses `portrait_4_3`/`portrait_16_9` naming (not `portrait_3_4`/`portrait_9_16` like v2.2)
- Edit endpoints add `image_urls` (reference images) and `enable_prompt_expansion`
- Pro variants are identical API-wise, just higher quality output

---

## Subtask 1: Add Model Definitions

**~10 min** | Files to modify:

### 1a. Create `apps/web/src/lib/text2image-models/wan-models.ts`

Add 4 `Text2ImageModel` entries following the pattern in `bytedance-models.ts`:

```typescript
export const WAN_MODELS: Record<string, Text2ImageModel> = {
  "wan-v2-7-t2i": { ... },       // Standard T2I
  "wan-v2-7-pro-t2i": { ... },   // Pro T2I
  "wan-v2-7-edit": { ... },      // Standard Edit
  "wan-v2-7-pro-edit": { ... },  // Pro Edit
};
```

Key config per model:

| Field | T2I Standard | T2I Pro | Edit Standard | Edit Pro |
|-------|-------------|---------|---------------|----------|
| endpoint | `https://fal.run/fal-ai/wan/v2.7/text-to-image` | `https://fal.run/fal-ai/wan/v2.7/pro/text-to-image` | `https://fal.run/fal-ai/wan/v2.7/edit` | `https://fal.run/fal-ai/wan/v2.7/pro/edit` |
| provider | `"Wan"` | `"Wan"` | `"Wan"` | `"Wan"` |
| qualityRating | 4 | 5 | 4 | 5 |
| speedRating | 4 | 3 | 4 | 3 |
| image_size presets | `portrait_4_3`, `portrait_16_9` (v2.7 naming) | same | same | same |
| costPerImage | ~5 cents | ~8 cents | ~5 cents | ~8 cents |
| maxResolution | `"2048x2048"` | `"2048x2048"` | `"2048x2048"` | `"2048x2048"` |

Edit models need `image_urls` in `availableParams` (type: special handling needed - array of image URLs).

### 1b. Register in `apps/web/src/lib/text2image-models/index.ts`

- Import `WAN_MODELS` from `./wan-models`
- Spread into `TEXT2IMAGE_MODELS`
- Add IDs to `TEXT2IMAGE_MODEL_ORDER` (position based on cost tier)
- Add to `MODEL_CATEGORIES` (PHOTOREALISTIC, HIGH_QUALITY)

### 1c. Update `recommendModelsForPrompt()` in index.ts

Add `"wan-v2-7-pro-t2i"` to photorealistic recommendations.

---

## Subtask 2: Add Parameter Conversion

**~10 min** | File to modify:

### `apps/web/src/lib/ai-clients/fal-ai-client-generation.ts`

Add cases in `convertSettingsToParams()` for the 4 new model IDs:

```typescript
case "wan-v2-7-t2i":
case "wan-v2-7-pro-t2i":
case "wan-v2-7-edit":
case "wan-v2-7-pro-edit": {
  const validWan27Sizes = [
    "square_hd", "square", "portrait_4_3", "portrait_16_9",
    "landscape_4_3", "landscape_16_9",
  ];
  if (typeof settings.imageSize === "string" && validWan27Sizes.includes(settings.imageSize)) {
    params.image_size = settings.imageSize;
  } else {
    params.image_size = "square_hd";
  }
  if (settings.negativePrompt) params.negative_prompt = settings.negativePrompt.slice(0, 500);
  // Edit-specific params
  if (model.id === "wan-v2-7-edit" || model.id === "wan-v2-7-pro-edit") {
    params.enable_prompt_expansion = true;
    if (settings.imageUrls && settings.imageUrls.length > 0) {
      params.image_urls = settings.imageUrls.slice(0, 4);
    }
  }
  break;
}
```

**Note**: v2.7 uses `portrait_4_3`/`portrait_16_9` (different from v2.2's naming). The implementation validates `image_size` against allowed presets and falls back to `square_hd`. Edit models include `image_urls` directly in the params (up to 4 images).

---

## Subtask 3: Wire Up Edit Flow (Image Upload)

**~15 min** | Files to check/modify:

The edit endpoints require `image_urls` - URLs of uploaded reference images. This is similar to `seeddream-v4-5-edit` which already exists.

### 3a. Check existing edit flow

- `apps/web/src/lib/ai-clients/fal-ai-client-reve.ts` - has `reveEdit()` function
- `apps/web/src/lib/ai-clients/fal-ai-client.ts` - orchestration
- `apps/web/src/lib/ai-video/core/fal-upload.ts` - FAL storage upload utility

### 3b. Ensure `generateWithModel()` passes `image_urls` for edit models

In `fal-ai-client-generation.ts`, the `generateWithModel()` function builds params and calls the FAL endpoint. For edit models, it needs to:
1. Accept reference image(s) from the caller
2. Upload them to FAL storage if they're local files
3. Include `image_urls` array in the request payload

Check how `seeddream-v4-5-edit` currently handles this - follow the same pattern.

### 3c. UI integration for edit models

Check `apps/web/src/components/editor/media-panel/views/text2image.tsx` and the AI view components to see if edit models already have image upload UI (since SeedDream v4.5 Edit exists). If so, the Wan 2.7 Edit models should work automatically once registered.

---

## Subtask 4: Register in Native Pipeline (Optional)

**~10 min** | File to modify:

### `electron/native-pipeline/registry-data/text-to-video.ts` (or create text-to-image registry)

Check if text-to-image models are registered in the native pipeline registry. If not, this subtask can be skipped - the web app flow via `fal-ai-client-generation.ts` is the primary path.

Also check:
- `electron/native-pipeline/infra/api-caller.ts` - FAL queue mode should work out of the box since these use standard FAL endpoints
- `electron/native-pipeline/infra/registry.js` - Add entries if pipeline CLI needs these models

---

## Testing

### Manual Testing
1. Open QCut editor > Media Panel > Text-to-Image tab
2. Select each of the 4 new Wan 2.7 models
3. Generate with a test prompt (e.g., "A serene mountain lake at sunset, photorealistic")
4. For edit models: upload 1-2 reference images, prompt with "Change the sky to sunset colors in image 1"
5. Verify output images display correctly and can be added to timeline

### Unit Tests
- `apps/web/src/lib/text2image-models/__tests__/wan-models.test.ts` - Verify model configs are valid
- `apps/web/src/lib/ai-clients/__tests__/fal-ai-client-generation.test.ts` - Verify parameter conversion for new models

### Automated
```bash
bun run test          # Unit tests pass
bun check-types       # No type errors
bun lint:clean        # No lint issues
```

---

## Architecture Notes

- **No new files needed for generation logic** - the existing `fal-ai-client-generation.ts` + `generateWithModel()` flow handles all FAL text-to-image models generically
- **Edit models follow SeedDream v4.5 Edit pattern** - reference images uploaded to FAL storage, URLs passed in request
- **Pro vs Standard** - identical API schemas, Pro just produces higher quality at higher cost. Represented as separate model entries for user choice
- **Chinese/English prompt support** - Wan 2.7 natively supports both, no translation layer needed

---

## Implementation Summary (2026-04-02)

**Status**: Complete

### Files Created
| File | Purpose |
|------|---------|
| `apps/web/src/lib/text2image-models/wan-models.ts` | 4 Wan 2.7 `Text2ImageModel` definitions (T2I, Pro T2I, Edit, Pro Edit) |

### Files Modified
| File | Changes |
|------|---------|
| `apps/web/src/lib/text2image-models/index.ts` | Import `WAN_MODELS`, add to `TEXT2IMAGE_MODELS`, `TEXT2IMAGE_MODEL_ORDER`, `MODEL_CATEGORIES` |
| `apps/web/src/lib/ai-clients/fal-ai-client-generation.ts` | Add `convertSettingsToParams()` cases for 4 Wan 2.7 models with size validation and negative prompt |
| `apps/web/src/lib/ai-clients/fal-ai-client-internal-types.ts` | Add `negativePrompt`, `numImages`, `imageUrls` to `GenerationSettings` |
| `apps/web/src/lib/ai-clients/image-edit-client.ts` | Add `MODEL_ENDPOINTS` for `wan-v2-7-edit` and `wan-v2-7-pro-edit` |
| `apps/web/src/lib/ai-clients/image-edit-capabilities.ts` | Add to `IMAGE_EDIT_MODEL_IDS` and `MODEL_CAPABILITIES` (multi-image, max 4) |
| `apps/web/src/lib/ai-clients/image-edit-models-info.ts` | Add model info entries for both Wan 2.7 edit variants |

### Tests Updated
| File | Changes |
|------|---------|
| `apps/web/src/lib/__tests__/image-edit-models-info.test.ts` | Model count 11 → 14 |
| `apps/web/src/lib/__tests__/image-edit-multi-image.test.ts` | Model IDs count 11 → 14, multi-image count 7 → 10 |
| `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts` | Registry count 15 → 19 |

### Test Results
```
bun run test (3 affected files) — 26/26 passed
npx tsc --noEmit — 0 errors
```
