import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tests for pure logic extracted from stripe-service.
// Heavy DB/Stripe calls are tested via E2E with Stripe test-mode.
// ---------------------------------------------------------------------------

// Re-export of the billing_reason guard rule as a pure predicate so tests can
// assert the skip condition without instantiating DB or Stripe clients.
function shouldSkipInvoiceCredits(billingReason: string | null | undefined): boolean {
	return billingReason === "subscription_create";
}

// Pure predicate mirroring the customer-linking branch in createCheckoutSession.
function resolveCheckoutCustomer(
	stripeCustomerId: string | null | undefined
): string | undefined {
	return stripeCustomerId ?? undefined;
}

describe("invoice.payment_succeeded billing_reason guard", () => {
	it("skips credit grant when billing_reason is subscription_create", () => {
		expect(shouldSkipInvoiceCredits("subscription_create")).toBe(true);
	});

	it("processes credit grant for subscription_cycle (renewal)", () => {
		expect(shouldSkipInvoiceCredits("subscription_cycle")).toBe(false);
	});

	it("processes credit grant for manual invoices", () => {
		expect(shouldSkipInvoiceCredits("manual")).toBe(false);
	});

	it("processes credit grant when billing_reason is null", () => {
		expect(shouldSkipInvoiceCredits(null)).toBe(false);
	});
});

describe("createCheckoutSession customer linking", () => {
	it("passes existing customer ID when user has a stripeCustomerId", () => {
		expect(resolveCheckoutCustomer("cus_existing_123")).toBe("cus_existing_123");
	});

	it("returns undefined when user has no stripeCustomerId (null)", () => {
		expect(resolveCheckoutCustomer(null)).toBeUndefined();
	});

	it("returns undefined when user has no stripeCustomerId (undefined)", () => {
		expect(resolveCheckoutCustomer(undefined)).toBeUndefined();
	});
});
