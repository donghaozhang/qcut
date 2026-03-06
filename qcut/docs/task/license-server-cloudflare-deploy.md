# License Server — Cloudflare Workers Deployment

## Overview

The `packages/license-server` is a Hono app deployed to Cloudflare Workers at
`https://qcut-license-server.zdhpeter.workers.dev`.

**Status (2026-03-07):** Worker is fully configured and live. All 16 secrets set. Stripe test products and prices created (AUD, test mode). DB migrations applied to Supabase. Google OAuth end-to-end verified. Email sign-up/sign-in also verified.

---

## Prerequisites

- Wrangler CLI authenticated: `npx wrangler login`
- Cloudflare account authenticated via `npx wrangler login`

---

## Step 1 — First deploy (creates the worker)

```bash
cd packages/license-server
npx wrangler deploy
```

---

## Step 2 — Set secrets

Secrets are pushed one at a time with `wrangler secret put`. They are stored
encrypted in Cloudflare and injected as `process.env.*` at runtime.

### Supabase

| Secret | Value / Where to find | Status |
|--------|----------------------|--------|
| `SUPABASE_URL` | `https://kbrtxitvavpuimuihppz.supabase.co` | ✅ set |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API Keys → Legacy → `service_role` → Reveal | ✅ set |
| `DATABASE_URL` | `postgresql://postgres.kbrtxitvavpuimuihppz:***@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres` | ✅ set |

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put DATABASE_URL
```

### Better Auth

| Secret | Where to find | Status |
|--------|---------------|--------|
| `BETTER_AUTH_SECRET` | Generate: `openssl rand -hex 32` | ✅ set |
| `GOOGLE_CLIENT_ID` | OAuth client: "QCut License Server" in Google Cloud Console | ✅ set |
| `GOOGLE_CLIENT_SECRET` | Same OAuth 2.0 Client | ✅ set |

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

### Stripe

| Secret | Where to find | Status |
|--------|---------------|--------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key | ✅ set (test key) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → endpoint → Signing secret | ✅ set |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_1T7zQaELR0vJaZKXqLFVlqkj` — A$19/mo | ✅ set |
| `STRIPE_PRO_YEARLY_PRICE_ID` | `price_1T7zQbELR0vJaZKXrX7mBsfw` — A$190/yr | ✅ set |
| `STRIPE_TEAM_MONTHLY_PRICE_ID` | `price_1T7zQkELR0vJaZKXEfp9Zia4` — A$49/mo | ✅ set |
| `STRIPE_TEAM_YEARLY_PRICE_ID` | `price_1T7zQlELR0vJaZKXtj8U23Ca` — A$490/yr | ✅ set |
| `STRIPE_TOPUP_STARTER_PRICE_ID` | `price_1T7zQyELR0vJaZKXnyYJ522L` — A$5 (50 credits) | ✅ set |
| `STRIPE_TOPUP_STANDARD_PRICE_ID` | `price_1T7zR0ELR0vJaZKXuDGYGGnp` — A$10 (120 credits) | ✅ set |
| `STRIPE_TOPUP_PRO_PRICE_ID` | `price_1T7zR1ELR0vJaZKXxIV9FeLe` — A$25 (350 credits) | ✅ set |
| `STRIPE_TOPUP_MEGA_PRICE_ID` | `price_1T7zR3ELR0vJaZKXPi0aj3l4` — A$50 (800 credits) | ✅ set |

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRO_MONTHLY_PRICE_ID
npx wrangler secret put STRIPE_PRO_YEARLY_PRICE_ID
npx wrangler secret put STRIPE_TEAM_MONTHLY_PRICE_ID
npx wrangler secret put STRIPE_TEAM_YEARLY_PRICE_ID
npx wrangler secret put STRIPE_TOPUP_STARTER_PRICE_ID
npx wrangler secret put STRIPE_TOPUP_STANDARD_PRICE_ID
npx wrangler secret put STRIPE_TOPUP_PRO_PRICE_ID
npx wrangler secret put STRIPE_TOPUP_MEGA_PRICE_ID
```

### Runtime config (non-secret vars)

These go in `wrangler.toml` under `[vars]` (not secrets — safe to commit):

```toml
[vars]
ENVIRONMENT = "production"
PAYMENTS_WEB_BASE_URL = "https://quriosity.com.au"
PAYMENTS_CHECKOUT_ENABLED = "true"
PAYMENTS_WEBHOOK_ENABLED = "true"
PAYMENTS_CANARY_ONLY = "false"
CORS_ALLOWED_ORIGINS = ""
```

---

## Step 3 — Verify secrets are set

```bash
npx wrangler secret list
```

---

## Step 4 — Redeploy after secrets

```bash
npx wrangler deploy
```

---

## Step 5 — Verify worker is live

```bash
curl https://qcut-license-server.zdhpeter.workers.dev/health
# Expected: {"status":"healthy","timestamp":"...","mock":false}
```

---

## Database Migrations

Drizzle migrations live in `packages/db/migrations/`. To apply them to Supabase, the combined SQL is copied into the Supabase CLI migrations directory and pushed.

**Supabase project ref:** `kbrtxitvavpuimuihppz`
**Supabase CLI migrations dir:** `packages/db/supabase/migrations/`

```bash
cd packages/db
# Link (one-time)
SUPABASE_ACCESS_TOKEN=<token> supabase link --project-ref kbrtxitvavpuimuihppz

# Push migrations
SUPABASE_ACCESS_TOKEN=<token> supabase db push

# Check migration status
SUPABASE_ACCESS_TOKEN=<token> supabase migration list
```

**Current status:** ✅ Migration `20260306151923` applied — all tables created:
`users`, `sessions`, `accounts`, `verifications`, `waitlist`, `licenses`, `device_activations`, `credit_balances`, `credit_transactions`, `stripe_webhook_events`, `usage_records`

---

## Stripe Webhook — register endpoint

After deploy, register the webhook endpoint in Stripe Dashboard:

- **URL**: `https://qcut-license-server.zdhpeter.workers.dev/api/stripe/webhook`
- **Events to listen for**:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `customer.subscription.deleted`
  - `charge.refunded`

Copy the **Signing secret** (`whsec_...`) and set it:

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler deploy
```

---

## Cloudflare Workers compatibility notes

The `wrangler.toml` must use:

```toml
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
```

`compatibility_date = "2024-09-23"` is the minimum date for `process.env` to be
available at request time via the `nodejs_compat` flag. Earlier dates cause
`ReferenceError: process is not defined` at runtime.

All `process.env` access must be inside function bodies (not at module level),
because CF Workers validate module-level code before `process` is injected.

---

## Troubleshooting — issues encountered during deployment

### RLS blocking INSERTs (all tables)
- **Symptom**: `Failed query: insert into "verifications" ...`
- **Cause**: Drizzle migrations enable RLS on all tables but create no policies. Even though Hyperdrive connects as `postgres` (BYPASSRLS=true), the connection was being blocked.
- **Fix**: Disabled RLS on all 11 tables via Supabase SQL API — these are server-side tables with no user-facing row isolation needed.

### Stale Hyperdrive connections in warm isolates
- **Symptom**: INSERT works on `/google/start` but SELECT fails on `/callback/google` (same `_db` singleton reused in warm CF Worker isolate).
- **Cause**: CF Workers reuse V8 isolates across requests. The singleton postgres.js client holds a stale Hyperdrive TCP connection.
- **Fix**: Removed `_db` singleton — `getDb()` now creates a fresh postgres.js client per call. The `db` Proxy ensures each query gets a live connection.

### better-auth 302 treated as error
- **Symptom**: `{"error":"Auth upstream 302","detail":"{\"code\":\"FOUND\"}"}`
- **Cause**: `handleAuthRequest` used `response.ok` which is false for 3xx status codes. better-auth returns 302 redirects on successful OAuth callbacks.
- **Fix**: Changed to `response.status < 400` — only 4xx/5xx are treated as errors.

### Hyperdrive query caching
- **Fix**: Disabled via `npx wrangler hyperdrive update <id> --caching-disabled` to avoid cached empty results for auth state lookups.

---

## Useful commands

```bash
# View live logs
npx wrangler tail

# List all secrets
npx wrangler secret list

# Delete a secret
npx wrangler secret delete SECRET_NAME

# Redeploy
npx wrangler deploy
```
