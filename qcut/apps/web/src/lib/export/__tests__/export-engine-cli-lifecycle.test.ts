import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
import type { ExportSettingsWithAudio } from "@/types/export";
import { ExportFormat, ExportQuality } from "@/types/export";

const platformMocks = vi.hoisted(() => ({
	exportVideoCLI: vi.fn(),
	overlayMediaIds: [] as string[],
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		ffmpeg: {
			exportVideoCLI: platformMocks.exportVideoCLI,
		},
	}),
}));

vi.mock("@/lib/ffmpeg/ffmpeg-video-recorder", () => ({
	FFmpegVideoRecorder: class {},
	isFFmpegExportEnabled: () => false,
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: () => ({
			getStickersForExport: () =>
				platformMocks.overlayMediaIds.map((mediaItemId, index) => ({
					id: `overlay-${index}`,
					mediaItemId,
				})),
		}),
	},
}));

import { CLIExportEngine } from "../export-engine-cli";

class InspectableCLIExportEngine extends CLIExportEngine {
	get lifecycle(): {
		isExporting: boolean;
		signal: AbortSignal | undefined;
	} {
		return {
			isExporting: this.isExporting,
			signal: this.abortController?.signal,
		};
	}
}

function createCanvas(): HTMLCanvasElement {
	const context = {
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "high",
	} as unknown as CanvasRenderingContext2D;
	return {
		width: 0,
		height: 0,
		getContext: () => context,
	} as unknown as HTMLCanvasElement;
}

function createSettings(): ExportSettingsWithAudio {
	return {
		format: ExportFormat.MP4,
		quality: ExportQuality.HIGH,
		filename: "output",
		width: 1920,
		height: 1080,
		frameRate: 30,
		includeAudio: false,
	};
}

describe("CLIExportEngine lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		platformMocks.overlayMediaIds = [];
	});

	it("keeps cancellation live, rejects re-entry, and resets state after settling", async () => {
		const engine = new InspectableCLIExportEngine(
			createCanvas(),
			createSettings(),
			[],
			[],
			1
		);
		Object.defineProperty(engine, "runExport", {
			configurable: true,
			value: () => {
				const signal = engine.lifecycle.signal;
				if (!signal) throw new Error("Missing CLI export abort signal");
				return new Promise<Blob>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(new Error("Export cancelled by user")),
						{ once: true }
					);
				});
			},
		});

		const firstExport = engine.export();
		expect(engine.lifecycle.isExporting).toBe(true);
		expect(engine.lifecycle.signal?.aborted).toBe(false);
		await expect(engine.export()).rejects.toThrow("Export already in progress");

		engine.cancel();
		expect(engine.lifecycle.signal?.aborted).toBe(true);
		expect(engine.lifecycle.isExporting).toBe(true);
		await expect(engine.export()).rejects.toThrow("Export already in progress");
		await expect(firstExport).rejects.toThrow("Export cancelled by user");

		expect(engine.lifecycle).toEqual({
			isExporting: false,
			signal: undefined,
		});
		Object.defineProperty(engine, "runExport", {
			configurable: true,
			value: async () => new Blob(),
		});
		await expect(engine.export()).resolves.toBeInstanceOf(Blob);
		expect(engine.lifecycle.isExporting).toBe(false);
	});

	it("rejects sticker runtime before invoking native FFmpeg", async () => {
		const stickerRuntime: StickerRuntimeDescriptor = {
			kind: "png-sequence",
			completion: "freeze-last",
			cycleDurationSeconds: 1,
			frames: [
				{
					durationSeconds: 1,
					source: "frame-1.png",
					startSeconds: 0,
				},
			],
			repeat: { kind: "infinite" },
		};
		const tracks: TimelineTrack[] = [
			{
				id: "runtime-track",
				name: "Runtime stickers",
				type: "sticker",
				elements: [
					{
						duration: 1,
						id: "runtime-sticker",
						mediaId: "runtime-media",
						name: "Runtime sticker",
						startTime: 0,
						stickerId: "runtime-sticker",
						stickerRuntime,
						trimEnd: 0,
						trimStart: 0,
						type: "sticker",
					},
				],
			},
		];
		const mediaItems: MediaItem[] = [
			{
				file: new File([], "runtime.png", { type: "image/png" }),
				id: "runtime-media",
				name: "runtime.png",
				type: "image",
			},
		];
		const engine = new CLIExportEngine(
			createCanvas(),
			createSettings(),
			tracks,
			mediaItems,
			1
		);

		await expect(engine.export()).rejects.toMatchObject({
			code: "QCUT_STICKER_RUNTIME_EXPORT_UNSUPPORTED",
			reason: "native-engine",
		});
		expect(platformMocks.exportVideoCLI).not.toHaveBeenCalled();
	});

	it("rejects overlay-only runtime before invoking native FFmpeg", async () => {
		platformMocks.overlayMediaIds = ["runtime-overlay-media"];
		const mediaItems: MediaItem[] = [
			{
				file: new File([], "runtime-overlay.gif", { type: "image/gif" }),
				id: "runtime-overlay-media",
				metadata: {
					stickerRuntime: {
						kind: "png-sequence",
						completion: "freeze-last",
						cycleDurationSeconds: 1,
						frames: [
							{
								durationSeconds: 1,
								source: "frame-1.png",
								startSeconds: 0,
							},
						],
						repeat: { kind: "infinite" },
					},
				},
				name: "runtime-overlay.gif",
				type: "image",
			},
		];
		const engine = new CLIExportEngine(
			createCanvas(),
			createSettings(),
			[],
			mediaItems,
			1
		);

		await expect(engine.export()).rejects.toMatchObject({
			code: "QCUT_STICKER_RUNTIME_EXPORT_UNSUPPORTED",
			reason: "native-engine",
		});
		expect(platformMocks.exportVideoCLI).not.toHaveBeenCalled();
	});
});
