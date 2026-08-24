// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readJianyingTextStyleCoverImage } from "../jianying-text-style-cover-cache.js";

const PNG_BYTES = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
	"base64"
);
const temporaryRoots: string[] = [];

async function createCacheRoot() {
	const root = await mkdtemp(join(tmpdir(), "qcut-text-cover-cache-"));
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

describe("Jianying text style cover cache", () => {
	it("keeps a cover across signed URL changes", async () => {
		const cacheRoot = await createCacheRoot();
		const fetcher = vi.fn(
			async () =>
				new Response(PNG_BYTES, {
					status: 200,
					headers: { "content-type": "image/png" },
				})
		) as unknown as typeof fetch;
		const styleId = `7212166583127379258/${"a".repeat(32)}`;

		const first = await readJianyingTextStyleCoverImage({
			cacheRoot,
			fetcher,
			sourceUrl: "https://p3-heycan-jy-sign.byteimg.com/cover.png?token=old",
			styleId,
		});
		const second = await readJianyingTextStyleCoverImage({
			cacheRoot,
			fetcher,
			sourceUrl: "https://p3-heycan-jy-sign.byteimg.com/cover.png?token=new",
			styleId,
		});

		expect(first).toMatchObject({ mimeType: "image/png", fromCache: false });
		expect(second).toMatchObject({ mimeType: "image/png", fromCache: true });
		expect(fetcher).toHaveBeenCalledOnce();
		expect(await readdir(cacheRoot)).toHaveLength(1);
	});

	it("rejects an untrusted cover host", async () => {
		const fetcher = vi.fn() as unknown as typeof fetch;
		await expect(
			readJianyingTextStyleCoverImage({
				cacheRoot: await createCacheRoot(),
				fetcher,
				sourceUrl: "https://example.com/cover.png",
				styleId: `7212166583127379258/${"a".repeat(32)}`,
			})
		).rejects.toThrow("不受信任");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("caches a local fallback when the remote cover fails", async () => {
		const cacheRoot = await createCacheRoot();
		const fetcher = vi.fn(async () => {
			throw new Error("network unavailable");
		}) as unknown as typeof fetch;
		const produceFallback = vi.fn(async () => PNG_BYTES);
		const request = {
			cacheRoot,
			fetcher,
			produceFallback,
			sourceUrl: "https://p3-heycan-jy-sign.byteimg.com/cover.png",
			styleId: `7212166583127379258/${"b".repeat(32)}`,
		};

		const first = await readJianyingTextStyleCoverImage(request);
		const second = await readJianyingTextStyleCoverImage(request);

		expect(first).toMatchObject({ mimeType: "image/png", fromCache: false });
		expect(second).toMatchObject({ mimeType: "image/png", fromCache: true });
		expect(fetcher).toHaveBeenCalledOnce();
		expect(produceFallback).toHaveBeenCalledOnce();
	});
});
