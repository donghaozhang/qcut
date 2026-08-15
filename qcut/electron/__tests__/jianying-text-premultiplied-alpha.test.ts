// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import { buildJianyingTextRawFrameFilter } from "../jianying-text-runtime/premultiplied-alpha.js";

const ffmpegPath = getFFmpegPath();

function convertPremultipliedPixel({
	input,
	opacity,
}: {
	input: Buffer;
	opacity: number;
}) {
	const filter = buildJianyingTextRawFrameFilter({
		opacity,
		rotationRadians: 0,
		outputWidth: 2,
		outputHeight: 1,
	});
	const result = spawnSync(
		ffmpegPath,
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-f",
			"rawvideo",
			"-pixel_format",
			"rgba",
			"-video_size",
			"2x1",
			"-framerate",
			"1",
			"-i",
			"pipe:0",
			"-vf",
			filter,
			"-frames:v",
			"1",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"pipe:1",
		],
		{ input, maxBuffer: 1024 * 1024 }
	);
	if (result.status !== 0) throw new Error(result.stderr.toString());
	return result.stdout;
}

function expectStraightPixels({
	output,
	rgb,
	alpha,
}: {
	output: Buffer;
	rgb: [number, number, number];
	alpha: number;
}) {
	const actual = [...output];
	expect(actual).toHaveLength(8);
	// Unpremultiplying 32/64 and 16/64 lands on 127.5 and 63.75; the geq
	// filter's rounding differs across FFmpeg builds, so allow one unit on
	// the color channels while keeping alpha exact.
	for (const [index, expected] of rgb.entries()) {
		expect(Math.abs(actual[index] - expected)).toBeLessThanOrEqual(1);
	}
	expect(actual[3]).toBe(alpha);
	expect(actual.slice(4)).toEqual([0, 0, 0, 0]);
}

describe.skipIf(!existsSync(ffmpegPath))(
	"Jianying premultiplied text alpha",
	{ timeout: 30_000 },
	() => {
		it("converts native premultiplied pixels to straight RGBA", () => {
			const output = convertPremultipliedPixel({
				input: Buffer.from([64, 32, 16, 64, 0, 0, 0, 0]),
				opacity: 1,
			});

			expectStraightPixels({ output, rgb: [255, 128, 64], alpha: 64 });
		});

		it("applies element opacity after unpremultiplication", () => {
			const output = convertPremultipliedPixel({
				input: Buffer.from([64, 32, 16, 64, 0, 0, 0, 0]),
				opacity: 0.5,
			});

			expectStraightPixels({ output, rgb: [255, 128, 64], alpha: 32 });
		});
	}
);
