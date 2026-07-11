import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { buildStandaloneAudioExportArgs } from "../ffmpeg/audio-export-args";
import type { AudioSettings } from "../ffmpeg/audio-settings";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const tempDir = path.resolve(__dirname, "../../.tmp/audio-export-test");

function runFFmpeg({ args }: { args: string[] }) {
	return spawnSync(ffmpegPath, args, { encoding: "utf8", timeout: 60_000 });
}

function settings({
	pitchKeyframes = false,
	spatialKeyframes = false,
}: {
	pitchKeyframes?: boolean;
	spatialKeyframes?: boolean;
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
		voiceEnhance: {
			enabled: false,
			clarity: 0,
			warmth: 0,
			presence: 0,
		},
		pitch: {
			enabled: pitchKeyframes,
			semitones: 0,
			preserveFormants: false,
		},
		equalizer: {
			enabled: false,
			lowGainDb: 0,
			midGainDb: 0,
			highGainDb: 0,
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
		reverb: {
			enabled: spatialKeyframes,
			mix: 0,
			roomSize: 40,
			damping: 50,
		},
		echo: {
			enabled: spatialKeyframes,
			mix: 0,
			delayMs: 120,
			feedback: 25,
		},
		telephone: { enabled: false, mix: 100 },
		keyframes: {
			...(pitchKeyframes
				? {
						pitchSemitones: [
							{ id: "base", frame: 0, value: 0, easing: "linear" as const },
							{ id: "octave", frame: 60, value: 12, easing: "linear" as const },
						],
					}
				: {}),
			...(spatialKeyframes
				? {
						reverbMix: [
							{ id: "dry", frame: 0, value: 0, easing: "linear" as const },
							{ id: "wet", frame: 60, value: 35, easing: "linear" as const },
						],
						echoMix: [
							{ id: "none", frame: 0, value: 0, easing: "linear" as const },
							{ id: "echo", frame: 60, value: 25, easing: "linear" as const },
						],
					}
				: {}),
		},
	};
}

function exportAudio({
	outputPath,
	audio,
	playbackRate = 1,
}: {
	outputPath: string;
	audio: AudioSettings;
	playbackRate?: number;
}) {
	return runFFmpeg({
		args: buildStandaloneAudioExportArgs({
			options: {
				outputPath,
				duration: 2,
				bitrate: 192,
				sampleRate: 48_000,
				channels: 2,
				audioFiles: [
					{
						path: path.join(tempDir, "source.wav"),
						startTime: 0,
						duration: 2,
						playbackRate,
						audio,
					},
				],
			},
		}),
	});
}

function zeroCrossingRate({
	inputPath,
	startTime,
}: {
	inputPath: string;
	startTime: number;
}): number {
	const analysis = runFFmpeg({
		args: [
			"-hide_banner",
			"-ss",
			String(startTime),
			"-t",
			"0.2",
			"-i",
			inputPath,
			"-af",
			"astats=metadata=0:reset=0",
			"-f",
			"null",
			"-",
		],
	});
	if (analysis.status !== 0) throw new Error(analysis.stderr);
	const rates = [
		...analysis.stderr.matchAll(/Zero crossings rate: ([0-9.]+)/g),
	].map((match) => Number(match[1]));
	return Math.max(...rates);
}

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"Professional audio export - real FFmpeg",
	() => {
		beforeAll(() => {
			fs.mkdirSync(tempDir, { recursive: true });
			const source = runFFmpeg({
				args: [
					"-y",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=440:duration=2:sample_rate=48000",
					path.join(tempDir, "source.wav"),
				],
			});
			if (source.status !== 0) throw new Error(source.stderr);
		});

		afterAll(() => {
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it("renders keyframed pitch while preserving clip duration", () => {
			const outputPath = path.join(tempDir, "pitch.mp3");
			const result = exportAudio({
				outputPath,
				audio: settings({ pitchKeyframes: true }),
			});
			expect(result.status, result.stderr).toBe(0);
			expect(fs.statSync(outputPath).size).toBeGreaterThan(20_000);

			const startRate = zeroCrossingRate({
				inputPath: outputPath,
				startTime: 0.1,
			});
			const endRate = zeroCrossingRate({
				inputPath: outputPath,
				startTime: 1.7,
			});
			expect(startRate).toBeGreaterThan(0.015);
			expect(endRate).toBeGreaterThan(startRate * 1.5);
		});

		it("renders keyframed reverb and echo wet/dry branches", () => {
			const outputPath = path.join(tempDir, "spatial.mp3");
			const result = exportAudio({
				outputPath,
				audio: settings({ spatialKeyframes: true }),
			});

			expect(result.status, result.stderr).toBe(0);
			expect(fs.statSync(outputPath).size).toBeGreaterThan(20_000);
		});

		it("preserves pitch when changing clip speed", () => {
			const outputPath = path.join(tempDir, "speed.mp3");
			const result = exportAudio({
				outputPath,
				audio: settings(),
				playbackRate: 2,
			});
			expect(result.status, result.stderr).toBe(0);

			const sourceRate = zeroCrossingRate({
				inputPath: path.join(tempDir, "source.wav"),
				startTime: 0.2,
			});
			const outputRate = zeroCrossingRate({
				inputPath: outputPath,
				startTime: 0.2,
			});
			expect(outputRate).toBeGreaterThan(sourceRate * 0.85);
			expect(outputRate).toBeLessThan(sourceRate * 1.15);
		});
	}
);
