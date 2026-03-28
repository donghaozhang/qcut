/**
 * Remotion Export Engine Tests
 *
 * Tests for the Remotion-aware export engine.
 *
 * @module lib/remotion/__tests__/export-engine-remotion.test
 */

import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
	beforeAll,
} from "vitest";
import {
	RemotionExportEngine,
	createRemotionExportEngine,
	requiresRemotionExport,
	DEFAULT_REMOTION_EXPORT_CONFIG,
	type RemotionExportProgress,
	type RemotionExportPhase,
} from "../export-engine-remotion";
import type { ExportSettings } from "@/types/export";
import type {
	TimelineTrack,
	RemotionElement,
	MediaElement,
} from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";

// Mock canvas for JSDOM environment
beforeAll(() => {
	HTMLCanvasElement.prototype.toDataURL = vi.fn(
		() => "data:image/png;base64,test"
	);
	HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
		callback(new Blob(["test"], { type: "image/png" }));
	});
	HTMLCanvasElement.prototype.captureStream = vi.fn(() => ({
		getVideoTracks: () => [{ requestFrame: vi.fn() }],
		id: "test-stream",
	})) as any;

	// Mock getContext to return a valid 2D context
	const originalGetContext = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = vi.fn(function (
		this: HTMLCanvasElement,
		contextId: string,
		options?: any
	) {
		if (contextId === "2d") {
			// Create a mock 2D context with essential methods
			return {
				canvas: this,
				clearRect: vi.fn(),
				fillRect: vi.fn(),
				drawImage: vi.fn(),
				save: vi.fn(),
				restore: vi.fn(),
				translate: vi.fn(),
				rotate: vi.fn(),
				scale: vi.fn(),
				getImageData: vi.fn(() => ({
					data: new Uint8ClampedArray(100 * 100 * 4),
					width: 100,
					height: 100,
				})),
				putImageData: vi.fn(),
				fillStyle: "",
				strokeStyle: "",
				globalAlpha: 1,
				globalCompositeOperation: "source-over",
				imageSmoothingEnabled: true,
				imageSmoothingQuality: "high",
				font: "",
				textAlign: "left",
				textBaseline: "top",
				fillText: vi.fn(),
				measureText: vi.fn(() => ({ width: 100 })),
			} as unknown as CanvasRenderingContext2D;
		}
		return (originalGetContext as (...args: unknown[]) => unknown).call(
			this,
			contextId,
			options
		);
	}) as any;
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockCanvas(): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = 1920;
	canvas.height = 1080;
	return canvas;
}

function createMockExportSettings(): ExportSettings {
	return {
		format: "mp4",
		quality: "1080p",
		width: 1920,
		height: 1080,
	} as ExportSettings;
}

function createMockRemotionElement(
	overrides: Partial<RemotionElement> = {}
): RemotionElement {
	return {
		id: `remotion-${Math.random().toString(36).slice(2, 9)}`,
		name: "Test Remotion Element",
		type: "remotion",
		componentId: "test-component",
		props: {},
		renderMode: "live",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function createMockMediaElement(
	overrides: Partial<MediaElement> = {}
): MediaElement {
	return {
		id: `media-${Math.random().toString(36).slice(2, 9)}`,
		name: "Test Media Element",
		type: "media",
		mediaId: "test-media-id",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function createMockTrack(
	elements: (RemotionElement | MediaElement)[],
	type: "media" | "remotion" = "media"
): TimelineTrack {
	return {
		id: `track-${Math.random().toString(36).slice(2, 9)}`,
		name: "Test Track",
		type,
		elements,
		muted: false,
	};
}

function createMockMediaItem(): MediaItem {
	return {
		id: "test-media-id",
		name: "Test Media",
		type: "video",
		file: new File([], "test.mp4"),
		url: "blob:test-video-url",
		duration: 10,
	};
}

// ============================================================================
// RemotionExportEngine Tests
// ============================================================================

describe("RemotionExportEngine", () => {
	let canvas: HTMLCanvasElement;
	let settings: ExportSettings;
	let mediaItems: MediaItem[];

	beforeEach(() => {
		canvas = createMockCanvas();
		settings = createMockExportSettings();
		mediaItems = [createMockMediaItem()];
	});

	describe("constructor", () => {
		it("should create engine with default config", () => {
			const tracks: TimelineTrack[] = [];
			const engine = new RemotionExportEngine(
				canvas,
				settings,
				tracks,
				mediaItems,
				10
			);

			expect(engine).toBeDefined();
			expect(engine.hasRemotionElements()).toBe(false);
		});

		it("should create engine with custom config", () => {
			const tracks: TimelineTrack[] = [];
			const engine = new RemotionExportEngine(
				canvas,
				settings,
				tracks,
				mediaItems,
				10,
				{ frameFormat: "png", frameQuality: 100 }
			);

			expect(engine).toBeDefined();
		});
	});

	describe("hasRemotionElements", () => {
		it("should return false when no Remotion elements", () => {
			const tracks = [createMockTrack([createMockMediaElement()])];
			const engine = new RemotionExportEngine(
				canvas,
				settings,
				tracks,
				mediaItems,
				10
			);

			expect(engine.hasRemotionElements()).toBe(false);
		});

		it("should return true when Remotion elements exist", () => {
			const tracks = [
				createMockTrack([createMockRemotionElement()], "remotion"),
			];
			const engine = new RemotionExportEngine(
				canvas,
				settings,
				tracks,
				mediaItems,
				10
			);

			expect(engine.hasRemotionElements()).toBe(true);
		});

		it("should detect Remotion elements in mixed tracks", () => {
			const tracks = [
				createMockTrack([createMockMediaElement()]),
				createMockTrack([createMockRemotionElement()], "remotion"),
			];
			const engine = new RemotionExportEngine(
				canvas,
				settings,
				tracks,
				mediaItems,
				10
			);

			expect(engine.hasRemotionElements()).toBe(true);
		});
	});

	describe("cancel", () => {
		it("should cancel export without errors", () => {
			const tracks = [
				createMockTrack([createMockRemotionElement()], "remotion"),
			];
			const engine = new RemotionExportEngine(
				canvas,
				settings,
				tracks,
				mediaItems,
				10
			);

			expect(() => engine.cancel()).not.toThrow();
		});
	});
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createRemotionExportEngine", () => {
	it("should create a RemotionExportEngine instance", () => {
		const canvas = createMockCanvas();
		const settings = createMockExportSettings();
		const tracks: TimelineTrack[] = [];
		const mediaItems = [createMockMediaItem()];

		const engine = createRemotionExportEngine(
			canvas,
			settings,
			tracks,
			mediaItems,
			10
		);

		expect(engine).toBeInstanceOf(RemotionExportEngine);
	});

	it("should pass custom config to engine", () => {
		const canvas = createMockCanvas();
		const settings = createMockExportSettings();
		const tracks: TimelineTrack[] = [];
		const mediaItems = [createMockMediaItem()];

		const engine = createRemotionExportEngine(
			canvas,
			settings,
			tracks,
			mediaItems,
			10,
			{ concurrency: 8, keepTempFiles: true }
		);

		expect(engine).toBeInstanceOf(RemotionExportEngine);
	});
});

// ============================================================================
// requiresRemotionExport Tests
// ============================================================================

describe("requiresRemotionExport", () => {
	it("should return false for empty tracks", () => {
		expect(requiresRemotionExport([])).toBe(false);
	});

	it("should return false for tracks with only media elements", () => {
		const tracks = [createMockTrack([createMockMediaElement()])];
		expect(requiresRemotionExport(tracks)).toBe(false);
	});

	it("should return true for tracks with Remotion elements", () => {
		const tracks = [createMockTrack([createMockRemotionElement()], "remotion")];
		expect(requiresRemotionExport(tracks)).toBe(true);
	});

	it("should return true for mixed tracks with at least one Remotion element", () => {
		const tracks = [
			createMockTrack([createMockMediaElement()]),
			createMockTrack([createMockMediaElement()]),
			createMockTrack([createMockRemotionElement()], "remotion"),
		];
		expect(requiresRemotionExport(tracks)).toBe(true);
	});

	it("should check all tracks", () => {
		const tracks = [
			createMockTrack([createMockMediaElement()]),
			createMockTrack([createMockMediaElement()]),
		];
		expect(requiresRemotionExport(tracks)).toBe(false);
	});
});

// ============================================================================
// DEFAULT_REMOTION_EXPORT_CONFIG Tests
// ============================================================================

describe("DEFAULT_REMOTION_EXPORT_CONFIG", () => {
	it("should have expected default values", () => {
		expect(DEFAULT_REMOTION_EXPORT_CONFIG.tempDir).toContain(
			"qcut-remotion-export"
		);
		expect(DEFAULT_REMOTION_EXPORT_CONFIG.frameFormat).toBe("jpeg");
		expect(DEFAULT_REMOTION_EXPORT_CONFIG.frameQuality).toBe(90);
		expect(DEFAULT_REMOTION_EXPORT_CONFIG.keepTempFiles).toBe(false);
		expect(DEFAULT_REMOTION_EXPORT_CONFIG.concurrency).toBe(4);
	});
});

// ============================================================================
// RemotionExportProgress Type Tests
// ============================================================================

describe("RemotionExportProgress type", () => {
	it("should allow valid phase values", () => {
		const phases: RemotionExportPhase[] = [
			"analyzing",
			"prerendering",
			"compositing",
			"encoding",
			"cleanup",
			"complete",
			"error",
		];

		for (const phase of phases) {
			const progress: RemotionExportProgress = {
				phase,
				overallProgress: 50,
				phaseProgress: 75,
				statusMessage: "Test message",
			};
			expect(progress.phase).toBe(phase);
		}
	});

	it("should allow optional fields", () => {
		const progress: RemotionExportProgress = {
			phase: "prerendering",
			overallProgress: 25,
			phaseProgress: 50,
			statusMessage: "Pre-rendering...",
			currentElement: "element-1",
			framesCompleted: 30,
			totalFrames: 90,
			estimatedTimeRemaining: 120,
		};

		expect(progress.currentElement).toBe("element-1");
		expect(progress.framesCompleted).toBe(30);
		expect(progress.totalFrames).toBe(90);
		expect(progress.estimatedTimeRemaining).toBe(120);
	});
});
