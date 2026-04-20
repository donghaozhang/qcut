# GMI Cloud — License-Server Relay (implementation log)

> **Status: shipped on branch `credit-system`.** All subtasks T1–T6
> complete plus one runtime-bridge fix (T8, below — uncovered during
> T7). T7 manual verification is the only step left for the user.

Target: logged-in QCut users should NOT need a local `VITE_GMI_API_KEY` to generate video on any GMI model (Seedance 2.0 260128, Veo 3.1 Lite, Kling V3, Kling V3 Omni, SkyReels V4). The key is already held on the license server; the client needs to route through it when a session token is present.

## Why the feature is needed

- Symptom: clicking **Generate** on `gmi_seedance_2_0_260128_t2v` while logged-in does nothing. The handler throws `"GMI API key not configured"`, the caller wraps it as `shouldSkip`, and `use-ai-generation-core.ts:444` only `console.log`s. Silent failure.
- Root cause asymmetry: the pattern for logged-in users is already established for FAL (`apps/web/src/lib/ai-video/core/fal-request.ts:151-191`). The license server already knows how to proxy GMI (`packages/license-server/src/routes/ai-proxy.ts:57,269-270`). Only the GMI client is missing the relay leg.

## Current state (verified)

| Layer                                                                    | GMI relay supported? |
| ------------------------------------------------------------------------ | -------------------- |
| License server `POST /api/ai/proxy` — `provider-keys` GMI branch         | ✅ Yes               |
| License server `GET /api/ai/status?provider=gmi&requestId=…`             | ✅ Yes               |
| `gmiClient.submit` (`apps/web/src/lib/ai-clients/gmi-client.ts:74-107`)  | ❌ Direct-to-GMI only |
| `gmiClient.poll` (`apps/web/src/lib/ai-clients/gmi-client.ts:109-176`)   | ❌ Direct-to-GMI only |

The server side needs no changes for the happy path. All work is client-side in `gmi-client.ts` + surfacing the error when relay is also unavailable.

## Design — mirror the FAL pattern

Three resolution branches in `gmiClient.submit` and `gmiClient.poll`, in priority order:

1. **Local key** (env or Electron secure storage) — current behaviour, preserved for offline/self-hosted.
2. **License-server relay** — when no local key, fetch session token via `platform().license.getAuthToken()`, send through `${LICENSE_SERVER_URL}/api/ai/proxy` (submit) or `${LICENSE_SERVER_URL}/api/ai/status?provider=gmi&requestId=…` (poll).
3. **Hard error with actionable message** — only when both (1) and (2) are unavailable. Surface via toast, not just console.

Long-term invariants:

- **Keep the `ProviderClient` interface unchanged.** Callers of `providerRouter.submit("seedance-2-0-260128", payload, "gmi")` must not care whether we went direct or via relay.
- **Centralise relay helpers.** Extract shared `getSessionToken` and `LICENSE_SERVER_URL` from `fal-request.ts` into `apps/web/src/lib/ai-video/core/license-relay.ts` so future providers (Runway, ElevenLabs via license server) plug in without copy-paste.
- **Do not couple credit deduction to this change.** The `credits` field on `/api/ai/proxy` is optional; wiring it up belongs with the broader credit-system branch work. Leave a `TODO` and a tracking note.

## Subtasks (as implemented)

### T1 — Extract shared license-relay helpers ✅

- **New file:** `apps/web/src/lib/ai-video/core/license-relay.ts`
  - Exports `LICENSE_SERVER_URL`, `getSessionToken`, `proxySubmit`, `proxyStatus`.
  - `proxySubmit` and `proxyStatus` accept an optional `sessionToken` so
    callers that already have one don't pay the cost of re-fetching.
  - `signal?: AbortSignal` forwarded through both helpers.
  - Both helpers throw `"No QCut session token available…"` when the
    session is missing and no explicit token was supplied — callers turn
    that into user-facing text.
- **Refactor:** `apps/web/src/lib/ai-video/core/fal-request.ts` now
  imports `LICENSE_SERVER_URL` + `getSessionToken` from `./license-relay`
  (its local copies were removed). Existing FAL proxy tests pass
  unchanged (6/6).

### T2 — `gmiClient.submit` relay fallback ✅

- **File:** `apps/web/src/lib/ai-clients/gmi-client.ts`
- Resolution order:
  1. Local API key → direct POST to `${GMI_API_BASE}/requests`.
  2. No key + session token → `proxySubmit({ provider: "gmi", endpoint, method: "POST", body: { model, payload } })`.
  3. Neither → throw `MISSING_CREDENTIALS_MESSAGE = "GMI unavailable. Please sign in to your QCut account and try again."` (the developer-only `VITE_GMI_API_KEY` escape hatch is intentionally NOT surfaced in user-facing copy)
- HTTP errors from the relay surface with the same shape as direct errors
  (`GMI API error (<status>): <detail>`) so callers and the skip-reason
  toast don't need to know which transport was used.

### T3 — `gmiClient.poll` relay fallback ✅

- Same file. Resolves once before the polling loop and then uses either
  direct `fetch` or `proxyStatus` on every iteration.
- `proxyStatus` uses `GET /api/ai/status?provider=gmi&requestId=…`; the
  license server constructs the upstream GMI status URL itself
  (`packages/license-server/src/routes/ai-proxy.ts:269-270`).
- `maxAttempts`, `pollIntervalMs`, `onProgress`, and timeout behaviour
  all preserved — only the transport branches.

### T4 — Surface skip reasons as toasts ✅

- **File:** `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-core.ts`
- Added `notifySkip(modelId, reason)` local helper plus a
  `seenSkipReasons: Set<string>` scoped to each generation pass. Same
  `skipReason` only toasts once per pass even if the user selected
  several models that all fail for the same reason (e.g. missing GMI
  session).
- **Bonus fix found during implementation:** the `text` branch
  (`routeTextToVideoHandler`) was missing the `shouldSkip` check
  entirely — it just took `handlerResult.response` unconditionally and
  passed `undefined` downstream. That was the root cause of the
  "nothing happens on Generate" symptom for `gmi_seedance_2_0_260128_t2v`
  specifically. Now uses `notifySkip` + `continue`, matching the other
  three branches.

### T5 — Unit tests ✅

- **Updated:** `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts`
  (18 tests). Mocks `../../ai-video/core/license-relay`. New cases:
  - `isAvailable` returns true when only a session token is present.
  - `submit` routes through `proxySubmit` with exact body shape when no
    local key but a session token is available.
  - `submit` throws the actionable "Sign in…" message when both are
    missing; error is `/Sign in to your QCut account/`.
  - `submit` surfaces relay 503s with the same `GMI API error (503)`
    shape as direct errors.
  - `poll` routes through `proxyStatus` and returns `completed` with the
    relayed `video_url`.
  - `poll` throws the same actionable error when credentials are absent.
- **New:** `apps/web/src/lib/ai-video/core/__tests__/license-relay.test.ts`
  (10 tests) — URL + body + auth-header + `AbortSignal` coverage for
  `proxySubmit` and `proxyStatus`; `getSessionToken` null/throw handling.

### T6 — Docs ✅

- `docs/task/gmi-video-cli-guide/05-troubleshooting.md` — new failure
  mode **D** (three-state truth table; explains the silent-skip bug and
  the fix).
- `docs/task/gmi-video-cli-guide/04-gmi-models.md` — new
  **Authentication for the editor UI** section referencing the shared
  helpers and calling out when a local key is still required.

### T8 — Expose `license.getAuthToken` across the platform bridge ✅

**Uncovered during T7 manual test.** The plan assumed
`platform().license.getAuthToken()` existed — which it did in the
Electron main process (`electron/license-handler.ts:238-240`) but was
never threaded through the preload/type layers. Result: `getSessionToken()`
always returned `""`, `isAvailable()` returned `false`, and the router
threw *"Provider 'gmi' is not available. Configure the API key:
GMI_API_KEY."* before the relay code ever ran.

Wired `getAuthToken` through five layers:

1. `packages/platform-core/src/types/core-api.ts:116-122` — added
   `getAuthToken(): Promise<string>` to `PlatformLicenseAPI`. JSDoc
   explains renderer relay use case.
2. `packages/platform-desktop/src/index.ts:76` — desktop adapter
   forwards to `api().license.getAuthToken()`.
3. `packages/platform-web/src/index.ts` — web stub returns `""`
   (keeps relay disabled in pure-browser mode).
4. `electron/preload.ts:486` — added
   `getAuthToken: () => ipcRenderer.invoke("license:get-auth-token")`.
5. `apps/web/src/types/electron/api-license.ts:36` — matching renderer
   API type.

No Electron handler change was needed — the IPC handler was already
registered. **Preload is baked into the main-process bundle, so users
must fully restart Electron (Cmd+Q + re-run `bun run electron:dev`), not
just reload the renderer.**

### T7 — Manual verification (pending user)

- `bun run electron:dev` while logged in with `qcutlove@qcut.app`
  and **no** `VITE_GMI_API_KEY` set. The test account credentials live
  in `.env.test-accounts` at the `qcut/` subdirectory — the file is
  gitignored; pull it from the team password manager or create one
  locally with the QCut beta-test credentials (`QCUT_TEST_EMAIL` /
  `QCUT_TEST_PASSWORD`) then source it before launching Electron:
  `set -a; source .env.test-accounts; set +a`.
- Click **Generate** on each GMI model once: Seedance 2.0 260128,
  Veo 3.1 Lite, Kling V3, Kling V3 Omni, SkyReels V4. Confirm video
  returns.
- Sign out → retry one model → confirm toast surfaces
  *"GMI unavailable. Please sign in to your QCut account and try
  again."* instead of silent skip.

## Tests — file paths and results

| Test file                                                                         | Covers                                            | Result       |
| --------------------------------------------------------------------------------- | ------------------------------------------------- | ------------ |
| `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts`                        | Relay fallback in `submit` + `poll`, error path   | **18 pass**  |
| `apps/web/src/lib/ai-video/core/__tests__/license-relay.test.ts`                  | Shared helper unit tests                          | **10 pass**  |
| `apps/web/src/lib/ai-video/core/__tests__/fal-request-proxy.test.ts`              | Regression: FAL relay still works after refactor  | **6 pass**   |

Run command used:
```bash
bunx vitest run \
  src/lib/ai-clients/__tests__/gmi-client.test.ts \
  src/lib/ai-video/core/__tests__/license-relay.test.ts \
  src/lib/ai-video/core/__tests__/fal-request-proxy.test.ts
```
(from `apps/web`). Broader sweep including `model-provider-logos`,
`provider-router`, and the various model-config tests: **110/110 pass**.

Note: the top-level `bun test` runner does **not** support `vi.stubGlobal`
used by these tests. Use `bunx vitest` (or `bun run test`, which routes
through the vitest script in `apps/web/package.json`).

## Out of scope (follow-ups)

- Credit deduction via `/api/ai/proxy { credits: { amount, modelKey, description } }`. The license server supports this (`ai-proxy.ts:79-107`); wiring it belongs to the credit-system branch and should be applied uniformly to all providers, not just GMI.
- Provider-agnostic `submitViaRelay(providerId, …)` that the `providerRouter` invokes transparently. Worth revisiting once a third provider (e.g., Runway) needs the same treatment — then the client-level branching becomes repetitive and is worth hoisting into the router.
- Offline cache of last-known session token so a brief network blip doesn't force the user to re-login mid-job.

## Risk / tradeoffs

- **Split transport path** in `gmiClient`: direct for local-key users, relayed for logged-in users. Mitigated by the shared helpers in T1 and a single request/response shape — neither branch diverges from the other in output.
- **License-server latency** adds a hop. In practice GMI's own queue model already costs seconds per poll; adding ~50–150 ms through the worker is negligible.
- **Session-token expiry** mid-poll. Today's FAL relay has the same exposure; out of scope here. If it bites, refresh-on-401 inside `proxyStatus` is the clean spot.
