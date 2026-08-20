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

const STICKER_MATERIAL_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const STICKER_RESOURCE_ID = "7023456789012345678";

/** Adds one sticker track with one segment to the inner draft. */
function attachStickerTrack({
	content,
	path,
}: {
	content: Record<string, unknown>;
	path?: string;
}): void {
	const inner = readInnerBeta4AdjacentDraft({ content });
	const materials = inner.materials as Record<string, unknown>;
	materials.stickers = [
		{
			category_id: "",
			category_name: "",
			id: STICKER_MATERIAL_UUID,
			name: "可爱贴纸",
			platform: "all",
			resource_id: STICKER_RESOURCE_ID,
			type: "sticker",
			...(path === undefined ? {} : { path }),
		},
	];
	const tracks = inner.tracks as Array<Record<string, unknown>>;
	tracks.push({
		id: "sticker-track",
		segments: [
			{
				extra_material_refs: [],
				id: "sticker-segment",
				material_id: STICKER_MATERIAL_UUID,
				target_timerange: { duration: 3_000_000, start: 1_000_000 },
			},
		],
		type: "sticker",
	});
}

function normalizeFixture({ content }: { content: Record<string, unknown> }) {
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createJianying113Beta4AdjacentVideoSource({ content }),
	});
}

function findStickerSegment(result: ReturnType<typeof normalizeFixture>) {
	return result.document.timelines[0]?.tracks
		.find((track) => track.kind === "sticker")
		?.segments.find((segment) => segment.id === "sticker-segment");
}

describe("Jianying 11.3 beta4 sticker segment import (L8)", () => {
	it("admits a sticker with a draft-embedded image as a declared downgrade", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachStickerTrack({
			content,
			path: "/private/draft/Resources/sticker-7023.png",
		});

		const result = normalizeFixture({ content });
		const segment = findStickerSegment(result);
		expect(segment).toMatchObject({
			capability: "downgrade",
			resourceId: STICKER_MATERIAL_UUID,
		});
		expect(segment?.downgrade?.approximation).toBe(
			`jianying-reference-sticker:${STICKER_RESOURCE_ID}`
		);
		const resource = result.document.resources.find(
			(candidate) => candidate.id === STICKER_MATERIAL_UUID
		);
		expect(resource).toMatchObject({ kind: "image" });
		expect(
			result.restrictedSourcePathsByResourceId[STICKER_MATERIAL_UUID]
		).toBe("/private/draft/Resources/sticker-7023.png");

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		const stickerTrack = plan.tracks.find((track) => track.type === "sticker");
		expect(stickerTrack?.elements[0]).toMatchObject({
			type: "sticker",
			startTime: 1,
			duration: 3,
			resourceId: STICKER_MATERIAL_UUID,
		});
		expect(plan.resourceIds).toContain(STICKER_MATERIAL_UUID);
		expect(plan.downgrades).toContainEqual({
			nodeId: "sticker-segment",
			nodeType: "segment",
			approximation: `jianying-reference-sticker:${STICKER_RESOURCE_ID}`,
			fidelityEvidence: expect.stringContaining("never redistributed"),
		});
	});

	it("keeps stickers without a stageable asset out of the plan", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachStickerTrack({ content });

		const result = normalizeFixture({ content });
		const segment = findStickerSegment(result);
		expect(segment?.capability).toBe("downgrade");
		expect(segment?.downgrade).toBeUndefined();
		expect(
			result.document.resources.some(
				(candidate) => candidate.id === STICKER_MATERIAL_UUID
			)
		).toBe(false);

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(
			plan.tracks.find((track) => track.type === "sticker")
		).toBeUndefined();
		expect(plan.downgrades).toBeUndefined();
		expect(plan.skipped).toContainEqual(
			expect.objectContaining({
				nodeId: "sticker-segment",
				capability: "downgrade",
			})
		);
	});

	it("rejects non-image sticker asset paths", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		attachStickerTrack({
			content,
			path: "/private/draft/Resources/sticker-bundle.zip",
		});

		const result = normalizeFixture({ content });
		expect(findStickerSegment(result)?.downgrade).toBeUndefined();

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(
			plan.tracks.find((track) => track.type === "sticker")
		).toBeUndefined();
	});
});
