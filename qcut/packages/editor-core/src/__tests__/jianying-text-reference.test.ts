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

	it("accepts TextStyle references for host-text runtime rendering", () => {
		expect(
			normalizeJianyingTextStyleReference({
				value: { ...validReference(), packageKind: "TextStyle" },
			})
		).toMatchObject({
			packageKind: "TextStyle",
			packageHash: "39b4b7c4e070ede70ae25ab264c842d4",
		});
	});

	it("normalizes all three path-free animation slots", () => {
		expect(
			normalizeJianyingTextStyleReference({
				value: {
					...validReference(),
					animations: {
						entrance: {
							source: "jianying-cache",
							resourceId: "1001",
							packageHash: "A".repeat(32),
							duration: 0.5,
							packagePath: "/private/entrance",
						},
						exit: {
							source: "jianying-cache",
							resourceId: "1002",
							packageHash: "B".repeat(32),
							duration: 0.75,
						},
						loop: {
							source: "jianying-cache",
							resourceId: "1003",
							packageHash: "C".repeat(32),
							duration: 1.2,
						},
					},
				},
			})
		).toMatchObject({
			animations: {
				entrance: {
					resourceId: "1001",
					packageHash: "a".repeat(32),
					duration: 0.5,
				},
				exit: {
					resourceId: "1002",
					packageHash: "b".repeat(32),
					duration: 0.75,
				},
				loop: {
					resourceId: "1003",
					packageHash: "c".repeat(32),
					duration: 1.2,
				},
			},
		});
	});

	it.each([
		{ source: "copied-package" },
		{ resourceId: "bad-id" },
		{ packageHash: "short" },
		{ duration: 0 },
		{ duration: 61 },
	])("rejects an invalid declared animation: %o", (override) => {
		expect(
			normalizeJianyingTextStyleReference({
				value: {
					...validReference(),
					animations: {
						loop: {
							source: "jianying-cache",
							resourceId: "1003",
							packageHash: "c".repeat(32),
							duration: 1,
							...override,
						},
					},
				},
			})
		).toBeUndefined();
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
