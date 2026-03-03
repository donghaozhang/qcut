# Payment System Implementation Status

## Summary

The QCut payment system connects the Electron app, a Hono-based License Server, and Stripe for subscription/credit management. This document tracks what has been implemented.

## Architecture

```text
QCut App (Electron) ──► License Server (Hono API) ◄── Stripe Webhooks
     │                        │
     │ license:check          │ Supabase / PostgreSQL
     │ license:activate       │
     │ credits:deduct         │
     └────────────────────────┘
```

## Completed

### 1. Supabase Database Setup
- **Client**: `packages/license-server/src/db/supabase.ts` — Supabase service-role client
- **Dependency**: `@supabase/supabase-js ^2.49.0` added to license-server
- **Migration SQL files** in `packages/license-server/supabase/migrations/`:
  - `001_users.sql` — users + sessions tables with RLS
  - `002_licenses.sql` — licenses + device_activations with indexes
  - `003_credits.sql` — credit_balances + credit_transactions with audit trail
  - `004_usage_and_webhooks.sql` — usage_records + stripe_webhook_events idempotency

### 2. Stripe Integration (License Server)
- **Package**: `stripe ^17.0.0` (already present)
- **Routes** (`src/routes/stripe.ts`):
  - `POST /api/stripe/checkout` — create Stripe Checkout session (pro/team, month/year)
  - `POST /api/stripe/topup` — create one-time credit pack checkout
  - `POST /api/stripe/portal` — create Stripe Customer Portal session
  - `POST /api/stripe/webhook` — handle Stripe webhooks with signature verification
- **Webhook events handled**:
  - `checkout.session.completed` — activates subscription or adds top-up credits
  - `customer.subscription.updated` — syncs plan/status changes
  - `customer.subscription.deleted` — downgrades to free
  - `invoice.payment_succeeded` — resets monthly credits
  - `invoice.payment_failed` — marks license as past_due
- **Idempotency**: `stripe_webhook_events` table with event locking + stale lock recovery

### 3. License Server API
All routes require Bearer token auth (session or JWT fallback).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/license` | Get license info + active devices |
| POST | `/api/license/validate` | Validate license, returns `valid: boolean` |
| GET | `/api/license/status` | Full status: plan, devices, credits |
| POST | `/api/license/activate` | Activate device (fingerprint + name) |
| DELETE | `/api/license/deactivate` | Deactivate a device |
| GET | `/api/credits` | Get credit balance |
| GET | `/api/credits/balance` | Get credit balance (alias) |
| POST | `/api/credits/deduct` | Deduct credits (amount, modelKey, description) |
| POST | `/api/credits/use` | Deduct credits (alias, description optional) |
| GET | `/api/credits/history` | Credit transaction history |
| POST | `/api/credits/topup` | Create top-up checkout session |
| GET | `/api/usage` | Get monthly usage counts |
| POST | `/api/usage/track` | Track usage event |

### 4. QCut App Integration

#### Electron License Handler (`electron/license-handler.ts`)
- IPC handlers: `license:check`, `license:activate`, `license:deduct-credits`, etc.
- Auth token resolution: in-memory → env var → browser cookies
- Device fingerprint: `${platform}-${hostname}`

#### 7-Day Offline Cache
- Encrypted cache via `safeStorage` (fallback: file with 0o600 permissions)
- Cache stored at `userData/license-cache.enc`
- Expired cache → falls back to free plan (50 credits)

#### Deep Link Protocol (`electron/main.ts`)
- Registered `qcut://` protocol via `setAsDefaultProtocolClient("qcut")`
- macOS: `open-url` event handler
- Windows/Linux: `second-instance` handler with single-instance lock
- URL format: `qcut://activate?token=<JWT>`
- Token delivered to renderer via `license:activation-token` IPC

#### License Store (`apps/web/src/stores/license-store.ts`)
- Zustand store with: `checkLicense()`, `canUseFeature()`, `hasCredits()`, `deductCredits()`
- Upgrade buttons open browser: `https://quriosity.com.au/pricing`

#### Feature Gates (`apps/web/src/lib/feature-gates.ts`)
- `ai-generation`: all plans (free has credit limits)
- `export-4k`, `no-watermark`, `all-templates`: pro + team
- `team-collab`, `api-access`: team only

### 5. Mock Mode
- Set `MOCK_MODE=true` in environment to bypass Stripe/Supabase
- Mock middleware intercepts all `/api/*` routes with canned responses
- Auth middleware skips token validation, uses `mock-user-001`
- Health endpoint shows `mock: true` indicator
- All mock responses simulate a Pro plan with 500 credits

### 6. Environment Configuration
`.env.example` includes all required keys:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — database
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — payments
- 8 Stripe price IDs (4 subscriptions + 4 top-up packs)
- `MOCK_MODE` — toggle for local development
- `DATABASE_URL` — legacy Drizzle ORM compatibility

## Pricing

| Plan | Monthly | Yearly | Credits/Month |
|------|---------|--------|---------------|
| Free | $0 | — | 50 |
| Pro | $9.99 | $99 | 500 |
| Team | $29.99 | $299 | 2000 |

**Top-Up Packs**: Starter (50), Standard (120), Pro (350), Mega (800)

## Key Files

| Component | Path |
|-----------|------|
| License Server entry | `packages/license-server/src/index.ts` |
| Stripe service | `packages/license-server/src/services/stripe-service.ts` |
| Credit service | `packages/license-server/src/services/credit-service.ts` |
| License service | `packages/license-server/src/services/license-service.ts` |
| Mock middleware | `packages/license-server/src/middleware/mock.ts` |
| Supabase client | `packages/license-server/src/db/supabase.ts` |
| SQL migrations | `packages/license-server/supabase/migrations/` |
| Electron handler | `electron/license-handler.ts` |
| Deep link (main.ts) | `electron/main.ts:610-650` |
| License store | `apps/web/src/stores/license-store.ts` |
| Feature gates | `apps/web/src/lib/feature-gates.ts` |
| DB schema | `packages/db/src/schema.ts` |

## Testing

### Local Development (Mock Mode)
```bash
cd packages/license-server
MOCK_MODE=true bun dev
# Server runs on localhost:3000 with mock responses
curl http://localhost:3000/health  # { mock: true }
curl -H "Authorization: Bearer any" http://localhost:3000/api/license/status
```

### With Real Keys
1. Create Supabase project, run migration SQL files in order
2. Create Stripe products + prices, copy IDs to `.env`
3. Use `stripe listen --forward-to localhost:3000/api/stripe/webhook` for local webhook testing
