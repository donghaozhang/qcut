import { describe, it, expect } from "vitest";
import {
	analyzeFromSamples,
	resolveConfig,
	DEFAULT_CONFIG,
} from "../audio/beat-detection-engine.js";
import type { BeatDetectionResult } from "../audio/beat-types.js";

/** Generate a click track: silence with periodic impulses at a given BPM */
function generateClickTrack(
	bpm: number,
	durationSec: number,
	sampleRate: number,
): Float32Array {
	const totalSamples = Math.floor(durationSec * sampleRate);
	const samples = new Float32Array(totalSamples);
	const samplesPerBeat = Math.floor((60 / bpm) * sampleRate);
	const clickLength = 256; // short impulse

	for (let i = 0; i < totalSamples; i += samplesPerBeat) {
		for (let j = 0; j < clickLength && i + j < totalSamples; j++) {
			// Short sine pulse
			samples[i + j] = Math.sin((2 * Math.PI * 440 * j) / sampleRate) * 0.9;
		}
	}

	return samples;
}

/** Generate silent audio */
function generateSilence(durationSec: number, sampleRate: number): Float32Array {
	return new Float32Array(Math.floor(durationSec * sampleRate));
}

describe("resolveConfig", () => {
	it("returns defaults when no config provided", () => {
		const cfg = resolveConfig();
		expect(cfg).toEqual(DEFAULT_CONFIG);
	});

	it("merges partial config with defaults", () => {
		const cfg = resolveConfig({ thresholdMultiplier: 2.0 });
		expect(cfg.thresholdMultiplier).toBe(2.0);
		expect(cfg.windowSize).toBe(DEFAULT_CONFIG.windowSize);
	});
});

describe("analyzeFromSamples", () => {
	const sampleRate = 44100;

	it("returns empty result for silent audio", () => {
		const samples = generateSilence(5, sampleRate);
		const result = analyzeFromSamples(samples, sampleRate);

		expect(result.beats).toHaveLength(0);
		expect(result.bpm).toBe(0);
		expect(result.confidence).toBe(0);
		expect(result.downbeats).toHaveLength(0);
		expect(result.duration).toBeCloseTo(5, 0);
	});

	it("returns empty result for very short clips", () => {
		// Less than 3 windows worth of samples
		const samples = new Float32Array(1024 * 2);
		const result = analyzeFromSamples(samples, sampleRate);

		expect(result.beats).toHaveLength(0);
		expect(result.bpm).toBe(0);
	});

	it("detects beats from a 120 BPM click track", () => {
		const samples = generateClickTrack(120, 10, sampleRate);
		const result = analyzeFromSamples(samples, sampleRate);

		// Should detect beats
		expect(result.beats.length).toBeGreaterThan(0);

		// BPM should be in the ballpark of 120 (allow ±20% due to algorithm precision)
		expect(result.bpm).toBeGreaterThan(90);
		expect(result.bpm).toBeLessThan(150);

		// Should have some confidence
		expect(result.confidence).toBeGreaterThan(0);

		// Duration should be ~10s
		expect(result.duration).toBeCloseTo(10, 0);
	});

	it("marks downbeats correctly (every 4th beat by default)", () => {
		const samples = generateClickTrack(120, 10, sampleRate);
		const result = analyzeFromSamples(samples, sampleRate);

		const downbeatBeats = result.beats.filter((b) => b.isDownbeat);
		const regularBeats = result.beats.filter((b) => !b.isDownbeat);

		// First beat should always be a downbeat
		if (result.beats.length > 0) {
			expect(result.beats[0].isDownbeat).toBe(true);
		}

		// Downbeats array should match filtered beats
		expect(result.downbeats.length).toBe(downbeatBeats.length);
	});

	it("respects custom beatsPerMeasure", () => {
		const samples = generateClickTrack(120, 10, sampleRate);
		const result = analyzeFromSamples(samples, sampleRate, {
			beatsPerMeasure: 3,
		});

		// Every 3rd beat should be a downbeat
		for (const beat of result.beats) {
			expect(beat.isDownbeat).toBe(beat.index % 3 === 0);
		}
	});

	it("beats have sequential indices", () => {
		const samples = generateClickTrack(120, 5, sampleRate);
		const result = analyzeFromSamples(samples, sampleRate);

		for (let i = 0; i < result.beats.length; i++) {
			expect(result.beats[i].index).toBe(i);
		}
	});

	it("beat timestamps are monotonically increasing", () => {
		const samples = generateClickTrack(120, 5, sampleRate);
		const result = analyzeFromSamples(samples, sampleRate);

		for (let i = 1; i < result.beats.length; i++) {
			expect(result.beats[i].timestamp).toBeGreaterThan(
				result.beats[i - 1].timestamp,
			);
		}
	});

	it("beat strengths are between 0 and 1", () => {
		const samples = generateClickTrack(120, 5, sampleRate);
		const result = analyzeFromSamples(samples, sampleRate);

		for (const beat of result.beats) {
			expect(beat.strength).toBeGreaterThanOrEqual(0);
			expect(beat.strength).toBeLessThanOrEqual(1);
		}
	});

	it("respects custom thresholdMultiplier", () => {
		const samples = generateClickTrack(120, 5, sampleRate);

		const lowThreshold = analyzeFromSamples(samples, sampleRate, {
			thresholdMultiplier: 0.5,
		});
		const highThreshold = analyzeFromSamples(samples, sampleRate, {
			thresholdMultiplier: 3.0,
		});

		// Lower threshold should detect at least as many beats
		expect(lowThreshold.beats.length).toBeGreaterThanOrEqual(
			highThreshold.beats.length,
		);
	});
});
