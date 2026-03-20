/**
 * Tests for beat detection mono mixing and edge cases.
 */
import { describe, it, expect } from "vitest";
import { analyzeFromSamples } from "../audio/beat-detection-engine";

describe("analyzeFromSamples — mono mixing edge cases", () => {
	it("returns empty result for very short audio", () => {
		const samples = new Float32Array(100); // Way too short
		const result = analyzeFromSamples(samples, 44100);
		expect(result.bpm).toBe(0);
		expect(result.confidence).toBe(0);
		expect(result.beats).toHaveLength(0);
		expect(result.duration).toBeCloseTo(100 / 44100, 3);
	});

	it("handles silence correctly", () => {
		// 2 seconds of silence
		const samples = new Float32Array(44100 * 2);
		const result = analyzeFromSamples(samples, 44100);
		expect(result.bpm).toBe(0);
		expect(result.beats).toHaveLength(0);
		expect(result.duration).toBeCloseTo(2, 1);
	});

	it("detects beats in a synthetic click track", () => {
		const sampleRate = 44100;
		const duration = 4; // 4 seconds
		const bpm = 120; // 2 beats per second
		const samples = new Float32Array(sampleRate * duration);

		// Generate clicks at 120 BPM (every 0.5s)
		const interval = 60 / bpm; // 0.5 seconds
		for (let t = 0; t < duration; t += interval) {
			const sampleIndex = Math.floor(t * sampleRate);
			// Create a short impulse (click)
			for (let i = 0; i < 200 && sampleIndex + i < samples.length; i++) {
				samples[sampleIndex + i] = 0.9 * Math.exp(-i / 30);
			}
		}

		const result = analyzeFromSamples(samples, sampleRate);
		expect(result.bpm).toBeGreaterThan(100);
		expect(result.bpm).toBeLessThan(140);
		expect(result.beats.length).toBeGreaterThan(3);
		expect(result.confidence).toBeGreaterThan(0.5);
		expect(result.duration).toBeCloseTo(4, 1);
	});

	it("respects thresholdMultiplier config", () => {
		const sampleRate = 44100;
		const samples = new Float32Array(sampleRate * 4);

		// Generate clicks at 120 BPM
		for (let t = 0; t < 4; t += 0.5) {
			const idx = Math.floor(t * sampleRate);
			for (let i = 0; i < 200 && idx + i < samples.length; i++) {
				samples[idx + i] = 0.9 * Math.exp(-i / 30);
			}
		}

		// High threshold = fewer beats detected
		const highThreshold = analyzeFromSamples(samples, sampleRate, {
			thresholdMultiplier: 3.0,
		});
		const lowThreshold = analyzeFromSamples(samples, sampleRate, {
			thresholdMultiplier: 0.5,
		});

		expect(lowThreshold.beats.length).toBeGreaterThanOrEqual(
			highThreshold.beats.length
		);
	});

	it("identifies downbeats based on beatsPerMeasure", () => {
		const sampleRate = 44100;
		const samples = new Float32Array(sampleRate * 4);

		for (let t = 0; t < 4; t += 0.5) {
			const idx = Math.floor(t * sampleRate);
			for (let i = 0; i < 200 && idx + i < samples.length; i++) {
				samples[idx + i] = 0.9 * Math.exp(-i / 30);
			}
		}

		const result = analyzeFromSamples(samples, sampleRate, {
			beatsPerMeasure: 4,
		});

		const downbeats = result.beats.filter((b) => b.isDownbeat);
		const regularBeats = result.beats.filter((b) => !b.isDownbeat);

		// Every 4th beat should be a downbeat
		for (const beat of result.beats) {
			expect(beat.isDownbeat).toBe(beat.index % 4 === 0);
		}

		expect(downbeats.length).toBeGreaterThan(0);
		expect(result.downbeats.length).toBe(downbeats.length);
	});

	it("does not pass undefined thresholdMultiplier", () => {
		const sampleRate = 44100;
		const samples = new Float32Array(sampleRate * 2);

		// Simulate the fix: undefined config should use defaults
		const withUndefined = analyzeFromSamples(samples, sampleRate, undefined);
		const withDefaults = analyzeFromSamples(samples, sampleRate);

		expect(withUndefined.bpm).toBe(withDefaults.bpm);
		expect(withUndefined.beats.length).toBe(withDefaults.beats.length);
	});
});
