import { describe, it, expect } from "vitest";
import { assertCoverText, createCoverText } from "../index.js";
import { normalizeJianyingTextRuntimeReference } from "../../assets/jianying-text-reference.js";
import type {
	JianyingTextStyleReference,
	TextFontAssetReference,
} from "../../types/timeline.js";

const reference: JianyingTextStyleReference = {
	schemaVersion: 1,
	source: "jianying-cache",
	resourceId: "123",
	packageHash: "a".repeat(32),
	packageKind: "InfoSticker",
	editMode: "runtime-with-preload-fallback",
	slotMapping: "line-to-widget",
	timeMapping: "stretch",
	templateDuration: 3,
};
const font: TextFontAssetReference = {
	kind: "local-font",
	source: "jianying-cache",
	assetId: `sha256:${"b".repeat(64)}`,
	cssFamily: `QCutLocal_${"b".repeat(20)}`,
	familyName: "Fixture Font",
	fullName: "Fixture Font Regular",
	postscriptName: "FixtureFont",
};
const text = createCoverText({
	id: "manual",
	content: "Title",
	canvas: { width: 1920, height: 1080, backgroundColor: "#000000" },
});
describe("cover native text references", () => {
	it("rejects orphan and malformed color modes while preserving legacy defaults", () => {
		expect(() =>
			assertCoverText({
				layer: { ...text, nativeUseEffectDefaultColor: false },
			})
		).toThrow("color mode");
		for (const nativeUseEffectDefaultColor of [true, false, undefined])
			expect(() =>
				assertCoverText({
					layer: {
						...text,
						jianyingTextStyle: reference,
						nativeUseEffectDefaultColor,
					},
				})
			).not.toThrow();
		expect(() =>
			assertCoverText({
				layer: {
					...text,
					jianyingTextStyle: reference,
					nativeUseEffectDefaultColor: "false" as unknown as boolean,
				},
			})
		).toThrow("color mode");
	});
	it.each([
		"TextStyle",
		"InfoSticker",
		"ScriptInfoSticker",
	] as const)("round-trips %s and content-addressed fonts", (packageKind) => {
		const saved = {
			...text,
			jianyingTextStyle: { ...reference, packageKind },
			fontAsset: font,
			nativeFrameTime: 1.1,
			nativeUseEffectDefaultColor: false,
		};
		const restored = JSON.parse(JSON.stringify(saved));
		expect(() => assertCoverText({ layer: restored })).not.toThrow();
		expect(restored).toEqual(saved);
	});
	it.each([
		-1,
		3,
		Infinity,
		NaN,
	])("rejects frame time %s outside the package", (nativeFrameTime) => {
		expect(() =>
			assertCoverText({
				layer: { ...text, jianyingTextStyle: reference, nativeFrameTime },
			})
		).toThrow();
	});
	it("rejects orphan frame times, unsafe identities and incompatible references", () => {
		expect(() =>
			assertCoverText({ layer: { ...text, nativeFrameTime: 0 } })
		).toThrow();
		for (const invalid of [
			{ ...reference, resourceId: "../x" },
			{ ...reference, packageHash: "bad" },
			{ ...reference, templateDuration: 0 },
			{ ...reference, animations: { loop: { duration: -1 } } },
		]) {
			expect(
				normalizeJianyingTextRuntimeReference({ value: invalid })
			).toBeNull();
		}
	});
	it("rejects mismatched font identities and unsafe CSS families", () => {
		for (const invalid of [
			{ ...font, assetId: "file:///tmp/a.ttf" },
			{ ...font, cssFamily: "arbitrary, serif" },
			{ ...font, familyName: null },
		]) {
			expect(() =>
				assertCoverText({
					layer: { ...text, fontAsset: invalid as TextFontAssetReference },
				})
			).toThrow();
		}
	});
	it("shares runtime normalization and strips nonpersistent private metadata", () => {
		expect(
			normalizeJianyingTextRuntimeReference({
				value: {
					...reference,
					packagePath: "/private/package",
					packageHash: "A".repeat(32),
				},
			})
		).toEqual(reference);
	});
});
