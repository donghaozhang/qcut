import { describe, expect, it } from "vitest";
import {
	assertRestrictedMediaExportAllowed,
	findRestrictedMediaForExport,
	isRestrictedMediaExportError,
	RESTRICTED_MEDIA_EXPORT_ERROR_CODE,
	RESTRICTED_MEDIA_EXPORT_MESSAGE,
} from "../../../../electron/types/restricted-media-export-policy";

const restrictedMetadata = {
	animatedSticker: true,
	batchId: "jianying-2026-08-23-batch-18-v2",
	checksumSha256: "a".repeat(64),
	itemId: "18001",
	redistribution: "prohibited",
	referenceOnly: true,
	source: "sticker-lab",
	usage: "internal-reference-only",
} as const;

describe("Sticker Lab restricted export policy", () => {
	it("blocks restricted media referenced by the timeline with a stable error", () => {
		let thrown: unknown;
		try {
			assertRestrictedMediaExportAllowed({
				mediaItems: [{ id: "restricted-media", metadata: restrictedMetadata }],
				operation: "video",
				scope: "timeline",
				tracks: [{ elements: [{ mediaId: "restricted-media" }] }],
			});
		} catch (error) {
			thrown = error;
		}

		expect(isRestrictedMediaExportError({ error: thrown })).toBe(true);
		expect(thrown).toMatchObject({
			code: RESTRICTED_MEDIA_EXPORT_ERROR_CODE,
			mediaIds: ["restricted-media"],
			operation: "video",
		});
		expect((thrown as Error).message).toContain(
			RESTRICTED_MEDIA_EXPORT_MESSAGE
		);
	});

	it("allows an unused restricted media-bin item for a rendered timeline", () => {
		expect(() =>
			assertRestrictedMediaExportAllowed({
				mediaItems: [{ id: "restricted-media", metadata: restrictedMetadata }],
				operation: "video",
				scope: "timeline",
				tracks: [{ elements: [{ mediaId: "public-media" }] }],
			})
		).not.toThrow();
	});

	it("blocks restricted media selected by an overlay-only renderer", () => {
		expect(() =>
			assertRestrictedMediaExportAllowed({
				additionalMediaIds: ["restricted-media"],
				mediaItems: [{ id: "restricted-media", metadata: restrictedMetadata }],
				operation: "rendered-overlay",
				scope: "timeline",
				tracks: [],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("blocks every restricted item for archive and project exchange exports", () => {
		expect(
			findRestrictedMediaForExport({
				mediaItems: [
					{ id: "restricted-media", metadata: restrictedMetadata },
					{ id: "public-media", metadata: { source: "upload" } },
				],
				scope: "all-media",
			})
		).toEqual(["restricted-media"]);
	});

	it("blocks a durable restricted Sticker Lab timeline ID when metadata is missing", () => {
		expect(() =>
			assertRestrictedMediaExportAllowed({
				mediaItems: [],
				operation: "still-frame",
				scope: "timeline",
				tracks: [
					{
						elements: [
							{
								stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
							},
						],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("finds nested compound source IDs without following cycles", () => {
		const nestedChild: Record<string, unknown> = {
			sourceId: "restricted-media",
			type: "media",
		};
		const middleChild: Record<string, unknown> = {
			compound: {
				clips: [{ element: nestedChild }],
				kind: "compound",
			},
			mediaId: "public-middle",
			type: "media",
		};
		const container: Record<string, unknown> = {
			compound: {
				clips: [{ element: middleChild }],
				kind: "compound",
			},
			mediaId: "public-container",
			type: "media",
		};
		nestedChild.compound = {
			clips: [{ element: container }],
			kind: "compound",
		};

		expect(
			findRestrictedMediaForExport({
				mediaItems: [{ id: "restricted-media", metadata: restrictedMetadata }],
				scope: "timeline",
				tracks: [{ elements: [container] }],
			})
		).toEqual(["restricted-media"]);
	});

	it("collects every derived media reference from a compound child", () => {
		const restrictedMediaIds = [
			"restricted-denoise",
			"restricted-legacy-mask",
			"restricted-mask",
			"restricted-stem-drums",
			"restricted-stem-vocals",
			"restricted-voice",
		];
		const child = {
			audio: {
				denoise: { processedMediaId: "restricted-denoise" },
				separation: {
					stemMediaIds: {
						drums: "restricted-stem-drums",
						vocals: "restricted-stem-vocals",
					},
				},
				voiceConversion: { sourceMediaId: "restricted-voice" },
			},
			mask: { sourceMediaId: "restricted-legacy-mask" },
			masks: [{ sourceMediaId: "restricted-mask" }],
			mediaId: "public-child",
			type: "media",
		};

		expect(
			findRestrictedMediaForExport({
				mediaItems: restrictedMediaIds.map((id) => ({
					id,
					metadata: restrictedMetadata,
				})),
				scope: "timeline",
				tracks: [
					{
						elements: [
							{
								compound: {
									clips: [{ element: child }],
									kind: "compound",
								},
								mediaId: "public-container",
								type: "media",
							},
						],
					},
				],
			})
		).toEqual(restrictedMediaIds);
	});

	it("blocks restricted project-owned runtime resources", () => {
		expect(
			findRestrictedMediaForExport({
				mediaItems: [
					{
						id: "public-runtime",
						metadata: {
							stickerRuntimeResources: { atlas: "restricted-atlas" },
						},
					},
					{
						id: "restricted-atlas",
						metadata: restrictedMetadata,
					},
				],
				scope: "timeline",
				tracks: [{ elements: [{ mediaId: "public-runtime" }] }],
			})
		).toEqual(["restricted-atlas"]);
	});

	it("does not classify public Sticker Lab asset IDs as restricted", () => {
		expect(
			findRestrictedMediaForExport({
				mediaItems: [],
				scope: "timeline",
				tracks: [
					{
						elements: [
							{
								stickerId:
									"sticker-lab:catalogs/qcut-original/assets/arrow.png",
							},
						],
					},
				],
			})
		).toEqual([]);
	});

	it("fails closed when any durable restriction marker remains", () => {
		for (const metadata of [
			{ source: "sticker-lab" },
			{ referenceOnly: true },
			{ usage: "internal-reference-only" },
			{ redistribution: "prohibited" },
		]) {
			expect(() =>
				assertRestrictedMediaExportAllowed({
					mediaItems: [{ id: "suspicious", metadata }],
					operation: "project-exchange",
					scope: "all-media",
				})
			).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
		}
	});
});
