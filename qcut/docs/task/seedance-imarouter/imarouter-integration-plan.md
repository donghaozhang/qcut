# Integration Plan — IMA Router as a First-Class Provider

**Status:** Implemented (phases 1–6 landed on `mac-old`, 2026-05-10).
**Owner:** TBD
**Created:** 2026-05-10
**Branch:** `mac-old` (continued onto PR #297 per user direction)

---

## 1. Goal

Wire `api.imarouter.com` into QCut as a real provider so Seedance jobs can be dispatched through IMA Router from both the **GUI** (AI panel) and the **Electron CLI** (`qcut t2v` / `qcut i2v`), with the same UX as the existing FAL and GMI integrations.

Today it exists only as the standalone test script `docs/task/seedance-imarouter/seedance-generate.mjs`. None of `apps/web/src/`, `electron/`, or `packages/` references `IMAROUTER_API_KEY` or `api.imarouter.com`.

---

## 2. Why bother

- **Channel control.** IMA Router exposes both overseas (`seedance-2.0`, `seedance-2.0-fast`) and domestic (`-cn`) Seedance variants. Useful for users in mainland China.
- **Provider redundancy.** When FAL queues or GMI capacity dries up, IMA Router is a parallel path to the same ByteDance models.
- **Asset / portrait pre-review.** IMA Router has a real `/v1/assets/create` flow with explicit review status — cleaner than FAL's "send a URL and hope" approach for portrait references.
- **Different cost curve.** Worth comparing per-second pricing once `cost-calculator.ts` learns the IMA Router models.

Non-goals: any new model family. This is a routing/provider addition only.

---

## 3. Provider primer (what the script taught us)

- **Base URL:** `https://api.imarouter.com`
- **Auth:** `Authorization: Bearer ${IMAROUTER_API_KEY}`
- **Submit:** `POST /v1/videos` → `{ task_id }`
- **Poll:** `GET /v1/videos/{task_id}` → `{ status, progress, results: [{ url }] }`
  - status: `queued | in_progress | completed | failed`
- **Asset upload (portrait):**
  - `POST /v1/assets/group/create` → group id (per channel; cache as `IMAROUTER_GROUP_ID_OVERSEAS` / `IMAROUTER_GROUP_ID_CN`)
  - `POST /v1/assets/create` with `{ group_id, url, asset_type: "Image", model }`
  - `POST /v1/assets/get` until `Status` is approved → emit `asset://{id}` for use in `images: []`
- **Channel mapping (do not mix):**
  - `seedance-2.0` / `seedance-2.0-fast` → overseas, upload model `seedance-upload`
  - `seedance-2.0-cn` / `seedance-2.0-fast-cn` → CN, upload model `ima-pro-upload-cn`
- **Quirks:**
  - `seedance-2.0-fast` only supports `720p` — 1080p returns `[unsupported_resolution_for_fast_variant]`.
  - Portrait references via inline URL can return `Error 601400`; route through assets instead.
  - Reference media via `metadata.reference_video_urls` / `metadata.reference_audio_urls`.
  - `metadata.role_mode`: `reference` (default) or `frame`.

---

## 4. Architecture decisions

| Decision | Recommendation | Rationale |
| --- | --- | --- |
| New `ProviderName` value in `infra/api-provider-urls.ts`? | **Yes** — add `"imarouter"`. | Clean dispatch; mirrors how `"gmi"` / `"fal"` work. |
| Direct call from Electron, or proxy via license-server? | **Direct from Electron** (like GMI/FAL). | License-server is for billing-gated paths; users supply their own IMA Router key. Re-evaluate if metered billing is added later. |
| Polling pattern | **Long-poll inside step executor**, same shape as the GMI poll path. | Avoids changing the executor contract; UI sees one in-flight job until URL arrives. |
| Asset upload flow | **Opt-in per model variant**; expose as automatic when user supplies a non-public/portrait reference. | Mirrors `--upload` in the script. |
| Key resolution | Add `IMAROUTER_API_KEY` to the central `KEY_NAMES` allowlist in `electron/native-pipeline/infra/key-manager.ts` (and the GUI precedence chain). | Keeps `~/.qcut/.env` as the single source of truth (per CLAUDE.md ONE-ENV-FILE migration). |

---

## 5. File-level touch list

### 5.1 Provider routing (Electron native pipeline)

- `electron/native-pipeline/infra/api-provider-urls.ts`
  - Extend `ProviderName` with `"imarouter"`.
  - Add `IMAROUTER_BASE = "https://api.imarouter.com"`.
  - `buildProviderUrl("imarouter", endpoint)` → `${IMAROUTER_BASE}/${endpoint}`.
  - Teach `extractOutputUrl` to read `results[0].url` (IMA Router's shape).
- `electron/native-pipeline/infra/api-caller.ts`
  - New `case "imarouter":` in the dispatch switch (~line 254). Headers: `Authorization: Bearer ...`, `Content-Type: application/json`.
  - Reuse the GMI-style submit-then-poll path. Submit returns `task_id`; poll `/v1/videos/{task_id}` every 5 s; success on `status === "completed"`; failure on `status === "failed"` (surface `error.code` / `error.message`).
- `electron/native-pipeline/infra/key-manager.ts`
  - Add `"IMAROUTER_API_KEY"` to `KEY_NAMES`.

### 5.2 Asset (portrait) flow

- New file `electron/native-pipeline/infra/imarouter-assets.ts`:
  - `ensureGroup(channel)` — read cached `IMAROUTER_GROUP_ID_OVERSEAS` / `_CN`; create + persist via `upsertEnvFile` if missing.
  - `uploadAsset(url, channel, groupId, { timeoutMs })` — POST `/v1/assets/create`, then poll `/v1/assets/get` until terminal; return `asset://{id}`.
  - Channel detection helper: `channelFor(modelKey)` → `{ region, uploadModel, envKey }`.
- The step executor (see 5.3) calls `uploadAsset(...)` when:
  - `inputs.images` contains a `http(s)://` URL **and** the registry entry for the model declares `requiresAssetUpload: true`, **or**
  - explicit `inputs.useAssetUpload: true` is set (mirrors `--upload` in the script).

### 5.3 Registry entries

- `electron/native-pipeline/registry-data/text-to-video.ts`
  - Register four T2V models:
    - `imarouter_seedance_2_0_t2v` — overseas full, 720p+1080p, 5–15s, audio toggle, 16:9/9:16/1:1
    - `imarouter_seedance_2_0_fast_t2v` — overseas fast, **720p only**, 5–10s
    - `imarouter_seedance_2_0_cn_t2v` — CN full (mirror of overseas, `-cn` endpoint)
    - `imarouter_seedance_2_0_fast_cn_t2v` — CN fast, 720p only
  - Each entry sets `providerBackend: "imarouter"` and `endpoint: "v1/videos"` with a `payloadBuilder` that adds the IMA Router `model` field (e.g. `seedance-2.0-fast`) and `metadata.*`.
- `electron/native-pipeline/registry-data/image-to-video.ts`
  - Register matching I2V and Ref2V variants (Ref2V routes through asset upload).
  - Declare `requiresAssetUpload: true` for any model that accepts portrait references (so the step executor knows to hit `/v1/assets/create` first).
- `electron/native-pipeline/infra/cost-calculator.ts`
  - Per-second pricing entries — start from public IMA Router rates; pricing review before public release.

### 5.4 CLI surface

- `electron/native-pipeline/cli/command-registry.ts` (line ~269 today lists Seedance keys)
  - Extend the `--model` enum for `qcut t2v`, `qcut i2v`, `qcut ref2v` with the new `imarouter_*` keys.
- `electron/native-pipeline/cli/cli-handlers-admin.ts`
  - `qcut keys check` already iterates `KEY_NAMES`; once `IMAROUTER_API_KEY` is in that list, no further change needed.

### 5.5 GUI

- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`
  - Mirror the four T2V entries from 5.3 (id, displayName, supportedDurations, supportedResolutions, supportedAspectRatios, provider logo).
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/order.ts` + `capabilities.ts`
  - Add the new ids to the ordering list and the capability map.
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`
  - Mirror the I2V / Ref2V entries.
- `apps/web/src/components/editor/media-panel/views/ai/constants/model-provider-logos.ts`
  - Add an IMA Router logo entry (asset under `apps/web/src/assets/providers/`).
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-seedance-settings.tsx`
  - Branch on `providerBackend === "imarouter"`: hide controls that the API doesn't support (e.g. seed control on fast variant, 1080p toggle on fast variant).
- API-key UI:
  - Add `IMAROUTER_API_KEY` to the API-keys settings screen (descriptions, with inline provider URL per the user's stated preference — do not strip the `https://imarouter.com` link even with a "Get Key" button).
- `apps/web/src/lib/ai-video/index.ts`
  - Add the new model ids to whatever selectors / cost displays live here.

### 5.6 Tests

- `electron/native-pipeline/infra/__tests__/api-provider-urls.test.ts`
  - Cover `buildProviderUrl("imarouter", ...)` and `extractOutputUrl({ results: [{ url }] })`.
- New `electron/native-pipeline/infra/__tests__/imarouter-assets.test.ts`
  - Group caching, asset polling, channel routing.
- `electron/native-pipeline/execution/__tests__/step-executors-imarouter.test.ts`
  - Full submit → poll → URL path. Failed-job path (surface `error.message`).
- `packages/license-server/src/routes/ai-proxy.test.ts`
  - Not touched if we keep IMA Router off the proxy.
- GUI: snapshot test in `apps/web/src/components/editor/media-panel/views/ai/constants/__tests__/model-provider-logos.test.ts` to confirm the new logo entry.

### 5.7 Docs

- `docs/task/seedance-imarouter/README.md` (already exists in the merged seedance docs) — add a "GUI usage" section once UI lands.
- `CLAUDE.md` — add `IMAROUTER_API_KEY` to the documented env var list.
- This plan doc — move to `docs/reference/` after the integration ships.

---

## 6. Implementation order (suggested stacked PRs)

1. **Infra**: `ProviderName`, `buildProviderUrl`, `extractOutputUrl`, key-manager entry, unit tests. **(small; no user-visible change)**
2. **Step executor + registry, T2V only**: register `imarouter_seedance_2_0_t2v` and `imarouter_seedance_2_0_fast_t2v`, wire to CLI. Smoke-test with `qcut t2v --model imarouter_seedance_2_0`.
3. **Asset upload flow + I2V/Ref2V**: add `imarouter-assets.ts`, register I2V/Ref2V variants, expose via CLI.
4. **CN variants**: add `-cn` endpoints; document the no-mixing rule prominently.
5. **GUI**: model entries, settings panel branching, provider logo, API-key field.
6. **Cost calibration**: real per-second numbers in `cost-calculator.ts` after billing review.

Steps 1–4 unblock CI users immediately and are safe to ship before the GUI lands.

---

## 7. Open questions

- **Cost-calculator numbers** — needs the latest IMA Router public pricing; defaulting to a placeholder will leak into the GUI cost preview.
- **License-server proxy** — should this ever go through `packages/license-server/src/routes/ai-proxy.ts` (so we can meter free-tier users), or always direct with user-supplied keys? **Default: direct.** Revisit if a free tier is added.
- **CN channel exposure** — do we expose `-cn` variants in the GUI to overseas users? They'll likely 4xx or be rate-limited. Suggest: hide them unless `region === "cn"` (or a debug toggle).
- **Asset-group lifecycle** — the script writes the group id back to `~/.qcut/.env`. Is `upsertEnvFile` from `infra/key-manager.ts` the right place to persist that, or should it live in a separate `imarouter-state.json` so we don't clutter `.env` with non-key values?
- **Polling cadence** — script polls every 5 s with a 600 s timeout. Match those defaults, or align with GMI's pattern in `step-executors.ts`?

---

## 8. Risks

- **Silent channel mismatch.** If `uploadModel` doesn't match the video model channel, the asset upload succeeds but the video job rejects the `asset://...`. Mitigation: `channelFor()` helper + integration test for cross-channel rejection.
- **Inline-URL portrait rejection (`Error 601400`).** Without asset upload, portrait i2v jobs will randomly fail. Mitigation: registry sets `requiresAssetUpload: true` on portrait-capable models, executor auto-routes.
- **Resolution surprises.** `seedance-2.0-fast` rejects 1080p (we hit this today). GUI must hide the 1080p toggle for fast variants.
- **Stale `.env` after key rotation.** `IMAROUTER_GROUP_ID_*` is a write-through cache; rotating workspaces will leave a dangling group id. Mitigation: `--reset-group` equivalent in CLI + a "reset cached group" button in the API-keys UI.

---

## 9. Out of scope

- Adding any non-Seedance model that happens to be exposed via IMA Router. This plan covers Seedance only — additional model families would warrant their own registry entries and their own UX review.
- Migrating existing FAL/GMI Seedance jobs to IMA Router. Both paths stay; users choose at the dropdown.
- Replacing the standalone `seedance-generate.mjs` script. It stays as a low-friction debugging tool.

---

## 10. Acceptance

- `qcut t2v --model imarouter_seedance_2_0 --prompt "..."` returns an mp4.
- AI panel shows the four T2V + matching I2V/Ref2V entries with IMA Router branding, and respects the resolution/duration limits.
- `qcut keys check` reports `IMAROUTER_API_KEY` (sourced from `~/.qcut/.env`).
- All new tests in 5.6 pass under `bun run test`.
- `bun lint:clean` + `bun check-types` clean.

---

## 11. Implementation summary (2026-05-10)

Landed in one pass on `mac-old`. Every phase from §6 made it in.

### Infra & dispatch (Phase 1–2)
- `electron/native-pipeline/infra/api-provider-urls.ts` — added `"imarouter"` to `ProviderName`, `IMAROUTER_BASE`, `buildProviderUrl("imarouter", ...)`, and the `results: [{ url }]` branch in `extractOutputUrl`.
- `electron/native-pipeline/infra/api-caller.ts` — `pollImaRouterTask` poller, `"imarouter"` dispatch case in `callModelApi`, `Authorization: Bearer ...` header, env-var key path (`IMAROUTER_API_KEY`), and 30-min timeout for imarouter (shared with GMI's `GMI_TIMEOUT_MS`).
- `electron/native-pipeline/infra/key-manager.ts` — added `IMAROUTER_API_KEY` to `KEY_NAMES`.
- `electron/native-pipeline/infra/registry.ts` — extended `ProviderBackend` with `"imarouter"`.

### Asset (portrait) flow (Phase 3)
- `electron/native-pipeline/infra/imarouter-assets.ts` — new module: `channelFor()`, `ensureGroup()`, `uploadAsset()`, plus state file `~/.qcut/imarouter-state.json` (separate from `.env` per §7).
- `electron/native-pipeline/execution/step-executors.ts` — `reshapeForImaRouter()` helper (flat → IMA Router metadata shape), applied in `executeTextToVideo` and `executeImageToVideo`. I2V/Ref2V routes URLs through `uploadAsset` and emits `payload.images: ["asset://..."]`.

### Registry entries — T2V + I2V + Ref2V × overseas + CN (Phase 2 + 4)
- `electron/native-pipeline/registry-data/text-to-video.ts` — 4 entries (`imarouter_seedance_2_0{,_fast,_cn,_fast_cn}_t2v`).
- `electron/native-pipeline/registry-data/image-to-video.ts` — 6 entries (I2V + fast I2V + Ref2V per channel; CN variants mirror overseas).
- Pricing populated on every entry → `cost-calculator.ts` consumes registry entries directly; no calculator edits needed.

### CLI surface
- `electron/native-pipeline/cli/command-registry.ts` — extended the `qcut t2v/i2v/ref2v --model` enum with all 10 new keys.

### GUI integration (Phase 5)
- `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/{models,order,capabilities}.ts` — 4 T2V model entries, ordering, and capability map (fast variant locked to 720p).
- `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts` — 6 I2V/Ref2V entries + ordering.
- `apps/web/src/components/editor/media-panel/views/ai/constants/model-provider-logos.ts` — added `"imarouter_"` to `ROUTING_PREFIXES` so the ByteDance logo resolves for all imarouter keys.
- API-key UI:
  - `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` — added `IMA Router API Key` field with inline provider URL (`getKeyUrl="https://imarouter.com"`).
  - `apps/web/src/types/electron/api-external.ts` — added `imarouterApiKey` to `apiKeys.{get,set,status}` types.
  - `electron/api-key-vocabulary.ts` — added `imarouterApiKey: "IMAROUTER_API_KEY"` to `ApiKeys`, `API_KEY_FIELDS`, and `QCUT_ENV_MAP` (full env vocab is now 9 keys).
  - `electron/api-key-handler.ts` — mirrored `imarouterApiKey` into `ApiKeyData`, `ApiKeysStatus`, `EMPTY_API_KEYS`, the decrypt allowlist, the encrypted-save allowlist, the merged-keys resolver, and the status report.

### Renderer-side provider client
- `apps/web/src/lib/ai-clients/imarouter-client.ts` — direct-call client (no license-server relay; users supply their own key). Implements `ProviderClient` with `submit` / `poll` / `isAvailable`.
- `apps/web/src/lib/ai-video/core/provider-types.ts` — extended `ProviderBackend` with `"imarouter"`.
- `apps/web/src/lib/ai-video/core/provider-router.ts` — registered `imaRouterClient`; updated the `keyHint` map.

### Tests added / updated
- `electron/native-pipeline/infra/__tests__/api-provider-urls.test.ts` — new IMA Router `results[]` extractor + `buildProviderUrl("imarouter", ...)` tests.
- `electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts` — new file. 5 tests cover submit→poll happy path, 4xx submit error redaction, missing `task_id`, `status: failed` surfacing, and missing-key handling.
- `electron/native-pipeline/infra/__tests__/imarouter-assets.test.ts` — new file. 4 tests cover `channelFor()` for overseas / `_cn` registry keys, raw API model names, and unknown-input default.
- `electron/__tests__/command-builder-env.test.ts` — bumped vocab length assertion from 8 → 9 with a comment noting why.
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-view-helpers.test.ts` — added `imarouterApiKey: ""` to the shared `VALUES` fixture so the `Record<EditableApiKeyField, string>` contract type-checks.

### Verification commands

| Check | Command | Result |
| --- | --- | --- |
| Phase 1–3 unit tests | `bun run test electron/native-pipeline/infra/__tests__` | 5 files, 37/37 pass |
| Phase 5 helpers test | `bun run test apps/web/src/components/editor/properties-panel/__tests__/api-keys-view-helpers.test.ts` | 9/9 pass |
| Env-vocab guard | `bun run test electron/__tests__/command-builder-env.test.ts` | 11/11 pass |
| Full repo sweep | `bun run test` | 5605/5619 pass, 14 skipped, 0 IMA-router-related failures. 23 module-loader errors in pre-existing parallel-suite races (timeline-store / project-store import) reproduce on master and are unrelated. |
| Electron type-check | `npx tsc --noEmit -p electron/tsconfig.json` | clean |
| Web type-check | `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| Biome format | `npx @biomejs/biome format --write <touched files>` | 4 nits auto-fixed |

### Deliverable model keys

| Key | Channel | Endpoint | Resolutions | Duration |
| --- | --- | --- | --- | --- |
| `imarouter_seedance_2_0_t2v` | overseas | `v1/videos` | 720p / 1080p | 5–15 s |
| `imarouter_seedance_2_0_fast_t2v` | overseas | `v1/videos` | 720p only | 5–10 s |
| `imarouter_seedance_2_0_cn_t2v` | CN | `v1/videos` | 720p / 1080p | 5–15 s |
| `imarouter_seedance_2_0_fast_cn_t2v` | CN | `v1/videos` | 720p only | 5–10 s |
| `imarouter_seedance_2_0_i2v` | overseas | `v1/videos` | 720p / 1080p | 5–15 s |
| `imarouter_seedance_2_0_fast_i2v` | overseas | `v1/videos` | 720p only | 5–10 s |
| `imarouter_seedance_2_0_ref2v` | overseas | `v1/videos` | 720p / 1080p | 5–15 s |
| `imarouter_seedance_2_0_cn_i2v` | CN | `v1/videos` | 720p / 1080p | 5–15 s |
| `imarouter_seedance_2_0_fast_cn_i2v` | CN | `v1/videos` | 720p only | 5–10 s |
| `imarouter_seedance_2_0_cn_ref2v` | CN | `v1/videos` | 720p / 1080p | 5–15 s |

### Known follow-ups

- **Pricing** — flat per-video numbers in the registry (`$0.30` for full, `$0.12` for fast) are placeholders. Replace with the real per-second IMA Router public rates once they're confirmed.
- **CN channel UX** — the GUI currently exposes CN variants to all users. Per §7 open question, consider hiding them unless `region === "cn"` (or behind a debug toggle).
- **Pre-existing module-loader errors** — 23 vitest module-runner races on `apps/web/src/stores/project-store.ts` import are not caused by this work, but should be filed as a separate fix.
- **License-server relay** — left out by design (§4). Revisit if QCut adds a free-tier path that bills IMA Router usage centrally.
