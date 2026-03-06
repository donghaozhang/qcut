# Payment System — Next Steps

Last updated: 2026-03-07

## Prerequisites Done

- [x] License server deployed and live
- [x] Google OAuth working (web + desktop)
- [x] Email auth working (web + desktop)
- [x] Desktop app login implemented
- [x] Stripe test products/prices created (AUD)
- [x] Test user `zdhpeter@gmail.com` has 1000 credits

## Step 1: Register Stripe Webhook

**This must be done before any payment testing.**

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click "Add endpoint"
3. Set endpoint URL: `https://qcut-license-server.zdhpeter.workers.dev/api/stripe/webhook`
4. Select events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
   - `charge.refunded`
5. Click "Add endpoint"
6. Copy the **Signing secret** (`whsec_...`)
7. Update the secret in Cloudflare:
   ```bash
   cd packages/license-server
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   # Paste the whsec_... value
   npx wrangler deploy
   ```

## Step 2: Test Credit Top-Up (One-Time Purchase)

1. Log in at `https://quriosity.com.au/account/dashboard.html`
2. Click "Buy Credits" → choose Starter pack (A$5 / 50 credits)
3. On the Stripe checkout page, use test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12/30`)
   - CVC: any 3 digits (e.g. `123`)
4. Complete payment
5. Verify: refresh dashboard → credits should increase by 50

## Step 3: Test Pro Subscription

1. From dashboard, click "Upgrade to Pro"
2. Choose Monthly (A$19/mo) or Yearly (A$190/yr)
3. Use the same test card `4242 4242 4242 4242`
4. Complete checkout
5. Verify: dashboard shows plan = "Pro", credits updated

## Step 4: Test Billing Portal

1. From dashboard, click "Manage Billing"
2. Stripe billing portal opens
3. Verify you can see the active subscription
4. Try cancelling the subscription
5. Verify: dashboard shows plan reverted to "Free"

## Step 5: Test Refund (From Stripe Dashboard)

1. Go to [Stripe Dashboard → Payments](https://dashboard.stripe.com/test/payments)
2. Find the top-up payment from Step 2
3. Click "Refund" → full refund
4. Wait ~30 seconds for webhook to fire
5. Verify: credits deducted by the refunded amount

## Step 6: Test Desktop App License Sync

1. Open QCut desktop app
2. Sign in (Google or email)
3. Verify license/plan matches what's on the web dashboard
4. Verify credit balance matches
5. Try using an AI feature to confirm credits deduct

## Step 7: Test Edge Cases

### Declined card
- Use card `4000 0000 0000 0002` → should show payment declined error

### Insufficient funds
- Use card `4000 0000 0000 9995` → should show insufficient funds error

### 3D Secure required
- Use card `4000 0027 6000 3184` → triggers 3DS authentication flow

## Stripe Test Cards Reference

| Card Number | Scenario |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0027 6000 3184` | Requires 3D Secure |
| `4000 0000 0000 3220` | 3DS2 required |

All test cards: any future expiry, any 3-digit CVC, any billing ZIP.

## After All Tests Pass

1. Switch Stripe to **live mode**
2. Create live products/prices (same structure as test)
3. Update all `STRIPE_*` secrets in Cloudflare to live keys
4. Re-register webhook with live endpoint
5. Run a canary with `PAYMENTS_CANARY_ONLY=true` and `PAYMENTS_EMAIL_ALLOWLIST=zdhpeter@gmail.com`
6. Do one real A$5 top-up purchase to verify end-to-end
7. Refund yourself from Stripe Dashboard
8. Disable canary mode → public billing live
