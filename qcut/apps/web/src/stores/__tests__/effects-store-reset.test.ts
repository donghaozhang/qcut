import type { EffectInstance } from "@qcut/editor-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/features", () => ({
	EFFECTS_ENABLED: true,
	isFeatureEnabled: () => true,
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

import { useEffectsStore } from "@/stores/ai/effects-store";

describe("effects store reset", () => {
	beforeEach(() => {
		useEffectsStore.setState({
			activeEffects: new Map(),
			effectChains: new Map(),
			selectedEffect: null,
		});
	});

	it("falls back to presets with an explicit matching effect type", () => {
		const legacyEffect: EffectInstance = {
			id: "legacy-motion",
			name: "Legacy motion effect",
			effectType: "motion",
			parameters: {},
			duration: 2,
			enabled: true,
		};
		useEffectsStore.setState({
			activeEffects: new Map([["clip-1", [legacyEffect]]]),
		});

		useEffectsStore.getState().resetEffectToDefaults("clip-1", legacyEffect.id);

		expect(
			useEffectsStore.getState().getElementEffects("clip-1")[0]
		).toMatchObject({
			presetId: "dynamic-camera-shake",
			effectType: "motion",
			renderProgram: { stages: [{ kind: "motion" }] },
		});
	});
});
