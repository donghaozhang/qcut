import { describe, expect, it } from "vitest";
import {
	type SourceAudioToneEvidence,
	buildAstatsToneArgs,
	parseAstatsZeroCrossings,
	validateSourceAudioToneEvidence,
} from "../capcut-e2e/audio-tone-evidence.js";

describe("CapCut E2E audio tone evidence", () => {
	it("builds one shell-free astats window command", () => {
		const args = buildAstatsToneArgs({
			durationSeconds: 3,
			mediaPath: "/fixtures/source-audio.wav",
			startSeconds: 3,
		});
		expect(args).toContain("/fixtures/source-audio.wav");
		expect(args).toContain(
			"atrim=start=3:end=6,astats=metadata=0:reset=0:measure_perchannel=Zero_crossings:measure_overall=none"
		);
		expect(args.at(-1)).toBe("-");
	});

	it("requires exactly one positive astats zero-crossing result", () => {
		expect(
			parseAstatsZeroCrossings({
				stderr: "[Parsed_astats_1] Zero crossings: 2640\n",
			})
		).toBe(2640);
		expect(() => parseAstatsZeroCrossings({ stderr: "no result" })).toThrow(
			"exactly one"
		);
		expect(() =>
			parseAstatsZeroCrossings({
				stderr: "Zero crossings: 2640\nZero crossings: 2640\n",
			})
		).toThrow("received 2");
	});

	it("rejects measured frequencies outside the locked tolerance", () => {
		expect(() =>
			validateSourceAudioToneEvidence({
				evidence: {
					clipA: {
						durationSeconds: 3,
						expectedFrequencyHz: 440,
						measuredFrequencyHz: 440,
						method: "ffmpeg-astats-zero-crossings",
						startSeconds: 0,
						toleranceHz: 1,
						zeroCrossings: 2640,
					},
					clipB: {
						durationSeconds: 3,
						expectedFrequencyHz: 660,
						measuredFrequencyHz: 650,
						method: "ffmpeg-astats-zero-crossings",
						startSeconds: 3,
						toleranceHz: 1,
						zeroCrossings: 3900,
					},
				},
			})
		).toThrow("expected 660 ± 1 Hz");
	});

	it("binds measured frequency to the zero-crossing count", () => {
		const evidence: SourceAudioToneEvidence = {
			clipA: {
				durationSeconds: 3,
				expectedFrequencyHz: 440,
				measuredFrequencyHz: 440,
				method: "ffmpeg-astats-zero-crossings",
				startSeconds: 0,
				toleranceHz: 1,
				zeroCrossings: 1,
			},
			clipB: {
				durationSeconds: 3,
				expectedFrequencyHz: 660,
				measuredFrequencyHz: 660,
				method: "ffmpeg-astats-zero-crossings",
				startSeconds: 3,
				toleranceHz: 1,
				zeroCrossings: 3960,
			},
		};
		expect(() => validateSourceAudioToneEvidence({ evidence })).toThrow(
			"does not match its zero-crossing evidence"
		);
	});
});
