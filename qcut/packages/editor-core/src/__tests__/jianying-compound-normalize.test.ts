import { describe, expect, it } from "vitest";
import type { DraftSourceDescriptor } from "../draft-interop/document.js";
import {
	JIANYING_11_3_BETA2_PROFILE_ID,
	normalizeRawDraft,
} from "../jianying-draft/index.js";

const DURATION_US = 3_000_000;

function createSource(): DraftSourceDescriptor {
	return {
		product: "jianying",
		profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		platform: "macos",
		files: [
			{
				relativePath: "draft_content.json",
				byteLength: 4096,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
			},
		],
	};
}

function createInnerDraft(): Record<string, unknown> {
	return {
		id: "inner-draft",
		name: "Compound Clip 1",
		canvas_config: { width: 1280, height: 720 },
		duration: DURATION_US,
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
						source_timerange: { start: 0, duration: DURATION_US },
						target_timerange: { start: 0, duration: DURATION_US },
						speed: 1,
					},
				],
			},
		],
		materials: {
			videos: [
				{
					id: "inner-video",
					type: "video",
					duration: DURATION_US,
					material_name: "calibration.mp4",
					path: "/private/calibration.mp4",
				},
			],
		},
	};
}

function createCompoundWrapper({
	neutralWrapper = true,
}: {
	neutralWrapper?: boolean;
} = {}): Record<string, unknown> {
	return {
		id: "outer-wrapper",
		name: "",
		canvas_config: neutralWrapper
			? { width: 0, height: 0 }
			: { width: 1920, height: 1080 },
		duration: neutralWrapper ? 0 : DURATION_US,
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
						source_timerange: { start: 0, duration: DURATION_US },
						target_timerange: { start: 0, duration: DURATION_US },
						speed: 1,
					},
				],
			},
		],
		materials: {
			drafts: [
				{
					id: "compound-material",
					draft: createInnerDraft(),
					draft_file_path: "##_subdraft_placeholder_##/draft_content.json",
					type: "combination",
				},
			],
			videos: [
				{
					id: "outer-video",
					type: "video",
					duration: DURATION_US,
					material_name: "Compound Clip 1",
					path: "",
				},
			],
		},
	};
}

describe("Jianying compound subdraft normalization", () => {
	it("normalizes the editable inner draft with envelope-relative bindings", () => {
		const content = createCompoundWrapper();
		const before = JSON.stringify(content);
		const normalized = normalizeRawDraft({
			content,
			source: createSource(),
			contentFileName: "draft_content.json",
		});

		expect(JSON.stringify(content)).toBe(before);
		expect(normalized.document.project).toEqual({
			id: "inner-draft",
			name: "Compound Clip 1",
			width: 1280,
			height: 720,
			fps: 30,
			durationUs: DURATION_US,
		});
		expect(normalized.document.timelines[0]).toMatchObject({
			id: "inner-draft",
			isRoot: true,
			tracks: [
				{
					id: "inner-track",
					kind: "video",
					isMain: true,
					capability: "exact",
					segments: [
						{
							id: "inner-segment",
							kind: "video",
							resourceId: "inner-video",
							capability: "exact",
						},
					],
				},
			],
		});
		expect(normalized.document.resources).toMatchObject([
			{ id: "inner-video", kind: "video", capability: "exact" },
		]);
		expect(normalized.document.issues).toEqual([]);
		expect(normalized.restrictedSourcePathsByResourceId).toEqual({
			"inner-video": "/private/calibration.mp4",
		});
		expect(normalized.bindings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					foreignRef: "inner-video",
					jsonPointer: "/materials/drafts/0/draft/materials/videos/0",
				}),
				expect.objectContaining({
					foreignRef: "inner-segment",
					jsonPointer: "/materials/drafts/0/draft/tracks/0/segments/0",
				}),
				expect.objectContaining({
					foreignRef: "inner-track",
					jsonPointer: "/materials/drafts/0/draft/tracks/0",
				}),
			])
		);
	});

	it("does not unwrap an ordinary timeline that owns a compound material", () => {
		const normalized = normalizeRawDraft({
			content: createCompoundWrapper({ neutralWrapper: false }),
			source: createSource(),
			contentFileName: "draft_content.json",
		});

		expect(normalized.document.project.id).toBe("outer-wrapper");
		expect(normalized.document.project.width).toBe(1920);
		expect(normalized.bindings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					foreignRef: "outer-video",
					jsonPointer: "/materials/videos/0",
				}),
			])
		);
		expect(normalized.bindings).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ foreignRef: "inner-video" }),
			])
		);
	});
});
