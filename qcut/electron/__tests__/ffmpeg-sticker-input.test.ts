import { describe, expect, it } from "vitest";
import { appendStickerInputArgs } from "../ffmpeg-sticker-input";
import type { StickerSource } from "../ffmpeg/types";

function createSticker({ animated }: { animated: boolean }): StickerSource {
	return {
		id: "sticker",
		animated,
		path: animated ? "/motion.png" : "/still.png",
		x: 0,
		y: 0,
		width: 64,
		height: 64,
		startTime: 1,
		endTime: 4,
		zIndex: 1,
	};
}

describe("appendStickerInputArgs", () => {
	it("uses image looping for still stickers", () => {
		const args: string[] = [];
		appendStickerInputArgs({
			args,
			sticker: createSticker({ animated: false }),
		});
		expect(args).toEqual(["-loop", "1", "-t", "4", "-i", "/still.png"]);
	});

	it("loops the complete stream for animated stickers", () => {
		const args: string[] = [];
		appendStickerInputArgs({
			args,
			sticker: createSticker({ animated: true }),
		});
		expect(args).toEqual([
			"-stream_loop",
			"-1",
			"-t",
			"4",
			"-i",
			"/motion.png",
		]);
	});
});
