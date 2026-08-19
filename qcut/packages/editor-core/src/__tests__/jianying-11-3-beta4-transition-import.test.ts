import { describe, expect, it } from "vitest";
import {
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import {
	BETA4_VIDEO_DURATION_US,
	createJianying113Beta4AdjacentVideoFixture,
	createJianying113Beta4AdjacentVideoSource,
	readInnerBeta4AdjacentDraft,
} from "./support/jianying-11-3-beta4-video-fixture.js";

const TRANSITION_UUID = "b7f9c2d4-3a1e-4f6b-9c8d-2e5a7b9c1d3f";

/** Attaches one transition material to the first segment's seam. */
function attachTransition({
	content,
	duration = 500_000,
	effectId,
	isOverlap,
	name,
	resourceId,
}: {
	content: Record<string, unknown>;
	duration?: number;
	effectId: string;
	isOverlap: boolean;
	name: string;
	resourceId: string;
}): void {
	const inner = readInnerBeta4AdjacentDraft({ content });
	const materials = inner.materials as Record<string, unknown>;
	materials.transitions = [
		{
			category_id: "",
			category_name: "",
			duration,
			effect_id: effectId,
			id: TRANSITION_UUID,
			is_overlap: isOverlap,
			name,
			platform: "all",
			resource_id: resourceId,
			type: "transition",
		},
	];
	const tracks = inner.tracks as Array<{
		segments: Array<Record<string, unknown>>;
	}>;
	const first = tracks[0]?.segments[0];
	if (first === undefined) throw new Error("fixture has no first segment");
	(first.extra_material_refs as string[]).push(TRANSITION_UUID);
}

function normalizeFixture({ content }: { content: Record<string, unknown> }) {
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createJianying113Beta4AdjacentVideoSource({ content }),
	});
}

describe("Jianying 11.3 beta4 seam transition import (L5)", () => {
	it("maps the verified native dissolve as exact", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachTransition({
			content,
			effectId: "322577",
			isOverlap: true,
			name: "叠化",
			resourceId: "6724845717472416269",
		});

		const result = normalizeFixture({ content });
		const transition =
			result.document.timelines[0]?.tracks[0]?.transitions?.[0];
		expect(transition).toMatchObject({ capability: "exact", type: "dissolve" });

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.tracks[0]?.transitions?.[0]).toMatchObject({
			presetId: "dissolve",
			type: "dissolve",
			duration: 0.5,
		});
		expect(plan.downgrades).toBeUndefined();
	});

	it("maps a catalogued native transition onto its lab preset as a declared downgrade", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachTransition({
			content,
			effectId: "321493",
			isOverlap: true,
			name: "左移",
			resourceId: "6726711499676455435",
		});

		const result = normalizeFixture({ content });
		const transition =
			result.document.timelines[0]?.tracks[0]?.transitions?.[0];
		expect(transition).toMatchObject({
			capability: "downgrade",
			preset: { presetId: "move-left", clipType: "push", direction: "right" },
		});
		expect(transition?.downgrade?.approximation).toBe(
			"transition-preset:move-left"
		);

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.tracks[0]?.transitions?.[0]).toMatchObject({
			presetId: "move-left",
			type: "push",
			direction: "right",
			easing: "easeInOutQuint",
		});
		expect(plan.downgrades).toEqual([
			{
				nodeId: TRANSITION_UUID,
				nodeType: "transition",
				approximation: "transition-preset:move-left",
				fidelityEvidence: expect.stringContaining("jianying-transition-lab"),
			},
		]);
	});

	it("keeps unknown transition identities out of the plan", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachTransition({
			content,
			effectId: "999999",
			isOverlap: true,
			name: "某未知转场",
			resourceId: "7000000000000000000",
		});

		const result = normalizeFixture({ content });
		expect(
			result.document.timelines[0]?.tracks[0]?.transitions?.[0]?.capability
		).toBe("downgrade");

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.tracks[0]?.transitions ?? []).toHaveLength(0);
		expect(plan.downgrades).toBeUndefined();
		expect(plan.skipped).toContainEqual({
			nodeId: TRANSITION_UUID,
			nodeType: "transition",
			capability: "downgrade",
			reason: "transition downgrade carries no preset mapping",
		});
	});

	it("blocks a catalogued transition on a broken seam", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachTransition({
			content,
			effectId: "321493",
			isOverlap: true,
			name: "左移",
			resourceId: "6726711499676455435",
		});
		// Pull the second segment 1s later so the seam no longer touches.
		const inner = readInnerBeta4AdjacentDraft({ content });
		const tracks = inner.tracks as Array<{
			segments: Array<Record<string, unknown>>;
		}>;
		const second = tracks[0]?.segments[1];
		if (second === undefined) throw new Error("fixture has no second segment");
		(second.target_timerange as Record<string, unknown>).start =
			BETA4_VIDEO_DURATION_US + 1_000_000;

		const result = normalizeFixture({ content });
		expect(
			result.document.timelines[0]?.tracks[0]?.transitions?.[0]?.capability
		).toBe("blocked");
	});
});
