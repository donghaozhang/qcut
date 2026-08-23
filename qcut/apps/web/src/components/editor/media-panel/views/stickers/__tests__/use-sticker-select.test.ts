import { describe, expect, it } from "vitest";
import { buildStickerUploadMetadata } from "../hooks/use-sticker-select";

describe("sticker upload metadata", () => {
	it("writes the internal-reference contract without a local path", () => {
		const metadata = buildStickerUploadMetadata({
			animatedSticker: true,
			metadata: {
				referenceOnly: true,
				usage: "internal-reference-only",
				redistribution: "prohibited",
				batchId: "jianying-batch-18",
				itemId: "reference-1",
				checksumSha256: "a".repeat(64),
			},
		});

		expect(metadata).toEqual({
			source: "sticker-lab",
			animatedSticker: true,
			referenceOnly: true,
			usage: "internal-reference-only",
			redistribution: "prohibited",
			batchId: "jianying-batch-18",
			itemId: "reference-1",
			checksumSha256: "a".repeat(64),
		});
		expect(metadata).not.toHaveProperty("rootPath");
	});
});
