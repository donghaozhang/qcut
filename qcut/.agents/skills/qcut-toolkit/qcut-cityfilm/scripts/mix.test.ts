import { describe, expect, test } from "vitest";
import {
	assertLabelsConsumed,
	buildMixArgs,
	buildMixGraph,
	buildVolumeDetectArgs,
	computeTimelineDuration,
	parseVolumeDetect,
	resolveVoFile,
} from "./mix";

describe("qcut-cityfilm level verification", () => {
	test("measures a single window with volumedetect", () => {
		expect(
			buildVolumeDetectArgs({
				file: "/out/final.mp4",
				window: { label: "act2", startSeconds: 12.5, endSeconds: 20 },
			})
		).toEqual([
			"-hide_banner",
			"-nostats",
			"-ss",
			"12.5",
			"-t",
			"7.5",
			"-i",
			"/out/final.mp4",
			"-vn",
			"-af",
			"volumedetect",
			"-f",
			"null",
			"-",
		]);
	});

	test("rejects a window that cannot be measured", () => {
		expect(() =>
			buildVolumeDetectArgs({
				file: "/out/final.mp4",
				window: { label: "tail", startSeconds: 20, endSeconds: 20 },
			})
		).toThrow("non-positive length");
	});

	test("parses mean and max levels, including digital silence", () => {
		expect(
			parseVolumeDetect({
				stderr: [
					"[Parsed_volumedetect_0 @ 0x1] n_samples: 705600",
					"[Parsed_volumedetect_0 @ 0x1] mean_volume: -23.4 dB",
					"[Parsed_volumedetect_0 @ 0x1] max_volume: -3.0 dB",
				].join("\n"),
			})
		).toEqual({ meanDb: -23.4, maxDb: -3 });

		expect(
			parseVolumeDetect({
				stderr: "mean_volume: -inf dB\nmax_volume: -inf dB",
			})
		).toEqual({
			meanDb: Number.NEGATIVE_INFINITY,
			maxDb: Number.NEGATIVE_INFINITY,
		});

		expect(() => parseVolumeDetect({ stderr: "no levels here" })).toThrow(
			"volumedetect printed no"
		);
	});
});

describe("qcut-cityfilm mix entry surface", () => {
	test("re-exports the pure graph builders so callers need one import", () => {
		expect(typeof buildMixGraph).toBe("function");
		expect(typeof buildMixArgs).toBe("function");
		expect(typeof assertLabelsConsumed).toBe("function");
		expect(typeof computeTimelineDuration).toBe("function");
		expect(
			resolveVoFile({ assetsDir: "/a", language: "zh", cueId: "t09" })
		).toBe("/a/vo/vo-zh-t09.mp3");
	});
});
