# Plan — Wire GMI Cloud to the License-Server Relay

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

## Subtasks

Each subtask is ≤20 minutes and lists the files it touches.

### T1 — Extract shared license-relay helpers (new module)

- **New file:** `apps/web/src/lib/ai-video/core/license-relay.ts`
  - Export `LICENSE_SERVER_URL` (move from `fal-request.ts:125-127`).
  - Export `async function getSessionToken(): Promise<string>` (move from `fal-request.ts:130-145`).
  - Export `async function proxySubmit(opts: { provider, endpoint, method?, body }): Promise<Response>` — wraps `POST /api/ai/proxy`.
  - Export `async function proxyStatus(opts: { provider, requestId, endpoint?, statusUrl? }): Promise<Response>` — wraps `GET /api/ai/status`.
  - Uses `signal?: AbortSignal` throughout.
- **Refactor:** `apps/web/src/lib/ai-video/core/fal-request.ts` imports from `license-relay.ts` instead of defining `LICENSE_SERVER_URL` + `getSessionToken` locally.
- **Acceptance:** FAL relay still works (existing `fal-request` tests pass unchanged).

### T2 — Add relay fallback to `gmiClient.submit`

- **File:** `apps/web/src/lib/ai-clients/gmi-client.ts:74-107`
- Flow after the local-key check:
  1. If no `apiKey`, call `getSessionToken()`.
  2. If token present, call `proxySubmit({ provider: "gmi", endpoint: `${GMI_API_BASE}/requests`, method: "POST", body: { model, payload } })`.
  3. If response not ok, throw with status + parsed detail (same shape as direct-call errors).
  4. Return `{ requestId, provider: "gmi" }`.
- If neither key nor token present, throw an actionable error:
  > `"GMI unavailable. Sign in to your QCut account, or set VITE_GMI_API_KEY."`

### T3 — Add relay fallback to `gmiClient.poll`

- **File:** `apps/web/src/lib/ai-clients/gmi-client.ts:109-176`
- Same resolution order. When relaying, call `proxyStatus({ provider: "gmi", requestId })`. Response body shape matches direct-call (`GmiRequestStatusResponse`) because the license server forwards it verbatim (`ai-proxy.ts:122-128`).
- Keep the existing polling loop, interval, `onProgress`, and timeout semantics. Only the transport changes.

### T4 — Surface the skip reason to the user

- **File:** `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-core.ts:441-503`
- Replace the three `console.log("⚠️ Skipping model - ...")` sites with a `toast.error(handlerResult.skipReason)` (or equivalent via the project's toast util) in addition to the console log.
- Deduplicate bursts: if the same `skipReason` fires multiple times in one generation pass, only toast once.
- **Why:** stops silent failures across all providers, not just GMI.

### T5 — Unit tests for the relay fallback

- **New/updated file:** `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts`
  - Mock `platform().license.getAuthToken` to return a session token.
  - Mock `fetch` to assert that when no local key is set AND a session token is present:
    - `submit` hits `${LICENSE_SERVER_URL}/api/ai/proxy` with the correct body.
    - `poll` hits `${LICENSE_SERVER_URL}/api/ai/status?provider=gmi&requestId=…`.
  - Assert that `submit` throws the actionable "Sign in or set VITE_GMI_API_KEY" message when both are missing.
- **New file:** `apps/web/src/lib/ai-video/core/__tests__/license-relay.test.ts`
  - Unit-test `proxySubmit` and `proxyStatus` in isolation (URL construction, auth header, signal forwarding).

### T6 — Docs + regression checklist

- **File:** `docs/task/gmi-video-cli-guide/05-troubleshooting.md`
  - Add a "GMI generation does nothing" section noting the three states: (a) logged in & works, (b) logged out + no local key → toast appears, (c) local `VITE_GMI_API_KEY` overrides relay.
- **File:** `docs/task/gmi-video-cli-guide/04-gmi-models.md`
  - Add a one-line note per model: "Works out-of-the-box for logged-in users via license-server relay; offline use requires `VITE_GMI_API_KEY`."

### T7 — Manual verification

- `bun run electron:dev` while logged in with `qcutlove@qcut.app` (from `.env.test-accounts`) and **no** `VITE_GMI_API_KEY` set.
- Run each GMI model once: Seedance 2.0 260128, Veo 3.1 Lite, Kling V3, Kling V3 Omni, SkyReels V4. Confirm video returns.
- Sign out → retry one model → confirm toast surfaces "Sign in or set VITE_GMI_API_KEY" instead of silent skip.

## Tests — file paths summary

| Test file                                                                         | Covers                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts`                        | Relay fallback in `submit` + `poll`, error path |
| `apps/web/src/lib/ai-video/core/__tests__/license-relay.test.ts`                  | Shared helper unit tests                   |
| `apps/web/src/lib/ai-video/core/__tests__/fal-request.test.ts` (if present)       | Regression: FAL relay still works after refactor |

Run: `bun run test`

## Out of scope (follow-ups)

- Credit deduction via `/api/ai/proxy { credits: { amount, modelKey, description } }`. The license server supports this (`ai-proxy.ts:79-107`); wiring it belongs to the credit-system branch and should be applied uniformly to all providers, not just GMI.
- Provider-agnostic `submitViaRelay(providerId, …)` that the `providerRouter` invokes transparently. Worth revisiting once a third provider (e.g., Runway) needs the same treatment — then the client-level branching becomes repetitive and is worth hoisting into the router.
- Offline cache of last-known session token so a brief network blip doesn't force the user to re-login mid-job.

## Risk / tradeoffs

- **Split transport path** in `gmiClient`: direct for local-key users, relayed for logged-in users. Mitigated by the shared helpers in T1 and a single request/response shape — neither branch diverges from the other in output.
- **License-server latency** adds a hop. In practice GMI's own queue model already costs seconds per poll; adding ~50–150 ms through the worker is negligible.
- **Session-token expiry** mid-poll. Today's FAL relay has the same exposure; out of scope here. If it bites, refresh-on-401 inside `proxyStatus` is the clean spot.
