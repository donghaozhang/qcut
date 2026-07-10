import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractAudioFileInputs, type AudioSourceAPI } from "../audio-sources";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";

const makeMediaElement = (params: {
	id: string;
	mediaId: string;
	startTime: number;
	hidden?: boolean;
	volume?: number;
	audioFadeIn?: number;
	audioFadeOut?: number;
	audioNormalize?: boolean;
	audioDenoise?: number;
	audioPan?: number;
}) => {
	return {
		id: params.id,
		type: "media" as const,
		mediaId: params.mediaId,
		name: `Element ${params.id}`,
		startTime: params.startTime,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		hidden: params.hidden ?? false,
		volume: params.volume,
		audioFadeIn: params.audioFadeIn,
		audioFadeOut: params.audioFadeOut,
		audioNormalize: params.audioNormalize,
		audioDenoise: params.audioDenoise,
		audioPan: params.audioPan,
	};
};

const makeTrack = (params: {
	id: string;
	type: TimelineTrack["type"];
	elements: TimelineTrack["elements"];
}): TimelineTrack => {
	return {
		id: params.id,
		name: `Track ${params.id}`,
		type: params.type,
		elements: params.elements,
	};
};

const makeMediaItem = (params: {
	id: string;
	type: "video" | "audio" | "image";
	name: string;
	file?: File;
	localPath?: string;
	url?: string;
}): MediaItem => {
	return {
		id: params.id,
		type: params.type,
		name: params.name,
		file:
			params.file ??
			new File([params.type === "image" ? "img" : "audio"], params.name, {
				type:
					params.type === "video"
						? "video/mp4"
						: params.type === "audio"
							? "audio/mpeg"
							: "image/png",
			}),
		localPath: params.localPath,
		url: params.url,
	} as MediaItem;
};

describe("extractAudioFileInputs", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("extracts only audio-track candidates and skips media-track video/image/hidden elements", async () => {
		const tracks: TimelineTrack[] = [
			makeTrack({
				id: "media-track",
				type: "media",
				elements: [
					makeMediaElement({
						id: "video-el",
						mediaId: "video-1",
						startTime: 3,
						volume: 0.7,
					}),
					makeMediaElement({
						id: "image-el",
						mediaId: "image-1",
						startTime: 1,
					}),
					makeMediaElement({
						id: "hidden-el",
						mediaId: "audio-1",
						startTime: 2,
						hidden: true,
					}),
				],
			}),
			makeTrack({
				id: "audio-track",
				type: "audio",
				elements: [
					makeMediaElement({
						id: "audio-el",
						mediaId: "audio-1",
						startTime: 0,
					}),
				],
			}),
		];

		const mediaItems: MediaItem[] = [
			makeMediaItem({
				id: "video-1",
				type: "video",
				name: "video.mp4",
				localPath: "/tmp/video.mp4",
			}),
			makeMediaItem({
				id: "audio-1",
				type: "audio",
				name: "music.mp3",
				localPath: "/tmp/music.mp3",
			}),
			makeMediaItem({
				id: "image-1",
				type: "image",
				name: "still.png",
				localPath: "/tmp/still.png",
			}),
		];

		const api: AudioSourceAPI = {
			fileExists: vi.fn(async () => true),
			saveTemp: vi.fn(async () => ({ success: true, path: "/tmp/saved.mp3" })),
		};

		const result = await extractAudioFileInputs(
			tracks,
			mediaItems,
			"session-1",
			api
		);

		expect(result).toHaveLength(1);
		expect(result[0].path).toBe("/tmp/music.mp3");
		expect(result[0].startTime).toBe(0);
		expect(api.saveTemp).not.toHaveBeenCalled();
	});

	it("falls back to file-backed temp save when localPath is unavailable", async () => {
		const fileBackedAudio = new File(["voiceover"], "voiceover.mp3", {
			type: "audio/mpeg",
		});
		Object.defineProperty(fileBackedAudio, "arrayBuffer", {
			value: vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer),
		});

		const tracks: TimelineTrack[] = [
			makeTrack({
				id: "audio-track",
				type: "audio",
				elements: [
					makeMediaElement({
						id: "audio-el",
						mediaId: "audio-1",
						startTime: 0,
					}),
				],
			}),
		];

		const mediaItems: MediaItem[] = [
			makeMediaItem({
				id: "audio-1",
				type: "audio",
				name: "voiceover.mp3",
				file: fileBackedAudio,
				localPath: "/tmp/missing.mp3",
			}),
		];

		const api: AudioSourceAPI = {
			fileExists: vi.fn(async () => false),
			saveTemp: vi.fn(async () => ({
				success: true,
				path: "/tmp/voiceover_saved.mp3",
			})),
		};

		const result = await extractAudioFileInputs(
			tracks,
			mediaItems,
			"session-2",
			api
		);

		expect(result).toHaveLength(1);
		expect(result[0].path).toBe("/tmp/voiceover_saved.mp3");
		expect(api.saveTemp).toHaveBeenCalledTimes(1);
	});

	it("includes embedded video audio for standalone audio export", async () => {
		const tracks: TimelineTrack[] = [
			makeTrack({
				id: "media-track",
				type: "media",
				elements: [
					makeMediaElement({
						id: "video-el",
						mediaId: "video-1",
						startTime: 2,
						volume: 0.75,
					}),
				],
			}),
		];
		const mediaItems = [
			makeMediaItem({
				id: "video-1",
				type: "video",
				name: "interview.mp4",
				localPath: "/tmp/interview.mp4",
			}),
		];
		const api: AudioSourceAPI = {
			fileExists: vi.fn(async () => true),
			saveTemp: vi.fn(),
		};

		const result = await extractAudioFileInputs(
			tracks,
			mediaItems,
			"session-standalone",
			api,
			undefined,
			{ includeEmbeddedVideoAudio: true }
		);

		expect(result).toEqual([
			{
				path: "/tmp/interview.mp4",
				startTime: 2,
				volume: 0.75,
				trimStart: 0,
				trimEnd: 0,
				duration: 5,
				fadeIn: 0,
				fadeOut: 0,
				normalize: false,
				denoise: 0,
				pan: 0,
				playbackRate: 1,
				speedKeyframes: undefined,
				reverse: false,
				freezeFrameTime: undefined,
				freezeFrameDuration: 0,
			},
		]);
	});

	it("uses URL fetch fallback when no localPath and empty file", async () => {
		const emptyAudioFile = new File([], "remote.mp3", { type: "audio/mpeg" });
		const tracks: TimelineTrack[] = [
			makeTrack({
				id: "audio-track",
				type: "audio",
				elements: [
					makeMediaElement({
						id: "audio-el",
						mediaId: "audio-1",
						startTime: 1,
					}),
				],
			}),
		];

		const mediaItems: MediaItem[] = [
			makeMediaItem({
				id: "audio-1",
				type: "audio",
				name: "remote.mp3",
				file: emptyAudioFile,
				url: "https://example.com/remote.mp3",
			}),
		];

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
			ok: true,
			arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
		} as unknown as Response);

		const api: AudioSourceAPI = {
			fileExists: vi.fn(async () => false),
			saveTemp: vi.fn(async () => ({
				success: true,
				path: "/tmp/remote_saved.mp3",
			})),
		};

		const result = await extractAudioFileInputs(
			tracks,
			mediaItems,
			"session-3",
			api
		);

		expect(result).toHaveLength(1);
		expect(result[0].path).toBe("/tmp/remote_saved.mp3");
		expect(fetchSpy).toHaveBeenCalledWith("https://example.com/remote.mp3");
		expect(api.saveTemp).toHaveBeenCalledTimes(1);
	});
});
