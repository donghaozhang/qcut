# GPT-Image-2 Integration — Implementation Plan

**Branch**: `GPT-Image2`
**Scope**: Add OpenAI GPT-Image-2 as a new text-to-image provider in QCut, surfaced in both the **native pipeline CLI** and the **GUI AI panel**. In the GUI, the model must appear at the **top** of the Text2Image model order.
**Estimated effort**: ~60–90 minutes (broken into subtasks below — each is ≤20 min).
**Priority (per CLAUDE.md)**: long-term maintainability > scalability > performance > short-term gains. No ad-hoc shims — reuse existing registration shapes, existing key manager, existing panel ordering mechanism.

---

## 1. Design Overview

QCut has a **semi-shared** image-provider architecture:

- **CLI side** — a single `ModelRegistry` in `electron/native-pipeline/` drives YAML pipelines and the native CLI. Models are registered in category-specific files under `registry-data/`.
- **GUI side** — an independent model catalog under `apps/web/src/lib/text2image-models/` is consumed by the AI panel. Sort order is controlled by a single `TEXT2IMAGE_MODEL_ORDER` array.

These two catalogs are not auto-synchronized; a new model must be registered in both places. This plan treats them as two distinct subtasks with matching metadata.

**Key decision — transport**:
- Existing sibling model `gpt-image-1-5` uses FAL.ai as a proxy (`fal-ai/gpt-image-1.5`) rather than a direct OpenAI client. This is the pattern we should follow for GPT-Image-2 if FAL exposes the endpoint, because:
  1. Key management already works (`VITE_FAL_API_KEY` is wired end-to-end).
  2. No new HTTP client or retry/backoff code.
  3. Consistent error/quota surface with siblings.
- If FAL does not yet proxy GPT-Image-2, fall back to a direct OpenAI call using the existing `OPENAI_API_KEY` (already in `KEY_NAMES` in `electron/native-pipeline/infra/key-manager.ts`). This fallback is documented in Subtask 1 as a branch point; do not implement both.

**Key decision — GUI "top" ordering**:
- The Text2Image panel sorts models by `TEXT2IMAGE_MODEL_ORDER` in `apps/web/src/lib/text2image-models/index.ts:21`. Inserting `"gpt-image-2"` at index 0 places it first in the grid — no new sort logic required. This is the same mechanism used to promote Seedance GMI in PR #281.

---

## 2. Prerequisites (do before coding)

| # | Task | Where |
|---|------|-------|
| P1 | Confirm FAL endpoint for GPT-Image-2 (e.g. `fal-ai/gpt-image-2`). If absent, branch to direct-OpenAI path. | FAL dashboard / OpenAI docs |
| P2 | Record actual pricing (per-image, by size/quality) and supported sizes/aspect ratios. Needed for `pricing.per_image` and `aspectRatios`. | OpenAI / FAL pricing |
| P3 | Decide the canonical model ID. Use `gpt-image-2` for GUI (kebab-case, matches `gpt-image-1-5`) and `gpt_image_2` for CLI (snake_case, matches `gpt_image_1_5`). | This plan |

Do **not** guess pricing — incorrect cost estimates propagate into the UI and export-cost calculators.

---

## 3. Subtasks

### Subtask 1 — CLI registry entry (≈10 min)

**File**: `electron/native-pipeline/registry-data/text-to-image.ts`

Add a new `ModelRegistry.register({...})` call, modelled on the existing `gpt_image_1_5` block at lines 115–132. Place it **immediately above** `gpt_image_1_5` so the file order mirrors the GUI "top" position.

Required fields (shape confirmed from existing siblings):
```ts
{
  key: "gpt_image_2",
  name: "GPT-Image-2",
  provider: "OpenAI (via FAL)",          // or "OpenAI" if direct path
  endpoint: "fal-ai/gpt-image-2",        // confirm in P1
  categories: ["text_to_image"],
  description: "OpenAI GPT-Image-2 — next-gen prompt-adherent image generation",
  pricing: { per_image: <from P2> },
  aspectRatios: [<from P2>],
  defaults: { image_size: "...", quality: "...", output_format: "png" },
  features: ["gpt_powered", "high_quality", ...],
  costEstimate: <from P2>,
  processingTime: <estimated seconds>,
}
```

**Long-term note**: Do not inline the endpoint string in call sites. All references flow through `ModelRegistry.get("gpt_image_2")` so future endpoint migrations are a one-line change here.

---

### Subtask 2 — GUI model definition (≈15 min)

**File**: `apps/web/src/lib/text2image-models/other-models.ts`

Add a `"gpt-image-2"` entry to `OTHER_MODELS`, modelled on the existing `"gpt-image-1-5"` block at lines 454–538. Place it **at the top** of the object (before `wan-v2-2`) so file-order reflects visual priority — this is cosmetic but aids maintainability.

Required shape (matches `Text2ImageModel` type in `apps/web/src/lib/text2image-models/types.ts`):
- `id: "gpt-image-2"`
- `name: "GPT-Image-2"`
- `provider: "OpenAI"`
- `endpoint`: `https://fal.run/fal-ai/gpt-image-2` (or direct OpenAI URL)
- `qualityRating`, `speedRating`, `estimatedCost`, `costPerImage` (cents)
- `maxResolution`, `supportedAspectRatios` (from P2)
- `defaultParams` + `availableParams` array (mirror `gpt-image-1-5` parameter shape — `image_size`, `background`, `quality`, `num_images`, `output_format`)
- `bestFor`, `strengths`, `limitations` — factual, no marketing copy

**No new file**. Adding a dedicated `openai-models.ts` alongside `google-models.ts`/`bytedance-models.ts` is tempting but premature — there is only one OpenAI model family in the GUI today. Revisit if a third OpenAI model lands.

---

### Subtask 3 — Promote to top of GUI order (≈5 min)

**File**: `apps/web/src/lib/text2image-models/index.ts`

Two edits:

1. **Line 21–38 (`TEXT2IMAGE_MODEL_ORDER`)** — insert `"gpt-image-2"` as the **first** element:
   ```ts
   export const TEXT2IMAGE_MODEL_ORDER = [
     "gpt-image-2",      // ← new, top position
     "gemini-3-pro",
     "gpt-image-1-5",
     // ...unchanged
   ] as const;
   ```
2. **Lines 115–162 (`MODEL_CATEGORIES`)** — add `"gpt-image-2"` to both `PHOTOREALISTIC` and `HIGH_QUALITY` (alongside `gpt-image-1-5`). Do **not** add to `FAST` or `COST_EFFECTIVE` without speed/price evidence from P2.

**Do not** add the model to `recommendModelsForPrompt` heuristic yet — that is a follow-up task once we have real usage signals.

---

### Subtask 4 — Unit tests (≈15 min)

Add small, focused assertions that break loudly if someone removes or renames the model.

**CLI tests** — `electron/__tests__/native-registry.test.ts`
- Add a case to the existing `text_to_image` category check asserting `ModelRegistry.listByCategory("text_to_image")` includes an entry with `key === "gpt_image_2"`.
- Assert the entry's `endpoint`, `pricing.per_image`, and `categories` match what we registered.

**GUI tests** — `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts` (create if missing; follow the `.test.ts` convention used in `apps/web/src/lib/text2image-models/__tests__/`)
- `TEXT2IMAGE_MODEL_ORDER[0]` equals `"gpt-image-2"` (this is the "top of GUI" contract — regressing this fails the test).
- `TEXT2IMAGE_MODELS["gpt-image-2"]` is defined and has `provider === "OpenAI"`.
- `getText2ImageModelEntriesInPriorityOrder()[0][0] === "gpt-image-2"`.

**No E2E test** in this PR — the AI panel E2E harness (`apps/web/src/test/e2e/ai-enhancement-export-integration.e2e.ts`) is slow and already covers the grid render path; adding a per-model E2E gives diminishing returns.

---

### Subtask 5 — Documentation updates (≈10 min)

1. **`docs/technical/media-panel-reference.md`** — section "2. AI Images (Text2Image)" (lines 83–115 per exploration). Append `GPT-Image-2` to the listed models; keep the existing `GPT Image 1.5` entry — the two coexist.
2. **`docs/task/gpt-image-2/implementation-plan.md`** — this file. Keep it updated if scope shifts.
3. **`CLAUDE.md`** env-var section — no change needed; `OPENAI_API_KEY` is already documented.

---

### Subtask 6 — Manual QA (≈15 min)

Per CLAUDE.md "When Working on Features" checklist:

1. `bun run electron:dev` — open AI panel → Text2Image tab. Confirm GPT-Image-2 appears as the first card. Generate one image end-to-end.
2. `bun run electron` (production build) — repeat smoke test to catch packaging-time path issues (FFmpeg paths, key loading from `~/.qcut/.env`).
3. `bun run pipeline -- --help` — confirm `gpt_image_2` shows up in the model list of the native CLI.
4. Run `bun run pipeline` with a tiny YAML that calls `gpt_image_2` to confirm key resolution + response parsing.
5. `bun check-types` and `bun lint:clean` before committing.

Abort and investigate if: the panel renders but generation fails silently (likely a key wiring issue), or the model appears at a non-top position (likely a stale memoized selector — check `text2image-store.ts`).

---

## 4. File Reference Map

| Layer | File | Change |
|-------|------|--------|
| CLI registry | `electron/native-pipeline/registry-data/text-to-image.ts` | Add `ModelRegistry.register({ key: "gpt_image_2", ... })` above line 115 |
| CLI key mgr | `electron/native-pipeline/infra/key-manager.ts` | No change — `OPENAI_API_KEY` + `VITE_FAL_API_KEY` already present |
| GUI model def | `apps/web/src/lib/text2image-models/other-models.ts` | Prepend `"gpt-image-2"` entry to `OTHER_MODELS` |
| GUI order | `apps/web/src/lib/text2image-models/index.ts:21` | Insert `"gpt-image-2"` at index 0 of `TEXT2IMAGE_MODEL_ORDER` |
| GUI categories | `apps/web/src/lib/text2image-models/index.ts:115` | Add to `PHOTOREALISTIC` + `HIGH_QUALITY` |
| CLI tests | `electron/__tests__/native-registry.test.ts` | Add registry assertions for `gpt_image_2` |
| GUI tests | `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts` | Add top-of-order and model-presence assertions |
| Panel doc | `docs/technical/media-panel-reference.md` | Append GPT-Image-2 to the Text2Image model list |
| This plan | `docs/task/gpt-image-2/implementation-plan.md` | Source of truth for the rollout |

---

## 5. Risks & Long-Term Maintainability Notes

- **Catalog drift** — CLI and GUI model lists are independent. A future refactor should extract a shared JSON/TS manifest both consume, but that is out of scope here and attempting it in this PR would 5× the diff. Track as a separate tech-debt note.
- **Endpoint churn** — if OpenAI renames/versions the model, only the two `endpoint` strings need updating (CLI + GUI entries). Call sites must keep using `getModelById("gpt-image-2")` and `ModelRegistry.get("gpt_image_2")` — do not inline the URL anywhere else.
- **Pricing display** — `costPerImage` is in cents in GUI but in dollars in CLI (`pricing.per_image`). Keep this unit convention; do not "unify" in this PR without a dedicated migration.
- **Order promotion is load-bearing** — test in Subtask 4 pins `TEXT2IMAGE_MODEL_ORDER[0] === "gpt-image-2"`. If a future model needs the top slot, the test must be updated *in the same PR* that promotes it.

---

## 6. Rollout

1. Implement subtasks 1 → 5 in one branch (`GPT-Image2`), committing per subtask for reviewability.
2. Run Subtask 6 QA.
3. Open PR titled `feat(ai-panel): add GPT-Image-2 and promote to top of Text2Image`.
4. Post-merge, update `docs/task/gpt-image-2/` with a short `status.md` noting the release tag and any follow-up tasks deferred from this plan.
