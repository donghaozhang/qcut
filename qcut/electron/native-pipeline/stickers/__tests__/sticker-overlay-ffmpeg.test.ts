import { describe, expect, test } from "bun:test";
import { buildStickerOverlayFfmpegArgs } from "../sticker-overlay-ffmpeg";
import { parseStickerOverlayPlan } from "../sticker-overlay-plan";

function sticker({
	soundEffect,
}: {
	soundEffect?: { source: string; volume: number; duration: number };
}) {
	const item = parseStickerOverlayPlan({
		value: {
			stickers: [
				{
					stickerId: "fluent-emoji:detective",
					startTime: 2.25,
					duration: 1.5,
					x: 72,
					y: 260,
					width: 240,
					rotation: -4,
					opacity: 0.9,
					soundEffect,
				},
			],
		},
	}).stickers[0];
	return {
		item,
		path: "/tmp/detective.png",
		soundEffectPath: soundEffect ? "/tmp/pop.ogg" : undefined,
	};
}

describe("sticker overlay FFmpeg builder", () => {
	test("overlays transparent artwork while stream-copying untouched audio", () => {
		const args = buildStickerOverlayFfmpegArgs({
			input: "/tmp/input.mp4",
			output: "/tmp/output.mp4",
			probe: { duration: 10, width: 1080, height: 1920, hasAudio: true },
			stickers: [sticker({})],
		});
		const graph = args[args.indexOf("-filter_complex") + 1] ?? "";

		expect(graph).toContain("format=rgba");
		expect(graph).toContain("rotate=");
		expect(graph).toContain("alpha=1");
		expect(graph).toContain("between(t,2.25,3.75)");
		expect(args).toContain("0:a:0");
		expect(args).toContain("copy");
		expect(args.at(-1)).toBe("/tmp/output.mp4");
	});

	test("delays, mixes, and limits sound effects even without source audio", () => {
		const args = buildStickerOverlayFfmpegArgs({
			input: "/tmp/input.mp4",
			output: "/tmp/output.mp4",
			probe: { duration: 10, width: 1080, height: 1920, hasAudio: false },
			stickers: [
				sticker({
					soundEffect: {
						source: "pop.ogg",
						volume: 0.15,
						duration: 0.8,
					},
				}),
			],
		});
		const graph = args[args.indexOf("-filter_complex") + 1] ?? "";

		expect(graph).toContain("anullsrc=");
		expect(graph).toContain("adelay=2250:all=1");
		expect(graph).toContain("volume=0.15");
		expect(graph).toContain("amix=inputs=2");
		expect(graph).toContain("alimiter=limit=0.95");
		expect(args).toContain("[aout]");
		expect(args).toContain("aac");
	});
});
