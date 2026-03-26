# Phota Integration — AI Photo Editing, Enhancement & Profile Creation

## Overview

Integrate [Phota](https://fal.ai/models/fal-ai/phota) (by Photalabs via FAL) into QCut — both the **native pipeline CLI** and the **editor UI**. Phota provides three endpoints:

1. **Edit** — prompt-driven image editing with optional identity preservation via profiles
2. **Enhance** — one-click image quality enhancement with optional identity preservation
3. **Create Profile** — upload reference images to create a reusable identity profile

All three run through FAL (`fal-ai/phota/*`), reusing our existing `callModelApi` / `uploadToFalStorage` (CLI) and `fal-ai-client` (UI) infrastructure.

## API Reference

### `fal-ai/phota/edit` (POST)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | — | Edit instructions. Use `@Profile1`, `@Profile2` to reference profiles |
| `image_urls` | string[] | No | — | Up to 10 source images (URLs or base64 data URIs) |
| `profile_ids` | string[] | No | — | Phota profile IDs for identity preservation |
| `num_images` | integer | No | 1 | Number of output images (1–4) |
| `resolution` | enum | No | "1K" | `1K` or `4K` |
| `aspect_ratio` | enum | No | "auto" | `auto`, `1:1`, `16:9`, `4:3`, `3:4`, `9:16` |
| `output_format` | enum | No | "jpeg" | `jpeg`, `png`, `webp` |

**Output:** `{ images: [{ url, width, height, file_size, content_type }] }`

### `fal-ai/phota/enhance` (POST)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_url` | string | Yes | — | Source image URL or base64 data URI |
| `profile_ids` | string[] | No | — | Profile IDs for identity preservation during enhancement |
| `num_images` | integer | No | 1 | Number of output images |
| `output_format` | enum | No | "jpeg" | `jpeg`, `png`, `webp` |

**Output:** `{ images: [{ url, width, height, file_size, content_type }] }`

### `fal-ai/phota/create-profile` (POST)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_data_url` | string | Yes | — | URL to a ZIP archive containing profile reference images |

**Output:** `{ profile_id: string }`

---

## Part A: CLI Integration

### Subtask 1: Register Phota models in the model registry (~5 min)

Add three model entries to the platform models registry file.

**Files:**
- `electron/native-pipeline/registry-data/platform-models.ts` — add `registerPhotaModels()` function with 3 model registrations
- `electron/native-pipeline/registry-data/index.ts` — import and call `registerPhotaModels()`

**Models to register:**

| Key | Endpoint | Categories |
|-----|----------|------------|
| `phota_edit` | `fal-ai/phota/edit` | `["image_to_image"]` |
| `phota_enhance` | `fal-ai/phota/enhance` | `["image_to_image"]` |
| `phota_create_profile` | `fal-ai/phota/create-profile` | `["training"]` |

---

### Subtask 2: Create CLI handler for Phota commands (~15 min)

New handler file following the pattern of `cli-handlers-translate.ts`.

**Files:**
- `electron/native-pipeline/cli/cli-handlers-phota.ts` — **new file**

**Three handler functions:**

#### `handlePhotaEdit(options, onProgress, signal) → CLIResult`
1. Accept `--input` (image path/URL, repeatable up to 10) + `--text` (prompt) + optional `--profile` (profile ID, repeatable)
2. Upload local files via `uploadToFalStorage()`
3. Call `callModelApi()` with endpoint `fal-ai/phota/edit`
4. Map `@Profile1`, `@Profile2` in prompt to `profile_ids` array order
5. Download output images to `--output-dir`

#### `handlePhotaEnhance(options, onProgress, signal) → CLIResult`
1. Accept `--input` (single image) + optional `--profile`
2. Upload local file if needed
3. Call `callModelApi()` with endpoint `fal-ai/phota/enhance`
4. Download enhanced image to `--output-dir`

#### `handlePhotaCreateProfile(options, onProgress, signal) → CLIResult`
1. Accept `--input` (path to ZIP of reference images)
2. Upload ZIP via `uploadToFalStorage()`
3. Call `callModelApi()` with endpoint `fal-ai/phota/create-profile`
4. Return `{ profile_id }` — print to stdout and save to JSON

**Key patterns to follow:**
- `cli-handlers-translate.ts` for FAL upload + `callModelApi` + download flow
- `cli-handlers-media.ts` for image output handling

---

### Subtask 3: Register CLI commands in command registry (~5 min)

**Files:**
- `electron/native-pipeline/cli/command-registry.ts` — add 3 command definitions + add to `generation` category

**Commands:**

```
phota:edit         — Edit images with AI (prompt + optional profiles)
phota:enhance      — Enhance image quality with AI
phota:profile      — Create a Phota identity profile from reference images
```

**Flags per command:**

`phota:edit`:
- `--text` / `-t` (required) — edit prompt
- `--input` / `-i` (required) — image file path or URL (repeatable)
- `--profile` — Phota profile ID (repeatable)
- `--resolution` — `1K` or `4K` (default: `1K`)
- `--aspect-ratio` — `auto`, `1:1`, `16:9`, `4:3`, `3:4`, `9:16`
- `--count` — number of outputs (1–4, default: 1)
- `--format` — output format: `jpeg`, `png`, `webp`

`phota:enhance`:
- `--input` / `-i` (required) — image file path or URL
- `--profile` — Phota profile ID (repeatable)
- `--count` — number of outputs (default: 1)
- `--format` — output format

`phota:profile`:
- `--input` / `-i` (required) — path to ZIP archive of reference images

---

### Subtask 4: Wire commands into CLI runner (~5 min)

**Files:**
- `electron/native-pipeline/cli/cli-runner/runner.ts` — import handlers, add `case` branches for `phota:edit`, `phota:enhance`, `phota:profile`

Follow the `translate-video` pattern:
```typescript
case "phota:edit":
    result = await handlePhotaEdit(resolvedOptions, onProgress, this.signal);
    break;
case "phota:enhance":
    result = await handlePhotaEnhance(resolvedOptions, onProgress, this.signal);
    break;
case "phota:profile":
    result = await handlePhotaCreateProfile(resolvedOptions, onProgress, this.signal);
    break;
```

---

## Part B: Editor UI Integration

### Subtask 5: Add Phota models to FAL AI client generation config (~10 min)

Register `phota_edit` and `phota_enhance` as available models in the UI generation layer so the existing text2image and image editing flows can use them.

**Files:**
- `apps/web/src/lib/ai-clients/fal-ai-client-generation.ts` — add Phota model entries to `convertSettingsToParams()` with correct parameter mapping:
  - `prompt` → `prompt`
  - `image_urls` → uploaded source images
  - `profile_ids` → profile IDs from settings
  - `aspect_ratio`, `resolution`, `num_images`, `output_format`

**Key mapping logic:**
```typescript
case "phota_edit":
    return {
        prompt: settings.prompt,
        image_urls: settings.imageUrls,
        profile_ids: settings.profileIds,
        resolution: settings.resolution || "1K",
        aspect_ratio: settings.aspectRatio || "auto",
        num_images: settings.count || 1,
        output_format: "jpeg",
    };
case "phota_enhance":
    return {
        image_url: settings.imageUrls?.[0],
        profile_ids: settings.profileIds,
        num_images: settings.count || 1,
        output_format: "jpeg",
    };
```

---

### Subtask 6: Add Phota Edit to Text2Image panel model list (~10 min)

Add `phota_edit` as a selectable model in the text-to-image generation panel. Phota Edit works as both text-to-image (no source image) and image-to-image (with source images).

**Files:**
- `apps/web/src/components/editor/media-panel/views/text2image.tsx` — add `phota_edit` to `TEXT2IMAGE_MODELS` array with label, icon, and description
- `apps/web/src/stores/ai/text2image-store.ts` — ensure `phota_edit` model key is handled in `generateImages()` flow (should work automatically via FAL client)

**Model entry:**
```typescript
{
    key: "phota_edit",
    label: "Phota",
    description: "AI photo editing with identity preservation",
    provider: "Photalabs",
    supportedSizes: ["1:1", "16:9", "4:3", "3:4", "9:16"],
}
```

---

### Subtask 7: Add Phota Enhance to image context menu (~15 min)

Add a one-click "Enhance with Phota" option to the image context menu in the media panel, similar to how upscale works. When clicked, uploads the image via Electron IPC, calls the enhance endpoint, and adds the result back to the media panel.

**Files:**
- `apps/web/src/components/editor/media-panel/views/text2image.tsx` — add "Enhance" action to image result cards (or wherever upscale lives)
- `apps/web/src/stores/ai/text2image-store.ts` — add `enhanceImage(imageUrl, profileIds?)` action that:
  1. Uploads image via `platform().fal.uploadImage()` (Electron IPC, bypasses CORS)
  2. Calls FAL `fal-ai/phota/enhance` with the uploaded URL
  3. Downloads result and adds to media panel via `addGeneratedImages()`

**Pattern:** Follow the existing `upscaleImage()` action in the text2image store.

---

### Subtask 8: Add Phota Edit to image editing flow (~15 min)

Add a "Edit with Phota" option for existing media images. User selects an image from the media panel, enters an edit prompt, and gets the edited result back.

**Files:**
- `apps/web/src/lib/ai-video/generators/image.ts` — add `editWithPhota(imageFile, prompt, profileIds?, resolution?)` function following the `uploadImageForSeeddream45Edit` pattern:
  1. Get FAL API key via `getFalApiKeyAsync()`
  2. Upload source image via `platform().fal.uploadImage()`
  3. Call FAL `fal-ai/phota/edit` HTTP endpoint with `{ prompt, image_urls: [uploadedUrl], profile_ids, resolution }`
  4. Return result image URL
- `apps/web/src/components/editor/media-panel/` — add UI trigger (button/dialog) for Phota edit on selected media images

**Upload flow (reuse existing pattern):**
```typescript
const apiKey = await getFalApiKeyAsync();
const uploadResult = await platform().fal.uploadImage(imageData, filename, apiKey);
const result = await fal.subscribe("fal-ai/phota/edit", {
    input: { prompt, image_urls: [uploadResult.url], profile_ids }
});
```

---

### Subtask 9: Profile management UI (~15 min)

Add a simple UI for creating and managing Phota profiles. Profiles are the key differentiator — they enable identity-consistent generation across edits.

**Files:**
- `apps/web/src/stores/ai/phota-profile-store.ts` — **new file**, Zustand store for profile management:
  - `profiles: { id: string, name: string, createdAt: Date }[]`
  - `createProfile(zipFile: File) → profileId` — uploads ZIP to FAL, calls create-profile
  - `deleteProfile(id)` — removes from local store
  - Persist to localStorage under key `"phota-profiles"`
- `apps/web/src/components/editor/media-panel/views/phota-profiles.tsx` — **new file**, small profile manager component:
  - List saved profiles with ID + name
  - "Create Profile" button → file picker for ZIP → calls store
  - Profile selector dropdown for use in edit/enhance flows

---

## Part C: Testing & Documentation

### Subtask 10: CLI unit tests (~10 min)

**Files:**
- `electron/native-pipeline/cli/__tests__/cli-handlers-phota.test.ts` — **new file**

**Test cases:**
- `handlePhotaEdit` — returns error on missing `--text`
- `handlePhotaEdit` — returns error on missing `--input`
- `handlePhotaEnhance` — returns error on missing `--input`
- `handlePhotaCreateProfile` — returns error on missing `--input`
- `handlePhotaCreateProfile` — returns error if file doesn't exist
- Verify profile IDs are correctly mapped to `@Profile1` prompt references

**Pattern:** Follow `electron/native-pipeline/replicate/__tests__/replicate-analyzer.test.ts` for mock-free validation tests.

---

### Subtask 11: Update documentation (~5 min)

**Files:**
- `.claude/skills/native-cli/references/REFERENCE.md` — add `phota:edit`, `phota:enhance`, `phota:profile` command docs with flags, examples, and output schema

---

## Summary

| # | Subtask | Scope | Time | Key Files |
|---|---------|-------|------|-----------|
| 1 | Register models | CLI | ~5 min | `registry-data/platform-models.ts`, `registry-data/index.ts` |
| 2 | CLI handlers | CLI | ~15 min | `cli/cli-handlers-phota.ts` (new) |
| 3 | CLI command registry | CLI | ~5 min | `cli/command-registry.ts` |
| 4 | CLI runner wiring | CLI | ~5 min | `cli/cli-runner/runner.ts` |
| 5 | FAL client generation config | UI | ~10 min | `lib/ai-clients/fal-ai-client-generation.ts` |
| 6 | Text2Image panel model | UI | ~10 min | `components/editor/media-panel/views/text2image.tsx` |
| 7 | Enhance context menu | UI | ~15 min | `stores/ai/text2image-store.ts`, text2image view |
| 8 | Edit flow for media images | UI | ~15 min | `lib/ai-video/generators/image.ts`, media panel |
| 9 | Profile management UI | UI | ~15 min | `stores/ai/phota-profile-store.ts` (new), profile view (new) |
| 10 | CLI unit tests | Test | ~10 min | `cli/__tests__/cli-handlers-phota.test.ts` (new) |
| 11 | Documentation | Docs | ~5 min | `.claude/skills/native-cli/references/REFERENCE.md` |

**Total estimated time: ~1 hr 50 min**

---

## Architecture Notes

- **Provider:** All three endpoints go through FAL as a proxy (`fal-ai/phota/*`), so only `FAL_KEY` is needed — no separate Phota API key required.
- **CLI uploads:** Reuse `uploadToFalStorage()` from `electron/native-pipeline/infra/api-caller.ts`.
- **UI uploads:** Reuse `platform().fal.uploadImage()` Electron IPC (bypasses CORS) from `electron/main-ipc/fal-upload-handlers.ts`.
- **UI generation:** Reuse `fal-ai-client` HTTP layer — generation calls FAL directly from the renderer (no IPC needed for the API call itself).
- **Media auto-add:** Results flow through `text2image-store.addSelectedToMedia()` → `media-store.addGeneratedImages()` automatically.
- **Profile persistence:** Stored in localStorage via Zustand persist. Profile IDs are opaque strings from Phota — we just store the mapping.
- **Naming convention:** CLI commands use `phota:*` prefix. UI model keys use `phota_edit`, `phota_enhance` (underscore, matching model registry).
- **COEP safety:** The media store already handles blob conversion for FAL URLs — no extra work needed.
