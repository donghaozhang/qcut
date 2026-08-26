import { assertAlphaVideoRuntimeDescriptor } from "./runtime-alpha-video-validation.js";
import {
	assertAtlasRuntimeDescriptor,
	assertAtlasRuntimeFrameGeometry,
	assertDirectGifRuntimeDescriptor,
	assertPngSequenceRuntimeDescriptor,
} from "./runtime-frame-descriptor-validation.js";
import {
	assertRuntimeCompletion,
	assertRuntimeRepeat,
	finiteRuntimeIterationCount,
	invalidDescriptor,
	readRecord,
} from "./runtime-validation-helpers.js";

export {
	assertAlphaVideoRuntimeDescriptor,
	assertAtlasRuntimeDescriptor,
	assertAtlasRuntimeFrameGeometry,
	assertDirectGifRuntimeDescriptor,
	assertPngSequenceRuntimeDescriptor,
	assertRuntimeCompletion,
	assertRuntimeRepeat,
	finiteRuntimeIterationCount,
};

export function assertStickerRuntimeDescriptor({
	descriptor,
}: {
	descriptor: unknown;
}): void {
	const record = readRecord({
		value: descriptor,
		label: "Sticker runtime descriptor",
	});
	switch (record.kind) {
		case "direct-gif":
			assertDirectGifRuntimeDescriptor({ descriptor });
			return;
		case "atlas-animation":
			assertAtlasRuntimeDescriptor({ descriptor });
			return;
		case "png-sequence":
			assertPngSequenceRuntimeDescriptor({ descriptor });
			return;
		case "alpha-video":
			assertAlphaVideoRuntimeDescriptor({ descriptor });
			return;
		default:
			invalidDescriptor({
				message: `Unsupported sticker runtime descriptor kind: ${String(record.kind)}`,
			});
	}
}
