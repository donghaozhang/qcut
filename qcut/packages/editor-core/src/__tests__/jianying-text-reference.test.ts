import { describe, expect, it } from "vitest";
import { normalizeJianyingTextStyleReference } from "../jianying-text-reference.js";

function validReference(): Record<string, unknown> {
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind: "ScriptInfoSticker",
		resourceId: "7410240535752903990",
		packageHash: "39B4B7C4E070EDE70AE25AB264C842D4",
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
	};
}

describe("normalizeJianyingTextStyleReference", () => {
	it("returns a canonical path-free runtime reference", () => {
		const normalized = normalizeJianyingTextStyleReference({
			value: {
				...validReference(),
				packagePath: "/Users/example/Jianying/cache/private-package",
			},
		});

		expect(normalized).toEqual({
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "ScriptInfoSticker",
			resourceId: "7410240535752903990",
			packageHash: "39b4b7c4e070ede70ae25ab264c842d4",
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		});
		expect(normalized).not.toHaveProperty("packagePath");
	});

	it.each([
		{ resourceId: "not-an-id" },
		{ packageHash: "short" },
		{ packageKind: "AmazingFeature" },
		{ editMode: "runtime-only" },
		{ slotMapping: "repeat-every-widget" },
		{ timeMapping: "loop" },
		{ templateDuration: 0 },
		{ templateDuration: 61 },
	])("rejects invalid identity or runtime semantics: %o", (override) => {
		expect(
			normalizeJianyingTextStyleReference({
				value: { ...validReference(), ...override },
			})
		).toBeUndefined();
	});
});
