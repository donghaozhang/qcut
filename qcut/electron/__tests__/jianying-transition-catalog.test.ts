import { describe, expect, it } from "vitest";
import {
	JIANYING_TRANSITION_GROUPS,
	JIANYING_TRANSITIONS,
	getJianyingTransitionCount,
	resolveJianyingTransition,
} from "../jianying-transition-catalog.js";

describe("Jianying transition catalog", () => {
	it("keeps the public Transition Lab catalog complete and unique", () => {
		expect(JIANYING_TRANSITIONS).toHaveLength(280);
		expect(new Set(JIANYING_TRANSITIONS.map(({ id }) => id)).size).toBe(280);
		expect(
			new Set(JIANYING_TRANSITIONS.map(({ resourceId }) => resourceId)).size
		).toBe(280);
		expect(
			new Set(JIANYING_TRANSITIONS.map(({ metadataMd5 }) => metadataMd5)).size
		).toBe(280);
	});

	it("matches the fourteen Jianying categories with twenty entries each", () => {
		const expectedCounts = new Map([
			["ai-one-take", 20],
			["dissolve", 20],
			["split", 20],
			["glitch", 20],
			["light", 20],
			["emoji", 20],
			["slideshow", 20],
			["blur", 20],
			["distortion", 20],
			["shooting", 20],
			["camera", 20],
			["natural", 20],
			["variety", 20],
			["mg", 20],
		] as const);
		expect(JIANYING_TRANSITION_GROUPS).toHaveLength(15);
		for (const [group, count] of expectedCounts) {
			expect(getJianyingTransitionCount({ group })).toBe(count);
		}
	});

	it("records the original Jianying group for curated supplements", () => {
		const curatedSupplements = JIANYING_TRANSITIONS.filter(
			(transition) => transition.group !== transition.sourceGroup
		);
		expect(curatedSupplements).toHaveLength(17);
		expect(
			curatedSupplements.filter(
				(transition) =>
					transition.group === "emoji" && transition.sourceGroup === "variety"
			)
		).toHaveLength(5);
		expect(
			curatedSupplements.filter(
				(transition) =>
					transition.group === "distortion" && transition.sourceGroup === "blur"
			)
		).toHaveLength(12);
	});

	it("keeps AI generation configs out of the local transition segment set", () => {
		expect(
			JIANYING_TRANSITIONS.filter(
				(transition) => transition.runtimeKind === "ai-generation"
			)
		).toHaveLength(20);
		expect(
			JIANYING_TRANSITIONS.filter(
				(transition) => transition.runtimeKind === "transition-segment"
			)
		).toHaveLength(260);
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
