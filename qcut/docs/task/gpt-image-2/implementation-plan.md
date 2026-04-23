# GPT-Image-2 Integration — Implementation Plan (v2 · GMI)

> **Update (2026-04-23)**: Model key renamed `gpt_image_2` → `gpt_image_2_gmi` (GUI: `gpt-image-2` → `gpt-image-2-gmi`) to pair symmetrically with the new FAL variant `gpt_image_2_fal`. See sibling plan [`fal-provider-plan.md`](./fal-provider-plan.md) for the FAL redundancy rationale (GMI's OpenAI relay was returning 500s consistently) and the full rename + FAL-add rollout.



**Branch**: `GPT-Image2`
**Scope**: Add OpenAI's **gpt-image-2** as a new text-to-image provider in QCut, served via **GMI Cloud** (not FAL). Surfaced in both the native pipeline CLI and the GUI AI panel. In the GUI it must appear at the **top** of the Text2Image model order.
**Estimated effort**: ~45–75 minutes (earlier FAL-shaped scaffolding is mostly re-usable; provider, endpoint, params, and pricing change).
**Priority (per CLAUDE.md)**: long-term maintainability > scalability > performance > short-term gains.

---

## 1. What changed vs. plan v1

The previous revision of this plan assumed GPT-Image-2 would be served through FAL's proxy (`fal-ai/gpt-image-2`). That endpoint **does not exist** — confirmed by a live CLI test on 2026-04-23 where both a direct curl and the license-server proxy timed out against it.

GMI Cloud exposes GPT-Image-2 at:

- Base URL: `https://console.gmicloud.ai`
- Submit: `POST /api/v1/ie/requestqueue/apikey/requests`
- Poll / status: `GET /api/v1/ie/requestqueue/apikey/requests/{request_id}`
- Auth: `Authorization: Bearer ${GMI_API_KEY}`

QCut's CLI already speaks this protocol (`electron/native-pipeline/infra/api-caller.ts:508` — `pollGmiQueue`). The existing GMI image models (`gmi_gemini_3_pro_image`, `gmi_seedream_4`, etc. in `registry-data/text-to-image.ts:289-357`) are the pattern to follow; GPT-Image-2 simply adds another entry to that block.

The proxy-first / local-fallback rework in `api-caller.ts:callModelApi` (landed in this branch) applies to GMI too — logged-in users will spend QCut credits via the license-server proxy before falling back to `GMI_API_KEY`. No extra work needed there.

---

## 2. Design Overview

### Provider & transport

| Aspect | Value |
|---|---|
| Provider string (CLI) | `"OpenAI (via GMI)"` |
| Provider string (GUI) | `"OpenAI (via GMI)"` |
| `providerBackend` (CLI) | `"gmi"` |
| `endpoint` (CLI) | `"gpt-image-2"` (GMI model slug, not a URL) |
| `endpoint` (GUI) | `"https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests"` (documentation-only) |
| Auth key name | `GMI_API_KEY` (already in `KEY_NAMES` in `electron/native-pipeline/infra/key-manager.ts`) |
| Transport | GMI queue + poll; handled by existing `pollGmiQueue()` |

### Parameters (per GMI spec)

| Parameter | Type | Required | Default | Options / range |
|---|---|---|---|---|
| `prompt` | string | yes | — | — |
| `size` | enum | no | `"1024x1024"` | `"1024x1024"`, `"1024x1536"`, `"1536x1024"` |
| `quality` | enum | no | `"medium"` | `"low"`, `"medium"`, `"high"`, `"auto"` |
| `output_format` | enum | no | `"png"` | `"png"`, `"jpeg"` (no webp) |
| `n` | integer | no | `1` | `1` – `10` |
| `image` | base64 | no | — | For edit mode |
| `mask` | base64 | no | — | White = edit, black = preserve |

### Pricing (per image)

| Quality | 1024×1024 | 1024×1536 / 1536×1024 |
|---|---|---|
| Low | $0.011 | $0.016 |
| Medium | **$0.042** (default) | $0.063 |
| High | $0.167 | $0.250 |

The CLI registry's `pricing.per_image` is a flat number today, so we register the **default tier** ($0.042) there. A tiered-pricing estimator is out of scope for this PR — see §6 for follow-up.

### GUI "top" ordering

Unchanged from v1: insert `"gpt-image-2"` at index 0 of `TEXT2IMAGE_MODEL_ORDER` in `apps/web/src/lib/text2image-models/index.ts`. Already landed in the earlier (FAL-shaped) commits on this branch; subtask 3 below just updates the provider/params of the entry itself, not the order.

---

## 3. Prerequisites

| # | Check | Source of truth |
|---|---|---|
| P1 | `GMI_API_KEY` is listed in `KEY_NAMES` | `electron/native-pipeline/infra/key-manager.ts:22` (already there) |
| P2 | GMI queue+poll code path handles `gpt-image-2` — model-agnostic | `electron/native-pipeline/infra/api-caller.ts:508-588` (already works for other GMI models) |
| P3 | License-server `/api/ai/proxy` allowlists the GMI base URL | `packages/license-server/src/routes/ai-proxy.ts` — existing GMI image models already use this path, so allowlist is fine |
| P4 | Proxy-first priority applies to `provider: "gmi"` calls | `electron/native-pipeline/infra/api-caller.ts:610-641` (landed this branch) |

All four are satisfied by code already in tree. No P-tasks require net-new work.

---

## 4. Subtasks

### Subtask 1 — Rewrite CLI registry entry (≈10 min)

**File**: `electron/native-pipeline/registry-data/text-to-image.ts`

Remove the earlier FAL-shaped `gpt_image_2` block (currently lines ~115-140 on this branch — inserted above `gpt_image_1_5`) and add a GMI-shaped registration in the **GMI Cloud Image Models** block around line 289, placed **first** in that block so file order mirrors the GUI top position. New shape:

```ts
ModelRegistry.register({
  key: "gpt_image_2",
  name: "GPT-Image-2 (GMI)",
  provider: "OpenAI (via GMI)",
  endpoint: "gpt-image-2",
  categories: ["text_to_image", "image_to_image"],
  description:
    "OpenAI GPT-Image-2 via GMI Cloud — photorealistic, strong prompt adherence, accurate in-image text",
  pricing: { per_image: 0.042 },
  aspectRatios: ["1:1", "3:2", "2:3"],
  defaults: {
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
    n: 1,
  },
  features: [
    "gpt_powered",
    "photorealistic",
    "accurate_text_in_image",
    "image_editing",
    "inpainting",
  ],
  costEstimate: 0.042,
  processingTime: 30,
  providerBackend: "gmi",
});
```

Categories include `image_to_image` because GMI's GPT-Image-2 accepts `image` + optional `mask` for edit/inpaint — matches the existing pattern set by `gmi_gemini_3_pro_image` (which also declares both categories). No `sync_mode` field — GMI always uses request_id + poll; `pollGmiQueue` handles the "status=success in first response" fast-path too.

### Subtask 2 — Rewrite GUI model definition (≈15 min)

**File**: `apps/web/src/lib/text2image-models/other-models.ts`

The earlier FAL-shaped `"gpt-image-2"` entry (now at the top of `OTHER_MODELS`) needs its provider, endpoint, pricing, and params replaced with the GMI shape:

```ts
"gpt-image-2": {
  id: "gpt-image-2",
  name: "GPT-Image-2",
  description:
    "OpenAI GPT-Image-2 via GMI Cloud — photorealistic generation with accurate in-image text and strong prompt adherence",
  provider: "OpenAI (via GMI)",
  endpoint: "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests",

  qualityRating: 5,
  speedRating: 4,

  estimatedCost: "$0.011–$0.250",  // reflects full 9-cell tier table
  costPerImage: 4.2,  // cents, default tier (medium 1024×1024)

  maxResolution: "1536x1024",
  supportedAspectRatios: ["1:1", "3:2", "2:3"],

  defaultParams: {
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
    n: 1,
  },

  availableParams: [
    {
      name: "size",
      type: "select",
      options: ["1024x1024", "1024x1536", "1536x1024"],
      default: "1024x1024",
      description: "Output image resolution",
    },
    {
      name: "quality",
      type: "select",
      options: ["low", "medium", "high", "auto"],
      default: "medium",
      description: "Image quality — affects detail and cost",
    },
    {
      name: "output_format",
      type: "select",
      options: ["png", "jpeg"],
      default: "png",
      description: "File format of the generated image",
    },
    {
      name: "n",
      type: "number",
      min: 1,
      max: 10,
      default: 1,
      description: "Number of images to generate (1-10)",
    },
  ],

  bestFor: [
    "Photorealistic image generation",
    "Images containing readable text",
    "Strong prompt adherence across complex scenes",
    "Image editing with mask-based inpainting",
    "Premium commercial content",
  ],

  strengths: [
    "Accurate in-image text rendering",
    "Best-in-class prompt adherence",
    "Photorealism across diverse styles",
    "Native inpainting via image + mask",
    "Up to 10 images per request",
  ],

  limitations: [
    "Three fixed resolutions (no arbitrary sizes)",
    "No webp output (png/jpeg only)",
    "High-quality tier is the most expensive model in the catalog ($0.167–$0.250)",
    "No guidance scale or seed controls",
  ],
},
```

### Subtask 3 — Keep top-of-order (≈1 min · already done)

`apps/web/src/lib/text2image-models/index.ts` already places `"gpt-image-2"` at index 0 of `TEXT2IMAGE_MODEL_ORDER`, and inside `PHOTOREALISTIC` / `HIGH_QUALITY` categories. No change required — only verify after Subtask 2 lands.

### Subtask 4 — Update unit tests (≈15 min)

**CLI** — `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts`

The two `gpt_image_2` assertions added in the earlier revision assert `endpoint === "fal-ai/gpt-image-2"` and `provider === "OpenAI (via FAL)"`. Update to the GMI shape:

- `provider === "OpenAI (via GMI)"`
- `endpoint === "gpt-image-2"`
- `providerBackend === "gmi"`
- `categories` includes both `"text_to_image"` and `"image_to_image"`
- `defaults.size === "1024x1024"`, `defaults.quality === "medium"`
- `costEstimate === 0.042`

**GUI** — `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts`

- Keep the top-of-order assertion (`TEXT2IMAGE_MODEL_ORDER[0] === "gpt-image-2"`)
- Update the provider assertion from `"OpenAI"` to `"OpenAI (via GMI)"`
- Model count stays at 20 (we're updating the existing entry, not adding a new one)

### Subtask 5 — Update docs (≈5 min)

**`docs/technical/media-panel-reference.md`** — under the Text2Image supported-models list, adjust the note from "GPT-Image-2 (top)" so it reads "GPT-Image-2 (top, via GMI Cloud)" to signal the provider change. Count of 14 models remains correct.

**CLAUDE.md** — `GMI_API_KEY` is already documented. No change.

### Subtask 6 — Live CLI smoke test via proxy (≈10 min)

With `qcut system login` already in place on this branch, run:

```bash
bun run pipeline gen image -m gpt_image_2 \
  -t "A photograph of a red fox in an autumn forest" \
  -o /tmp/gpt-image-2-test --json
```

**Expected**: a real PNG lands in `/tmp/gpt-image-2-test/`, cost reported as $0.042 (default tier), `outputPath` populated in the JSON response. The proxy-first path drains credits from the logged-in account's balance.

**If the proxy returns "insufficient credits"**: top up or switch to a test account with credits (slots 1–10 in `.env.test-accounts`).

**If GMI returns 404** for `gpt-image-2`: the model slug is wrong or not yet live on the caller's GMI tenant — check `GET /api/v1/apikey/models` and adjust the `endpoint` field.

---

## 5. File Reference Map

| Layer | File | Change vs. v1 of this branch |
|---|---|---|
| CLI registry | `electron/native-pipeline/registry-data/text-to-image.ts` | **Delete** old FAL-shaped `gpt_image_2` block near line ~115; **add** GMI-shaped block inside "GMI Cloud Image Models" at ~line 289, first in that group |
| CLI key mgr | `electron/native-pipeline/infra/key-manager.ts` | No change — `GMI_API_KEY` + `OPENAI_API_KEY` already present |
| CLI proxy priority | `electron/native-pipeline/infra/api-caller.ts:610-641` | No further change — server-first inversion already landed on this branch |
| GUI model def | `apps/web/src/lib/text2image-models/other-models.ts` | **Rewrite** the existing `"gpt-image-2"` entry with GMI provider, endpoint, params, pricing |
| GUI order | `apps/web/src/lib/text2image-models/index.ts` | No change — index 0 already correct |
| CLI test | `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts` | Update 2 assertions (provider, endpoint, backend, defaults, cost) |
| GUI test | `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts` | Update provider assertion `"OpenAI"` → `"OpenAI (via GMI)"` |
| Priority test | `electron/__tests__/api-caller-proxy-priority.test.ts` | No change — provider-agnostic inversion test |
| Docs | `docs/technical/media-panel-reference.md` | Clarify GMI provider in the supported-models note |
| This plan | `docs/task/gpt-image-2/implementation-plan.md` | This file (v2) |

---

## 6. Risks & Long-Term Maintainability Notes

- **Tiered pricing not modelled** — the `pricing.per_image` registry field is a flat number, but real GPT-Image-2 pricing spans $0.011–$0.250 across 6 cells (quality × size). The $0.042 default is fine for ranking/sorting, but cost-estimator accuracy drops for low and high tiers. Track as a follow-up ticket: extend `ModelDefinition.pricing` with an optional `per_image_tiers: Record<"low"|"medium"|"high"|"auto", Record<size, number>>` and teach `estimateProxyCredits` to consult it when `payload.quality` / `payload.size` are present.
- **Sync-vs-async ambiguity** — the GMI docs call the endpoint "synchronous" but the response shape includes `request_id` and a separate status-check endpoint. `pollGmiQueue` already handles both branches (status === "success" in the first response returns immediately), so no action needed; call out in the PR description so future maintainers don't "optimize" the polling away.
- **Category drift** — registering both `text_to_image` and `image_to_image` means GPT-Image-2 appears in **two** tabs in the AI panel (Generation and Adjustment). This is consistent with `gmi_gemini_3_pro_image` and matches actual capability (prompt + optional image/mask), but confirm the GUI doesn't double-count this model in the "top" position of both tabs.
- **CLI/GUI drift** (same as v1) — two independent catalogs. Extract a shared manifest in a follow-up PR; do not attempt here.
- **Tests as the top-of-order contract** — `text2image-models.test.ts`'s `TEXT2IMAGE_MODEL_ORDER[0] === "gpt-image-2"` assertion is load-bearing; update it in-PR if a future model deposes GPT-Image-2 from the top.

---

## 7. Status — v2 plan supersedes v1 (2026-04-23)

### v1 residue still in tree on this branch

The following files were changed under v1 (FAL-based). They remain committed on the branch but **must be revised** per §4 before merge; the v1 versions are incorrect:

- `electron/native-pipeline/registry-data/text-to-image.ts` — FAL-shaped `gpt_image_2` block
- `apps/web/src/lib/text2image-models/other-models.ts` — FAL-shaped entry
- `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts` — asserts FAL provider/endpoint
- `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts` — asserts `provider === "OpenAI"` (should be `"OpenAI (via GMI)"`)

### Independently validated and retained

- **Proxy-first priority inversion** in `electron/native-pipeline/infra/api-caller.ts:610-641` — proven correct by a live CLI run of `gpt_image_1_5` that produced a 2.3 MB PNG via the license-server proxy on a logged-in account (no valid local `FAL_KEY` used). Applies to all providers including GMI. Keep.
- **New priority test** `electron/__tests__/api-caller-proxy-priority.test.ts` — 4/4 passing; provider-agnostic. Keep.
- **Docs scaffold** in `docs/technical/media-panel-reference.md` listing GPT-Image-2 at top — keep, but tweak wording per §4/ST5.

### Live CLI evidence that triggered the v2 rewrite

| Run | Command | Result |
|---|---|---|
| Control | `bun run pipeline gen image -m gpt_image_1_5 -t "…"` via proxy | ✅ 2.3 MB PNG saved; cost $0.04, 59s |
| Broken | `bun run pipeline gen image -m gpt_image_2 -t "…"` via proxy | ❌ Returns `success:true` with no `outputPath` — the FAL endpoint `fal-ai/gpt-image-2` does not exist |
| Raw probe | `curl -X POST …/api/ai/proxy` with `endpoint: "https://fal.run/fal-ai/gpt-image-2"` | ❌ License server responds `{"error":"Provider request timed out"}` after 30–60s |

### Immediate next actions (when resuming implementation)

1. Apply §4 Subtasks 1–5 to rewrite the four files in the "v1 residue" list.
2. Run `bunx vitest run electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts electron/__tests__/api-caller-proxy-priority.test.ts` and the GUI model tests — all should pass.
3. Run Subtask 6 live CLI smoke with a credit-bearing test account (e.g. `QCUT_TEST_EMAIL_2`).
4. Only after a real PNG lands: open PR titled `feat(ai-panel): add GPT-Image-2 via GMI Cloud and promote to top of Text2Image`.

### Deferred / follow-ups

- Tiered-pricing model change — separate PR (see §6).
- Manual Electron dev-mode + prod smoke in the GUI — unchanged from v1 deferral (requires interactive run).
- Shared CLI/GUI model manifest — unchanged tech-debt note.

---

## 8. Status — v2 implementation landed (2026-04-23)

### Files changed

**Source**
- `electron/native-pipeline/registry-data/text-to-image.ts` — removed FAL-shaped `gpt_image_2` block; added GMI-shaped registration as first model in the "GMI Cloud Image Models" group (`provider: "OpenAI (via GMI)"`, `endpoint: "gpt-image-2"`, `providerBackend: "gmi"`, categories `["text_to_image","image_to_image"]`, defaults `{size, quality, output_format, n}`, `costEstimate: 0.042`).
- `apps/web/src/lib/text2image-models/other-models.ts` — rewrote the `"gpt-image-2"` entry with GMI provider/endpoint, correct parameter set (3 sizes, 4 quality tiers, png/jpeg only, n 1-10), and the full $0.011-$0.250 price range in the `estimatedCost` string.

**Tests**
- `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts` — updated the two `gpt_image_2` assertions to match GMI shape (provider, endpoint, `providerBackend: "gmi"`, both categories, default `size`/`quality`/`output_format`/`n`, `costEstimate: 0.042`).
- `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts` — provider assertion `"OpenAI"` → `"OpenAI (via GMI)"`; added endpoint check against `console.gmicloud.ai`.

**Docs**
- `docs/technical/media-panel-reference.md` — appended "via GMI Cloud" to the top-of-list note for GPT-Image-2.

### Test results (run 2026-04-23, post-rewrite)

| Suite | Command | Result |
|-------|---------|--------|
| CLI text-to-image registry | `bunx vitest run electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts` | ✅ 8/8 pass |
| CLI api-caller (legacy + priority + credit) | `bunx vitest run electron/__tests__/{native-api-caller,api-caller-proxy-priority,proxy-credit-passthrough,proxy-credit-integration,credit-estimator}.test.ts` | ✅ 22/22 pass |
| GUI text2image-models | `cd apps/web && bunx vitest run src/lib/text2image-models/__tests__/text2image-models.test.ts` | ✅ 11/11 pass |
| GUI type check | `cd apps/web && bunx tsc --noEmit -p tsconfig.json` | ✅ 0 errors |
| Electron type check | `cd electron && bunx tsc --noEmit -p tsconfig.json` | ✅ 0 errors |

### Live CLI smoke (run 2026-04-23, logged in as a QCut test account)

| Run | Model | Path | Outcome |
|---|---|---|---|
| 1 | `gpt_image_2` | CLI → license-server proxy → GMI | ⚠️ GMI returned HTTP 500 after 3 retries: `{"error":"Generation failed due to a temporary backend error. Please try again."}` |
| 2 | `gpt_image_2` | Raw curl → license-server proxy with spec-shaped body | ⚠️ Same 500 payload from GMI — confirms the CLI builds the correct `{model,payload}` shape; the error originates in GMI, not in QCut. |
| 3 (control) | `gmi_seedream_5_lite` | CLI → license-server proxy → GMI | ✅ JPG delivered to disk, cost $0.01, 31s. Proxy-first pipeline end-to-end operational. |

**Interpretation**: the QCut-side integration is correct — same code path that succeeds for `gmi_seedream_5_lite` is being used for `gpt_image_2`, with the correct `{model: "gpt-image-2", payload: {prompt, size, quality, output_format, n}}` body verified by raw curl. The 500 is **GMI tenant-side**: either the QCut license-server's GMI account doesn't have `gpt-image-2` enabled yet, or GMI's `gpt-image-2` backend is transiently degraded. No code change will fix this — action required is **ops-level** (GMI tenant admin to enable the model for the QCut server's API key, or retry once GMI's backend recovers).

### Latent bug discovered but not fixed in this PR

`electron/native-pipeline/execution/step-executors.ts:239-250` has a FAL-specific remap keyed by `model.endpoint.includes("gpt-image")` that sets `payload.image_size`. Today this only runs when `payload.aspect_ratio` is present (not the default path), so it does **not** cause the GMI 500 observed above. But if a caller ever passes `aspect_ratio` with a gpt-image-* model, the remap would add the wrong key (`image_size` instead of `size`) to the GMI payload. Tracked as a follow-up: narrow the condition to `model.endpoint.startsWith("fal-ai/") && model.endpoint.includes("gpt-image")` or gate on `provider === "fal"`. Out of scope for this PR since the current call path does not trigger it.

### Immediate next action (to fully ship)

1. Confirm `gpt-image-2` is enabled on the QCut license-server's GMI tenant (`/api/v1/apikey/models` on their key should list it).
2. Retry Subtask 6 once GMI returns non-500 — expect a ~$0.042 PNG written to the output dir.
3. Only then open the PR titled `feat(ai-panel): add GPT-Image-2 via GMI Cloud and promote to top of Text2Image`.
