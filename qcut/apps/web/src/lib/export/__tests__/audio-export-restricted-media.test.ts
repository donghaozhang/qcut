import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	exportAudioCLI: vi.fn(),
	getFileInfo: vi.fn(),
	loadMediaItem: vi.fn(),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		files: { getFileInfo: mocks.getFileInfo },
		ffmpeg: { exportAudioCLI: mocks.exportAudioCLI },
		isElectron: true,
	}),
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({ activeProject: { id: "project-1" } }),
	},
}));

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: { loadMediaItem: mocks.loadMediaItem },
}));

import { exportTimelineAudio } from "../audio-export";

describe("standalone audio restricted media policy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.exportAudioCLI.mockResolvedValue({
			fileSize: 512,
			outputPath: "/tmp/allowed.mp3",
		});
		mocks.getFileInfo.mockResolvedValue({ size: 1 });
	});

	it("allows ordinary audio sources alongside a visual-only Sticker Lab reference", async () => {
		await expect(
			exportTimelineAudio({
				bitrate: 192,
				duration: 5,
				mediaItems: [
					{
						file: new File([], "ordinary.wav", { type: "audio/wav" }),
						id: "ordinary-audio",
						localPath: "/tmp/ordinary.wav",
						name: "ordinary.wav",
						type: "audio",
					},
					{
						file: new File([], "ordinary.mp4", { type: "video/mp4" }),
						id: "ordinary-video",
						localPath: "/tmp/ordinary.mp4",
						name: "ordinary.mp4",
						type: "video",
					},
					{
						file: new File([], "reference.gif", { type: "image/gif" }),
						id: "restricted-sticker",
						metadata: { redistribution: "prohibited" },
						name: "reference.gif",
						type: "image",
					},
				],
				outputPath: "/tmp/allowed.mp3",
				sampleRate: 44_100,
				tracks: [
					{
						elements: [
							{
								duration: 5,
								id: "ordinary-audio-element",
								mediaId: "ordinary-audio",
								name: "Ordinary audio",
								startTime: 0,
								trimEnd: 0,
								trimStart: 0,
								type: "media",
							},
						],
						id: "audio",
						name: "Audio",
						type: "audio",
					},
					{
						elements: [
							{
								duration: 5,
								id: "ordinary-video-element",
								mediaId: "ordinary-video",
								name: "Ordinary video",
								startTime: 0,
								trimEnd: 0,
								trimStart: 0,
								type: "media",
							},
						],
						id: "video",
						name: "Video",
						type: "media",
					},
					{
						elements: [
							{
								duration: 5,
								id: "restricted-element",
								mediaId: "restricted-sticker",
								name: "Reference",
								startTime: 0,
								stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
								trimEnd: 0,
								trimStart: 0,
								type: "sticker",
							},
						],
						id: "stickers",
						name: "Stickers",
						type: "sticker",
					},
				],
			})
		).resolves.toEqual({
			fileSize: 512,
			outputPath: "/tmp/allowed.mp3",
		});
		expect(mocks.exportAudioCLI).toHaveBeenCalledWith(
			expect.objectContaining({
				audioFiles: [
					expect.objectContaining({ path: "/tmp/ordinary.wav" }),
					expect.objectContaining({ path: "/tmp/ordinary.mp4" }),
				],
			})
		);
	});

	it("rejects restricted media that supplies timeline audio", async () => {
		await expect(
			exportTimelineAudio({
				bitrate: 192,
				duration: 5,
				mediaItems: [
					{
						file: new File([], "restricted.wav", { type: "audio/wav" }),
						id: "restricted-audio",
						localPath: "/tmp/restricted.wav",
						metadata: { redistribution: "prohibited" },
						name: "restricted.wav",
						type: "audio",
					},
				],
				outputPath: "/tmp/must-not-exist.mp3",
				sampleRate: 44_100,
				tracks: [
					{
						elements: [
							{
								duration: 5,
								id: "restricted-audio-element",
								mediaId: "restricted-audio",
								name: "Restricted audio",
								startTime: 0,
								trimEnd: 0,
								trimStart: 0,
								type: "media",
							},
						],
						id: "audio-track",
						name: "Audio",
						type: "audio",
					},
				],
			})
		).rejects.toMatchObject({
			code: "QCUT_RESTRICTED_MEDIA_EXPORT",
		});
		expect(mocks.exportAudioCLI).not.toHaveBeenCalled();
	});

	it("rejects a restricted derived source hydrated from storage", async () => {
		mocks.loadMediaItem.mockResolvedValue({
			id: "restricted-derived-audio",
			localPath: "/tmp/restricted-derived.wav",
			metadata: { redistribution: "prohibited" },
			name: "restricted-derived.wav",
			type: "audio",
		});
		const tracks: TimelineTrack[] = [
			{
				elements: [
					{
						audio: {
							denoise: {
								amount: 100,
								enabled: true,
								mode: "ai",
								noiseFloorDb: -50,
								processedMediaId: "restricted-derived-audio",
								status: "ready",
							},
						} as MediaElement["audio"],
						duration: 5,
						id: "audio-element",
						mediaId: "original-audio",
						name: "Original audio",
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
					},
				],
				id: "audio-track",
				name: "Audio",
				type: "audio",
			},
		];

		await expect(
			exportTimelineAudio({
				bitrate: 192,
				duration: 5,
				mediaItems: [
					{
						file: new File([], "original.wav", { type: "audio/wav" }),
						id: "original-audio",
						localPath: "/tmp/original.wav",
						name: "original.wav",
						type: "audio",
					},
				],
				outputPath: "/tmp/must-not-exist.mp3",
				sampleRate: 44_100,
				tracks,
			})
		).rejects.toMatchObject({
			code: "QCUT_RESTRICTED_MEDIA_EXPORT",
		});
		expect(mocks.loadMediaItem).toHaveBeenCalledWith(
			"project-1",
			"restricted-derived-audio"
		);
		expect(mocks.exportAudioCLI).not.toHaveBeenCalled();
	});
});
