# Plan — Credit Deduction for GMI / FAL License-Server Relay

Target: every AI video generation that runs through `POST /api/ai/proxy`
(i.e. logged-in users without a local provider key) deducts the correct
number of credits from the user's QCut balance. Today the relay runs
"free" — the worker uses the server-held GMI key without touching the
user's credit ledger. This plan closes that gap for GMI first, then FAL,
with a clean refund story when the provider call fails.

## Current state (verified)

| Layer                                                                  | Supports `credits` field? | Currently sending it? |
| ---------------------------------------------------------------------- | ------------------------- | --------------------- |
| License-server `POST /api/ai/proxy`                                    | ✅ Yes (`ai-proxy.ts:79-107`) | —                     |
| `deductCreditsForUser` SQL transaction                                 | ✅ Atomic, no refund on failure (`credit-service.ts:286-347`) | — |
| `credit-costs.ts` → `estimateCreditCost(modelKey, { durationSeconds })` | ✅ Exists                  | —                     |
| `gmi-client.ts` → `proxySubmit(...)`                                   | ❌ Helper has no credits param | ❌ No               |
| `fal-request.ts` → `makeFalRequest(...)`                               | ❌ Same                    | ❌ No                |
| `credit-costs.ts` cost tables                                          | ⚠️ **No `gmi_*` or `runway_*` entries** — falls back to `return 1` default | — |
| `license-store.ts` (renderer balance cache)                            | ✅ Holds balance, has `deductCredits()` and `hasCredits()` — currently only called by `credit-guard.ts` on direct-call path | — |

### Why it matters

- Free-plan users have 50 credits/month (`credit-service.ts:5`). One
  logged-in user could burn through many $20+ of GMI compute on the
  operator's GMI account without any credit deduction.
- The SQL side is already atomic; not extending it to the relay is a
  billing leak, not a missing feature.
- `credit-guard.ts:84-88` has a comment that explicitly says *"server
  proxy handles credit deduction, skip client-side"* — but the server
  only deducts when the client sends `credits`. The contract is
  half-implemented on both sides.

## Design

Two-leg flow mirroring FAL's BYOK-vs-proxy split:

1. **Client estimates** credit cost from `modelKey` + `durationSeconds`
   using the existing `estimateCreditCost`. Sends
   `credits: { amount, modelKey, description }` on every proxy submit.
2. **Server atomically deducts** before calling the provider
   (existing behaviour). Returns **402 + balance** on insufficient.
3. **Client refunds** via a new server endpoint if the provider call
   fails (e.g. GMI 5xx, safety-filter reject, timeout during poll).
   Without this, a single transient GMI 500 drains credits with no
   media delivered.
4. **Renderer re-syncs balance** from the 402/200 response so the UI
   store doesn't drift.

Long-term invariants:

- **Single source of truth for model pricing.** `credit-costs.ts`
  stays the one file that maps `modelKey → credits`. Models.ts
  `price` strings stay for human display only.
- **Relay is provider-agnostic.** The `credits` argument lives on the
  shared `proxySubmit` helper in `license-relay.ts`; both `gmi-client`
  and `fal-request` pass it the same way.
- **Refund is symmetric to deduction.** Same shape (amount, modelKey,
  description, plus `originalTransactionId` so the ledger stays
  auditable), same atomic SQL transaction, same `credit-service`
  module.

## Subtasks

Each ≤20 minutes. Paths listed for every file touched.

### T1 — Populate `credit-costs.ts` for GMI + Runway models

- **File:** `apps/web/src/lib/credit-costs.ts:100-143` (`PER_SECOND_COSTS`).
- Add entries derived from each model's `price` field in
  `apps/web/src/components/editor/media-panel/views/ai/constants/text2video-models-config/models.ts`:

  | modelKey                           | $/s → credits/s |
  | ---------------------------------- | ---------------- |
  | `gmi_seedance_2_0_260128_t2v`      | $0.052 → 0.52    |
  | `gmi_veo31_lite_t2v` (720p, no audio) | $0.03 → 0.30 |
  | `gmi_veo31_lite_t2v` (1080p+audio) | $0.08 → 0.80 → pick **worst-case** 0.80 at the top-level key to avoid under-billing |
  | `gmi_skyreels_v4_t2v`              | $0.14 → 1.40    |
  | `gmi_kling_v3_t2v`                 | $0.168 → 1.68   |
  | `gmi_kling_v3_omni_t2v` (pro_sound) | $0.14 → 1.40 (worst case) |
  | `runway_gen45_t2v`                 | $0.50 → 5.00    |
  | `runway_gen4_turbo_t2v`            | $0.25 → 2.50    |

- **Policy call:** always use the worst-case tier at the top-level key
  so users never get surprise-billed. A follow-up (out of scope) can
  introduce variant keys (`gmi_veo31_lite_t2v:1080p_audio`) and plumb
  the resolution/mode into `estimateCreditCost` for exact pricing.
- Update the adjacent comment about "$0.10 per credit" to reference
  the table as authoritative.

### T2 — Thread `credits` through `proxySubmit`

- **File:** `apps/web/src/lib/ai-video/core/license-relay.ts`
  - Extend `ProxySubmitOptions` with an optional
    `credits?: { amount: number; modelKey: string; description: string }`.
  - In `proxySubmit`, spread `credits` into the JSON body when
    provided. Server already reads it (`ai-proxy.ts:80-107`).
  - Do NOT require credits — offline tests and direct callers without
    a pricing entry should still work (helpful when adding new
    providers).

### T3 — GMI client: estimate + attach credits on submit

- **File:** `apps/web/src/lib/ai-clients/gmi-client.ts`
- In `submit(...)`:
  1. Only when going through the relay (no local key), compute
     `amount = estimateCreditCost(model, { durationSeconds: payload.duration as number })`.
     If `amount <= 0`, skip sending `credits` entirely (defensive).
  2. Build `credits: { amount, modelKey: model, description: \`GMI — ${model}\` }`
     and pass to `proxySubmit`.
  3. On `response.status === 402`, parse the `{ credits }` balance from
     the body, call `platform().license.refresh?.()` / update
     `license-store` directly, then throw a typed
     `InsufficientCreditsError` (new in `ai-video/core/errors.ts`) so the
     UI can surface a targeted toast ("You need X more credits") instead
     of a generic "GMI API error (402)".

### T4 — Server-side refund endpoint + client call on provider failure

- **Server:** new `POST /api/ai/refund` handler in
  `packages/license-server/src/routes/ai-proxy.ts` (or a new
  `ai-refund.ts` sibling).
  - Accepts `{ amount, modelKey, description, originalTransactionId? }`.
  - Wraps `creditTransactions` insert + `creditBalances` update in the
    same SQL transaction pattern as `deductCreditsForUser`
    (`packages/license-server/src/services/credit-service.ts:286-347`),
    but with `type: "refund"`.
  - Guards: refunds are **only** allowed for the same user, for
    transactions ≤ 24h old, and the refund amount cannot exceed the
    original deduction.
- **Client:**
  - New helper `refundCredits(opts)` in `license-relay.ts` that hits
    the refund endpoint.
  - In `gmi-client.ts` `poll()`: if the provider returns
    `status: "failed"` or `cancelled`, and the request was credit-gated
    (track the amount in a closure over `submit` → `poll`), fire
    `refundCredits`. Same on `submit` throwing after a successful
    deduction.

### T5 — FAL parity

- **File:** `apps/web/src/lib/ai-video/core/fal-request.ts:151-191`.
- When routing through the proxy (existing branch), mirror T3:
  estimate credits via `estimateCreditCost(modelKey, {
  durationSeconds: …})` and attach to the proxy body.
- **Caveat:** FAL's endpoint string is `fal-ai/kling-v2.1/standard` —
  not the renderer's `modelKey`. Thread the `modelKey` separately (FAL
  callers already have it at `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/*`). Don't use the endpoint as the `modelKey`.

### T6 — Renderer balance sync

- **File:** `apps/web/src/stores/license-store.ts` — already has
  `setCredits(credits)` accessor (per survey). Expose
  `syncFromServerResponse(body)` that extracts a `{ credits }` field
  from the relay response (both 200 and 402) and updates the store.
- **File:** `apps/web/src/lib/ai-video/core/license-relay.ts` — after
  each `proxySubmit`, if the server echoed the new balance (server can
  optionally add `x-credits-remaining` header or `credits` field to the
  JSON), call `syncFromServerResponse`.
- **Server update** (`ai-proxy.ts:110-129`) — include `credits:
  deduction.balance` in the JSON body when the provider call succeeds,
  and in the 402 body. Backwards-compatible (additive field).

### T7 — UI: insufficient-credits toast and balance chip

- **File:** `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-core.ts`
- When the skip reason is `InsufficientCreditsError`, render a toast
  with action link *"Top up"* → opens the existing credits modal. Falls
  back to the plain skip toast for any other error.
- Balance chip in the AI panel header: **follow-up**, not part of this
  plan. Adds no new SQL but changes layout — belongs in the next
  sprint.

### T8 — Tests

| Test file                                                                                     | Covers                                                |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/web/src/lib/__tests__/credit-costs.test.ts`                                             | New per-second entries for GMI + Runway; snapshot for `estimateCreditCost` across representative durations |
| `apps/web/src/lib/ai-video/core/__tests__/license-relay.test.ts`                              | `proxySubmit` sends `credits` when supplied; omits when not |
| `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts`                                    | `submit` estimates + attaches credits via relay; throws `InsufficientCreditsError` on 402; calls `refundCredits` on `failed`/`cancelled` poll outcome |
| `packages/license-server/src/routes/__tests__/ai-refund.test.ts` (new)                        | Refund handler: same-user guard, 24h window, amount cap, DB transaction shape |
| `packages/license-server/src/routes/__tests__/ai-proxy.test.ts` (existing; augment)           | 402 response now includes `credits` balance; successful relay echoes updated balance |

Run: `bunx vitest run` from `apps/web` and `bunx vitest run` from
`packages/license-server`.

### T9 — Docs

- **File:** `docs/task/gmi-video-cli-guide/10-credit-deduction-relay.md`
  (this plan) — convert to implementation log with ✅ markers when each
  subtask lands.
- **File:** `docs/task/gmi-video-cli-guide/04-gmi-models.md` — add a
  one-line "credits/s" column alongside `$/s` for each GMI model.
- **File:** `docs/task/gmi-video-cli-guide/05-troubleshooting.md` — new
  failure mode *"Insufficient credits — what refund/top-up looks like"*.

### T10 — Manual verification

- Log in with `qcut-love2@qcut.app` (fresh 50-credit account).
- Run Seedance 2 (4s) → balance drops by ~2.08 credits, media lands,
  credit transaction row written with `type: "deduction"`.
- Force a provider failure (e.g. disable GMI key on the server for
  30s) → balance refunds back, `type: "refund"` row written, UI
  toasts "Generation failed — credits refunded".
- Drain to zero → next Generate shows the targeted
  insufficient-credits toast with the Top-up CTA.

## Out of scope (follow-ups)

- **Resolution/mode-specific pricing** — e.g. charge 0.30 vs 0.80
  credits/s for Veo 3.1 Lite based on `params.resolution` and
  `generate_audio`. Requires extending `estimateCreditCost` with the
  full param object. Planned for the same sprint as the balance-chip
  UI.
- **Batch/multi-model selection** — one Generate click can dispatch N
  models. Today each dispatches its own `submit`; that's fine for
  deduction but we may want a single aggregate toast ("Selected 3
  models — will deduct ~9 credits") before the first hit.
- **Server-side usage analytics** — the `creditTransactions` ledger
  already has per-user / per-model / per-timestamp data. Wiring it to
  an internal dashboard is orthogonal.
- **FAL refund** — shipped as part of T5 but worth explicit QA on a
  FAL-native failure mode (e.g., 403 from FAL due to region block).

## Risk / tradeoffs

- **Double-deduction window:** the atomic SQL deduction runs *before*
  the provider call; a client network flap between "deduct succeeded"
  and "submit reached provider" could leave a credit spent with no
  job. Mitigation: the refund endpoint covers exactly this — but
  client code has to actually call it, which is why T4 is not
  optional.
- **Under-billing via worst-case pricing:** using the top tier for
  every Veo/Kling Omni call means 720p users pay 1080p prices. Net
  effect: user overpays, no billing leak. Acceptable until the
  resolution-aware follow-up lands.
- **Offline/self-hosted (`VITE_GMI_API_KEY` set):** the credit path is
  ONLY triggered through the relay. Users with a local key bypass it
  entirely — which is correct behaviour (they're paying GMI directly).
  The `credit-guard.ts:84-88` comment becomes literally true once T3
  ships.
