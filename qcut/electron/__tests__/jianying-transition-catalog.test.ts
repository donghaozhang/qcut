import { describe, expect, it } from "vitest";
import {
	JIANYING_TRANSITION_GROUPS,
	JIANYING_TRANSITIONS,
	getJianyingTransitionCount,
	resolveJianyingTransition,
} from "../jianying-transition-catalog.js";

describe("Jianying transition catalog", () => {
	it("keeps the public Transition Lab catalog complete and unique", () => {
		expect(JIANYING_TRANSITIONS).toHaveLength(540);
		expect(new Set(JIANYING_TRANSITIONS.map(({ id }) => id)).size).toBe(540);
		expect(
			new Set(JIANYING_TRANSITIONS.map(({ resourceId }) => resourceId)).size
		).toBe(540);
		expect(
			new Set(JIANYING_TRANSITIONS.map(({ metadataMd5 }) => metadataMd5)).size
		).toBe(540);
	});

	it("keeps twenty AI recipes and forty entries in every binary category", () => {
		const expectedCounts = new Map([
			["ai-one-take", 20],
			["dissolve", 40],
			["split", 40],
			["glitch", 40],
			["light", 40],
			["emoji", 40],
			["slideshow", 40],
			["blur", 40],
			["distortion", 40],
			["shooting", 40],
			["camera", 40],
			["natural", 40],
			["variety", 40],
			["mg", 40],
		] as const);
		expect(JIANYING_TRANSITION_GROUPS).toHaveLength(15);
		for (const [group, count] of expectedCounts) {
			expect(getJianyingTransitionCount({ group })).toBe(count);
		}
	});

	it("records the original Jianying group for sparse-category supplements", () => {
		const sparseCategorySupplements = JIANYING_TRANSITIONS.filter(
			(transition) => transition.group !== transition.sourceGroup
		);
		expect(sparseCategorySupplements).toHaveLength(63);
		for (const [group, sourceGroup, count] of [
			["emoji", "variety", 6],
			["emoji", "natural", 3],
			["emoji", "light", 16],
			["distortion", "blur", 16],
			["distortion", "camera", 16],
			["mg", "split", 6],
		] as const) {
			expect(
				sparseCategorySupplements.filter(
					(transition) =>
						transition.group === group && transition.sourceGroup === sourceGroup
				)
			).toHaveLength(count);
		}
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
		).toHaveLength(520);
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
