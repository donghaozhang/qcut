import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
	select: vi.fn(),
}));

vi.mock("../db/drizzle", () => ({
	db: {
		select: dbMocks.select,
	},
}));

const { authMiddleware } = await import("./auth");

function buildApp(): Hono {
	const app = new Hono();
	app.use("/*", authMiddleware);
	app.get("/test", (c) => c.json({ ok: true }));
	return app;
}

beforeEach(() => {
	vi.stubEnv("MOCK_MODE", "false");
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("authMiddleware error sanitization", () => {
	it("never echoes upstream exception text to the client", async () => {
		// Driver errors can contain hostnames, credentials, or SQL fragments.
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		dbMocks.select.mockImplementation(() => {
			throw new Error(
				"connect ECONNREFUSED db-internal.example.com:5432 SUPABASE_SERVICE_KEY=do-not-leak"
			);
		});

		const response = await buildApp().request("/test", {
			headers: { Authorization: "Bearer some-session-token" },
		});
		const responseText = await response.text();

		expect(response.status).toBe(500);
		expect(responseText).toBe('{"error":"Authentication failed"}');
		expect(responseText).not.toContain("db-internal.example.com");
		expect(responseText).not.toContain("do-not-leak");
		// The detail still reaches the server-side log for debugging.
		expect(consoleError).toHaveBeenCalledWith(
			"[auth] middleware failed:",
			expect.objectContaining({
				message: expect.stringContaining("db-internal.example.com"),
			})
		);
	});

	it("sanitizes non-Error throwables the same way", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		dbMocks.select.mockImplementation(() => {
			// Some drivers reject with plain objects rather than Error instances.
			throw { code: "XX000", detail: "internal partition table secret" };
		});

		const response = await buildApp().request("/test", {
			headers: { Authorization: "Bearer some-session-token" },
		});
		const responseText = await response.text();

		expect(response.status).toBe(500);
		expect(responseText).toBe('{"error":"Authentication failed"}');
		expect(responseText).not.toContain("partition table");
	});
});
