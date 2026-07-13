import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { useVideoEditProcessing } from "../use-video-edit-processing";

const { addMediaItem, uploadVideo, generateKlingAudio } = vi.hoisted(() => ({
	addMediaItem: vi.fn(async () => "generated-audio"),
	uploadVideo: vi.fn(async () => "https://cdn.example/source.mp4"),
	generateKlingAudio: vi.fn(async () => ({
		modelId: "kling-video-to-audio",
		videoUrl: "https://cdn.example/result.mp4",
		audioUrl: "https://cdn.example/result.mp3",
		jobId: "job-1",
		duration: 5,
		cost: 0.035,
	})),
}));

vi.mock("@/hooks/media/use-async-media-store", () => ({
	useAsyncMediaStoreActions: () => ({
		addMediaItem,
		loading: false,
		error: null,
	}),
}));

vi.mock("@/lib/ai-clients/video-edit-client", () => ({
	videoEditClient: {
		uploadVideo,
		generateKlingAudio,
		generateMMAudio: vi.fn(),
		upscaleTopaz: vi.fn(),
	},
}));

const project: TProject = {
	id: "project-1",
	name: "Test",
	thumbnail: "",
	createdAt: new Date(),
	updatedAt: new Date(),
	scenes: [],
	currentSceneId: "scene-1",
	canvasSize: { width: 1920, height: 1080 },
	canvasMode: "preset",
};

describe("useVideoEditProcessing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useCloudTaskStore.getState().resetTasks();
		vi.spyOn(globalThis, "fetch").mockResolvedValue({
			ok: true,
			blob: async () => new Blob(["audio"], { type: "audio/mpeg" }),
		} as Response);
	});

	it("persists AI audio generation and imports an audio asset", async () => {
		const sourceVideo = new File(["video"], "clip.mp4", {
			type: "video/mp4",
		});
		const { result } = renderHook(() =>
			useVideoEditProcessing({
				sourceVideo,
				activeTab: "audio-gen",
				activeProject: project,
			})
		);

		await act(async () => {
			await result.current.handleProcess({
				sound_effect_prompt: "footsteps",
			});
		});

		await waitFor(() => expect(result.current.isProcessing).toBe(false));
		expect(uploadVideo).toHaveBeenCalledWith(sourceVideo);
		expect(generateKlingAudio).toHaveBeenCalledWith({
			video_url: "https://cdn.example/source.mp4",
			sound_effect_prompt: "footsteps",
		});
		expect(addMediaItem).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({
				type: "audio",
				url: "https://cdn.example/result.mp3",
			})
		);
		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			kind: "audio-generation",
			status: "completed",
			progress: 100,
			actualCostUsd: 0.035,
			output: { mediaId: "generated-audio" },
		});
	});
});
