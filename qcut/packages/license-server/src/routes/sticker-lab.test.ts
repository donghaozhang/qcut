import {
	getPrivateStickerCatalogDefinition,
	MAX_PRIVATE_STICKER_MANIFEST_BYTES,
	PRIVATE_STICKER_CATALOG_IDS,
	type PrivateStickerCatalogDefinition,
} from "@qcut/editor-core/sticker-lab";
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

const PRIVATE_CATALOG_CASES: PrivateStickerCatalogDefinition[] = [];
for (const catalogId of PRIVATE_STICKER_CATALOG_IDS) {
	const catalog = getPrivateStickerCatalogDefinition({ catalogId });
	if (!catalog) {
		throw new Error(`Missing private sticker catalog definition: ${catalogId}`);
	}
	PRIVATE_CATALOG_CASES.push(catalog);
}

function buildPrivateManifestUrl({ catalogId }: { catalogId?: string } = {}) {
	const query = new URLSearchParams();
	if (catalogId !== undefined) {
		query.set("catalogId", catalogId);
	}
	const suffix = query.size > 0 ? `?${query.toString()}` : "";
	return `/api/sticker-lab/private-manifest${suffix}`;
}

function buildPrivateObjectKey({
	assetObjectPrefix,
	extension = "gif",
}: {
	assetObjectPrefix: string;
	extension?: "gif" | "png";
}) {
	return `${assetObjectPrefix}7437023238108105995.${extension}`;
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
	const privateObjectKey = buildPrivateObjectKey({
		assetObjectPrefix: PRIVATE_CATALOG_CASES[0].assetObjectPrefix,
	});
	const manifestUrl = buildPrivateManifestUrl();

	it.each(
		PRIVATE_CATALOG_CASES
	)("signs private originals from $catalogId for allow-listed users", async ({
		assetObjectPrefix,
	}) => {
		allowMockUser();
		const objectKey = buildPrivateObjectKey({ assetObjectPrefix });
		const signedUrl = "https://storage.example/private.gif?token=signed";
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl },
			error: null,
		});

		const response = await buildApp().request(buildAssetUrl({ objectKey }));

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(signedUrl);
		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(objectKey, 600);
	});

	it.each(
		PRIVATE_CATALOG_CASES
	)("forbids $catalogId thumbnails outside the allowlist", async ({
		assetObjectPrefix,
	}) => {
		// Unlike the public catalogue there is no browse-only tier: harvested
		// third-party artwork must never be visible to ordinary users.
		const response = await buildApp().request(
			buildThumbnailUrl({
				objectKey: buildPrivateObjectKey({ assetObjectPrefix }),
			})
		);

		expect(response.status).toBe(403);
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids private originals outside the allowlist", async () => {
		// The allow-list check must come before key parsing, so this holds even
		// if the key branches are ever reordered.
		const response = await buildApp().request(
			buildAssetUrl({ objectKey: privateObjectKey })
		);

		expect(response.status).toBe(403);
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("rejects traversal attempts against private asset keys", async () => {
		allowMockUser();
		const traversalKeys = [
			`${PRIVATE_CATALOG_CASES[0].assetObjectPrefix}../7437023238108105995.gif`,
			"jianying/../2026-07-31/assets/7437023238108105995.gif",
		];
		const requests: Array<Promise<Response> | Response> = [];
		for (const objectKey of traversalKeys) {
			requests.push(buildApp().request(buildAssetUrl({ objectKey })));
			requests.push(buildApp().request(buildThumbnailUrl({ objectKey })));
			requests.push(
				buildApp().request(
					`/api/sticker-lab/assets?objectKey=${encodeURIComponent(objectKey)}`
				)
			);
			requests.push(
				buildApp().request(
					`/api/sticker-lab/thumbnail?objectKey=${encodeURIComponent(objectKey)}`
				)
			);
		}
		const responses = await Promise.all(requests);

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
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

	it.each([
		{
			assetObjectPrefix: PRIVATE_CATALOG_CASES[1].assetObjectPrefix,
			catalogId: PRIVATE_CATALOG_CASES[1].catalogId,
			extension: "png" as const,
		},
		{
			assetObjectPrefix: PRIVATE_CATALOG_CASES[2].assetObjectPrefix,
			catalogId: PRIVATE_CATALOG_CASES[2].catalogId,
			extension: "gif" as const,
		},
	])("signs $catalogId private thumbnails without a transform", async ({
		assetObjectPrefix,
		extension,
	}) => {
		allowMockUser();
		const objectKey = buildPrivateObjectKey({
			assetObjectPrefix,
			extension,
		});
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/private-preview" },
			error: null,
		});

		const response = await buildApp().request(buildThumbnailUrl({ objectKey }));

		expect(response.status).toBe(302);
		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(objectKey, 600);
	});

	it("rejects well-formed private keys outside the catalog registry", async () => {
		allowMockUser();
		const unregisteredKeys = [
			buildPrivateObjectKey({
				assetObjectPrefix: "jianying/2026-08-01/assets/",
			}),
			buildPrivateObjectKey({
				assetObjectPrefix: "jianying/2026-08-01-batch-4/assets/",
			}),
			buildPrivateObjectKey({
				assetObjectPrefix: "jianying/2026-08-02-batch-2/assets/",
			}),
		];
		const requests: Array<Promise<Response> | Response> = [];
		for (const objectKey of unregisteredKeys) {
			requests.push(buildApp().request(buildAssetUrl({ objectKey })));
			requests.push(buildApp().request(buildThumbnailUrl({ objectKey })));
		}
		const responses = await Promise.all(requests);

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
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

	it("defaults to the first private manifest for old clients", async () => {
		allowMockUser();
		const defaultCatalog = PRIVATE_CATALOG_CASES[0];
		const manifestJson = JSON.stringify({
			version: 2,
			catalogId: defaultCatalog.catalogId,
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
		// Only the path: storage-js spreads any third argument into the fetch
		// RequestInit, and workerd rejects a `cache` field outright. Asserting
		// the extra arguments is what let the production 404 ship green.
		expect(storageMocks.download).toHaveBeenCalledWith(
			defaultCatalog.manifestObjectKey
		);
	});

	it.each(
		PRIVATE_CATALOG_CASES
	)("maps $catalogId to its fixed manifest object", async ({
		catalogId,
		manifestObjectKey,
	}) => {
		allowMockUser();
		const manifestJson = JSON.stringify({
			version: 2,
			catalogId,
			categories: [],
		});
		storageMocks.download.mockResolvedValue({
			data: new Blob([manifestJson], { type: "application/json" }),
			error: null,
		});

		const response = await buildApp().request(
			buildPrivateManifestUrl({ catalogId })
		);

		expect(response.status).toBe(200);
		await expect(response.text()).resolves.toBe(manifestJson);
		expect(storageMocks.download).toHaveBeenCalledWith(manifestObjectKey);
	});

	it("rejects an oversized private manifest before reading its bytes", async () => {
		allowMockUser();
		const arrayBuffer = vi.fn();
		storageMocks.download.mockResolvedValue({
			data: {
				arrayBuffer,
				size: MAX_PRIVATE_STICKER_MANIFEST_BYTES + 1,
			},
			error: null,
		});

		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(502);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		await expect(response.json()).resolves.toEqual({
			error: "Private manifest unavailable",
		});
		expect(arrayBuffer).not.toHaveBeenCalled();
	});

	it("rejects private manifest bytes larger than their declared size", async () => {
		allowMockUser();
		const manifestBytes = new Uint8Array(MAX_PRIVATE_STICKER_MANIFEST_BYTES + 1)
			.buffer;
		const arrayBuffer = vi.fn().mockResolvedValue(manifestBytes);
		storageMocks.download.mockResolvedValue({
			data: {
				arrayBuffer,
				size: MAX_PRIVATE_STICKER_MANIFEST_BYTES,
			},
			error: null,
		});

		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(502);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		await expect(response.json()).resolves.toEqual({
			error: "Private manifest unavailable",
		});
		expect(arrayBuffer).toHaveBeenCalledOnce();
	});

	it("allows a private manifest exactly at the byte limit", async () => {
		allowMockUser();
		const manifestBytes = new Uint8Array(MAX_PRIVATE_STICKER_MANIFEST_BYTES)
			.buffer;
		const arrayBuffer = vi.fn().mockResolvedValue(manifestBytes);
		storageMocks.download.mockResolvedValue({
			data: {
				arrayBuffer,
				size: MAX_PRIVATE_STICKER_MANIFEST_BYTES,
			},
			error: null,
		});

		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect((await response.arrayBuffer()).byteLength).toBe(
			MAX_PRIVATE_STICKER_MANIFEST_BYTES
		);
		expect(arrayBuffer).toHaveBeenCalledOnce();
	});

	it.each([
		{ catalogId: "" },
		{ catalogId: "jianying-2026-08-01" },
		{ catalogId: "jianying-2026-08-01-batch-4" },
		{ catalogId: "jianying-2026-08-01-batch-2/../batch-3" },
		{ catalogId: "qcut-original-2026-07-31" },
	])("rejects an unknown private catalog selector: $catalogId", async ({
		catalogId,
	}) => {
		allowMockUser();

		const response = await buildApp().request(
			buildPrivateManifestUrl({ catalogId })
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Invalid private sticker catalog",
		});
		expect(storageMocks.from).not.toHaveBeenCalled();
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("checks the allowlist before revealing selector validity", async () => {
		const response = await buildApp().request(
			buildPrivateManifestUrl({
				catalogId: "jianying-2026-08-01-batch-4",
			})
		);

		expect(response.status).toBe(403);
		expect(storageMocks.from).not.toHaveBeenCalled();
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("forbids the private manifest outside the allowlist", async () => {
		const response = await buildApp().request(
			buildPrivateManifestUrl({
				catalogId: PRIVATE_CATALOG_CASES[2].catalogId,
			})
		);

		expect(response.status).toBe(403);
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("requires authentication for the private manifest", async () => {
		vi.stubEnv("MOCK_MODE", "false");

		const response = await buildApp().request(
			buildPrivateManifestUrl({
				catalogId: PRIVATE_CATALOG_CASES[1].catalogId,
			})
		);

		expect(response.status).toBe(401);
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("returns a sanitized 404 when the private manifest object is missing", async () => {
		allowMockUser();
		storageMocks.download.mockResolvedValue({
			data: null,
			error: { message: "SUPABASE_SERVICE_KEY=do-not-leak" },
		});

		const response = await buildApp().request(manifestUrl);
		const responseText = await response.text();

		expect(response.status).toBe(404);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(responseText).toBe('{"error":"Private manifest unavailable"}');
		expect(responseText).not.toContain("do-not-leak");
	});

	it("sanitizes exceptions raised while downloading the private manifest", async () => {
		allowMockUser();
		storageMocks.download.mockRejectedValue(
			new Error("service-role secret leaked by upstream")
		);

		const response = await buildApp().request(manifestUrl);
		const responseText = await response.text();

		expect(response.status).toBe(502);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(responseText).toBe('{"error":"Private manifest unavailable"}');
		expect(responseText).not.toContain("service-role");
	});
});
