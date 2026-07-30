import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
	createSignedUrl: vi.fn(),
	from: vi.fn(),
}));

vi.mock("../db/supabase", () => ({
	getSupabase: vi.fn(() => ({
		storage: {
			from: storageMocks.from,
		},
	})),
}));

const { stickerLabRoutes } = await import("./sticker-lab");

function buildApp() {
	const app = new Hono();
	app.route("/api/sticker-lab", stickerLabRoutes);
	return app;
}

function buildAssetUrl({ objectKey }: { objectKey?: string } = {}) {
	const query = new URLSearchParams();
	if (objectKey !== undefined) {
		query.set("objectKey", objectKey);
	}
	const suffix = query.size > 0 ? `?${query.toString()}` : "";
	return `/api/sticker-lab/assets${suffix}`;
}

beforeEach(() => {
	vi.stubEnv("MOCK_MODE", "true");
	vi.stubEnv("STICKER_LAB_ALLOWED_USER_IDS", "");
	vi.clearAllMocks();
	storageMocks.from.mockReturnValue({
		createSignedUrl: storageMocks.createSignedUrl,
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
});

function allowMockUser() {
	vi.stubEnv("STICKER_LAB_ALLOWED_USER_IDS", "mock-user-001");
}

describe("sticker lab routes", () => {
	it("requires authentication", async () => {
		vi.stubEnv("MOCK_MODE", "false");

		const response = await buildApp().request(buildAssetUrl());

		expect(response.status).toBe(401);
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids access when the allowlist is not configured", async () => {
		const response = await buildApp().request(
			buildAssetUrl({
				objectKey: "catalogs/qcut-original-test/assets/sticker-123.gif",
			})
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids authenticated users outside the allowlist", async () => {
		vi.stubEnv(
			"STICKER_LAB_ALLOWED_USER_IDS",
			" , another-user, a-third-user, "
		);

		const response = await buildApp().request(
			buildAssetUrl({
				objectKey: "catalogs/qcut-original-test/assets/sticker-123.gif",
			})
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("rejects missing and malformed object keys", async () => {
		allowMockUser();
		const invalidKeys = [
			undefined,
			"",
			"stickers/2026-07-31/assets/sticker.gif",
			"catalogs/qcut-original-test/assets/sticker.jpg",
			"catalogs/qcut-original-test/assets/Sticker.gif",
			"catalogs/qcut_original_test/assets/sticker.gif",
			"catalogs/qcut-original-test/assets/sticker.gif/extra",
			"catalogs/another-catalog/assets/sticker.gif",
		];

		const responses = await Promise.all(
			invalidKeys.map((objectKey) =>
				buildApp().request(buildAssetUrl({ objectKey }))
			)
		);

		for (const response of responses) {
			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toEqual({
				error: "Invalid sticker object key",
			});
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("rejects traversal attempts", async () => {
		allowMockUser();
		const encodedTraversalUrl =
			"/api/sticker-lab/assets?objectKey=catalogs%2Fqcut-original-test%2Fassets%2F%2e%2e%2Fsecret.gif";
		const traversalUrls = [
			buildAssetUrl({
				objectKey: "catalogs/qcut-original-test/assets/../secret.gif",
			}),
			buildAssetUrl({ objectKey: "catalogs/../assets/secret.gif" }),
			encodedTraversalUrl,
		];
		expect(
			new URL(encodedTraversalUrl, "https://qcut.test").searchParams.get(
				"objectKey"
			)
		).toContain("/../");

		const responses = await Promise.all(
			traversalUrls.map((requestUrl) => buildApp().request(requestUrl))
		);

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("redirects authenticated requests to a short-lived signed URL", async () => {
		vi.stubEnv(
			"STICKER_LAB_ALLOWED_USER_IDS",
			" another-user, , mock-user-001, "
		);
		const objectKey = "catalogs/qcut-original-test/assets/sticker-123.gif";
		const signedUrl =
			"https://example.supabase.co/storage/v1/object/sign/sticker-lab/sticker.gif?token=signed";
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl },
			error: null,
		});

		const response = await buildApp().request(buildAssetUrl({ objectKey }));

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(signedUrl);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(storageMocks.from).toHaveBeenCalledWith("sticker-lab");
		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(objectKey, 600);
	});

	it("returns a sanitized upstream error when Supabase cannot sign", async () => {
		allowMockUser();
		storageMocks.createSignedUrl.mockResolvedValue({
			data: null,
			error: {
				message: "SUPABASE_SERVICE_KEY=do-not-leak",
			},
		});

		const response = await buildApp().request(
			buildAssetUrl({
				objectKey: "catalogs/qcut-original-test/assets/sticker-123.png",
			})
		);
		const responseText = await response.text();

		expect(response.status).toBe(502);
		expect(responseText).toBe('{"error":"Failed to sign sticker asset"}');
		expect(responseText).not.toContain("do-not-leak");
	});

	it("sanitizes exceptions raised while signing", async () => {
		allowMockUser();
		storageMocks.createSignedUrl.mockRejectedValue(
			new Error("service-role secret leaked by upstream")
		);

		const response = await buildApp().request(
			buildAssetUrl({
				objectKey: "catalogs/qcut-original-test/assets/sticker-123.gif",
			})
		);
		const responseText = await response.text();

		expect(response.status).toBe(502);
		expect(responseText).toBe('{"error":"Failed to sign sticker asset"}');
		expect(responseText).not.toContain("service-role");
	});
});
