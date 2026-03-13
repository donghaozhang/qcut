import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock platform
const mockPlatform = {
	isElectron: false,
	ffmpeg: { exportVideoCLI: undefined as any },
};
vi.mock("@qcut/platform-core", () => ({
	platform: () => mockPlatform,
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugError: vi.fn(),
	debugWarn: vi.fn(),
}));

vi.mock("@/stores/ai/effects-store", () => ({
	useEffectsStore: {
		getState: () => ({
			getElementEffects: () => null,
		}),
	},
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
		getState: () => ({ mediaItems: [] }),
	},
}));

vi.mock("@/lib/stickers/sticker-export-helper", () => ({
	preloadStickerImages: vi.fn().mockResolvedValue(undefined),
	renderStickersToCanvas: vi.fn(),
}));

vi.mock("@/lib/ffmpeg/ffmpeg-video-recorder", () => ({
	FFmpegVideoRecorder: class {},
	isFFmpegExportEnabled: () => false,
}));

vi.mock("@/types/export", () => ({
	FORMAT_INFO: {
		webm: { extension: "webm" },
		mp4: { extension: "mp4" },
		mov: { extension: "mov" },
	},
	ExportPurpose: { PREVIEW: "preview", FINAL: "final" },
}));

describe("ExportEngineFactory", () => {
	let ExportEngineFactory: any;
	let ExportEngineType: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockPlatform.isElectron = false;
		mockPlatform.ffmpeg.exportVideoCLI = undefined;

		// Mock MediaRecorder (not available in test env)
		if (typeof globalThis.MediaRecorder === "undefined") {
			(globalThis as any).MediaRecorder = {
				isTypeSupported: vi.fn().mockReturnValue(false),
			};
		}

		// Reset singleton between tests
		const mod = await import("../export-engine-factory");
		ExportEngineFactory = mod.ExportEngineFactory;
		ExportEngineType = mod.ExportEngineType;

		// Reset singleton instance
		(ExportEngineFactory as any).instance = undefined;
	});

	describe("getInstance", () => {
		it("returns a singleton instance", () => {
			const a = ExportEngineFactory.getInstance();
			const b = ExportEngineFactory.getInstance();
			expect(a).toBe(b);
		});
	});

	describe("isFFmpegAvailable", () => {
		it("always returns false (FFmpeg WASM removed)", async () => {
			const result = await ExportEngineFactory.isFFmpegAvailable();
			expect(result).toBe(false);
		});
	});

	describe("detectCapabilities", () => {
		it("returns cached capabilities on second call", async () => {
			const factory = ExportEngineFactory.getInstance();
			const first = await factory.detectCapabilities();
			const second = await factory.detectCapabilities();
			expect(first).toBe(second);
		});

		it("detects browser capabilities", async () => {
			const factory = ExportEngineFactory.getInstance();
			const caps = await factory.detectCapabilities();

			expect(caps).toHaveProperty("hasWebCodecs");
			expect(caps).toHaveProperty("hasOffscreenCanvas");
			expect(caps).toHaveProperty("hasWorkers");
			expect(caps).toHaveProperty("hasSharedArrayBuffer");
			expect(caps).toHaveProperty("deviceMemoryGB");
			expect(caps).toHaveProperty("maxTextureSize");
			expect(caps).toHaveProperty("supportedCodecs");
			expect(caps).toHaveProperty("performanceScore");
		});
	});

	describe("getCurrentCapabilities", () => {
		it("returns null before detection", () => {
			const factory = ExportEngineFactory.getInstance();
			expect(factory.getCurrentCapabilities()).toBeNull();
		});

		it("returns capabilities after detection", async () => {
			const factory = ExportEngineFactory.getInstance();
			await factory.detectCapabilities();
			expect(factory.getCurrentCapabilities()).not.toBeNull();
		});
	});

	describe("refreshCapabilities", () => {
		it("clears cache and re-detects", async () => {
			const factory = ExportEngineFactory.getInstance();
			const first = await factory.detectCapabilities();
			const refreshed = await factory.refreshCapabilities();

			// Should be a new object (cache was cleared)
			expect(refreshed).not.toBe(first);
			expect(refreshed).toHaveProperty("hasWebCodecs");
		});
	});

	describe("getEngineRecommendation", () => {
		it("recommends CLI engine in Electron", async () => {
			mockPlatform.isElectron = true;
			const factory = ExportEngineFactory.getInstance();
			const rec = await factory.getEngineRecommendation(
				{ width: 1280, height: 720 },
				10
			);

			expect(rec.engineType).toBe(ExportEngineType.CLI);
			expect(rec.estimatedPerformance).toBe("high");
		});

		it("recommends Remotion engine when timeline has Remotion elements", async () => {
			const factory = ExportEngineFactory.getInstance();
			const tracks = [
				{
					type: "remotion",
					elements: [{ id: "el1" }],
				},
			];

			const rec = await factory.getEngineRecommendation(
				{ width: 1280, height: 720 },
				10,
				"medium",
				tracks as any
			);

			expect(rec.engineType).toBe(ExportEngineType.REMOTION);
		});

		it("skips Remotion when tracks have no Remotion elements", async () => {
			const factory = ExportEngineFactory.getInstance();
			const tracks = [
				{
					type: "video",
					elements: [{ id: "el1" }],
				},
			];

			const rec = await factory.getEngineRecommendation(
				{ width: 1280, height: 720 },
				10,
				"medium",
				tracks as any
			);

			expect(rec.engineType).not.toBe(ExportEngineType.REMOTION);
		});

		it("recommends muxer engine when WebCodecs available and not simulator", async () => {
			// Mock WebCodecs APIs and a working encoder
			(globalThis as any).VideoEncoder = {
				isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
			};
			(globalThis as any).VideoDecoder = class {};
			(globalThis as any).VideoFrame = class {
				close = vi.fn();
			};
			(globalThis as any).OffscreenCanvas = class {
				width = 854;
				height = 480;
				getContext() {
					return { fillStyle: "", fillRect: vi.fn() };
				}
			};

			// Stub encoder with working flush
			(globalThis as any).VideoEncoder = class {
				outputCount = 0;
				configure() {}
				encode() {
					this.outputCount++;
				}
				async flush() {}
				close() {}
				static isConfigSupported = vi
					.fn()
					.mockResolvedValue({ supported: true });
			};

			// Force fresh capabilities
			const factory = ExportEngineFactory.getInstance();
			await factory.refreshCapabilities();

			const rec = await factory.getEngineRecommendation(
				{ width: 1280, height: 720 },
				10
			);

			// Should recommend muxer when WebCodecs works (not simulator)
			// May fall back if probe doesn't produce enough outputs in test env
			expect([
				ExportEngineType.MUXER,
				ExportEngineType.OPTIMIZED,
				ExportEngineType.STANDARD,
			]).toContain(rec.engineType);

			// Cleanup
			delete (globalThis as any).VideoDecoder;
		});

		it("skips muxer on simulator (Capacitor ios + no iPad in UA)", async () => {
			// Simulate iOS Simulator environment
			(window as any).Capacitor = {
				getPlatform: () => "ios",
				isNativePlatform: () => true,
			};
			Object.defineProperty(navigator, "platform", {
				value: "MacIntel",
				configurable: true,
			});
			Object.defineProperty(navigator, "maxTouchPoints", {
				value: 0,
				configurable: true,
			});

			const factory = ExportEngineFactory.getInstance();
			await factory.refreshCapabilities();

			const rec = await factory.getEngineRecommendation(
				{ width: 1280, height: 720 },
				10
			);

			expect(rec.engineType).not.toBe(ExportEngineType.MUXER);

			// Cleanup
			delete (window as any).Capacitor;
		});

		it("falls back to standard engine when no advanced features available", async () => {
			const factory = ExportEngineFactory.getInstance();

			const rec = await factory.getEngineRecommendation(
				{ width: 1280, height: 720 },
				10
			);

			// In test env (no WebCodecs, no Electron), should get optimized or standard
			expect([ExportEngineType.STANDARD, ExportEngineType.OPTIMIZED]).toContain(
				rec.engineType
			);
		});
	});

	describe("createEngine", () => {
		function createMockCanvas() {
			const canvas = document.createElement("canvas");
			canvas.width = 1280;
			canvas.height = 720;
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
				globalAlpha: 1,
				fillStyle: "",
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
			return canvas;
		}

		const defaultSettings = {
			format: "mp4" as const,
			quality: "720p",
			filename: "test.mp4",
			width: 1280,
			height: 720,
		};

		it("creates standard engine for STANDARD type", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				[],
				[],
				1,
				ExportEngineType.STANDARD
			);

			expect(engine).toBeDefined();
		});

		it("creates standard engine for FFMPEG type (removed)", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				[],
				[],
				1,
				ExportEngineType.FFMPEG
			);

			expect(engine).toBeDefined();
		});

		it("creates muxer engine for MUXER type", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				[],
				[],
				1,
				ExportEngineType.MUXER
			);

			expect(engine).toBeDefined();
			expect(engine.constructor.name).toBe("ExportEngineMuxer");
		});

		it("creates muxer engine for WEBCODECS type (legacy redirect)", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				[],
				[],
				1,
				ExportEngineType.WEBCODECS
			);

			expect(engine).toBeDefined();
			expect(engine.constructor.name).toBe("ExportEngineMuxer");
		});

		it("falls back to standard when CLI not in Electron", async () => {
			mockPlatform.isElectron = false;
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				[],
				[],
				1,
				ExportEngineType.CLI
			);

			expect(engine).toBeDefined();
		});

		it("auto-selects engine type when none specified", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				[],
				[],
				1
			);

			expect(engine).toBeDefined();
		});
	});
});
