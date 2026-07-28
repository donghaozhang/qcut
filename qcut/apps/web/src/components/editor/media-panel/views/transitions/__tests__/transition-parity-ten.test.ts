import { describe, expect, it } from "vitest";
import {
	TRANSITION_PARITY_CASES,
	TRANSITION_PARITY_PROGRESS_STOPS,
} from "../transition-parity-ten";
import {
	getClipTransitionPresetConfig,
	transitionPresets,
} from "../transition-presets";

describe("Jianying exact-ten transition parity manifest", () => {
	it("contains exactly ten unique Jianying names and QCut preset ids", () => {
		const jianyingNames = TRANSITION_PARITY_CASES.map(
			(item) => item.jianyingName
		);
		const qcutPresetIds = TRANSITION_PARITY_CASES.map(
			(item) => item.qcutPresetId
		);

		expect(TRANSITION_PARITY_CASES).toHaveLength(10);
		expect(new Set(jianyingNames).size).toBe(10);
		expect(new Set(qcutPresetIds).size).toBe(10);
		expect(TRANSITION_PARITY_PROGRESS_STOPS).toEqual([0.25, 0.5, 0.75]);
	});

	it.each(
		TRANSITION_PARITY_CASES
	)("maps $jianyingName to the expected $visualSemantics config", ({
		jianyingName,
		qcutPresetId,
		expectedConfig,
	}) => {
		const matchingPresets = transitionPresets.filter(
			(preset) => preset.id === qcutPresetId
		);

		expect(matchingPresets, qcutPresetId).toHaveLength(1);
		const preset = matchingPresets[0];
		expect(preset, qcutPresetId).toBeDefined();
		if (!preset) return;

		expect(preset.localizedName, qcutPresetId).toBe(jianyingName);
		expect(getClipTransitionPresetConfig({ preset }), qcutPresetId).toEqual(
			expectedConfig
		);
	});
});
