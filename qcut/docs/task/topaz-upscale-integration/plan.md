# Plan: Topaz Video Upscale Integration (fal.ai)

**Status**: Proposed
**Estimated time**: ~60–90 minutes
**Risk**: Low — adds a new handler following the exact pattern of the two existing upscalers. No schema migrations, no data model changes.

---

## Background

The question "do we support fal-ai/topaz/upscale/video?" — **not yet, but almost**. The UI, settings, request type, cost calculator, model registry entry, endpoint path, and even a stub generator are already wired up. What is missing is (a) the actual fal API call and (b) the handler that connects the UI to it. Today:

- The stub `upscaleTopazVideo` in `apps/web/src/lib/ai-video/generators/upscale.ts:185` still throws `new Error("Topaz Video Upscale not yet implemented")`.
- `routeUpscaleHandler` in `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts:436` short-circuits with a graceful "coming soon" skip (added 2026-04-21 in the tab-isolation fix).
- The model is flagged `comingSoon: true` in `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts:141`, so the Generate button is disabled in the UI.

This plan wires the handler end-to-end and removes the two "coming soon" guards.

### Reference — fal.ai API surface

Endpoint: `fal-ai/topaz/upscale/video` (already stored in the registry as `topaz/video-upscale` — the registry uses the path suffix fal's proxy expects).

Required: `video_url: string`.

Optional (per the fal API docs and a quick fetch of the model page):

| fal field | Type | QCut UI source | Notes |
|---|---|---|---|
| `upscale_factor` | float, default 2 | `TopazSettings.upscaleFactor` (2–8) | already in UI via slider |
| `target_fps` | integer — "if set, enables frame interpolation" | derived from `TopazSettings.targetFPS` | **type mismatch — see §Open question 1** |
| `H264_output` | boolean, default false (H265) | `TopazSettings.h264Output` | note the capital `H` in the fal field name |
| `model` | enum (Proteus, Artemis HQ/MQ/LQ, Nyx variants, Gaia HQ/CG/2, Starlight…) | not in UI | defer to fal default `Proteus` for v1 |
| `compression`, `noise`, `halo`, `grain`, `recover_detail` | float 0.0–1.0 each | not in UI | advanced params, defer |

Response: `{ video: { url, content_type?, file_name?, file_size? } }` — matches the shape already consumed by `upscaleByteDanceVideo` / `upscaleFlashVSRVideo`.

### What already exists (do not re-create)

- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts:457` — `TopazUpscaleRequest` interface.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-upscale-tab-state.ts` — full `TopazSettings` state + reset + memoized cost.
- `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-upscale-tab.tsx:476` — the Topaz settings card (slider, interpolation checkbox, H.264 checkbox, cost line).
- `apps/web/src/components/editor/media-panel/views/ai/utils/ai-cost-calculators.ts:202` — `calculateTopazUpscaleCost(factor)` with a 2×/3×/4×/6×/8× price table.
- `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts:132` — model registry entry (endpoint, price, category).
- `apps/web/public/model-logos/topaz.svg` — logo.

### Priority alignment

Per `CLAUDE.md` priority order (maintainability > scalability > performance > short-term gains):

- **Maintainability**: the implementation follows the ByteDance/FlashVSR pattern line-for-line. A future contributor adding Topaz 2 can copy the same shape.
- **Scalability**: v1 hardcodes sensible defaults for the advanced params. Expanding to a "model" picker or denoise sliders later is additive — no schema change.
- **Short-term tempation rejected**: we don't inline the fal call into the handler. The `upscaleTopazVideo` generator stays as the seam, matching the existing pattern.

---

## Subtasks

### Subtask 1 — Implement the `upscaleTopazVideo` generator

**Files**
- Modify `apps/web/src/lib/ai-video/generators/upscale.ts` (replace the `throw` body at line 185 with a real call; follow the exact shape of `upscaleByteDanceVideo` at line 33).

**Changes**
1. Resolve `falApiKey` via `getFalApiKeyAsync()`; throw a clear "not configured" error if missing. (ByteDance/FlashVSR already do this.)
2. Validate `request.video_url` is non-empty.
3. Validate `upscale_factor` is within `[2, 8]` (the UI slider clamps this already; this is defense in depth).
4. Resolve `endpoint` from `getModelConfig("topaz_video_upscale").endpoints.upscale_video` and error if absent.
5. Build the fal payload:
   - `video_url` (required)
   - `upscale_factor` (default 2)
   - `target_fps` — **only include when a numeric value is supplied** (see §Open question 1 for how the UI's string maps to a number)
   - `H264_output` — include as boolean (note the capital H)
6. POST via `makeFalRequest(endpoint, payload)`, handle non-OK via `handleFalResponse`.
7. Parse `result.video?.url ?? (typeof result.video === "string" ? result.video : result.url)` — same fallback shape as ByteDance so the code stays consistent.
8. Return `VideoGenerationResponse` with `job_id`, `status: "completed"`, a message like `"Video upscaled with Topaz (${factor}x)"`, and `video_data: result`.

**Acceptance**
- File compiles with no new TS errors.
- Function signature matches `TopazUpscaleRequest` → `Promise<VideoGenerationResponse>` — unchanged, already exported.

**Est. time**: 15 min

---

### Subtask 2 — Handle the `"original"` vs `"interpolated"` UI→API translation

**Files**
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` (if the `target_fps` field type needs adjustment)
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/upscale-handlers.ts` (where the UI value becomes an API value)

**Problem**
The UI models interpolation as `"original" | "interpolated"` (a UX toggle), but the fal API takes `target_fps: integer`. We need one of:

- **Option A (recommended for v1)**: `"original"` → omit `target_fps` entirely; `"interpolated"` → pass a fixed default (e.g., `60`) or `2 × source_fps` if we have it. Simplest mapping, no UI changes.
- **Option B**: Add a second control "Target FPS" that is visible only when `"interpolated"` is checked. More controls, better for power users, but scope creep for this PR.

**Decision**: go with A. Hardcode 60 as the interpolated default in the handler (not the generator — keeps the generator agnostic and typed). If the user later wants configurable interpolation, add a UI control without touching the generator.

**Changes**
1. In `upscale-handlers.ts` (new `handleTopazUpscale`, Subtask 3), translate:
   ```ts
   const targetFps =
     settings.topazTargetFPS === "interpolated"
       ? TOPAZ_INTERPOLATED_FPS  // const = 60
       : undefined;
   ```
2. Update `TopazUpscaleRequest.target_fps` in `request-types.ts` from `"original" | "interpolated"` to `number | undefined`, matching the real API. This is a breaking type change but the only caller is the handler we're writing.
3. Document the default with an inline `// Reason:` comment citing the fal doc.

**Acceptance**
- Type definition matches the wire format.
- Handler is the only place that knows about the "interpolated → 60 fps" policy.

**Est. time**: 10 min

---

### Subtask 3 — Write `handleTopazUpscale` and wire it into `routeUpscaleHandler`

**Files**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/upscale-handlers.ts` — add the new handler.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts:436` — replace the "coming soon" skip with a dispatch to the new handler.
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handler-types.ts` — extend `UpscaleSettings` with `topazUpscaleFactor`, `topazTargetFPS`, `topazH264Output` (so the handler receives them).
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-core.ts:484` — pass those three fields into `upscaleSettings` where `routeUpscaleHandler` is called (verify they are not already threaded through).
- `apps/web/src/components/editor/media-panel/views/ai/index.tsx` — confirm the three Topaz values from `upscaleTabState` are already passed into the generation hook; if not, thread them (the UI already owns them).

**Handler shape** (copy the ByteDance pattern exactly):

```ts
export async function handleTopazUpscale(
  ctx: ModelHandlerContext,
  settings: UpscaleSettings
): Promise<ModelHandlerResult> {
  if (!settings.sourceVideoFile && !settings.sourceVideoUrl) {
    return { response: undefined, shouldSkip: true, skipReason: "Video source required" };
  }

  let videoUrl = settings.sourceVideoUrl ?? undefined;
  if (settings.sourceVideoFile) {
    ctx.progressCallback({ status: "processing", progress: 10, message: "Uploading video for Topaz..." });
    try {
      videoUrl = await falAIClient.uploadVideoToFal(settings.sourceVideoFile);
    } catch (error) {
      return { response: undefined, shouldSkip: true, skipReason: `Failed to upload video: ${describe(error)}` };
    }
  }
  if (!videoUrl) {
    return { response: undefined, shouldSkip: true, skipReason: "Video URL could not be determined" };
  }

  ctx.progressCallback({
    status: "processing",
    progress: 30,
    message: `Upscaling with Topaz (${settings.topazUpscaleFactor}x)...`,
  });

  try {
    const response = await upscaleTopazVideo({
      video_url: videoUrl,
      upscale_factor: settings.topazUpscaleFactor,
      target_fps: settings.topazTargetFPS === "interpolated" ? 60 : undefined,
      h264_output: settings.topazH264Output,
    });
    ctx.progressCallback({ status: "completed", progress: 100, message: `Video upscaled with ${ctx.modelName}` });
    return { response };
  } catch (error) {
    return { response: undefined, shouldSkip: true, skipReason: `Topaz upscale failed: ${describe(error)}` };
  }
}
```

**Dispatch change** in `model-handlers.ts`:
```ts
case "topaz_video_upscale":
  return handleTopazUpscale(ctx, settings);   // replaces the shouldSkip "coming soon"
```

**Acceptance**
- `routeUpscaleHandler` no longer short-circuits Topaz.
- The UI's Topaz slider/checkboxes reach fal.
- `ensureGenerationCredits` (which runs at the top of `routeUpscaleHandler`) still gates Topaz, preserving the credit check.

**Est. time**: 20 min

---

### Subtask 4 — Remove the `comingSoon` flag and UI guard

**Files**
- `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts:141` — delete the `comingSoon: true` line from the Topaz entry.

**Acceptance**
- The button is selectable again in the Upscale tab.
- The `AIModelSelectionGrid` `disabled` / "Coming soon" branch is not triggered for Topaz.

**Keep** the `comingSoon?: boolean` field on `AIModel` and the grid's handling — it was designed as a reusable guard for future not-yet-implemented models, not a Topaz-specific hack.

**Est. time**: 2 min

---

### Subtask 5 — Verify cost calculator matches fal pricing

**Files**
- `apps/web/src/components/editor/media-panel/views/ai/utils/ai-cost-calculators.ts:202`

**Task**
Our table (2×=$0.50, 3×=$1.00, 4×=$2.00, 6×=$3.50, 8×=$5.00) was picked pre-integration. Before landing, confirm against fal's live pricing page (their docs pricing is sometimes per-second of output, not per-factor). If fal's billing differs, update the table and leave a comment citing the source.

**If pricing is per-second**, consider switching the estimator to `(sourceDurationSeconds × perSecondRate)` and plumb source duration through — but **defer that to a follow-up PR** unless the discrepancy is severe. Accuracy of cost estimates is a polish item, not a correctness requirement for the upscale itself.

**Est. time**: 5 min (read-only verification unless there's a mismatch)

---

### Subtask 6 — Unit tests

**New test files**
- `apps/web/src/lib/ai-video/generators/__tests__/upscale-topaz.test.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handle-topaz-upscale.test.ts`

**Coverage — generator (`upscale-topaz.test.ts`)**
1. Happy path — given a valid `video_url`, `upscale_factor`, `target_fps: 60`, `h264_output: true`, builds the expected payload and returns the parsed `video.url`.
2. Missing `video_url` throws a descriptive error.
3. `upscale_factor` out of range (e.g. 1 or 9) throws.
4. `target_fps` omitted when `undefined` (verify it's not sent as the string "undefined" or `null`).
5. Payload field name is `H264_output` exactly — regression against forgetting the capital `H`.
6. Error response handling — 401 and 429 produce the specific error messages (`handleFalResponse` already covers these; the test asserts the generator propagates them).

**Coverage — handler (`handle-topaz-upscale.test.ts`)**
1. Returns `shouldSkip` when neither `sourceVideoFile` nor `sourceVideoUrl` is provided.
2. Uploads file to fal when `sourceVideoFile` is set (mock `falAIClient.uploadVideoToFal`).
3. `"original"` → `target_fps` is `undefined` in the generator call.
4. `"interpolated"` → `target_fps` is `60` in the generator call.
5. Progress callbacks fire at 10/30/100 for the three phases.
6. Generator throwing is captured as a `shouldSkip` with `skipReason` — never bubbles as an unhandled throw (regression against the original bug that crashed Generate).

**Pattern reference** — mirror the mocking style from nearby tests: `apps/web/src/components/editor/media-panel/views/ai/hooks/__tests__/use-ai-polling.test.ts` and `apps/web/src/components/editor/media-panel/views/ai/hooks/__tests__/use-ai-generation-helpers.test.ts`.

**Est. time**: 25 min

---

### Subtask 7 — Manual smoke test in Electron dev

**Commands**
```
bun run electron:dev
```

**Steps**
1. Open AI panel → Upscale tab.
2. Confirm Topaz is no longer disabled / "Coming soon".
3. Upload a short (5–10 s) source video.
4. Select Topaz, pick `upscale_factor: 2`, leave interpolation off, check H.264.
5. Click Generate. Verify progress advances 10 → 30 → 100. The upscaled video must land in the Media panel and be playable.
6. Repeat with `upscale_factor: 4` and interpolation on. Video must play at a higher frame rate than the source (eyeball test — FFprobe the output if you want a hard number).
7. Force an error (e.g. invalid API key) and verify a clean toast instead of a crash.

**Est. time**: 10 min (assumes a test video is already handy)

---

## File-by-file summary

| File | Change | Subtask |
|---|---|---|
| `apps/web/src/lib/ai-video/generators/upscale.ts` | Replace Topaz stub with real fal call | 1 |
| `apps/web/src/components/editor/media-panel/views/ai/types/ai-types/request-types.ts` | `target_fps` type: `"original"\|"interpolated"` → `number \| undefined` | 2 |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/upscale-handlers.ts` | Add `handleTopazUpscale` | 3 |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts` | Dispatch Topaz to new handler (replace `shouldSkip`) | 3 |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handler-types.ts` | Extend `UpscaleSettings` with Topaz fields (if missing) | 3 |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-core.ts` | Thread Topaz settings into `upscaleSettings` (if missing) | 3 |
| `apps/web/src/components/editor/media-panel/views/ai/index.tsx` | Thread Topaz settings into the generation hook (if missing) | 3 |
| `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts` | Remove `comingSoon: true` from Topaz entry | 4 |
| `apps/web/src/components/editor/media-panel/views/ai/utils/ai-cost-calculators.ts` | Verify or update pricing table | 5 |
| `apps/web/src/lib/ai-video/generators/__tests__/upscale-topaz.test.ts` | **NEW** — 6 generator tests | 6 |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/__tests__/handle-topaz-upscale.test.ts` | **NEW** — 6 handler tests | 6 |

---

## Open questions

1. **`target_fps` UI mapping** — plan picks option A (interpolated = fixed 60). Confirm before coding; if product wants a numeric slider, this grows by ~15 min for the UI control.
2. **Pricing basis** — fal may bill per second of output rather than per upscale factor. Defer per-second pricing to a follow-up PR unless the v1 estimate is wildly off.
3. **`model` enum (Proteus/Artemis/Gaia/Starlight/…)** — deferred. If exposed later it belongs in the Topaz settings card as a Select and in `TopazSettings`.
4. **Source duration limits** — the registry says `max_duration: 120`. Fal does not advertise a hard limit on this page. If we want pre-flight validation, read the source video's duration in the handler and short-circuit with a clear skip reason.

---

## Rollout

Single PR. No feature flag — the product has been advertising Topaz in the UI; shipping means flipping the final guard.

**Dependencies that must be in place**:
- `VITE_FAL_API_KEY` env var (or per-user key from Settings) — already the requirement for ByteDance/FlashVSR.
- Credit gating: `ensureGenerationCredits` at the top of `routeUpscaleHandler` already runs — Topaz is covered the moment the dispatch is wired.

---

## Long-term-support rationale

- Keep the generator (`upscaleTopazVideo`) as the single seam to fal. All future Topaz tuning (more params, model enum, pricing refinement) touches one function.
- Keep the `comingSoon` flag on `AIModel` after removing it from Topaz. Future "in the UI, not yet wired" models get the same graceful disable.
- Keep the handler's `shouldSkip` error-handling branch. If fal changes a param name or returns an error, the user sees a toast rather than a Generate-killing throw — the exact shape that originally surfaced as the bug in `docs/task/ai-panel-tab-isolation/plan.md`.

---

## Related / references

- Previous plan that set up the "coming soon" guards this one removes: `docs/task/ai-panel-tab-isolation/plan.md`.
- fal.ai Topaz API page: `https://fal.ai/models/fal-ai/topaz/upscale/video/api`.
- Python reference implementation (for parameter semantics only — do not port verbatim; different package): `packages/video-agent-skill/packages/providers/fal/video-to-video/fal_video_to_video/models/topaz.py`.
- Pattern to copy: `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/upscale-handlers.ts` (`handleByteDanceUpscale`, `handleFlashVSRUpscale`).
