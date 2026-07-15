import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildAudioWaveformCacheKey,
	buildAudioWaveformCommand,
	decodeAudioWaveformPixels,
} from "../ffmpeg/audio-waveform";

let testDirectory = "";
let sourcePath = "";

beforeEach(() => {
	testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-waveform-unit-"));
	sourcePath = path.join(testDirectory, "source.wav");
	fs.writeFileSync(sourcePath, Buffer.alloc(512, 1));
});

afterEach(() => {
	fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe("audio waveform extraction", () => {
	it("builds a fixed-size streaming waveform command", () => {
		const command = buildAudioWaveformCommand({
			options: { sourcePath, duration: 60, peakCount: 4_096 },
		});

		expect(command.expectedBytes).toBe(4_096 * 128);
		expect(command.args).toContain(sourcePath);
		expect(command.args.join(" ")).toContain("showwavespic=s=4096x128");
		expect(command.args.at(-1)).toBe("pipe:1");
	});

	it("reduces gray pixels to normalized per-column peaks", () => {
		const pixels = new Uint8Array([
			0, 0, 255, 255, 0, 255, 255, 255, 0, 0, 255, 255, 0, 0, 0, 255,
		]);

		expect([
			...decodeAudioWaveformPixels({ pixels, peakCount: 4, height: 4 }),
		]).toEqual([0, 0, expect.closeTo(2 / 3, 5), 1]);
	});

	it("invalidates the cache key when the source changes", () => {
		const options = { sourcePath, duration: 60, peakCount: 4_096 };
		const first = buildAudioWaveformCacheKey({ options });
		fs.appendFileSync(sourcePath, "changed");
		const changed = buildAudioWaveformCacheKey({ options });

		expect(changed).not.toBe(first);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
	});

	it("rejects unbounded peak counts and missing files", () => {
		expect(() =>
			buildAudioWaveformCommand({
				options: { sourcePath, duration: 60, peakCount: 100_000 },
			})
		).toThrow(/peakCount/);
		expect(() =>
			buildAudioWaveformCommand({
				options: {
					sourcePath: path.join(testDirectory, "missing.wav"),
					duration: 60,
				},
			})
		).toThrow(/not found/);
	});
});
