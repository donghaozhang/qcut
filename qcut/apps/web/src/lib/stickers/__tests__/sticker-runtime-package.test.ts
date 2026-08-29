import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import {
	createAlphaVideoRuntimeDescriptor,
	createPngSequenceRuntimeDescriptor,
	parseAtlasRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import { describe, expect, it } from "vitest";
import {
	prepareStickerRuntimePackage,
	readStickerRuntimePackageDescriptor,
} from "../sticker-runtime-package";

function mediaFile({ name, type }: { name: string; type: string }): File {
	return new File([new Uint8Array([1])], name, { type });
}

function atlasDescriptor() {
	return parseAtlasRuntimeDescriptor({
		atlas: {
			frames: [
				{
					duration: 100,
					filename: "frame-1",
					frame: { h: 1, w: 1, x: 0, y: 0 },
				},
			],
			meta: { image: "atlas.png", size: { h: 1, w: 1 } },
		},
	});
}

function asset({ descriptor }: { descriptor: unknown }): AssetManifestEntry {
	return {
		category: "runtime-test",
		delivery: "bundled",
		files: [
			{ mimeType: "image/png", role: "source", url: "/stickers/preview.png" },
		],
		id: "runtime-test",
		kind: "sticker",
		license: {
			attributionRequired: false,
			commercialUse: "allowed",
			name: "QCut",
		},
		metadata: { stickerRuntime: descriptor },
		name: "Runtime test",
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		tags: ["runtime"],
		version: 1,
	};
}

describe("sticker runtime packages", () => {
	it("reads and validates runtime descriptors from production asset metadata", () => {
		const descriptor = atlasDescriptor();

		expect(
			readStickerRuntimePackageDescriptor({ asset: asset({ descriptor }) })
		).toBe(descriptor);
	});

	it("normalizes a TexturePacker atlas image to a project resource", () => {
		const prepared = prepareStickerRuntimePackage({
			descriptor: atlasDescriptor(),
			primary: {
				file: mediaFile({ name: "preview.png", type: "image/png" }),
				sourceUrl: "/stickers/preview.png",
			},
			resources: [
				{
					checksumSha256: "a".repeat(64),
					file: mediaFile({ name: "atlas.png", type: "image/png" }),
					sourceUrl: "/stickers/runtime/atlas.png",
				},
			],
		});

		expect(prepared.descriptor).toMatchObject({
			kind: "atlas-animation",
			atlasSource: "$resource:asset_0001",
		});
		expect(prepared.resources).toMatchObject([
			{
				checksumSha256: "a".repeat(64),
				mediaType: "image",
				resourceName: "asset_0001",
				sourceUrl: "/stickers/runtime/atlas.png",
			},
		]);
	});

	it("normalizes every PNG frame while deduplicating repeated sources", () => {
		const descriptor = createPngSequenceRuntimeDescriptor({
			frames: [
				{ durationSeconds: 0.1, source: "frames/0001.png" },
				{ durationSeconds: 0.1, source: "frames/0002.png" },
				{ durationSeconds: 0.1, source: "frames/0001.png" },
			],
		});
		const prepared = prepareStickerRuntimePackage({
			descriptor,
			primary: {
				file: mediaFile({ name: "preview.png", type: "image/png" }),
				sourceUrl: "/stickers/preview.png",
			},
			resources: [
				{
					file: mediaFile({ name: "0001.png", type: "image/png" }),
					sourceUrl: "/stickers/runtime/frames/0001.png",
				},
				{
					file: mediaFile({ name: "0002.png", type: "image/png" }),
					sourceUrl: "/stickers/runtime/frames/0002.png",
				},
			],
		});

		if (prepared.descriptor.kind !== "png-sequence") {
			throw new Error("Expected a PNG sequence descriptor");
		}
		expect(prepared.descriptor.frames.map((frame) => frame.source)).toEqual([
			"$resource:asset_0001",
			"$resource:asset_0002",
			"$resource:asset_0001",
		]);
		expect(prepared.resources).toHaveLength(2);
	});

	it("normalizes separate alpha-video color and mask sources", () => {
		const descriptor = createAlphaVideoRuntimeDescriptor({
			layout: {
				kind: "separate-mask",
				mask: { channel: "luma", inverted: false },
				maskSource: "mask.webm",
			},
			source: "color.webm",
			sourceDurationSeconds: 1,
		});
		const prepared = prepareStickerRuntimePackage({
			descriptor,
			primary: {
				file: mediaFile({ name: "preview.png", type: "image/png" }),
				sourceUrl: "/stickers/preview.png",
			},
			resources: [
				{
					file: mediaFile({ name: "color.webm", type: "video/webm" }),
					sourceUrl: "/stickers/runtime/color.webm",
				},
				{
					file: mediaFile({ name: "mask.webm", type: "video/webm" }),
					sourceUrl: "/stickers/runtime/mask.webm",
				},
			],
		});

		expect(prepared.descriptor).toMatchObject({
			kind: "alpha-video",
			source: "$resource:asset_0001",
			layout: {
				kind: "separate-mask",
				maskSource: "$resource:asset_0002",
			},
		});
		expect(prepared.resources.map((resource) => resource.mediaType)).toEqual([
			"video",
			"video",
		]);
	});

	it("fails closed when a descriptor source is absent", () => {
		expect(() =>
			prepareStickerRuntimePackage({
				descriptor: createPngSequenceRuntimeDescriptor({
					frames: [{ durationSeconds: 0.1, source: "missing.png" }],
				}),
				primary: {
					file: mediaFile({ name: "preview.png", type: "image/png" }),
					sourceUrl: "/stickers/preview.png",
				},
				resources: [],
			})
		).toThrow("Runtime source is missing from the asset manifest: missing.png");
	});
});
