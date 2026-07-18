import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../services/user-keys-service", () => ({
	listUserKeys: vi.fn(),
	upsertUserKeys: vi.fn(),
	deleteUserKey: vi.fn(),
}));

const keysService = await import("../services/user-keys-service");
const { keysRoutes } = await import("./keys");

function storedKey({
	key = "ELEVENLABS_API_KEY",
	value = "sk_0123456789abcdef",
}: {
	key?: string;
	value?: string;
} = {}) {
	return {
		id: "secret-1",
		userId: "mock-user-001",
		key,
		value,
		createdAt: new Date("2026-07-18T00:00:00.000Z"),
		updatedAt: new Date("2026-07-18T00:01:00.000Z"),
	};
}

function buildApp() {
	const app = new Hono();
	app.route("/api/keys", keysRoutes);
	return app;
}

async function request(
	path: string,
	init: RequestInit = {}
): Promise<Response> {
	return buildApp().request(path, {
		...init,
		headers: {
			Authorization: "Bearer test-token",
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	});
}

beforeEach(() => {
	process.env.MOCK_MODE = "true";
	vi.clearAllMocks();
});

describe("keys routes", () => {
	it("lists the signed-in user's keys masked, never exposing values", async () => {
		vi.mocked(keysService.listUserKeys).mockResolvedValue([storedKey()]);

		const response = await request("/api/keys");
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			keys: Array<{ key: string; masked: string }>;
		};
		expect(body.keys).toHaveLength(1);
		expect(body.keys[0].key).toBe("ELEVENLABS_API_KEY");
		expect(body.keys[0].masked).toBe("sk_0****cdef");
		expect(JSON.stringify(body)).not.toContain("sk_0123456789abcdef");
		expect(keysService.listUserKeys).toHaveBeenCalledWith({
			userId: "mock-user-001",
		});
	});

	it("returns full values from /values for key sync", async () => {
		vi.mocked(keysService.listUserKeys).mockResolvedValue([
			storedKey(),
			storedKey({ key: "FAL_KEY", value: "fal-secret" }),
		]);

		const response = await request("/api/keys/values");
		expect(response.status).toBe(200);
		const body = (await response.json()) as { keys: Record<string, string> };
		expect(body.keys).toEqual({
			ELEVENLABS_API_KEY: "sk_0123456789abcdef",
			FAL_KEY: "fal-secret",
		});
	});

	it("upserts valid keys for the signed-in user", async () => {
		vi.mocked(keysService.upsertUserKeys).mockResolvedValue({ saved: 2 });

		const response = await request("/api/keys", {
			method: "PUT",
			body: JSON.stringify({
				keys: { FAL_KEY: "fal-secret", GEMINI_API_KEY: "gm-secret" },
			}),
		});
		expect(response.status).toBe(200);
		expect((await response.json()) as object).toEqual({ saved: 2 });
		expect(keysService.upsertUserKeys).toHaveBeenCalledWith({
			userId: "mock-user-001",
			keys: { FAL_KEY: "fal-secret", GEMINI_API_KEY: "gm-secret" },
		});
	});

	it("rejects malformed key names and values", async () => {
		const badName = await request("/api/keys", {
			method: "PUT",
			body: JSON.stringify({ keys: { "bad name": "value" } }),
		});
		expect(badName.status).toBe(400);

		const emptyValue = await request("/api/keys", {
			method: "PUT",
			body: JSON.stringify({ keys: { FAL_KEY: "" } }),
		});
		expect(emptyValue.status).toBe(400);

		const nonString = await request("/api/keys", {
			method: "PUT",
			body: JSON.stringify({ keys: { FAL_KEY: 42 } }),
		});
		expect(nonString.status).toBe(400);

		expect(keysService.upsertUserKeys).not.toHaveBeenCalled();
	});

	it("refuses to store the session token itself", async () => {
		const response = await request("/api/keys", {
			method: "PUT",
			body: JSON.stringify({ keys: { QCUT_AUTH_TOKEN: "token" } }),
		});
		expect(response.status).toBe(400);
		expect(keysService.upsertUserKeys).not.toHaveBeenCalled();
	});

	it("deletes a key by name", async () => {
		vi.mocked(keysService.deleteUserKey).mockResolvedValue({ deleted: true });

		const response = await request("/api/keys/FAL_KEY", { method: "DELETE" });
		expect(response.status).toBe(200);
		expect((await response.json()) as object).toEqual({ deleted: true });
		expect(keysService.deleteUserKey).toHaveBeenCalledWith({
			userId: "mock-user-001",
			key: "FAL_KEY",
		});
	});

	it("requires authentication", async () => {
		delete process.env.MOCK_MODE;
		const response = await buildApp().request("/api/keys");
		expect(response.status).toBe(401);
	});
});
