import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "../media-store-types";
import { insertAudioLibraryMedia } from "../audio-library-timeline";

const mediaItem = {
	id: "music-media",
	name: "Loop",
	type: "audio",
	duration: 4,
} as MediaItem;

function mediaElement({
	id,
	duration = 10,
}: {
	id: string;
	duration?: number;
}) {
	return {
		id,
		type: "media" as const,
		mediaId: id,
		name: id,
		duration,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
	};
}

describe("audio library timeline insertion", () => {
	it("keeps the ordinary add path unchanged", () => {
		const addMediaAtTime = vi.fn(() => true);
		const result = insertAudioLibraryMedia({
			timeline: {
				tracks: [],
				addMediaAtTime,
				addTrack: vi.fn(),
				addElementToTrack: vi.fn(),
				removeElementFromTrack: vi.fn(),
				removeTrack: vi.fn(),
				updateTrackAudio: vi.fn(),
			},
			mediaItem,
			mode: "single",
			startTime: 3,
			autoDucking: false,
		});

		expect(result.success).toBe(true);
		expect(addMediaAtTime).toHaveBeenCalledWith(mediaItem, 3);
	});

	it("aligns ordinary adds to the catalog BPM grid when requested", () => {
		const addMediaAtTime = vi.fn(() => true);
		const result = insertAudioLibraryMedia({
			timeline: {
				tracks: [],
				addMediaAtTime,
				addTrack: vi.fn(),
				addElementToTrack: vi.fn(),
				removeElementFromTrack: vi.fn(),
				removeTrack: vi.fn(),
				updateTrackAudio: vi.fn(),
			},
			mediaItem,
			mode: "single",
			startTime: 3.13,
			autoDucking: false,
			bpm: 120,
			beatAlignment: "nearest",
		});

		expect(result.success).toBe(true);
		expect(addMediaAtTime).toHaveBeenCalledWith(mediaItem, 3);
	});

	it("creates a fitted music track with a trimmed, faded final loop", () => {
		const addElementToTrack = vi
			.fn()
			.mockReturnValueOnce("loop-1")
			.mockReturnValueOnce("loop-2")
			.mockReturnValueOnce("loop-3");
		const updateTrackAudio = vi.fn();
		const result = insertAudioLibraryMedia({
			timeline: {
				tracks: [
					{
						id: "video-track",
						name: "Video",
						type: "media",
						muted: false,
						elements: [mediaElement({ id: "video", duration: 10 })],
					},
				],
				addMediaAtTime: vi.fn(),
				addTrack: vi.fn(() => "music-track"),
				addElementToTrack,
				removeElementFromTrack: vi.fn(),
				removeTrack: vi.fn(),
				updateTrackAudio,
			},
			mediaItem,
			mode: "fit-project",
			startTime: 7,
			autoDucking: true,
		});

		expect(result).toEqual({
			success: true,
			segmentCount: 3,
			duckingSourceCount: 1,
		});
		expect(addElementToTrack).toHaveBeenNthCalledWith(
			3,
			"music-track",
			expect.objectContaining({
				startTime: 8,
				trimEnd: 2,
				audioFadeOut: 0.5,
			}),
			{ pushHistory: false, selectElement: true }
		);
		expect(updateTrackAudio).toHaveBeenCalledWith(
			"music-track",
			expect.objectContaining({
				ducking: expect.objectContaining({
					enabled: true,
					sourceTrackIds: ["video-track"],
				}),
			}),
			false
		);
	});

	it("does not create a track when no visual duration exists", () => {
		const addTrack = vi.fn();
		const result = insertAudioLibraryMedia({
			timeline: {
				tracks: [],
				addMediaAtTime: vi.fn(),
				addTrack,
				addElementToTrack: vi.fn(),
				removeElementFromTrack: vi.fn(),
				removeTrack: vi.fn(),
				updateTrackAudio: vi.fn(),
			},
			mediaItem,
			mode: "fit-project",
			startTime: 0,
			autoDucking: false,
		});

		expect(result.reason).toBe("no-visual-content");
		expect(addTrack).not.toHaveBeenCalled();
	});

	it("rolls back partial fit-project insertion when a segment fails", () => {
		const addElementToTrack = vi
			.fn()
			.mockReturnValueOnce("loop-1")
			.mockReturnValueOnce(null);
		const removeElementFromTrack = vi.fn();
		const removeTrack = vi.fn();
		const result = insertAudioLibraryMedia({
			timeline: {
				tracks: [
					{
						id: "video-track",
						name: "Video",
						type: "media",
						muted: false,
						elements: [mediaElement({ id: "video", duration: 10 })],
					},
				],
				addMediaAtTime: vi.fn(),
				addTrack: vi.fn(() => "music-track"),
				addElementToTrack,
				removeElementFromTrack,
				removeTrack,
				updateTrackAudio: vi.fn(),
			},
			mediaItem,
			mode: "fit-project",
			startTime: 0,
			autoDucking: false,
		});

		expect(result).toEqual({
			success: false,
			segmentCount: 0,
			duckingSourceCount: 0,
			reason: "insert-failed",
		});
		expect(removeElementFromTrack).toHaveBeenCalledWith(
			"music-track",
			"loop-1",
			false
		);
		expect(removeTrack).toHaveBeenCalledWith("music-track");
	});
});
