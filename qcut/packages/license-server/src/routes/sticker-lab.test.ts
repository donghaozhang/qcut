import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
	createSignedUrl: vi.fn(),
	download: vi.fn(),
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
		download: storageMocks.download,
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
});

function buildThumbnailUrl({ objectKey }: { objectKey?: string } = {}) {
	const query = new URLSearchParams();
	if (objectKey !== undefined) {
		query.set("objectKey", objectKey);
	}
	const suffix = query.size > 0 ? `?${query.toString()}` : "";
	return `/api/sticker-lab/thumbnail${suffix}`;
}

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

describe("sticker lab preview tier", () => {
	const objectKey = "catalogs/qcut-original-test/assets/sticker-123.gif";

	it("serves previews to signed-in users outside the allowlist", async () => {
		// Browsing must not require the entitlement; only placing does.
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/preview" },
			error: null,
		});

		const response = await buildApp().request(buildThumbnailUrl({ objectKey }));

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://storage.example/preview"
		);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("signs previews with a server-side transform", async () => {
		// The size is applied when signing, so a preview link cannot be edited
		// into a full-resolution download.
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/preview" },
			error: null,
		});

		await buildApp().request(buildThumbnailUrl({ objectKey }));

		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(
			objectKey,
			expect.any(Number),
			{
				transform: {
					width: 192,
					height: 192,
					quality: 60,
					resize: "contain",
				},
			}
		);
	});

	it("still requires authentication", async () => {
		vi.stubEnv("MOCK_MODE", "false");

		const response = await buildApp().request(buildThumbnailUrl({ objectKey }));

		expect(response.status).toBe(401);
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("applies the same object key whitelist as the full asset", async () => {
		const responses = await Promise.all(
			[undefined, "", "catalogs/another-catalog/assets/sticker.gif"].map(
				(key) => buildApp().request(buildThumbnailUrl({ objectKey: key }))
			)
		);

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("keeps the full asset gated while the preview is open", async () => {
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/preview" },
			error: null,
		});

		const preview = await buildApp().request(buildThumbnailUrl({ objectKey }));
		const original = await buildApp().request(buildAssetUrl({ objectKey }));

		expect(preview.status).toBe(302);
		expect(original.status).toBe(403);
	});
});

describe("sticker lab private reference tier", () => {
	const privateObjectKey = "jianying/2026-07-31/assets/7437023238108105995.gif";
	const manifestUrl = "/api/sticker-lab/private-manifest";

	it("signs private reference originals for allow-listed users", async () => {
		allowMockUser();
		const signedUrl = "https://storage.example/private.gif?token=signed";
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl },
			error: null,
		});

		const response = await buildApp().request(
			buildAssetUrl({ objectKey: privateObjectKey })
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(signedUrl);
		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(
			privateObjectKey,
			600
		);
	});

	it("forbids private thumbnails outside the allowlist", async () => {
		// Unlike the public catalogue there is no browse-only tier: harvested
		// third-party artwork must never be visible to ordinary users.
		const response = await buildApp().request(
			buildThumbnailUrl({ objectKey: privateObjectKey })
		);

		expect(response.status).toBe(403);
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("signs private thumbnails without a transform for allow-listed users", async () => {
		allowMockUser();
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/private.gif" },
			error: null,
		});

		const response = await buildApp().request(
			buildThumbnailUrl({ objectKey: privateObjectKey })
		);

		expect(response.status).toBe(302);
		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(
			privateObjectKey,
			600
		);
	});

	it("rejects malformed private object keys", async () => {
		allowMockUser();
		const invalidKeys = [
			"jianying/2026-07-31/assets/sticker-abc.gif",
			"jianying/2026-07-31/assets/../123.gif",
			"jianying/2026-7-31/assets/123.gif",
			"jianying/2026-07-31/123.gif",
			"jianying/2026-07-31/assets/123.jpg",
		];

		const responses = await Promise.all(
			invalidKeys.map((objectKey) =>
				buildApp().request(buildAssetUrl({ objectKey }))
			)
		);

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("serves the private manifest to allow-listed users", async () => {
		allowMockUser();
		const manifestJson = JSON.stringify({
			version: 2,
			catalogId: "jianying-2026-07-31",
			categories: [],
		});
		storageMocks.download.mockResolvedValue({
			data: new Blob([manifestJson], { type: "application/json" }),
			error: null,
		});

		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		await expect(response.text()).resolves.toBe(manifestJson);
		expect(storageMocks.download).toHaveBeenCalledWith(
			"jianying/2026-07-31/manifest.json"
		);
	});

	it("forbids the private manifest outside the allowlist", async () => {
		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(403);
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("requires authentication for the private manifest", async () => {
		vi.stubEnv("MOCK_MODE", "false");

		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(401);
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("returns 404 when the private manifest object is missing", async () => {
		allowMockUser();
		storageMocks.download.mockResolvedValue({
			data: null,
			error: { message: "Object not found" },
		});

		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(404);
	});
});
