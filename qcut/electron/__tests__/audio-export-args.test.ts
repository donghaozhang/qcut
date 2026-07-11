import { describe, expect, it } from "vitest";
import { buildStandaloneAudioExportArgs } from "../ffmpeg/audio-export-args";
import type { AudioSettings } from "../ffmpeg/audio-settings";

function audioSettings(): AudioSettings {
	return {
		enabled: true,
		volumeDb: 6,
		fadeIn: 0.2,
		fadeOut: 0.3,
		panEnabled: true,
		pan: 0,
		loudness: {
			enabled: false,
			targetLufs: -16,
			truePeakDb: -1.5,
			loudnessRange: 11,
		},
		denoise: { enabled: false, amount: 0, noiseFloorDb: -50 },
		voiceEnhance: {
			enabled: false,
			clarity: 0,
			warmth: 0,
			presence: 0,
		},
		pitch: { enabled: false, semitones: 0, preserveFormants: true },
		equalizer: {
			enabled: true,
			lowGainDb: 3,
			midGainDb: 0,
			highGainDb: -2,
		},
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
		keyframes: {
			pan: [
				{ id: "left", frame: 0, value: -100, easing: "linear" },
				{ id: "right", frame: 60, value: 100, easing: "linear" },
			],
		},
	};
}

describe("buildStandaloneAudioExportArgs", () => {
	it("uses the canonical effects and automation graph", () => {
		const args = buildStandaloneAudioExportArgs({
			options: {
				outputPath: "/tmp/mix.mp3",
				duration: 2,
				bitrate: 192,
				sampleRate: 48_000,
				channels: 2,
				audioFiles: [
					{
						path: "/tmp/source.wav",
						startTime: 0,
						duration: 2,
						audio: audioSettings(),
					},
				],
			},
		});
		const command = args.join(" ");

		expect(command).toContain("equalizer@qcuteqlow0");
		expect(command).toContain("asendcmd");
		expect(command).toContain("stereotools@qcutpan0");
		expect(command).toContain("volume='");
		expect(command).toContain("-b:a 192k");
		expect(command).toContain("-ar 48000");
	});

	it("mixes tracks without changing their relative preview gain", () => {
		const args = buildStandaloneAudioExportArgs({
			options: {
				outputPath: "/tmp/mix.mp3",
				duration: 2,
				bitrate: 128,
				sampleRate: 44_100,
				audioFiles: [
					{ path: "/tmp/a.wav", startTime: 0, duration: 2 },
					{ path: "/tmp/b.wav", startTime: 0, duration: 2 },
				],
			},
		});

		expect(args.join(" ")).toContain(
			"amix=inputs=2:duration=longest:dropout_transition=0:normalize=0"
		);
	});

	it("changes clip speed with pitch-preserving tempo filters", () => {
		const args = buildStandaloneAudioExportArgs({
			options: {
				outputPath: "/tmp/sped.mp3",
				duration: 2,
				bitrate: 192,
				sampleRate: 48_000,
				audioFiles: [
					{
						path: "/tmp/source.wav",
						startTime: 0,
						duration: 2,
						playbackRate: 2,
						audio: audioSettings(),
					},
				],
			},
		});
		const command = args.join(" ");

		expect(command).toContain("atempo=2");
		expect(command).not.toContain("asetrate=");
	});
});
