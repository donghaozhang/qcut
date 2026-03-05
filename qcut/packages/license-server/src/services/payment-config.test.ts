import { afterEach, describe, expect, it } from "vitest";
import {
	getAllowedCorsOrigins,
	getPaymentWebBaseUrl,
	isEmailAllowedForCanary,
	resolveStripeIdempotencyKey,
} from "./payment-config";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
	for (const key of Object.keys(process.env)) {
		if (!(key in ORIGINAL_ENV)) {
			delete process.env[key];
		}
	}
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		process.env[key] = value;
	}
}

afterEach(() => {
	resetEnv();
});

describe("payment-config", () => {
	it("uses quriosity base URL by default", () => {
		delete process.env.PAYMENTS_WEB_BASE_URL;
		expect(getPaymentWebBaseUrl()).toBe("https://quriosity.com.au");
	});

	it("uses configured payment base URL", () => {
		process.env.PAYMENTS_WEB_BASE_URL = "https://billing.example.com/";
		expect(getPaymentWebBaseUrl()).toBe("https://billing.example.com");
	});

	it("keeps explicit idempotency keys", () => {
		const key = resolveStripeIdempotencyKey({
			providedKey: "manual-key-1",
			scope: "checkout",
			ownerId: "user-1",
			payloadParts: ["pro", "month"],
			nowMs: 0,
		});
		expect(key).toBe("manual-key-1");
	});

	it("builds deterministic fallback idempotency keys per time bucket", () => {
		const keyOne = resolveStripeIdempotencyKey({
			scope: "checkout",
			ownerId: "user-1",
			payloadParts: ["pro", "month"],
			nowMs: 10_000,
		});
		const keyTwo = resolveStripeIdempotencyKey({
			scope: "checkout",
			ownerId: "user-1",
			payloadParts: ["pro", "month"],
			nowMs: 10_001,
		});
		const keyThree = resolveStripeIdempotencyKey({
			scope: "checkout",
			ownerId: "user-1",
			payloadParts: ["pro", "month"],
			nowMs: 600_000,
		});
		expect(keyOne).toBe(keyTwo);
		expect(keyThree).not.toBe(keyOne);
	});

	it("honors canary email allowlist when canary mode is enabled", () => {
		process.env.PAYMENTS_CANARY_ONLY = "true";
		process.env.PAYMENTS_EMAIL_ALLOWLIST = "internal@qcut.app";
		expect(
			isEmailAllowedForCanary({
				email: "internal@qcut.app",
			})
		).toBe(true);
		expect(
			isEmailAllowedForCanary({
				email: "external@qcut.app",
			})
		).toBe(false);
	});

	it("includes configured CORS origins without dropping defaults", () => {
		process.env.CORS_ALLOWED_ORIGINS =
			"https://billing.example.com,https://quriosity.com.au";
		const origins = getAllowedCorsOrigins();
		expect(origins).toContain("https://billing.example.com");
		expect(origins).toContain("https://quriosity.com.au");
		expect(origins).toContain("http://localhost:3000");
	});
});
