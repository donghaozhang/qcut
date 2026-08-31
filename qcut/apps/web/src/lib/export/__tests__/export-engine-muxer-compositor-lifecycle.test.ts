import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import type { ZoomRegion } from "@/lib/screen-recording/zoom-region-utils";

// Mock mediabunny before importing the engine (same shape as export-engine-muxer.test.ts)
const mockAdd = vi.fn().mockResolvedValue(undefined);
const mockFinalize = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockAddVideoTrack = vi.fn();
const mockAddAudioTrack = vi.fn();

vi.mock("mediabunny", () => {
	class MockOutput {
		start = mockStart;
		finalize = mockFinalize;
		addVideoTrack = mockAddVideoTrack;
		addAudioTrack = mockAddAudioTrack;
	}
	class MockMp4OutputFormat {}
	class MockBufferTarget {
		buffer = new ArrayBuffer(100);
	}
	class MockVideoSampleSource {
		add = mockAdd;
	}
	class MockVideoSample {
		close = vi.fn();
	}
	class MockAudioBufferSource {
		add = mockAdd;
	}
	return {
		Output: MockOutput,
		Mp4OutputFormat: MockMp4OutputFormat,
		BufferTarget: MockBufferTarget,
		VideoSampleSource: MockVideoSampleSource,
		VideoSample: MockVideoSample,
		AudioBufferSource: MockAudioBufferSource,
	};
});

vi.mock("../export-canvas-yuv", () => ({
	EXPORT_VIDEO_COLOR_SPACE: {
		primaries: "bt709",
		transfer: "bt709",
		matrix: "bt709",
		fullRange: false,
	},
	createCanvasYuvConverter: vi.fn(
		({ width, height }: { width: number; height: number }) => {
			const frame = () => ({
				data: new Uint8Array((width * height * 3) / 2),
				codedWidth: width,
				codedHeight: height,
			});
			return {
				kind: "cpu" as const,
				begin: vi.fn(),
				finish: frame,
				convert: frame,
				dispose: vi.fn(),
			};
		}
	),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({ isElectron: false }),
}));

vi.mock("@/lib/ffmpeg/ffmpeg-video-recorder", () => ({
	FFmpegVideoRecorder: class {},
	isFFmpegExportEnabled: () => false,
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugError: vi.fn(),
	debugWarn: vi.fn(),
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: () => ({
			getStickersForExport: () => [],
			getVisibleStickersAtTime: () => [],
		}),
	},
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: () => ({
			mediaItems: [],
		}),
	},
}));

vi.mock("@/stores/ai/effects-store", () => ({
	useEffectsStore: {
		getState: () => ({
			getElementEffects: () => null,
		}),
	},
}));

vi.mock("@/lib/stickers/sticker-export-helper", () => ({
	preloadStickerImages: vi.fn().mockResolvedValue(undefined),
	renderStickersToCanvas: vi.fn(),
}));

vi.mock("@/types/export", () => ({
	FORMAT_INFO: {
		webm: { extension: "webm" },
		mp4: { extension: "mp4" },
		mov: { extension: "mov" },
	},
	ExportPurpose: { PREVIEW: "preview", FINAL: "final" },
	shouldIncludeAudio: (settings: { includeAudio?: boolean }) =>
		settings.includeAudio ?? true,
}));

// Instrumented fake compositor: records every construction and destroy() call
// so tests can assert whether ExportEngineMuxer.export() creates a fresh
// compositor per export or silently reuses a stale one across exports.
const mockCompositorCtor = vi.fn();
const mockCompositorDestroy = vi.fn();
vi.mock("@/lib/screen-recording/export-compositor", () => ({
	ScreenRecordingExportCompositor: class {
		renderFrame = vi.fn();
		destroy = mockCompositorDestroy;
		constructor(config: unknown) {
			mockCompositorCtor(config);
		}
	},
}));

/** Create a mock canvas with a stubbed 2D context (JSDOM doesn't support canvas) */
function createMockCanvas(width = 1280, height = 720) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const mockCtx = {
		clearRect: vi.fn(),
		fillRect: vi.fn(),
		drawImage: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		scale: vi.fn(),
		translate: vi.fn(),
		rotate: vi.fn(),
		beginPath: vi.fn(),
		rect: vi.fn(),
		clip: vi.fn(),
		fillText: vi.fn(),
		measureText: vi.fn(() => ({ width: 0 })),
		getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
		putImageData: vi.fn(),
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "high",
		globalAlpha: 1,
		fillStyle: "",
		strokeStyle: "",
		font: "",
		textAlign: "left",
		textBaseline: "top",
		filter: "none",
	} as unknown as CanvasRenderingContext2D;

	const origGetContext = canvas.getContext.bind(canvas);
	canvas.getContext = ((type: string, options?: any) => {
		if (type === "2d") return mockCtx;
		return origGetContext(type, options);
	}) as typeof canvas.getContext;

	return { canvas, mockCtx };
}

function zoomRegion(id: string): ZoomRegion {
	return {
		id,
		startMs: 0,
		endMs: 3000,
		depth: 1.5,
		focus: { cx: 0.5, cy: 0.5 },
		auto: false,
	};
}

function baseSettings(filename: string) {
	return {
		format: "mp4" as const,
		quality: "720p" as const,
		filename,
		width: 1280,
		height: 720,
	};
}

describe("ExportEngineMuxer export compositor lifecycle", () => {
	let ExportEngineMuxer: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockAdd.mockResolvedValue(undefined);
		mockStart.mockResolvedValue(undefined);
		const mod = await import("../export-engine-muxer");
		ExportEngineMuxer = mod.ExportEngineMuxer;
		// Activate the screen-recording compositor for these tests only.
		useScreenRecordingEnhancementStore.setState({
			zoomRegions: [zoomRegion("a")],
		});
	});

	afterEach(async () => {
		// Leave the real, module-level singletons clean for other test files.
		useScreenRecordingEnhancementStore.setState({ zoomRegions: [] });
		const { destroyExportCompositor } = await import(
			"../export-engine-renderer"
		);
		destroyExportCompositor();
	});

	it("creates a fresh compositor for a second export instead of reusing a stale one", async () => {
		const { canvas: canvas1 } = createMockCanvas();
		const engine1 = new ExportEngineMuxer(
			canvas1,
			baseSettings("run1.mp4"),
			[],
			[],
			0.1
		);
		await engine1.export();

		expect(mockCompositorCtor).toHaveBeenCalledTimes(1);
		expect(mockCompositorCtor.mock.calls[0][0].zoomRegions[0].id).toBe("a");

		// A second, independent export runs after screen-recording settings changed —
		// simulates the user editing zoom regions between two muxer exports in the
		// same renderer session (no restart in between).
		useScreenRecordingEnhancementStore.setState({
			zoomRegions: [zoomRegion("b")],
		});
		const { canvas: canvas2 } = createMockCanvas();
		const engine2 = new ExportEngineMuxer(
			canvas2,
			baseSettings("run2.mp4"),
			[],
			[],
			0.1
		);
		await engine2.export();

		expect(mockCompositorCtor).toHaveBeenCalledTimes(2);
		expect(mockCompositorCtor.mock.calls[1][0].zoomRegions[0].id).toBe("b");
	});

	it("destroys the compositor after a successful export", async () => {
		const { canvas } = createMockCanvas();
		const engine = new ExportEngineMuxer(
			canvas,
			baseSettings("success.mp4"),
			[],
			[],
			0.1
		);
		await engine.export();

		expect(mockCompositorDestroy).toHaveBeenCalledTimes(1);
	});

	it("destroys the compositor after a cancelled export", async () => {
		mockAdd.mockImplementation(
			() => new Promise((resolve) => setTimeout(resolve, 50))
		);
		const { canvas } = createMockCanvas();
		const engine = new ExportEngineMuxer(
			canvas,
			baseSettings("cancel.mp4"),
			[],
			[],
			1
		);

		const exportPromise = engine.export();
		setTimeout(() => engine.cancel(), 10);
		await expect(exportPromise).rejects.toThrow("Export cancelled by user");

		expect(mockCompositorDestroy).toHaveBeenCalledTimes(1);
	});

	it("destroys the compositor after an export that throws mid-render", async () => {
		// Fail on the frame encode step (after at least one frame has been
		// rendered, so the compositor actually exists) rather than at
		// Output.start() — otherwise no compositor is ever created and the
		// assertion below would pass vacuously.
		mockAdd.mockRejectedValueOnce(new Error("encode failed"));
		const { canvas } = createMockCanvas();
		const engine = new ExportEngineMuxer(
			canvas,
			baseSettings("fail.mp4"),
			[],
			[],
			0.1
		);

		await expect(engine.export()).rejects.toThrow("encode failed");

		expect(mockCompositorCtor).toHaveBeenCalledTimes(1);
		expect(mockCompositorDestroy).toHaveBeenCalledTimes(1);
	});
});
