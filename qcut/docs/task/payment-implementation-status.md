# Payment System Implementation Status

Last updated: 2026-03-06

## Summary

QCut payment infrastructure is implemented end-to-end (Electron + License Server + Stripe + DB), and the top launch blockers from the real-test review have now been addressed in code.

The system is **implementation-ready for Stripe test-mode validation**, but **not yet launch-ready** until the staged real-test execution is completed (test-mode E2E + controlled live canary).

## Blocker Status (From Real-Test Review)

| #   | Item                                            | Status                     | Notes                                                                                                 |
| --- | ----------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Auth security (JWT fallback impersonation risk) | ✅ Resolved                | JWT fallback now requires signature verification with `BETTER_AUTH_SECRET`.                           |
| 2   | Refund + reconciliation flow                    | ✅ Resolved (backend path) | `charge.refunded` webhook now reconciles top-up credits via payment ID.                               |
| 3   | Canary guardrails (allowlist + kill switches)   | ✅ Resolved                | Added checkout/webhook feature flags and internal tester allowlist enforcement.                       |
| 4   | Stripe write idempotency keys                   | ✅ Resolved                | Checkout/top-up/portal calls now use Stripe idempotency keys.                                         |
| 5   | Automated payment test coverage                 | ⚠️ Partial                 | Added backend unit tests and test scripts; Stripe test-mode E2E/live canary execution still required. |
| 6   | Data integrity + concurrency hardening          | ✅ Resolved                | One-license-per-user uniqueness added; credit deduction changed to atomic DB update.                  |
| 7   | Domain/config consistency                       | ✅ Resolved                | Redirect/cancel/portal URLs and CORS origins moved to config with consistent defaults.                |
| 8   | Incident auditability                           | ✅ Resolved                | Failed webhook lock records now retain `lastError` instead of deleting lock rows.                     |

## Implemented Changes (By Area)

### 0) Google OAuth Login Flow (Website + Auth Backend)

- Enabled real Google OAuth provider in Better Auth config.
- Added license-server auth routing for:
  - OAuth start endpoint (`/api/auth/google/start`)
  - token bridge callback endpoint (`/api/auth/oauth/token-bridge`)
  - pass-through Better Auth handler under `/api/auth/*`
- Updated static website login page to:
  - show a real Google sign-in button
  - start OAuth through backend
  - capture callback token (`auth_token`) and redirect to account page
  - surface callback errors (`auth_error`) to users
- Files:
  - `packages/auth/src/keys.ts`
  - `packages/auth/src/server.ts`
  - `packages/license-server/src/routes/auth.ts`
  - `packages/license-server/src/index.ts`
  - `packages/license-server/.env.example`
  - `packages/license-server/package.json`
  - `packages/nexusai-website/account/login.html`
  - `packages/license-server/src/routes/auth.test.ts`

### 1) Auth Security Hardening

- Verified JWT fallback instead of trusting unverified payloads.
- Files:
  - `packages/license-server/src/middleware/auth.ts`
  - `packages/license-server/src/middleware/auth-jwt.ts`
  - `packages/license-server/src/middleware/auth-jwt.test.ts`

### 2) Refund + Reconciliation

- Added refund reconciliation logic keyed by Stripe payment ID.
- Added webhook handling for `charge.refunded`.
- Files:
  - `packages/license-server/src/services/credit-service.ts`
  - `packages/license-server/src/services/stripe-service.ts`

### 3) Canary Guardrails + Kill Switches

- Added canary allowlist checks (internal testers only when enabled).
- Added fast shutdown toggles for checkout creation and webhook processing.
- Files:
  - `packages/license-server/src/services/payment-config.ts`
  - `packages/license-server/src/services/payment-access.ts`
  - `packages/license-server/src/routes/stripe.ts`
  - `packages/license-server/src/routes/credits.ts`
  - `packages/license-server/.env.example`

### 4) Stripe Idempotency Keys

- Added idempotency key support for:
  - `checkout.sessions.create`
  - `billingPortal.sessions.create`
- Integrated `Idempotency-Key` header support with deterministic fallback keys.
- Files:
  - `packages/license-server/src/services/stripe-service.ts`
  - `packages/license-server/src/services/payment-config.ts`
  - `packages/license-server/src/routes/stripe.ts`
  - `packages/license-server/src/routes/credits.ts`
  - `packages/license-server/src/index.ts`

### 5) Data Integrity + Concurrency

- Enforced one license row per user:
  - schema + migrations updated.
- Reworked credit deduction to atomic SQL update in transaction (prevents race-driven overspend).
- Files:
  - `packages/db/src/schema.ts`
  - `packages/db/migrations/0003_payment_guardrails_and_integrity.sql`
  - `packages/db/migrations/meta/_journal.json`
  - `packages/license-server/supabase/migrations/002_licenses.sql`
  - `packages/license-server/supabase/migrations/005_payment_hardening.sql`
  - `packages/license-server/src/services/license-service.ts`
  - `packages/license-server/src/services/credit-service.ts`

### 6) Domain/Config Consistency

- Removed hardcoded GitHub Pages (`github.io`) payment redirects from Stripe service logic.
- Introduced configurable web base URL and CORS origin management.
- Files:
  - `packages/license-server/src/services/payment-config.ts`
  - `packages/license-server/src/services/stripe-service.ts`
  - `packages/license-server/src/index.ts`
  - `packages/license-server/.env.example`

### 7) Incident Auditability

- Failed webhook processing now preserves lock rows and writes error details to `lastError`.
- Files:
  - `packages/license-server/src/services/stripe-service.ts`

## Environment Variables Added

Defined in `packages/license-server/.env.example`:

- `BETTER_AUTH_SECRET`
- `PAYMENTS_WEB_BASE_URL`
- `PAYMENTS_CHECKOUT_ENABLED`
- `PAYMENTS_WEBHOOK_ENABLED`
- `PAYMENTS_CANARY_ONLY`
- `PAYMENTS_EMAIL_ALLOWLIST`
- `CORS_ALLOWED_ORIGINS`

## Automated Test Coverage Added

### License Server Unit Tests

- `packages/license-server/src/middleware/auth-jwt.test.ts`
- `packages/license-server/src/services/payment-config.test.ts`
- `packages/license-server/src/routes/auth.test.ts`

### Test Scripts

- `packages/license-server/package.json`
  - `test`
  - `test:watch`
- Root `package.json`
  - `test:payments`

### How To Run

```bash
# from repo root
bun run test:payments

# or directly
cd packages/license-server
bun run test
```

## Remaining Required Work Before Public Billing

1. Run Stripe test-mode E2E for the staged scenarios in `docs/task/qcut-payment-system-real-test.md`.
2. Execute a controlled live canary with internal allowlist enabled.
3. Validate operational rollback/refund procedures in real environment logs and DB.
4. Keep runbook current: `docs/task/payment-refund-rollback-runbook.md`.

## Key Payment Files (Current)

- `packages/license-server/src/index.ts`
- `packages/license-server/src/routes/stripe.ts`
- `packages/license-server/src/routes/credits.ts`
- `packages/license-server/src/services/stripe-service.ts`
- `packages/license-server/src/services/credit-service.ts`
- `packages/license-server/src/services/license-service.ts`
- `packages/license-server/src/services/payment-config.ts`
- `packages/license-server/src/services/payment-access.ts`
- `packages/license-server/src/middleware/auth.ts`
- `packages/license-server/src/middleware/auth-jwt.ts`
- `packages/db/src/schema.ts`
