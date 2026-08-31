// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	anchorFrameIndex,
	buildRgbDecodeArguments,
	parseFrameRate,
	trackingDimensions,
} from "../jianying-motion-tracking/video-input.js";
import { trackingRuntimeFilesFingerprint } from "../jianying-motion-tracking/runtime-assets.js";
import { runMotionTrackingProcess } from "../jianying-motion-tracking/process-runner.js";

describe("Jianying motion tracking runtime helpers", () => {
	it("parses rational frame rates and rejects invalid values", () => {
		expect(parseFrameRate({ value: "30000/1001" })).toBeCloseTo(29.97, 2);
		expect(() => parseFrameRate({ value: "0/0" })).toThrow("帧率无效");
		expect(() => parseFrameRate({ value: "30" })).toThrow("有效帧率");
	});

	it("decodes only the requested source interval as RGB24", () => {
		const args = buildRgbDecodeArguments({
			height: 240,
			rangeEndTimeSeconds: 4.5,
			rangeStartTimeSeconds: 1.25,
			rawPath: "/tmp/frames.rgb24",
			sourcePath: "/tmp/source.mp4",
			width: 320,
		});
		expect(args).toEqual(
			expect.arrayContaining([
				"-noautorotate",
				"-ss",
				"1.25",
				"-t",
				"3.25",
				"-vf",
				"scale=320:240:flags=bilinear",
				"-pix_fmt",
				"rgb24",
			])
		);
		expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
		expect(args).toContain("-accurate_seek");
		expect(args.at(-1)).toBe("/tmp/frames.rgb24");
	});

	it("bounds the analysis resolution while preserving aspect ratio", () => {
		expect(trackingDimensions({ width: 3840, height: 2160 })).toEqual({
			width: 640,
			height: 360,
		});
		expect(trackingDimensions({ width: 320, height: 240 })).toEqual({
			width: 320,
			height: 240,
		});
	});

	it("rounds and clamps the source anchor to decoded frames", () => {
		expect(
			anchorFrameIndex({
				anchorTimeSeconds: 2.1,
				fps: 30,
				frameCount: 60,
				rangeStartTimeSeconds: 1,
			})
		).toBe(33);
		expect(
			anchorFrameIndex({
				anchorTimeSeconds: 10,
				fps: 30,
				frameCount: 60,
				rangeStartTimeSeconds: 1,
			})
		).toBe(59);
	});

	it("fingerprints runtime files independently of manifest order", () => {
		const files = [
			{ bytes: 2, path: "b", sha256: "b".repeat(64) },
			{ bytes: 1, path: "a", sha256: "a".repeat(64) },
		];
		const fingerprint = trackingRuntimeFilesFingerprint({ files });
		expect(fingerprint).toBe(
			"6b67eb962c5de446d5b62b040b2edde15551e36a9814b90925a03f0e212930e9"
		);
		expect(fingerprint).toBe(
			trackingRuntimeFilesFingerprint({ files: [...files].reverse() })
		);
		expect(
			trackingRuntimeFilesFingerprint({
				files: [{ ...files[0], bytes: 3 }, files[1]],
			})
		).not.toBe(fingerprint);
	});

	it("waits for a cancelled child process to close", async () => {
		const controller = new AbortController();
		const process = runMotionTrackingProcess({
			command: "/bin/sleep",
			args: ["5"],
			signal: controller.signal,
		});
		controller.abort();

		await expect(process).rejects.toMatchObject({ name: "AbortError" });
	});
});
