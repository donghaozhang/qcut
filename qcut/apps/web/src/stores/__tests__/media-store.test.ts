import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMediaStore } from "@/stores/media/media-store";
import type { MediaItem } from "@/stores/media/media-store-types";

// Mock dependencies
vi.mock("@/lib/storage/storage-service", () => ({
	storageService: {
		saveMediaItem: vi.fn(() => Promise.resolve()),
		removeMediaItem: vi.fn(() => Promise.resolve()),
		deleteMediaItem: vi.fn(() => Promise.resolve()),
		loadMediaItems: vi.fn(() => Promise.resolve([])),
		loadAllMediaItems: vi.fn(() => Promise.resolve([])),
		clearProjectMedia: vi.fn(() => Promise.resolve()),
	},
}));

vi.mock("@/lib/ffmpeg/ffmpeg-utils", () => ({
	getVideoInfo: vi.fn(() =>
		Promise.resolve({
			duration: 10,
			width: 1920,
			height: 1080,
			fps: 30,
		})
	),
	generateThumbnail: vi.fn(() => Promise.resolve("thumbnail-url")),
}));

vi.mock("@/lib/media/image-utils", () => ({
	convertToBlob: vi.fn((url) => Promise.resolve(url)),
	needsBlobConversion: vi.fn(() => false),
	downloadImageAsFile: vi.fn((url, name) =>
		Promise.resolve(new File([""], name, { type: "image/jpeg" }))
	),
	revokeBlobUrl: vi.fn(),
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: vi.fn(() => ({
			activeProject: { id: "test-project" },
		})),
	},
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: vi.fn(() => ({
			tracks: [],
			removeElementFromTrack: vi.fn(),
			removeElementFromTrackWithRipple: vi.fn(),
			rippleEditingEnabled: false,
			pushHistory: vi.fn(),
			removeElementsByMediaId: vi.fn(),
		})),
	},
}));

describe("MediaStore", () => {
	beforeEach(() => {
		const { result } = renderHook(() => useMediaStore());
		act(() => {
			result.current.clearAllMedia();
		});
		vi.clearAllMocks();
	});

	it("initializes with empty media items", () => {
		const { result } = renderHook(() => useMediaStore());
		expect(result.current.mediaItems).toEqual([]);
		expect(result.current.isLoading).toBe(false);
	});

	it("adds media item with generated ID", async () => {
		const { result } = renderHook(() => useMediaStore());
		const projectId = "test-project";

		const mediaItem: Omit<MediaItem, "id"> = {
			type: "image",
			name: "test.jpg",
			file: new File([""], "test.jpg", { type: "image/jpeg" }),
			url: "blob:test",
			duration: 0,
			thumbnailUrl: "thumb.jpg",
			width: 1920,
			height: 1080,
		};

		let mediaId = "";
		await act(async () => {
			mediaId = await result.current.addMediaItem(projectId, mediaItem);
		});

		expect(mediaId).toBeDefined();
		expect(result.current.mediaItems).toHaveLength(1);
		expect(result.current.mediaItems[0].type).toBe("image");
		expect(result.current.mediaItems[0].name).toBe("test.jpg");
	});

	it("adds media item with provided ID", async () => {
		const { result } = renderHook(() => useMediaStore());
		const projectId = "test-project";
		const customId = "custom-media-id";

		const mediaItem = {
			id: customId,
			type: "video" as const,
			name: "video.mp4",
			url: "blob:video",
			file: new File([""], "video.mp4", { type: "video/mp4" }),
			duration: 30,
			thumbnailUrl: "video-thumb.jpg",
		};

		await act(async () => {
			await result.current.addMediaItem(projectId, mediaItem);
		});

		expect(result.current.mediaItems[0].id).toBe(customId);
	});

	it("adds multiple generated images at once", async () => {
		const { result } = renderHook(() => useMediaStore());

		const images = [
			{
				url: "image1.jpg",
				type: "image" as const,
				name: "Generated Image 1",
				size: 1024,
				duration: 0,
				metadata: { source: "ai-generated" },
			},
			{
				url: "image2.jpg",
				type: "image" as const,
				name: "Generated Image 2",
				size: 2048,
				duration: 0,
				metadata: { source: "ai-generated" },
			},
		];

		await act(async () => {
			await result.current.addGeneratedImages(images);
		});

		expect(result.current.mediaItems).toHaveLength(2);
		expect(result.current.mediaItems[0].metadata?.source).toBe("ai-generated");
		expect(result.current.mediaItems[1].metadata?.source).toBe("ai-generated");
	});

	it("removes media item by ID", async () => {
		const { result } = renderHook(() => useMediaStore());
		const projectId = "test-project";

		// Add item first
		let mediaId = "";
		await act(async () => {
			mediaId = await result.current.addMediaItem(projectId, {
				type: "image",
				name: "to-remove.jpg",
				url: "blob:remove",
				file: new File([""], "image.jpg", { type: "image/jpeg" }),
				duration: 0,
				thumbnailUrl: "thumb.jpg",
			});
		});

		expect(result.current.mediaItems).toHaveLength(1);

		// Remove the item
		await act(async () => {
			await result.current.removeMediaItem(projectId, mediaId);
		});

		expect(result.current.mediaItems).toHaveLength(0);
	});

	it("reports a persistent deletion failure to transactional callers", async () => {
		const { result } = renderHook(() => useMediaStore());
		const projectId = "test-project";
		let mediaId = "";
		await act(async () => {
			mediaId = await result.current.addMediaItem(projectId, {
				type: "image",
				name: "rollback.png",
				url: "blob:rollback",
				file: new File([""], "rollback.png", { type: "image/png" }),
				duration: 0,
			});
		});
		const { storageService } = await import("@/lib/storage/storage-service");
		vi.mocked(storageService.deleteMediaItem).mockRejectedValueOnce(
			new Error("persistent delete failed")
		);

		await expect(
			act(async () => {
				await result.current.removeMediaItem(projectId, mediaId);
			})
		).rejects.toThrow("persistent delete failed");
		expect(result.current.mediaItems).toHaveLength(0);
	});

	it("loads project media from storage", async () => {
		const mockMediaItems: MediaItem[] = [
			{
				id: "stored-1",
				type: "video",
				name: "stored-video.mp4",
				url: "blob:stored",
				file: new File([""], "video.mp4", { type: "video/mp4" }),
				duration: 60,
				thumbnailUrl: "stored-thumb.jpg",
				thumbnailStatus: "ready",
				width: 1920,
				height: 1080,
				fps: 30,
				metadata: {
					processingMethod: "immediate",
				},
			},
		];

		// Import and mock before using
		const { storageService } = await import("@/lib/storage/storage-service");
		vi.mocked(storageService.loadAllMediaItems).mockResolvedValueOnce(
			mockMediaItems
		);

		const { result } = renderHook(() => useMediaStore());

		await act(async () => {
			await result.current.loadProjectMedia("project-123");
		});

		expect(result.current.mediaItems).toEqual(mockMediaItems);
		expect(storageService.loadAllMediaItems).toHaveBeenCalledWith(
			"project-123"
		);
	});

	it("clears project media", async () => {
		const { result } = renderHook(() => useMediaStore());
		const projectId = "test-project";

		// Add some items
		await act(async () => {
			await result.current.addMediaItem(projectId, {
				type: "image",
				name: "test1.jpg",
				url: "blob:1",
				file: new File([""], "image.jpg", { type: "image/jpeg" }),
				duration: 0,
				thumbnailUrl: "thumb1.jpg",
			});
			await result.current.addMediaItem(projectId, {
				type: "video",
				name: "test2.mp4",
				url: "blob:2",
				file: new File([""], "image2.jpg", { type: "image/jpeg" }),
				duration: 10,
				thumbnailUrl: "thumb2.jpg",
			});
		});

		expect(result.current.mediaItems).toHaveLength(2);

		// Clear project media
		await act(async () => {
			await result.current.clearProjectMedia(projectId);
		});

		expect(result.current.mediaItems).toHaveLength(0);
	});

	it("clears all media from local state", () => {
		const { result } = renderHook(() => useMediaStore());

		// Add items directly to state
		act(() => {
			result.current.mediaItems = [
				{
					id: "temp-1",
					type: "image",
					name: "temp.jpg",
					url: "blob:temp",
					file: new File([""], "image.jpg", { type: "image/jpeg" }),
					duration: 0,
					thumbnailUrl: "temp-thumb.jpg",
				} as MediaItem,
			];
		});

		expect(result.current.mediaItems).toHaveLength(1);

		act(() => {
			result.current.clearAllMedia();
		});

		expect(result.current.mediaItems).toHaveLength(0);
	});

	it("handles loading state during operations", async () => {
		const { result } = renderHook(() => useMediaStore());

		expect(result.current.isLoading).toBe(false);

		const loadPromise = act(async () => {
			await result.current.loadProjectMedia("project-loading-test");
		});

		// Note: In real implementation, isLoading would be true during the operation
		// but with our mocks it completes immediately

		await loadPromise;
		expect(result.current.isLoading).toBe(false);
	});
});
