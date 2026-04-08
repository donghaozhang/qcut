import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { rateLimitMiddleware, resetRateLimitState } from "./rate-limit";

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

function buildApp(limit?: number): Hono {
	if (limit !== undefined) {
		process.env.AI_PROXY_RATE_LIMIT = String(limit);
	}
	const app = new Hono();
	// Simulate authMiddleware by setting userId
	app.use("/*", async (c, next) => {
		c.set("userId", "test-user-1");
		await next();
	});
	app.use("/*", rateLimitMiddleware);
	app.get("/test", (c) => c.json({ ok: true }));
	return app;
}

beforeEach(() => {
	resetRateLimitState();
});

afterEach(() => {
	resetEnv();
	resetRateLimitState();
});

describe("rateLimitMiddleware", () => {
	it("allows requests under the limit", async () => {
		const app = buildApp(5);
		const res = await app.request("/test");
		expect(res.status).toBe(200);
	});

	it("returns 429 when limit is exceeded", async () => {
		const app = buildApp(3);
		for (let i = 0; i < 3; i++) {
			const res = await app.request("/test");
			expect(res.status).toBe(200);
		}
		const res = await app.request("/test");
		expect(res.status).toBe(429);
		const body = await res.json();
		expect(body.error).toBe("Too many requests");
		expect(body.retryAfter).toBeGreaterThan(0);
		expect(res.headers.get("Retry-After")).toBeTruthy();
	});

	it("defaults to 60 when env var is not set", async () => {
		delete process.env.AI_PROXY_RATE_LIMIT;
		const app = buildApp();
		// Should allow at least 10 requests (default is 60)
		for (let i = 0; i < 10; i++) {
			const res = await app.request("/test");
			expect(res.status).toBe(200);
		}
	});

	it("returns 401 when userId is not set", async () => {
		const app = new Hono();
		app.use("/*", rateLimitMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		const res = await app.request("/test");
		expect(res.status).toBe(401);
	});

	it("tracks different users independently", async () => {
		const app = new Hono();
		let currentUser = "user-a";
		app.use("/*", async (c, next) => {
			c.set("userId", currentUser);
			await next();
		});
		app.use("/*", rateLimitMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		process.env.AI_PROXY_RATE_LIMIT = "2";

		// User A: 2 requests (at limit)
		for (let i = 0; i < 2; i++) {
			const res = await app.request("/test");
			expect(res.status).toBe(200);
		}

		// User A: over limit
		let res = await app.request("/test");
		expect(res.status).toBe(429);

		// User B: should still have quota
		currentUser = "user-b";
		res = await app.request("/test");
		expect(res.status).toBe(200);
	});
});
