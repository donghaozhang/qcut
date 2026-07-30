import { describe, expect, it, vi } from "vitest";
import {
	createLocalStickerReference,
	createRemoteStickerReference,
} from "./fixtures/local-sticker-catalog";
import {
	buildStickerLabAssetEntry,
	createStickerLabAssetFetch,
	loadLocalStickerReferenceFile,
	loadRemoteStickerReferenceFile,
	loadStickerLabReferenceFile,
} from "../local-sticker-reference";

describe("local sticker reference files", () => {
	it("loads an owned image file through the injected desktop reader", async () => {
		const reference = createLocalStickerReference({ id: "curved-arrow" });
		const bytes = new Uint8Array([137, 80, 78, 71]);
		const readFile = vi.fn(async () => bytes);

		const file = await loadLocalStickerReferenceFile({
			reference,
			readFile,
		});

		expect(readFile).toHaveBeenCalledWith({ filePath: reference.filePath });
		expect(file.name).toBe("curved-arrow.png");
		expect(file.type).toBe("image/png");
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
			137, 80, 78, 71,
		]);
		bytes.fill(0);
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
			137, 80, 78, 71,
		]);
	});

	it("rejects a missing local file", async () => {
		const reference = createLocalStickerReference({ id: "missing" });

		await expect(
			loadLocalStickerReferenceFile({
				reference,
				readFile: async () => null,
			})
		).rejects.toThrow("Unable to read local sticker");
	});

	it("maps a remote reference to a stable checksummed asset entry", () => {
		const reference = createRemoteStickerReference({ id: "curved-arrow" });

		expect(
			buildStickerLabAssetEntry({
				reference,
				licenseServerUrl: "https://license.example/",
			})
		).toMatchObject({
			id: `sticker-lab:${reference.asset.objectKey}`,
			kind: "sticker",
			delivery: "remote",
			files: [
				{
					role: "source",
					url: "https://license.example/api/sticker-lab/assets?objectKey=jianying%2F2026-07-31%2Fassets%2Fcurved-arrow.gif",
					mimeType: "image/gif",
					byteSize: reference.asset.byteSize,
					checksumSha256: reference.asset.checksumSha256,
				},
			],
		});
	});

	it("adds a bearer token only for the configured license-server origin", async () => {
		const fetchImpl = vi.fn<typeof fetch>(
			async (_input, _init) => new Response("ok")
		);
		const getToken = vi.fn(async () => "session-token");
		const authenticatedFetch = createStickerLabAssetFetch({
			fetchImpl: fetchImpl as typeof fetch,
			getToken,
			licenseServerUrl: "https://license.example",
		});

		await authenticatedFetch("https://assets.example/reference.gif", {
			headers: { "X-Test": "public" },
		});
		await authenticatedFetch(
			"https://license.example/api/sticker-lab/assets?objectKey=asset",
			{ headers: { "X-Test": "private" } }
		);

		expect(getToken).toHaveBeenCalledTimes(1);
		const publicInit = fetchImpl.mock.calls[0]?.[1];
		expect(new Headers(publicInit?.headers).get("Authorization")).toBeNull();
		const privateInit = fetchImpl.mock.calls[1]?.[1];
		expect(new Headers(privateInit?.headers).get("Authorization")).toBe(
			"Bearer session-token"
		);
		expect(new Headers(privateInit?.headers).get("X-Test")).toBe("private");
	});

	it("fails clearly before requesting a protected asset when signed out", async () => {
		const fetchImpl = vi.fn<typeof fetch>(
			async (_input, _init) => new Response("unexpected")
		);
		const authenticatedFetch = createStickerLabAssetFetch({
			fetchImpl: fetchImpl as typeof fetch,
			getToken: async () => "",
			licenseServerUrl: "https://license.example",
		});

		await expect(
			authenticatedFetch(
				"https://license.example/api/sticker-lab/assets?objectKey=asset"
			)
		).rejects.toThrow("Sign in to QCut");
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("turns a cached remote resource into the exact File for the timeline", async () => {
		const reference = createRemoteStickerReference({ id: "curved-arrow" });
		const cachedBlob = new Blob([new Uint8Array([1, 2, 3, 4])], {
			type: "image/gif",
		});
		const ensureResources = vi.fn(async () => [
			{
				blob: cachedBlob,
				byteSize: 4,
				cacheKey: "sticker:cached",
				checksumSha256: reference.asset.checksumSha256,
				fromCache: true,
				mimeType: "image/gif",
				role: "source" as const,
				sourceUrl: "https://license.example/api/sticker-lab/assets",
				url: "https://license.example/api/sticker-lab/assets",
			},
		]);

		const file = await loadRemoteStickerReferenceFile({
			reference,
			ensureResources,
			getToken: async () => "unused-on-cache-hit",
			licenseServerUrl: "https://license.example",
		});

		expect(file.name).toBe("curved-arrow.gif");
		expect(file.type).toBe("image/gif");
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3, 4]);
		expect(ensureResources).toHaveBeenCalledWith(
			expect.objectContaining({
				asset: expect.objectContaining({
					delivery: "remote",
					files: [
						expect.objectContaining({
							byteSize: 4,
							checksumSha256: reference.asset.checksumSha256,
						}),
					],
				}),
				fetchImpl: expect.any(Function),
				roles: ["source"],
			})
		);
	});

	it("dispatches local and remote references to their matching loader", async () => {
		const local = createLocalStickerReference({ id: "local-arrow" });
		const localFile = await loadStickerLabReferenceFile({
			reference: local,
			readFile: async () => new Uint8Array([1, 2]),
		});
		expect(localFile.name).toBe("local-arrow.png");

		const remote = createRemoteStickerReference({ id: "remote-arrow" });
		const remoteFile = await loadStickerLabReferenceFile({
			reference: remote,
			ensureResources: async () => [
				{
					blob: new Blob([new Uint8Array([1, 2, 3, 4])]),
					byteSize: 4,
					cacheKey: "remote",
					checksumSha256: remote.asset.checksumSha256,
					fromCache: true,
					role: "source",
					sourceUrl: "https://license.example/asset",
					url: "https://license.example/asset",
				},
			],
		});
		expect(remoteFile.name).toBe("remote-arrow.gif");
	});
});
