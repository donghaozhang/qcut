import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const {
	mockSpawn,
	mockGetFFmpegPath,
	mockParseProgress,
	mockFsPromises,
	mockExistsSync,
} = vi.hoisted(() => {
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
	const mockExistsSync = vi.fn(() => true);

	return {
		mockSpawn,
		mockGetFFmpegPath,
		mockParseProgress,
		mockFsPromises,
		mockExistsSync,
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

vi.mock("fs", () => ({
	default: { existsSync: (...args: unknown[]) => mockExistsSync(...args) },
	existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

vi.mock("../ffmpeg/utils.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../ffmpeg/utils.js")>();
	return {
		...actual,
		getFFmpegPath: () => mockGetFFmpegPath(),
		parseProgress: (...args: unknown[]) => mockParseProgress(...args),
		probeHasAudioStream: vi.fn(async () => false),
	};
});

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
	buildTransitionAudioAlignmentFilter,
	buildTransitionVideoSources,
	collectExportSegments,
	collectTimelineAudioFiles,
	collectVideoTransitions,
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

	it("omits media clips from hidden tracks", async () => {
		const segments = await collectExportSegments({
			timeline: {
				...testTimeline,
				tracks: testTimeline.tracks.map((track) => ({
					...track,
					hidden: true,
				})),
			},
			mediaFiles: testMediaFiles,
		});

		expect(segments).toEqual([]);
	});

	it("inserts silence for transition timeline gaps", () => {
		const filter = buildTransitionAudioAlignmentFilter({
			segments: [
				{
					elementId: "clip-a",
					trackId: "main",
					trackOrder: 0,
					elementOrder: 0,
					sourcePath: "/tmp/a.mp4",
					startTime: 0,
					duration: 2,
					trimStart: 0,
					sourceId: "media-a",
					fitMode: "cover",
				},
				{
					elementId: "clip-b",
					trackId: "main",
					trackOrder: 0,
					elementOrder: 1,
					sourcePath: "/tmp/b.mp4",
					startTime: 3,
					duration: 2,
					trimStart: 0,
					sourceId: "media-b",
					fitMode: "cover",
				},
			],
		});

		expect(filter).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=1");
		expect(filter).toContain("concat=n=3:v=0:a=1[aligned_audio]");
	});

	it("renders serialized timeline transitions through the shared xfade graph", async () => {
		const transitionTimeline = {
			...testTimeline,
			duration: 10,
			tracks: [
				{
					id: "main-track",
					index: 0,
					name: "Main",
					type: "media",
					elements: [
						{
							...testTimeline.tracks[0].elements[0],
							id: "clip-a",
							sourceId: "media-a",
						},
						{
							...testTimeline.tracks[0].elements[0],
							id: "clip-b",
							sourceId: "media-b",
							startTime: 5,
							endTime: 10,
						},
					],
					transitions: [
						{
							id: "transition-a-b",
							fromElementId: "clip-a",
							toElementId: "clip-b",
							presetId: "lab-clean-dissolve",
							type: "dissolve",
							duration: 0.5,
							easing: "linear" as const,
						},
					],
				},
			],
		};
		const transitionMediaFiles = [
			{
				...testMediaFiles[0],
				id: "media-a",
				name: "a.mp4",
				path: "/tmp/a.mp4",
			},
			{
				...testMediaFiles[0],
				id: "media-b",
				name: "b.mp4",
				path: "/tmp/b.mp4",
			},
		];
		const segments = await collectExportSegments({
			timeline: transitionTimeline,
			mediaFiles: transitionMediaFiles,
			projectId: "project_transition",
		});
		const transitions = collectVideoTransitions({
			timeline: transitionTimeline,
			segments,
		});
		const invalidMaskTimeline = {
			...transitionTimeline,
			tracks: transitionTimeline.tracks.map((track) => ({
				...track,
				transitions: track.transitions.map((transition) => ({
					...transition,
					maskShape: "hexagon",
				})),
			})),
		};
		expect(() =>
			collectVideoTransitions({
				timeline: invalidMaskTimeline,
				segments,
			})
		).toThrow("Unsupported transition mask shape: hexagon");

		expect(transitions).toEqual([
			expect.objectContaining({
				id: "transition-a-b",
				trackId: "main-track",
				type: "dissolve",
				duration: 0.5,
			}),
		]);
		expect(
			buildTransitionVideoSources({
				segments,
				segmentOutputs: ["/tmp/segment-a.mp4", "/tmp/segment-b.mp4"],
			})
		).toEqual([
			expect.objectContaining({
				elementId: "clip-a",
				trackId: "main-track",
				path: "/tmp/segment-a.mp4",
			}),
			expect.objectContaining({
				elementId: "clip-b",
				trackId: "main-track",
				path: "/tmp/segment-b.mp4",
			}),
		]);

		const result = await startExportJob({
			projectId: "project_transition",
			request: {
				preset: "youtube-1080p",
				outputPath: "/tmp/export-transition.mp4",
			},
			timeline: transitionTimeline,
			mediaFiles: transitionMediaFiles,
		});
		await vi.waitFor(() => {
			expect(getExportJobStatus(result.jobId)?.status).toBe("completed");
		});
		const ffmpegArgs = mockSpawn.mock.calls.map((call) =>
			(call[1] as string[]).join(" ")
		);
		expect(
			ffmpegArgs.some((args) => args.includes("xfade=transition=custom"))
		).toBe(true);
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
				// Source length: the filter graph subtracts the trims itself, so a
				// 3s-on-screen clip trimmed by 0.5s + 0.25s spans 3.75s of source.
				duration: 3.75,
				trimStart: 0.5,
				trimEnd: 0.25,
				volume: 0.8,
				fadeIn: 0.2,
				fadeOut: 0.3,
			}),
		]);
	});

	it("keeps heavily trimmed audio clips audible", async () => {
		// A 164s music bed trimmed down to its first 48.4s used to arrive as
		// duration 48.4 with trimEnd 115.6; the graph then subtracted the trim a
		// second time and collapsed the clip to a 0.01s blip of silence.
		const audioFiles = await collectTimelineAudioFiles({
			projectId: "project_music_bed",
			timeline: {
				...testTimeline,
				tracks: [
					...testTimeline.tracks,
					{
						id: "music-track",
						index: 1,
						name: "Music",
						type: "audio",
						elements: [
							{
								id: "music-bed",
								trackIndex: 1,
								startTime: 0,
								endTime: 48.4,
								duration: 48.4,
								type: "audio" as const,
								sourceId: "music-media",
								trimStart: 0,
								trimEnd: 115.6,
							},
						],
					},
				],
			},
			mediaFiles: [
				...testMediaFiles,
				{
					id: "music-media",
					name: "music.mp3",
					type: "audio" as const,
					path: "/tmp/music.mp3",
					size: 4096,
					duration: 164,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				},
			],
		});

		expect(audioFiles).toHaveLength(1);
		const [music] = audioFiles;
		expect(music.duration).toBe(164);
		// What the filter graph will actually play.
		expect(music.duration - music.trimStart - music.trimEnd).toBeCloseTo(48.4);
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
