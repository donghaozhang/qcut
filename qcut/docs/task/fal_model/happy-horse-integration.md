# Alibaba Happy Horse Video Models — Integration Plan

**Status**: ✅ Implemented and **verified end-to-end against the live FAL queue** on 2026-04-30 (subtasks 1–6 + two live-test bug fixes). All three models wired to the CLI; T2V + Ref2V wired to the GUI model picker. Video-Edit is CLI-only for this iteration — a "Video Edit" tab in the AI panel with multi-image uploader is left as a follow-up (see "Implementation summary" → "GUI scope" below).
**Date**: 2026-04-30
**Source specs**:
- T2V: <https://fal.ai/models/alibaba/happy-horse/text-to-video/api>
- Ref2V: <https://fal.ai/models/alibaba/happy-horse/reference-to-video/api>
- Video-Edit: <https://fal.ai/models/alibaba/happy-horse/video-edit/api>

---

## Implementation summary (2026-04-30)

### Files changed / added

**Pipeline registries (subtask 1):**
- `electron/native-pipeline/registry-data/text-to-video.ts` — added `happy_horse_t2v`.
- `electron/native-pipeline/registry-data/image-to-video.ts` — added `happy_horse_ref2v`.
- `electron/native-pipeline/registry-data/video-to-video.ts` — added `happy_horse_video_edit` under existing `video_to_video` category (no new category needed; `executeVideoToVideo` already handles `video_url + prompt`).

**CLI surface (subtask 1):**
- `electron/native-pipeline/cli/command-registry.ts` — added the three model keys to the `create-video --model` enum, plus `--video-url`, `--reference-images` (extended description), and a new `--audio-setting` flag (enum: `auto | origin`). Three new help examples cover T2V, Ref2V, and Video-Edit.
- `electron/native-pipeline/cli/cli.ts` — registered the `audio-setting` parser key and forwarded it to `CLIRunOptions.audioSetting`.
- `electron/native-pipeline/cli/cli-runner/types.ts` — added `audioSetting?: string`.
- `electron/native-pipeline/cli/cli-runner/handler-generate.ts` — new branch that maps `--reference-images` → `params.image_urls` (Ref2V, capped 9) or `params.reference_image_urls` (Video-Edit, capped 5) and validates `audio_setting`; loosened the create-video input check to accept `--video-url` or `--reference-images` (not just `--text` / `--image-url`).

**Step executor (subtask 2):**
- `electron/native-pipeline/execution/step-executors.ts`:
  - Top-level: stringifies `duration` for `happy_horse_t2v` / `happy_horse_ref2v` (FAL accepts only the string-enum form).
  - `executeImageToVideo`: new `happy_horse_ref2v` branch that merges the single `--image-url` (if provided) with the `params.image_urls` array, deduplicates, and caps at 9.
  - `executeVideoToVideo`: new branch that uploads each local entry in `payload.reference_image_urls` to FAL storage (≤5) — mirrors the existing `video_url` upload path.

**Renderer types (subtask 3):**
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` — added `HappyHorseDuration | Resolution | AspectRatio | AudioSetting` literal types and `HappyHorseT2VRequest | HappyHorseRef2VRequest | HappyHorseVideoEditRequest` interfaces.
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/index.ts` and `ai-types.ts` — re-exported the new types.

**Renderer validators (subtask 3):**
- `apps/web/src/lib/ai-video/validation/validators/happy-horse-validators.ts` (new) — duration/resolution/aspect-ratio/prompt/seed/image-urls/reference-images/video-edit-url/audio-setting validators + `isHappyHorseModel` / variant guards.
- `apps/web/src/lib/ai-video/validation/validators/index.ts` — re-exports.

**Renderer generators (subtask 3):**
- `apps/web/src/lib/ai-video/generators/happy-horse-generators.ts` (new) — `generateHappyHorseT2V`, `generateHappyHorseRef2V`, `generateHappyHorseVideoEdit`. One module instead of three (~250 LOC, well under the 800-line ceiling) since the three share validators and only diverge in payload shape.
- `apps/web/src/lib/ai-video/generators/text-to-video/shared.ts` — added `happy_horse_t2v` to the duration-stringify branch in `buildTextToVideoPayload` so the generic T2V flow also emits the correct payload shape.

**Renderer UI registry (subtask 4):**
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` — added `happy_horse_t2v` model entry.
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` — placed in T2V_MODEL_ORDER next to LTX 2.3.
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` — added capability flags (5 aspect ratios, 720p/1080p, 3–15 s duration enum, seed + safety checker, no negative prompt / prompt expansion).
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — added `happy_horse_ref2v` model entry + `I2V_MODEL_ORDER` slot adjacent to `seedance2_ref2v`.

**Renderer handler routing (subtask 4):**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` — new `handleHappyHorseRef2V`. Single-image GUI lift (uploads the `selectedImage` slot and calls the generator with a length-1 `image_urls` array). Multi-image (1–9) GUI uploader is the deferred follow-up; CLI users already get the full range.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` — registered the new handler in the I2V router.
- T2V routing falls through `routeTextToVideoHandler`'s `default → handleGenericT2V`, which already calls `generateVideo()` with the registered endpoint and the duration-stringification branch added in `shared.ts`.

**Tests (subtask 5):**
- `apps/web/src/lib/ai-video/validation/__tests__/happy-horse-validators.test.ts` (new) — **37 tests**, covers every validator with boundary cases.
- `electron/native-pipeline/execution/__tests__/step-executors-happy-horse.test.ts` (new) — **9 tests**, payload-shape contracts for all three models + Vidu/Seedance regression guards.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handler-exports.test.ts` — bumped expected handler counts (16→17 and 60→61) to absorb the new `handleHappyHorseRef2V`.

### Test results

**Unit tests:**
- `bunx vitest run apps/web/src/lib/ai-video/validation/__tests__/happy-horse-validators.test.ts` → **37/37 ✅**
- `bunx vitest run electron/native-pipeline/execution/__tests__/step-executors-happy-horse.test.ts` → **11/11 ✅** (added integer-coercion + multi-reference upload tests after live runs)
- `bunx vitest run apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/` → **15/15 ✅** (handler-exports updated, no regressions)
- `bunx vitest run apps/web/src/lib/ai-video/ electron/native-pipeline/execution/__tests__/ electron/native-pipeline/registry-data/__tests__/` → **200/200 ✅**
- Type checks (`tsc --noEmit` on both `electron/` and `apps/web/` projects) → clean.

**Live FAL runs** (queued through the QCut license-server proxy, beta tester account):

| Model | Inputs | FAL endpoint | Wall-clock | Output |
|---|---|---|---|---|
| `happy_horse_t2v` | prompt + 3s @ 720p 16:9 | `alibaba/happy-horse/text-to-video` | 101.2 s | `output_1777581645705.mp4` (2.7 MB) ✅ |
| `happy_horse_ref2v` | 2 reference PNGs (logo.png + icon.png) + 3s @ 720p 9:16 | `alibaba/happy-horse/reference-to-video` | 106.9 s | `output_1777581849069.mp4` (2.0 MB) ✅ |
| `happy_horse_video_edit` (auto audio) | T2V output as source + warm-tint prompt | `alibaba/happy-horse/video-edit` | 105.0 s | `output_1777581963020.mp4` (2.1 MB) ✅ |
| `happy_horse_video_edit` (origin audio + @Image1) | T2V output + logo.png ref + watermark prompt | `alibaba/happy-horse/video-edit` | 111.3 s | `output_1777582084777.mp4` ✅ |

### Bugs found by the live runs (and fixed)

1. **`duration` is an integer enum, not a string.** I had stringified `duration` for `happy_horse_t2v` / `happy_horse_ref2v` based on a misreading of the FAL spec ("enum 3–15"). The live endpoint returns `literal_error: "Input should be 3, 4, 5, …, 15"` when given `"5"`.
   - Fix: changed registry defaults from `"5"` → `5`, `durationOptions` from `["3"…"15"]` → `[3…15]`, removed the stringify branches in `step-executors.ts`, `generators/text-to-video/shared.ts`, and `generators/happy-horse-generators.ts`. Step-executor now coerces `string → number` for any registry-default leakage.
   - Test: new `coerces a string-form integer duration to a number` regression guard.
2. **Multi-reference local paths in `--reference-images` were sent verbatim to FAL.** The Ref2V branch only uploaded `input.imageUrl` (single); the array from `payload.image_urls` (set by `--reference-images`) bypassed the upload path. FAL responded with `Value error, Input must be a valid HTTPS URL or a Data URI`.
   - Fix: added an unconditional upload pass in `executeImageToVideo` after the per-model branches that walks `payload.image_urls` for `happy_horse_ref2v` and uploads any non-`https://` entries via `uploadToFalStorage`, capping at 9.
   - Test: new `uploads local paths in image_urls to FAL storage before submit` test that mocks `uploadToFalStorage` and asserts the local path is replaced while existing HTTPS URLs pass through.

### How it gets used

```bash
# T2V
qcut gen video -m happy_horse_t2v \
  -t "neon city street at dusk" \
  -d 5s --resolution 1080p --aspect-ratio 16:9

# Ref2V (multi-character) — pass --reference-images repeatedly
qcut gen video -m happy_horse_ref2v \
  -t "character1 hands character2 a coffee cup; character3 watches" \
  --reference-images https://.../alice.png \
  --reference-images https://.../bob.png \
  --reference-images https://.../carol.png \
  -d 5s --aspect-ratio 9:16

# Video-Edit
qcut gen video -m happy_horse_video_edit \
  --video-url https://.../source.mp4 \
  -t "make @Image1 wear a red coat in the rain" \
  --reference-images https://.../coat.png \
  --resolution 1080p --audio-setting origin
```

### Design choices recorded

- **Reused `create-video` instead of a new `edit-video` command.** The plan considered a dedicated `edit-video` command for clarity, but the existing `create-video` already accepts model-specific flags (`--image-url`, `--element-ids`, `--sound`, etc.). Adding `--video-url` and `--audio-setting` follows the established pattern and avoided forking command-routing, action-policy, and progress reporters. Help-text examples surface the video-edit usage explicitly. Revisit if a third video-edit model lands and the example list grows unwieldy.
- **Reused the existing `video_to_video` category** instead of introducing a `video_edit` `ModelCategory`. `executeVideoToVideo` already handles `video_url + prompt`, so the only new work was a `reference_image_urls` upload branch keyed on `model.key`. Cost estimation is a `pricing` field, not a category, so no estimation logic was perturbed.
- **One `happy-horse-generators.ts` module** rather than three sibling files. The three functions share 80% of their validation/payload-construction surface; the file weighs ~250 LOC. Splitting buys nothing today and would create three near-identical import graphs.
- **Field-name routing in `executeImageToVideo` stays per-key** (matches Vidu/Seedance pattern). Happy Horse uses `image_urls`, distinct from Vidu's `reference_image_urls` and GMI Seedance's `reference_images`. The vidu/seedance regression guards in the test file pin all four conventions so a future refactor can't silently degrade any of them.
- **Cost = `null` for now.** FAL has not published pricing for these endpoints. Registries pass `null as unknown as number` for the per-second `cost` and set `costEstimate: 0`. Once the first paid run lands, update the registries and surface the figure in the renderer's cost estimator.
- **GUI scope this iteration**: T2V works end-to-end through the existing model picker (generic T2V handler + duration stringification in `shared.ts`). Ref2V works with a single reference image (using the existing `selectedImage` slot). Multi-image upload UI (1–9 slots, "Insert character N" buttons) and the Video-Edit panel/tab are deferred — they require non-trivial changes to `ImageToVideoSettings`, `aiActiveTab` enum, and panel components. The CLI already supports the full feature set, so the deferred UI work is a productivity polish, not a functional gap.

---

## Overview

Integrate Alibaba's "Happy Horse" video family (3 endpoints) into QCut so they're usable from both the **GUI** (AI media panel) and the **CLI** (`qcut gen video` / new `qcut edit video`). All three share a 1080p/720p resolution toggle, 0–2147483647 seed, and `enable_safety_checker` flag.

| Variant                    | FAL endpoint                                  | Inputs                                                | Modality          | Notes                                       |
|----------------------------|-----------------------------------------------|-------------------------------------------------------|-------------------|---------------------------------------------|
| Happy Horse T2V            | `alibaba/happy-horse/text-to-video`           | `prompt`                                              | text → video      | 3–15 s, 5 aspect ratios                     |
| Happy Horse Ref2V          | `alibaba/happy-horse/reference-to-video`      | `prompt`, `image_urls` (1–9)                          | refs → video      | Prompt references `character1`…`character9` |
| Happy Horse Video-Edit     | `alibaba/happy-horse/video-edit`              | `video_url`, `prompt`, optional `reference_image_urls` (≤5) | video → video | First prompt-driven video-edit model in QCut. Output capped at 15 s |

**Pricing**: not advertised on the FAL pages — leave cost estimate as `null`/best-guess until a real run lands, then update from the FAL dashboard.

### Shared parameters (all three)

| FAL field                | Type      | Default   | Notes                                              |
|--------------------------|-----------|-----------|----------------------------------------------------|
| `prompt`                 | string    | —         | Required. ≤ 2500 chars                              |
| `resolution`             | enum      | `1080p`   | `720p` \| `1080p`                                   |
| `seed`                   | int       | —         | 0 – 2_147_483_647                                   |
| `enable_safety_checker`  | bool      | `true`    |                                                     |

### Variant-specific parameters

**T2V & Ref2V only**

| FAL field      | Default | Notes                                       |
|----------------|---------|---------------------------------------------|
| `aspect_ratio` | `16:9`  | `16:9 \| 9:16 \| 1:1 \| 4:3 \| 3:4`         |
| `duration`     | `5`     | enum string `"3"`–`"15"` (per FAL contract) |

**Ref2V only**

| FAL field    | Notes                                                          |
|--------------|----------------------------------------------------------------|
| `image_urls` | required list of 1–9 URLs, JPEG/JPG/PNG/WEBP, ≥400 px, ≤10 MB each |

**Video-Edit only**

| FAL field               | Default | Notes                                                                  |
|-------------------------|---------|------------------------------------------------------------------------|
| `video_url`             | —       | Required. MP4/MOV (H.264 recommended), 3–60 s in, ≤100 MB, AR 1:2.5–2.5:1, fps > 8 |
| `audio_setting`         | `auto`  | `auto` \| `origin` (preserve input audio)                                |
| `reference_image_urls`  | —       | Optional, ≤5 URLs, ≥300 px, ≤10 MB each — referenced via `@Image1`…`@Image5` |

> **Output cap**: Even though `video-edit` accepts up to 60 s of input, FAL truncates the result to 15 s.

---

## Subtask 1 — Pipeline Registry & CLI command surface (~15 min)

Long-term goal: a single source of truth for endpoints, defaults, and constraints so CLI + GUI stay in sync.

### Files to modify

- `electron/native-pipeline/registry-data/text-to-video.ts`
  - Add `ModelRegistry.register({ key: "happy_horse_t2v", endpoint: "alibaba/happy-horse/text-to-video", … })`.
  - `durationOptions: ["3","4","5","6","7","8","9","10","11","12","13","14","15"]`, `resolutions: ["720p","1080p"]`.
- `electron/native-pipeline/registry-data/image-to-video.ts`
  - Add `happy_horse_ref2v` entry.
  - `inputRequirements.required: ["prompt", "reference_image_urls"]`.
  - `extendedFeatures.ref_images: true`, `audio_input: false`.
  - Mark `maxReferenceImages: 9`.
- `electron/native-pipeline/registry-data/video-to-video.ts`
  - Add `happy_horse_video_edit` entry under a new `categories: ["video_edit"]` (sibling of `add_audio`, `upscale_video`).
  - `inputRequirements.required: ["video_url", "prompt"]`, `extendedFeatures: { ref_images: true, audio_setting: true }`, `maxReferenceImages: 5`.
- `electron/native-pipeline/cli/command-registry.ts`
  - Add `happy_horse_t2v` and `happy_horse_ref2v` to the `create-video --model` enum.
  - Add a new top-level command `edit-video` with `--model happy_horse_video_edit`, `--video-url`, `--prompt`, `--reference-image-urls` (repeatable), `--resolution`, `--audio-setting`, `--seed`.
  - Add example invocations in the `examples` array (see "How it gets used" below).
- `electron/native-pipeline/cli/aliases.ts`
  - Add `happy-horse-t2v`, `happy-horse-ref2v`, `happy-horse-edit` slug aliases.

### Why a new `edit-video` command (not overload `create-video`)
- `create-video` is text/image-driven; reusing it for a video-input model would muddy `--model` autocompletion and pollute help text.
- A dedicated command keeps `--video-url` non-optional via the schema, surfaces the `--audio-setting` flag in `--help`, and leaves room for future video-edit models without forking the original command.

---

## Subtask 2 — Step executor wiring (~10 min)

Files: `electron/native-pipeline/execution/step-executors.ts` (660+ LOC — keep new branches narrow; split if any function exceeds the 800-line ceiling).

### Changes

- **`executeTextToVideo`**: add a `happy_horse_t2v` branch — straight pass-through of `{ prompt, duration: String(d), aspect_ratio, resolution, seed?, enable_safety_checker? }`.
- **`executeImageToVideo`**: add a `happy_horse_ref2v` branch (new field name **`image_urls`** — different from Vidu's `reference_image_urls` and Seedance's `reference_images`; do **not** merge with existing branches). Wrap a single `--image-url` into a length-1 array, but accept multi-image input from the multi-flag form.
- **New** `executeVideoEdit` function (alongside `executeVideoToVideo`) handling category `video_edit`:
  - Validate URL reachability and 100 MB ceiling **before** queuing FAL.
  - Map `--reference-image-urls` (CLI repeatable) → `reference_image_urls`.
  - Pass `audio_setting`, `resolution`, `seed`, `enable_safety_checker` through.
- **Top-level dispatcher** (`switch` blocks at lines 52, 74, 178): add `case "video_edit":` → `executeVideoEdit(...)`.

### Type contracts

```typescript
// electron/native-pipeline/types/...
interface HappyHorseT2VPayload {
  prompt: string;
  duration?: "3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"11"|"12"|"13"|"14"|"15";
  aspect_ratio?: "16:9"|"9:16"|"1:1"|"4:3"|"3:4";
  resolution?: "720p"|"1080p";
  seed?: number;
  enable_safety_checker?: boolean;
}
interface HappyHorseRef2VPayload extends HappyHorseT2VPayload {
  image_urls: string[]; // 1–9
}
interface HappyHorseVideoEditPayload {
  video_url: string;
  prompt: string;
  reference_image_urls?: string[]; // 0–5
  resolution?: "720p"|"1080p";
  audio_setting?: "auto"|"origin";
  seed?: number;
  enable_safety_checker?: boolean;
}
```

Place these near the existing payload types in `electron/native-pipeline/execution/types/` (or inline in `step-executors.ts` if no shared file exists — match local convention).

---

## Subtask 3 — Renderer (`apps/web/src/lib/ai-video`) generators & validators (~15 min)

### Files to create

- `apps/web/src/lib/ai-video/generators/text-to-video/happy-horse-generator.ts` **(NEW)**
  - `generateHappyHorseT2V(req: HappyHorseT2VRequest): Promise<VideoGenerationResponse>`
  - Use `makeFalRequest()` from `core/fal-request.ts`. Pattern: copy `ltx23-generator.ts`.
- `apps/web/src/lib/ai-video/generators/happy-horse-ref2v-generator.ts` **(NEW)**
  - Sibling of `vidu-generators.ts` (image-to-video family lives at the top level).
  - Validate `image_urls.length` between 1 and 9 before submit.
- `apps/web/src/lib/ai-video/generators/happy-horse-video-edit-generator.ts` **(NEW)**
  - Imports `core/fal-request.ts`. Returns the same `VideoGenerationResponse` shape so existing media-import code works unchanged.

### Validators (single new file, three exports)

- `apps/web/src/lib/ai-video/validation/validators/happy-horse-validators.ts` **(NEW)**
  - `validateHappyHorseDuration(d: number | string): void` — accepts 3–15.
  - `validateHappyHorseImageUrls(urls: string[]): void` — 1–9 entries, http(s), no data URIs.
  - `validateHappyHorseVideoEditUrl(url: string, contentType?: string, sizeBytes?: number): void` — MP4/MOV, ≤100 MB.
  - `validateHappyHorseReferenceImages(urls?: string[]): void` — ≤5 entries.
  - `isHappyHorseModel(modelId: string): boolean` — type guard for handler routing.
  - Re-export from `apps/web/src/lib/ai-video/validation/validators/index.ts`.

### Why three generator files (not one Happy-Horse module)

CLAUDE.md caps files at 800 lines and discourages premature abstraction. Three separate files match the existing per-modality pattern (`text-to-video/`, top-level for ref2v, future `video-edit/`) and make import graphs cheap to trim if a modality is later removed.

---

## Subtask 4 — UI registry & settings components (~25 min)

### Model registry entries

- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`
  - Add `happy_horse_t2v` entry. Mirror `ltxv2_pro_t2v` shape.
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts`
  - Insert `happy_horse_t2v` near other 1080p mid-tier T2V models.
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts`
  - Capabilities: `multi_aspect: true`, `audio_generation: false`, `4k: false`.
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`
  - Add `happy_horse_ref2v` entry (`requiredInputs: ["referenceImages"]`, `maxReferenceImages: 9`, follow `seedance2_ref2v` shape).
  - Append to `I2V_MODEL_ORDER`.
- `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts`
  - Introduce a `VIDEO_EDIT_MODELS` map (or extend the existing aiActiveTab union) for the new modality.
  - Add `aiActiveTab: "video-edit"` to `apps/web/src/components/editor/media-panel/store.ts`.

### Settings components

- `apps/web/src/components/editor/media-panel/views/ai/components/ai-happy-horse-t2v-settings.tsx` **(NEW)**
  - Aspect (5 options), resolution (720p/1080p), duration slider 3–15, advanced: seed, safety checker.
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-happy-horse-ref2v-settings.tsx` **(NEW)**
  - Multi-image uploader (1–9 slots) with drag-reorder; "Insert character N" buttons that insert `character1`–`character9` tokens into the prompt textarea.
  - Same aspect/resolution/duration controls as T2V.
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-video-edit-panel.tsx` **(NEW)**
  - Video uploader (validates duration 3–60 s, size ≤100 MB, fps > 8 — pull metadata via existing `media-info` helper).
  - Reference image uploader (0–5 slots) with `@Image1`…`@Image5` insert buttons.
  - Audio setting radio: `auto` / `origin`.
  - Resolution, seed, safety checker.
  - Generate button with cost placeholder ("≈ TBD — pricing not yet published").

### Handler routing

- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts`
  - Route `happy_horse_t2v` → new `handleHappyHorseT2V`.
  - Route `happy_horse_ref2v` → new `handleHappyHorseRef2V`.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts`
  - Add `handleHappyHorseT2V(ctx)`.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts`
  - Add `handleHappyHorseRef2V(ctx)` — uploads each local file via `fal-upload.ts`, then submits.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/video-edit-handlers.ts` **(NEW)**
  - Add `handleHappyHorseVideoEdit(ctx)` — uploads source video + reference images via `fal-upload.ts`, then submits.

### Panel tab integration

- `apps/web/src/components/editor/media-panel/views/ai/ai-video-panel.tsx`
  - Append a "Video Edit" tab (`aiActiveTab === "video-edit"`) that renders `AIVideoEditPanel`.
  - Hide the tab when no `video_edit` model is registered (forward-compatible).

---

## Subtask 5 — Tests (~15 min)

### Unit (Vitest)

- `apps/web/src/lib/ai-video/validation/__tests__/happy-horse-validators.test.ts` **(NEW)**
  - Duration 0/2/3/15/16 boundary cases.
  - `image_urls` arity (0, 1, 9, 10) — 0 and 10 must throw.
  - Video-edit URL validator: MP4 ok, MKV rejected, >100 MB rejected.
  - `reference_image_urls` ≤ 5 boundary.
  - `isHappyHorseModel` returns true for the three IDs and false for `ltxv2_pro_t2v`.
- `apps/web/src/lib/ai-video/generators/__tests__/happy-horse-generator.test.ts` **(NEW)**
  - One test per variant verifying payload shape sent to `makeFalRequest`.
  - Mock the FAL client; assert endpoint string + payload keys.
- `electron/native-pipeline/execution/__tests__/step-executors-happy-horse.test.ts` **(NEW)**
  - Verify `executeImageToVideo` ref2v branch maps `--image-url` (single) → `image_urls: [url]`.
  - Verify `executeVideoEdit` passes `audio_setting` through and rejects unknown values.
  - Regression guard: existing Vidu/Seedance ref2v branches still produce their original field names.

### CLI smoke tests (manual, doc-only)

```bash
# T2V
qcut gen video -m happy_horse_t2v -t "neon city street at dusk" -d 5s --resolution 1080p --aspect-ratio 16:9

# Ref2V (multi-character)
qcut gen video -m happy_horse_ref2v \
  -t "character1 hands character2 a coffee cup; character3 watches" \
  --image-url https://.../alice.png \
  --image-url https://.../bob.png \
  --image-url https://.../carol.png \
  -d 5s --aspect-ratio 9:16

# Video-Edit
qcut edit video -m happy_horse_video_edit \
  --video-url https://.../source.mp4 \
  -t "make @Image1 wear a red coat in the rain" \
  --reference-image-urls https://.../coat.png \
  --resolution 1080p --audio-setting origin
```

Add the same three commands to `electron/native-pipeline/cli/__tests__/command-registry.test.ts` as parse-only tests (no network) to lock the CLI contract.

---

## Subtask 6 — Documentation & follow-up (~15 min)

- Update `docs/technical/media-panel-reference.md` with the new "Video Edit" tab and the three models (link this plan).
- Append a row to `docs/task/ai-model-catalogue/...` (if that catalogue is the canonical list).
- Add a short "How it gets used" section to **this** file once the smoke tests pass, mirroring the Vidu doc's post-implementation summary.
- Update `docs/task/fal_model/` README/index if one exists.

---

## Architecture Decisions

### Why three new generator files instead of extending one Happy-Horse module
Each modality already has its own folder/convention in `apps/web/src/lib/ai-video/generators/` (`text-to-video/`, top-level for image-to-video, none yet for video-edit). Forcing them into one file would obscure the per-modality contract and inflate the file beyond 300 LOC for no reuse benefit — the three payloads share only 4 fields.

### Why a new `video_edit` category vs. reusing `video_to_video`
- `video_to_video` is currently used for **automatic** transforms (ThinkSound adds audio, Topaz upscales) — they have no prompt and no reference assets.
- `video_edit` is **prompt-driven** with optional multi-image references. Treating it as the same category would force handlers to branch on subfields and corrupt cost estimation (Topaz is `per_video`, video-edit will be `per_second`).
- Keeping them separate is cheap now (one switch case) and avoids a refactor when the second video-edit model lands.

### Why we register `happy_horse_t2v` in the renderer config but ref2v / video-edit go through the existing image-to-video / new video-edit registries
Mirrors the path each model takes through QCut: the editor T2V flow already handles the "prompt-only → video" shape. Ref2V and video-edit need uploader UIs and asset uploads — those live in their own registry tables so the upload pipeline (`fal-upload.ts`) stays the single source for asset handling.

### Why we don't ship audio generation
None of the three models advertise native audio in the FAL spec. `video-edit`'s `audio_setting` only chooses between `auto` (model decides) and `origin` (preserve input). No knob is exposed.

### Why the CLI gets a new `edit-video` command rather than overloading `create-video`
- Keeps `--help` output crisp (one command per modality).
- Lets us require `--video-url` at the schema layer instead of run-time validation.
- Future video-edit models (Runway Aleph, Pika edit, Luma reframe) can register against the same command without further surgery.

---

## Dependency Map

```
Subtask 1 (CLI + pipeline registry)
    ↓
Subtask 2 (step executors, video_edit dispatcher)  ←  needs registry keys
    ↓
Subtask 3 (renderer generators + validators)        ←  can run in parallel with subtask 2
    ↓
Subtask 4 (UI panels + handler routing)            ←  needs subtask 3 output
    ↓
Subtask 5 (tests)                                  ←  needs all above
    ↓
Subtask 6 (docs + post-mortem)                     ←  after smoke tests pass
```

Subtasks 2 and 3 can run in parallel once subtask 1 lands the keys; subtasks 4 and 5 partially overlap (UI work and unit-test scaffolding don't share files).

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| FAL pricing not published yet | Cost estimator returns `null` with a `pricing: "TBD"` flag; show "≈ TBD" in UI; record actual cost from the first paid run and patch registry. |
| Ref2V prompt syntax (`character1`…`character9`) is opaque to users | "Insert character N" buttons in the uploader auto-add the token; tooltip explains the convention. |
| Video-edit uploads can be 100 MB | Pre-upload validation (size, duration, fps); show progress bar; reject with actionable error before FAL queue submit. |
| Output silently capped at 15 s for long input videos | Surface a one-line warning in the video-edit panel when input duration > 15 s. |
| New `aiActiveTab: "video-edit"` could collide with persisted store state | Bump the panel store version (per [Panel Store memory](../../../.claude/projects/-Users-peter-Desktop-code-qcut/memory/MEMORY.md)) so old localStorage entries are reset. |
| `image_urls` field name conflicts with FAL Seedance 2.0's `image_urls` ref2v in `executeImageToVideo` | The endpoint discriminates: route on registry `key` first, then build payload — never on field-name overlap. |
| Three near-identical settings components drift over time | Keep them small (< 150 LOC each) and pull truly shared bits into a `happy-horse-shared.tsx` only after the third copy-paste lands. Don't pre-abstract. |

---

## Out of scope (defer)

- Multi-shot batching (run T2V across an `<<<element_N>>>` list) — Happy Horse is single-shot only on FAL.
- Streaming previews — FAL only returns the finished file.
- Local video trimming before upload to fit the 15 s output cap — users already have the editor for that.
- Cost-aware rate limiting in the GUI — wait for real pricing to land.
