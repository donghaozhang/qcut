import type { AssetManifestEntry } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import {
	isAnimatedStickerAsset,
	isAnimatedStickerFile,
} from "../sticker-animation";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function createPngChunk({ name }: { name: string }): Uint8Array {
	const chunk = new Uint8Array(12);
	chunk.set(
		[...name].map((character) => character.charCodeAt(0)),
		4
	);
	return chunk;
}

function combineBytes({ parts }: { parts: Uint8Array[] }): ArrayBuffer {
	const buffer = new ArrayBuffer(
		parts.reduce((total, part) => total + part.byteLength, 0)
	);
	const output = new Uint8Array(buffer);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.byteLength;
	}
	return buffer;
}

function createPngFile({ animated }: { animated: boolean }): File {
	const parts = [PNG_SIGNATURE, createPngChunk({ name: "IHDR" })];
	if (animated) parts.push(createPngChunk({ name: "acTL" }));
	parts.push(createPngChunk({ name: "IEND" }));
	return new File(
		[combineBytes({ parts })],
		animated ? "motion.png" : "still.png",
		{
			type: "image/png",
		}
	);
}

function createWebpFile({ animated }: { animated: boolean }): File {
	const bytes = new Uint8Array(20);
	bytes.set(
		[..."RIFF"].map((character) => character.charCodeAt(0)),
		0
	);
	bytes.set(
		[..."WEBP"].map((character) => character.charCodeAt(0)),
		8
	);
	bytes.set(
		[...(animated ? "ANIM" : "VP8 ")].map((character) =>
			character.charCodeAt(0)
		),
		12
	);
	return new File(
		[combineBytes({ parts: [bytes] })],
		animated ? "motion.webp" : "still.webp",
		{
			type: "image/webp",
		}
	);
}

function createAsset({
	animated,
	mimeType,
	url,
}: {
	animated: boolean;
	mimeType: string;
	url: string;
}): AssetManifestEntry {
	return {
		schemaVersion: 1,
		id: "test-sticker",
		kind: "sticker",
		version: 1,
		name: "Test sticker",
		category: "test",
		tags: [],
		delivery: "bundled",
		files: [{ role: "source", url, mimeType }],
		license: {
			name: "Test",
			commercialUse: "allowed",
			attributionRequired: false,
		},
		metadata: { animated },
	};
}

describe("sticker animation detection", () => {
	it("detects APNG animation control chunks", async () => {
		await expect(
			isAnimatedStickerFile({ file: createPngFile({ animated: true }) })
		).resolves.toBe(true);
		await expect(
			isAnimatedStickerFile({ file: createPngFile({ animated: false }) })
		).resolves.toBe(false);
	});

	it("treats GIF uploads as animated inputs", async () => {
		const file = new File(["GIF89a"], "loop.gif", { type: "image/gif" });
		await expect(isAnimatedStickerFile({ file })).resolves.toBe(true);
	});

	it("detects WebP animation chunks", async () => {
		await expect(
			isAnimatedStickerFile({ file: createWebpFile({ animated: true }) })
		).resolves.toBe(true);
		await expect(
			isAnimatedStickerFile({ file: createWebpFile({ animated: false }) })
		).resolves.toBe(false);
	});

	it("rejects animated metadata when the export source is SVG", () => {
		expect(
			isAnimatedStickerAsset({
				asset: createAsset({
					animated: true,
					mimeType: "image/svg+xml",
					url: "https://example.com/motion.svg",
				}),
			})
		).toBe(false);
		expect(
			isAnimatedStickerAsset({
				asset: createAsset({
					animated: true,
					mimeType: "image/png",
					url: "/stickers/motion.png",
				}),
			})
		).toBe(true);
	});
});
