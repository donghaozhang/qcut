# QCut Beta Tester Invites

## How It Works

QCut uses a **credit-based licensing system** via the license server (`qcut-license-server.zdhpeter.workers.dev`).

- Users sign up with **Google OAuth** (primary) or **email/password**
- Each plan gets monthly credits: **Free=50, Pro=500, Team=2000**
- Credits reset monthly (auto-reset on first API call after reset timestamp)
- Plan credits are consumed first, then top-up credits
- API keys are **app-level** (FAL, Gemini, ElevenLabs, etc.) — testers do NOT need their own keys
- Credit precision: `numeric(12,3)` — supports fractional credits (0.001 minimum)

## Plans & Limits

| Plan | Credits/Month | Devices | Stripe Required |
|------|---------------|---------|-----------------|
| Free | 50 | 1 | No |
| Pro | 500 | 3 | Yes |
| Team | 2000 | 10 | Yes |

## Top-Up Credit Packs (Stripe)

| Pack | Credits |
|------|---------|
| Starter | 50 |
| Standard | 120 |
| Pro | 350 |
| Mega | 800 |

## New User Signup Flow

1. User signs up via Google OAuth or email/password (Better Auth)
2. `users` table entry created automatically by Better Auth
3. `licenses` table auto-created on first API call → **Free plan**, status=active, 1 device
4. `creditBalances` auto-created on first credit API call → **50 plan credits**, 0 top-up, reset in 1 month
5. A `plan_grant` transaction is recorded in `creditTransactions`

No manual provisioning needed — Free tier is fully automatic.

## Credit Deduction

- Endpoint: `POST /api/credits/deduct` (or `/api/credits/use`)
- Requires: `amount`, `modelKey`, `description`
- Consumes **planCredits first**, then **topUpCredits**
- Returns `402 Insufficient Credits` if balance too low
- All operations use database transactions (atomic, no race conditions)

## API Endpoints

### License

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/license/` | GET | Full license info with devices & credits |
| `GET /api/license/status` | GET | Plan, status, device count, credits |
| `GET /api/license/validate` | GET | Check if license is active/valid |
| `POST /api/license/activate` | POST | Register new device |
| `DELETE /api/license/deactivate` | DELETE | Unregister device |

### Credits

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/credits/` | GET | Current balance (planCredits + topUpCredits) |
| `GET /api/credits/balance` | GET | Formatted balance with reset timestamp |
| `POST /api/credits/deduct` | POST | Deduct credits |
| `POST /api/credits/use` | POST | Alias for deduct |
| `GET /api/credits/history` | GET | Transaction history (limit 1-200) |

### Stripe / Payments

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/stripe/checkout` | POST | Create subscription checkout |
| `POST /api/stripe/topup` | POST | Create credit top-up checkout |
| `POST /api/stripe/portal` | POST | Billing portal session |
| `POST /api/stripe/webhook` | POST | Handle Stripe webhooks |

### Admin (requires `x-admin-key` header)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/admin/user?email=` | GET | Look up user by email (ID, plan, credits) |
| `POST /api/admin/grant-credits` | POST | Bulk grant top-up credits by email |
| `POST /api/admin/upgrade-plan` | POST | Upgrade user plan by email |

### Auth

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/auth/google/start` | GET | Start Google OAuth flow |
| `GET /api/auth/callback/:provider` | GET | OAuth callback |
| `GET /api/auth/oauth/token-bridge` | GET | Token bridge for static clients |
| `GET /api/auth/oauth/desktop-bridge` | GET | Desktop activation (`qcut://activate?token=...`) |

## Canary / Beta Gate

Control who can make payments during beta testing.

**Environment variables** (set on the Cloudflare Worker):

```bash
PAYMENTS_CANARY_ONLY=true              # Block payments for non-allowlisted users
PAYMENTS_EMAIL_ALLOWLIST=a@b.com,c@d.com  # Comma-separated, case-insensitive
```

When enabled:
- Checkout and top-up endpoints return **403** for users not in the allowlist
- Error message: "Payments are currently restricted to internal tester accounts"
- Free tier signup still works for everyone

**Implementation**: `packages/license-server/src/services/payment-access.ts`

## Onboarding a Tester

### Minimal (Free Tier — no manual steps)
1. Tester opens QCut and signs in with their Gmail
2. They automatically get Free plan: 50 credits/month, 1 device
3. Done — they can start using AI features immediately

### Upgraded (More Credits)

Option A — **Admin API** (recommended):
```bash
# Look up a user
curl -H "x-admin-key: $ADMIN_API_KEY" \
  "https://qcut-license-server.zdhpeter.workers.dev/api/admin/user?email=tester@gmail.com"

# Grant 500 top-up credits to one or more users
curl -X POST -H "x-admin-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"emails": ["tester1@gmail.com", "tester2@gmail.com"], "amount": 500, "description": "Beta tester grant"}' \
  "https://qcut-license-server.zdhpeter.workers.dev/api/admin/grant-credits"

# Upgrade a user's plan (also resets plan credits to match new tier)
curl -X POST -H "x-admin-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "tester@gmail.com", "plan": "pro"}' \
  "https://qcut-license-server.zdhpeter.workers.dev/api/admin/upgrade-plan"
```

Option B — **Allow self-service payment**:
1. Set `PAYMENTS_CANARY_ONLY=true` on the worker
2. Add tester email to `PAYMENTS_EMAIL_ALLOWLIST`
3. Tester can buy top-up packs or upgrade via Stripe checkout

Option C — **Direct SQL** (if admin API not deployed yet):
```sql
UPDATE licenses SET plan = 'pro', max_devices = 3 WHERE user_id = '<id>';
UPDATE credit_balances SET plan_credits = 500 WHERE user_id = '<id>';
```

## Database Schema (Key Tables)

```text
users
├─ id, email (unique), name, image, emailVerified, createdAt

licenses
├─ userId (unique FK → users)
├─ plan: "free" | "pro" | "team"
├─ status: "active" | "past_due" | "cancelled" | "expired"
├─ maxDevices, stripeCustomerId, stripeSubscriptionId

creditBalances
├─ userId (unique FK → users)
├─ planCredits, topUpCredits (numeric 12,3)
├─ planCreditsResetAt

creditTransactions
├─ userId (FK → users)
├─ type: "plan_grant" | "top_up" | "deduction" | "refund" | "expiry"
├─ amount, balanceAfter, modelKey, description
```

## Setup Checklist

- [x] Auth system (Google OAuth + email/password) — implemented
- [x] Credit system (plans, deduction, monthly reset) — implemented
- [x] Stripe payments (subscriptions + top-ups) — implemented
- [x] Canary gate (`PAYMENTS_CANARY_ONLY` + email allowlist) — implemented
- [x] Admin API for bulk credit grants & plan upgrades — implemented
- [ ] Set `ADMIN_API_KEY` env var on Cloudflare Worker (via `wrangler secret put ADMIN_API_KEY`)
- [ ] Deploy license server with admin routes (`wrangler deploy` from `packages/license-server/`)
- [ ] Decide: grant extra credits via admin API, or upgrade plan to Pro/Team?
- [ ] Decide: enable `PAYMENTS_CANARY_ONLY=true` for beta period?
- [ ] Decide: add testers to `PAYMENTS_EMAIL_ALLOWLIST` for self-service top-up?

## Tester List

11 test accounts provisioned on 2026-04-10, each with 1000 credits on the free plan.

- **Email pattern**: `@qcut.app` domain
- **Accounts**: 1 primary + 10 numbered variants (1–10)
- **Credentials**: stored securely — ask project admin or check `QCUT_TEST_EMAIL` / `QCUT_TEST_PASSWORD` env vars
- **Status**: all active
