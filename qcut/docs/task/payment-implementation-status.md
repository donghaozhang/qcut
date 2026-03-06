# Payment System Implementation Status

Last updated: 2026-03-07 (Australia/Melbourne)

## Summary

QCut payment infrastructure is implemented end-to-end and **deployed to production** on Cloudflare Workers. The license server is live at `https://qcut-license-server.zdhpeter.workers.dev` with all secrets configured, database migrations applied, and Google OAuth verified end-to-end.

**Current state: Ready for Stripe test-mode E2E validation.** All code-level blockers are resolved. The remaining work is operational testing (Stripe test-mode E2E, live canary).

## Deployment Status

| Component | Status | Details |
|-----------|--------|---------|
| CF Worker | ✅ Live | `https://qcut-license-server.zdhpeter.workers.dev` |
| Hyperdrive (DB proxy) | ✅ Active | ID `70804d32fc714532a36dd1a0620da9ae`, caching disabled |
| Supabase DB | ✅ Migrated | All 11 tables created, RLS disabled for server access |
| Google OAuth | ✅ Verified | End-to-end flow working (`zdhpeter@gmail.com` user created) |
| Email Auth | ✅ Verified | Sign-up and sign-in working |
| Stripe Products | ✅ Created | 6 products, 10 prices (AUD, test mode) |
| Stripe Webhook | ⚠️ Endpoint ready | Needs webhook registration in Stripe Dashboard |
| Website (quriosity.com.au) | ✅ Fixed | HTTPS enforced, correct API URL, dashboard loads |
| Secrets (16 total) | ✅ All set | See `docs/task/license-server-cloudflare-deploy.md` |

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

## Deployment Fixes Applied (2026-03-07)

### CF Worker-specific issues fixed during deployment:

1. **`process.env` not populated** — CF Workers doesn't auto-populate `process.env` from secrets. Fixed by adding middleware that copies `c.env` to `process.env` on each request.

2. **postgres.js TCP in CF Workers** — postgres.js uses `node:net` which needs Hyperdrive proxy. Set up Cloudflare Hyperdrive with direct Supabase DB URL.

3. **Stale Hyperdrive connections** — Warm CF Worker isolates reused singleton DB connections that went stale. Fixed by removing `_db` singleton; each query gets a fresh postgres.js client.

4. **RLS blocking INSERTs** — Drizzle migrations enable RLS but create no policies. Disabled RLS on all tables (server-side service, no row-level isolation needed).

5. **better-auth 302 treated as error** — `handleAuthRequest` used `response.ok` (false for 3xx). Fixed to pass through redirects and only treat 4xx/5xx as errors.

6. **better-auth version mismatch** — v1.5.4 requires Zod v4 but workspace has Zod v3. Downgraded to v1.1.6.

7. **Local auth module** — `@qcut/auth/server` uses module-level `betterAuth()` call + `@t3-oss/env-nextjs` (Next.js-specific). Created `src/auth/better-auth.ts` with lazy `getAuth()`.

8. **Website SSL** — GitHub Pages hadn't provisioned the cert for `quriosity.com.au`. Re-provisioned and enabled HTTPS enforcement.

9. **Wrong API URL** — `payment.js` pointed to `qcut-license-server.workers.dev` instead of `qcut-license-server.zdhpeter.workers.dev`.

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
  - `packages/license-server/src/auth/better-auth.ts` (NEW — local lazy auth instance)
  - `packages/license-server/src/db/drizzle.ts` (per-request fresh connections)
  - `packages/license-server/src/index.ts`
  - `packages/nexusai-website/account/login.html`
  - `packages/nexusai-website/account/dashboard.html`
  - `packages/nexusai-website/js/payment.js`
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

1. **Register Stripe webhook endpoint** in Stripe Dashboard:
   - URL: `https://qcut-license-server.zdhpeter.workers.dev/api/stripe/webhook`
   - Events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `charge.refunded`
2. Run Stripe test-mode E2E for the staged scenarios in `docs/task/qcut-payment-system-real-test.md`.
3. Execute a controlled live canary with internal allowlist enabled.
4. Validate operational rollback/refund procedures in real environment logs and DB.
5. Keep runbook current: `docs/task/payment-refund-rollback-runbook.md`.

## Key Payment Files (Current)

- `packages/license-server/src/index.ts`
- `packages/license-server/src/auth/better-auth.ts`
- `packages/license-server/src/db/drizzle.ts`
- `packages/license-server/src/routes/auth.ts`
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
- `packages/nexusai-website/js/payment.js`
