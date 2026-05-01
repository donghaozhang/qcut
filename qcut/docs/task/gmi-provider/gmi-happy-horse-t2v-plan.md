# GMI Happy Horse T2V — `happyhorse1.0-t2v` (GMI Cloud Wan AI)

> **Goal.** Ship the GMI Cloud `happyhorse1.0-t2v` model as a first-class
> text-to-video model in both the renderer (editor GUI) and the native
> pipeline CLI (`bun run qcut flow …` / `qcut generate …`). It is a
> separate GMI-backed sibling of the existing FAL-backed `happy_horse_t2v`
> entry — same model family from Alibaba/Wan, different provider routing
> (GMI request-queue API), different pricing tier ($0.28/sec).
>
> **Estimated effort:** ~45–60 min (registry + executor mapping + GUI
> wiring + tests). Subtasked below.

---

## Spec (provided by user)

| Detail | Value |
| --- | --- |
| Provider | GMI Cloud (Serverless request-queue) |
| Model ID | `happyhorse1.0-t2v` |
| Submit URL | `POST https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests` |
| Auth | `Authorization: Bearer ${GMI_API_KEY}` |
| Pricing | **$0.28 / second** (video-length based) |
| Status | Available, Serverless (no warm-up) |

### Request payload shape (GMI)

```json
{
  "model": "happyhorse1.0-t2v",
  "payload": {
    "prompt": "A drone shot gliding over a misty forest at sunrise…",
    "negative_prompt": "blurry, low quality, distorted",
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 10,
    "audio_url": null,
    "prompt_extend": true,
    "watermark": false,
    "seed": 12345
  }
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `prompt` | string | ✅ | Free text |
| `negative_prompt` | string | optional | |
| `resolution` | enum | optional | `"720P"` / `"1080P"` — **uppercase P**, unlike FAL's `720p` |
| `ratio` | enum | optional | `"16:9"` / `"9:16"` / `"1:1"` / `"4:3"` / `"3:4"` |
| `duration` | int | ✅ | Continuous **2–15** seconds (note: starts at 2, FAL starts at 3) |
| `audio_url` | string \| null | optional | Optional audio-driven generation |
| `prompt_extend` | boolean | optional | Server-side prompt rewrite |
| `watermark` | boolean | optional | |
| `seed` | int | optional | |

### Differences from FAL `happy_horse_t2v` (already shipped)

| Field | FAL `happy_horse_t2v` | GMI `gmi_happy_horse_t2v` |
| --- | --- | --- |
| Provider | FAL | GMI Cloud |
| Endpoint | `alibaba/happy-horse/text-to-video` | `happyhorse1.0-t2v` (model-id only) |
| Pricing | $0 estimate | **$0.28/sec** |
| Duration | int **3–15** | int **2–15** |
| Resolution casing | `720p` / `1080p` | `720P` / `1080P` |
| Aspect-ratio param name | `aspect_ratio` | `ratio` |
| Negative prompt | not surfaced | `negative_prompt` |
| Audio | not surfaced | `audio_url` (audio-driven) |
| Prompt extension | not surfaced | `prompt_extend` |
| Watermark | not surfaced | `watermark` |

The two models therefore deserve distinct registry keys and distinct
GUI tiles — **do not** alias `happy_horse_t2v` to GMI.

---

## Current state (verified)

| Surface | FAL `happy_horse_t2v` | GMI `gmi_happy_horse_t2v` |
| --- | --- | --- |
| Renderer registry / picker | ✅ present | ❌ zero matches anywhere |
| Renderer capabilities | ✅ | ❌ |
| CLI registry (`text-to-video.ts`) | ✅ line 644 | ❌ |
| Step executor payload map | ✅ duration coercion line 174 | ❌ |
| Pricing surface | n/a (free tier estimate) | needs `0.28/s` entry |
| Tests | ✅ 37 validator tests + 11 step-executor tests | ❌ |

Provider scaffolding is **already in place** — GMI Cloud is registered as
a `ProviderName` in `electron/native-pipeline/infra/api-provider-urls.ts`,
key fetch goes through `key-manager.ts` with `GMI_API_KEY`, and several
GMI models (Seedance 2.0 / Seedance Fast / SkyReels v4 / Kling v3 Omni
/ Veo 3.1 Lite) already use `providerBackend: "gmi"` end-to-end. This
plan is purely **registry + payload mapping + UI surface** — no new
provider plumbing.

---

## Subtasks

### Subtask 1 — CLI registry entry

Register the model in the native pipeline so the CLI can submit it.

**File to modify:**
- `electron/native-pipeline/registry-data/text-to-video.ts`

Add a new `ModelRegistry.register({ … })` call alongside the existing
`gmi_seedance_2_0_260128_t2v` / `happy_horse_t2v` blocks (~line 638). Use
the seedance entry as a template — keep `providerBackend: "gmi"`. Key
fields:

```ts
ModelRegistry.register({
  key: "gmi_happy_horse_t2v",
  name: "Alibaba Happy Horse T2V (GMI)",
  provider: "Alibaba (via GMI)",
  endpoint: "happyhorse1.0-t2v",
  categories: ["text_to_video"],
  description:
    "Alibaba Wan AI Happy Horse 1.0 T2V — 720p/1080p, 2–15s, audio-driven, via GMI Cloud",
  pricing: { per_second: 0.28 },
  durationOptions: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // ints, not strings
  aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
  resolutions: ["720p", "1080p"],            // canonical lowercase — executor uppercases for GMI
  defaults: {
    duration: 5,
    resolution: "1080p",
    aspect_ratio: "16:9",                    // canonical name — executor renames to `ratio` for GMI
    prompt_extend: true,
    watermark: false,
  },
  features: [
    "negative_prompt",
    "audio_input",
    "prompt_extension",
    "seed_control",
    "watermark_toggle",
    "flexible_duration",
    "multiple_aspect_ratios",
  ],
  maxDuration: 15,
  inputRequirements: {
    required: ["prompt"],
    optional: [
      "duration", "resolution", "aspect_ratio", "negative_prompt",
      "audio_url", "prompt_extend", "watermark", "seed",
    ],
  },
  extendedFeatures: {
    start_frame: false,
    end_frame: false,
    ref_images: false,
    audio_input: true,        // audio-driven generation
    audio_generate: false,
    ref_video: false,
  },
  costEstimate: 1.4,           // 5s * $0.28
  processingTime: 60,
  providerBackend: "gmi",
});
```

**Why ints not strings for `durationOptions`?** The existing FAL Happy
Horse already learned this lesson — FAL rejected the string form with
`literal_error`. GMI does not enforce it as strictly, but keeping ints
aligns with the FAL twin and the duration-coercion branch in
`step-executors.ts:174`.

### Subtask 2 — Step executor payload mapping

GMI requires field-name and casing tweaks that don't apply to the FAL
twin. Add a dedicated branch in the GMI payload-prep section.

**File to modify:**
- `electron/native-pipeline/execution/step-executors.ts`

**Add after the `kling-v3-omni` block (~line 167)**:

```ts
// GMI Happy Horse 1.0 T2V uses different field names + casing than FAL.
// Canonicalize from the QCut form (aspect_ratio / 1080p) to GMI's form
// (ratio / 1080P). Duration must remain a number (registry already
// stores ints — no coercion needed).
if (provider === "gmi" && model.endpoint === "happyhorse1.0-t2v") {
  if (typeof payload.aspect_ratio === "string") {
    payload.ratio = payload.aspect_ratio;
    delete payload.aspect_ratio;
  }
  if (typeof payload.resolution === "string") {
    // GMI accepts "720P" / "1080P" (uppercase P)
    payload.resolution = payload.resolution.toUpperCase();
  }
  // GMI allows null for audio_url to mean "no audio-driven generation".
  if (payload.audio_url === undefined) {
    payload.audio_url = null;
  }
}
```

**Why not put this in the FAL `happy_horse_t2v` block?** FAL uses
`aspect_ratio` and lowercase `1080p`. The two providers diverge on
field naming — branching keeps each provider's quirks isolated.

### Subtask 3 — Renderer generator

Add a generator that calls the existing GMI client (no new client code
required — `gmi-text-to-video.ts` already follows the pattern for
Seedance/SkyReels).

**Files to modify (extend, don't create new files):**
- `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` — add `generateHappyHorseGmiTextVideo(request)`. Pattern: parameterise off `endpoint = "happyhorse1.0-t2v"` like the existing Seedance entries. Map QCut's `aspect_ratio` → `ratio`, uppercase `resolution`.
- `apps/web/src/lib/ai-video/index.ts` — re-export the new generator.
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` — add `GmiHappyHorseT2VRequest` (prompt, duration, resolution, ratio, negative_prompt?, audio_url?, prompt_extend?, watermark?, seed?).

**Why share `gmi-text-to-video.ts` instead of a new file?** Same provider
+ same submit/poll shape + ~30 LoC of model-specific param mapping.
Splitting it would hurt discoverability without aiding maintenance, and
the file is currently well under the 800-line ceiling.

### Subtask 4 — Renderer registry / model picker

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` — add `gmi_happy_horse_t2v` model entry with display name, description, defaults, `cost: 1.4`.
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` — append to picker order (after the existing `happy_horse_t2v` so the FAL/GMI siblings sit together).
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` — capability block: aspect ratios, resolutions, duration range, supports negative prompt, supports audio URL.

### Subtask 5 — Generation handler

Wire the picker selection through to the generator.

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts` — add `handleGmiHappyHorseT2V()` modeled on the existing `handleSeedance260128T2V`.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` — add a `case "gmi_happy_horse_t2v":` arm in `routeTextToVideoHandler`.

### Subtask 6 — Pricing / credit relay

GMI billing flows through the existing credit system; the only thing
that needs to be confirmed is that the registry's `pricing.per_second`
gets picked up.

**File to verify (read-only check, no edit expected):**
- `apps/web/src/lib/__tests__/credit-costs-coverage.test.ts` — running
  this test should report `AI_MODELS` count growing by +1 once the
  registry entry lands. If the coverage harness needs an explicit entry
  for the new key, add it the same way Seedance Fast did.

### Subtask 7 — Tests

| File | What to add |
| --- | --- |
| `electron/native-pipeline/execution/__tests__/step-executors-happy-horse.test.ts` | +3 cases: GMI payload mapping (`aspect_ratio` → `ratio`), uppercase resolution, default `audio_url: null` |
| `electron/native-pipeline/registry-data/__tests__/` (new file `gmi-happy-horse-t2v.test.ts`) | Registry entry exists, `providerBackend: "gmi"`, duration range 2–15, all 5 aspect ratios |
| `apps/web/src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts` | +2 cases: Happy Horse GMI generator submits to correct endpoint, threads negative_prompt + audio_url |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts` | +1 case: `gmi_happy_horse_t2v` routes to `handleGmiHappyHorseT2V` |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handler-exports.test.ts` | Bump T2V handler count by +1 |

### Subtask 8 — Live verification

Real-API smoke test using the existing license-server proxy (which
already routes GMI calls). One short generation is enough to catch any
field-name regressions:

```bash
qcut generate \
  --model gmi_happy_horse_t2v \
  --prompt "A drone shot gliding over a misty forest at sunrise" \
  --duration 5 \
  --resolution 1080p \
  --aspect-ratio 16:9 \
  --negative-prompt "blurry, low quality" \
  --output-dir ./out
```

Expected: video file written, JSON sidecar with prompt + model + GMI
request_id. If GMI returns `outcome.video_url`, `extractOutputUrl()`
in `api-provider-urls.ts` already handles it (line 84 — verified).

If `--negative-prompt` and `--audio-url` flags don't yet exist on the
CLI parser, add them in `electron/native-pipeline/cli/cli.ts` and
`electron/native-pipeline/cli/cli-runner/types.ts` as a one-line
extension of the existing `audio-setting` / `prompt` family.

---

## Implementation order

```text
Subtask 1  (CLI registry)
    ↓
Subtask 2  (step-executor payload mapping)   ← unblocks live CLI test
    ↓
Subtask 8  (smoke test via CLI — catch field regressions early)
    ↓
Subtask 3  (renderer generator)  ║  Subtask 4 (renderer registry)   ← parallel
    ↓
Subtask 5  (generation handler)
    ↓
Subtask 6  (pricing surface verification)
    ↓
Subtask 7  (tests for everything above)
```

The order intentionally puts the live smoke test **before** the renderer
work — a 30-second CLI roundtrip catches GMI field-name surprises far
faster than rebuilding the renderer to find them.

---

## Long-term considerations (why not a shortcut?)

1. **Don't merge with FAL `happy_horse_t2v`.** Same model family, but
   different provider, different pricing, different param shape, and
   different duration floor. A future user picking "Happy Horse" should
   see two tiles — FAL (free-tier-friendly) vs GMI ($0.28/sec, audio
   support) — and choose explicitly.
2. **Keep `aspect_ratio` canonical in the QCut layer.** Renaming to
   `ratio` only at the executor edge means:
   - the renderer keeps one consistent vocab across all models,
   - future GMI models that *also* use `aspect_ratio` (none today, but
     possible) won't need their own renaming branches,
   - if Wan AI later renames `ratio` → `aspect_ratio`, the fix is one
     branch deletion.
3. **Don't add `audio_url` flag to CLI globally.** Wire it model-side via
   `--audio-url` only when this model is selected; other models would
   silently no-op it and create confusion.
4. **Pricing should come from the registry, not be hardcoded in the UI.**
   `pricing.per_second: 0.28` plus `costEstimate` are enough — the
   `credit-costs-coverage` test already enforces this for every model
   tile, so the coverage breaks loudly if the wiring is wrong.

---

## Out of scope (future tickets)

- Image-to-video / Reference-to-video for the GMI Happy Horse family —
  not yet documented by GMI in the snippet provided; spec a separate
  plan once the I2V variant ships.
- Audio-driven generation UI — the model accepts `audio_url`, but
  exposing an audio uploader in the renderer is a larger panel-design
  task. CLI users can pass `--audio-url <https://…>` from day one.
- Migrating the existing FAL `happy_horse_t2v` to use the
  `providerRouter` abstraction described in
  `gmi-provider-integration.md`. This plan stays direct (`providerBackend`
  flag + executor branch) to match how Seedance/SkyReels were shipped.
