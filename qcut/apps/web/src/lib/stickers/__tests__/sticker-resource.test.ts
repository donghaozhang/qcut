import { describe, expect, it, vi } from "vitest";
import type {
	AssetResourceCacheStorage,
	CachedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import {
	createCachedStickerPreviewUrl,
	createStickerMediaUrl,
	downloadStickerResource,
} from "../sticker-resource";

class MemoryAssetCache implements AssetResourceCacheStorage {
	readonly resources = new Map<string, CachedAssetResource>();

	async get({ cacheKey }: { cacheKey: string }) {
		return this.resources.get(cacheKey) ?? null;
	}

	async put({ resource }: { resource: CachedAssetResource }) {
		this.resources.set(resource.cacheKey, resource);
	}

	async remove({ cacheKey }: { cacheKey: string }) {
		this.resources.delete(cacheKey);
	}

	async list() {
		return [...this.resources.values()];
	}
}

describe("sticker resources", () => {
	it("loads bundled QCut originals without a remote cache dependency", async () => {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" />';
		const fetchImpl = vi.fn(
			async () =>
				new Response(svg, {
					status: 200,
					headers: { "content-type": "image/svg+xml" },
				})
		) as unknown as typeof fetch;
		const downloaded = await downloadStickerResource({
			collection: "qcut-original",
			fetchImpl,
			icon: "pink-rabbit-happy",
			name: "粉红兔子/开心",
		});

		expect(fetchImpl).toHaveBeenCalledWith(
			"/stickers/qcut-original/pink-rabbit/happy.svg"
		);
		expect(downloaded.asset.delivery).toBe("bundled");
		expect(downloaded.file.name).toBe("粉红兔子-开心.svg");
		expect(downloaded.file.type).toContain("image/svg+xml");
		expect(downloaded.blob.size).toBeGreaterThan(0);
	});

	it("repairs generic MIME types using the sticker manifest", async () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" />';
		const fetchImpl = vi.fn(
			async () =>
				new Response(svg, {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				})
		) as unknown as typeof fetch;

		const downloaded = await downloadStickerResource({
			collection: "qcut-original",
			fetchImpl,
			icon: "pink-rabbit-happy",
			name: "Happy",
		});

		expect(downloaded.blob.type).toBe("image/svg+xml");
		expect(downloaded.file.type).toBe("image/svg+xml");
	});

	it("uses a correctly typed data URL for SVG media", async () => {
		const createObjectUrl = vi.spyOn(URL, "createObjectURL");
		const mediaUrl = await createStickerMediaUrl({
			blob: new Blob(['<svg xmlns="http://www.w3.org/2000/svg" />'], {
				type: "image/svg+xml",
			}),
		});

		expect(mediaUrl.revoke).toBe(false);
		expect(mediaUrl.url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
		expect(createObjectUrl).not.toHaveBeenCalled();
		createObjectUrl.mockRestore();
	});

	it("creates preview URLs from cached remote sticker sources", async () => {
		const createObjectUrl = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:cached-sticker");
		const storage = new MemoryAssetCache();
		const sourceUrl =
			"https://api.iconify.design/line-md:loading-twotone-loop.svg";
		const blob = new Blob(["<svg />"], { type: "image/svg+xml" });
		storage.resources.set("sticker:line-md:loading-twotone-loop@1:source:1", {
			assetIdentity: "sticker:line-md:loading-twotone-loop",
			assetKey: "sticker:line-md:loading-twotone-loop@1",
			blob,
			byteSize: blob.size,
			cacheKey: "sticker:line-md:loading-twotone-loop@1:source:1",
			cachedAt: 1,
			checksumSha256: "",
			fileIndex: 1,
			lastAccessedAt: 1,
			mimeType: "image/svg+xml",
			role: "source",
			sourceUrl,
			version: 1,
		});

		const preview = await createCachedStickerPreviewUrl({
			collection: "line-md",
			icon: "loading-twotone-loop",
			storage,
		});

		expect(preview).toEqual({ revoke: true, url: "blob:cached-sticker" });
		expect(createObjectUrl).toHaveBeenCalledWith(blob);
		createObjectUrl.mockRestore();
	});
});
