# Payment Refund & Rollback Runbook

Last updated: 2026-03-06

## Purpose

Operational runbook for controlled rollback when payment state and product state diverge during canary or production incidents.

## Scope

- Subscription checkout and cancellation issues
- Top-up purchase/refund mismatches
- Webhook replay/retry incidents

## Primary Code Paths

- Webhook entry: `packages/license-server/src/routes/stripe.ts`
- Webhook handlers: `packages/license-server/src/services/stripe-service.ts`
- Credit reconciliation: `packages/license-server/src/services/credit-service.ts`
- License updates: `packages/license-server/src/services/license-service.ts`
- Idempotency records: `stripe_webhook_events` table

## Preconditions

1. Keep `PAYMENTS_CANARY_ONLY=true` during internal canary.
2. Keep `PAYMENTS_EMAIL_ALLOWLIST` restricted to internal test users.
3. Confirm kill switches are available:
   - `PAYMENTS_CHECKOUT_ENABLED`
   - `PAYMENTS_WEBHOOK_ENABLED`

## Emergency Stop Procedure

1. Disable new purchases:
   - set `PAYMENTS_CHECKOUT_ENABLED=false`
2. If webhook handling must pause:
   - set `PAYMENTS_WEBHOOK_ENABLED=false`
   - Stripe retries will continue because webhook endpoint returns `503`
3. Confirm API behavior:
   - `/api/stripe/checkout` and `/api/stripe/topup` return `503`
   - `/api/stripe/webhook` returns `503`

## Refund Reconciliation Procedure

1. Issue refund in Stripe Dashboard for impacted payment.
2. Confirm webhook delivery for `charge.refunded`.
3. Verify reconciliation in DB:
   - `credit_transactions` contains a `refund` row with `stripe_payment_id`
   - `credit_balances` reduced accordingly
4. If credits were already consumed and full reversal is impossible:
   - reconciliation writes an unreconciled shortfall note in transaction description
   - escalate to manual account remediation

## Subscription Rollback Procedure

1. Cancel or update subscription in Stripe (Dashboard/Portal).
2. Verify webhook processing for:
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Confirm QCut license state:
   - `licenses.plan`, `licenses.status`, `licenses.stripe_subscription_id`
4. Confirm plan credit state:
   - `credit_balances.plan_credits`
   - `credit_transactions` entries for grants/expiry

## Incident Forensics Checklist

1. Query `stripe_webhook_events` by `event_id`.
2. Check:
   - `processed_at`
   - `last_error`
   - `updated_at`
3. Verify no duplicate effects:
   - single `top_up` transaction per successful checkout payment id
   - no duplicate `plan_grant` for same renewal event id

## Exit Criteria

Resume normal processing only after all are true:

1. Affected users’ Stripe state and DB state are aligned.
2. Reconciliation entries are auditable (`credit_transactions`, `stripe_webhook_events`).
3. Kill switches are reverted deliberately:
   - `PAYMENTS_WEBHOOK_ENABLED=true`
   - `PAYMENTS_CHECKOUT_ENABLED=true`
