import { createHash } from "node:crypto";
import type { DraftSourceDescriptor } from "../../draft-interop/document.js";
import { JIANYING_11_3_BETA2_PROFILE_ID } from "../../jianying-draft/index.js";

export const JIANYING_COMPOUND_DURATION_US = 3_000_000;

export function encodeJianyingCompoundContent({
	content,
}: {
	content: Record<string, unknown>;
}): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(content));
}

export function createJianying113CompoundSource({
	bytes,
}: {
	bytes: Uint8Array;
}): DraftSourceDescriptor {
	return {
		product: "jianying",
		profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		platform: "macos",
		files: [
			{
				relativePath: "draft_content.json",
				byteLength: bytes.byteLength,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				role: "content",
				classification: "plaintext-json",
			},
		],
	};
}

export function createJianying113InnerDraft({
	durationUs = JIANYING_COMPOUND_DURATION_US,
}: {
	durationUs?: number;
} = {}): Record<string, unknown> {
	return {
		id: "inner-draft",
		name: "Compound Clip 1",
		canvas_config: { width: 1280, height: 720 },
		duration: durationUs,
		fps: 30,
		tracks: [
			{
				id: "inner-track",
				type: "mixed",
				segments: [
					{
						id: "inner-segment",
						material_id: "inner-video",
						extra_material_refs: [],
						source_timerange: {
							start: 0,
							duration: durationUs,
						},
						target_timerange: {
							start: 0,
							duration: durationUs,
						},
						speed: 1,
						unknown_inner_segment: { preserve: true },
					},
				],
			},
		],
		materials: {
			videos: [
				{
					id: "inner-video",
					type: "video",
					duration: durationUs,
					material_name: "calibration.mp4",
					path: "/private/calibration.mp4",
				},
			],
		},
		unknown_inner_top_level: { preserve: [1, 2, 3] },
	};
}

export function createJianying113CompoundWrapper({
	innerDurationUs = JIANYING_COMPOUND_DURATION_US,
	neutralWrapper = true,
	wrapperDurationUs = JIANYING_COMPOUND_DURATION_US,
}: {
	innerDurationUs?: number;
	neutralWrapper?: boolean;
	wrapperDurationUs?: number;
} = {}): Record<string, unknown> {
	return {
		id: "outer-wrapper",
		name: "",
		canvas_config: neutralWrapper
			? { width: 0, height: 0 }
			: { width: 1920, height: 1080 },
		duration: neutralWrapper ? 0 : wrapperDurationUs,
		fps: 30,
		tracks: [
			{
				id: "outer-track",
				type: "mixed",
				segments: [
					{
						id: "outer-segment",
						material_id: "outer-video",
						extra_material_refs: ["compound-material"],
						source_timerange: {
							start: 0,
							duration: wrapperDurationUs,
						},
						target_timerange: {
							start: 0,
							duration: wrapperDurationUs,
						},
						speed: 1,
					},
				],
			},
		],
		materials: {
			drafts: [
				{
					id: "compound-material",
					draft: createJianying113InnerDraft({ durationUs: innerDurationUs }),
					draft_file_path: "##_subdraft_placeholder_##/draft_content.json",
					type: "combination",
				},
			],
			videos: [
				{
					id: "outer-video",
					type: "video",
					duration: wrapperDurationUs,
					material_name: "Compound Clip 1",
					path: "",
				},
			],
		},
		unknown_outer_top_level: { preserve: "sentinel" },
	};
}
