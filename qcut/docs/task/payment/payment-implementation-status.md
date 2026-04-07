# QCut Payment System

Last updated: 2026-03-07

## Summary

Payment infrastructure is implemented end-to-end and **deployed to production** on Cloudflare Workers. Desktop app login (Google OAuth + email) is working. License server is live with all secrets configured, DB migrations applied, and auth verified.

**Current state: Ready for Stripe test-mode E2E.** Register the webhook, then test checkout/subscription/refund flows.

---

## Architecture

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   QCut App      │────▶│  License Server   │◀────│   QCut Web      │
│   (Electron)    │     │  (CF Workers)     │     │  (quriosity.au) │
│                 │     │                   │     │                 │
│ • Login (Google │     │ • Better Auth     │     │ • Login page    │
│   + email)      │     │ • Stripe webhooks │     │ • Dashboard     │
│ • License check │     │ • Usage tracking  │     │ • Pricing       │
│ • Feature gates │     │ • Credit system   │     │ • Stripe Checkout│
│ • Deep link     │     │ • OAuth bridge    │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │  Supabase (DB)   │
                     │  Stripe (API)    │
                     └──────────────────┘
```

---

## Deployment Status

| Component | Status | Details |
|-----------|--------|---------|
| CF Worker | ✅ Live | `https://qcut-license-server.zdhpeter.workers.dev` |
| Hyperdrive (DB proxy) | ✅ Active | ID `70804d32fc714532a36dd1a0620da9ae`, caching disabled |
| Supabase DB | ✅ Migrated | 11 tables, RLS disabled for server access |
| Google OAuth (web + desktop) | ✅ Verified | Web: token-bridge flow. Desktop: browser → desktop-bridge → `qcut://activate` |
| Email Auth (web + desktop) | ✅ Verified | Sign-up and sign-in working in both |
| Desktop Login UI | ✅ Done | Login/signup routes wired, "Sign in" link in header |
| Stripe Products | ✅ Created | 6 products, 10 prices (AUD, test mode) |
| Stripe Webhook | ⚠️ Endpoint ready | **Needs webhook registration in Stripe Dashboard** |
| Website (quriosity.com.au) | ✅ Live | HTTPS enforced, correct API URL |
| Secrets (16 total) | ✅ All set | See Secrets section below |

---

## Next Steps (In Order)

### Step 1: Register Stripe Webhook

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Add endpoint: `https://qcut-license-server.zdhpeter.workers.dev/api/stripe/webhook`
3. Events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `charge.refunded`
4. Copy signing secret (`whsec_...`) and update:
   ```bash
   cd packages/license-server
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler deploy
   ```

### Step 2: Test Credit Top-Up

1. Log in at `https://quriosity.com.au/account/dashboard.html`
2. Buy Starter pack (A$5 / 50 credits)
3. Test card: `4242 4242 4242 4242`, any future expiry, any CVC
4. Verify credits increased on dashboard

### Step 3: Test Pro Subscription

1. Upgrade to Pro Monthly (A$19/mo) with test card
2. Verify plan = "Pro" and credits updated
3. Open billing portal → verify subscription visible

### Step 4: Test Cancellation & Refund

1. Billing portal → cancel subscription → verify plan reverts to "Free"
2. Stripe Dashboard → Payments → find top-up → Refund → verify credits deducted

### Step 5: Test Desktop License Sync

1. Sign in via QCut desktop (Google or email)
2. Verify license/plan and credit balance match web dashboard
3. Use an AI feature to confirm credits deduct

### Step 6: Edge Cases

| Test Card | Scenario |
|-----------|----------|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0027 6000 3184` | Requires 3D Secure |

### Go Live Checklist

1. Switch Stripe to live mode, create live products/prices
2. Update all `STRIPE_*` secrets to live keys
3. Re-register webhook with live endpoint
4. Enable canary: `PAYMENTS_CANARY_ONLY=true`, `PAYMENTS_EMAIL_ALLOWLIST=<your-email>`
5. Do one real A$5 purchase, then refund yourself
6. Disable canary → public billing live

---

## Pricing (AUD, Test Mode)

| Plan | Monthly | Yearly | Credits/month |
|------|---------|--------|---------------|
| Free | $0 | — | 50 |
| Pro | A$19 | A$190 | 500 |
| Team | A$49 | A$490 | 2000 |

| Top-Up Pack | Price | Credits |
|-------------|-------|---------|
| Starter | A$5 | 50 |
| Standard | A$10 | 120 |
| Pro | A$25 | 350 |
| Mega | A$50 | 800 |

---

## Auth Flows

### Google OAuth (Web)

```text
User clicks "Continue with Google" on login.html
  → GET /api/auth/google/start?redirect_url=<dashboard>
    → Better Auth /api/auth/sign-in/social (Google)
      → 302 to Google consent screen
        → Google → /api/auth/callback/google
          → Better Auth sets session cookie
            → /api/auth/oauth/token-bridge
              → 302 to dashboard.html?auth_token=<token>
                → PaymentAPI.captureAuthTokenFromUrl() saves to localStorage
```

### Google OAuth (Desktop)

```text
User clicks "Continue with Google" in Electron app
  → shell.openExternal(/api/auth/google/start?redirect_url=<desktop-bridge>)
    → Same Google OAuth flow as web
      → /api/auth/oauth/token-bridge?redirect_url=<desktop-bridge>
        → /api/auth/oauth/desktop-bridge
          → 302 to qcut://activate?token=<token>
            → Electron deep link handler → activate license
```

### Email Auth (Desktop)

```text
User enters email/password in Electron login page
  → IPC: license:email-login → POST /api/auth/sign-in/email
    → Returns session token → stored in memory → license activated
```

### Auth Token Lifecycle

- **Web**: Stored in `localStorage["qcut.authToken"]`, sent as `Authorization: Bearer <token>`
- **Desktop**: Stored in Electron main process memory, also readable from session cookies
- **Validated by**: auth middleware — checks DB session table first, falls back to JWT verify with `BETTER_AUTH_SECRET`

---

## Safety Guardrails

| Guardrail | Status |
|-----------|--------|
| JWT auth verification | ✅ `BETTER_AUTH_SECRET` signature check |
| Stripe idempotency keys | ✅ On all checkout/portal/top-up calls |
| Webhook deduplication | ✅ `event.id` lock in `stripe_webhook_events` table |
| Refund reconciliation | ✅ `charge.refunded` webhook reconciles credits by payment ID |
| Kill switches | ✅ `PAYMENTS_CHECKOUT_ENABLED`, `PAYMENTS_WEBHOOK_ENABLED` |
| Canary allowlist | ✅ `PAYMENTS_CANARY_ONLY` + `PAYMENTS_EMAIL_ALLOWLIST` |
| Atomic credit deduction | ✅ SQL transaction prevents race-driven overspend |
| One license per user | ✅ Unique constraint enforced |
| Incident auditability | ✅ Failed webhooks retain `lastError` |

### No-Go Conditions

Do not open public billing if any are true:
- Webhook idempotency is missing or unproven
- Refund path is manual and undocumented
- Deep-link activation fails intermittently
- License and credit data diverge under retry/replay

---

## Deployment Guide

### Deploy

```bash
cd packages/license-server
npx wrangler deploy
```

### Secrets (16 total, all set)

#### Supabase
| Secret | Value | Status |
|--------|-------|--------|
| `SUPABASE_URL` | `https://kbrtxitvavpuimuihppz.supabase.co` | ✅ |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API Keys → `service_role` | ✅ |
| `DATABASE_URL` | `postgresql://postgres.kbrtxitvavpuimuihppz:***@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres` | ✅ |

#### Better Auth
| Secret | Value | Status |
|--------|-------|--------|
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` | ✅ |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth client "QCut License Server" | ✅ |
| `GOOGLE_CLIENT_SECRET` | Same OAuth 2.0 Client | ✅ |

#### Stripe
| Secret | Value | Status |
|--------|-------|--------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys | ✅ (test) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint → Signing secret | ✅ |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_1T7zQaELR0vJaZKXqLFVlqkj` (A$19/mo) | ✅ |
| `STRIPE_PRO_YEARLY_PRICE_ID` | `price_1T7zQbELR0vJaZKXrX7mBsfw` (A$190/yr) | ✅ |
| `STRIPE_TEAM_MONTHLY_PRICE_ID` | `price_1T7zQkELR0vJaZKXEfp9Zia4` (A$49/mo) | ✅ |
| `STRIPE_TEAM_YEARLY_PRICE_ID` | `price_1T7zQlELR0vJaZKXtj8U23Ca` (A$490/yr) | ✅ |
| `STRIPE_TOPUP_STARTER_PRICE_ID` | `price_1T7zQyELR0vJaZKXnyYJ522L` (A$5) | ✅ |
| `STRIPE_TOPUP_STANDARD_PRICE_ID` | `price_1T7zR0ELR0vJaZKXuDGYGGnp` (A$10) | ✅ |
| `STRIPE_TOPUP_PRO_PRICE_ID` | `price_1T7zR1ELR0vJaZKXxIV9FeLe` (A$25) | ✅ |
| `STRIPE_TOPUP_MEGA_PRICE_ID` | `price_1T7zR3ELR0vJaZKXPi0aj3l4` (A$50) | ✅ |

#### Runtime Config (in `wrangler.toml`)
```toml
[vars]
ENVIRONMENT = "production"
PAYMENTS_WEB_BASE_URL = "https://quriosity.com.au"
PAYMENTS_CHECKOUT_ENABLED = "true"
PAYMENTS_WEBHOOK_ENABLED = "true"
PAYMENTS_CANARY_ONLY = "false"
CORS_ALLOWED_ORIGINS = ""
```

### Database Migrations

Supabase project ref: `kbrtxitvavpuimuihppz`

```bash
cd packages/db
SUPABASE_ACCESS_TOKEN=<token> supabase link --project-ref kbrtxitvavpuimuihppz
SUPABASE_ACCESS_TOKEN=<token> supabase db push
SUPABASE_ACCESS_TOKEN=<token> supabase migration list
```

Tables: `users`, `sessions`, `accounts`, `verifications`, `waitlist`, `licenses`, `device_activations`, `credit_balances`, `credit_transactions`, `stripe_webhook_events`, `usage_records`

### Cloudflare Workers Notes

```toml
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
```

- `compatibility_date = "2024-09-23"` is minimum for `process.env` at request time
- All `process.env` access must be inside function bodies (not module level)
- Middleware copies `c.env` → `process.env` on each request

### Useful Commands

```bash
npx wrangler deploy           # Deploy
npx wrangler tail             # Live logs
npx wrangler secret list      # List secrets
npx wrangler secret put NAME  # Set secret
npx wrangler secret delete NAME
```

---

## Troubleshooting (Issues Fixed During Deployment)

| Issue | Symptom | Fix |
|-------|---------|-----|
| `process.env` empty | Handlers can't read secrets | Middleware copies `c.env` to `process.env` per request |
| postgres.js TCP | Connection fails in CF Workers | Set up Hyperdrive proxy |
| Stale DB connections | INSERT works, SELECT fails on warm isolate | Removed `_db` singleton; fresh client per query via Proxy |
| RLS blocking INSERTs | `Failed query: insert into "verifications"` | Disabled RLS on all tables (server-side, no row isolation needed) |
| better-auth 302 as error | `Auth upstream 302` | Changed to `response.status < 400` |
| better-auth version | v1.5.4 needs Zod v4 | Downgraded to v1.1.6 |
| Local auth module | `@qcut/auth/server` uses Next.js env | Created `src/auth/better-auth.ts` with lazy `getAuth()` |
| Website SSL | No cert for quriosity.com.au | Re-provisioned via GitHub Pages, enabled HTTPS |
| Wrong API URL | `payment.js` pointed to wrong subdomain | Fixed to `qcut-license-server.zdhpeter.workers.dev` |
| Hyperdrive caching | Stale query results for auth lookups | Disabled via `wrangler hyperdrive update --caching-disabled` |
| Desktop OAuth redirect blocked | token-bridge rejected same-origin redirect | Added `requestOrigin` to `resolveAllowedOrigins` |

---

## Key Files

### License Server
- `packages/license-server/src/index.ts` — Hono app entry, middleware
- `packages/license-server/src/auth/better-auth.ts` — Lazy auth instance for CF Workers
- `packages/license-server/src/db/drizzle.ts` — Per-request fresh DB connections
- `packages/license-server/src/routes/auth.ts` — OAuth start, token-bridge, desktop-bridge
- `packages/license-server/src/routes/stripe.ts` — Checkout, portal, webhook
- `packages/license-server/src/routes/credits.ts` — Top-up checkout
- `packages/license-server/src/services/stripe-service.ts` — Stripe API integration
- `packages/license-server/src/services/credit-service.ts` — Credit balance operations
- `packages/license-server/src/services/license-service.ts` — License CRUD
- `packages/license-server/src/services/payment-config.ts` — Config, allowlists, idempotency
- `packages/license-server/src/services/payment-access.ts` — Canary access control
- `packages/license-server/src/middleware/auth.ts` — Bearer token validation
- `packages/license-server/src/middleware/auth-jwt.ts` — JWT fallback verification

### Desktop App
- `electron/license-handler.ts` — IPC handlers, token storage, server communication
- `electron/preload.ts` — License bridge to renderer
- `electron/preload-types/api-types/system-api.ts` — License API types (preload)
- `apps/web/src/hooks/auth/useLogin.ts` — Email + Google login logic
- `apps/web/src/hooks/auth/useSignUp.ts` — Email + Google signup logic
- `apps/web/src/stores/license-store.ts` — Zustand license state
- `apps/web/src/types/electron/api-license.ts` — License API types (renderer)
- `apps/web/src/components/header.tsx` — "Sign in" link

### Database & Website
- `packages/db/src/schema.ts` — All table definitions
- `packages/nexusai-website/js/payment.js` — Web payment API helpers
- `packages/nexusai-website/account/login.html` — Web login page
- `packages/nexusai-website/account/dashboard.html` — Web account dashboard

### Tests
```bash
bun run test:payments
cd packages/license-server && bun run test
```
