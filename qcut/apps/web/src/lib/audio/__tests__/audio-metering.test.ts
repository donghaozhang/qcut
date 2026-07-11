import { describe, expect, it } from "vitest";
import {
	calculateAudioMeterReading,
	combineAudioMeterReadings,
} from "../audio-metering";

describe("audio metering", () => {
	it("reports peak, RMS, momentary loudness, and compressor reduction", () => {
		const samples = Float32Array.from([0.5, -0.5, 0.5, -0.5]);
		const reading = calculateAudioMeterReading({
			samples,
			gainReductionDb: -4.25,
			timestamp: 10,
		});

		expect(reading.peakDb).toBeCloseTo(-6.02, 1);
		expect(reading.rmsDb).toBeCloseTo(-6.02, 1);
		expect(reading.lufsMomentary).toBeCloseTo(-6.71, 1);
		expect(reading.gainReductionDb).toBe(-4.25);
		expect(reading.clipping).toBe(false);
	});

	it("raises a clipping warning at full scale", () => {
		const reading = calculateAudioMeterReading({
			samples: Float32Array.from([0, 1, -0.2]),
			timestamp: 20,
		});

		expect(reading.peakDb).toBe(0);
		expect(reading.clipping).toBe(true);
	});

	it("combines simultaneous sources in the linear domain", () => {
		const quiet = calculateAudioMeterReading({
			samples: Float32Array.from([0.25, -0.25]),
			timestamp: 1,
		});
		const combined = combineAudioMeterReadings({
			readings: [quiet, quiet],
			timestamp: 2,
		});

		expect(combined.peakDb).toBeCloseTo(-6.02, 1);
		expect(combined.rmsDb).toBeCloseTo(-9.03, 1);
		expect(combined.timestamp).toBe(2);
	});
});
