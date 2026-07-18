import type { EffectRenderProgram } from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import { EFFECT_OVERLAY_RESOURCE_IDS } from "@/lib/effects/effect-overlay-resources";
import { extractEffectOverlaySources } from "../effect-overlay-sources";

function overlayProgram({
	resourceId,
}: {
	resourceId: string;
}): EffectRenderProgram {
	return {
		version: 1,
		stages: [
			{
				kind: "overlay",
				resourceId,
				blendMode: "normal",
				opacity: 1,
				fit: "stretch",
			},
		],
	};
}

describe("extractEffectOverlaySources", () => {
	it("materializes shared resources once and maps them to every element", async () => {
		const resourceId = EFFECT_OVERLAY_RESOURCE_IDS.borderToday;
		const ensureSourceResource = vi.fn(async () => [
			{
				cacheKey: "source-cache-key",
				fromCache: true,
				role: "source" as const,
				sourceUrl: "/overlay.png",
				url: "blob:overlay",
				blob: new Blob([new Uint8Array([1, 2, 3])], {
					type: "image/png",
				}),
			},
		]);
		const saveStickerForExport = vi.fn(async () => ({
			success: true,
			path: "/tmp/effect-overlay.png",
		}));

		const result = await extractEffectOverlaySources({
			programsByElementId: new Map([
				["clip-a", overlayProgram({ resourceId })],
				["clip-b", overlayProgram({ resourceId })],
			]),
			sessionId: "session-1",
			canvasWidth: 1920,
			canvasHeight: 1080,
			api: { saveStickerForExport },
			ensureSourceResource,
			logger: vi.fn(),
		});

		expect(ensureSourceResource).toHaveBeenCalledTimes(1);
		expect(saveStickerForExport).toHaveBeenCalledTimes(1);
		expect(saveStickerForExport).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "session-1",
				stickerId: "effect-qcut-themed_frames-frame-10",
				format: "png",
			})
		);
		expect(result.get("clip-a")).toEqual([
			{
				resourceId,
				stageIndex: 0,
				path: "/tmp/effect-overlay.png",
				animated: false,
			},
		]);
		expect(result.get("clip-b")).toEqual(result.get("clip-a"));
	});

	it("fails loudly when the cache cannot provide exportable bytes", async () => {
		await expect(
			extractEffectOverlaySources({
				programsByElementId: new Map([
					[
						"clip-a",
						overlayProgram({
							resourceId: EFFECT_OVERLAY_RESOURCE_IDS.borderToday,
						}),
					],
				]),
				sessionId: "session-1",
				canvasWidth: 1920,
				canvasHeight: 1080,
				api: {
					saveStickerForExport: vi.fn(),
				},
				ensureSourceResource: async () => [
					{
						cacheKey: "missing-blob",
						fromCache: true,
						role: "source",
						sourceUrl: "/overlay.png",
						url: "/overlay.png",
					},
				],
				logger: vi.fn(),
			})
		).rejects.toThrow("has no exportable bytes");
	});
});
