import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaStore } from "../media-store";
import { getMediaDuration } from "../media-store-helpers";

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: {
		saveMediaItem: vi.fn(async () => {}),
	},
}));

vi.mock("../media-store-helpers", () => ({
	revokeMediaBlob: vi.fn(),
	cloneFileForTemporaryUse: vi.fn((file: File) => file),
	generateVideoThumbnailBrowser: vi.fn(),
	getMediaDuration: vi.fn(async () => 164.2),
	getFileType: vi.fn(() => "audio"),
	getImageDimensions: vi.fn(),
	getMediaAspectRatio: vi.fn(),
}));

vi.mock("@/lib/media/blob-manager", () => ({
	getOrCreateObjectURL: vi.fn(() => "blob:mock"),
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
	debugError: vi.fn(),
}));

vi.mock("@/lib/debug/error-handler", () => ({
	handleStorageError: vi.fn(),
	handleMediaProcessingError: vi.fn(),
}));

const makeAudioFile = () =>
	new File(["audio-bytes"], "song.mp3", { type: "audio/mpeg" });

describe("media store audio duration extraction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useMediaStore.setState({ mediaItems: [] });
	});

	it("extracts and stores duration for imported audio", async () => {
		const id = await useMediaStore.getState().addMediaItem("proj-1", {
			name: "song.mp3",
			type: "audio",
			file: makeAudioFile(),
			url: "blob:seed",
		});

		await vi.waitFor(() => {
			const item = useMediaStore
				.getState()
				.mediaItems.find((candidate) => candidate.id === id);
			expect(item?.duration).toBeCloseTo(164.2);
		});
		expect(getMediaDuration).toHaveBeenCalledTimes(1);
	});

	it("skips extraction when the audio item already has a duration", async () => {
		await useMediaStore.getState().addMediaItem("proj-1", {
			name: "known.mp3",
			type: "audio",
			file: makeAudioFile(),
			url: "blob:seed",
			duration: 42,
		});

		expect(getMediaDuration).not.toHaveBeenCalled();
	});
});
