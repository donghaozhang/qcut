# GPT-Image-2 — FAL Provider Variant

**Complements**: [`implementation-plan.md`](./implementation-plan.md) (the GMI variant, already landed on this branch under key `gpt_image_2` — renamed as part of this PR)
**Why this plan exists**: GMI's upstream OpenAI relay for `gpt-image-2` currently returns HTTP 500 "temporary backend error" for every request, while GMI correctly serves other models (control-tested with `gmi_seedream_5_lite`, cost $0.01). FAL also proxies the same OpenAI model (`openai/gpt-image-2`) and is independent of GMI's relay, giving us a working fallback today **and** redundancy long-term.
**Scope**: Register a second QCut model — `gpt_image_2_fal` — that targets FAL's `openai/gpt-image-2` endpoint, **and rename** the existing GMI variant from `gpt_image_2` → `gpt_image_2_gmi` so both variants have symmetric, self-describing keys. Surfaced in both the native pipeline CLI and the GUI AI panel. GUI ordering: place the FAL variant **above** the GMI variant (both above every other model) so the default pick hits the working path; users can still pick the GMI variant explicitly.
**Estimated effort**: ~40–55 min (two registrations + two tests + docs; same shape as the GMI variant so it's mostly pattern reuse).
**Priority (per CLAUDE.md)**: long-term maintainability > scalability > performance > short-term gains.

---

## 1. Design Overview

### Two variants, two symmetric keys

| Aspect | `gpt_image_2_gmi` (renamed from `gpt_image_2`) | `gpt_image_2_fal` (new — this plan) |
|---|---|---|
| Provider label (CLI) | `"OpenAI (via GMI)"` | `"OpenAI (via FAL)"` |
| Provider label (GUI) | `"OpenAI (via GMI)"` | `"OpenAI (via FAL)"` |
| `providerBackend` | `"gmi"` | **unset** (defaults to `"fal"` — see `registry.ts:96`) |
| CLI `endpoint` | `"gpt-image-2"` | `"openai/gpt-image-2"` |
| GUI model id | `"gpt-image-2-gmi"` (renamed from `"gpt-image-2"`) | `"gpt-image-2-fal"` |
| GUI `endpoint` (doc only) | `https://console.gmicloud.ai/...` | `https://fal.run/openai/gpt-image-2` |
| Auth key | `GMI_API_KEY` | `FAL_KEY` (already wired) |
| Transport | GMI queue + poll | FAL queue + poll |
| Current status | ⚠️ GMI-side 500 | ✅ expected to work (probe needed) |

**Naming rationale**: neither variant uses the bare `gpt_image_2` / `gpt-image-2` key. Forcing a provider suffix on both:
- Makes the catalog self-documenting — a reader scanning `system models --json` sees provider from the key alone.
- Prevents a future third variant (e.g. direct OpenAI, Azure) from silently displacing the "default" one.
- Matches the sibling discipline already in the codebase (e.g. `wan_v2_7_t2i` / `wan_v2_7_pro_t2i`).

**Breaking-change impact**: zero — the GMI variant never left this branch (not yet merged). Rename is safe to land alongside the FAL addition.

Keeping them as two separate models — not one model with a runtime provider switch — is the maintainable choice:
- Param shapes differ (see §2). A unified model would need payload translation at call time, splitting one bug into many.
- The credit estimator and pricing table are per-model-key; two keys keep those tables honest.
- If one provider's relay breaks, the other keeps working with zero code change.

### Top-of-order ordering (GUI)

New order in `TEXT2IMAGE_MODEL_ORDER` (`apps/web/src/lib/text2image-models/index.ts:21`):

```
"gpt-image-2-fal",   // ← new, top position (working path)
"gpt-image-2-gmi",   // GMI variant (renamed from "gpt-image-2")
"gemini-3-pro",
"gpt-image-1-5",
// …rest unchanged
```

Top-of-order contract tests update accordingly (`TEXT2IMAGE_MODEL_ORDER[0] === "gpt-image-2-fal"`, `TEXT2IMAGE_MODEL_ORDER[1] === "gpt-image-2-gmi"`).

---

## 2. Parameter shape (verbatim from FAL docs)

FAL's conventions differ from GMI's — they are not interchangeable, and the CLI must not pretend they are:

| FAL param | Type | Default | Allowed / range | Notes |
|---|---|---|---|---|
| `prompt` | string | — (required) | — | — |
| `image_size` | enum OR `{width,height}` | `"landscape_4_3"` | Presets: `square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9`. Custom object: multiples of 16, max edge 3840, aspect ≤3:1, 655,360–8,294,400 total pixels | **Not pixel strings** like GMI |
| `quality` | enum | `"high"` | `low, medium, high` | **No `auto`** (GMI has it) |
| `num_images` | integer | `1` | — | **Not `n`** like GMI |
| `output_format` | enum | `"png"` | `jpeg, png, webp` | **Includes `webp`** (GMI excludes it) |
| `sync_mode` | boolean | `false` | — | If true, returns as data URI + no history |
| (edit mode) `image_urls` + `mask_url` | string / string | — | base64 data URIs or public URLs | Used for edit/inpaint variant |

Response shape: `{images: [{url, file_name, content_type, width, height, file_size}]}`. The existing `extractOutputUrl()` in `electron/native-pipeline/infra/api-provider-urls.ts:68-71` already walks `obj.images[0].url` — no change needed.

---

## 3. Prerequisites

| # | Check | Evidence |
|---|---|---|
| P1 | `FAL_KEY` is read by QCut | `electron/native-pipeline/infra/key-manager.ts`, already active on this branch |
| P2 | Proxy-first priority applies to FAL | `api-caller.ts:610-641` inversion (landed earlier) already covers `provider === "fal"` |
| P3 | FAL async queue polling works end-to-end via proxy | Proven by `gpt_image_1_5` (same provider, same proxy, 2.3 MB PNG delivered on 2026-04-23) |
| P4 | License-server allowlists `https://queue.fal.run/openai/*` | Unverified — see §5 "Probe before coding" |
| P5 | FAL's `openai/gpt-image-2` endpoint accepts our tenant key | Unverified — see §5 "Probe before coding" |

P1-P3 are already in tree. P4/P5 need a one-shot probe *before* writing the registry entry — cheap and would catch an allowlist gap before we author dead code.

---

## 4. Subtasks

### ST0 — Pre-flight probes (≈5 min, do this first)

```bash
# Direct FAL probe with local key — confirms endpoint exists + tenant access
TOKEN=$(qcut system get-key --name FAL_KEY --reveal)  # or read ~/.qcut/.env
curl -sS -X POST "https://queue.fal.run/openai/gpt-image-2" \
  -H "Content-Type: application/json" \
  -H "Authorization: Key $TOKEN" \
  -d '{"prompt":"test"}' -w "\n---HTTP:%{http_code}---\n"

# License-server proxy probe — confirms allowlist
TOKEN=$(grep '^QCUT_AUTH_TOKEN=' ~/.qcut/.env | cut -d= -f2)
curl -sS -X POST "https://qcut-license-server.zdhpeter.workers.dev/api/ai/proxy" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"provider":"fal","endpoint":"https://queue.fal.run/openai/gpt-image-2","method":"POST","body":{"prompt":"test"},"credits":{"amount":0.5,"modelKey":"gpt_image_2_fal","description":"probe"}}' \
  -w "\n---HTTP:%{http_code}---\n"
```

Expected: either a 200 with `request_id` (happy path) or a 401 on the direct call (stale local FAL key — harmless) + a 200 via proxy (server key is valid).

- **If both 200**: proceed to ST1.
- **If proxy 403 "Endpoint not allowed"**: add `https://queue.fal.run/openai/*` to the license-server SSRF allowlist in `packages/license-server/src/routes/ai-proxy.ts` as a prerequisite ST.
- **If FAL 404**: model slug is wrong; re-read FAL's API page and update the plan.

### ST0.5 — Rename existing GMI variant `gpt_image_2` → `gpt_image_2_gmi` (≈10 min)

Must land in the same PR as the FAL addition so reviewers never see an asymmetric catalog.

**CLI side** — `electron/native-pipeline/registry-data/text-to-image.ts`:
- Change the registered `key: "gpt_image_2"` → `key: "gpt_image_2_gmi"`. Leave `endpoint: "gpt-image-2"` unchanged (that's GMI's model slug, not ours to rename).

**CLI test** — `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts`:
- Update the two existing assertions' `ModelRegistry.get("gpt_image_2")` → `ModelRegistry.get("gpt_image_2_gmi")` and their matching `ModelRegistry.has(...)` calls.
- Update the test titles ("registers gpt_image_2 …" → "registers gpt_image_2_gmi …").

**GUI side** — `apps/web/src/lib/text2image-models/other-models.ts`:
- Rename the object key `"gpt-image-2"` → `"gpt-image-2-gmi"` and update the inner `id: "gpt-image-2"` → `id: "gpt-image-2-gmi"`. Leave display `name: "GPT-Image-2"` unchanged — the human-readable label still reads correctly.

**GUI order + categories** — `apps/web/src/lib/text2image-models/index.ts`:
- In `TEXT2IMAGE_MODEL_ORDER`, rename `"gpt-image-2"` → `"gpt-image-2-gmi"`.
- In `MODEL_CATEGORIES.PHOTOREALISTIC` and `MODEL_CATEGORIES.HIGH_QUALITY`, rename `"gpt-image-2"` → `"gpt-image-2-gmi"`.

**GUI test** — `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts`:
- Update the two `gpt-image-2` assertions to `gpt-image-2-gmi` (presence + provider + endpoint checks). Leave the model-count assertion alone — ST3 below will bump it.

**Plan docs** — `docs/task/gpt-image-2/implementation-plan.md`:
- Add a one-line note at the top pointing readers to `fal-provider-plan.md` and noting the rename (`"Originally landed as `gpt_image_2`; superseded in this PR by the symmetric pair `gpt_image_2_gmi` + `gpt_image_2_fal`"`). No need to rewrite the whole file — the content below is still accurate descriptively.

**No YAML / pipeline fixture renames needed** — grep for `gpt_image_2` / `gpt-image-2` in the repo confirms the only references are the ones listed above (the GMI work never shipped).

After ST0.5 is applied, run the CLI + GUI vitest suites to catch anything the grep missed before continuing to ST1.

### ST1 — Register CLI model (≈10 min)

**File**: `electron/native-pipeline/registry-data/text-to-image.ts`

Insert **above** the existing FAL `gpt_image_1_5` block (around line 115 on this branch, before/above the sibling for file-order locality):

```ts
ModelRegistry.register({
  key: "gpt_image_2_fal",
  name: "GPT-Image-2 (FAL)",
  provider: "OpenAI (via FAL)",
  endpoint: "openai/gpt-image-2",
  categories: ["text_to_image", "image_to_image"],
  description:
    "OpenAI GPT-Image-2 via FAL — photorealistic, strong prompt adherence, accurate in-image text",
  pricing: { per_image: 0.042 },
  aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  defaults: {
    image_size: "landscape_4_3",
    quality: "high",
    output_format: "png",
    num_images: 1,
  },
  features: [
    "gpt_powered",
    "photorealistic",
    "accurate_text_in_image",
    "image_editing",
    "inpainting",
  ],
  costEstimate: 0.042,
  processingTime: 45,
  // providerBackend omitted → defaults to "fal"
});
```

Notes:
- Keep the key snake_case suffixed with `_fal` to distinguish from the GMI variant's `gpt_image_2`. Matches the naming discipline the codebase already uses elsewhere (`wan_v2_7_t2i` vs `wan_v2_7_pro_t2i`).
- Aspect ratio list reflects what FAL's presets cover — do **not** register sizes the presets don't support.
- Cost estimate mirrors GMI's default tier ($0.042). FAL hasn't published per-tier pricing; revisit if a tiered estimator lands.

### ST2 — Register GUI model (≈15 min)

**File**: `apps/web/src/lib/text2image-models/other-models.ts`

Add a `"gpt-image-2-fal"` entry **above** the (renamed) `"gpt-image-2-gmi"` entry so file order matches display order:

```ts
"gpt-image-2-fal": {
  id: "gpt-image-2-fal",
  name: "GPT-Image-2 (FAL)",
  description:
    "OpenAI GPT-Image-2 via FAL — photorealistic generation with accurate in-image text and strong prompt adherence",
  provider: "OpenAI (via FAL)",
  endpoint: "https://fal.run/openai/gpt-image-2",

  qualityRating: 5,
  speedRating: 4,

  estimatedCost: "$0.042",
  costPerImage: 4.2, // cents

  maxResolution: "1536x1024 (via preset)",
  supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

  defaultParams: {
    image_size: "landscape_4_3",
    quality: "high",
    output_format: "png",
    num_images: 1,
  },

  availableParams: [
    {
      name: "image_size",
      type: "select",
      options: [
        "square_hd",
        "square",
        "portrait_4_3",
        "portrait_16_9",
        "landscape_4_3",
        "landscape_16_9",
      ],
      default: "landscape_4_3",
      description: "Output image size preset (FAL-style, not pixel dimensions)",
    },
    {
      name: "quality",
      type: "select",
      options: ["low", "medium", "high"],
      default: "high",
      description: "Image quality — affects detail and cost (no 'auto' tier on FAL)",
    },
    {
      name: "output_format",
      type: "select",
      options: ["png", "jpeg", "webp"],
      default: "png",
      description: "File format of the generated image",
    },
    {
      name: "num_images",
      type: "number",
      min: 1,
      max: 4,
      default: 1,
      description: "Number of images to generate",
    },
  ],

  bestFor: [
    "Photorealistic image generation",
    "Images containing readable text",
    "Strong prompt adherence across complex scenes",
    "Image editing with mask-based inpainting",
    "Working fallback while GMI's gpt-image-2 relay is degraded",
  ],

  strengths: [
    "Independent of GMI's OpenAI relay outage",
    "Webp output support (GMI variant does not expose webp)",
    "FAL preset sizes are simpler for UI users than pixel strings",
    "Native inpainting via image_urls + mask_url",
  ],

  limitations: [
    "No 'auto' quality tier (GMI variant has it)",
    "Preset image sizes only — no arbitrary pixel dimensions via QCut UI",
    "Pricing tier table not published by FAL; flat $0.042 is a GMI-derived estimate",
  ],
},
```

### ST3 — Promote FAL variant to top of GUI order (≈3 min)

**File**: `apps/web/src/lib/text2image-models/index.ts`

```ts
export const TEXT2IMAGE_MODEL_ORDER = [
  "gpt-image-2-fal",  // ← new top
  "gpt-image-2-gmi",  // GMI variant (renamed in ST0.5)
  "gemini-3-pro",
  "gpt-image-1-5",
  // …rest unchanged
] as const;
```

Also add `"gpt-image-2-fal"` to `MODEL_CATEGORIES.PHOTOREALISTIC` and `MODEL_CATEGORIES.HIGH_QUALITY` alongside the (renamed) `"gpt-image-2-gmi"`.

### ST4 — Tests (≈15 min)

**CLI** — `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts`

Mirror the existing GMI `gpt_image_2` assertions for the new `gpt_image_2_fal`:
- `provider === "OpenAI (via FAL)"`
- `endpoint === "openai/gpt-image-2"`
- `providerBackend === "fal"` (the default — `registry.ts:96`)
- `categories` contains `"text_to_image"` and `"image_to_image"`
- `defaults.image_size === "landscape_4_3"`, `defaults.quality === "high"`, `defaults.num_images === 1`, `defaults.output_format === "png"`
- `costEstimate === 0.042`

**GUI** — `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts`

- Update model count `20` → `21`.
- Update `TEXT2IMAGE_MODEL_ORDER[0] === "gpt-image-2"` → `TEXT2IMAGE_MODEL_ORDER[0] === "gpt-image-2-fal"`.
- Assert `TEXT2IMAGE_MODEL_ORDER[1] === "gpt-image-2-gmi"` (renamed GMI variant stays right behind).
- Add a presence + provider assertion for `"gpt-image-2-fal"` — `provider === "OpenAI (via FAL)"`, endpoint contains `fal.run/openai/gpt-image-2`.

No new test file needed — the FAL variant is a parallel entry, not a new abstraction.

### ST5 — Documentation (≈5 min)

`docs/technical/media-panel-reference.md` — under Text2Image:
- Bump count `14 models` → `15 models`.
- Update supported-models note: `GPT-Image-2 (via FAL, top), GPT-Image-2 (via GMI Cloud), Gemini 3 Pro, …`. The human-readable display name is still "GPT-Image-2" for both — only the internal keys are disambiguated.

`docs/task/gpt-image-2/implementation-plan.md` (the GMI plan) — append a short cross-reference line pointing to `fal-provider-plan.md` so future readers see both exist.

### ST6 — Live CLI smoke (≈5 min)

```bash
# Assumes user is already logged in (qcut system login) and FAL_KEY is set OR proxy works.
rm -rf /tmp/gpt-image-2-fal-test && mkdir -p /tmp/gpt-image-2-fal-test
bun run pipeline gen image -m gpt_image_2_fal \
  -t "A photograph of a red fox in an autumn forest" \
  -o /tmp/gpt-image-2-fal-test --json

# Expected: JSON with `outputPath` populated, a PNG on disk, ~45s duration, cost ~$0.042.
```

If proxy path succeeds and a real PNG lands: variant is live. If FAL returns 401: local `FAL_KEY` stale — top it up or rely on proxy (which uses the server's FAL key).

---

## 5. File Reference Map

| Layer | File | Change |
|---|---|---|
| CLI registry | `electron/native-pipeline/registry-data/text-to-image.ts` | Rename existing `gpt_image_2` → `gpt_image_2_gmi` (ST0.5); add `gpt_image_2_fal` block above existing `gpt_image_1_5` (ST1) |
| CLI key mgr | `electron/native-pipeline/infra/key-manager.ts` | No change (`FAL_KEY` already present) |
| CLI proxy priority | `electron/native-pipeline/infra/api-caller.ts:610-641` | No change (inversion already landed) |
| License-server allowlist | `packages/license-server/src/routes/ai-proxy.ts` | **Conditional** on ST0 probe — add `https://queue.fal.run/openai/*` only if proxy returns 403 "Endpoint not allowed" |
| GUI model def | `apps/web/src/lib/text2image-models/other-models.ts` | Rename existing `"gpt-image-2"` → `"gpt-image-2-gmi"` (ST0.5); add `"gpt-image-2-fal"` entry (ST2) |
| GUI order | `apps/web/src/lib/text2image-models/index.ts` | Rename `"gpt-image-2"` → `"gpt-image-2-gmi"` in the order array + both category arrays; insert `"gpt-image-2-fal"` at index 0; add `"gpt-image-2-fal"` to `PHOTOREALISTIC` + `HIGH_QUALITY` |
| CLI test | `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts` | Rename existing assertions to `gpt_image_2_gmi`; add parallel assertions for `gpt_image_2_fal` |
| GUI test | `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts` | Rename existing assertions to `gpt-image-2-gmi`; bump count 20→21; update top-of-order; add presence assertions for `gpt-image-2-fal` |
| Panel doc | `docs/technical/media-panel-reference.md` | Count + supported-models line |
| GMI plan cross-ref | `docs/task/gpt-image-2/implementation-plan.md` | One-line pointer to this file + rename note |
| This plan | `docs/task/gpt-image-2/fal-provider-plan.md` | Source of truth |

---

## 6. Risks & Long-Term Maintainability Notes

- **Parameter-shape drift between variants** — GMI uses `size`/`n`, FAL uses `image_size`/`num_images`. Do **not** try to unify them with a runtime translator. Each registry entry owns its own param shape; the CLI already passes `{...model.defaults, ...params}` through unchanged. If a future CLI flag (e.g. `--size 1024x1024`) needs to work for both variants, do the translation at the CLI flag-parse layer, not in the registry or step executor.
- **Latent bug from GMI plan (§8)** — `step-executors.ts:239-250` remaps `aspect_ratio` → `image_size` for any endpoint containing `"gpt-image"`. For the new FAL variant this is **correct**; for the renamed GMI variant (`gpt_image_2_gmi`, endpoint still `"gpt-image-2"`) it sets the wrong key. Not triggered today (defaults do not include `aspect_ratio`), but this PR is a good place to tighten the condition to `provider === "fal"`. Optional scope — only include if ST0 probe exposes the issue; otherwise keep as the separate tech-debt follow-up already flagged.
- **Default provider flip-flop risk** — placing the FAL variant at index 0 will change which model a brand-new project picks by default. That's intentional while GMI is broken, but once GMI recovers, revisit whether QCut should prefer FAL (redundant infra, no single-point-of-failure) or GMI (pricing precision, native tiered pricing). Track as a product decision, not a tech decision.
- **Credit billing parity** — the license-server's credit-estimator is keyed on `modelKey`. `gpt_image_2_gmi` and `gpt_image_2_fal` are *separate* keys, so both need entries in the server's pricing map. The rename in ST0.5 also means the license-server's existing entry for `gpt_image_2` (if any landed before the rename) must be updated to `gpt_image_2_gmi`. Verify with a live run against low-quality/small-size and check the debited amount.
- **Catalog drift** (unchanged tech-debt) — two independent catalogs (CLI registry vs GUI library). Add to the shared-manifest follow-up ticket rather than handling inline here.

---

## 7. Acceptance Criteria (definition of done)

1. `bun run pipeline system models --json` lists **both** symmetric keys: `gpt_image_2_gmi` (provider `"OpenAI (via GMI)"`, endpoint `"gpt-image-2"`) and `gpt_image_2_fal` (provider `"OpenAI (via FAL)"`, endpoint `"openai/gpt-image-2"`). The bare `gpt_image_2` key must **not** appear.
2. `bun run pipeline gen image -m gpt_image_2_fal -t "…" -o /tmp/out --json` writes a real PNG to disk and returns `cost: 0.042` (or close) under a logged-in account.
3. All unit tests pass:
   - `bunx vitest run electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts`
   - `cd apps/web && bunx vitest run src/lib/text2image-models/__tests__/text2image-models.test.ts`
   - `bunx vitest run electron/__tests__/api-caller-proxy-priority.test.ts` (regression guard on priority inversion)
4. Type checks clean: `bunx tsc --noEmit -p apps/web/tsconfig.json` and `cd electron && bunx tsc --noEmit -p tsconfig.json`.
5. GUI Text2Image panel shows **GPT-Image-2 (FAL)** as the first card (model id `gpt-image-2-fal`), with **GPT-Image-2 (GMI)** immediately after (model id `gpt-image-2-gmi`).
6. Docs updated (`media-panel-reference.md`, cross-ref in GMI plan).
7. Both the working FAL run and the known-failing GMI run are captured in the PR description, so reviewers see the redundancy rationale.

---

## 8. Rollout

1. Run ST0 probes. If proxy allowlist gap, add that change first, deploy the Worker, then continue.
2. Land ST1 – ST5 in one commit per subtask for reviewability.
3. Run ST6 live smoke. A real PNG on disk is the green light.
4. Open PR titled `feat(ai-panel): add GPT-Image-2 (FAL) as a redundant provider alongside GMI`.
5. In the PR body: reference `implementation-plan.md` §8 (the GMI plan) for the outage that motivated this redundancy; link to FAL's API page; include the ST6 JSON output as proof.
6. Post-merge: if GMI's `gpt-image-2` relay recovers, open a small follow-up PR to re-evaluate which variant occupies index 0 in `TEXT2IMAGE_MODEL_ORDER`.

---

## 9. Status — Landed on branch `GPT-Image2` (2026-04-23)

### ST0 probe results (pre-coding sanity check)

| Probe | Endpoint | Outcome |
|---|---|---|
| Direct FAL with local key | `POST https://queue.fal.run/openai/gpt-image-2` | 401 "invalid key credentials" — confirms slug exists (not 404); local key is the previously-identified stale one, unrelated |
| License-server proxy | `POST …/api/ai/proxy` with `provider:"fal", endpoint:"https://queue.fal.run/openai/gpt-image-2"` | ✅ **200 OK**, real queue submission with `request_id`, `status_url`, `response_url`. Proxy SSRF allowlist already covers `queue.fal.run/openai/*` — no license-server change required |

### Files changed

**Source**
- `electron/native-pipeline/registry-data/text-to-image.ts` — renamed `key: "gpt_image_2"` → `"gpt_image_2_gmi"` (ST0.5); added new `gpt_image_2_fal` registration above `gpt_image_1_5` (ST1).
- `apps/web/src/lib/text2image-models/other-models.ts` — renamed `"gpt-image-2"` → `"gpt-image-2-gmi"` (ST0.5); prepended new `"gpt-image-2-fal"` entry with FAL param shape (ST2).
- `apps/web/src/lib/text2image-models/index.ts` — `"gpt-image-2"` → `"gpt-image-2-gmi"` in `TEXT2IMAGE_MODEL_ORDER` + `MODEL_CATEGORIES.PHOTOREALISTIC` + `MODEL_CATEGORIES.HIGH_QUALITY` (ST0.5); inserted `"gpt-image-2-fal"` at index 0 and prepended it to both category arrays (ST3).

**Tests**
- `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts` — renamed existing `gpt_image_2` assertions to `gpt_image_2_gmi`; added bare-key-absence guard; added 3 new tests for `gpt_image_2_fal` (provider/endpoint/backend/defaults + distinct-variants invariant).
- `apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts` — bumped model count 20 → 21; renamed GMI assertions to `gpt-image-2-gmi`; added `gpt-image-2-fal` presence + provider + endpoint assertions; re-pinned top-of-order invariant (`[0] === "gpt-image-2-fal"`, `[1] === "gpt-image-2-gmi"`); added bare-key-absence guard.

**Docs**
- `docs/technical/media-panel-reference.md` — Text2Image count 14 → 15; supported-models note lists `GPT-Image-2 (via FAL, top), GPT-Image-2 (via GMI Cloud), …`.
- `docs/task/gpt-image-2/implementation-plan.md` — added front-matter cross-reference note pointing to this plan + documenting the rename.
- `docs/task/gpt-image-2/fal-provider-plan.md` — this file, §9 status block.

### Test results

| Suite | Command | Result |
|-------|---------|--------|
| CLI text-to-image registry | `bunx vitest run electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts` | ✅ **12/12** (was 10, +2 new + 1 rename guard) |
| CLI api-caller + priority + credit (regression) | `bunx vitest run electron/__tests__/{native-api-caller,api-caller-proxy-priority,proxy-credit-passthrough,proxy-credit-integration,credit-estimator}.test.ts` | ✅ **22/22** |
| GUI text2image-models | `cd apps/web && bunx vitest run src/lib/text2image-models/__tests__/text2image-models.test.ts` | ✅ **13/13** (was 11, +2 new) |
| GUI type check | `cd apps/web && bunx tsc --noEmit -p tsconfig.json` | ✅ 0 errors |
| Electron type check | `cd electron && bunx tsc --noEmit -p tsconfig.json` | ✅ 0 errors |

### Live CLI smoke (run 2026-04-23, logged in as `qcut-love2@qcut.app`)

```
$ bun run pipeline gen image -m gpt_image_2_fal \
    -t "A photograph of a red fox in an autumn forest" \
    -o /tmp/gpt-image-2-fal-test --json

{
  "status": "ok",
  "data": {
    "command": "generate-image",
    "outputPath": "/tmp/gpt-image-2-fal-test/output_1776931130920.png",
    "cost": 0.042,
    "duration": 154.07
  }
}
```

File on disk: `1,640,286 bytes` PNG (1.64 MB). Cost matches registration exactly. Image delivered end-to-end via license-server proxy → FAL async queue → poll → result URL → download.

**Control** — `gpt_image_2_gmi` still returns HTTP 500 "temporary backend error" from GMI (unchanged from the earlier GMI-plan §8 finding); the FAL variant is the working path today. No code change can resolve the GMI side; GMI-ops action tracked separately.

### Immediate next actions

1. Commit per-subtask (ST0.5 rename, ST1-ST3 FAL add, ST4 tests, ST5 docs) for reviewability.
2. Open PR titled `feat(ai-panel): add GPT-Image-2 (FAL) as redundant provider; rename GMI variant for symmetry`.
3. In the PR body: include the ST0 probe results, the live CLI JSON response + the 1.64 MB file size, and link to `implementation-plan.md` §8 (GMI outage) as the motivation for the FAL redundancy.

### Deferred / follow-ups (unchanged from plan)

- Tiered-pricing model change — separate PR (FAL doesn't publish tiers anyway).
- GMI-side relay recovery — ops action outside this PR.
- Latent `step-executors.ts:239-250` `gpt-image` remap — not triggered today; tighten to `provider === "fal"` in a standalone follow-up PR.
- Shared CLI/GUI model manifest — unchanged tech-debt ticket.
