import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateImageThumbnailDataUrl } from "@/lib/media/image-utils";
import type { MediaItem } from "@/stores/media/media-store";
import { storageService } from "../storage-service";

vi.mock("@/lib/media/image-utils", () => ({
	generateImageThumbnailDataUrl: vi.fn(
		async () => "data:image/png;base64,THUMB"
	),
}));

const PROJECT_ID = "project-1";

function createAdapterStub() {
	const metadataStore = new Map<string, { thumbnailUrl?: string }>();
	const fileStore = new Map<string, File>();
	return {
		metadataStore,
		adapters: {
			mediaMetadataAdapter: {
				get: vi.fn(async (id: string) => metadataStore.get(id) ?? null),
				set: vi.fn(async (id: string, value: { thumbnailUrl?: string }) => {
					metadataStore.set(id, value);
				}),
				list: vi.fn(async () => [...metadataStore.keys()]),
				remove: vi.fn(async (id: string) => {
					metadataStore.delete(id);
				}),
			},
			mediaFilesAdapter: {
				get: vi.fn(async (id: string) => fileStore.get(id) ?? null),
				set: vi.fn(async (id: string, file: File) => {
					fileStore.set(id, file);
				}),
				remove: vi.fn(async (id: string) => {
					fileStore.delete(id);
				}),
			},
		},
	};
}

function imageMediaItem(): MediaItem {
	return {
		id: "sticker-1",
		name: "sticker.png",
		type: "image",
		file: new File(["png-bytes"], "sticker.png", { type: "image/png" }),
		url: "blob:renderer/sticker",
		thumbnailUrl: "blob:renderer/sticker",
		width: 512,
		height: 512,
		duration: 0,
		metadata: { source: "sticker-library" },
	} as unknown as MediaItem;
}

describe("storage service durable image thumbnails", () => {
	let stub: ReturnType<typeof createAdapterStub>;

	beforeEach(() => {
		vi.clearAllMocks();
		stub = createAdapterStub();
		const serviceInternals = storageService as unknown as {
			getProjectMediaAdapters: (projectId: string) => typeof stub.adapters;
		};
		vi.spyOn(serviceInternals, "getProjectMediaAdapters").mockReturnValue(
			stub.adapters
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("persists a generated data-URL thumbnail for blob-backed images", async () => {
		const item = imageMediaItem();

		await storageService.saveMediaItem(PROJECT_ID, item);

		expect(generateImageThumbnailDataUrl).toHaveBeenCalledWith({
			file: item.file,
		});
		expect(stub.metadataStore.get("sticker-1")).toMatchObject({
			url: undefined,
			thumbnailUrl: "data:image/png;base64,THUMB",
		});

		await expect(
			storageService.findProjectThumbnail(PROJECT_ID, null)
		).resolves.toBe("data:image/png;base64,THUMB");
	});

	it("does not generate a thumbnail when a durable URL already exists", async () => {
		const item = {
			...imageMediaItem(),
			url: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
			thumbnailUrl: undefined,
		} as MediaItem;

		await storageService.saveMediaItem(PROJECT_ID, item);

		expect(generateImageThumbnailDataUrl).not.toHaveBeenCalled();
		await expect(
			storageService.findProjectThumbnail(PROJECT_ID, null)
		).resolves.toBe("data:image/svg+xml,%3Csvg%3E%3C/svg%3E");
	});

	it("does not generate thumbnails for non-image media", async () => {
		const item = {
			...imageMediaItem(),
			id: "clip-1",
			name: "clip.mp4",
			type: "video",
			file: new File(["video-bytes"], "clip.mp4", { type: "video/mp4" }),
		} as unknown as MediaItem;

		await storageService.saveMediaItem(PROJECT_ID, item);

		expect(generateImageThumbnailDataUrl).not.toHaveBeenCalled();
		expect(stub.metadataStore.get("clip-1")).toMatchObject({
			thumbnailUrl: undefined,
		});
	});
});
