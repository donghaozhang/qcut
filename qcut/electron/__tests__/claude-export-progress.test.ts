import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import * as path from "node:path";

const { mockSpawn, mockGetFFmpegPath, mockParseProgress, mockFsPromises } =
	vi.hoisted(() => {
		const mockGetFFmpegPath = vi.fn(() => "/mock/ffmpeg");
		const mockParseProgress = vi.fn(() => null);

		const mockFsPromises = {
			mkdir: vi.fn(async () => {}),
			mkdtemp: vi.fn(async () => "/tmp/qcut-claude-export-test"),
			writeFile: vi.fn(async () => {}),
			stat: vi.fn(async () => ({ size: 8192 })),
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

let spawnMode: "success" | "hang" | "fail" = "success";

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
	listExportJobs,
	applyProgressEvent,
	clearExportJobsForTests,
} from "../claude/handlers/claude-export-handler";

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
	closeCode,
}: {
	shouldClose: boolean;
	closeCode: number;
}): EventEmitter {
	const proc = new EventEmitter() as EventEmitter & {
		stderr: EventEmitter;
		stdout: EventEmitter;
	};
	proc.stderr = new EventEmitter();
	proc.stdout = new EventEmitter();

	if (shouldClose) {
		setTimeout(() => {
			proc.emit("close", closeCode);
		}, 0);
	}

	return proc;
}

describe("Claude export progress", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearExportJobsForTests();
		spawnMode = "success";
		mockGetFFmpegPath.mockImplementation(() => "/mock/ffmpeg");

		mockSpawn.mockImplementation(() => {
			if (spawnMode === "hang") {
				return createMockProcess({ shouldClose: false, closeCode: 0 });
			}
			if (spawnMode === "fail") {
				return createMockProcess({ shouldClose: true, closeCode: 1 });
			}
			return createMockProcess({ shouldClose: true, closeCode: 0 });
		});
	});

	it("returns current progress for active export", async () => {
		spawnMode = "hang";

		const { jobId } = await startExportJob({
			projectId: "project_progress_1",
			request: { preset: "youtube-1080p", outputPath: "/tmp/progress-1.mp4" },
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		applyProgressEvent({
			jobId,
			progress: 0.65,
			currentFrame: 1950,
			totalFrames: 3000,
			fps: 45.2,
			estimatedTimeRemaining: 23.5,
		});

		const job = getExportJobStatus(jobId);
		expect(job?.status).toBe("exporting");
		expect(job?.progress).toBeCloseTo(0.65, 2);
		expect(job?.currentFrame).toBe(1950);
	});

	it("returns completed status with output path", async () => {
		const { jobId } = await startExportJob({
			projectId: "project_progress_2",
			request: { preset: "youtube-1080p", outputPath: "/tmp/progress-2.mp4" },
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		await vi.waitFor(() => {
			const job = getExportJobStatus(jobId);
			expect(job?.status).toBe("completed");
		});

		const job = getExportJobStatus(jobId);
		expect(job?.progress).toBe(1);
		// The handler path.resolve()s outputPath, so match that on Windows too
		expect(job?.outputPath).toBe(path.resolve("/tmp/progress-2.mp4"));
	});

	it("returns failed status with error message", async () => {
		spawnMode = "fail";

		const { jobId } = await startExportJob({
			projectId: "project_progress_3",
			request: { preset: "youtube-1080p", outputPath: "/tmp/progress-3.mp4" },
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		await vi.waitFor(() => {
			const job = getExportJobStatus(jobId);
			expect(job?.status).toBe("failed");
		});

		const job = getExportJobStatus(jobId);
		expect(job?.error).toContain("FFmpeg failed");
	});

	it("returns null for unknown job ID", () => {
		const job = getExportJobStatus("missing-job");
		expect(job).toBeNull();
	});

	it("lists all recent export jobs", async () => {
		spawnMode = "hang";

		await startExportJob({
			projectId: "project_progress_4",
			request: { preset: "youtube-1080p", outputPath: "/tmp/progress-4.mp4" },
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		await startExportJob({
			projectId: "project_progress_5",
			request: { preset: "youtube-1080p", outputPath: "/tmp/progress-5.mp4" },
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		const jobs = listExportJobs();
		expect(jobs.length).toBeGreaterThanOrEqual(2);
		expect(jobs[0].startedAt).toBeGreaterThanOrEqual(jobs[1].startedAt);
	});

	it("updates progress from IPC events", async () => {
		spawnMode = "hang";

		const { jobId } = await startExportJob({
			projectId: "project_progress_6",
			request: { preset: "youtube-1080p", outputPath: "/tmp/progress-6.mp4" },
			timeline: testTimeline,
			mediaFiles: testMediaFiles,
		});

		applyProgressEvent({ jobId, progress: 0.1 });
		applyProgressEvent({ jobId, progress: 0.5 });
		applyProgressEvent({ jobId, progress: 0.9 });

		const job = getExportJobStatus(jobId);
		expect(job?.progress).toBeCloseTo(0.9, 2);
		expect(job?.status).toBe("exporting");
	});
});
