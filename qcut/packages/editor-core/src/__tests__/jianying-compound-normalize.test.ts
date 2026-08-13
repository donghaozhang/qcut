import { describe, expect, it } from "vitest";
import { normalizeRawDraft } from "../jianying-draft/index.js";
import {
	createJianying113CompoundSource,
	createJianying113CompoundWrapper,
	encodeJianyingCompoundContent,
	JIANYING_COMPOUND_DURATION_US,
} from "./support/jianying-11-3-compound-fixture.js";

describe("Jianying compound subdraft normalization", () => {
	it("normalizes the editable inner draft with envelope-relative bindings", () => {
		const content = createJianying113CompoundWrapper();
		const bytes = encodeJianyingCompoundContent({ content });
		const before = JSON.stringify(content);
		const normalized = normalizeRawDraft({
			content,
			source: createJianying113CompoundSource({ bytes }),
			contentFileName: "draft_content.json",
		});

		expect(JSON.stringify(content)).toBe(before);
		expect(normalized.document.project).toEqual({
			id: "inner-draft",
			name: "Compound Clip 1",
			width: 1280,
			height: 720,
			fps: 30,
			durationUs: JIANYING_COMPOUND_DURATION_US,
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
		const content = createJianying113CompoundWrapper({
			neutralWrapper: false,
		});
		const normalized = normalizeRawDraft({
			content,
			source: createJianying113CompoundSource({
				bytes: encodeJianyingCompoundContent({ content }),
			}),
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

	it("unwraps a neutral compound whose editable timeline outgrows its instance", () => {
		const content = createJianying113CompoundWrapper({
			innerDurationUs: 8_400_000,
			wrapperDurationUs: JIANYING_COMPOUND_DURATION_US,
		});
		const normalized = normalizeRawDraft({
			content,
			source: createJianying113CompoundSource({
				bytes: encodeJianyingCompoundContent({ content }),
			}),
			contentFileName: "draft_content.json",
		});

		expect(normalized.document.project).toMatchObject({
			id: "inner-draft",
			durationUs: 8_400_000,
		});
		expect(normalized.document.timelines[0]?.tracks[0]?.segments).toHaveLength(
			1
		);
	});

	it("keeps an invalid wrapper that outlasts its inner draft opaque", () => {
		const content = createJianying113CompoundWrapper({
			innerDurationUs: 2_000_000,
			wrapperDurationUs: JIANYING_COMPOUND_DURATION_US,
		});
		const normalized = normalizeRawDraft({
			content,
			source: createJianying113CompoundSource({
				bytes: encodeJianyingCompoundContent({ content }),
			}),
			contentFileName: "draft_content.json",
		});

		expect(normalized.document.project.id).toBe("outer-wrapper");
	});
});
