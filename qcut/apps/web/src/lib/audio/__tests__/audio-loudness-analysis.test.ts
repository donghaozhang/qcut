import { describe, expect, it } from "vitest";
import { measurePcmLoudness } from "../audio-loudness-analysis";

describe("audio loudness analysis", () => {
	it("measures a stable sine signal and true peak", () => {
		const sampleRate = 48_000;
		const samples = new Float32Array(sampleRate * 2);
		for (let index = 0; index < samples.length; index += 1) {
			samples[index] = Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 0.5;
		}
		const result = measurePcmLoudness({ channels: [samples], sampleRate });
		expect(result.integratedLufs).toBeCloseTo(-9.72, 1);
		expect(result.truePeakDb).toBeCloseTo(-6.02, 1);
		expect(result.duration).toBe(2);
	});

	it("returns finite floors for digital silence", () => {
		const result = measurePcmLoudness({
			channels: [new Float32Array(48_000)],
			sampleRate: 48_000,
		});
		expect(result).toEqual({
			integratedLufs: -70,
			truePeakDb: -120,
			duration: 1,
		});
	});

	it("gates long silence around active program audio", () => {
		const sampleRate = 1_000;
		const samples = new Float32Array(sampleRate * 4);
		for (let index = sampleRate; index < sampleRate * 2; index += 1) {
			samples[index] = 0.25;
		}
		const result = measurePcmLoudness({ channels: [samples], sampleRate });
		expect(result.integratedLufs).toBeGreaterThan(-20);
		expect(result.integratedLufs).toBeLessThan(-10);
	});
});
