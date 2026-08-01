import { basename } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createSupabaseStorageFetch,
	publishPrivateStickerCatalog,
} from "../sticker-lab-private-catalog";
import type {
	PreparedPrivateCatalog,
	StorageFetch,
	StorageRequest,
} from "../sticker-lab-private-catalog/types";
import {
	cleanupTemporaryDirectories,
	createStickerCatalogFixture,
	GIF_BYTES,
	prepareStickerCatalogFixture,
} from "./sticker-lab-private-catalog.test-utils";

interface StoredObject {
	bytes: Uint8Array;
}

async function requestBodyBytes({
	body,
}: {
	body: BodyInit | undefined;
}): Promise<Uint8Array> {
	if (!(body instanceof Blob)) throw new Error("Expected Blob request body");
	return new Uint8Array(await body.arrayBuffer());
}

function decodeObjectKey({
	path,
	prefix,
}: {
	path: string;
	prefix: string;
}): string {
	return (path.split("?")[0] ?? path)
		.slice(prefix.length)
		.split("/")
		.map((segment) => decodeURIComponent(segment))
		.join("/");
}

function createStorageHarness({
	initialObjects = new Map<string, StoredObject>(),
}: {
	initialObjects?: Map<string, StoredObject>;
} = {}) {
	const objects = new Map(initialObjects);
	const events: string[] = [];
	const requests: StorageRequest[] = [];
	const storageFetch: StorageFetch = async (request) => {
		requests.push(request);
		const { body, method, path } = request;
		if (path === "/storage/v1/object/list/sticker-lab") {
			events.push("list");
			const payload = JSON.parse(String(body)) as { prefix: string };
			const listed = [...objects.entries()]
				.filter(([key]) => key.startsWith(`${payload.prefix}/`))
				.map(([key, value]) => ({
					name: basename(key),
					metadata: {
						size: value.bytes.byteLength,
					},
				}));
			return Response.json(listed);
		}
		const authenticatedPrefix = "/storage/v1/object/authenticated/sticker-lab/";
		if (method === "GET" && path.startsWith(authenticatedPrefix)) {
			const key = decodeObjectKey({ path, prefix: authenticatedPrefix });
			events.push(
				key.endsWith("manifest.json") ? "manifest-read" : "asset-read"
			);
			const stored = objects.get(key);
			return stored
				? new Response(new Uint8Array(stored.bytes).buffer, { status: 200 })
				: new Response(null, { status: 404 });
		}
		const uploadPrefix = "/storage/v1/object/sticker-lab/";
		if (method === "POST" && path.startsWith(uploadPrefix)) {
			const key = decodeObjectKey({ path, prefix: uploadPrefix });
			const bytes = await requestBodyBytes({ body });
			events.push(
				key.endsWith("manifest.json") ? "manifest-upload" : "asset-upload"
			);
			objects.set(key, { bytes });
			return Response.json({ ok: true });
		}
		return new Response(null, { status: 500 });
	};
	return { events, objects, requests, storageFetch };
}

function replaceManifestBytes({
	prepared,
}: {
	prepared: PreparedPrivateCatalog;
}): void {
	prepared.manifestBytes = new TextEncoder().encode(
		`${JSON.stringify(prepared.manifest, null, 2)}\n`
	);
}

afterEach(cleanupTemporaryDirectories);

describe("private catalog publishing", () => {
	it("rejects programmatically mutated prepared catalogs before storage access", async () => {
		const mutations: Array<{
			mutate: (prepared: PreparedPrivateCatalog) => void;
			name: string;
		}> = [
			{
				name: "manifest object key",
				mutate: (prepared) => {
					prepared.manifestObjectKey = "other-bucket/manifest.json";
				},
			},
			{
				name: "asset object path",
				mutate: (prepared) => {
					const item = prepared.manifest.categories[0]?.items[0];
					const expected = prepared.expectedAssets[0];
					const local = prepared.localAssets[0];
					if (!(item && expected && local))
						throw new Error("Missing fixture item");
					const objectKey = "../other-bucket/7001.gif";
					item.asset.objectKey = objectKey;
					expected.objectKey = objectKey;
					local.objectKey = objectKey;
					replaceManifestBytes({ prepared });
				},
			},
			{
				name: "manifest bytes",
				mutate: (prepared) => {
					prepared.manifestBytes = new TextEncoder().encode("{}\n");
				},
			},
			{
				name: "expected integrity",
				mutate: (prepared) => {
					const asset = prepared.expectedAssets[0];
					if (!asset) throw new Error("Missing fixture asset");
					asset.byteSize += 1;
				},
			},
			{
				name: "missing expected asset",
				mutate: (prepared) => {
					prepared.expectedAssets = [];
				},
			},
			{
				name: "duplicate local asset",
				mutate: (prepared) => {
					const asset = prepared.localAssets[0];
					if (!asset) throw new Error("Missing fixture asset");
					prepared.localAssets.push({ ...asset });
				},
			},
			{
				name: "local MIME",
				mutate: (prepared) => {
					const asset = prepared.localAssets[0];
					if (!asset) throw new Error("Missing fixture asset");
					asset.mimeType = "image/png";
				},
			},
		];

		for (const { mutate, name } of mutations) {
			const fixture = await createStickerCatalogFixture();
			const prepared = await prepareStickerCatalogFixture({ fixture });
			mutate(prepared);
			const storageFetch = vi.fn<StorageFetch>();
			await expect(
				publishPrivateStickerCatalog({ prepared, storageFetch })
			).rejects.toThrow();
			expect(storageFetch, name).not.toHaveBeenCalled();
		}
	});

	it("uploads missing assets with base64 checksum metadata, then the manifest", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const harness = createStorageHarness();
		const result = await publishPrivateStickerCatalog({
			concurrency: 2,
			prepared,
			storageFetch: harness.storageFetch,
		});

		expect(result).toMatchObject({
			uploadedAssetCount: 1,
			verifiedAssetCount: 1,
			manifestSkipped: false,
		});
		expect(harness.events).toEqual([
			"manifest-read",
			"list",
			"asset-upload",
			"list",
			"asset-read",
			"manifest-upload",
			"manifest-read",
		]);
		const assetRequest = harness.requests.find(({ path }) =>
			path.endsWith("7001.gif")
		);
		const encodedMetadata = new Headers(assetRequest?.headers).get(
			"x-metadata"
		);
		expect(
			JSON.parse(Buffer.from(encodedMetadata ?? "", "base64").toString("utf8"))
		).toEqual({ checksumSha256: fixture.checksumSha256 });
		expect(new Headers(assetRequest?.headers).get("x-upsert")).toBe("false");
	});

	it("recognizes Supabase's 400 NoSuchKey response as a missing manifest", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const harness = createStorageHarness();
		const storageFetch: StorageFetch = async (request) => {
			if (
				request.method === "GET" &&
				request.path.includes("/object/authenticated/") &&
				request.path.includes("manifest.json") &&
				!harness.objects.has(prepared.manifestObjectKey)
			) {
				return Response.json(
					{
						code: "NoSuchKey",
						error: "not_found",
						message: "Object not found",
						statusCode: "404",
					},
					{ status: 400 }
				);
			}
			return harness.storageFetch(request);
		};

		await expect(
			publishPrivateStickerCatalog({ prepared, storageFetch })
		).resolves.toMatchObject({
			uploadedAssetCount: 1,
			verifiedAssetCount: 1,
		});
		expect(harness.events.at(-1)).toBe("manifest-read");
	});

	it("does not mistake an arbitrary 400 response for a missing manifest", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const storageFetch = vi.fn<StorageFetch>().mockResolvedValue(
			Response.json(
				{
					code: "InvalidKey",
					error: "bad_request",
					message: "SUPABASE_SERVICE_KEY=must-not-leak",
					statusCode: "400",
				},
				{ status: 400 }
			)
		);

		await expect(
			publishPrivateStickerCatalog({ prepared, storageFetch })
		).rejects.toThrow("manifest read failed (status 400)");
	});

	it("safely resumes when remote asset bytes match", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const asset = prepared.localAssets[0]!;
		const harness = createStorageHarness({
			initialObjects: new Map([
				[asset.objectKey, { bytes: GIF_BYTES }],
				[prepared.manifestObjectKey, { bytes: prepared.manifestBytes }],
			]),
		});
		const result = await publishPrivateStickerCatalog({
			prepared,
			storageFetch: harness.storageFetch,
		});
		expect(result).toMatchObject({
			alreadyPresentAssetCount: 1,
			manifestSkipped: true,
			uploadedAssetCount: 0,
		});
		expect(harness.events).not.toContain("asset-upload");
		expect(harness.events).not.toContain("manifest-upload");
	});

	it("fails closed when existing remote bytes have the wrong checksum", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const asset = prepared.localAssets[0]!;
		const corruptBytes = new Uint8Array(GIF_BYTES);
		corruptBytes[corruptBytes.length - 1] ^= 1;
		const harness = createStorageHarness({
			initialObjects: new Map([[asset.objectKey, { bytes: corruptBytes }]]),
		});
		await expect(
			publishPrivateStickerCatalog({
				prepared,
				storageFetch: harness.storageFetch,
			})
		).rejects.toThrow("Remote sticker SHA-256 mismatch");
		expect(harness.events).not.toContain("manifest-upload");
	});

	it("requires an explicit flag to replace a different remote manifest", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const harness = createStorageHarness({
			initialObjects: new Map([
				[
					prepared.manifestObjectKey,
					{ bytes: new TextEncoder().encode("different") },
				],
			]),
		});
		await expect(
			publishPrivateStickerCatalog({
				prepared,
				storageFetch: harness.storageFetch,
			})
		).rejects.toThrow("--replace-manifest");
		expect(harness.events).toEqual(["manifest-read"]);
	});

	it("cache-busts and verifies an explicitly replaced manifest", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const asset = prepared.localAssets[0]!;
		const harness = createStorageHarness({
			initialObjects: new Map([
				[asset.objectKey, { bytes: GIF_BYTES }],
				[
					prepared.manifestObjectKey,
					{ bytes: new TextEncoder().encode("different") },
				],
			]),
		});

		await expect(
			publishPrivateStickerCatalog({
				prepared,
				replaceManifest: true,
				storageFetch: harness.storageFetch,
			})
		).resolves.toMatchObject({
			manifestReplaced: true,
			manifestSkipped: false,
		});

		const manifestReads = harness.requests.filter(
			({ method, path }) => method === "GET" && path.includes("manifest.json")
		);
		expect(manifestReads).toHaveLength(2);
		expect(manifestReads[0]?.path).not.toBe(manifestReads[1]?.path);
		for (const request of manifestReads) {
			expect(request.path).toContain("?cacheBust=");
			expect(new Headers(request.headers).get("Cache-Control")).toBe(
				"no-store"
			);
		}
		const manifestUpload = harness.requests.find(
			({ method, path }) => method === "POST" && path.endsWith("manifest.json")
		);
		expect(new Headers(manifestUpload?.headers).get("x-upsert")).toBe("true");
		expect(
			Buffer.from(
				harness.objects.get(prepared.manifestObjectKey)?.bytes ??
					new Uint8Array()
			).equals(Buffer.from(prepared.manifestBytes))
		).toBe(true);
	});

	it("does not include an upstream error body in failures", async () => {
		const fixture = await createStickerCatalogFixture();
		const prepared = await prepareStickerCatalogFixture({ fixture });
		const storageFetch = vi
			.fn<StorageFetch>()
			.mockResolvedValue(
				new Response("SUPABASE_SERVICE_KEY=must-not-leak", { status: 502 })
			);
		let message = "";
		try {
			await publishPrivateStickerCatalog({ prepared, storageFetch });
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toContain("status 502");
		expect(message).not.toContain("must-not-leak");
	});

	it("requires HTTPS except for a local Supabase origin", async () => {
		expect(() =>
			createSupabaseStorageFetch({
				serviceKey: "secret",
				supabaseUrl: "http://example.com",
			})
		).toThrow("must use HTTPS");
		expect(() =>
			createSupabaseStorageFetch({
				serviceKey: "secret",
				supabaseUrl: "http://127.0.0.1:54321",
			})
		).not.toThrow();
	});

	it.each([
		"/storage/v1/object/../escape",
		"/storage/v1/object/%2e%2e/escape",
		"/storage/v1/object\\..\\escape",
		"/storage/v1/object/%2Fescape",
		"/storage/v1/object/path#fragment",
		"/storage/v1/object/path?value=hello world",
	])("rejects non-canonical storage path %s", async (path) => {
		const fetchImpl = vi.fn<typeof fetch>();
		const storageFetch = createSupabaseStorageFetch({
			fetchImpl,
			serviceKey: "secret",
			supabaseUrl: "https://example.supabase.co",
		});
		await expect(storageFetch({ method: "GET", path })).rejects.toThrow(
			"Invalid storage request path"
		);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("passes only an unchanged canonical storage URL to fetch", async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(null, { status: 200 }));
		const storageFetch = createSupabaseStorageFetch({
			fetchImpl,
			serviceKey: "secret",
			supabaseUrl: "https://example.supabase.co/",
		});
		const path = "/storage/v1/object/sticker-lab/item?cacheBust=abc-123";
		await storageFetch({ method: "GET", path });
		const requestUrl = fetchImpl.mock.calls[0]?.[0];
		expect(requestUrl).toBeInstanceOf(URL);
		expect(String(requestUrl)).toBe(`https://example.supabase.co${path}`);
	});
});
