import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	JIANYING_11_3_BETA4_APP_VERSION,
	JIANYING_11_3_BETA4_PROFILE_ID,
	normalizeRawDraft,
} from "@qcut/editor-core/jianying-draft";
import type { DraftSourceDescriptor } from "@qcut/editor-core/jianying-draft";
import {
	buildParityDraftContent,
	PARITY_CASES,
	PARITY_DURATION_US,
} from "../jianying-parity/draft-case.js";

const ASSET_PATH = "/private/parity-plate.mp4";

function createSource({
	content,
}: {
	content: Record<string, unknown>;
}): DraftSourceDescriptor {
	const bytes = new TextEncoder().encode(JSON.stringify(content));
	return {
		appVersion: JIANYING_11_3_BETA4_APP_VERSION,
		files: [
			{
				byteLength: bytes.byteLength,
				classification: "plaintext-json",
				relativePath: "draft_content.json",
				role: "content",
				sha256: createHash("sha256").update(bytes).digest("hex"),
			},
		],
		platform: "macos",
		product: "jianying",
		profileId: JIANYING_11_3_BETA4_PROFILE_ID,
	};
}

function normalizeCase({
	caseId,
	variant,
}: {
	caseId: string;
	variant: "on" | "off";
}) {
	const content = buildParityDraftContent({
		caseId,
		variant,
		assetPath: ASSET_PATH,
	});
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createSource({ content }),
	});
}

describe("jianying parity draft cases (L1)", () => {
	it("every off twin normalizes to an exact default video segment", () => {
		for (const parityCase of PARITY_CASES) {
			const result = normalizeCase({ caseId: parityCase.id, variant: "off" });
			const track = result.document.timelines[0]?.tracks[0];
			expect(track?.segments, parityCase.id).toHaveLength(1);
			expect(track?.segments[0], parityCase.id).toMatchObject({
				capability: "exact",
				kind: "video",
			});
			expect(track?.segments[0]?.targetRange.durationUs, parityCase.id).toBe(
				PARITY_DURATION_US
			);
		}
	});

	it("every on variant leaves the verified-default fingerprint", () => {
		// Today's truth: single-variable mutations demote the segment below
		// exact. L2+ relaxations flip these expectations case by case.
		for (const parityCase of PARITY_CASES) {
			const result = normalizeCase({ caseId: parityCase.id, variant: "on" });
			const segment = result.document.timelines[0]?.tracks[0]?.segments[0];
			expect(segment, parityCase.id).toBeDefined();
			expect(segment?.capability, parityCase.id).not.toBe("exact");
		}
	});

	it("serializes deterministically for identical inputs", () => {
		for (const parityCase of PARITY_CASES) {
			const first = JSON.stringify(
				buildParityDraftContent({
					caseId: parityCase.id,
					variant: "on",
					assetPath: ASSET_PATH,
				})
			);
			const second = JSON.stringify(
				buildParityDraftContent({
					caseId: parityCase.id,
					variant: "on",
					assetPath: ASSET_PATH,
				})
			);
			expect(first, parityCase.id).toBe(second);
		}
	});

	it("keeps on and off variants byte-different in exactly one dimension", () => {
		for (const parityCase of PARITY_CASES) {
			const on = buildParityDraftContent({
				caseId: parityCase.id,
				variant: "on",
				assetPath: ASSET_PATH,
			});
			const off = buildParityDraftContent({
				caseId: parityCase.id,
				variant: "off",
				assetPath: ASSET_PATH,
			});
			expect(JSON.stringify(on), parityCase.id).not.toBe(JSON.stringify(off));
		}
	});
});
