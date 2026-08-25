import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import type { ExportSettingsWithAudio } from "@/types/export";
import { ExportFormat, ExportQuality } from "@/types/export";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	exportVideoCLI: vi.fn(),
	loadMediaItem: vi.fn(),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		ffmpeg: { exportVideoCLI: mocks.exportVideoCLI },
		isElectron: true,
	}),
}));

vi.mock("@/lib/ffmpeg/ffmpeg-video-recorder", () => ({
	FFmpegVideoRecorder: class {},
	isFFmpegExportEnabled: () => false,
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({ activeProject: { id: "project-1" } }),
	},
}));

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: { loadMediaItem: mocks.loadMediaItem },
}));

import { CLIExportEngine } from "../export-engine-cli";

class InspectableCLIExportEngine extends CLIExportEngine {
	runHydratedAudioExportPath(): Promise<string> {
		return (
			this as unknown as { exportWithCLI: () => Promise<string> }
		).exportWithCLI();
	}
}

function createCanvas(): HTMLCanvasElement {
	const context = {
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "high",
	} as unknown as CanvasRenderingContext2D;
	return {
		getContext: () => context,
		height: 0,
		width: 0,
	} as unknown as HTMLCanvasElement;
}

function createSettings(): ExportSettingsWithAudio {
	return {
		filename: "output",
		format: ExportFormat.MP4,
		frameRate: 30,
		height: 1080,
		includeAudio: true,
		quality: ExportQuality.HIGH,
		width: 1920,
	};
}

function createDerivedAudioTrack(): TimelineTrack {
	return {
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
	};
}

describe("CLI video export restricted media hydration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loadMediaItem.mockResolvedValue({
			id: "restricted-derived-audio",
			localPath: "/tmp/restricted-derived.wav",
			metadata: { redistribution: "prohibited" },
			name: "restricted-derived.wav",
			type: "audio",
		});
	});

	it("rejects a restricted derived source hydrated from storage before FFmpeg", async () => {
		const mediaItems: MediaItem[] = [
			{
				file: new File([], "original.wav", { type: "audio/wav" }),
				id: "original-audio",
				localPath: "/tmp/original.wav",
				name: "original.wav",
				type: "audio",
			},
		];
		const engine = new InspectableCLIExportEngine(
			createCanvas(),
			createSettings(),
			[createDerivedAudioTrack()],
			mediaItems,
			5
		);

		await expect(engine.runHydratedAudioExportPath()).rejects.toMatchObject({
			code: "QCUT_RESTRICTED_MEDIA_EXPORT",
		});
		expect(mocks.loadMediaItem).toHaveBeenCalledWith(
			"project-1",
			"restricted-derived-audio"
		);
		expect(mocks.exportVideoCLI).not.toHaveBeenCalled();
	});
});
