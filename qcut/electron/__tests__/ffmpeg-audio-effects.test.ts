import { describe, expect, it } from "vitest";
import type { AudioSettings } from "../ffmpeg/audio-settings";
import {
	buildAudioEffectTransforms,
	buildAudioEnvelopeFilter,
} from "../ffmpeg-audio-effects";
import { appendPostDynamicsGraphEffects } from "../ffmpeg/audio-graph-effects";

function audio({
	overrides = {},
}: {
	overrides?: Partial<AudioSettings>;
} = {}): AudioSettings {
	return {
		enabled: true,
		volumeDb: 0,
		fadeIn: 0,
		fadeOut: 0,
		panEnabled: false,
		pan: 0,
		loudness: {
			enabled: false,
			targetLufs: -16,
			truePeakDb: -1.5,
			loudnessRange: 11,
		},
		denoise: { enabled: false, amount: 0, noiseFloorDb: -50 },
		voiceEnhance: { enabled: false, clarity: 0, warmth: 0, presence: 0 },
		pitch: { enabled: false, semitones: 0, preserveFormants: true },
		equalizer: { enabled: false, lowGainDb: 0, midGainDb: 0, highGainDb: 0 },
		compressor: {
			enabled: false,
			thresholdDb: -18,
			ratio: 3,
			attackMs: 10,
			releaseMs: 120,
			makeupGainDb: 0,
		},
		limiter: { enabled: false, ceilingDb: -1, releaseMs: 50 },
		reverb: { enabled: false, mix: 20, roomSize: 40, damping: 50 },
		echo: { enabled: false, mix: 15, delayMs: 220, feedback: 25 },
		telephone: { enabled: false, mix: 100 },
		...overrides,
	};
}

describe("FFmpeg audio effects", () => {
	it("keeps a neutral canonical clip on the direct audio path", () => {
		expect(
			buildAudioEnvelopeFilter({
				audio: audio(),
				fallbackVolume: 1,
				effectiveDuration: 5,
				fps: 30,
			})
		).toBeNull();
	});

	it("builds one frame-evaluated envelope for dB and fade keyframes", () => {
		const filter = buildAudioEnvelopeFilter({
			audio: audio({
				overrides: {
					fadeIn: 1,
					fadeOut: 0.5,
					keyframes: {
						volumeDb: [
							{ id: "quiet", frame: 0, value: -12, easing: "linear" },
							{ id: "loud", frame: 30, value: 6, easing: "easeInOut" },
						],
					},
				},
			}),
			fallbackVolume: 1,
			effectiveDuration: 5,
			fps: 30,
		});
		expect(filter).toContain("eval=frame");
		expect(filter).toContain("pow(10,ld(0)/20)");
		expect(filter).toContain("if(lt(t,1)");
		expect(filter).toContain("(5-t)");
	});

	it("maps the professional effect stack to native FFmpeg filters", () => {
		const transforms = buildAudioEffectTransforms({
			audio: audio({
				overrides: {
					denoise: { enabled: true, amount: 40, noiseFloorDb: -50 },
					voiceEnhance: {
						enabled: true,
						clarity: 25,
						warmth: 10,
						presence: 20,
					},
					equalizer: {
						enabled: true,
						lowGainDb: 2,
						midGainDb: -1,
						highGainDb: 3,
					},
					compressor: {
						enabled: true,
						thresholdDb: -18,
						ratio: 4,
						attackMs: 8,
						releaseMs: 160,
						makeupGainDb: 2,
					},
					pitch: { enabled: true, semitones: 3, preserveFormants: false },
					limiter: { enabled: true, ceilingDb: -1, releaseMs: 50 },
					loudness: {
						enabled: true,
						targetLufs: -14,
						truePeakDb: -1,
						loudnessRange: 8,
					},
					panEnabled: true,
					pan: -0.3,
				},
			}),
		});
		expect(transforms.join(",")).toContain("afftdn@qcutdenoise0=");
		expect(transforms.join(",")).toContain(
			"equalizer@qcutvoiceclarity0=f=2400"
		);
		expect(transforms.join(",")).toContain("acompressor@qcutcompressor0=");
		expect(transforms.join(",")).toContain("asetrate=");
		expect(transforms.join(",")).toContain("alimiter=");
		expect(transforms.join(",")).toContain("loudnorm=I=-14:LRA=8:TP=-1");
		expect(transforms.join(",")).toContain(
			"stereotools@qcutpan0=balance_out=-0.3"
		);
	});

	it("emits sampled runtime commands for animatable effect parameters", () => {
		const transforms = buildAudioEffectTransforms({
			audio: audio({
				overrides: {
					panEnabled: true,
					pan: -1,
					equalizer: {
						enabled: true,
						lowGainDb: -6,
						midGainDb: 0,
						highGainDb: 0,
					},
					keyframes: {
						pan: [
							{ id: "left", frame: 0, value: -100, easing: "linear" },
							{ id: "right", frame: 30, value: 100, easing: "linear" },
						],
						eqLowGainDb: [
							{ id: "low", frame: 0, value: -6, easing: "linear" },
							{ id: "high", frame: 30, value: 6, easing: "linear" },
						],
					},
				},
			}),
			fps: 30,
			instanceSuffix: "7",
		});
		const chain = transforms.join(",");
		expect(chain).toContain("stereotools@qcutpan7 balance_out");
		expect(chain).toContain("equalizer@qcuteqlow7 gain");
		expect(chain).toContain("asendcmd=c='");
	});

	it("maps higher reverb damping to a shorter native tail", () => {
		const filterSteps = ({ damping }: { damping: number }) => {
			const steps: string[] = [];
			appendPostDynamicsGraphEffects({
				audio: audio({
					overrides: {
						reverb: {
							enabled: true,
							mix: 50,
							roomSize: 40,
							damping,
						},
					},
				}),
				currentLabel: "source",
				filterSteps: steps,
				fps: 30,
				index: 0,
			});
			return steps.join(";");
		};
		const decay = ({ command }: { command: string }) => {
			const match = command.match(/aecho=0\.15:0\.9:[^:]+:([0-9.]+)\|/);
			if (!match) throw new Error(`Reverb decay missing from ${command}`);
			return Number(match[1]);
		};

		expect(decay({ command: filterSteps({ damping: 0 }) })).toBeGreaterThan(
			decay({ command: filterSteps({ damping: 100 }) })
		);
	});
});
