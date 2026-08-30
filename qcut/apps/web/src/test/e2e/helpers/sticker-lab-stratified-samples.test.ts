import { describe, expect, it } from "vitest";
import type {
	LocalStickerLabDiscovery,
	LocalStickerLabMimeType,
	LocalStickerLabReference,
} from "../../../../../../electron/preload-types/api-types/sticker-lab-api";
import {
	selectRepresentativeUiSamples,
	selectStratifiedStickerSamples,
} from "./sticker-lab-stratified-samples";

function reference({
	byteSize,
	cycleDuration = 0.6,
	id,
	mimeType,
}: {
	byteSize: number;
	cycleDuration?: number;
	id: string;
	mimeType: LocalStickerLabMimeType;
}): LocalStickerLabReference {
	return {
		asset: {
			batchId: "jianying-2026-08-30-batch-1",
			byteSize,
			checksumSha256: id.padEnd(64, "0"),
			kind: "local-reference",
			rootPath: "/private/cache",
			stickerId: id,
		},
		displayName: `Sticker ${id}`,
		fileName: `${id}.${mimeType === "image/gif" ? "gif" : "png"}`,
		id,
		mimeType,
		playback:
			mimeType === "image/gif"
				? {
						cycleDuration,
						frameCount: 3,
						frameRate: 5,
						kind: "animated",
						loop: true,
					}
				: { kind: "static" },
		sourceKind: mimeType === "image/gif" ? "preview-gif" : "static-image",
	};
}

function discovery(): LocalStickerLabDiscovery {
	const categories = [
		{
			id: "10",
			items: [
				reference({ byteSize: 50, id: "100", mimeType: "image/gif" }),
				reference({ byteSize: 20, id: "101", mimeType: "image/gif" }),
				reference({ byteSize: 30, id: "102", mimeType: "image/png" }),
				reference({ byteSize: 10, id: "103", mimeType: "image/png" }),
			],
			label: "Mixed",
			sourcePanel: "stickers",
		},
		{
			id: "20",
			items: [
				reference({ byteSize: 30, id: "200", mimeType: "image/gif" }),
				reference({ byteSize: 10, id: "201", mimeType: "image/gif" }),
				reference({ byteSize: 90, id: "202", mimeType: "image/gif" }),
			],
			label: "GIF only",
			sourcePanel: "stickers",
		},
		{
			id: "30",
			items: [
				reference({ byteSize: 45, id: "300", mimeType: "image/png" }),
				reference({ byteSize: 15, id: "301", mimeType: "image/png" }),
				reference({ byteSize: 75, id: "302", mimeType: "image/png" }),
			],
			label: "PNG only",
			sourcePanel: "stickers",
		},
	];
	return {
		catalogs: [
			{
				batchId: "jianying-2026-08-30-batch-1",
				categories,
				itemCount: categories.reduce(
					(total, category) => total + category.items.length,
					0
				),
				referenceOnly: true,
				totalBytes: 375,
				version: 1,
			},
		],
		rootPath: "/private/cache",
		summary: {
			batchCount: 1,
			categoryCount: categories.length,
			itemCount: 10,
			totalBytes: 375,
		},
		warnings: [],
	};
}

describe("stratified Sticker Lab samples", () => {
	it("selects the smallest GIF and PNG for mixed categories", () => {
		const samples = selectStratifiedStickerSamples({ discovery: discovery() });
		expect(samples.map(({ itemId }) => itemId)).toEqual([
			"101",
			"103",
			"201",
			"202",
			"301",
			"302",
		]);
		expect(new Set(samples.map(({ categoryId }) => categoryId)).size).toBe(3);
	});

	it("keeps GIF and PNG UI samples in distinct categories", () => {
		const samples = selectStratifiedStickerSamples({ discovery: discovery() });
		const selected = selectRepresentativeUiSamples({ limit: 2, samples });
		expect(selected).toHaveLength(2);
		expect(new Set(selected.map(({ categoryId }) => categoryId)).size).toBe(2);
		expect(new Set(selected.map(({ mimeType }) => mimeType))).toEqual(
			new Set(["image/gif", "image/png"])
		);
	});

	it("rejects discovery warnings before building a matrix", () => {
		const withWarning = discovery();
		withWarning.warnings = [{ message: "corrupt cache" }];
		expect(() =>
			selectStratifiedStickerSamples({ discovery: withWarning })
		).toThrow("returned 1 warning");
	});

	it("replaces a GIF whose cycle cannot fit the evidence video", () => {
		const cache = discovery();
		const gifOnly = cache.catalogs[0].categories.find(({ id }) => id === "20");
		if (!gifOnly) throw new Error("GIF-only category is missing");
		gifOnly.items[2] = reference({
			byteSize: 90,
			cycleDuration: 10.8,
			id: "202",
			mimeType: "image/gif",
		});

		const samples = selectStratifiedStickerSamples({
			discovery: cache,
			maxGifCycleDurationSeconds: 5.8,
		});

		expect(
			samples
				.filter(({ categoryId }) => categoryId === "20")
				.map(({ itemId }) => itemId)
		).toEqual(["201", "200"]);
	});
});
