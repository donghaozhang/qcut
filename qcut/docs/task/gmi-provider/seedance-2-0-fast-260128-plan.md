# GMI Seedance 2.0 Fast 260128 — GUI + CLI (implementation log)

> **Status: landed on branch `credit-system`.** T1–T8 complete. Pricing
> uses a conservative `$0.052/s` placeholder (matches the standard tier);
> reprice when GMI publishes the fast-tier rate. T9 (manual verification)
> is the only step left for the user.

## Final results

- **Renderer tests:** 123/123 pass.
- **CLI tests:** 79/79 pass (was 69 — added 10 for tier detection + fast adapter routing).
- **Type check:** clean for `apps/web` + `electron/`.
- **Coverage:** `AI_MODELS` grew from 92 → 95; every new entry priced
  automatically from its registry `price` string.

Commands:
```
# from apps/web
bunx vitest run src/lib/__tests__/credit-costs-coverage.test.ts \
  src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts \
  src/lib/ai-video/generators/__tests__/gmi-image-to-video.test.ts \
  src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts

# from repo root (CLI)
bunx vitest run electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-shot-adapter.test.ts \
  electron/native-pipeline/execution/__tests__/step-executors-vidu.test.ts
```

Files touched (summary):

| Layer | File | What changed |
| --- | --- | --- |
| Renderer registry | `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts` | Added `gmi_seedance_2_0_fast_260128_t2v` |
| Renderer registry | `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` | Added to picker order |
| Renderer registry | `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts` | Added capability block |
| Renderer registry | `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` | Added `gmi_seedance_2_0_fast_260128_i2v` + `_ref2v` + order |
| Generator | `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts` | Parameterised endpoint; added `generateSeedanceFast260128TextVideo` |
| Generator | `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts` | Same for ImageVideo + ReferenceVideo |
| Barrel | `apps/web/src/lib/ai-video/index.ts` | Re-export the 3 new generator fns |
| Handler | `.../handlers/text-to-video-handlers.ts` | New `handleSeedanceFast260128T2V` |
| Handler | `.../handlers/image-to-video-handlers-gmi.ts` | New I2V + Ref2V fast handlers |
| Routing | `.../model-handlers.ts` | 3 new `case` arms |
| CLI registry | `electron/native-pipeline/registry-data/text-to-video.ts` | Added fast T2V |
| CLI registry | `electron/native-pipeline/registry-data/image-to-video.ts` | Added fast I2V + Ref2V |
| CLI adapter | `electron/native-pipeline/cli/vimax-cli-handlers/video-shot-adapter.ts` | `SeedanceTier` type, `SEEDANCE_FAST_ENDPOINT`, `seedanceEndpointFor`, `resolveSeedanceTier`; GMI builders accept `tier` |
| CLI handler | `electron/native-pipeline/cli/vimax-cli-handlers/video-handler.ts` | Threads `tier` into `adaptShotForSeedance` |
| CLI executor | `electron/native-pipeline/execution/step-executors.ts` | Aspect-ratio remap widened to both endpoints |
| Tests | see test files listed in T7 | +12 new cases |

---

# Plan — Add GMI Seedance 2.0 **Fast** 260128 to GUI and CLI

Target: ship the `seedance-2-0-fast-260128` GMI Cloud endpoint as a
first-class model in both the renderer (editor GUI) and the native
pipeline CLI (`bun run qcut flow …`). It's a lower-latency sibling of
the already-supported `seedance-2-0-260128` with an identical request
and response shape — only the GMI `model` string and the renderer
`modelKey` change.

Covers text-to-video, image-to-video, and reference-to-video (Ref2V) —
three GMI endpoints in one family, mirroring the existing non-fast
trio.

## Why add it

- Same model family the user already relies on, ~same quality, but
  cheaper and faster per GMI's Fast tier positioning. Adding the
  sibling doubles the effective use-case coverage (drafts / previews vs
  final renders).
- The non-fast Seedance 260128 integration is already proven end-to-end
  (credit relay, refund, download, media-panel import). This change
  rides on that infrastructure; it's registry + routing only.

## Current state (verified)

| Surface                            | `seedance-2-0-260128` (standard) | `seedance-2-0-fast-260128` (fast) |
| ---------------------------------- | -------------------------------- | --------------------------------- |
| Renderer registry (T2V / I2V / Ref2V) | ✅ present                     | ❌ zero matches anywhere           |
| Renderer picker order / capabilities  | ✅ present                     | ❌                                  |
| Renderer generators                   | ✅ `generateSeedance260128*Video()` | ❌ — endpoint is hard-coded      |
| Renderer handlers + model-handlers routing | ✅ `handleSeedance260128{T2V,I2V,Ref2V}` | ❌                        |
| CLI registry (`text-to-video.ts` / `image-to-video.ts`) | ✅ present          | ❌                                  |
| CLI shot adapter (`video-shot-adapter.ts`) — `SeedanceVariant` union | ✅ 3 members | ❌                                |
| CLI step executor aspect-ratio remap  | ✅ `endpoint === "seedance-2-0-260128"` | ⚠ selector must be widened     |
| Tests across renderer + CLI           | ✅ several                     | ❌                                  |

## Open question: price

The GMI docs page you pasted does **not** include pricing for
`seedance-2-0-fast-260128`. Before merging, confirm the per-second
price from the GMI console / billing page and put it in the
`price` string verbatim — `estimateCreditCost` parses it at runtime and
will quietly over-bill to the upper bound if you guess high. A wrong
number here is the one real risk. Pricing known ⇒ unblock; otherwise
the plan below is still safe to execute with a placeholder
`"$0.052/s"` matching the non-fast variant (conservative), and a
follow-up to reprice once GMI publishes the number.

## Design

Everything except the `endpoint` string is identical, so the cheapest
design is:

1. **Parameterise the endpoint** in the shared generator functions
   (`generateSeedance260128*Video`) — they already take a `model` arg
   from the caller via `providerRouter.submit(endpoint, payload, "gmi")`,
   so this is a one-line rename plus a second endpoint constant.
2. **Keep the handlers thin.** Existing handlers (`handleSeedance260128*`)
   just forward `settings` to the generator. Either reuse them for the
   fast variant (dispatch on `modelId` inside) or add parallel
   `handleSeedanceFast260128*` that differ only in the generator call.
   The parallel route is clearer and easier to delete if the family
   ever diverges — recommend that unless you already feel pain.
3. **Model registry entries in both pools** (renderer + CLI) — copy
   the non-fast entries, update `id`, `name`, `price`, and
   `endpoints.*` to the `-fast-` string.
4. **Tests** mirror the non-fast variants one-for-one; no new test
   infrastructure needed.

Long-term invariant: the renderer's `modelKey` uses underscores
(`gmi_seedance_2_0_fast_260128_t2v`); GMI's `model` string uses hyphens
(`seedance-2-0-fast-260128`). Both conventions already apply to the
non-fast sibling — don't invent new shapes.

## Subtasks

Each ≤20 min, file paths listed.

### T0 — Confirm GMI pricing ⏳

- Fetch `https://console.gmicloud.ai` model-info page for
  `seedance-2-0-fast-260128` (GMI endpoint `GET /api/v1/ie/requestqueue/apikey/models/seedance-2-0-fast-260128`).
- If unavailable, ask Quriosity GMI account admin / or use the non-fast
  $0.052/s as a conservative placeholder and open a follow-up issue.

### T1 ✅ — Renderer T2V registry entry

- **File:** `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`
  - Duplicate the existing `gmi_seedance_2_0_260128_t2v` block (around
    line 563) as `gmi_seedance_2_0_fast_260128_t2v`.
  - Set `name`, `description`, `endpoints.text_to_video` → `"seedance-2-0-fast-260128"`, `price` → confirmed from T0.
  - Same `supportedResolutions` / `supportedDurations` /
    `supportedAspectRatios` as the non-fast — GMI docs you pasted
    confirm they match.
- **File:** `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts:45`
  - Add `"gmi_seedance_2_0_fast_260128_t2v"` next to the non-fast entry.
- **File:** `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/capabilities.ts`
  - Duplicate the `gmi_seedance_2_0_260128_t2v` capabilities block.

### T2 ✅ — Renderer I2V + Ref2V registry entries

- **File:** `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`
  - Duplicate both `gmi_seedance_2_0_260128_i2v` and `gmi_seedance_2_0_260128_ref2v` (around lines 743–788) as `gmi_seedance_2_0_fast_260128_i2v` and `gmi_seedance_2_0_fast_260128_ref2v`.
  - Update `endpoints.image_to_video` → `"seedance-2-0-fast-260128"`.
  - Add both IDs to `I2V_MODEL_ORDER` in the same file (around line 902).

### T3 ✅ — Renderer generator refactor (shared endpoint param)

- **File:** `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts`
  - `generateSeedance260128TextVideo(...)` currently hardcodes `"seedance-2-0-260128"`. Extract the endpoint into a parameter with default `"seedance-2-0-260128"`, and export a second thin wrapper `generateSeedanceFast260128TextVideo` that passes `"seedance-2-0-fast-260128"`.
  - Keep backward-compat export of the original function.
- **File:** `apps/web/src/lib/ai-video/generators/gmi-image-to-video.ts`
  - Same refactor for `generateSeedance260128ImageVideo` and
    `generateSeedance260128ReferenceVideo`.

### T4 ✅ — Renderer handler routes

- **File:** `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/text-to-video-handlers.ts`
  - Add `handleSeedanceFast260128T2V` next to `handleSeedance260128T2V` (~line 581). It's a 30-line copy with only the generator call changing.
- **File:** `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers-gmi.ts`
  - Add `handleSeedanceFast260128I2V` + `handleSeedanceFast260128Ref2V` (~lines 176–251). Same copy-and-swap-generator pattern.
- **File:** `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/model-handlers.ts`
  - Import the three new handlers.
  - Add `case "gmi_seedance_2_0_fast_260128_t2v"` to the T2V routing switch (~line 309).
  - Add the two I2V cases to the I2V routing switch.

### T5 ✅ — CLI registry entries

- **File:** `electron/native-pipeline/registry-data/text-to-video.ts`
  - Duplicate the `gmi_seedance_2_0_260128_t2v` `ModelRegistry.register({})` block (~lines 539–571) as the fast variant. Same pricing/durations/ratios, endpoint `"seedance-2-0-fast-260128"`.
- **File:** `electron/native-pipeline/registry-data/image-to-video.ts`
  - Duplicate the two blocks at ~lines 1041–1110 and 1112–1161 for the fast i2v and ref2v.

### T6 ✅ — CLI shot adapter + step executor

- **File:** `electron/native-pipeline/cli/vimax-cli-handlers/video-shot-adapter.ts`
  - Extend the `SeedanceVariant` union (~line 52) with three new members: `"gmi_seedance_2_0_fast_260128_t2v" | "_i2v" | "_ref2v"`.
  - `SEEDANCE_ENDPOINT` (~line 117) is now family-specific — introduce a helper `seedanceEndpointFor(variant)` returning `"seedance-2-0-260128"` or `"seedance-2-0-fast-260128"`. Update all call sites (~122 onward).
- **File:** `electron/native-pipeline/execution/step-executors.ts:147-152`
  - The `endpoint === "seedance-2-0-260128"` guard that remaps `aspect_ratio` → `ratio` needs to also match `"seedance-2-0-fast-260128"`. Switch to a prefix check (`endpoint.startsWith("seedance-2-0-")`) or a Set lookup.

### T7 ✅ — Tests

| Test file                                                                                      | What to add                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `apps/web/src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts`                     | Mirror the non-fast cases for the fast t2v generator (endpoint string assertion). |
| `apps/web/src/lib/ai-video/generators/__tests__/gmi-image-to-video.test.ts`                    | Same for i2v + ref2v.                      |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts` | Routing cases for the three new modelKeys.      |
| `apps/web/src/lib/__tests__/credit-costs.test.ts`                                              | One extra row — fast modelKey priced from its registry `price`. |
| `apps/web/src/lib/__tests__/credit-costs-coverage.test.ts`                                     | No change — total auto-updates to 95; the existing ≤10-fallback guard still holds. |
| `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-shot-adapter.test.ts`          | Parallel variant-selection + endpoint-swap cases. |
| `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-handler.test.ts`               | End-to-end smoke for the fast variant.     |
| `electron/native-pipeline/execution/__tests__/step-executors-vidu.test.ts`                     | Aspect-ratio remap applies to the fast endpoint too. |

Run: `bunx vitest run` from `apps/web`; `bunx vitest run` from `electron/native-pipeline`.

### T8 ✅ — Docs

- **File:** `docs/task/gmi-provider/seedance-2-0-fast-260128-plan.md` (this file) — convert to implementation log with ✅ per subtask.
- **File:** `docs/task/gmi-video-cli-guide/04-gmi-models.md` — add the fast variant row to the **Video models** table and the **Credit pricing** table.
- **File:** `docs/task/ai-model-catalogue/README.md` — add 3 rows (T2V + I2V + Ref2V) to the relevant sections; total goes from 92 to 95.
- **File:** `docs/task/ai-model-catalogue/models.csv` — same 3 rows.

### T9 — Manual verification

- Build with `bun run build`, restart Electron.
- GUI: pick **Seedance 2.0 Fast 260128 (GMI)** in the Create tab,
  generate a 4s T2V, confirm video lands on the timeline and credit
  ledger shows the right deduction.
- CLI: run the existing `flow script2video` with
  `--video-model gmi_seedance_2_0_fast_260128_t2v` against a small
  scenario; confirm the endpoint posted is `seedance-2-0-fast-260128`
  (visible in the per-shot JSON log).

## Out of scope (follow-ups)

- Automatic fallback from Fast → Standard on provider failure. Useful
  if you ever want "pay-for-best-effort" semantics; today the refund
  path already covers the failure case.
- A picker hint (“~2× faster, similar quality”) — design question for
  the AI panel, not strictly pricing work.
- Reprice fast variant with its own resolution-tier curve once GMI
  publishes tiered pricing. Will slot into `credit-costs.ts` as a
  `COST_OVERRIDES` entry if the registry `price` string can't express
  it cleanly.

## Risk / tradeoffs

- **Pricing unknown at plan-time.** If the real fast-tier price is
  *lower* than the non-fast (likely — GMI's whole pitch), the
  placeholder `$0.052/s` over-bills. Preferable to hold merge until we
  have the real number; falling back to correct-but-too-high credits
  is the safer failure mode.
- **Generator refactor blast radius.** Touching the shared
  `generateSeedance260128*` functions affects the non-fast path too.
  Mitigation: keep the existing signatures, add a second endpoint
  parameter with a default. Existing callers don't change.
- **CLI shot adapter endpoint assumption.** `SEEDANCE_ENDPOINT` is a
  module-level constant today. Any lingering call site that reads it
  directly needs updating — T6 is the critical "don't forget" step.
  Easy to miss in a copy-paste; run a grep after the edits:
  `rg seedance-2-0-260128 electron/ apps/web/ --hidden` should return
  only the new fast-variant occurrences alongside the non-fast ones,
  never a bare endpoint constant.
