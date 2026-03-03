import type { Context, Next } from "hono";

export function isMockMode(): boolean {
	return process.env.MOCK_MODE === "true";
}

const MOCK_USER_ID = "mock-user-001";

const MOCK_CREDITS = {
	planCredits: 500,
	topUpCredits: 0,
	totalCredits: 500,
	planCreditsResetAt: new Date(
		Date.now() + 30 * 24 * 60 * 60 * 1000
	).toISOString(),
};

const MOCK_LICENSE = {
	plan: "pro" as const,
	status: "active" as const,
	currentPeriodEnd: new Date(
		Date.now() + 30 * 24 * 60 * 60 * 1000
	).toISOString(),
	credits: MOCK_CREDITS,
};

/**
 * Mock auth middleware: bypasses real token validation in mock mode,
 * sets a fixed userId so downstream handlers work normally.
 */
export async function mockAuthMiddleware(c: Context, next: Next) {
	if (!isMockMode()) {
		await next();
		return;
	}
	c.set("userId", MOCK_USER_ID);
	await next();
}

/** Mock responses for specific routes when MOCK_MODE=true */
export function getMockResponse(
	path: string,
	method: string
): Record<string, unknown> | null {
	if (!isMockMode()) {
		return null;
	}

	if (path === "/api/license" && method === "GET") {
		return {
			license: MOCK_LICENSE,
			devices: [
				{
					id: "mock-device-001",
					deviceFingerprint: "mock-platform-mock-host",
					deviceName: "mock-host",
					lastSeenAt: new Date().toISOString(),
					isActive: true,
				},
			],
		};
	}

	if (path === "/api/license/validate" && method === "POST") {
		return { valid: true, license: MOCK_LICENSE };
	}

	if (path === "/api/license/status" && method === "GET") {
		return {
			...MOCK_LICENSE,
			maxDevices: 3,
			activeDevices: 1,
		};
	}

	if (path === "/api/license/activate" && method === "POST") {
		return {
			activation: {
				id: "mock-activation-001",
				deviceFingerprint: "mock",
				deviceName: "mock-host",
				isActive: true,
			},
			license: MOCK_LICENSE,
		};
	}

	if (path === "/api/credits" && method === "GET") {
		return { credits: MOCK_CREDITS };
	}

	if (path === "/api/credits/balance" && method === "GET") {
		return { credits: MOCK_CREDITS };
	}

	if (
		(path === "/api/credits/deduct" || path === "/api/credits/use") &&
		method === "POST"
	) {
		return { success: true, credits: MOCK_CREDITS };
	}

	if (path === "/api/stripe/checkout" && method === "POST") {
		return { url: "https://checkout.stripe.com/mock-session" };
	}

	if (path === "/api/stripe/portal" && method === "POST") {
		return { url: "https://billing.stripe.com/mock-portal" };
	}

	return null;
}
