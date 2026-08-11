// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readJianyingFilterThumbnail } from "../jianying-filter-thumbnail-cache.js";

const PNG_BYTES = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
	"base64"
);

const temporaryRoots: string[] = [];

async function createCacheRoot() {
	const root = await mkdtemp(join(tmpdir(), "qcut-filter-thumbnail-"));
	temporaryRoots.push(root);
	return root;
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("Jianying filter thumbnail cache", () => {
	it("downloads a trusted thumbnail once and reuses the local cache", async () => {
		const cacheRoot = await createCacheRoot();
		const fetcher = vi.fn(
			async () =>
				new Response(PNG_BYTES, {
					status: 200,
					headers: {
						"content-length": String(PNG_BYTES.length),
						"content-type": "image/png",
					},
				})
		) as unknown as typeof fetch;
		const source = {
			resourceId: "filter-1",
			version: "version-1",
			sourceUrl: "https://p3-heycan-jy-sign.byteimg.com/filter.png",
		};

		const first = await readJianyingFilterThumbnail({
			source,
			cacheRoot,
			fetcher,
		});
		const second = await readJianyingFilterThumbnail({
			source,
			cacheRoot,
			fetcher,
		});

		expect(first).toMatchObject({ mimeType: "image/png", fromCache: false });
		expect(second).toMatchObject({ mimeType: "image/png", fromCache: true });
		expect(fetcher).toHaveBeenCalledOnce();
		expect(await readdir(cacheRoot)).toHaveLength(1);
	});

	it("rejects hosts outside Jianying's thumbnail CDN", async () => {
		const fetcher = vi.fn() as unknown as typeof fetch;

		await expect(
			readJianyingFilterThumbnail({
				source: {
					resourceId: "filter-1",
					sourceUrl: "https://example.com/filter.png",
				},
				cacheRoot: await createCacheRoot(),
				fetcher,
			})
		).rejects.toThrow("不受信任");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("rejects bytes that are not a supported image", async () => {
		const fetcher = vi.fn(
			async () => new Response("not an image")
		) as unknown as typeof fetch;

		await expect(
			readJianyingFilterThumbnail({
				source: {
					resourceId: "filter-1",
					sourceUrl: "https://p3-heycan-jy-sign.byteimg.com/filter.bin",
				},
				cacheRoot: await createCacheRoot(),
				fetcher,
			})
		).rejects.toThrow("格式不受支持");
	});
});
