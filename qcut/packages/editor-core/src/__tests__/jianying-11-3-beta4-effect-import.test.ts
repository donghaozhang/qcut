import { describe, expect, it } from "vitest";
import type { JianyingLocalEffectCapabilities } from "../jianying-draft/index.js";
import {
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import {
	createJianying113Beta4AdjacentVideoFixture,
	createJianying113Beta4AdjacentVideoSource,
	readInnerBeta4AdjacentDraft,
} from "./support/jianying-11-3-beta4-video-fixture.js";

const EFFECT_MATERIAL_UUID = "f4a8c2e6-3b7d-4e1f-9a5c-8d2b6f0e4a7c";
const EFFECT_RESOURCE_ID = "7012345678901234567";
const EFFECT_PACKAGE_HASH = "c".repeat(32);

/** Adds one effect track with one segment to the inner draft. */
function attachEffectTrack({
	content,
	name,
	resourceId,
}: {
	content: Record<string, unknown>;
	name: string;
	resourceId: string;
}): void {
	const inner = readInnerBeta4AdjacentDraft({ content });
	const materials = inner.materials as Record<string, unknown>;
	materials.video_effects = [
		{
			category_id: "",
			category_name: "",
			effect_id: "112233",
			id: EFFECT_MATERIAL_UUID,
			name,
			platform: "all",
			resource_id: resourceId,
			type: "video_effect",
		},
	];
	const tracks = inner.tracks as Array<Record<string, unknown>>;
	tracks.push({
		id: "effect-track",
		segments: [
			{
				extra_material_refs: [],
				id: "effect-segment",
				material_id: EFFECT_MATERIAL_UUID,
				target_timerange: { duration: 2_000_000, start: 500_000 },
			},
		],
		type: "effect",
	});
}

function localCapabilities(): JianyingLocalEffectCapabilities {
	return new Map([
		[
			EFFECT_RESOURCE_ID,
			{
				presetId: "jy-effect-112233",
				name: "星火",
				packageHash: EFFECT_PACKAGE_HASH,
				adjustParameters: [
					{
						key: "effects_adjust_speed",
						defaultValue: 0.33,
						minimum: 0,
						maximum: 1,
					},
				],
			},
		],
	]);
}

function normalizeFixture({
	content,
	localJianyingEffects,
}: {
	content: Record<string, unknown>;
	localJianyingEffects?: JianyingLocalEffectCapabilities;
}) {
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createJianying113Beta4AdjacentVideoSource({ content }),
		...(localJianyingEffects === undefined ? {} : { localJianyingEffects }),
	});
}

function findEffectSegment(result: ReturnType<typeof normalizeFixture>) {
	return result.document.timelines[0]?.tracks
		.find((track) => track.kind === "effect")
		?.segments.find((segment) => segment.id === "effect-segment");
}

describe("Jianying 11.3 beta4 effect segment import (L7)", () => {
	it("maps a locally installed effect as a declared machine-bound downgrade", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachEffectTrack({
			content,
			name: "星火",
			resourceId: EFFECT_RESOURCE_ID,
		});

		const result = normalizeFixture({
			content,
			localJianyingEffects: localCapabilities(),
		});
		const segment = findEffectSegment(result);
		expect(segment).toMatchObject({
			capability: "downgrade",
			effectPreset: {
				presetId: "jy-effect-112233",
				name: "星火",
				packageHash: EFFECT_PACKAGE_HASH,
			},
		});
		expect(segment?.downgrade?.approximation).toBe(
			"jianying-local-effect:jy-effect-112233"
		);

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		const effectTrack = plan.tracks.find((track) => track.type === "effect");
		expect(effectTrack?.elements[0]).toMatchObject({
			type: "effect",
			name: "星火",
			startTime: 0.5,
			duration: 2,
			effect: {
				presetId: "jy-effect-112233",
				packageHash: EFFECT_PACKAGE_HASH,
				adjustParameters: [
					{
						key: "effects_adjust_speed",
						defaultValue: 0.33,
						minimum: 0,
						maximum: 1,
					},
				],
			},
		});
		expect(plan.downgrades).toContainEqual({
			nodeId: "effect-segment",
			nodeType: "segment",
			approximation: "jianying-local-effect:jy-effect-112233",
			fidelityEvidence: expect.stringContaining("locally installed"),
		});
	});

	it("keeps effect segments opaque when no local capabilities are supplied", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachEffectTrack({
			content,
			name: "星火",
			resourceId: EFFECT_RESOURCE_ID,
		});

		const result = normalizeFixture({ content });
		expect(findEffectSegment(result)?.capability).toBe("opaque");

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(
			plan.tracks.find((track) => track.type === "effect")
		).toBeUndefined();
		expect(plan.skipped).toContainEqual(
			expect.objectContaining({
				nodeId: "effect-segment",
				capability: "opaque",
			})
		);
	});

	it("keeps effect segments opaque when the package is not installed locally", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachEffectTrack({
			content,
			name: "星火",
			resourceId: "7099999999999999999",
		});

		const result = normalizeFixture({
			content,
			localJianyingEffects: localCapabilities(),
		});
		expect(findEffectSegment(result)?.capability).toBe("opaque");
	});

	it("rejects a catalogued id whose name does not match the local catalog", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachEffectTrack({
			content,
			name: "不是星火",
			resourceId: EFFECT_RESOURCE_ID,
		});

		const result = normalizeFixture({
			content,
			localJianyingEffects: localCapabilities(),
		});
		expect(findEffectSegment(result)?.capability).toBe("opaque");
	});
});
