import {
	parseStickerLabMediaMetadata,
	type StickerLabMediaMetadata,
} from "../../types/sticker-lab-media-metadata.js";

export type StickerLabMediaImportMetadata = StickerLabMediaMetadata;

export function parseStickerLabMediaImportMetadata({
	candidate,
}: {
	candidate: unknown;
}): StickerLabMediaImportMetadata | undefined {
	if (candidate === undefined) return;
	return parseStickerLabMediaMetadata({
		candidate,
		label: "Media import metadata",
	});
}
