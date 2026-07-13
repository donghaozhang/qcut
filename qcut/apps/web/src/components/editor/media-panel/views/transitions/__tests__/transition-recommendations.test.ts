import { describe, expect, it } from "vitest";
import { transitionPresets } from "../transition-presets";
import { recommendTransitions } from "../transition-recommendations";

function recommendations({
	beatTimes = [],
	cutTime = 5,
	fromDuration = 3,
	fromName = "clip one",
	toDuration = 3,
	toName = "clip two",
}: {
	beatTimes?: number[];
	cutTime?: number;
	fromDuration?: number;
	fromName?: string;
	toDuration?: number;
	toName?: string;
} = {}) {
	return recommendTransitions({
		beatTimes,
		cutTime,
		fromDuration,
		fromName,
		maxDuration: 1,
		presets: transitionPresets,
		toDuration,
		toName,
	});
}

describe("transition recommendations", () => {
	it("prefers punchy transitions for short clips on a beat", () => {
		const result = recommendations({
			beatTimes: [5.03],
			fromDuration: 1,
			toDuration: 1.2,
		});
		const topPresets = result.map((item) =>
			transitionPresets.find((preset) => preset.id === item.presetId)
		);

		expect(["flash", "whip", "shake"]).toContain(topPresets[0]?.type);
		expect(result[0].reason).toBe("贴合强节拍");
		expect(result[0].duration).toBe(0.35);
	});

	it("uses clip semantics to favor motion, technology, and dialogue styles", () => {
		const motion = recommendations({ fromName: "sports action pan" });
		const technology = recommendations({ toName: "cyber digital screen" });
		const dialogue = recommendations({ fromName: "人物采访口播" });

		expect(
			transitionPresets.find((preset) => preset.id === motion[0].presetId)
				?.category
		).toMatch(/camera|split/);
		expect(
			transitionPresets.find((preset) => preset.id === technology[0].presetId)
				?.category
		).toBe("glitch");
		expect(
			transitionPresets.find((preset) => preset.id === dialogue[0].presetId)
				?.category
		).toMatch(/dissolve|natural/);
	});

	it("prefers soft transitions for long shots and clamps duration", () => {
		const result = recommendTransitions({
			beatTimes: [],
			cutTime: 8,
			fromDuration: 8,
			fromName: "wide landscape",
			maxDuration: 0.2,
			presets: transitionPresets,
			toDuration: 9,
			toName: "slow landscape",
		});

		expect(
			transitionPresets.find((preset) => preset.id === result[0].presetId)
				?.category
		).toMatch(/dissolve|natural|blur/);
		expect(result.every((item) => item.duration <= 0.2)).toBe(true);
	});

	it("returns no recommendation when the seam has no transition room", () => {
		expect(
			recommendTransitions({
				beatTimes: [],
				cutTime: 0,
				fromDuration: 1,
				fromName: "a",
				maxDuration: 0,
				presets: transitionPresets,
				toDuration: 1,
				toName: "b",
			})
		).toEqual([]);
	});

	it("uses measured frame differences instead of relying only on filenames", () => {
		const result = recommendTransitions({
			beatTimes: [],
			cutTime: 4,
			fromDuration: 3,
			fromName: "clip-a.mov",
			maxDuration: 1,
			presets: transitionPresets,
			toDuration: 3,
			toName: "clip-b.mov",
			visualSignals: {
				brightnessDelta: 0.8,
				colorDistance: 0.1,
				contrastDelta: 0.1,
				meanEdgeEnergy: 0.1,
				meanSaturation: 0.2,
				visualSimilarity: 0.9,
			},
		});

		expect(
			transitionPresets.find((preset) => preset.id === result[0].presetId)
				?.category
		).toBe("light");
		expect(result[0].reason).toBe("匹配真实明暗变化");
	});

	it("keeps dissolve continuity scoring after moving it into its own category", () => {
		const dissolve = transitionPresets.find(
			(preset) => preset.id === "dissolve"
		);
		if (!dissolve) throw new Error("Missing dissolve preset");

		const [result] = recommendTransitions({
			beatTimes: [],
			cutTime: 4,
			fromDuration: 3,
			fromName: "clip-a.mov",
			maxDuration: 1,
			presets: [dissolve],
			toDuration: 3,
			toName: "clip-b.mov",
			visualSignals: {
				brightnessDelta: 0.8,
				colorDistance: 0,
				contrastDelta: 0,
				meanEdgeEnergy: 0,
				meanSaturation: 0,
				visualSimilarity: 0,
			},
		});

		expect(result).toMatchObject({ presetId: "dissolve", score: 3 });
	});
});
