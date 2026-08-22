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

const LEGACY_STICKER_LAB_ALLOWLIST = "STICKER_LAB_ALLOWED_USER_IDS";
const ORIGINAL_STICKER_LAB_ALLOWLIST = "STICKER_LAB_ORIGINAL_ALLOWED_USER_IDS";
const PRIVATE_REFERENCE_ALLOWLIST =
	"STICKER_LAB_PRIVATE_REFERENCE_ALLOWED_USER_IDS";
const MOCK_USER_ID = "mock-user-001";

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
	vi.stubEnv(LEGACY_STICKER_LAB_ALLOWLIST, "");
	vi.stubEnv(ORIGINAL_STICKER_LAB_ALLOWLIST, "");
	vi.stubEnv(PRIVATE_REFERENCE_ALLOWLIST, "");
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

function allowOriginalMockUser() {
	vi.stubEnv(ORIGINAL_STICKER_LAB_ALLOWLIST, MOCK_USER_ID);
}

function allowPrivateReferenceMockUser() {
	vi.stubEnv(PRIVATE_REFERENCE_ALLOWLIST, MOCK_USER_ID);
}

function expectNoStore({ response }: { response: Response }): void {
	expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("sticker lab routes", () => {
	it("requires authentication", async () => {
		vi.stubEnv("MOCK_MODE", "false");

		const response = await buildApp().request(buildAssetUrl());

		expect(response.status).toBe(401);
		expectNoStore({ response });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids access when the allowlist is not configured", async () => {
		const response = await buildApp().request(
			buildAssetUrl({
				objectKey: "catalogs/qcut-original-test/assets/sticker-123.gif",
			})
		);

		expect(response.status).toBe(403);
		expectNoStore({ response });
		await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids authenticated users outside the allowlist", async () => {
		vi.stubEnv(
			ORIGINAL_STICKER_LAB_ALLOWLIST,
			" , another-user, a-third-user, "
		);

		const response = await buildApp().request(
			buildAssetUrl({
				objectKey: "catalogs/qcut-original-test/assets/sticker-123.gif",
			})
		);

		expect(response.status).toBe(403);
		expectNoStore({ response });
		await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("rejects missing and malformed object keys", async () => {
		allowOriginalMockUser();
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
			expectNoStore({ response });
			await expect(response.json()).resolves.toEqual({
				error: "Invalid sticker object key",
			});
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("rejects traversal attempts", async () => {
		allowOriginalMockUser();
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
			expectNoStore({ response });
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("redirects authenticated requests to a short-lived signed URL", async () => {
		vi.stubEnv(
			ORIGINAL_STICKER_LAB_ALLOWLIST,
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
		expectNoStore({ response });
		expect(storageMocks.from).toHaveBeenCalledWith("sticker-lab");
		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(objectKey, 600);
	});

	it("returns a sanitized upstream error when Supabase cannot sign", async () => {
		allowOriginalMockUser();
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
		expectNoStore({ response });
		expect(responseText).toBe('{"error":"Failed to sign sticker asset"}');
		expect(responseText).not.toContain("do-not-leak");
	});

	it("sanitizes exceptions raised while signing", async () => {
		allowOriginalMockUser();
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
		expectNoStore({ response });
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
		expectNoStore({ response });
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
		expectNoStore({ response });
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
			expectNoStore({ response });
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
		expectNoStore({ response: preview });
		expect(original.status).toBe(403);
		expectNoStore({ response: original });
	});

	it("marks thumbnail signing failures as no-store", async () => {
		storageMocks.createSignedUrl.mockResolvedValue({
			data: null,
			error: { message: "private storage detail" },
		});

		const response = await buildApp().request(buildThumbnailUrl({ objectKey }));

		expect(response.status).toBe(502);
		expectNoStore({ response });
		await expect(response.json()).resolves.toEqual({
			error: "Failed to sign sticker asset",
		});
	});
});

describe("sticker lab entitlement migration", () => {
	const originalObjectKey =
		"catalogs/qcut-original-test/assets/sticker-123.gif";
	const privateObjectKey = buildPrivateObjectKey({
		assetObjectPrefix: PRIVATE_CATALOG_CASES[0].assetObjectPrefix,
	});

	it("allows the original tier to intentionally use the wildcard", async () => {
		vi.stubEnv(ORIGINAL_STICKER_LAB_ALLOWLIST, "*");
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/original" },
			error: null,
		});

		const response = await buildApp().request(
			buildAssetUrl({ objectKey: originalObjectKey })
		);

		expect(response.status).toBe(302);
		expectNoStore({ response });
		expect(storageMocks.createSignedUrl).toHaveBeenCalledOnce();
	});

	it("still requires authentication when the original tier uses the wildcard", async () => {
		vi.stubEnv(ORIGINAL_STICKER_LAB_ALLOWLIST, "*");
		vi.stubEnv("MOCK_MODE", "false");

		const response = await buildApp().request(
			buildAssetUrl({ objectKey: originalObjectKey })
		);

		expect(response.status).toBe(401);
		expectNoStore({ response });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it.each([
		{ allowlist: "*" },
		{ allowlist: `*,${MOCK_USER_ID}` },
	])("rejects wildcard private-reference configuration $allowlist", async ({
		allowlist,
	}) => {
		vi.stubEnv(PRIVATE_REFERENCE_ALLOWLIST, allowlist);

		const responses = await Promise.all([
			buildApp().request(buildAssetUrl({ objectKey: privateObjectKey })),
			buildApp().request(buildThumbnailUrl({ objectKey: privateObjectKey })),
			buildApp().request(buildPrivateManifestUrl()),
		]);

		for (const response of responses) {
			expect(response.status).toBe(403);
			expectNoStore({ response });
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
		expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("keeps the original and private-reference entitlements independent", async () => {
		allowPrivateReferenceMockUser();

		const response = await buildApp().request(
			buildAssetUrl({ objectKey: originalObjectKey })
		);

		expect(response.status).toBe(403);
		expectNoStore({ response });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("does not use the original entitlement for private-reference routes", async () => {
		allowOriginalMockUser();

		const responses = await Promise.all([
			buildApp().request(buildAssetUrl({ objectKey: privateObjectKey })),
			buildApp().request(buildThumbnailUrl({ objectKey: privateObjectKey })),
			buildApp().request(buildPrivateManifestUrl()),
		]);

		for (const response of responses) {
			expect(response.status).toBe(403);
			expectNoStore({ response });
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
		expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("falls back to explicit legacy IDs when both new variables are undefined", async () => {
		vi.stubEnv(ORIGINAL_STICKER_LAB_ALLOWLIST, undefined);
		vi.stubEnv(PRIVATE_REFERENCE_ALLOWLIST, undefined);
		vi.stubEnv(LEGACY_STICKER_LAB_ALLOWLIST, MOCK_USER_ID);
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/legacy" },
			error: null,
		});

		const originalResponse = await buildApp().request(
			buildAssetUrl({ objectKey: originalObjectKey })
		);
		const privateResponse = await buildApp().request(
			buildAssetUrl({ objectKey: privateObjectKey })
		);

		expect(originalResponse.status).toBe(302);
		expectNoStore({ response: originalResponse });
		expect(privateResponse.status).toBe(302);
		expectNoStore({ response: privateResponse });
		expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(2);
	});

	it("allows legacy wildcard access only to original assets", async () => {
		vi.stubEnv(ORIGINAL_STICKER_LAB_ALLOWLIST, undefined);
		vi.stubEnv(PRIVATE_REFERENCE_ALLOWLIST, undefined);
		vi.stubEnv(LEGACY_STICKER_LAB_ALLOWLIST, "*");
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/legacy-original" },
			error: null,
		});

		const originalResponse = await buildApp().request(
			buildAssetUrl({ objectKey: originalObjectKey })
		);
		const privateResponses = await Promise.all([
			buildApp().request(buildAssetUrl({ objectKey: privateObjectKey })),
			buildApp().request(buildThumbnailUrl({ objectKey: privateObjectKey })),
			buildApp().request(buildPrivateManifestUrl()),
		]);

		expect(originalResponse.status).toBe(302);
		expectNoStore({ response: originalResponse });
		for (const response of privateResponses) {
			expect(response.status).toBe(403);
			expectNoStore({ response });
		}
		expect(storageMocks.from).toHaveBeenCalledTimes(1);
		expect(storageMocks.createSignedUrl).toHaveBeenCalledOnce();
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("treats empty new variables as fail-closed legacy overrides", async () => {
		vi.stubEnv(LEGACY_STICKER_LAB_ALLOWLIST, MOCK_USER_ID);

		const responses = await Promise.all([
			buildApp().request(buildAssetUrl({ objectKey: originalObjectKey })),
			buildApp().request(buildAssetUrl({ objectKey: privateObjectKey })),
		]);

		for (const response of responses) {
			expect(response.status).toBe(403);
			expectNoStore({ response });
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
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
		allowPrivateReferenceMockUser();
		const objectKey = buildPrivateObjectKey({ assetObjectPrefix });
		const signedUrl = "https://storage.example/private.gif?token=signed";
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl },
			error: null,
		});

		const response = await buildApp().request(buildAssetUrl({ objectKey }));

		expect(response.status).toBe(302);
		expectNoStore({ response });
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
		expectNoStore({ response });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids private originals outside the allowlist", async () => {
		// The allow-list check must come before key parsing, so this holds even
		// if the key branches are ever reordered.
		const response = await buildApp().request(
			buildAssetUrl({ objectKey: privateObjectKey })
		);

		expect(response.status).toBe(403);
		expectNoStore({ response });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("checks entitlement before revealing private asset registry validity", async () => {
		const unregisteredObjectKey = buildPrivateObjectKey({
			assetObjectPrefix: "jianying/2026-08-01-batch-4/assets/",
		});

		const responses = await Promise.all([
			buildApp().request(buildAssetUrl({ objectKey: unregisteredObjectKey })),
			buildApp().request(
				buildThumbnailUrl({ objectKey: unregisteredObjectKey })
			),
		]);

		for (const response of responses) {
			expect(response.status).toBe(403);
			expectNoStore({ response });
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("rejects traversal attempts against private asset keys", async () => {
		allowPrivateReferenceMockUser();
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
			expectNoStore({ response });
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("signs private thumbnails without a transform for allow-listed users", async () => {
		allowPrivateReferenceMockUser();
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: "https://storage.example/private.gif" },
			error: null,
		});

		const response = await buildApp().request(
			buildThumbnailUrl({ objectKey: privateObjectKey })
		);

		expect(response.status).toBe(302);
		expectNoStore({ response });
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
		allowPrivateReferenceMockUser();
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
		expectNoStore({ response });
		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(objectKey, 600);
	});

	it("rejects well-formed private keys outside the catalog registry", async () => {
		allowPrivateReferenceMockUser();
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
			expectNoStore({ response });
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("rejects malformed private object keys", async () => {
		allowPrivateReferenceMockUser();
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
			expectNoStore({ response });
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("defaults to the first private manifest for old clients", async () => {
		allowPrivateReferenceMockUser();
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
		expectNoStore({ response });
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
		allowPrivateReferenceMockUser();
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
		expectNoStore({ response });
		await expect(response.text()).resolves.toBe(manifestJson);
		expect(storageMocks.download).toHaveBeenCalledWith(manifestObjectKey);
	});

	it("rejects an oversized private manifest before reading its bytes", async () => {
		allowPrivateReferenceMockUser();
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
		expectNoStore({ response });
		await expect(response.json()).resolves.toEqual({
			error: "Private manifest unavailable",
		});
		expect(arrayBuffer).not.toHaveBeenCalled();
	});

	it("rejects private manifest bytes larger than their declared size", async () => {
		allowPrivateReferenceMockUser();
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
		expectNoStore({ response });
		await expect(response.json()).resolves.toEqual({
			error: "Private manifest unavailable",
		});
		expect(arrayBuffer).toHaveBeenCalledOnce();
	});

	it("allows a private manifest exactly at the byte limit", async () => {
		allowPrivateReferenceMockUser();
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
		expectNoStore({ response });
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
		allowPrivateReferenceMockUser();

		const response = await buildApp().request(
			buildPrivateManifestUrl({ catalogId })
		);

		expect(response.status).toBe(400);
		expectNoStore({ response });
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
		expectNoStore({ response });
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
		expectNoStore({ response });
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
		expectNoStore({ response });
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("returns a sanitized 404 when the private manifest object is missing", async () => {
		allowPrivateReferenceMockUser();
		storageMocks.download.mockResolvedValue({
			data: null,
			error: { message: "SUPABASE_SERVICE_KEY=do-not-leak" },
		});

		const response = await buildApp().request(manifestUrl);
		const responseText = await response.text();

		expect(response.status).toBe(404);
		expectNoStore({ response });
		expect(responseText).toBe('{"error":"Private manifest unavailable"}');
		expect(responseText).not.toContain("do-not-leak");
	});

	it("sanitizes exceptions raised while downloading the private manifest", async () => {
		allowPrivateReferenceMockUser();
		storageMocks.download.mockRejectedValue(
			new Error("service-role secret leaked by upstream")
		);

		const response = await buildApp().request(manifestUrl);
		const responseText = await response.text();

		expect(response.status).toBe(502);
		expectNoStore({ response });
		expect(responseText).toBe('{"error":"Private manifest unavailable"}');
		expect(responseText).not.toContain("service-role");
	});
});
