import { describe, expect, it } from "vitest";
import { summarizeAudioScaling } from "../audio-preview-probe";

/**
 * The realtime preview benchmark compares scenarios that differ in both layer
 * count and tick rate, so raw automation counts cannot be compared directly.
 * These tests pin the normalisation, including the case that made the measured
 * numbers meaningful: a scenario with more layers does more total work while
 * costing the same per layer.
 */

describe("summarizeAudioScaling", () => {
	it("normalises automation counts to per-clip-per-tick", () => {
		const summary = summarizeAudioScaling({
			samples: [
				{
					clips: 1,
					clockHz: 60,
					label: "single",
					setTargetAtTime: 5400,
					windowSeconds: 3,
				},
			],
		});
		// 5400 writes / (60Hz * 3s * 1 clip) = 30 per clip per tick.
		expect(summary.perClipPerTick.single).toBe(30);
		expect(summary.peakWritesPerSecond).toBe(1800);
	});

	it("reports linear scaling when per-clip cost stays flat", () => {
		const summary = summarizeAudioScaling({
			samples: [
				{
					clips: 1,
					clockHz: 60,
					label: "single",
					setTargetAtTime: 5400,
					windowSeconds: 3,
				},
				{
					clips: 8,
					clockHz: 60,
					label: "eight",
					setTargetAtTime: 43_200,
					windowSeconds: 3,
				},
			],
		});
		expect(summary.perClipPerTick.eight).toBe(30);
		expect(summary.scalesLinearly).toBe(true);
		// Eight layers do eight times the total work.
		expect(summary.peakWritesPerSecond).toBe(14_400);
	});

	it("flags superlinear growth", () => {
		const summary = summarizeAudioScaling({
			samples: [
				{
					clips: 1,
					clockHz: 60,
					label: "single",
					setTargetAtTime: 5400,
					windowSeconds: 3,
				},
				{
					clips: 8,
					clockHz: 60,
					label: "eight",
					// Twice the per-clip cost at eight layers.
					setTargetAtTime: 86_400,
					windowSeconds: 3,
				},
			],
		});
		expect(summary.perClipPerTick.eight).toBe(60);
		expect(summary.scalesLinearly).toBe(false);
	});

	it("corrects for a scenario whose clock ran slower", () => {
		// Same per-clip cost, but half the tick rate produces half the raw count;
		// comparing raw counts would wrongly read as an improvement.
		const summary = summarizeAudioScaling({
			samples: [
				{
					clips: 4,
					clockHz: 60,
					label: "fast-clock",
					setTargetAtTime: 21_600,
					windowSeconds: 3,
				},
				{
					clips: 4,
					clockHz: 30,
					label: "slow-clock",
					setTargetAtTime: 10_800,
					windowSeconds: 3,
				},
			],
		});
		expect(summary.perClipPerTick["fast-clock"]).toBe(30);
		expect(summary.perClipPerTick["slow-clock"]).toBe(30);
		expect(summary.scalesLinearly).toBe(true);
	});

	it("does not divide by zero on an empty window", () => {
		const summary = summarizeAudioScaling({
			samples: [
				{
					clips: 0,
					clockHz: 0,
					label: "empty",
					setTargetAtTime: 0,
					windowSeconds: 0,
				},
			],
		});
		expect(Number.isFinite(summary.perClipPerTick.empty)).toBe(true);
		expect(summary.peakWritesPerSecond).toBe(0);
	});
});
