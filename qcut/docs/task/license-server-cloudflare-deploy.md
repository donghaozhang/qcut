# License Server — Cloudflare Workers Deployment

## Overview

The `packages/license-server` is a Hono app deployed to Cloudflare Workers at
`https://qcut-license-server.zdhpeter.workers.dev`.

**Status (2026-03-07):** Worker is fully configured and live. All 16 secrets set. Stripe test products and prices created (AUD, test mode). Ready for end-to-end testing.

---

## Prerequisites

- Wrangler CLI authenticated: `npx wrangler login`
- Cloudflare account: `Zdhpeter@gmail.com` (account ID: `bac6dda9357d0f0271690db65d56aff0`)

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
echo "https://kbrtxitvavpuimuihppz.supabase.co" | npx wrangler secret put SUPABASE_URL
echo "<service_role_key>" | npx wrangler secret put SUPABASE_SERVICE_KEY
echo "postgresql://postgres.kbrtxitvavpuimuihppz:<PASSWORD>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres" | npx wrangler secret put DATABASE_URL
```

### Better Auth

| Secret | Where to find | Status |
|--------|---------------|--------|
| `BETTER_AUTH_SECRET` | Generate: `openssl rand -hex 32` | ✅ set |
| `GOOGLE_CLIENT_ID` | OAuth client: "QCut License Server" in Google Cloud Console | ✅ set |
| `GOOGLE_CLIENT_SECRET` | Same OAuth 2.0 Client | ✅ set |

```bash
echo "<better_auth_secret>" | npx wrangler secret put BETTER_AUTH_SECRET
echo "<google_client_id>" | npx wrangler secret put GOOGLE_CLIENT_ID
echo "<google_client_secret>" | npx wrangler secret put GOOGLE_CLIENT_SECRET
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
echo "<sk_live_...>" | npx wrangler secret put STRIPE_SECRET_KEY
echo "<whsec_...>" | npx wrangler secret put STRIPE_WEBHOOK_SECRET
echo "<price_...>" | npx wrangler secret put STRIPE_PRO_MONTHLY_PRICE_ID
echo "<price_...>" | npx wrangler secret put STRIPE_PRO_YEARLY_PRICE_ID
echo "<price_...>" | npx wrangler secret put STRIPE_TEAM_MONTHLY_PRICE_ID
echo "<price_...>" | npx wrangler secret put STRIPE_TEAM_YEARLY_PRICE_ID
echo "<price_...>" | npx wrangler secret put STRIPE_TOPUP_STARTER_PRICE_ID
echo "<price_...>" | npx wrangler secret put STRIPE_TOPUP_STANDARD_PRICE_ID
echo "<price_...>" | npx wrangler secret put STRIPE_TOPUP_PRO_PRICE_ID
echo "<price_...>" | npx wrangler secret put STRIPE_TOPUP_MEGA_PRICE_ID
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
echo "<whsec_...>" | npx wrangler secret put STRIPE_WEBHOOK_SECRET
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
