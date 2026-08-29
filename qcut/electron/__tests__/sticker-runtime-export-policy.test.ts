import { describe, expect, it } from "vitest";
import {
	assertNativeStickerRuntimeExportAllowed,
	hasStickerRuntimeForExport,
} from "../types/sticker-runtime-export-policy.js";

const runtime = { kind: "direct-gif" };

describe("sticker runtime export policy", () => {
	it("detects a runtime persisted on a timeline element", () => {
		expect(
			hasStickerRuntimeForExport({
				mediaItems: [],
				tracks: [
					{
						elements: [{ mediaId: "gif-1", stickerRuntime: runtime }],
					},
				],
			})
		).toBe(true);
	});

	it("detects runtime metadata only for media referenced by the timeline", () => {
		const mediaItems = [
			{ id: "gif-1", metadata: { stickerRuntime: runtime } },
			{ id: "unused", metadata: { stickerRuntime: runtime } },
		];

		expect(
			hasStickerRuntimeForExport({
				mediaItems,
				tracks: [{ elements: [{ mediaId: "gif-1" }] }],
			})
		).toBe(true);
		expect(
			hasStickerRuntimeForExport({
				mediaItems,
				tracks: [{ elements: [{ mediaId: "plain" }] }],
			})
		).toBe(false);
	});

	it("detects runtime metadata referenced only by an overlay", () => {
		const mediaItems = [
			{ id: "overlay-runtime", metadata: { stickerRuntime: runtime } },
			{ id: "unused-runtime", metadata: { stickerRuntime: runtime } },
		];

		expect(
			hasStickerRuntimeForExport({
				additionalMediaIds: ["overlay-runtime"],
				mediaItems,
				tracks: [],
			})
		).toBe(true);
		expect(
			hasStickerRuntimeForExport({
				additionalMediaIds: ["plain-overlay"],
				mediaItems,
				tracks: [],
			})
		).toBe(false);
	});

	it("detects runtime metadata after a stale media ID resolves by filename", () => {
		expect(
			hasStickerRuntimeForExport({
				mediaItems: [
					{
						id: "actual-runtime-id",
						metadata: { stickerRuntime: runtime },
						name: "cached-runtime.gif",
					},
				],
				tracks: [
					{
						elements: [
							{
								mediaId: "stale-runtime-id",
								sourceName: "cached-runtime.gif",
							},
						],
					},
				],
			})
		).toBe(true);
	});

	it("detects runtime media nested in a compound without following cycles", () => {
		const nestedChild: Record<string, unknown> = {
			mediaId: "compound-runtime",
			type: "media",
		};
		const container: Record<string, unknown> = {
			compound: {
				clips: [{ element: nestedChild }],
				kind: "compound",
			},
			mediaId: "compound-container",
			type: "media",
		};
		nestedChild.compound = {
			clips: [{ element: container }],
			kind: "compound",
		};

		expect(
			hasStickerRuntimeForExport({
				mediaItems: [
					{ id: "compound-runtime", metadata: { stickerRuntime: runtime } },
				],
				tracks: [{ elements: [container] }],
			})
		).toBe(true);
	});

	it("rejects native export with a stable typed error", () => {
		expect(() =>
			assertNativeStickerRuntimeExportAllowed({
				mediaItems: [],
				operation: "test native export",
				tracks: [{ elements: [{ stickerRuntime: runtime }] }],
			})
		).toThrowError(
			expect.objectContaining({
				code: "QCUT_STICKER_RUNTIME_EXPORT_UNSUPPORTED",
				reason: "native-engine",
			})
		);
	});
});
