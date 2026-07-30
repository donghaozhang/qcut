import { describe, expect, it, vi } from "vitest";
import { createLocalStickerCatalog } from "./fixtures/local-sticker-catalog";
import {
	loadLocalStickerManifest,
	parseLocalStickerManifest,
} from "../local-sticker-manifest";

describe("local sticker manifest", () => {
	it("parses a strict v1 catalog with one or more items per category", () => {
		const catalog = createLocalStickerCatalog();

		expect(
			parseLocalStickerManifest({ jsonText: JSON.stringify(catalog) })
		).toEqual(catalog);
	});

	it("accepts an animated Jianying preview GIF as an explicit source kind", () => {
		const catalog = createLocalStickerCatalog();
		const firstItem = catalog.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.sourceKind = "preview-gif";
		firstItem.fileName = "preview.gif";
		firstItem.filePath = "/tmp/sticker-lab/preview.gif";
		firstItem.mimeType = "image/gif";

		expect(
			parseLocalStickerManifest({ jsonText: JSON.stringify(catalog) })
				.categories[0]?.items[0]
		).toMatchObject({
			sourceKind: "preview-gif",
			mimeType: "image/gif",
			playback: { kind: "animated" },
		});
	});

	it("requires GIF source kinds to point to GIF output files", () => {
		const catalog = createLocalStickerCatalog();
		const firstItem = catalog.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.sourceKind = "preview-gif";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(catalog) })
		).toThrow("preview-gif references require image/gif");
	});

	it.each([
		{
			name: "wrong version",
			mutate: (candidate: Record<string, unknown>) => {
				candidate.version = 2;
			},
			message: "version",
		},
		{
			name: "unknown root key",
			mutate: (candidate: Record<string, unknown>) => {
				candidate.unexpected = true;
			},
			message: "Unrecognized key",
		},
		{
			name: "unknown sticker key",
			mutate: (candidate: Record<string, unknown>) => {
				const categories = candidate.categories as Array<{
					items: Array<Record<string, unknown>>;
				}>;
				const firstItem = categories[0]?.items[0];
				if (firstItem) firstItem.unexpected = true;
			},
			message: "Unrecognized key",
		},
		{
			name: "empty category",
			mutate: (candidate: Record<string, unknown>) => {
				const categories = candidate.categories as Array<{
					items: unknown[];
				}>;
				const firstCategory = categories[0];
				if (firstCategory) firstCategory.items = [];
			},
			message: "at least 1",
		},
		{
			name: "relative asset path",
			mutate: (candidate: Record<string, unknown>) => {
				const categories = candidate.categories as Array<{
					items: Array<{ filePath: string }>;
				}>;
				const firstItem = categories[0]?.items[0];
				if (firstItem) firstItem.filePath = "../arrow.png";
			},
			message: "absolute",
		},
		{
			name: "unsupported media type",
			mutate: (candidate: Record<string, unknown>) => {
				const categories = candidate.categories as Array<{
					items: Array<{ mimeType: string }>;
				}>;
				const firstItem = categories[0]?.items[0];
				if (firstItem) firstItem.mimeType = "video/mp4";
			},
			message: "Invalid enum value",
		},
	])("rejects $name", ({ mutate, message }) => {
		const candidate = structuredClone(
			createLocalStickerCatalog()
		) as unknown as Record<string, unknown>;
		mutate(candidate);

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow(message);
	});

	it("rejects duplicate category, sticker, and file identities", () => {
		const candidate = structuredClone(createLocalStickerCatalog());
		const firstCategory = candidate.categories[0];
		const secondCategory = candidate.categories[1];
		if (!firstCategory || !secondCategory) {
			throw new Error("Expected two category fixtures");
		}
		secondCategory.id = firstCategory.id;
		const firstItem = firstCategory.items[0];
		const secondItem = secondCategory.items[0];
		if (!firstItem || !secondItem) {
			throw new Error("Expected sticker fixtures");
		}
		secondItem.id = firstItem.id;
		secondItem.filePath = firstItem.filePath;

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate category id");
		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate sticker id");
		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate sticker path");
	});

	it("rejects playback metadata that contradicts the source kind", () => {
		const candidate = structuredClone(createLocalStickerCatalog());
		const firstItem = candidate.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.sourceKind = "static-image";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("static-image references require static playback");
	});

	it("rejects animated JPEG files and single-frame animation metadata", () => {
		const animatedJpeg = structuredClone(createLocalStickerCatalog());
		const animatedJpegItem = animatedJpeg.categories[0]?.items[0];
		if (!animatedJpegItem) throw new Error("Expected a sticker fixture");
		animatedJpegItem.mimeType = "image/jpeg";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(animatedJpeg) })
		).toThrow("animated references cannot use image/jpeg");

		const singleFrame = structuredClone(createLocalStickerCatalog());
		const singleFrameItem = singleFrame.categories[0]?.items[0];
		if (!singleFrameItem || singleFrameItem.playback.kind !== "animated") {
			throw new Error("Expected an animated sticker fixture");
		}
		singleFrameItem.playback.frameCount = 1;

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(singleFrame) })
		).toThrow("greater than or equal to 2");
	});

	it("loads and decodes the configured UTF-8 manifest file", async () => {
		const catalog = createLocalStickerCatalog();
		const bytes = new TextEncoder().encode(JSON.stringify(catalog));
		const readFile = vi.fn(async () => bytes);

		await expect(
			loadLocalStickerManifest({
				manifestPath: "/tmp/sticker-manifest.json",
				readFile,
			})
		).resolves.toEqual(catalog);
		expect(readFile).toHaveBeenCalledWith({
			filePath: "/tmp/sticker-manifest.json",
		});
	});

	it("reports malformed, missing, and non-UTF-8 manifest files", async () => {
		expect(() => parseLocalStickerManifest({ jsonText: "{" })).toThrow(
			"malformed JSON"
		);
		await expect(
			loadLocalStickerManifest({
				manifestPath: "/tmp/missing.json",
				readFile: async () => null,
			})
		).rejects.toThrow("Unable to read local sticker manifest");
		await expect(
			loadLocalStickerManifest({
				manifestPath: "/tmp/not-utf8.json",
				readFile: async () => new Uint8Array([0xff]),
			})
		).rejects.toThrow("expected UTF-8 JSON");
		await expect(
			loadLocalStickerManifest({
				manifestPath: "../relative.json",
				readFile: async () => new Uint8Array([1]),
			})
		).rejects.toThrow("path must be absolute");
		await expect(
			loadLocalStickerManifest({
				manifestPath: "/tmp/stickers/../manifest.json",
				readFile: async () => new Uint8Array([1]),
			})
		).rejects.toThrow("without dot segments");
	});

	it("rejects dot segments in sticker file paths", () => {
		const candidate = structuredClone(createLocalStickerCatalog());
		const firstItem = candidate.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.filePath = "/tmp/stickers/../shared/arrow.png";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("must not contain dot path segments");
	});
});
