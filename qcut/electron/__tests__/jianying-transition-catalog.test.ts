import { describe, expect, it } from "vitest";
import {
	JIANYING_TRANSITION_GROUPS,
	JIANYING_TRANSITIONS,
	getJianyingTransitionCount,
	resolveJianyingTransition,
} from "../jianying-transition-catalog.js";

describe("Jianying transition catalog", () => {
	it("keeps the public Transition Lab catalog complete and unique", () => {
		expect(JIANYING_TRANSITIONS).toHaveLength(72);
		expect(new Set(JIANYING_TRANSITIONS.map(({ id }) => id)).size).toBe(72);
		expect(
			new Set(JIANYING_TRANSITIONS.map(({ resourceId }) => resourceId)).size
		).toBe(72);
		expect(
			new Set(JIANYING_TRANSITIONS.map(({ metadataMd5 }) => metadataMd5)).size
		).toBe(72);
	});

	it("matches the fourteen Jianying categories with at least five entries each", () => {
		const expectedCounts = new Map([
			["ai-one-take", 5],
			["dissolve", 5],
			["split", 5],
			["glitch", 5],
			["light", 5],
			["emoji", 5],
			["slideshow", 7],
			["blur", 5],
			["distortion", 5],
			["shooting", 5],
			["camera", 5],
			["natural", 5],
			["variety", 5],
			["mg", 5],
		] as const);
		expect(JIANYING_TRANSITION_GROUPS).toHaveLength(15);
		for (const [group, count] of expectedCounts) {
			expect(getJianyingTransitionCount({ group })).toBe(count);
		}
	});

	it("keeps AI generation configs out of the local transition segment set", () => {
		expect(
			JIANYING_TRANSITIONS.filter(
				(transition) => transition.runtimeKind === "ai-generation"
			)
		).toHaveLength(5);
		expect(
			JIANYING_TRANSITIONS.filter(
				(transition) => transition.runtimeKind === "transition-segment"
			)
		).toHaveLength(67);
	});

	it("resolves stable IDs, resource IDs, and localized names", () => {
		const transition = JIANYING_TRANSITIONS[0];
		expect(resolveJianyingTransition({ value: transition.id })).toBe(
			transition
		);
		expect(resolveJianyingTransition({ value: transition.resourceId })).toBe(
			transition
		);
		expect(resolveJianyingTransition({ value: transition.localizedName })).toBe(
			transition
		);
		expect(resolveJianyingTransition({ value: "叠化" })).toMatchObject({
			resourceId: "6724845717472416269",
			runtimeKind: "transition-segment",
		});
		expect(
			resolveJianyingTransition({ value: "jianying-local-3d-space" })
		).toMatchObject({
			resourceId: "7049979667406656014",
		});
	});

	it("contains metadata only, without local runtime paths", () => {
		const serialized = JSON.stringify(JIANYING_TRANSITIONS);
		expect(serialized).not.toContain("/Applications/");
		expect(serialized).not.toContain(".dylib");
		expect(serialized).not.toContain("User Data/Cache");
	});
});
