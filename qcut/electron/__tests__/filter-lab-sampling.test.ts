// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	strataKeyFor,
	stratifiedSample,
} from "../native-pipeline/filters/filter-lab-sampling";

interface Card {
	resourceId: string;
	implementation: string;
	requirements?: string[];
}

function makeCards({
	implementation,
	count,
	prefix,
}: {
	implementation: string;
	count: number;
	prefix: string;
}): Card[] {
	return Array.from({ length: count }, (_, index) => ({
		resourceId: `${prefix}-${String(index).padStart(3, "0")}`,
		implementation,
	}));
}

const sampleInput = (cards: Card[], size: number, seed: number) => ({
	cards,
	size,
	seed,
	strataOf: (card: Card) =>
		strataKeyFor({
			card: card as unknown as Record<string, unknown>,
			fields: ["implementation"],
		}),
	idOf: (card: Card) => card.resourceId,
});

describe("strataKeyFor", () => {
	it("sorts array values so tag order does not split strata", () => {
		const left = strataKeyFor({
			card: { requirements: ["skin_seg", "face_detect"] },
			fields: ["requirements"],
		});
		const right = strataKeyFor({
			card: { requirements: ["face_detect", "skin_seg"] },
			fields: ["requirements"],
		});
		expect(left).toBe(right);
		expect(left).toBe("requirements=face_detect+skin_seg");
	});

	it("treats missing, empty, and null values as none", () => {
		expect(
			strataKeyFor({
				card: { implementation: "shader" },
				fields: ["implementation", "sdkModel", "requirements"],
			})
		).toBe("implementation=shader|sdkModel=none|requirements=none");
		expect(
			strataKeyFor({ card: { requirements: [] }, fields: ["requirements"] })
		).toBe("requirements=none");
	});
});

describe("stratifiedSample", () => {
	const population = [
		...makeCards({ implementation: "single-lut", count: 40, prefix: "lut" }),
		...makeCards({ implementation: "shader", count: 10, prefix: "shader" }),
		...makeCards({ implementation: "face-ai", count: 3, prefix: "face" }),
	];

	it("is deterministic for the same seed regardless of input order", () => {
		const forward = stratifiedSample(sampleInput(population, 12, 7));
		const reversed = stratifiedSample(
			sampleInput([...population].reverse(), 12, 7)
		);
		expect(forward.cards.map((card) => card.resourceId)).toEqual(
			reversed.cards.map((card) => card.resourceId)
		);
		expect(forward.strata).toEqual(reversed.strata);
	});

	it("produces different picks for different seeds", () => {
		const first = stratifiedSample(sampleInput(population, 12, 1));
		const second = stratifiedSample(sampleInput(population, 12, 2));
		expect(first.cards.map((card) => card.resourceId)).not.toEqual(
			second.cards.map((card) => card.resourceId)
		);
	});

	it("covers every non-empty stratum at least once", () => {
		const result = stratifiedSample(sampleInput(population, 5, 3));
		for (const stratum of result.strata) {
			expect(stratum.picked).toBeGreaterThanOrEqual(1);
		}
		expect(result.cards).toHaveLength(5);
	});

	it("allocates the remainder proportionally to stratum size", () => {
		const result = stratifiedSample(sampleInput(population, 12, 3));
		const byKey = new Map(result.strata.map((s) => [s.key, s.picked]));
		const lut = byKey.get("implementation=single-lut") ?? 0;
		const shader = byKey.get("implementation=shader") ?? 0;
		const face = byKey.get("implementation=face-ai") ?? 0;
		expect(lut + shader + face).toBe(12);
		expect(lut).toBeGreaterThan(shader);
		expect(shader).toBeGreaterThanOrEqual(face);
		expect(face).toBeGreaterThanOrEqual(1);
	});

	it("caps the sample at the population and each stratum at its size", () => {
		const tiny = makeCards({ implementation: "shader", count: 2, prefix: "s" });
		const result = stratifiedSample(sampleInput(tiny, 50, 9));
		expect(result.cards).toHaveLength(2);
		expect(result.strata).toEqual([
			{ key: "implementation=shader", total: 2, picked: 2 },
		]);
	});

	it("returns empty output for an empty population or zero size", () => {
		expect(stratifiedSample(sampleInput([], 5, 1)).cards).toEqual([]);
		expect(stratifiedSample(sampleInput(population, 0, 1)).cards).toEqual([]);
	});

	it("drops strata in sorted-key order when size is below the stratum count", () => {
		const result = stratifiedSample(sampleInput(population, 2, 5));
		expect(result.cards).toHaveLength(2);
		const pickedKeys = result.strata
			.filter((stratum) => stratum.picked > 0)
			.map((stratum) => stratum.key);
		// Sorted keys: face-ai < shader < single-lut.
		expect(pickedKeys).toEqual([
			"implementation=face-ai",
			"implementation=shader",
		]);
	});
});
