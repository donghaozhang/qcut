import type { StickerSource } from "./ffmpeg/types";

export function appendStickerInputArgs({
	args,
	sticker,
}: {
	args: string[];
	sticker: StickerSource;
}): void {
	if (sticker.animated) {
		args.push("-stream_loop", "-1");
	} else {
		args.push("-loop", "1");
	}

	if (Number.isFinite(sticker.endTime) && sticker.endTime > 0) {
		args.push("-t", String(sticker.endTime));
	}
	args.push("-i", sticker.path);
}
