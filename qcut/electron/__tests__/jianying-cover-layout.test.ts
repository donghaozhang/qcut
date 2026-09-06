import { describe, expect, it } from "vitest";
import {
	parseCoverTextLayout,
	describeCoverDependencies,
} from "../jianying-cover-layout";
import type { CoverCachedEntry } from "../jianying-cover-contract";
import { coverLayoutFixture } from "./fixtures/cover-layout";

describe("cover text layout graph", () => {
	it("accepts sideways Latin text while preserving source content and rotation", () => {
		const fixture = coverLayoutFixture();
		fixture.text.typesetting = 1;
		fixture.text.content = "TRAVEL WITH FRIENDS\n";
		fixture.segment.clip.rotation = 25;
		const layout = parseCoverTextLayout({ definition: fixture.definition });
		expect(layout.texts[0].text).toMatchObject({
			typesetting: 1,
			content: "TRAVEL WITH FRIENDS\n",
		});
		expect(layout.texts[0].segment.clip.rotation).toBe(25);
	});
	it.each([
		"中文竖排",
		"Latin 中文",
		"A\tB",
		"e\u0301",
		"🙂",
	])("rejects unverified vertical glyph layout %s", (content) => {
		const fixture = coverLayoutFixture();
		fixture.text.typesetting = 1;
		fixture.text.content = content;
		expect(() =>
			parseCoverTextLayout({ definition: fixture.definition })
		).toThrow("plain Latin");
	});
	it("rejects vertical native effects rather than rotating an unverified layout", () => {
		const fixture = coverLayoutFixture();
		fixture.text.typesetting = 1;
		fixture.segment.extra_material_refs = [fixture.effect.id];
		expect(() =>
			parseCoverTextLayout({ definition: fixture.definition })
		).toThrow("plain Latin");
	});
	it.each([
		false,
		true,
		undefined,
	])("preserves native effect color mode %s", (mode) => {
		const fixture = coverLayoutFixture();
		Object.assign(fixture.text, { use_effect_default_color: mode });
		expect(
			parseCoverTextLayout({ definition: fixture.definition }).texts[0].text
				.use_effect_default_color
		).toBe(mode);
		Object.assign(fixture.text, { use_effect_default_color: "false" });
		expect(() =>
			parseCoverTextLayout({ definition: fixture.definition })
		).toThrow();
	});
	it("imports text and does not confuse referenced background filters with text dependencies", () => {
		const fixture = coverLayoutFixture();
		const entry = {
			dependencies: [
				{ reference: fixture.filter.path, status: "missing", files: [] },
				{ reference: fixture.fontReference, status: "cached", files: [] },
			],
		} as unknown as CoverCachedEntry;
		const dependencies = describeCoverDependencies({
			entry,
			definition: fixture.definition,
		});
		expect(dependencies.map((item) => item.usage)).toEqual([
			{
				role: "background",
				name: fixture.filter.name,
				resourceId: "456",
				kind: "filter",
			},
			{
				role: "text",
				name: fixture.text.font_title,
				resourceId: "",
				kind: "font",
			},
		]);
		expect(
			parseCoverTextLayout({ definition: fixture.definition }).texts
		).toHaveLength(1);
	});
	it("keeps shared and unreferenced dependencies unresolved rather than labeling them background-only", () => {
		const fixture = coverLayoutFixture();
		fixture.segment.extra_material_refs = [fixture.filter.id];
		const entry = {
			dependencies: [
				{ reference: fixture.filter.path, status: "missing", files: [] },
				{ reference: "unknown", status: "missing", files: [] },
			],
		} as unknown as CoverCachedEntry;
		expect(
			describeCoverDependencies({ entry, definition: fixture.definition }).map(
				(item) => item.usage.role
			)
		).toEqual(["unknown", "unknown"]);
	});
	it("preserves native effect ownership and render order", () => {
		const fixture = coverLayoutFixture();
		fixture.segment.extra_material_refs = [fixture.effect.id];
		fixture.definition.cover.cover_draft.tracks[0].segments.push({
			...fixture.segment,
			id: "front",
			render_index: 1,
		});
		const layout = parseCoverTextLayout({ definition: fixture.definition });
		expect(layout.texts.map((item) => item.segment.id)).toEqual([
			"front",
			"segment-1",
		]);
		expect(layout.texts[0].effect).toEqual(fixture.effect);
	});
	it("accepts display-only style names with explicit color and outline parameters", () => {
		const fixture = coverLayoutFixture();
		Object.assign(fixture.text, {
			style_name: "Yellow text with black outline",
			text_color: "#ffde00",
			border_color: "#000000",
			border_width: 0.0435,
		});
		const layout = parseCoverTextLayout({ definition: fixture.definition });
		expect(layout.texts[0].text).toMatchObject({
			style_name: "Yellow text with black outline",
			text_color: "#ffde00",
			border_color: "#000000",
			border_width: 0.0435,
		});
		expect(layout.texts[0].effect).toBeUndefined();
	});
	it.each([
		"unknown-typesetting",
		"keyframes",
		"nonuniform",
		"flip",
		"missing-material",
		"missing-effect",
		"duplicate",
		"overflow",
	])("blocks %s without partial text import", (kind) => {
		const fixture = coverLayoutFixture();
		if (kind === "unknown-typesetting") fixture.text.typesetting = 2;
		if (kind === "keyframes") fixture.segment.keyframe_refs = ["animation"];
		if (kind === "nonuniform") fixture.segment.clip.scale.y = 2;
		if (kind === "flip") fixture.segment.clip.flip.horizontal = true;
		if (kind === "missing-material") fixture.segment.material_id = "absent";
		if (kind === "missing-effect")
			fixture.segment.extra_material_refs = ["absent"];
		if (kind === "duplicate")
			fixture.definition.cover.cover_draft.tracks[0].segments.push(
				fixture.segment
			);
		if (kind === "overflow") fixture.text.content = "x".repeat(2001);
		expect(() =>
			parseCoverTextLayout({ definition: fixture.definition })
		).toThrow();
	});
});
