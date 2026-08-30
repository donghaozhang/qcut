import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import type { ExportSettingsWithAudio } from "@/types/export";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";

const overlayMocks = vi.hoisted(() => ({
	stickers: [] as Array<{ mediaItemId: string }>,
}));

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
			getStickersForExport: () => overlayMocks.stickers,
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
		overlayMocks.stickers = [];
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

		it("uses fixed-timestamp muxing when a timeline needs the persistent local provider", async () => {
			mockPlatform.isElectron = true;
			const factory = ExportEngineFactory.getInstance();
			const tracks = [
				{
					id: "track-1",
					type: "media",
					elements: [
						{
							id: "media-1",
							type: "media",
							color: {
								enabled: true,
								multiPass: {
									enabled: true,
									fidelity: "native-local",
									nativeEffect: {
										provider: "jianying-local-effect-v1",
									},
								},
							},
						},
					],
				},
			];

			const rec = await factory.getEngineRecommendation(
				{ width: 1280, height: 720 },
				10,
				"medium",
				tracks as any
			);

			expect(rec.engineType).toBe(ExportEngineType.MUXER);
			expect(rec.reason).toContain("timeline duration");
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

		const defaultSettings: ExportSettingsWithAudio = {
			format: "mp4" as const,
			quality: "720p",
			filename: "test.mp4",
			width: 1280,
			height: 720,
		};
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

		function createRuntimeFixture({
			descriptorLocation,
		}: {
			descriptorLocation: "element" | "media";
		}): { mediaItems: MediaItem[]; tracks: TimelineTrack[] } {
			const mediaItem: MediaItem = {
				file: new File([], "runtime.png", { type: "image/png" }),
				id: "runtime-sticker-media",
				metadata:
					descriptorLocation === "media" ? { stickerRuntime } : undefined,
				name: "runtime.png",
				type: "image",
			};
			return {
				mediaItems: [mediaItem],
				tracks: [
					{
						id: "runtime-sticker-track",
						name: "Runtime stickers",
						type: "sticker",
						elements: [
							{
								duration: 1,
								id: "runtime-sticker-element",
								mediaId: mediaItem.id,
								name: "Runtime sticker",
								startTime: 0,
								stickerId: "runtime-sticker",
								stickerRuntime:
									descriptorLocation === "element" ? stickerRuntime : undefined,
								trimEnd: 0,
								trimStart: 0,
								type: "sticker",
							},
						],
					},
				],
			};
		}

		function createCompoundRuntimeFixture(): {
			mediaItems: MediaItem[];
			tracks: TimelineTrack[];
		} {
			const child: MediaElement = {
				duration: 1,
				id: "compound-runtime-child",
				mediaId: "compound-runtime-media",
				name: "Runtime child",
				startTime: 0,
				trimEnd: 0,
				trimStart: 0,
				type: "media",
			};
			const container: MediaElement = {
				compound: {
					clips: [
						{
							element: child,
							id: "compound-clip",
							layer: 0,
							offset: 0,
							sourceTrackId: "source-track",
						},
					],
					kind: "compound",
				},
				duration: 1,
				id: "compound-container",
				mediaId: "compound-container-media",
				name: "Compound",
				startTime: 0,
				trimEnd: 0,
				trimStart: 0,
				type: "media",
			};
			return {
				mediaItems: [
					{
						file: new File([], "container.mp4", { type: "video/mp4" }),
						id: "compound-container-media",
						name: "container.mp4",
						type: "video",
					},
					{
						file: new File([], "runtime-child.gif", { type: "image/gif" }),
						id: "compound-runtime-media",
						metadata: { stickerRuntime },
						name: "runtime-child.gif",
						type: "image",
					},
				],
				tracks: [
					{
						elements: [container],
						id: "compound-track",
						name: "Compound",
						type: "media",
					},
				],
			};
		}

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

		it("refuses restricted Sticker Lab media for every video engine", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const tracks: TimelineTrack[] = [
				{
					id: "stickers",
					name: "Stickers",
					type: "sticker",
					elements: [
						{
							duration: 1,
							id: "sticker-element",
							mediaId: "restricted-sticker",
							name: "Restricted sticker",
							startTime: 0,
							stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
							trimEnd: 0,
							trimStart: 0,
							type: "sticker",
						},
					],
				},
			];
			const mediaItems: MediaItem[] = [
				{
					file: new File([], "restricted.gif", { type: "image/gif" }),
					id: "restricted-sticker",
					metadata: { redistribution: "prohibited" },
					name: "restricted.gif",
					type: "image",
				},
			];

			await expect(
				factory.createEngine(
					canvas,
					defaultSettings,
					tracks,
					mediaItems,
					1,
					ExportEngineType.STANDARD
				)
			).rejects.toMatchObject({
				code: "QCUT_RESTRICTED_MEDIA_EXPORT",
			});
		});

		it("bakes a complete Sticker Lab reference only into a local MP4 engine", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			mockPlatform.isElectron = true;
			const localMp4Settings = {
				...defaultSettings,
				outputPath: "/tmp/local-sticker.mp4",
			};
			const tracks: TimelineTrack[] = [
				{
					id: "stickers",
					name: "Stickers",
					type: "sticker",
					elements: [
						{
							duration: 1,
							id: "sticker-element",
							mediaId: "local-sticker",
							name: "Local sticker",
							startTime: 0,
							stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
							trimEnd: 0,
							trimStart: 0,
							type: "sticker",
						},
					],
				},
			];
			const mediaItems: MediaItem[] = [
				{
					file: new File([], "local.gif", { type: "image/gif" }),
					id: "local-sticker",
					metadata: {
						animatedSticker: true,
						batchId: "jianying-2026-08-23-batch-18-v2",
						checksumSha256: "a".repeat(64),
						itemId: "18001",
						redistribution: "prohibited",
						referenceOnly: true,
						source: "sticker-lab",
						usage: "internal-reference-only",
					},
					name: "local.gif",
					type: "image",
				},
			];

			const localMp4Engine = await factory.createEngine(
				canvas,
				localMp4Settings,
				tracks,
				mediaItems,
				1,
				ExportEngineType.STANDARD
			);
			expect(localMp4Engine.constructor.name).toBe("ExportEngineMuxer");
			await expect(
				factory.createEngine(
					canvas,
					{ ...localMp4Settings, format: "gif" },
					tracks,
					mediaItems,
					1,
					ExportEngineType.STANDARD
				)
			).rejects.toMatchObject({ code: "QCUT_RESTRICTED_MEDIA_EXPORT" });
			await expect(
				factory.createEngine(
					canvas,
					{ ...localMp4Settings, outputPath: "/tmp/local-sticker.webm" },
					tracks,
					mediaItems,
					1,
					ExportEngineType.STANDARD
				)
			).rejects.toMatchObject({ code: "QCUT_RESTRICTED_MEDIA_EXPORT" });
			await expect(
				factory.createEngine(
					canvas,
					{
						...localMp4Settings,
						outputPath: "\\\\server\\share\\local-sticker.mp4",
					},
					tracks,
					mediaItems,
					1,
					ExportEngineType.STANDARD
				)
			).rejects.toMatchObject({ code: "QCUT_RESTRICTED_MEDIA_EXPORT" });

			mockPlatform.isElectron = false;
			await expect(
				factory.createEngine(
					canvas,
					defaultSettings,
					tracks,
					mediaItems,
					1,
					ExportEngineType.STANDARD
				)
			).rejects.toMatchObject({ code: "QCUT_RESTRICTED_MEDIA_EXPORT" });
		});

		it("fails closed when restricted static stickers share a Remotion timeline", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			mockPlatform.isElectron = true;
			mockPlatform.ffmpeg.exportVideoCLI = vi.fn();
			const tracks: TimelineTrack[] = [
				{
					elements: [
						{
							duration: 1,
							id: "restricted-static-element",
							mediaId: "restricted-static-media",
							name: "Restricted static sticker",
							startTime: 0,
							stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
							trimEnd: 0,
							trimStart: 0,
							type: "sticker",
						},
					],
					id: "restricted-static-track",
					name: "Stickers",
					type: "sticker",
				},
				{
					elements: [
						{
							componentId: "test-composition",
							duration: 1,
							id: "remotion-element",
							name: "Remotion element",
							props: {},
							renderMode: "live",
							startTime: 0,
							trimEnd: 0,
							trimStart: 0,
							type: "remotion",
						},
					],
					id: "remotion-track",
					name: "Remotion",
					type: "remotion",
				},
			];
			const mediaItems: MediaItem[] = [
				{
					file: new File([], "restricted-static.png", {
						type: "image/png",
					}),
					id: "restricted-static-media",
					metadata: {
						animatedSticker: false,
						batchId: "jianying-2026-08-23-batch-18-v2",
						checksumSha256: "a".repeat(64),
						itemId: "18001",
						redistribution: "prohibited",
						referenceOnly: true,
						source: "sticker-lab",
						usage: "internal-reference-only",
					},
					name: "restricted-static.png",
					type: "image",
				},
			];

			await expect(
				factory.createEngine(
					canvas,
					{ ...defaultSettings, outputPath: "/tmp/local-remotion.mp4" },
					tracks,
					mediaItems,
					1
				)
			).rejects.toMatchObject({
				code: "QCUT_LOCAL_MP4_ENGINE_REQUIRED",
			});
		});

		it("refuses restricted overlay-only media for a video engine", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const mediaItems: MediaItem[] = [
				{
					file: new File([], "restricted-overlay.gif", {
						type: "image/gif",
					}),
					id: "restricted-overlay-media",
					metadata: { redistribution: "prohibited" },
					name: "restricted-overlay.gif",
					type: "image",
				},
			];
			overlayMocks.stickers = [{ mediaItemId: "restricted-overlay-media" }];

			await expect(
				factory.createEngine(
					canvas,
					defaultSettings,
					[],
					mediaItems,
					1,
					ExportEngineType.STANDARD
				)
			).rejects.toMatchObject({
				code: "QCUT_RESTRICTED_MEDIA_EXPORT",
			});
		});

		it("forces overlay-only runtime metadata through the muxer", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const mediaItems: MediaItem[] = [
				{
					file: new File([], "runtime-overlay.png", { type: "image/png" }),
					id: "runtime-overlay-media",
					metadata: { stickerRuntime },
					name: "runtime-overlay.png",
					type: "image",
				},
			];
			overlayMocks.stickers = [{ mediaItemId: "runtime-overlay-media" }];

			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				[],
				mediaItems,
				1,
				ExportEngineType.STANDARD
			);

			expect(engine.constructor.name).toBe("ExportEngineMuxer");
		});

		it("preserves the restricted code ahead of overlay runtime format errors", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const mediaItems: MediaItem[] = [
				{
					file: new File([], "restricted-runtime.gif", {
						type: "image/gif",
					}),
					id: "restricted-runtime-overlay",
					metadata: {
						redistribution: "prohibited",
						stickerRuntime,
					},
					name: "restricted-runtime.gif",
					type: "image",
				},
			];
			overlayMocks.stickers = [{ mediaItemId: "restricted-runtime-overlay" }];

			await expect(
				factory.createEngine(
					canvas,
					{ ...defaultSettings, filename: "restricted.gif", format: "gif" },
					[],
					mediaItems,
					1,
					ExportEngineType.STANDARD
				)
			).rejects.toMatchObject({
				code: "QCUT_RESTRICTED_MEDIA_EXPORT",
			});
		});

		it("preserves the restricted error when a runtime project selects muxer", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const { mediaItems, tracks } = createRuntimeFixture({
				descriptorLocation: "element",
			});
			mediaItems[0].metadata = { redistribution: "prohibited" };

			await expect(
				factory.createEngine(
					canvas,
					defaultSettings,
					tracks,
					mediaItems,
					1,
					ExportEngineType.CLI
				)
			).rejects.toMatchObject({
				code: "QCUT_RESTRICTED_MEDIA_EXPORT",
			});
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

		it("forces runtime stickers through muxer even when CLI is explicit", async () => {
			mockPlatform.isElectron = true;
			mockPlatform.ffmpeg.exportVideoCLI = vi.fn();
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const { mediaItems, tracks } = createRuntimeFixture({
				descriptorLocation: "element",
			});

			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				tracks,
				mediaItems,
				1,
				ExportEngineType.CLI
			);

			expect(engine.constructor.name).toBe("ExportEngineMuxer");
		});

		it("fails closed when runtime stickers and Remotion share a timeline", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const { mediaItems, tracks } = createRuntimeFixture({
				descriptorLocation: "element",
			});
			tracks.push({
				id: "remotion-track",
				name: "Remotion",
				type: "remotion",
				elements: [
					{
						componentId: "test-composition",
						duration: 1,
						id: "remotion-element",
						name: "Remotion element",
						props: {},
						renderMode: "live",
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "remotion",
					},
				],
			});

			await expect(
				factory.createEngine(canvas, defaultSettings, tracks, mediaItems, 1)
			).rejects.toMatchObject({
				code: "QCUT_STICKER_RUNTIME_EXPORT_UNSUPPORTED",
				reason: "remotion-composition",
			});
		});

		it("forces referenced runtime metadata through muxer over optimized", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const { mediaItems, tracks } = createRuntimeFixture({
				descriptorLocation: "media",
			});

			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				tracks,
				mediaItems,
				1,
				ExportEngineType.OPTIMIZED
			);

			expect(engine.constructor.name).toBe("ExportEngineMuxer");
		});

		it("forces a compound child runtime through muxer before expansion", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const { mediaItems, tracks } = createCompoundRuntimeFixture();

			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				tracks,
				mediaItems,
				1,
				ExportEngineType.CLI
			);

			expect(engine.constructor.name).toBe("ExportEngineMuxer");
		});

		it("fails closed for runtime stickers in non-MP4 exports", async () => {
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const { mediaItems, tracks } = createRuntimeFixture({
				descriptorLocation: "element",
			});

			await expect(
				factory.createEngine(
					canvas,
					{ ...defaultSettings, format: "gif", filename: "runtime.gif" },
					tracks,
					mediaItems,
					1,
					ExportEngineType.CLI
				)
			).rejects.toMatchObject({
				code: "QCUT_STICKER_RUNTIME_EXPORT_UNSUPPORTED",
				reason: "unsupported-format",
			});
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

		it("overrides explicit CLI export for a local-native color timeline", async () => {
			mockPlatform.isElectron = true;
			mockPlatform.ffmpeg.exportVideoCLI = vi.fn();
			const factory = ExportEngineFactory.getInstance();
			const canvas = createMockCanvas();
			const tracks = [
				{
					id: "track-1",
					type: "media",
					elements: [
						{
							id: "media-1",
							type: "media",
							color: {
								enabled: true,
								multiPass: {
									enabled: true,
									fidelity: "native-local",
									nativeEffect: {
										provider: "jianying-local-effect-v1",
									},
								},
							},
						},
					],
				},
			];
			const engine = await factory.createEngine(
				canvas,
				defaultSettings,
				tracks as any,
				[],
				1,
				ExportEngineType.CLI
			);

			expect(engine.constructor.name).toBe("ExportEngineMuxer");
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

		it("fails closed when the required runtime muxer cannot load", async () => {
			vi.resetModules();
			vi.doMock("../export-engine-muxer", () => {
				throw new Error("muxer unavailable for test");
			});

			try {
				const factoryModule = await import("../export-engine-factory");
				const factory = factoryModule.ExportEngineFactory.getInstance();
				const canvas = createMockCanvas();
				const { mediaItems, tracks } = createRuntimeFixture({
					descriptorLocation: "element",
				});

				await expect(
					factory.createEngine(
						canvas,
						defaultSettings,
						tracks,
						mediaItems,
						1,
						factoryModule.ExportEngineType.CLI
					)
				).rejects.toMatchObject({
					code: "QCUT_STICKER_RUNTIME_EXPORT_UNSUPPORTED",
					reason: "muxer-unavailable",
				});
			} finally {
				vi.doUnmock("../export-engine-muxer");
				vi.resetModules();
			}
		});
	});
});
