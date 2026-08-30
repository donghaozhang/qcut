import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AudioSettings } from "../ffmpeg/audio-settings";
import { inspectQcutAudioRuntime } from "../qcut-audio-runtime/capabilities";
import {
	buildQcutAudioProcessCommand,
	canonicalQcutAudioSettings,
	prepareQcutAudioProcessRequest,
} from "../qcut-audio-runtime/process";

function audioSettings({
	overrides = {},
}: {
	overrides?: Partial<AudioSettings>;
} = {}): AudioSettings {
	return {
		enabled: true,
		volumeDb: 0,
		fadeIn: 0,
		fadeOut: 0,
		channelMode: "stereo",
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

let directory = "";
let sourcePath = "";

beforeEach(() => {
	directory = fs.mkdtempSync(
		path.join(os.tmpdir(), "qcut-audio-runtime-unit-")
	);
	sourcePath = path.join(directory, "source.wav");
	fs.writeFileSync(sourcePath, Buffer.alloc(1_024, 7));
});

afterEach(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("QCut local audio runtime", () => {
	it("keys cache entries by source bytes and signal-affecting settings", async () => {
		const firstAudio = audioSettings({
			overrides: {
				denoise: {
					enabled: true,
					amount: 65,
					noiseFloorDb: -50,
					status: "processing",
				},
			},
		});
		const readyAudio = audioSettings({
			overrides: {
				denoise: {
					enabled: true,
					amount: 65,
					noiseFloorDb: -50,
					status: "ready",
					processedMediaId: "derived-media",
				},
			},
		});
		const first = await prepareQcutAudioProcessRequest({
			request: { requestId: "one", sourcePath, audio: firstAudio },
		});
		const sameSignal = await prepareQcutAudioProcessRequest({
			request: { requestId: "two", sourcePath, audio: readyAudio },
		});
		const changedSettings = await prepareQcutAudioProcessRequest({
			request: {
				requestId: "three",
				sourcePath,
				audio: audioSettings({
					overrides: {
						denoise: { enabled: true, amount: 70, noiseFloorDb: -50 },
					},
				}),
			},
		});

		expect(first.cacheKey).toBe(sameSignal.cacheKey);
		expect(first.settingsSha256).toBe(sameSignal.settingsSha256);
		expect(changedSettings.cacheKey).not.toBe(first.cacheKey);

		fs.appendFileSync(sourcePath, "different source bytes");
		const changedSource = await prepareQcutAudioProcessRequest({
			request: { requestId: "four", sourcePath, audio: firstAudio },
		});
		expect(changedSource.cacheKey).not.toBe(first.cacheKey);
	});

	it("builds one lossless local command from the canonical QCut effect chain", () => {
		const audio = audioSettings({
			overrides: {
				channelMode: "left",
				denoise: { enabled: true, amount: 65, noiseFloorDb: -50 },
			},
		});
		const command = buildQcutAudioProcessCommand({
			request: { requestId: "render", sourcePath, audio },
			outputPath: path.join(directory, "result.flac"),
		});
		const joined = command.args.join(" ");
		expect(joined).toContain("pan=stereo|c0=c0|c1=c0");
		expect(joined).toContain("afftdn@qcutdenoise0");
		expect(joined).toContain("-c:a flac");
		expect(joined).toContain("-ar 48000 -ac 2");
		expect(canonicalQcutAudioSettings({ audio })).not.toHaveProperty(
			"denoise.status"
		);
	});

	it("reports QCut-owned readiness without claiming missing models", () => {
		const status = inspectQcutAudioRuntime({
			cacheDirectory: path.join(directory, "cache"),
			modelCacheDirectory: path.join(directory, "models"),
		});
		expect(status).toMatchObject({
			provider: "qcut",
			independentFromJianying: true,
		});
		expect(
			status.features.find((feature) => feature.id === "channel-mapping")
		).toMatchObject({ status: "ready" });
		expect(
			status.features.find((feature) => feature.id === "stem-separation")
		).toMatchObject({ status: "model-required", modelCacheKey: "demucs" });
	});
});
