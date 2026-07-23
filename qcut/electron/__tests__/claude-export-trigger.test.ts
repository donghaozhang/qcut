import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const { mockSpawn, mockGetFFmpegPath, mockParseProgress, mockFsPromises } =
	vi.hoisted(() => {
		const mockGetFFmpegPath = vi.fn(() => "/mock/ffmpeg");
		const mockParseProgress = vi.fn(() => null);

		const mockFsPromises = {
			mkdir: vi.fn(async () => {}),
			mkdtemp: vi.fn(async () => "/tmp/qcut-claude-export-test"),
			writeFile: vi.fn(async () => {}),
			stat: vi.fn(async () => ({ size: 4096 })),
			rm: vi.fn(async () => {}),
		};

		const mockSpawn = vi.fn();

		return {
			mockSpawn,
			mockGetFFmpegPath,
			mockParseProgress,
			mockFsPromises,
		};
	});

let spawnMode: "success" | "hang" = "success";

vi.mock("node:child_process", () => {
	const mod = { spawn: (...args: unknown[]) => mockSpawn(...args) };
	return { ...mod, default: mod };
});

vi.mock("node:fs/promises", () => ({
	default: mockFsPromises,
	...mockFsPromises,
}));

vi.mock("../ffmpeg/utils.js", () => ({
	getFFmpegPath: () => mockGetFFmpegPath(),
	parseProgress: (...args: unknown[]) => mockParseProgress(...args),
}));

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => "/tmp"),
	},
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
	},
}));

vi.mock("electron-log", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		log: vi.fn(),
	},
}));

import {
	startExportJob,
	getExportJobStatus,
	clearExportJobsForTests,
} from "../claude/handlers/claude-export-handler";
import {
	buildExportSegmentScaleFilter,
	collectExportSegments,
	collectTimelineAudioFiles,
} from "../claude/handlers/claude-export-handler/export-engine";

const testTimeline = {
	name: "Test Timeline",
	duration: 10,
	width: 1920,
	height: 1080,
	fps: 30,
	tracks: [
		{
			index: 0,
			name: "Track 1",
			type: "media",
			elements: [
				{
					id: "el_1",
					trackIndex: 0,
					startTime: 0,
					endTime: 5,
					duration: 5,
					type: "media" as const,
					sourceId: "media_1",
					fitMode: "cover" as const,
				},
			],
		},
	],
};

const testMediaFiles = [
	{
		id: "media_1",
		name: "clip.mp4",
		type: "video" as const,
		path: "/tmp/clip.mp4",
		size: 1024,
		duration: 5,
		createdAt: Date.now(),
		modifiedAt: Date.now(),
	},
];

function createMockProcess({
	shouldClose,
}: {
	shouldClose: boolean;
}): EventEmitter {
	const proc = new EventEmitter() as EventEmitter & {
		stderr: EventEmitter;
		stdout: EventEmitter;
	};
	proc.stderr = new EventEmitter();
	proc.stdout = new EventEmitter();

	if (shouldClose) {
		setTimeout(() => {
			proc.emit("close", 0);
		}, 0);
	}

	return proc;
}

describe("Claude export trigger", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearExportJobsForTests();
		spawnMode = "success";

		mockSpawn.mockImplementation(() =>
			createMockProcess({ shouldClose: spawnMode === "success" })
		);
	});

	it("starts export with valid preset", async () => {
		const result = await startExportJob({
			projectId: "project_1",
			request: {
				preset: "youtube-1080p",
				outputPath: "/tmp/export-preset.mp4",
			},
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		expect(result.jobId).toMatch(/^export_/);
		expect(result.status).toBe("queued");
	});

	it("uses the timeline fit mode when scaling export segments", async () => {
		const [segment] = await collectExportSegments({
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
			projectId: "project_fit",
		});

		expect(segment.fitMode).toBe("cover");
		expect(
			buildExportSegmentScaleFilter({
				segment,
				settings: { width: 1080, height: 1920 },
			})
		).toBe(
			"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
		);
		expect(
			buildExportSegmentScaleFilter({
				segment: { ...segment, fitMode: "contain" },
				settings: { width: 1080, height: 1920 },
			})
		).toBe(
			"scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1"
		);
	});

	it("collects independent audio-track clips with timeline mix settings", async () => {
		const audioFiles = await collectTimelineAudioFiles({
			projectId: "project_audio_track",
			timeline: {
				...testTimeline,
				tracks: [
					...testTimeline.tracks,
					{
						id: "audio-track",
						index: 1,
						name: "Voiceover",
						type: "audio",
						elements: [
							{
								id: "voiceover",
								trackIndex: 1,
								startTime: 1.25,
								endTime: 4.25,
								duration: 3,
								type: "audio" as const,
								sourceId: "voiceover-media",
								trimStart: 0.5,
								trimEnd: 0.25,
								props: {
									volume: 0.8,
									audioFadeIn: 0.2,
									audioFadeOut: 0.3,
								},
							},
						],
					},
				],
			},
			mediaFiles: [
				...testMediaFiles,
				{
					id: "voiceover-media",
					name: "voiceover.wav",
					type: "audio" as const,
					path: "/tmp/voiceover.wav",
					size: 2048,
					duration: 4,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				},
			],
		});

		expect(audioFiles).toEqual([
			expect.objectContaining({
				elementId: "voiceover",
				trackId: "audio-track",
				path: "/tmp/voiceover.wav",
				startTime: 1.25,
				duration: 3,
				trimStart: 0.5,
				trimEnd: 0.25,
				volume: 0.8,
				fadeIn: 0.2,
				fadeOut: 0.3,
			}),
		]);
	});

	it("starts export with nested custom settings", async () => {
		const result = await startExportJob({
			projectId: "project_2",
			request: {
				preset: "youtube-1080p",
				settings: {
					width: 1280,
					height: 720,
					fps: 24,
					bitrate: "4Mbps",
					codec: "libx264",
				},
				outputPath: "/tmp/export-custom.mp4",
			},
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		const job = getExportJobStatus(result.jobId);
		expect(job?.presetId).toBe("youtube-1080p");
		expect(job?.settings?.width).toBe(1280);
		expect(job?.settings?.height).toBe(720);
		expect(job?.settings?.fps).toBe(24);
		expect(["queued", "exporting", "completed"]).toContain(job?.status);
	});

	it("accepts top-level custom settings without settings key (Issue J)", async () => {
		const result = await startExportJob({
			projectId: "project_2b",
			request: {
				width: 1280,
				height: 720,
				fps: 24,
				format: "mp4",
			} as Record<
				string,
				unknown
			> as import("../types/claude-api").ExportJobRequest,
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		const job = getExportJobStatus(result.jobId);
		expect(job?.settings?.width).toBe(1280);
		expect(job?.settings?.height).toBe(720);
		expect(job?.settings?.fps).toBe(24);
		expect(job?.settings?.format).toBe("mp4");
		expect(["queued", "exporting", "completed"]).toContain(job?.status);
	});

	it("resolves standalone MP3 settings", async () => {
		const result = await startExportJob({
			projectId: "project_audio",
			request: {
				format: "mp3",
				outputPath: "/tmp/export-audio.mp3",
				audioExportConfig: {
					bitrate: 320,
					sampleRate: 48_000,
					channels: 2,
				},
			} as import("../types/claude-api").ExportJobRequest & {
				format: string;
			},
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		const job = getExportJobStatus(result.jobId);
		expect(job?.settings?.format).toBe("mp3");
		expect(job?.settings?.audioBitrate).toBe(320);
		expect(job?.settings?.audioSampleRate).toBe(48_000);
	});

	it("returns job ID immediately", async () => {
		spawnMode = "hang";

		const result = await startExportJob({
			projectId: "project_3",
			request: {
				preset: "youtube-1080p",
				outputPath: "/tmp/export-immediate.mp4",
			},
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		expect(result.jobId).toMatch(/^export_/);
		expect(result.status).toBe("queued");

		const job = getExportJobStatus(result.jobId);
		expect(job).toBeTruthy();
		expect(["queued", "exporting"]).toContain(job?.status);
	});

	it("rejects invalid preset ID", async () => {
		await expect(
			startExportJob({
				projectId: "project_4",
				request: {
					preset: "invalid-preset",
				},
				timeline: testTimeline,
				mediaFiles: testMediaFiles,
			})
		).rejects.toThrow("Invalid preset ID");
	});

	it("rejects export when timeline is empty", async () => {
		await expect(
			startExportJob({
				projectId: "project_5",
				request: {
					preset: "youtube-1080p",
				},
				timeline: {
					...testTimeline,
					tracks: [
						{
							index: 0,
							name: "Track 1",
							type: "media",
							elements: [],
						},
					],
				},
				mediaFiles: testMediaFiles,
			})
		).rejects.toThrow("empty timeline");
	});

	it("starts export with image-only timeline", async () => {
		const result = await startExportJob({
			projectId: "project_img",
			request: {
				preset: "youtube-1080p",
				outputPath: "/tmp/export-image.mp4",
			},
			timeline: {
				name: "Image Timeline",
				duration: 10,
				width: 1920,
				height: 1080,
				fps: 30,
				tracks: [
					{
						index: 0,
						name: "Track 1",
						type: "media",
						elements: [
							{
								id: "el_img_1",
								trackIndex: 0,
								startTime: 0,
								endTime: 5,
								duration: 5,
								type: "image" as const,
								sourceId: "media_img_1",
							},
							{
								id: "el_img_2",
								trackIndex: 0,
								startTime: 5,
								endTime: 10,
								duration: 5,
								type: "image" as const,
								sourceId: "media_img_2",
							},
						],
					},
				],
			},
			mediaFiles: [
				{
					id: "media_img_1",
					name: "photo1.png",
					type: "image" as const,
					path: "/tmp/photo1.png",
					size: 2048,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				},
				{
					id: "media_img_2",
					name: "photo2.png",
					type: "image" as const,
					path: "/tmp/photo2.png",
					size: 3072,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				},
			],
		});

		expect(result.jobId).toMatch(/^export_/);
		expect(result.status).toBe("queued");
	});

	it("starts export with mixed image and video timeline", async () => {
		const result = await startExportJob({
			projectId: "project_mixed",
			request: {
				preset: "youtube-1080p",
				outputPath: "/tmp/export-mixed.mp4",
			},
			timeline: {
				name: "Mixed Timeline",
				duration: 10,
				width: 1920,
				height: 1080,
				fps: 30,
				tracks: [
					{
						index: 0,
						name: "Track 1",
						type: "media",
						elements: [
							{
								id: "el_vid_1",
								trackIndex: 0,
								startTime: 0,
								endTime: 5,
								duration: 5,
								type: "media" as const,
								sourceId: "media_1",
							},
							{
								id: "el_img_1",
								trackIndex: 0,
								startTime: 5,
								endTime: 10,
								duration: 5,
								type: "image" as const,
								sourceId: "media_img_1",
							},
						],
					},
				],
			},
			mediaFiles: [
				{
					id: "media_1",
					name: "clip.mp4",
					type: "video" as const,
					path: "/tmp/clip.mp4",
					size: 1024,
					duration: 5,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				},
				{
					id: "media_img_1",
					name: "photo.png",
					type: "image" as const,
					path: "/tmp/photo.png",
					size: 2048,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				},
			],
		});

		expect(result.jobId).toMatch(/^export_/);
		expect(result.status).toBe("queued");
	});

	it("rejects concurrent export requests for same project", async () => {
		spawnMode = "hang";

		await startExportJob({
			projectId: "project_6",
			request: {
				preset: "youtube-1080p",
				outputPath: "/tmp/export-1.mp4",
			},
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		await expect(
			startExportJob({
				projectId: "project_6",
				request: {
					preset: "youtube-1080p",
					outputPath: "/tmp/export-2.mp4",
				},
				timeline: testTimeline,
				mediaFiles: testMediaFiles,
			})
		).rejects.toThrow("already in progress");
	});
});
