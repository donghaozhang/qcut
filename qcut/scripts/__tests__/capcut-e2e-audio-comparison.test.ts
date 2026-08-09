import { describe, expect, it } from "vitest";
import {
	audioComparisonChecksPass,
	buildAudioDifferenceArgs,
	buildAudioSignalAnalysisArgs,
	CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
	evaluateAudioComparison,
	parseAudioDifferenceEvidence,
	parseAudioSignalEvidence,
	parseAudioStreamEvidence,
} from "../capcut-e2e/audio-comparison-contract.js";
import { parseAudioComparisonCliOptions } from "../capcut-e2e/audio-comparison.js";

const EBU_SUMMARY = `
[silencedetect @ fixture] silence_start: 1.25
[silencedetect @ fixture] silence_end: 1.75 | silence_duration: 0.5
[ebur128 @ fixture] Summary:

  Integrated loudness:
    I:         -21.7 LUFS
    Threshold: -31.7 LUFS

  Loudness range:
    LRA:         0.1 LU
    Threshold: -41.7 LUFS

  True peak:
    Peak:      -18.1 dBFS
`;

function audioProbe({
	channels = 1,
	duration = "6.000000",
	sampleRate = "48000",
}: {
	channels?: number;
	duration?: string;
	sampleRate?: string;
} = {}) {
	return {
		format: { duration },
		streams: [
			{ codec_type: "video" },
			{
				channel_layout: channels === 1 ? "mono" : "stereo",
				channels,
				codec_type: "audio",
				sample_rate: sampleRate,
			},
		],
	};
}

describe("CapCut E2E audio comparison contract", () => {
	it("parses one audio stream without retaining probe paths", () => {
		expect(parseAudioStreamEvidence({ probe: audioProbe() })).toEqual({
			channelLayout: "mono",
			channels: 1,
			durationSeconds: 6,
			sampleRateHz: 48_000,
		});
		expect(
			parseAudioStreamEvidence({
				probe: { format: { duration: "6" }, streams: [] },
			})
		).toBeNull();
		expect(() =>
			parseAudioStreamEvidence({
				probe: {
					format: { duration: "6" },
					streams: [audioProbe().streams[1], audioProbe().streams[1]],
				},
			})
		).toThrow("exactly one audio stream");
	});

	it("parses loudness, peak, and paired silence evidence", () => {
		expect(parseAudioSignalEvidence({ stderr: EBU_SUMMARY })).toEqual({
			integratedLoudnessLufs: -21.7,
			loudnessRangeLu: 0.1,
			silenceIntervals: [{ endSeconds: 1.75, startSeconds: 1.25 }],
			truePeakDbfs: -18.1,
		});
		expect(() =>
			parseAudioSignalEvidence({
				stderr: EBU_SUMMARY.replace("silence_end: 1.75", "silence_start: 1.75"),
			})
		).toThrow("nested intervals");
	});

	it("parses exact and finite per-channel difference levels", () => {
		expect(
			parseAudioDifferenceEvidence({
				channelCount: 1,
				stderr:
					"[astats] Channel: 1\n[astats] Peak level dB: -inf\n[astats] RMS level dB: -inf\n",
			})
		).toEqual({
			channels: [
				{
					channel: 0,
					peakDbfs: "negative-infinity",
					rmsDbfs: "negative-infinity",
				},
			],
			exact: true,
		});
		expect(
			parseAudioDifferenceEvidence({
				channelCount: 2,
				stderr:
					"[astats] Channel: 1\n[astats] Peak level dB: -45\n[astats] RMS level dB: -55\n" +
					"[astats] Channel: 2\n[astats] Peak level dB: -42\n[astats] RMS level dB: -53\n",
			})
		).toMatchObject({
			channels: [
				{ channel: 0, peakDbfs: -45, rmsDbfs: -55 },
				{ channel: 1, peakDbfs: -42, rmsDbfs: -53 },
			],
			exact: false,
		});
		expect(() =>
			parseAudioDifferenceEvidence({
				channelCount: 2,
				stderr:
					"[astats] Channel: 1\n[astats] Peak level dB: -45\n[astats] RMS level dB: -55\n",
			})
		).toThrow("incomplete");
	});

	it("evaluates every candidate threshold fail-closed", () => {
		const stream = parseAudioStreamEvidence({ probe: audioProbe() });
		const signal = parseAudioSignalEvidence({ stderr: EBU_SUMMARY });
		const difference = parseAudioDifferenceEvidence({
			channelCount: 1,
			stderr:
				"[astats] Channel: 1\n[astats] Peak level dB: -inf\n[astats] RMS level dB: -inf\n",
		});
		if (!stream) throw new Error("Fixture stream is missing.");
		const passing = evaluateAudioComparison({
			difference,
			leftSignal: signal,
			leftStream: stream,
			rightSignal: signal,
			rightStream: stream,
			thresholds: CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
		});
		expect(audioComparisonChecksPass({ checks: passing })).toBe(true);

		const failing = evaluateAudioComparison({
			difference: null,
			leftSignal: signal,
			leftStream: stream,
			rightSignal: { ...signal, truePeakDbfs: -10 },
			rightStream: { ...stream, durationSeconds: 6.1, sampleRateHz: 44_100 },
			thresholds: CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
		});
		expect(failing).toMatchObject({
			differencePeakPass: false,
			differenceRmsPass: false,
			durationPass: false,
			sampleRateMatch: false,
			truePeakPass: false,
		});
		expect(audioComparisonChecksPass({ checks: failing })).toBe(false);
	});

	it("builds shell-free FFmpeg contracts", () => {
		const analysisArgs = buildAudioSignalAnalysisArgs({
			mediaPath: "/exports/left output.mp4",
		});
		expect(analysisArgs).toContain("/exports/left output.mp4");
		expect(analysisArgs.join(" ")).toContain("ebur128=peak=true");
		const differenceArgs = buildAudioDifferenceArgs({
			channelCount: 2,
			channelLayout: "stereo",
			leftPath: "/exports/left output.mp4",
			rightPath: "/exports/right output.mp4",
			sampleRateHz: 48_000,
		});
		expect(differenceArgs).toContain("/exports/right output.mp4");
		expect(differenceArgs.join(" ")).toContain("c0=c0-c2|c1=c1-c3");
		expect(differenceArgs.join(" ")).toContain("Peak_level+RMS_level");
	});

	it("parses CLI options and rejects missing values", () => {
		expect(
			parseAudioComparisonCliOptions({
				argv: [
					"--json",
					"--left",
					"/left.mov",
					"--right",
					"/right.mov",
					"--output",
					"/evidence",
				],
			})
		).toEqual({
			json: true,
			leftPath: "/left.mov",
			outputDirectory: "/evidence",
			rightPath: "/right.mov",
		});
		expect(() =>
			parseAudioComparisonCliOptions({
				argv: ["--left", "--right", "/right.mov"],
			})
		).toThrow("Missing value for --left");
		expect(() => parseAudioComparisonCliOptions({ argv: ["--wat"] })).toThrow(
			"Unknown flag: --wat"
		);
	});
});
