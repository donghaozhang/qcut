import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
	process.env.MOCK_MODE = "true";
	delete process.env.STICKER_LAB_ALLOWED_USER_IDS;
	vi.clearAllMocks();
	storageMocks.from.mockReturnValue({
		createSignedUrl: storageMocks.createSignedUrl,
	});
});

function allowMockUser() {
	process.env.STICKER_LAB_ALLOWED_USER_IDS = "mock-user-001";
}

describe("sticker lab routes", () => {
	it("requires authentication", async () => {
		delete process.env.MOCK_MODE;

		const response = await buildApp().request(buildAssetUrl());

		expect(response.status).toBe(401);
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids access when the allowlist is not configured", async () => {
		const response = await buildApp().request(
			buildAssetUrl({
				objectKey: "jianying/2026-07-31/assets/sticker-123.gif",
			})
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids authenticated users outside the allowlist", async () => {
		process.env.STICKER_LAB_ALLOWED_USER_IDS =
			" , another-user, a-third-user, ";

		const response = await buildApp().request(
			buildAssetUrl({
				objectKey: "jianying/2026-07-31/assets/sticker-123.gif",
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
			"jianying/2026-07-31/assets/sticker.jpg",
			"jianying/2026-07-31/assets/Sticker.gif",
			"jianying/2026_07_31/assets/sticker.gif",
			"jianying/2026-07-31/assets/sticker.gif/extra",
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
		const traversalKeys = [
			"jianying/2026-07-31/assets/../secret.gif",
			"jianying/../assets/secret.gif",
			"jianying/2026-07-31/assets/%2e%2e%2fsecret.gif",
		];

		const responses = await Promise.all(
			traversalKeys.map((objectKey) =>
				buildApp().request(buildAssetUrl({ objectKey }))
			)
		);

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("redirects authenticated requests to a short-lived signed URL", async () => {
		process.env.STICKER_LAB_ALLOWED_USER_IDS =
			" another-user, , mock-user-001, ";
		const objectKey = "jianying/2026-07-31/assets/sticker-123.gif";
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
				objectKey: "jianying/2026-07-31/assets/sticker-123.png",
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
				objectKey: "jianying/2026-07-31/assets/sticker-123.gif",
			})
		);
		const responseText = await response.text();

		expect(response.status).toBe(502);
		expect(responseText).toBe('{"error":"Failed to sign sticker asset"}');
		expect(responseText).not.toContain("service-role");
	});
});
