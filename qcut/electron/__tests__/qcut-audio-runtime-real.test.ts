import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AudioSettings } from "../ffmpeg/audio-settings";
import { processQcutAudio } from "../qcut-audio-runtime/process";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const ffprobePath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffprobe"
);
let directory = "";
let sourcePath = "";
let cacheDirectory = "";

function localSettings(): AudioSettings {
	return {
		enabled: true,
		volumeDb: 0,
		fadeIn: 0,
		fadeOut: 0,
		channelMode: "left",
		panEnabled: false,
		pan: 0,
		loudness: {
			enabled: false,
			targetLufs: -16,
			truePeakDb: -1.5,
			loudnessRange: 11,
		},
		denoise: { enabled: true, amount: 20, noiseFloorDb: -55 },
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
	};
}

describe.skipIf(!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath))(
	"QCut local audio runtime - real FFmpeg",
	{ timeout: 60_000 },
	() => {
		beforeAll(() => {
			directory = fs.mkdtempSync(
				path.join(os.tmpdir(), "qcut-audio-runtime-real-")
			);
			sourcePath = path.join(directory, "stereo-source.wav");
			cacheDirectory = path.join(directory, "cache");
			const generated = spawnSync(
				ffmpegPath,
				[
					"-y",
					"-v",
					"error",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=440:duration=1:sample_rate=48000",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=880:duration=1:sample_rate=48000",
					"-filter_complex",
					"[0:a][1:a]amerge=inputs=2[stereo]",
					"-map",
					"[stereo]",
					"-c:a",
					"pcm_s16le",
					sourcePath,
				],
				{ encoding: "utf8", timeout: 30_000 }
			);
			expect(generated.status, generated.stderr).toBe(0);
		});

		afterAll(() => {
			fs.rmSync(directory, { recursive: true, force: true });
		});

		it("renders independently and reuses the QCut content-addressed cache", async () => {
			const request = {
				requestId: "first",
				sourcePath,
				audio: localSettings(),
			};
			const first = await processQcutAudio({
				request,
				cacheDirectory,
				ffmpegPath,
			});
			const cached = await processQcutAudio({
				request: { ...request, requestId: "cached" },
				cacheDirectory,
				ffmpegPath,
			});

			expect(first.cacheHit).toBe(false);
			expect(cached.cacheHit).toBe(true);
			expect(cached.outputPath).toBe(first.outputPath);
			expect(first.fileSize).toBeGreaterThan(10_000);
			expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);

			const probe = spawnSync(
				ffprobePath,
				[
					"-v",
					"error",
					"-select_streams",
					"a:0",
					"-show_entries",
					"stream=channels,sample_rate",
					"-of",
					"json",
					first.outputPath,
				],
				{ encoding: "utf8", timeout: 30_000 }
			);
			expect(probe.status, probe.stderr).toBe(0);
			expect(JSON.parse(probe.stdout).streams[0]).toMatchObject({
				channels: 2,
				sample_rate: "48000",
			});

			const decoded = spawnSync(
				ffmpegPath,
				[
					"-v",
					"error",
					"-i",
					first.outputPath,
					"-f",
					"s16le",
					"-acodec",
					"pcm_s16le",
					"pipe:1",
				],
				{ encoding: "buffer", timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }
			);
			expect(decoded.status, decoded.stderr.toString()).toBe(0);
			for (let offset = 0; offset + 3 < decoded.stdout.length; offset += 4) {
				expect(decoded.stdout.readInt16LE(offset)).toBe(
					decoded.stdout.readInt16LE(offset + 2)
				);
			}

			const manifest = fs.readFileSync(first.manifestPath, "utf8");
			expect(manifest).not.toContain(sourcePath);
			expect(manifest).not.toContain("Jianying");
		});
	}
);
