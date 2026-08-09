import { describe, expect, it } from "vitest";
import {
	CAPCUT_8_1_PROFILE_ID,
	CAPCUT_NATIVE_DISSOLVE_METADATA,
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";

const TRANSITION_ID = "00000000-0000-4000-8000-000000000003";

function createContent({
	resourceId = CAPCUT_NATIVE_DISSOLVE_METADATA.resourceId,
	secondStart = 2_000_000,
}: {
	resourceId?: string;
	secondStart?: number;
} = {}) {
	return {
		id: "draft-1",
		canvas_config: { width: 1920, height: 1080 },
		fps: 30,
		duration: 4_000_000,
		materials: {
			videos: [
				{
					id: "video-1",
					duration: 2_000_000,
					material_name: "first.mp4",
					path: "/private/first.mp4",
					type: "video",
				},
				{
					id: "video-2",
					duration: 2_000_000,
					material_name: "second.mp4",
					path: "/private/second.mp4",
					type: "video",
				},
			],
			transitions: [
				{
					category_id: "",
					category_name: "",
					duration: CAPCUT_NATIVE_DISSOLVE_METADATA.defaultDuration,
					effect_id: CAPCUT_NATIVE_DISSOLVE_METADATA.effectId,
					id: TRANSITION_ID,
					is_overlap: CAPCUT_NATIVE_DISSOLVE_METADATA.isOverlap,
					name: CAPCUT_NATIVE_DISSOLVE_METADATA.name,
					platform: "all",
					resource_id: resourceId,
					type: "transition",
				},
			],
		},
		tracks: [
			{
				id: "track-1",
				type: "video",
				segments: [
					{
						id: "segment-1",
						material_id: "video-1",
						extra_material_refs: [TRANSITION_ID],
						source_timerange: { start: 0, duration: 2_000_000 },
						target_timerange: { start: 0, duration: 2_000_000 },
					},
					{
						id: "segment-2",
						material_id: "video-2",
						extra_material_refs: [],
						source_timerange: { start: 0, duration: 2_000_000 },
						target_timerange: {
							start: secondStart,
							duration: 2_000_000,
						},
					},
				],
			},
		],
	};
}

function normalize({
	resourceId,
	secondStart,
}: {
	resourceId?: string;
	secondStart?: number;
} = {}) {
	return normalizeRawDraft({
		content: createContent({
			...(resourceId === undefined ? {} : { resourceId }),
			...(secondStart === undefined ? {} : { secondStart }),
		}),
		source: {
			product: "capcut",
			profileId: CAPCUT_8_1_PROFILE_ID,
			platform: "macos",
			files: [],
		},
		contentFileName: "draft_info.json",
	});
}

describe("CapCut 8.1 transition import", () => {
	it("maps the verified native dissolve without degrading its media", () => {
		const result = normalize();
		const track = result.document.timelines[0].tracks[0];
		expect(track.segments.map(({ capability }) => capability)).toEqual([
			"exact",
			"exact",
		]);
		expect(track.capability).toBe("exact");
		expect(track.transitions).toEqual([
			{
				id: TRANSITION_ID,
				type: "dissolve",
				fromSegmentId: "segment-1",
				toSegmentId: "segment-2",
				durationUs: CAPCUT_NATIVE_DISSOLVE_METADATA.defaultDuration,
				capability: "exact",
				foreignRef: TRANSITION_ID,
			},
		]);
		expect(
			result.bindings.find(({ foreignRef }) => foreignRef === TRANSITION_ID)
				?.jsonPointer
		).toBe("/materials/transitions/0");

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.tracks[0].elements).toHaveLength(2);
		expect(plan.tracks[0].transitions).toEqual([
			{
				id: TRANSITION_ID,
				fromElementId: "segment-1",
				toElementId: "segment-2",
				presetId: "dissolve",
				type: "dissolve",
				duration: CAPCUT_NATIVE_DISSOLVE_METADATA.defaultDuration / 1_000_000,
				easing: "easeInOut",
			},
		]);
	});

	it("keeps media exact while an unknown transition is declared downgraded", () => {
		const { document } = normalize({ resourceId: "unverified-resource" });
		const track = document.timelines[0].tracks[0];
		expect(track.segments.map(({ capability }) => capability)).toEqual([
			"exact",
			"exact",
		]);
		expect(track.transitions?.[0]).toMatchObject({
			type: "unknown",
			capability: "downgrade",
		});
		expect(track.capability).toBe("downgrade");

		const plan = mapInteropDocumentToQCutPlan({ document });
		expect(plan.tracks[0].elements).toHaveLength(2);
		expect(plan.tracks[0].transitions).toBeUndefined();
		expect(plan.skipped).toContainEqual(
			expect.objectContaining({
				nodeId: TRANSITION_ID,
				nodeType: "transition",
				capability: "downgrade",
			})
		);
	});

	it("blocks a transition whose segments do not touch", () => {
		const { document } = normalize({ secondStart: 2_500_000 });
		const transition = document.timelines[0].tracks[0].transitions?.[0];
		expect(transition?.capability).toBe("blocked");
		expect(
			document.issues.some(
				({ code, subjectId }) =>
					code === "TIME_RANGE_INVALID" && subjectId === TRANSITION_ID
			)
		).toBe(true);
	});
});
