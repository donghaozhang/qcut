import type { AssetManifestEntry } from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem, MediaStore } from "@/stores/media/media-store-types";
import {
	registerStickerRuntimePackageResources,
	rollbackStickerRuntimePackageResources,
} from "../sticker-runtime-project-import";
import type { PreparedStickerRuntimePackage } from "../sticker-runtime-package";

const mocks = vi.hoisted(() => ({
	createStickerMediaUrl: vi.fn(async ({ blob }: { blob: Blob }) => ({
		revoke: true,
		url: `blob:${blob.size}`,
	})),
}));

vi.mock("../sticker-resource", () => ({
	createStickerMediaUrl: mocks.createStickerMediaUrl,
}));

const asset = { id: "public-runtime", version: 3 } satisfies Pick<
	AssetManifestEntry,
	"id" | "version"
>;

const restrictionMetadata = {
	referenceOnly: true,
	usage: "internal-reference-only",
	redistribution: "prohibited",
	batchId: "jianying-batch-18",
	itemId: "reference-1",
} as const;

const reusableResourceMetadata = {
	...restrictionMetadata,
	checksumSha256: "a".repeat(64),
	source: "sticker-runtime-resource",
	stickerAssetId: asset.id,
	stickerAssetVersion: asset.version,
	stickerRuntimeResourceName: "asset_0001",
	stickerRuntimeSourceUrl: "/runtime/frame.png",
} as const;

function runtimePackage(): PreparedStickerRuntimePackage {
	return {
		descriptor: {
			completion: "freeze-last",
			cycleDurationSeconds: 0.1,
			frames: [
				{
					durationSeconds: 0.1,
					source: "$resource:asset_0001",
					startSeconds: 0,
				},
			],
			kind: "png-sequence",
			repeat: { kind: "infinite" },
		},
		primaryMediaType: "image",
		resources: [
			{
				checksumSha256: "a".repeat(64),
				file: new File([new Uint8Array([1, 2])], "frame.png", {
					type: "image/png",
				}),
				mediaType: "image",
				resourceName: "asset_0001",
				sourceUrl: "/runtime/frame.png",
			},
		],
	};
}

describe("sticker runtime project import", () => {
	it("registers project-owned resources with durable IDs and metadata", async () => {
		const added: Array<Parameters<MediaStore["addMediaItem"]>[1]> = [];
		const addMediaItem = vi.fn<MediaStore["addMediaItem"]>(
			async (_projectId, item) => {
				added.push(item);
				return item.id ?? "unexpected";
			}
		);
		const removeMediaItem = vi.fn<MediaStore["removeMediaItem"]>();

		const registered = await registerStickerRuntimePackageResources({
			addMediaItem,
			asset,
			existingMediaItems: [],
			projectId: "project-1",
			removeMediaItem,
			runtimePackage: runtimePackage(),
		});

		expect(registered).toEqual({
			createdMediaIds: ["sticker-runtime:public-runtime@3:asset_0001"],
			resourceMediaIds: {
				asset_0001: "sticker-runtime:public-runtime@3:asset_0001",
			},
		});
		expect(added).toEqual([
			expect.objectContaining({
				id: "sticker-runtime:public-runtime@3:asset_0001",
				metadata: {
					checksumSha256: "a".repeat(64),
					source: "sticker-runtime-resource",
					stickerAssetId: "public-runtime",
					stickerAssetVersion: 3,
					stickerRuntimeResourceName: "asset_0001",
					stickerRuntimeSourceUrl: "/runtime/frame.png",
				},
				type: "image",
			}),
		]);
		expect(removeMediaItem).not.toHaveBeenCalled();
	});

	it("copies restricted Sticker Lab policy onto every package resource", async () => {
		const addMediaItem = vi.fn<MediaStore["addMediaItem"]>(
			async (_projectId, item) => item.id ?? "unexpected"
		);

		await registerStickerRuntimePackageResources({
			addMediaItem,
			asset,
			existingMediaItems: [],
			metadata: restrictionMetadata,
			projectId: "project-1",
			removeMediaItem: vi.fn<MediaStore["removeMediaItem"]>(),
			runtimePackage: runtimePackage(),
		});

		expect(addMediaItem).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({
				metadata: expect.objectContaining({
					source: "sticker-runtime-resource",
					referenceOnly: true,
					usage: "internal-reference-only",
					redistribution: "prohibited",
					batchId: "jianying-batch-18",
					itemId: "reference-1",
				}),
			})
		);
	});

	it("reuses a matching resource and does not claim it for rollback", async () => {
		const existing = {
			file: new File([new Uint8Array([1])], "frame.png", {
				type: "image/png",
			}),
			id: "sticker-runtime:public-runtime@3:asset_0001",
			metadata: reusableResourceMetadata,
			name: "frame.png",
			type: "image",
		} satisfies MediaItem;
		const addMediaItem = vi.fn<MediaStore["addMediaItem"]>();

		const registered = await registerStickerRuntimePackageResources({
			addMediaItem,
			asset,
			existingMediaItems: [existing],
			metadata: restrictionMetadata,
			projectId: "project-1",
			removeMediaItem: vi.fn<MediaStore["removeMediaItem"]>(),
			runtimePackage: runtimePackage(),
		});

		expect(registered).toEqual({
			createdMediaIds: [],
			resourceMediaIds: { asset_0001: existing.id },
		});
		expect(addMediaItem).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: "a missing prohibited redistribution policy",
			mismatchedField: "redistribution",
			metadata: {
				referenceOnly: true,
				usage: "internal-reference-only",
				batchId: "jianying-batch-18",
				itemId: "reference-1",
				source: "sticker-runtime-resource",
				stickerAssetId: asset.id,
				stickerAssetVersion: asset.version,
				stickerRuntimeResourceName: "asset_0001",
				stickerRuntimeSourceUrl: "/runtime/frame.png",
			},
		},
		{
			name: "the wrong asset ID",
			mismatchedField: "stickerAssetId",
			metadata: {
				...reusableResourceMetadata,
				stickerAssetId: "different-runtime",
			},
		},
		{
			name: "the wrong asset version",
			mismatchedField: "stickerAssetVersion",
			metadata: {
				...reusableResourceMetadata,
				stickerAssetVersion: 2,
			},
		},
		{
			name: "the wrong runtime checksum",
			mismatchedField: "checksumSha256",
			metadata: {
				...reusableResourceMetadata,
				checksumSha256: "b".repeat(64),
			},
		},
		{
			name: "the wrong runtime source URL",
			mismatchedField: "stickerRuntimeSourceUrl",
			metadata: {
				...reusableResourceMetadata,
				stickerRuntimeSourceUrl: "/runtime/other-frame.png",
			},
		},
	])("rejects a reusable resource with $name", async ({
		metadata,
		mismatchedField,
	}) => {
		const existing = {
			file: new File([new Uint8Array([1])], "frame.png", {
				type: "image/png",
			}),
			id: "sticker-runtime:public-runtime@3:asset_0001",
			metadata,
			name: "frame.png",
			type: "image",
		} satisfies MediaItem;

		await expect(
			registerStickerRuntimePackageResources({
				addMediaItem: vi.fn<MediaStore["addMediaItem"]>(),
				asset,
				existingMediaItems: [existing],
				metadata: restrictionMetadata,
				projectId: "project-1",
				removeMediaItem: vi.fn<MediaStore["removeMediaItem"]>(),
				runtimePackage: runtimePackage(),
			})
		).rejects.toThrow(mismatchedField);
	});

	it("removes every attempted deterministic ID when persistence fails", async () => {
		const removeMediaItem = vi.fn<MediaStore["removeMediaItem"]>();
		const addMediaItem = vi.fn<MediaStore["addMediaItem"]>(async () => {
			throw new Error("storage failed");
		});

		await expect(
			registerStickerRuntimePackageResources({
				addMediaItem,
				asset,
				existingMediaItems: [],
				projectId: "project-1",
				removeMediaItem,
				runtimePackage: runtimePackage(),
			})
		).rejects.toThrow("storage failed");
		expect(removeMediaItem).toHaveBeenCalledWith(
			"project-1",
			"sticker-runtime:public-runtime@3:asset_0001"
		);
	});

	it("waits for concurrent writes before rolling back every attempted resource", async () => {
		const packageWithTwoResources = runtimePackage();
		packageWithTwoResources.resources.push({
			checksumSha256: "b".repeat(64),
			file: new File([new Uint8Array([3, 4])], "frame-2.png", {
				type: "image/png",
			}),
			mediaType: "image",
			resourceName: "asset_0002",
			sourceUrl: "/runtime/frame-2.png",
		});
		const removeMediaItem = vi.fn<MediaStore["removeMediaItem"]>();
		const addMediaItem = vi.fn<MediaStore["addMediaItem"]>(
			async (_projectId, item) => {
				if (item.id?.endsWith("asset_0001")) {
					throw new Error("first resource failed");
				}
				await Promise.resolve();
				return item.id ?? "unexpected";
			}
		);

		await expect(
			registerStickerRuntimePackageResources({
				addMediaItem,
				asset,
				existingMediaItems: [],
				projectId: "project-1",
				removeMediaItem,
				runtimePackage: packageWithTwoResources,
			})
		).rejects.toThrow("first resource failed");
		expect(removeMediaItem).toHaveBeenCalledTimes(2);
		expect(removeMediaItem).toHaveBeenCalledWith(
			"project-1",
			"sticker-runtime:public-runtime@3:asset_0002"
		);
	});

	it("rolls back only resource IDs created by the current placement", async () => {
		const removeMediaItem = vi.fn<MediaStore["removeMediaItem"]>();

		await rollbackStickerRuntimePackageResources({
			mediaIds: ["resource-a", "resource-b"],
			projectId: "project-1",
			removeMediaItem,
		});

		expect(removeMediaItem).toHaveBeenCalledTimes(2);
		expect(removeMediaItem).toHaveBeenCalledWith("project-1", "resource-a");
		expect(removeMediaItem).toHaveBeenCalledWith("project-1", "resource-b");
	});
});
