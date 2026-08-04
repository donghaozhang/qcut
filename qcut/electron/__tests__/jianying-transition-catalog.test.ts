import { describe, expect, it } from "vitest";
import {
	JIANYING_TRANSITION_GROUPS,
	JIANYING_TRANSITIONS,
	resolveJianyingTransition,
} from "../jianying-transition-catalog.js";

describe("Jianying transition catalog", () => {
	it("keeps the public Transition Lab catalog complete and unique", () => {
		expect(JIANYING_TRANSITIONS).toHaveLength(20);
		expect(new Set(JIANYING_TRANSITIONS.map(({ id }) => id)).size).toBe(20);
		expect(
			new Set(JIANYING_TRANSITIONS.map(({ resourceId }) => resourceId)).size
		).toBe(20);
		expect(
			new Set(JIANYING_TRANSITIONS.map(({ metadataMd5 }) => metadataMd5)).size
		).toBe(20);
	});

	it("places every transition in a visible subcategory", () => {
		const groupIds = JIANYING_TRANSITION_GROUPS.flatMap(({ id }) =>
			id === "all" ? [] : [id]
		);
		for (const groupId of groupIds) {
			expect(
				JIANYING_TRANSITIONS.some((transition) => transition.group === groupId)
			).toBe(true);
		}
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
	});

	it("contains metadata only, without local runtime paths", () => {
		const serialized = JSON.stringify(JIANYING_TRANSITIONS);
		expect(serialized).not.toContain("/Applications/");
		expect(serialized).not.toContain(".dylib");
		expect(serialized).not.toContain("User Data/Cache");
	});
});
