import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderContext } from "@/lib/export/export-engine-renderer";
import { StickerRuntimeExportUnsupportedError } from "../../../../../../electron/types/sticker-runtime-export-policy";

const mocks = vi.hoisted(() => ({
	mediaItems: [] as Array<Record<string, unknown>>,
	renderStickersToCanvas: vi.fn(),
	visibleStickers: [] as Array<{
		id: string;
		maintainAspectRatio: boolean;
		mediaItemId: string;
		opacity: number;
		position: { x: number; y: number };
		rotation: number;
		size: { height: number; width: number };
		zIndex: number;
	}>,
}));

vi.mock("@/stores/ai/effects-store", () => ({
	useEffectsStore: {
		getState: () => ({ getElementEffects: () => [] }),
	},
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: () => ({
			getVisibleStickersAtTime: () => mocks.visibleStickers,
		}),
	},
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: () => ({ mediaItems: mocks.mediaItems }),
	},
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugError: vi.fn(),
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
}));

vi.mock("@/lib/stickers/sticker-export-helper", () => ({
	renderStickersToCanvas: mocks.renderStickersToCanvas,
	StickerRenderFailureError: class extends Error {},
}));

vi.mock("@/lib/markdown", () => ({
	stripMarkdownSyntax: vi.fn(({ markdown }: { markdown: string }) => markdown),
}));

vi.mock("@/config/features", () => ({ EFFECTS_ENABLED: false }));

import { renderOverlayStickers } from "@/lib/export/export-engine-renderer";

function createRenderContext(): RenderContext {
	return {
		canvas: { height: 1080, width: 1920 } as HTMLCanvasElement,
		ctx: {} as CanvasRenderingContext2D,
		fps: 30,
		mediaItems: [],
		tracks: [],
		usedImages: new Set(),
		videoCache: new Map(),
	};
}

function showOverlay({ mediaItemId }: { mediaItemId: string }): void {
	mocks.visibleStickers = [
		{
			id: "overlay-sticker",
			maintainAspectRatio: true,
			mediaItemId,
			opacity: 1,
			position: { x: 50, y: 50 },
			rotation: 0,
			size: { height: 20, width: 20 },
			zIndex: 1,
		},
	];
}

describe("overlay sticker export restriction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mediaItems = [];
		mocks.visibleStickers = [];
		mocks.renderStickersToCanvas.mockReset().mockResolvedValue({
			attempted: 1,
			failed: [],
			successful: 1,
		});
	});

	it("rechecks live overlay media and preserves the restricted error", async () => {
		mocks.mediaItems = [
			{
				id: "restricted-overlay-media",
				metadata: { redistribution: "prohibited" },
			},
		];
		showOverlay({ mediaItemId: "restricted-overlay-media" });

		await expect(
			renderOverlayStickers(createRenderContext(), 0)
		).rejects.toMatchObject({
			code: "QCUT_RESTRICTED_MEDIA_EXPORT",
			mediaIds: ["restricted-overlay-media"],
		});
		expect(mocks.renderStickersToCanvas).not.toHaveBeenCalled();
	});

	it("rethrows a typed runtime render failure", async () => {
		mocks.mediaItems = [
			{
				id: "runtime-overlay-media",
				metadata: { stickerRuntime: { kind: "direct-gif" } },
			},
		];
		showOverlay({ mediaItemId: "runtime-overlay-media" });
		const runtimeError = new StickerRuntimeExportUnsupportedError({
			operation: "overlay sticker export",
			reason: "missing-timeline-context",
		});
		mocks.renderStickersToCanvas.mockRejectedValue(runtimeError);

		await expect(renderOverlayStickers(createRenderContext(), 0)).rejects.toBe(
			runtimeError
		);
	});

	it("fails closed on ordinary static overlay failures", async () => {
		mocks.mediaItems = [{ id: "static-overlay-media" }];
		showOverlay({ mediaItemId: "static-overlay-media" });
		const renderError = new Error("static image decode failed");
		mocks.renderStickersToCanvas.mockRejectedValue(renderError);

		await expect(renderOverlayStickers(createRenderContext(), 0)).rejects.toBe(
			renderError
		);
	});

	it("fails closed on ordinary runtime asset failures", async () => {
		mocks.mediaItems = [
			{
				id: "runtime-asset-overlay-media",
				metadata: { stickerRuntime: { kind: "direct-gif" } },
			},
		];
		showOverlay({ mediaItemId: "runtime-asset-overlay-media" });
		const renderError = new Error("runtime asset decode failed");
		mocks.renderStickersToCanvas.mockRejectedValue(renderError);

		await expect(renderOverlayStickers(createRenderContext(), 0)).rejects.toBe(
			renderError
		);
	});
});
