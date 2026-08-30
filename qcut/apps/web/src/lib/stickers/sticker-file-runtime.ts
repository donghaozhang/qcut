import {
	parseDirectGifRuntimeDescriptor,
	type StickerRuntimeDescriptor,
	StickerRuntimeError,
} from "@qcut/editor-core/sticker-lab";
import { debugError } from "@/lib/debug/debug-config";

export async function parseStickerFileRuntime({
	animatedSticker,
	file,
}: {
	animatedSticker: boolean;
	file: File;
}): Promise<StickerRuntimeDescriptor | undefined> {
	const isGif =
		file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
	if (!animatedSticker || !isGif) return;
	const bytes = new Uint8Array(await file.arrayBuffer());
	try {
		return parseDirectGifRuntimeDescriptor({ bytes });
	} catch (error) {
		if (error instanceof StickerRuntimeError) {
			debugError(
				`[StickerRuntime] Skipping GIF runtime metadata for ${file.name}:`,
				error
			);
			return;
		}
		throw error;
	}
}
