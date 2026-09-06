import { describe, expect, it } from "vitest";
import {
	parseCoverTextLayout,
	describeCoverDependencies,
} from "../jianying-cover-layout";
import type { CoverCachedEntry } from "../jianying-cover-contract";
import { coverLayoutFixture } from "./fixtures/cover-layout";

describe("cover text layout graph", () => {
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
		"vertical",
		"keyframes",
		"nonuniform",
		"flip",
		"missing-material",
		"missing-effect",
		"duplicate",
		"overflow",
	])("blocks %s without partial text import", (kind) => {
		const fixture = coverLayoutFixture();
		if (kind === "vertical") fixture.text.typesetting = 1;
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
