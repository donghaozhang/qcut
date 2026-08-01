import { describe, expect, test } from "bun:test";
import { probeAudio } from "./audio-cache-files";

const VALID_PROBE_OUTPUT = JSON.stringify({
	format: { format_name: "mov,mp4", duration: "1.5" },
	streams: [
		{
			codec_type: "audio",
			codec_name: "aac",
			sample_rate: "48000",
			channels: 2,
		},
	],
});

describe("Jianying audio payload probe", () => {
	test("uses the bundled path and a bounded ffprobe invocation", () => {
		const invocation = { binaryPath: "", timeoutMilliseconds: 0 };
		const result = probeAudio({
			filePath: "/cache/audio.mp3",
			resolveFfprobePath: () => "/bundled/ffprobe",
			runProbe: ({ binaryPath, timeoutMilliseconds }) => {
				invocation.binaryPath = binaryPath;
				invocation.timeoutMilliseconds = timeoutMilliseconds;
				return {
					status: 0,
					stdout: VALID_PROBE_OUTPUT,
					stderr: "",
				};
			},
		});

		expect(invocation.binaryPath).toBe("/bundled/ffprobe");
		expect(invocation.timeoutMilliseconds).toBe(10_000);
		expect(result).toEqual({
			probe: {
				format: "mov,mp4",
				durationSeconds: 1.5,
				codec: "aac",
				sampleRate: 48_000,
				channels: 2,
			},
			error: null,
		});
	});

	test("reports an unavailable bundled binary separately", () => {
		const result = probeAudio({
			filePath: "/cache/audio.mp3",
			resolveFfprobePath: () => null,
			runProbe: () => {
				throw new Error("runProbe should not be called");
			},
		});

		expect(result.error?.code).toBe("ffprobe-unavailable");
	});

	test("reports ffprobe timeouts separately", () => {
		const result = probeAudio({
			filePath: "/cache/audio.mp3",
			resolveFfprobePath: () => "/bundled/ffprobe",
			runProbe: () => ({
				status: null,
				stdout: "",
				stderr: "",
				error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
			}),
		});

		expect(result.error?.code).toBe("ffprobe-timeout");
	});

	test("preserves ordinary probe failures as a distinct diagnostic", () => {
		const result = probeAudio({
			filePath: "/cache/not-audio.mp3",
			resolveFfprobePath: () => "/bundled/ffprobe",
			runProbe: () => ({
				status: 1,
				stdout: "",
				stderr: "Invalid data found when processing input",
			}),
		});

		expect(result.error).toEqual({
			code: "ffprobe-failed",
			message: "Invalid data found when processing input",
		});
	});
});
