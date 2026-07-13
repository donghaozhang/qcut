import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudTaskStore } from "@/stores/cloud-task-store";

const mocks = vi.hoisted(() => ({
	cancel: vi.fn(),
	generate: vi.fn(),
	insertAlignedGeneratedMediaToEditor: vi.fn(),
	syncProjectMediaIfNeeded: vi.fn(),
	mediaItems: [
		{
			id: "portrait",
			name: "Portrait.png",
			type: "image" as const,
			file: new File(["image"], "portrait.png"),
			localPath: "/project/portrait.png",
		},
		{
			id: "speech",
			name: "Speech.wav",
			type: "audio" as const,
			file: new File(["audio"], "speech.wav"),
			localPath: "/project/speech.wav",
		},
		{
			id: "avatar",
			name: "Avatar.mp4",
			type: "video" as const,
			file: new File(["video"], "avatar.mp4"),
			localPath: "/project/avatar.mp4",
		},
	],
}));

vi.mock("@/hooks/use-ai-pipeline", () => ({
	useAIPipeline: () => ({
		generate: mocks.generate,
		cancel: mocks.cancel,
		isAvailable: true,
		isGenerating: false,
		progress: null,
	}),
}));

vi.mock("@/lib/claude-bridge/claude-timeline-bridge-helpers", () => ({
	syncProjectMediaIfNeeded: mocks.syncProjectMediaIfNeeded,
}));

vi.mock("@/lib/timeline/aligned-generated-media", () => ({
	insertAlignedGeneratedMediaToEditor:
		mocks.insertAlignedGeneratedMediaToEditor,
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

import { useSpeechAvatarGeneration } from "../use-speech-avatar-generation";

describe("useSpeechAvatarGeneration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useCloudTaskStore.getState().resetTasks();
		mocks.generate
			.mockResolvedValueOnce({
				success: true,
				outputPath: "/project/speech.wav",
				cost: 0.01,
			})
			.mockResolvedValueOnce({
				success: true,
				outputPath: "/project/avatar.mp4",
				cost: 0.21,
			});
		mocks.insertAlignedGeneratedMediaToEditor.mockResolvedValue({
			groupId: "aligned-group",
		});
	});

	it("generates speech first, lip-syncs the avatar to it, and inserts one aligned pair", async () => {
		const { result } = renderHook(() =>
			useSpeechAvatarGeneration({
				captionElementId: "caption-1",
				text: "A line that must stay aligned",
				startTime: 7.25,
				duration: 2.8,
			})
		);

		act(() => result.current.setAvatarImageId("portrait"));
		await act(async () => {
			await result.current.createAlignedPair();
		});

		expect(mocks.generate).toHaveBeenCalledTimes(2);
		expect(mocks.generate.mock.calls[0]?.[0]).toMatchObject({
			command: "generate-speech",
			args: { model: "chatterbox_tts" },
		});
		expect(mocks.generate.mock.calls[1]?.[0]).toMatchObject({
			command: "generate-avatar",
			args: {
				model: "fabric_1_0",
				"image-url": "/project/portrait.png",
				"audio-url": "/project/speech.wav",
				duration: 2.8,
			},
		});
		expect(mocks.insertAlignedGeneratedMediaToEditor).toHaveBeenCalledWith({
			speechMedia: expect.objectContaining({ id: "speech" }),
			avatarMedia: expect.objectContaining({ id: "avatar" }),
			startTime: 7.25,
			duration: 2.8,
		});
		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			status: "completed",
			actualCostUsd: 0.22,
			output: {
				speechMediaId: "speech",
				avatarMediaId: "avatar",
				groupId: "aligned-group",
			},
		});
	});
});
