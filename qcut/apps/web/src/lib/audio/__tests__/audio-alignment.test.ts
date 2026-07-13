import { describe, expect, it } from "vitest";
import { estimateAudioAlignment } from "../audio-alignment";

function patternedSignal({ length }: { length: number }): Float32Array {
	return Float32Array.from({ length }, (_, index) => {
		const pulse = index % 37 === 0 ? 2 : 0;
		return Math.sin(index * 0.17) + Math.cos(index * 0.031) * 0.4 + pulse;
	});
}

describe("audio alignment", () => {
	it("moves a target with leading audio later back before the reference", () => {
		const reference = patternedSignal({ length: 500 });
		const target = new Float32Array(540);
		target.set(reference, 40);

		const result = estimateAudioAlignment({
			reference,
			target,
			sampleRate: 20,
			maxOffsetSeconds: 5,
		});

		expect(result.lagSeconds).toBeCloseTo(2, 5);
		expect(result.targetStartDelta).toBeCloseTo(-2, 5);
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	it("moves a target whose content starts early later on the timeline", () => {
		const target = patternedSignal({ length: 500 });
		const reference = new Float32Array(525);
		reference.set(target, 25);

		const result = estimateAudioAlignment({
			reference,
			target,
			sampleRate: 25,
			maxOffsetSeconds: 3,
		});

		expect(result.lagSeconds).toBeCloseTo(-1, 5);
		expect(result.targetStartDelta).toBeCloseTo(1, 5);
	});

	it("rejects silent clips", () => {
		expect(() =>
			estimateAudioAlignment({
				reference: new Float32Array(100),
				target: new Float32Array(100),
				sampleRate: 20,
				maxOffsetSeconds: 2,
			})
		).toThrow("too quiet");
	});
});
