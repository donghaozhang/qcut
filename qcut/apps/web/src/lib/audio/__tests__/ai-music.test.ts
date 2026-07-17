import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const store = {
		mediaItems: [] as Array<Record<string, unknown>>,
		addMediaItem: vi.fn(),
	};
	return {
		store,
		readFile: vi.fn(),
		getMediaDuration: vi.fn(),
		getOrCreateObjectURL: vi.fn(),
	};
});

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({ files: { readFile: mocks.readFile } }),
}));

vi.mock("@/lib/media/blob-manager", () => ({
	getOrCreateObjectURL: mocks.getOrCreateObjectURL,
}));

vi.mock("@/stores/media/media-store", () => ({
	getMediaDuration: mocks.getMediaDuration,
	useMediaStore: { getState: () => mocks.store },
}));

import {
	buildAiMusicPrompt,
	importGeneratedMusic,
	projectAudioToSound,
} from "../ai-music";

describe("AI music", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.store.mediaItems = [];
		mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
		mocks.getMediaDuration.mockResolvedValue(42.5);
		mocks.getOrCreateObjectURL.mockReturnValue("blob:ai-music");
		mocks.store.addMediaItem.mockImplementation(
			async (_projectId: string, item: Record<string, unknown>) => {
				mocks.store.mediaItems = [{ ...item, id: "music-media" }];
				return "music-media";
			}
		);
	});

	it("builds a bounded edit-aware prompt", () => {
		expect(
			buildAiMusicPrompt({
				style: "Lo-fi hip-hop with soft piano",
				mood: "warm and hopeful",
				scene: "travel VLOG",
				targetDuration: 30,
				bpm: 96,
			})
		).toBe(
			"Lo-fi hip-hop with soft piano, warm and hopeful mood, for travel VLOG, 96 BPM, approximately 30 seconds, clean edit-friendly ending"
		);
	});

	it("imports generated output into project media with generation metadata", async () => {
		const mediaItem = await importGeneratedMusic({
			projectId: "project-1",
			outputPath: "/tmp/generated-track.mp3",
			prompt: "Cinematic ambient, 84 BPM",
			model: "minimax_music_v2_6",
			instrumental: true,
			targetDuration: 30,
			bpm: 84,
		});

		expect(mocks.readFile).toHaveBeenCalledWith("/tmp/generated-track.mp3");
		expect(mocks.store.addMediaItem).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({
				name: "generated-track.mp3",
				type: "audio",
				url: "blob:ai-music",
				duration: 42.5,
				metadata: expect.objectContaining({
					source: "ai-music",
					model: "minimax_music_v2_6",
					bpm: 84,
				}),
			})
		);
		expect(mediaItem.id).toBe("music-media");
	});

	it("maps project audio back into a directly reusable library item", () => {
		const sound = projectAudioToSound({
			mediaItem: {
				id: "music-media",
				name: "generated-track.mp3",
				type: "audio",
				file: new File(["audio"], "generated-track.mp3", {
					type: "audio/mpeg",
				}),
				url: "blob:ai-music",
				duration: 42.5,
				metadata: {
					source: "ai-music",
					prompt: "Cinematic ambient",
					bpm: 84,
				},
			},
		});

		expect(sound).toMatchObject({
			mediaId: "music-media",
			previewUrl: "blob:ai-music",
			duration: 42.5,
			source: "project",
			kind: "music",
			bpm: 84,
		});
	});
});
