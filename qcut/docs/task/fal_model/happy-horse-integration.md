# Alibaba Happy Horse Video Models — Integration Plan

**Date**: 2026-04-30
**Estimated Total**: ~95 minutes (6 subtasks)
**Priority**: Medium — adds a new T2V model, a multi-character ref2v model, and QCut's first prompt-driven video-edit model
**Source specs**:
- T2V: <https://fal.ai/models/alibaba/happy-horse/text-to-video/api>
- Ref2V: <https://fal.ai/models/alibaba/happy-horse/reference-to-video/api>
- Video-Edit: <https://fal.ai/models/alibaba/happy-horse/video-edit/api>

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
