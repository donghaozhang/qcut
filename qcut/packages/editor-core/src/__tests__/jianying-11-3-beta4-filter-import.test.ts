import { describe, expect, it } from "vitest";
import {
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import {
	createJianying113Beta4AdjacentVideoFixture,
	createJianying113Beta4AdjacentVideoSource,
	readInnerBeta4AdjacentDraft,
} from "./support/jianying-11-3-beta4-video-fixture.js";

const FILTER_UUID = "e2a4c6d8-1b3f-4a5c-8d7e-9f0a1b2c3d4e";

/** Attaches one filter material to the first segment. */
function attachFilter({
	content,
	name,
	resourceId,
	value,
}: {
	content: Record<string, unknown>;
	name: string;
	resourceId: string;
	value?: number;
}): void {
	const inner = readInnerBeta4AdjacentDraft({ content });
	const materials = inner.materials as Record<string, unknown>;
	materials.filters = [
		{
			category_id: "",
			category_name: "",
			id: FILTER_UUID,
			name,
			platform: "all",
			resource_id: resourceId,
			type: "filter",
			...(value === undefined ? {} : { value }),
		},
	];
	const tracks = inner.tracks as Array<{
		segments: Array<Record<string, unknown>>;
	}>;
	const first = tracks[0]?.segments[0];
	if (first === undefined) throw new Error("fixture has no first segment");
	(first.extra_material_refs as string[]).push(FILTER_UUID);
}

function normalizeFixture({ content }: { content: Record<string, unknown> }) {
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createJianying113Beta4AdjacentVideoSource({ content }),
	});
}

describe("Jianying 11.3 beta4 segment filter import (L6)", () => {
	it("maps a catalogued filter onto its fitted recipe as a declared downgrade", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachFilter({
			content,
			name: "怀旧",
			resourceId: "7494564488704806198",
			value: 0.8,
		});

		const result = normalizeFixture({ content });
		const [first, second] =
			result.document.timelines[0]?.tracks[0]?.segments ?? [];
		expect(first).toMatchObject({
			capability: "downgrade",
			filterPreset: {
				presetId: "jy-nostalgia",
				presetVersion: 1,
				intensity: 80,
			},
		});
		expect(first?.downgrade?.approximation).toBe(
			"filter-lut-recipe:jy-nostalgia"
		);
		expect(second?.capability).toBe("exact");

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		const element = plan.tracks[0]?.elements[0];
		expect(element?.type === "media" ? element.filter : undefined).toEqual({
			presetId: "jy-nostalgia",
			presetVersion: 1,
			intensity: 80,
		});
		expect(plan.downgrades).toEqual([
			{
				nodeId: first?.id,
				nodeType: "segment",
				approximation: "filter-lut-recipe:jy-nostalgia",
				fidelityEvidence: expect.stringContaining("FilterLutRecipe"),
			},
		]);
	});

	it("defaults a missing intensity value to full strength", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachFilter({
			content,
			name: "橙蓝",
			resourceId: "7127561047048850718",
		});

		const result = normalizeFixture({ content });
		expect(
			result.document.timelines[0]?.tracks[0]?.segments[0]?.filterPreset
		).toEqual({ presetId: "jy-orange-teal", presetVersion: 1, intensity: 100 });
	});

	it("keeps unknown filter identities opaque and out of the plan", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachFilter({
			content,
			name: "某未知滤镜",
			resourceId: "7000000000000000001",
			value: 0.5,
		});

		const result = normalizeFixture({ content });
		const first = result.document.timelines[0]?.tracks[0]?.segments[0];
		expect(first?.capability).toBe("opaque");
		expect(first?.filterPreset).toBeUndefined();

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.downgrades).toBeUndefined();
		expect(plan.skipped).toContainEqual(
			expect.objectContaining({ nodeId: first?.id, capability: "opaque" })
		);
	});

	it("rejects a catalogued id whose name does not match", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachFilter({
			content,
			name: "不是怀旧",
			resourceId: "7494564488704806198",
			value: 0.5,
		});

		const result = normalizeFixture({ content });
		expect(
			result.document.timelines[0]?.tracks[0]?.segments[0]?.capability
		).toBe("opaque");
	});

	it("rejects an out-of-range intensity value", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachFilter({
			content,
			name: "怀旧",
			resourceId: "7494564488704806198",
			value: 1.5,
		});

		const result = normalizeFixture({ content });
		expect(
			result.document.timelines[0]?.tracks[0]?.segments[0]?.capability
		).toBe("opaque");
	});
});
