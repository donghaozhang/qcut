import { describe, expect, it, vi } from "vitest";
import {
	AudioWaveformCache,
	sampleAudioWaveformBars,
	type AudioWaveformPeaks,
} from "../audio-waveform-cache";

const waveform: AudioWaveformPeaks = {
	duration: 8,
	values: new Float32Array([0, 0.1, 0.2, 0.3, 0.8, 0.9, 0.1, 0]),
};

describe("AudioWaveformCache", () => {
	it("deduplicates concurrent decoding for split clips sharing a source", async () => {
		const cache = new AudioWaveformCache();
		const loader = vi.fn(async () => waveform);

		const [first, second] = await Promise.all([
			cache.get({ audioUrl: "blob:audio", loader }),
			cache.get({ audioUrl: "blob:audio", loader }),
		]);

		expect(loader).toHaveBeenCalledOnce();
		expect(first).toBe(second);
	});

	it("evicts a failed promise so a retry can decode again", async () => {
		const cache = new AudioWaveformCache();
		const loader = vi
			.fn()
			.mockRejectedValueOnce(new Error("decode failed"))
			.mockResolvedValueOnce(waveform);

		await expect(cache.get({ audioUrl: "blob:audio", loader })).rejects.toThrow(
			"decode failed"
		);
		await expect(cache.get({ audioUrl: "blob:audio", loader })).resolves.toBe(
			waveform
		);
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it("deduplicates changing blob URLs by a stable media cache key", async () => {
		const cache = new AudioWaveformCache();
		const loader = vi.fn(async () => waveform);

		const first = await cache.get({
			audioUrl: "blob:first",
			cacheKey: "media:audio-1",
			loader,
		});
		const second = await cache.get({
			audioUrl: "blob:second",
			cacheKey: "media:audio-1",
			loader,
		});

		expect(first).toBe(second);
		expect(loader).toHaveBeenCalledOnce();
	});
});

describe("sampleAudioWaveformBars", () => {
	it("samples only the trimmed source interval", () => {
		const bars = sampleAudioWaveformBars({
			waveform,
			startTime: 4,
			endTime: 6,
			barCount: 2,
		});

		expect([...bars]).toEqual([expect.closeTo(0.8, 5), expect.closeTo(0.9, 5)]);
	});
});
