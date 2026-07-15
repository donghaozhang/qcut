import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	createInitialAssetRuntimeState,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import {
	downloadTransitionResource,
	getTransitionResourceState,
	TRANSITION_CACHE_NAME,
} from "../transition-resource";

function remoteTransitionAsset(): AssetManifestEntry {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: "remote-ripple",
		kind: "transition",
		version: 2,
		name: "Remote Ripple",
		category: "distortion",
		tags: ["ripple"],
		delivery: "remote",
		files: [
			{ role: "thumbnail", url: "/preview/from.webp" },
			{ role: "preview", url: "/preview/to.webp" },
		],
		license: {
			name: "QCut built-in asset license",
			commercialUse: "allowed",
			attributionRequired: false,
		},
	};
}

describe("transition resource state", () => {
	it("distinguishes download, offline, busy, cached, update, and failure", () => {
		const asset = remoteTransitionAsset();
		const initial = createInitialAssetRuntimeState({ asset });
		expect(
			getTransitionResourceState({ asset, runtime: initial, online: true })
		).toEqual({ available: false, progress: 0, status: "download" });
		expect(
			getTransitionResourceState({ asset, runtime: initial, online: false })
		).toEqual({ available: false, progress: 0, status: "offline" });
		expect(
			getTransitionResourceState({
				asset,
				runtime: {
					...initial,
					downloadStatus: "downloading",
					cacheStatus: "caching",
					progress: 0.4,
				},
				online: true,
			})
		).toEqual({ available: false, progress: 0.4, status: "downloading" });
		expect(
			getTransitionResourceState({
				asset,
				runtime: {
					...initial,
					downloadStatus: "downloaded",
					cacheStatus: "cached",
					progress: 1,
				},
				online: false,
			})
		).toEqual({ available: true, progress: 1, status: "ready" });
		expect(
			getTransitionResourceState({
				asset,
				runtime: { ...initial, cacheStatus: "stale" },
				online: true,
			})
		).toEqual({ available: true, progress: 1, status: "update" });
		expect(
			getTransitionResourceState({
				asset,
				runtime: { ...initial, downloadStatus: "failed" },
				online: true,
			})
		).toEqual({ available: false, progress: 0, status: "failed" });
	});
});

describe("downloadTransitionResource", () => {
	it("fetches and caches every preview file with aggregate progress", async () => {
		const asset = remoteTransitionAsset();
		const put = vi.fn(async () => undefined);
		const open = vi.fn(async () => ({ put }) as unknown as Cache);
		const fetchResource = vi.fn(async () => new Response("preview"));
		const progress: number[] = [];

		const result = await downloadTransitionResource({
			asset,
			fetchResource: fetchResource as typeof fetch,
			cacheStorage: { open } as unknown as CacheStorage,
			onProgress: ({ progress: value }) => progress.push(value),
		});

		expect(open).toHaveBeenCalledWith(TRANSITION_CACHE_NAME);
		expect(fetchResource).toHaveBeenCalledTimes(2);
		expect(put).toHaveBeenCalledTimes(2);
		expect(progress.sort()).toEqual([0.5, 1]);
		expect(result.cacheKey).toBe("transition:remote-ripple@2");
	});

	it("rejects an HTTP failure without reporting completion", async () => {
		const asset = remoteTransitionAsset();
		const fetchResource = vi.fn(async () =>
			Promise.resolve(new Response("missing", { status: 404 }))
		);

		await expect(
			downloadTransitionResource({
				asset,
				fetchResource: fetchResource as typeof fetch,
				cacheStorage: undefined,
			})
		).rejects.toThrow("HTTP 404");
	});
});
