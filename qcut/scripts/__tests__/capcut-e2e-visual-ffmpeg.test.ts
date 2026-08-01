import { describe, expect, it } from "vitest";
import {
	buildDissolveExpectedArgs,
	buildRawDecodeArgs,
} from "../capcut-e2e/visual-ffmpeg.js";

describe("CapCut E2E fixed-frame FFmpeg oracle", () => {
	it("builds a shell-free, lossless linear RGB mix command", () => {
		const args = buildDissolveExpectedArgs({
			frameAPath: "/fixtures/a.png",
			frameBPath: "/fixtures/b.png",
			mixWeight: 0.25,
			outputPath: "/output/p025.png",
		});
		expect(args).toEqual([
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			"/fixtures/a.png",
			"-i",
			"/fixtures/b.png",
			"-filter_complex",
			"[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]blend=all_expr='A*(1-0.250000000)+B*0.250000000',format=rgb24[out]",
			"-map",
			"[out]",
			"-frames:v",
			"1",
			"-c:v",
			"png",
			"-pix_fmt",
			"rgb24",
			"-compression_level",
			"9",
			"-threads",
			"1",
			"-y",
			"/output/p025.png",
		]);
	});

	it("rejects weights outside the closed zero-to-one interval", () => {
		expect(() =>
			buildDissolveExpectedArgs({
				frameAPath: "a.png",
				frameBPath: "b.png",
				mixWeight: 1.01,
				outputPath: "out.png",
			})
		).toThrow("between zero and one");
	});

	it("decodes exactly one image as raw RGB24 or RGBA", () => {
		expect(
			buildRawDecodeArgs({
				imagePath: "/capture/frame.png",
				outputPath: "/tmp/frame.rgba",
				pixelFormat: "rgba",
			})
		).toEqual([
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			"/capture/frame.png",
			"-frames:v",
			"1",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"-threads",
			"1",
			"-y",
			"/tmp/frame.rgba",
		]);
	});

	it("crops both dissolve inputs to the locked comparison ROI", () => {
		expect(
			buildRawDecodeArgs({
				comparisonRoi: { height: 624, width: 1280, x: 0, y: 96 },
				imagePath: "/capture/frame.png",
				outputPath: "/tmp/frame.rgb24",
				pixelFormat: "rgb24",
			})
		).toContain("crop=1280:624:0:96");
	});
});
