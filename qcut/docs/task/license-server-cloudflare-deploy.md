# License Server — Cloudflare Workers Deployment

## Overview

The `packages/license-server` is a Hono app deployed to Cloudflare Workers at
`https://qcut-license-server.workers.dev`.

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

| Secret | Where to find |
|--------|---------------|
| `SUPABASE_URL` | `https://kbrtxitvavpuimuihppz.supabase.co` (project ref from dashboard) |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API Keys → Legacy → `service_role` → Reveal |

```bash
echo "https://kbrtxitvavpuimuihppz.supabase.co" | npx wrangler secret put SUPABASE_URL
echo "<service_role_key>" | npx wrangler secret put SUPABASE_SERVICE_KEY
```

### Better Auth

| Secret | Where to find |
|--------|---------------|
| `BETTER_AUTH_SECRET` | Generate: `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Same OAuth 2.0 Client |

```bash
echo "<better_auth_secret>" | npx wrangler secret put BETTER_AUTH_SECRET
echo "<google_client_id>" | npx wrangler secret put GOOGLE_CLIENT_ID
echo "<google_client_secret>" | npx wrangler secret put GOOGLE_CLIENT_SECRET
```

### Stripe

| Secret | Where to find |
|--------|---------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → endpoint → Signing secret |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Stripe → Products → Pro plan → Monthly price ID |
| `STRIPE_PRO_YEARLY_PRICE_ID` | Stripe → Products → Pro plan → Yearly price ID |
| `STRIPE_TEAM_MONTHLY_PRICE_ID` | Stripe → Products → Team plan → Monthly price ID |
| `STRIPE_TEAM_YEARLY_PRICE_ID` | Stripe → Products → Team plan → Yearly price ID |
| `STRIPE_TOPUP_STARTER_PRICE_ID` | Stripe → Products → Top-up Starter |
| `STRIPE_TOPUP_STANDARD_PRICE_ID` | Stripe → Products → Top-up Standard |
| `STRIPE_TOPUP_PRO_PRICE_ID` | Stripe → Products → Top-up Pro |
| `STRIPE_TOPUP_MEGA_PRICE_ID` | Stripe → Products → Top-up Mega |

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
curl https://qcut-license-server.workers.dev/health
# Expected: {"status":"healthy","timestamp":"...","mock":false}
```

---

## Stripe Webhook — register endpoint

After deploy, register the webhook endpoint in Stripe Dashboard:

- **URL**: `https://qcut-license-server.workers.dev/api/stripe/webhook`
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
