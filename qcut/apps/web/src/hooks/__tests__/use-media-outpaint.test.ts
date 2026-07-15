import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudTaskStore } from "@/stores/cloud-task-store";

const mocks = vi.hoisted(() => ({
	cancel: vi.fn(),
	cleanupExportSession: vi.fn(),
	createExportSession: vi.fn(),
	exportVideoCLI: vi.fn(),
	generate: vi.fn(),
	pipelineOnProgress: undefined as
		| ((progress: { percent: number; message: string }) => void)
		| undefined,
	resolveGeneratedMedia: vi.fn(),
	saveImmediate: vi.fn(),
	selectElement: vi.fn(),
	updateMediaElement: vi.fn(),
	mediaItems: [] as Array<{
		id: string;
		name: string;
		type: "video";
		file: File;
		localPath: string;
		width?: number;
		height?: number;
		fps?: number;
	}>,
	sourceElement: {
		id: "clip-1",
		type: "media" as const,
		mediaId: "source-media",
		name: "Source clip",
		duration: 12,
		startTime: 4,
		trimStart: 2,
		trimEnd: 3,
	},
	timelineState: {
		_tracks: [] as Array<{
			id: string;
			elements: Array<Record<string, unknown>>;
		}>,
		updateMediaElement: vi.fn(),
		saveImmediate: vi.fn(),
		selectElement: vi.fn(),
	},
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		video: {
			saveTemp: vi.fn().mockResolvedValue("/tmp/source.mp4"),
		},
		ffmpeg: {
			createExportSession: mocks.createExportSession,
			exportVideoCLI: mocks.exportVideoCLI,
			cleanupExportSession: mocks.cleanupExportSession,
		},
	}),
}));

vi.mock("@/hooks/use-ai-pipeline", () => ({
	useAIPipeline: (options: {
		onProgress?: (progress: { percent: number; message: string }) => void;
	}) => {
		mocks.pipelineOnProgress = options.onProgress;
		return {
			generate: mocks.generate,
			cancel: mocks.cancel,
			isAvailable: true,
			isChecked: true,
			isGenerating: false,
		};
	},
}));

vi.mock("@/lib/ai-video/generated-media", () => ({
	resolveGeneratedMedia: mocks.resolveGeneratedMedia,
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: Object.assign(
		(selector: (state: { mediaItems: typeof mocks.mediaItems }) => unknown) =>
			selector({ mediaItems: mocks.mediaItems }),
		{ getState: () => ({ mediaItems: mocks.mediaItems }) }
	),
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: (
		selector: (state: { activeProject: { id: string } }) => unknown
	) => selector({ activeProject: { id: "project-1" } }),
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => mocks.timelineState,
	},
}));

import { useMediaOutpaint } from "../use-media-outpaint";

const REQUEST = {
	prompt: "extend the walls and floor",
	aspectRatio: "16:9" as const,
	resolution: "720p" as const,
};

describe("useMediaOutpaint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useCloudTaskStore.getState().resetTasks();
		Object.assign(mocks.sourceElement, {
			mediaId: "source-media",
			name: "Source clip",
			duration: 12,
			trimStart: 2,
			trimEnd: 3,
		});
		mocks.mediaItems.splice(0, mocks.mediaItems.length, {
			id: "source-media",
			name: "source.mp4",
			type: "video",
			file: new File(["source"], "source.mp4", { type: "video/mp4" }),
			localPath: "/project/source.mp4",
			width: 1920,
			height: 1080,
			fps: 30,
		});
		mocks.timelineState._tracks = [
			{ id: "track-1", elements: [mocks.sourceElement] },
		];
		mocks.timelineState.updateMediaElement = mocks.updateMediaElement;
		mocks.timelineState.saveImmediate = mocks.saveImmediate;
		mocks.timelineState.selectElement = mocks.selectElement;
		mocks.updateMediaElement.mockImplementation(
			(
				_trackId: string,
				_elementId: string,
				updates: Record<string, unknown>
			) => Object.assign(mocks.sourceElement, updates)
		);
		mocks.saveImmediate.mockResolvedValue(undefined);
		mocks.createExportSession.mockResolvedValue({
			sessionId: "export-session",
			framesDir: "/tmp/frames",
		});
		mocks.exportVideoCLI.mockResolvedValue({
			success: true,
			outputFile: "/tmp/export-session/output.mp4",
		});
		mocks.cleanupExportSession.mockResolvedValue(true);
		mocks.generate.mockResolvedValue({
			success: true,
			mediaId: "generated-media",
			importedPath: "/project/generated.mp4",
			cost: 0.42,
		});
		mocks.resolveGeneratedMedia.mockResolvedValue({
			id: "generated-media",
			name: "generated.mp4",
			type: "video",
			file: new File(["generated"], "generated.mp4", {
				type: "video/mp4",
			}),
			localPath: "/project/generated.mp4",
		});
	});

	it("prepares the selected range, generates, and backfills the same clip", async () => {
		const { result } = renderHook(() =>
			useMediaOutpaint({
				element: mocks.sourceElement,
				trackId: "track-1",
				fps: 30,
			})
		);

		let succeeded = false;
		await act(async () => {
			succeeded = await result.current.runOutpaint({ request: REQUEST });
		});

		expect(succeeded).toBe(true);
		expect(mocks.exportVideoCLI).toHaveBeenCalledWith(
			expect.objectContaining({
				videoInputPath: "/project/source.mp4",
				trimStart: 2,
				duration: 7,
				useVideoInput: true,
				useDirectCopy: false,
			})
		);
		expect(mocks.generate).toHaveBeenCalledWith(
			expect.objectContaining({
				command: "create-video",
				projectId: "project-1",
				autoImport: true,
				args: {
					model: "luma_ray_3_2_reframe",
					text: REQUEST.prompt,
					"video-url": "/tmp/export-session/output.mp4",
					"aspect-ratio": "16:9",
					resolution: "720p",
				},
			})
		);
		expect(mocks.updateMediaElement).toHaveBeenCalledWith("track-1", "clip-1", {
			mediaId: "generated-media",
			name: "generated.mp4",
			duration: 7,
			trimStart: 0,
			trimEnd: 0,
		});
		expect(mocks.saveImmediate).toHaveBeenCalledOnce();
		expect(mocks.cleanupExportSession).toHaveBeenCalledWith("export-session");
		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			label: "AI 扩图",
			status: "completed",
			actualCostUsd: 0.42,
			output: {
				generatedMediaId: "generated-media",
				applied: true,
			},
		});
	});

	it("keeps the original clip when generation fails and persists retry data", async () => {
		mocks.generate.mockResolvedValue({
			success: false,
			error: "provider unavailable",
		});
		const { result } = renderHook(() =>
			useMediaOutpaint({
				element: mocks.sourceElement,
				trackId: "track-1",
				fps: 30,
			})
		);

		await act(async () => {
			await result.current.runOutpaint({ request: REQUEST });
		});

		expect(mocks.updateMediaElement).not.toHaveBeenCalled();
		expect(mocks.cleanupExportSession).toHaveBeenCalledWith("export-session");
		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			status: "failed",
			error: "provider unavailable",
			payload: {
				operation: "media-outpaint",
				targetElementId: "clip-1",
				sourceMediaId: "source-media",
				prompt: REQUEST.prompt,
				aspectRatio: "16:9",
				resolution: "720p",
			},
		});
	});

	it("keeps a generated result in the library when the clip changes during generation", async () => {
		mocks.generate.mockImplementation(async () => {
			mocks.sourceElement.trimStart = 3;
			return {
				success: true,
				mediaId: "generated-media",
				importedPath: "/project/generated.mp4",
				cost: 0.42,
			};
		});
		const { result } = renderHook(() =>
			useMediaOutpaint({
				element: mocks.sourceElement,
				trackId: "track-1",
				fps: 30,
			})
		);

		let succeeded = false;
		await act(async () => {
			succeeded = await result.current.runOutpaint({ request: REQUEST });
		});

		expect(succeeded).toBe(true);
		expect(mocks.updateMediaElement).not.toHaveBeenCalled();
		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			status: "completed",
			output: {
				generatedMediaId: "generated-media",
				applied: false,
			},
		});
	});

	it("does not turn a successful task into a failure when temp cleanup fails", async () => {
		mocks.cleanupExportSession.mockRejectedValueOnce(
			new Error("temporary directory is busy")
		);
		const { result } = renderHook(() =>
			useMediaOutpaint({
				element: mocks.sourceElement,
				trackId: "track-1",
				fps: 30,
			})
		);

		let succeeded = false;
		await act(async () => {
			succeeded = await result.current.runOutpaint({ request: REQUEST });
		});

		expect(succeeded).toBe(true);
		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			status: "completed",
			output: { applied: true },
		});
	});
});
