import { describe, expect, it } from "vitest";
import {
	assertLocalFinalVideoExportAllowed as assertLocalFinalVideoPolicyAllowed,
	assertRestrictedMediaExportAllowed,
	findRestrictedMediaForExport,
	isRestrictedMediaExportError,
	type LocalFinalVideoExportCheck,
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

const noncanonicalPrimaryMetadataCases = [
	{
		label: "missing animatedSticker",
		metadata: {
			batchId: restrictedMetadata.batchId,
			checksumSha256: restrictedMetadata.checksumSha256,
			itemId: restrictedMetadata.itemId,
			redistribution: restrictedMetadata.redistribution,
			referenceOnly: restrictedMetadata.referenceOnly,
			source: restrictedMetadata.source,
			usage: restrictedMetadata.usage,
		},
	},
	{
		label: "itemId longer than 32 characters",
		metadata: { ...restrictedMetadata, itemId: "1".repeat(33) },
	},
	{
		label: "uppercase checksum",
		metadata: { ...restrictedMetadata, checksumSha256: "A".repeat(64) },
	},
] as const;

function createRestrictedRuntimeMetadata({
	checksumSha256 = "a".repeat(64),
	itemId = "18001",
	resourceName = "atlas.png",
}: {
	checksumSha256?: string;
	itemId?: string;
	resourceName?: string;
} = {}) {
	return {
		...restrictedMetadata,
		checksumSha256,
		itemId,
		source: "sticker-runtime-resource" as const,
		stickerAssetId: `sticker-lab:${restrictedMetadata.batchId}:${itemId}`,
		stickerAssetVersion: 1,
		stickerRuntimeResourceName: resourceName,
	};
}

function assertLocalFinalVideoExportAllowed({
	mediaItems,
	operation,
	stickerOverlayMediaIds,
	tracks,
}: Omit<LocalFinalVideoExportCheck, "output">): void {
	assertLocalFinalVideoPolicyAllowed({
		mediaItems,
		operation,
		output: {
			container: "mp4",
			destination: "local-file",
			kind: "final-video",
		},
		...(stickerOverlayMediaIds ? { stickerOverlayMediaIds } : {}),
		tracks,
	});
}

describe("Sticker Lab restricted export policy", () => {
	it("accepts canonical primary provenance for a local final video", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [{ id: "restricted-media", metadata: restrictedMetadata }],
				operation: "video",
				tracks: [
					{
						elements: [
							{
								mediaId: "restricted-media",
								stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
								type: "sticker",
							},
						],
					},
				],
			})
		).not.toThrow();
	});

	it("resolves canonical local sticker provenance by sourceName after an ID change", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					{
						id: "actual-restricted-media",
						metadata: restrictedMetadata,
						name: "cached-sticker.gif",
					},
				],
				operation: "video",
				tracks: [
					{
						elements: [
							{
								mediaId: "stale-restricted-media",
								sourceName: "cached-sticker.gif",
								stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
								type: "sticker",
							},
						],
					},
				],
			})
		).not.toThrow();
	});

	it.each(
		noncanonicalPrimaryMetadataCases
	)("rejects noncanonical primary provenance: $label", ({ metadata }) => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [{ id: "restricted-media", metadata }],
				operation: "video",
				tracks: [
					{
						elements: [
							{
								mediaId: "restricted-media",
								type: "sticker",
							},
						],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("allows a restricted overlay sticker to be baked into a final video", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [{ id: "restricted-media", metadata: restrictedMetadata }],
				operation: "video",
				stickerOverlayMediaIds: ["restricted-media"],
				tracks: [],
			})
		).not.toThrow();
	});

	it("keeps GIF and external video destinations restricted", () => {
		const check = {
			mediaItems: [{ id: "restricted-media", metadata: restrictedMetadata }],
			operation: "video",
			tracks: [
				{
					elements: [{ mediaId: "restricted-media", type: "sticker" }],
				},
			],
		};
		expect(() =>
			assertLocalFinalVideoPolicyAllowed({
				...check,
				output: {
					container: "gif",
					destination: "local-file",
					kind: "final-video",
				},
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
		expect(() =>
			assertLocalFinalVideoPolicyAllowed({
				...check,
				output: {
					container: "mp4",
					destination: "external",
					kind: "final-video",
				},
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("blocks restricted media used outside the sticker render path", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [{ id: "restricted-media", metadata: restrictedMetadata }],
				operation: "video",
				tracks: [
					{
						elements: [
							{ mediaId: "restricted-media", type: "sticker" },
							{ mediaId: "restricted-media", type: "media" },
						],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("allows local runtime resources only through their sticker closure", () => {
		const mediaItems = [
			{
				id: "restricted-primary",
				metadata: {
					...restrictedMetadata,
					stickerRuntimeResources: { atlas: "restricted-atlas" },
				},
			},
			{
				id: "restricted-atlas",
				metadata: createRestrictedRuntimeMetadata({}),
			},
		];

		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems,
				operation: "video",
				tracks: [
					{
						elements: [{ mediaId: "restricted-primary", type: "sticker" }],
					},
				],
			})
		).not.toThrow();
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems,
				operation: "video",
				tracks: [
					{
						elements: [
							{ mediaId: "restricted-primary", type: "sticker" },
							{ mediaId: "restricted-atlas", type: "media" },
						],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("rejects restricted runtime resources hidden behind a public primary", () => {
		let thrown: unknown;
		try {
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					{
						id: "public-primary",
						metadata: {
							source: "upload",
							stickerRuntimeResources: { atlas: "restricted-atlas" },
						},
					},
					{
						id: "restricted-atlas",
						metadata: createRestrictedRuntimeMetadata({}),
					},
				],
				operation: "video",
				tracks: [
					{
						elements: [{ mediaId: "public-primary", type: "sticker" }],
					},
				],
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({
			code: RESTRICTED_MEDIA_EXPORT_ERROR_CODE,
			mediaIds: ["public-primary", "restricted-atlas"],
		});
	});

	it("does not treat a generic prohibited asset as a local sticker", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					{
						id: "generic-prohibited",
						metadata: { redistribution: "prohibited" },
					},
				],
				operation: "video",
				tracks: [
					{
						elements: [{ mediaId: "generic-prohibited", type: "sticker" }],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("fails closed for malformed local Sticker Lab provenance", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					{
						id: "malformed-local-sticker",
						metadata: {
							...restrictedMetadata,
							checksumSha256: "not-a-checksum",
						},
					},
				],
				operation: "video",
				tracks: [
					{
						elements: [{ mediaId: "malformed-local-sticker", type: "sticker" }],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("fails closed when a durable Sticker Lab ID has no media record", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [],
				operation: "video",
				tracks: [
					{
						elements: [
							{
								mediaId: "missing-primary",
								stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
								type: "sticker",
							},
						],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("fails closed when durable Sticker Lab provenance was stripped", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					{ id: "stripped-primary", metadata: { source: "upload" } },
				],
				operation: "video",
				tracks: [
					{
						elements: [
							{
								mediaId: "stripped-primary",
								stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
								type: "sticker",
							},
						],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("fails closed when a declared runtime resource is missing", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					{
						id: "restricted-primary",
						metadata: {
							...restrictedMetadata,
							stickerRuntimeResources: { atlas: "missing-atlas" },
						},
					},
				],
				operation: "video",
				tracks: [
					{
						elements: [{ mediaId: "restricted-primary", type: "sticker" }],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("fails closed for malformed or mismatched runtime provenance", () => {
		const primary = {
			id: "restricted-primary",
			metadata: {
				...restrictedMetadata,
				stickerRuntimeResources: { atlas: "restricted-atlas" },
			},
		};
		const tracks = [
			{
				elements: [{ mediaId: "restricted-primary", type: "sticker" }],
			},
		];

		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					primary,
					{
						id: "restricted-atlas",
						metadata: createRestrictedRuntimeMetadata({
							checksumSha256: "invalid",
						}),
					},
				],
				operation: "video",
				tracks,
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					primary,
					{
						id: "restricted-atlas",
						metadata: createRestrictedRuntimeMetadata({ itemId: "18002" }),
					},
				],
				operation: "video",
				tracks,
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

	it("blocks a runtime resource used directly as a sticker primary", () => {
		expect(() =>
			assertLocalFinalVideoExportAllowed({
				mediaItems: [
					{
						id: "restricted-atlas",
						metadata: createRestrictedRuntimeMetadata({}),
					},
				],
				operation: "video",
				tracks: [
					{
						elements: [{ mediaId: "restricted-atlas", type: "sticker" }],
					},
				],
			})
		).toThrow(RESTRICTED_MEDIA_EXPORT_MESSAGE);
	});

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

	it("blocks an exact private asset identity when the instance ID is unique", () => {
		expect(
			findRestrictedMediaForExport({
				mediaItems: [],
				scope: "timeline",
				tracks: [
					{
						elements: [
							{
								stickerAssetId:
									"sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
								stickerId: "sticker-instance-1",
								type: "sticker",
							},
						],
					},
				],
			})
		).toEqual(["sticker-lab:jianying-2026-08-23-batch-18-v2:18001"]);
	});

	it("does not broaden the private asset identity pattern", () => {
		expect(
			findRestrictedMediaForExport({
				mediaItems: [],
				scope: "timeline",
				tracks: [
					{
						elements: [
							{
								stickerAssetId:
									"sticker-lab:jianying-2026-08-23-batch-18-v2:18001:instance",
								stickerId: "sticker-instance-1",
								type: "sticker",
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
