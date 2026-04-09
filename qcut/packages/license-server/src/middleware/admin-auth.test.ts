import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { adminAuthMiddleware } from "./admin-auth";

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

function buildApp(): Hono {
	const app = new Hono();
	app.use("/*", adminAuthMiddleware);
	app.get("/test", (c) => c.json({ ok: true }));
	return app;
}

describe("adminAuthMiddleware", () => {
	it("returns 503 when ADMIN_API_KEY is not set", async () => {
		delete process.env.ADMIN_API_KEY;
		const res = await buildApp().request("/test");
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.error).toBe("Admin API not configured");
	});

	it("returns 401 when no x-admin-key header is provided", async () => {
		process.env.ADMIN_API_KEY = "secret-key";
		const res = await buildApp().request("/test");
		expect(res.status).toBe(401);
	});

	it("returns 401 when x-admin-key does not match", async () => {
		process.env.ADMIN_API_KEY = "secret-key";
		const res = await buildApp().request("/test", {
			headers: { "x-admin-key": "wrong-key" },
		});
		expect(res.status).toBe(401);
	});

	it("passes through when x-admin-key matches", async () => {
		process.env.ADMIN_API_KEY = "secret-key";
		const res = await buildApp().request("/test", {
			headers: { "x-admin-key": "secret-key" },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});

	it("trims whitespace from the header value", async () => {
		process.env.ADMIN_API_KEY = "secret-key";
		const res = await buildApp().request("/test", {
			headers: { "x-admin-key": "  secret-key  " },
		});
		expect(res.status).toBe(200);
	});
});
