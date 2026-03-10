// Location: apps/web/src/lib/export/__tests__/remotion-export-wiring.test.ts
//
// Tests for Remotion export engine wiring (Task 1 of remotion-first-class-timeline-plan.md)
// Validates: requiresRemotionExport(), factory recommendation, renderer skip, engine branching

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";
import type {
	TimelineTrack,
	RemotionElement,
	MediaElement,
} from "@/types/timeline";

// Mock stores and debug utilities
vi.mock("@/stores/ai/effects-store", () => ({
	useEffectsStore: {
		getState: () => ({
			getElementEffects: () => [],
		}),
	},
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: () => ({
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

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugError: vi.fn(),
	debugWarn: vi.fn(),
}));

vi.mock("@/lib/stickers/sticker-export-helper", () => ({
	renderStickersToCanvas: vi.fn().mockResolvedValue({
		attempted: 0,
		successful: 0,
		failed: [],
	}),
}));

vi.mock("@/lib/markdown", () => ({
	stripMarkdownSyntax: vi.fn(({ markdown }: { markdown: string }) => markdown),
}));

vi.mock("@/config/features", () => ({
	EFFECTS_ENABLED: false,
}));

// Mock browser APIs not available in test environment
const g = globalThis as Record<string, unknown>;
if (typeof globalThis.MediaRecorder === "undefined") {
	g.MediaRecorder = { isTypeSupported: () => false };
}
if (typeof globalThis.VideoEncoder === "undefined") {
	g.VideoEncoder = undefined;
}
if (typeof globalThis.VideoDecoder === "undefined") {
	g.VideoDecoder = undefined;
}
if (typeof globalThis.VideoFrame === "undefined") {
	g.VideoFrame = undefined;
}
if (typeof globalThis.OffscreenCanvas === "undefined") {
	g.OffscreenCanvas = undefined;
}
if (typeof globalThis.SharedWorker === "undefined") {
	g.SharedWorker = undefined;
}

// --- Helpers ---

const createRemotionElement = (
	id: string,
	startTime: number,
	duration: number
): RemotionElement => ({
	id,
	type: "remotion",
	name: `Remotion ${id}`,
	componentId: "test-component",
	props: {},
	renderMode: "live",
	startTime,
	duration,
	trimStart: 0,
	trimEnd: 0,
});

const createMediaElement = (
	id: string,
	mediaId: string,
	startTime: number,
	duration: number
): MediaElement => ({
	id,
	type: "media",
	mediaId,
	name: `Media ${id}`,
	startTime,
	duration,
	trimStart: 0,
	trimEnd: 0,
});

const createRemotionTrack = (elements: RemotionElement[]): TimelineTrack => ({
	id: "remotion-track-1",
	name: "Remotion Track",
	type: "remotion",
	elements,
	muted: false,
});

const createMediaTrack = (elements: MediaElement[]): TimelineTrack => ({
	id: "media-track-1",
	name: "Media Track",
	type: "media",
	elements,
	muted: false,
});

// --- Platform Init ---

beforeAll(() => {
	initPlatform(createWebAdapter());
});

// --- Test Suite ---

describe("requiresRemotionExport", () => {
	it("returns true when tracks contain remotion elements", async () => {
		const { requiresRemotionExport } = await import(
			"@/lib/remotion/export-engine-remotion"
		);

		const tracks: TimelineTrack[] = [
			createMediaTrack([createMediaElement("m1", "media-1", 0, 5)]),
			createRemotionTrack([createRemotionElement("r1", 0, 10)]),
		];

		expect(requiresRemotionExport(tracks)).toBe(true);
	});

	it("returns false when no remotion elements exist", async () => {
		const { requiresRemotionExport } = await import(
			"@/lib/remotion/export-engine-remotion"
		);

		const tracks: TimelineTrack[] = [
			createMediaTrack([createMediaElement("m1", "media-1", 0, 5)]),
		];

		expect(requiresRemotionExport(tracks)).toBe(false);
	});

	it("returns false for empty tracks", async () => {
		const { requiresRemotionExport } = await import(
			"@/lib/remotion/export-engine-remotion"
		);

		const tracks: TimelineTrack[] = [];
		expect(requiresRemotionExport(tracks)).toBe(false);
	});

	it("returns false for remotion track with no elements", async () => {
		const { requiresRemotionExport } = await import(
			"@/lib/remotion/export-engine-remotion"
		);

		const tracks: TimelineTrack[] = [createRemotionTrack([])];
		expect(requiresRemotionExport(tracks)).toBe(false);
	});
});

describe("Export engine renderer - remotion element skip", () => {
	it("does not render remotion elements in standard canvas render", async () => {
		const { renderFrame } = await import("@/lib/export/export-engine-renderer");

		// Create mock canvas context (jsdom doesn't provide real 2d context)
		const mockCtx = {
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			fillStyle: "",
			fillText: vi.fn(),
			drawImage: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			beginPath: vi.fn(),
			rect: vi.fn(),
			clip: vi.fn(),
			translate: vi.fn(),
			rotate: vi.fn(),
			measureText: vi.fn(() => ({ width: 0 })),
			globalAlpha: 1,
			textAlign: "left",
			textBaseline: "top",
			font: "",
		} as unknown as CanvasRenderingContext2D;

		const canvas = { width: 1920, height: 1080 } as HTMLCanvasElement;

		const remotionEl = createRemotionElement("r1", 0, 10);
		const tracks: TimelineTrack[] = [createRemotionTrack([remotionEl])];

		const context = {
			ctx: mockCtx,
			canvas,
			tracks,
			mediaItems: [],
			videoCache: new Map(),
			usedImages: new Set<string>(),
			fps: 30,
		};

		// Should not throw — remotion elements are skipped
		await expect(renderFrame(context, 1)).resolves.toBeUndefined();

		// Verify canvas was cleared but no drawImage was called (remotion skipped)
		expect(mockCtx.clearRect).toHaveBeenCalled();
		expect(mockCtx.drawImage).not.toHaveBeenCalled();
	});
});

describe("Export engine factory - remotion auto-selection", () => {
	beforeEach(() => {
		// Reset singleton between tests
		vi.resetModules();
		initPlatform(createWebAdapter());
	});

	it("recommends REMOTION engine when tracks have remotion elements", async () => {
		const { ExportEngineFactory, ExportEngineType } = await import(
			"@/lib/export/export-engine-factory"
		);

		const factory = ExportEngineFactory.getInstance();

		const tracks: TimelineTrack[] = [
			createMediaTrack([createMediaElement("m1", "media-1", 0, 5)]),
			createRemotionTrack([createRemotionElement("r1", 0, 10)]),
		];

		const recommendation = await factory.getEngineRecommendation(
			{
				quality: "1080p",
				format: "mp4",
				width: 1920,
				height: 1080,
				filename: "test.mp4",
			},
			10,
			"medium",
			tracks
		);

		expect(recommendation.engineType).toBe(ExportEngineType.REMOTION);
		expect(recommendation.reason).toContain("Remotion");
	});

	it("does not recommend REMOTION when no remotion elements", async () => {
		const { ExportEngineFactory, ExportEngineType } = await import(
			"@/lib/export/export-engine-factory"
		);

		const factory = ExportEngineFactory.getInstance();

		const tracks: TimelineTrack[] = [
			createMediaTrack([createMediaElement("m1", "media-1", 0, 5)]),
		];

		const recommendation = await factory.getEngineRecommendation(
			{
				quality: "1080p",
				format: "mp4",
				width: 1920,
				height: 1080,
				filename: "test.mp4",
			},
			10,
			"medium",
			tracks
		);

		expect(recommendation.engineType).not.toBe(ExportEngineType.REMOTION);
	});

	it("does not recommend REMOTION when tracks not provided", async () => {
		const { ExportEngineFactory, ExportEngineType } = await import(
			"@/lib/export/export-engine-factory"
		);

		const factory = ExportEngineFactory.getInstance();

		const recommendation = await factory.getEngineRecommendation(
			{
				quality: "1080p",
				format: "mp4",
				width: 1920,
				height: 1080,
				filename: "test.mp4",
			},
			10,
			"medium"
			// no tracks parameter
		);

		expect(recommendation.engineType).not.toBe(ExportEngineType.REMOTION);
	});
});
