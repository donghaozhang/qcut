# Moyin GMI Integration Plan

**Status**: Proposed
**Author**: Claude / Peter
**Created**: 2026-04-22
**Branch**: `director-v2`

## 1. Motivation

Today the Moyin (Director / Script Editor) feature is wired exclusively to
OpenRouter / Gemini for LLM calls and to FAL.ai for image+video generation.
GMI Cloud is a first-class provider elsewhere in QCut (ViMax, AI video panel,
native pipeline CLI) with support for:

- GMI LLM chat models (`glm-5.1`, `gemini-3.1-pro`, `gemini-3.1-flash-lite`,
  `gpt-5.4`) routed through `api.gmi-serving.com`
- GMI image / video models (`gmi/veo-3.1-lite`, `gmi/kling-v3`,
  `gmi/seedance-2.0`, etc.) routed through `console.gmicloud.ai`

Adding GMI to Moyin delivers three long-term benefits:

1. **Provider redundancy** — OpenRouter/FAL outages no longer kill the
   Director flow. GMI models can be selected as a fallback or primary.
2. **Cost control** — GMI GLM-5.1 and `gemini-3.1-flash-lite` are meaningfully
   cheaper than OpenRouter-routed `gemini-3-flash` for bulk parsing runs.
3. **Consistency with the rest of QCut** — Moyin is currently the only
   AI-backed panel that does not share the `callModelApi` abstraction. Wiring
   it in means a single place to add future providers.

## 2. Scope

This plan covers two independent, shippable deliverables:

- **Subtask A — LLM via GMI**: Add a GMI branch to `electron/moyin-llm.ts` so
  `callLLM` can route through `gmi-llm` when the user selects a GMI model
  (BYOK or proxy).
- **Subtask B — Image / video via GMI**: Replace the hand-rolled FAL fetch
  in `moyin-shot-generation.ts` with `callModelApi`, which already supports
  both FAL and GMI (including proxy mode).

Subtask A is strictly smaller and unblocks parse/calibration cost savings.
Subtask B is larger because it touches the renderer-side generation store
and requires exposing provider choice in the UI. Both are optional to land
together; they are scoped so Subtask A can ship first.

Out of scope (filed as follow-ups at the end):

- Replacing Claude CLI fallback
- Novel-parse handler (lives in `electron/moyin/novel-parse-handler.ts` and
  already inherits `callLLM` changes via import)
- Changes to the visual-style preset system

## 3. Architecture Decisions

### 3.1 LLM dispatch shape

Keep `callLLM` in `electron/moyin-llm.ts` as the single entry point.
Providers resolved in order:

1. Local GMI key (when the user has chosen a `gmi-*` model)
2. Local OpenRouter key
3. Local Gemini key
4. License-server proxy (OpenRouter or gmi-llm route based on model)
5. Claude CLI fallback

The model the user picks in the UI decides whether the GMI branch is tried
first. Without a GMI model selection the dispatch falls through to the
existing OpenRouter-first order (backward compatible).

### 3.2 Image / video dispatch shape

Stop calling `fetch("https://fal.run/...")` directly from renderer code.
Instead, expose a main-process IPC handler
(`moyin:generate-image` / `moyin:generate-video`) that calls
`callModelApi` from `electron/native-pipeline/infra/api-caller.js` with
`provider: "fal" | "gmi"`. The renderer-side helpers in
`moyin-shot-generation.ts` become thin wrappers around the IPC.

This is the same abstraction the AI video panel already uses and picks up
proxy-mode support, credit accounting, and retry logic for free.

### 3.3 Model selection UI

Extend `MODEL_OPTIONS` in `apps/web/src/stores/moyin/moyin-parse-actions.ts`
to include GMI entries:

- `gmi-glm-5.1` → `gmi/zai-org/GLM-5.1-FP8`
- `gmi-gemini-3.1-flash-lite` → `gmi/google/gemini-3.1-flash-lite-preview`
- `gmi-gemini-3.1-pro` → `gmi/google/gemini-3.1-pro-preview`

Image/video model choice piggybacks on the existing `visual style` picker
but adds a "Provider" selector (FAL default, GMI option) stored on the
Moyin store.

## 4. Subtasks

### Subtask A — LLM via GMI (≈ 2 hours)

#### A1. Extend model-to-provider resolution in `moyin-llm.ts`

- File: `electron/moyin-llm.ts`
- Add a `resolveLlmProvider(modelAlias: string)` helper that returns
  `{ provider: "openrouter" | "gmi-llm" | "gemini", model: string }`.
- Introduce a new internal branch `callGmiLLM(apiKey, model, …)` that POSTs
  to `https://api.gmi-serving.com/v1/chat/completions` with
  `Authorization: Bearer <key>` — mirrors `callOpenAICompatible` but with
  a GMI-specific base URL and model.
- Update `callLLM` signature to accept an optional `model?: string`
  parameter (default undefined keeps current behavior).
- When a GMI model is selected: prefer local `GMI_API_KEY`, then fall
  through to proxy (see A2).

#### A2. Route GMI calls through the proxy when no local key

- File: `electron/moyin-llm.ts` (`callOpenRouterViaProxy` neighbor)
- Add `callGmiViaProxy(model, systemPrompt, userPrompt, options)` that
  calls `proxyRequest({ provider: "gmi-llm", endpoint: "chat/completions", … })`.
- Update `callLLM` order: if a GMI model is requested, attempt local GMI
  key → GMI proxy → error. Non-GMI models keep the existing OpenRouter
  → Gemini → OpenRouter-proxy order.

#### A3. Wire the model alias through the IPC boundary

- File: `electron/moyin-handler.ts`
  - Accept `model?: string` on `MoyinParseOptions` and forward to
    `callLLM`.
- File: `apps/web/src/types/electron/api-moyin.ts`
  - Add `model?: string` to the preload-exposed `parseScript` signature.
- File: `apps/web/src/stores/moyin/moyin-store.ts`
  - Pass `parseModel` down to the IPC call site (already exists in the
    store).
- File: `apps/web/src/stores/moyin/moyin-parse-actions.ts`
  - Extend `MODEL_OPTIONS` with the three GMI entries from §3.3.
  - Export a `RESOLVED_MODELS` map so both the CLI (PTY path) and the IPC
    handler agree on the same alias resolution.

#### A4. Tests

- File: `electron/__tests__/moyin-handler-proxy.test.ts` (extend existing
  file — do not create a parallel one).
- New cases:
  - "routes a `gmi-*` model through GMI proxy when no local key"
  - "uses local GMI_API_KEY for `gmi-*` models when set"
  - "still prefers local OpenRouter key for non-GMI models"
  - "surfaces 402 insufficient-credits from gmi-llm proxy"
- Mock `proxyRequest` asserting `provider: "gmi-llm"` and model resolution.
- Also extend `electron/__tests__/moyin-handler.test.ts` with a structural
  test of `resolveLlmProvider` (pure function — no fetch mocking needed).

#### A5. Documentation

- File: `docs/task/moyin-gmi-integration/SUBTASK-A-LLM.md`
  - Record the final alias map, env-var expectations, and proxy credit
    costs pulled from `electron/native-pipeline/infra/credit-estimator.ts`.

### Subtask B — Image / video via GMI (≈ 4 hours)

#### B1. Introduce a main-process image/video IPC

- New file: `electron/moyin-media-handler.ts`
  - `ipcMain.handle("moyin:generate-image", …)` → calls `callModelApi`
    with `provider: "fal" | "gmi"` and the correct endpoint for the model.
  - `ipcMain.handle("moyin:generate-video", …)` → same pattern.
- File: `electron/main.ts`
  - Register the new handler in the `setupMoyinIPC` cluster.
- File: `electron/preload.ts`
  - Expose `window.electronAPI.moyin.generateImage` / `generateVideo`.

#### B2. Replace direct FAL fetch in the renderer

- File: `apps/web/src/stores/moyin/moyin-shot-generation.ts`
  - Delete inline `fetch("https://fal.run/…")` calls.
  - Call `platform().moyin.generateImage({ provider, model, prompt, size })`
    instead. Keep the same return shape (URL string).
  - Remove the direct `getFalApiKeyAsync` dependency — the main process now
    owns key resolution (with proxy fallback).

#### B3. Add provider + model selection to the Moyin store

- File: `apps/web/src/stores/moyin/moyin-store.ts`
  - Add `imageProvider: "fal" | "gmi"` and `videoProvider: "fal" | "gmi"`
    to the persisted store slice (version-bump the persist key).
  - Default to `"fal"` for both to preserve current behavior.
- File: `apps/web/src/components/editor/media-panel/views/moyin/script-input.tsx`
  - Add a provider selector in the CONFIGURATION section (already where
    model/duration live).

#### B4. Tests

- New file: `electron/__tests__/moyin-media-handler.test.ts`
  - Mock `callModelApi` and verify FAL vs GMI dispatch and payload shape.
  - Cover: "image request uses flux-pro for FAL", "image request uses
    gmi/imagen for GMI", "video request uses wan v2.1 for FAL", "video
    request uses gmi/veo-3.1-lite for GMI", "surfaces provider errors".
- File: `apps/web/src/stores/moyin/__tests__/moyin-shot-generation.test.ts`
  - New thin test file that mocks `platform().moyin` and asserts the
    renderer passes through provider + model.

#### B5. Documentation

- File: `docs/task/moyin-gmi-integration/SUBTASK-B-IMAGE.md`
  - Record the provider × endpoint × payload matrix, including the known
    FAL-vs-GMI payload differences (e.g. `num_images` vs `n`).

### Subtask C — Rollout and compatibility (≈ 30 min)

- File: `CHANGELOG.md` — one entry per landed subtask.
- File: `CLAUDE.md` — note that the Moyin LLM dispatch now lives in
  `electron/moyin-llm.ts` and that image/video dispatch is IPC-mediated
  (removes the direct-fetch pattern from the renderer).
- Verify EXE build via `bun run dist:mac` (packaging picks up the new
  handler registration).
- Manually verify Parse Script path on macOS dev build with each of:
  - Local OpenRouter key only (baseline)
  - Local GMI key + `gmi-glm-5.1` selected
  - Signed in, no local key, `gmi-glm-5.1` selected (proxy path)

## 5. Test Strategy

| Layer | Tool | Target |
| --- | --- | --- |
| Unit | Vitest | `electron/__tests__/moyin-handler-proxy.test.ts` (extended), `electron/__tests__/moyin-media-handler.test.ts` (new), `apps/web/src/stores/moyin/__tests__/moyin-shot-generation.test.ts` (new) |
| Type | `bunx tsc --noEmit` | Entire `electron/` tree and `apps/web/` |
| Integration | Manual smoke test | `bun run electron:dev` Parse Script with each provider combination listed in §Subtask C |

A PR that lands Subtask A alone must keep the existing moyin tests green
(1326 tests today) — regressions there are a ship-blocker.

## 6. Risk and Mitigation

- **Risk**: GMI `chat/completions` payload drifts from OpenAI spec (e.g.
  `max_completion_tokens` on GPT-5-style models).
  **Mitigation**: Mirror the `apiModel.startsWith("openai/gpt-5")` branch
  already present in `electron/native-pipeline/vimax/adapters/llm-adapter.ts`.
- **Risk**: Persisted store migration breaks existing users (new
  `imageProvider` field).
  **Mitigation**: Bump the zustand `version` in the store's `persist`
  middleware. Missing fields resolve to `"fal"` default in the migrate
  function.
- **Risk**: Direct-FAL callers elsewhere in the codebase also need
  migration.
  **Mitigation**: Grep for `fal.run/fal-ai` before landing Subtask B;
  confine migration to `moyin-shot-generation.ts` unless the grep
  surfaces shared helpers.

## 7. Follow-ups (out of scope)

- Replace the Claude CLI fallback with a GMI `glm-5.1` proxy call when no
  key is available.
- Expose a per-call "provider override" in `novel-parse-handler.ts` so
  long-form novel parsing can choose a cheaper GMI model without
  affecting Parse Script.
- Port the `callModelApi` migration to the AI chat feature
  (`electron/gemini-chat-handler.ts`) — same pattern.

## 8. Acceptance Criteria

- [ ] `callLLM` in `electron/moyin-llm.ts` routes a `gmi-*` model alias
      through `gmi-llm` (local key or proxy), verified by unit tests.
- [ ] A Moyin user signed in without a local key can Parse Script using a
      GMI model, end-to-end, observed via `[Moyin] callLLM using GMI …` in
      `electron-log`.
- [ ] Image generation for storyboard shots can be switched between FAL
      and GMI via the Moyin UI; both produce a valid image URL.
- [ ] All existing tests remain green; net new tests (≥ 9) land alongside
      each subtask.
- [ ] No direct `fetch("https://fal.run/…")` call remains in
      `apps/web/src/stores/moyin/**`.
- [ ] `bun run build` and `bun run dist:mac` produce a working bundle.

## 9. Relevant File Paths (reference index)

### To modify
- `electron/moyin-llm.ts`
- `electron/moyin-handler.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `apps/web/src/types/electron/api-moyin.ts`
- `apps/web/src/stores/moyin/moyin-store.ts`
- `apps/web/src/stores/moyin/moyin-parse-actions.ts`
- `apps/web/src/stores/moyin/moyin-shot-generation.ts`
- `apps/web/src/components/editor/media-panel/views/moyin/script-input.tsx`

### To create
- `electron/moyin-media-handler.ts`
- `electron/__tests__/moyin-media-handler.test.ts`
- `apps/web/src/stores/moyin/__tests__/moyin-shot-generation.test.ts`
- `docs/task/moyin-gmi-integration/SUBTASK-A-LLM.md`
- `docs/task/moyin-gmi-integration/SUBTASK-B-IMAGE.md`

### To read (reference, no changes)
- `electron/native-pipeline/infra/api-caller.ts` (`callModelApi` abstraction)
- `electron/native-pipeline/infra/proxy-client.ts` (`proxyRequest`)
- `electron/native-pipeline/vimax/adapters/llm-adapter.ts`
  (existing GMI routing we mirror)
- `electron/native-pipeline/infra/credit-estimator.ts`
  (GMI credit costs for proxy mode)
