# Payment System — Status & Next Steps

Last updated: 2026-03-07

## Summary

QCut payment infrastructure is implemented end-to-end and **deployed to production** on Cloudflare Workers. Desktop app login (Google OAuth + email) is working. The license server is live with all secrets configured, database migrations applied, and auth verified.

**Current state: Ready for Stripe test-mode E2E.** Register the webhook, then run through checkout/subscription/refund flows.

---

## Deployment Status

| Component | Status | Details |
|-----------|--------|---------|
| CF Worker | ✅ Live | `https://qcut-license-server.zdhpeter.workers.dev` |
| Hyperdrive (DB proxy) | ✅ Active | ID `70804d32fc714532a36dd1a0620da9ae`, caching disabled |
| Supabase DB | ✅ Migrated | All 11 tables created, RLS disabled for server access |
| Google OAuth (web) | ✅ Verified | End-to-end flow working (`zdhpeter@gmail.com` user created) |
| Google OAuth (desktop) | ✅ Working | Opens browser → OAuth → `qcut://activate` deep link back |
| Email Auth (web + desktop) | ✅ Verified | Sign-up and sign-in working in both |
| Desktop Login UI | ✅ Done | Login/signup routes wired, "Sign in" link in header |
| Stripe Products | ✅ Created | 6 products, 10 prices (AUD, test mode) |
| Stripe Webhook | ⚠️ Endpoint ready | **Needs webhook registration in Stripe Dashboard** |
| Website (quriosity.com.au) | ✅ Fixed | HTTPS enforced, correct API URL, dashboard loads |
| Secrets (16 total) | ✅ All set | See `docs/task/license-server-cloudflare-deploy.md` |

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
3. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC
4. Verify credits increased on dashboard

### Step 3: Test Pro Subscription

1. Upgrade to Pro Monthly (A$19/mo) with test card
2. Verify plan = "Pro" and credits updated
3. Open billing portal → verify subscription visible

### Step 4: Test Cancellation

1. Billing portal → cancel subscription
2. Verify plan reverts to "Free"

### Step 5: Test Refund

1. Stripe Dashboard → Payments → find the top-up → Refund
2. Verify credits deducted by refunded amount

### Step 6: Test Desktop License Sync

1. Sign in via QCut desktop (Google or email)
2. Verify license/plan matches web dashboard
3. Verify credit balance matches
4. Use an AI feature to confirm credits deduct

### Step 7: Edge Cases

| Test Card | Scenario |
|-----------|----------|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0027 6000 3184` | Requires 3D Secure |

### After All Tests Pass → Go Live

1. Switch Stripe to live mode, create live products/prices
2. Update all `STRIPE_*` secrets to live keys
3. Re-register webhook with live endpoint
4. Enable canary: `PAYMENTS_CANARY_ONLY=true`, `PAYMENTS_EMAIL_ALLOWLIST=zdhpeter@gmail.com`
5. Do one real A$5 purchase, then refund yourself
6. Disable canary → public billing live

---

## Safety Guardrails (Built In)

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

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   QCut App      │────▶│  License Server   │◀────│   QCut Web      │
│   (Electron)    │     │  (CF Workers)     │     │  (quriosity.au) │
│                 │     │                   │     │                 │
│ • Login (Google │     │ • Better Auth     │     │ • Login page    │
│   + email)      │     │ • Stripe webhooks │     │ • Dashboard     │
│ • License check │     │ • Usage tracking  │     │ • Pricing       │
│ • Feature gates │     │ • Credit system   │     │ • Stripe Checkout│
│ • Deep link ✅  │     │ • OAuth bridge    │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │  Supabase (DB)   │
                     │  Stripe (API)    │
                     └──────────────────┘
```

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

## Key Files

### License Server
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

### Desktop App (Auth)
- `electron/license-handler.ts`
- `electron/preload.ts`
- `apps/web/src/hooks/auth/useLogin.ts`
- `apps/web/src/hooks/auth/useSignUp.ts`
- `apps/web/src/stores/license-store.ts`
- `apps/web/src/types/electron/api-license.ts`

### Database & Website
- `packages/db/src/schema.ts`
- `packages/nexusai-website/js/payment.js`

## Tests

```bash
bun run test:payments          # License server unit tests
cd packages/license-server && bun run test   # Direct
```

## Deployment

```bash
cd packages/license-server
npx wrangler deploy            # Deploy server
npx wrangler tail              # Live logs
npx wrangler secret list       # Check secrets
```

See `docs/task/license-server-cloudflare-deploy.md` for full deployment guide.
