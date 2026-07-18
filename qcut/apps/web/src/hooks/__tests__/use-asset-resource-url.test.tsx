import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAssetResources } from "@/lib/assets/asset-resource-cache";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useAssetResourceUrl } from "../use-asset-resource-url";

vi.mock("@/lib/assets/asset-resource-cache", () => ({
	ensureAssetResources: vi.fn(),
}));

const LICENSE = {
	name: "QCut",
	commercialUse: "allowed",
	attributionRequired: false,
} as const;

function asset({ delivery }: { delivery: "bundled" | "remote" }) {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: `${delivery}:overlay`,
		kind: "sticker",
		version: 1,
		name: "Overlay",
		category: "motion",
		tags: ["overlay"],
		delivery,
		files: [
			{
				role: "source",
				url: `https://assets.example.test/${delivery}.svg`,
				mimeType: "image/svg+xml",
			},
		],
		license: LICENSE,
	} as const satisfies AssetManifestEntry;
}

describe("useAssetResourceUrl", () => {
	beforeEach(() => {
		useAssetLibraryStore.getState().resetLibrary();
		vi.mocked(ensureAssetResources).mockReset();
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:qcut-overlay");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
	});

	it("uses bundled files directly without touching the cache", () => {
		const bundled = asset({ delivery: "bundled" });
		const { result } = renderHook(() =>
			useAssetResourceUrl({ asset: bundled, role: "source" })
		);

		expect(result.current).toBe(bundled.files[0].url);
		expect(ensureAssetResources).not.toHaveBeenCalled();
	});

	it("does not bypass the cache for an uncached remote file", () => {
		const remote = asset({ delivery: "remote" });
		const { result } = renderHook(() =>
			useAssetResourceUrl({ asset: remote, role: "source" })
		);

		expect(result.current).toBeUndefined();
		expect(ensureAssetResources).not.toHaveBeenCalled();
	});

	it("creates and revokes a blob URL after a remote file is cached", async () => {
		const remote = asset({ delivery: "remote" });
		vi.mocked(ensureAssetResources).mockResolvedValue([
			{
				blob: new Blob(["overlay"], { type: "image/svg+xml" }),
				byteSize: 7,
				cacheKey: "sticker:remote:overlay@1:source:0",
				fromCache: true,
				mimeType: "image/svg+xml",
				role: "source",
				sourceUrl: remote.files[0].url,
				url: remote.files[0].url,
			},
		]);
		const { result, unmount } = renderHook(() =>
			useAssetResourceUrl({ asset: remote, role: "source" })
		);

		act(() => {
			useAssetLibraryStore.getState().updateRuntimeState({
				asset: remote,
				patch: {
					downloadStatus: "downloaded",
					cacheStatus: "cached",
					progress: 1,
				},
			});
		});
		await waitFor(() => expect(result.current).toBe("blob:qcut-overlay"));
		expect(ensureAssetResources).toHaveBeenCalledWith({
			asset: remote,
			roles: ["source"],
		});

		unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qcut-overlay");
	});
});
