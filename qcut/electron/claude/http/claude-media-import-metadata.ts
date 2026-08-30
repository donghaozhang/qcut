import {
	parseStickerLabRestrictedMediaMetadata,
	type StickerLabRestrictedMediaMetadata,
} from "../../types/sticker-lab-media-metadata.js";

export type StickerLabMediaImportMetadata = StickerLabRestrictedMediaMetadata;

export function parseStickerLabMediaImportMetadata({
	candidate,
}: {
	candidate: unknown;
}): StickerLabMediaImportMetadata | undefined {
	if (candidate === undefined) return;
	return parseStickerLabRestrictedMediaMetadata({
		candidate,
		label: "Media import metadata",
	});
}
