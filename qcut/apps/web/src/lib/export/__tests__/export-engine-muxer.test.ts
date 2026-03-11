import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock mediabunny before importing the engine
const mockAdd = vi.fn().mockResolvedValue(undefined);
const mockFinalize = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockAddVideoTrack = vi.fn();
const mockAddAudioTrack = vi.fn();
const mockCanvasSourceCtor = vi.fn();

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
	class MockCanvasSource {
		constructor(...args: any[]) {
			mockCanvasSourceCtor(...args);
		}
		add = mockAdd;
	}
	class MockAudioBufferSource {
		add = mockAdd;
	}
	return {
		Output: MockOutput,
		Mp4OutputFormat: MockMp4OutputFormat,
		BufferTarget: MockBufferTarget,
		CanvasSource: MockCanvasSource,
		AudioBufferSource: MockAudioBufferSource,
	};
});

// Mock export-engine dependencies
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

	// Override getContext to return our mock
	const origGetContext = canvas.getContext.bind(canvas);
	canvas.getContext = ((type: string, options?: any) => {
		if (type === "2d") return mockCtx;
		return origGetContext(type, options);
	}) as typeof canvas.getContext;

	return { canvas, mockCtx };
}

describe("ExportEngineMuxer", () => {
	let ExportEngineMuxer: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import("../export-engine-muxer");
		ExportEngineMuxer = mod.ExportEngineMuxer;
	});

	it("can be constructed with standard export engine arguments", () => {
		const { canvas } = createMockCanvas();
		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "720p",
				filename: "test.mp4",
				width: 1280,
				height: 720,
			},
			[],
			[],
			2
		);
		expect(engine).toBeDefined();
	});

	it("exports a Blob using mediabunny pipeline", async () => {
		const { canvas } = createMockCanvas();
		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "720p",
				filename: "test.mp4",
				width: 1280,
				height: 720,
			},
			[], // no tracks = no audio
			[],
			1 // 1 second = 30 frames
		);

		const progressUpdates: Array<{ progress: number; status: string }> = [];
		const blob = await engine.export((progress: number, status: string) => {
			progressUpdates.push({ progress, status });
		});

		// Should return a blob
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.type).toBe("video/mp4");

		// Should have called mediabunny Output.start and finalize
		expect(mockStart).toHaveBeenCalledOnce();
		expect(mockFinalize).toHaveBeenCalledOnce();

		// Should have added a video track
		expect(mockAddVideoTrack).toHaveBeenCalledOnce();

		// Should NOT have added audio track (no tracks with audio)
		expect(mockAddAudioTrack).not.toHaveBeenCalled();

		// Should have progress updates including completion
		expect(progressUpdates.length).toBeGreaterThan(0);
		const lastUpdate = progressUpdates[progressUpdates.length - 1];
		expect(lastUpdate.progress).toBe(100);
	});

	it("throws when export is already in progress", async () => {
		const { canvas } = createMockCanvas();
		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "720p",
				filename: "test.mp4",
				width: 1280,
				height: 720,
			},
			[],
			[],
			0.1
		);

		// Start first export (don't await)
		const first = engine.export();

		// Second export should throw
		await expect(engine.export()).rejects.toThrow("Export already in progress");

		// Clean up first export
		await first;
	});

	it("uses correct bitrate for quality preset", async () => {
		const { canvas } = createMockCanvas(1920, 1080);

		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "1080p",
				filename: "test.mp4",
				width: 1920,
				height: 1080,
			},
			[],
			[],
			0.1
		);

		await engine.export();

		// CanvasSource constructor should have been called with 8 Mbps for 1080p
		expect(mockCanvasSourceCtor).toHaveBeenCalledWith(
			canvas,
			expect.objectContaining({
				codec: "avc",
				bitrate: 8_000_000,
			})
		);
	});

	it("uses 480p bitrate for low quality preset", async () => {
		const { canvas } = createMockCanvas(854, 480);

		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "480p",
				filename: "test.mp4",
				width: 854,
				height: 480,
			},
			[],
			[],
			0.1
		);

		await engine.export();

		expect(mockCanvasSourceCtor).toHaveBeenCalledWith(
			canvas,
			expect.objectContaining({
				codec: "avc",
				bitrate: 2_500_000,
			})
		);
	});

	it("falls back to default bitrate for unknown quality", async () => {
		const { canvas } = createMockCanvas();

		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "4k" as any,
				filename: "test.mp4",
				width: 1280,
				height: 720,
			},
			[],
			[],
			0.1
		);

		await engine.export();

		// Unknown quality falls back to 5_000_000
		expect(mockCanvasSourceCtor).toHaveBeenCalledWith(
			canvas,
			expect.objectContaining({
				bitrate: 5_000_000,
			})
		);
	});

	it("can be cancelled during export", async () => {
		const { canvas } = createMockCanvas();
		// Make add() slow so we can cancel mid-export
		mockAdd.mockImplementation(
			() => new Promise((resolve) => setTimeout(resolve, 50))
		);

		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "720p",
				filename: "test.mp4",
				width: 1280,
				height: 720,
			},
			[],
			[],
			1 // 30 frames gives time to cancel
		);

		const exportPromise = engine.export();

		// Cancel after a short delay
		setTimeout(() => engine.cancel(), 10);

		await expect(exportPromise).rejects.toThrow("Export cancelled by user");

		// Reset mock
		mockAdd.mockResolvedValue(undefined);
	});

	it("re-throws non-cancellation errors", async () => {
		const { canvas } = createMockCanvas();
		mockStart.mockRejectedValueOnce(new Error("output start failed"));

		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "720p",
				filename: "test.mp4",
				width: 1280,
				height: 720,
			},
			[],
			[],
			0.1
		);

		await expect(engine.export()).rejects.toThrow("output start failed");
		// isExporting should be reset in finally block
	});

	it("resets isExporting after failure", async () => {
		const { canvas } = createMockCanvas();
		mockStart.mockRejectedValueOnce(new Error("fail"));

		const engine = new ExportEngineMuxer(
			canvas,
			{
				format: "mp4",
				quality: "720p",
				filename: "test.mp4",
				width: 1280,
				height: 720,
			},
			[],
			[],
			0.1
		);

		await expect(engine.export()).rejects.toThrow("fail");

		// Should be able to export again (isExporting was reset)
		mockStart.mockResolvedValue(undefined);
		const blob = await engine.export();
		expect(blob).toBeInstanceOf(Blob);
	});
});
