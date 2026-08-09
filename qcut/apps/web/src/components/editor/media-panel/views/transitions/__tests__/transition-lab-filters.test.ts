import { describe, expect, it } from "vitest";
import {
	filterTransitionLabPresets,
	getJianyingLocalGroupCount,
	JIANYING_LOCAL_TRANSITION_GROUPS,
	TRANSITION_LAB_SOURCE_OPTIONS,
} from "../transition-lab-filters";
import { JIANYING_LOCAL_TRANSITION_PRESETS } from "../transition-jianying-local-presets";
import { TRANSITION_LAB_PRESETS } from "../transition-lab-presets";

const allPresets = [
	...TRANSITION_LAB_PRESETS,
	...JIANYING_LOCAL_TRANSITION_PRESETS,
];

describe("Transition Lab filters", () => {
	it("keeps public QCut shaders separate from local Jianying entries", () => {
		expect(TRANSITION_LAB_SOURCE_OPTIONS).toEqual([
			{ id: "all", label: "全部", count: 526 },
			{ id: "qcut", label: "QCut Shader", count: 6 },
			{ id: "jianying-local", label: "本机剪映", count: 520 },
		]);
		expect(
			filterTransitionLabPresets({
				presets: allPresets,
				source: "qcut",
				group: "all",
			})
		).toHaveLength(6);
		expect(
			filterTransitionLabPresets({
				presets: allPresets,
				source: "jianying-local",
				group: "all",
			})
		).toHaveLength(520);
	});

	it("exposes thirteen local groups with forty transitions each", () => {
		const groups = JIANYING_LOCAL_TRANSITION_GROUPS.filter(
			(group) => group.id !== "all"
		);
		expect(groups).toHaveLength(13);
		for (const group of groups) {
			expect(getJianyingLocalGroupCount({ group: group.id })).toBe(40);
			expect(
				filterTransitionLabPresets({
					presets: allPresets,
					source: "jianying-local",
					group: group.id,
				})
			).toHaveLength(40);
		}
	});
});
