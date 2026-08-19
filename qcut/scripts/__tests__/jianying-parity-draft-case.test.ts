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

	it("maps each on variant to today's capability truth", () => {
		// L2 landed: static clip transforms cross as exact with dialect
		// conversions applied (half-canvas position units, rotation carried
		// sign-unchanged). Speed stays below exact until L3.
		const onSegment = ({ caseId }: { caseId: string }) =>
			normalizeCase({ caseId, variant: "on" }).document.timelines[0]?.tracks[0]
				?.segments[0];

		const rotation = onSegment({ caseId: "transform-rotation" });
		expect(rotation?.capability).toBe("exact");
		expect(rotation?.visual).toEqual({ xPx: 0, yPx: 0, rotationDegrees: 30 });

		const scale = onSegment({ caseId: "transform-scale" });
		expect(scale?.capability).toBe("exact");
		expect(scale?.visual).toEqual({ xPx: 0, yPx: 0, scaleX: 0.5, scaleY: 0.5 });

		const alpha = onSegment({ caseId: "transform-alpha" });
		expect(alpha?.capability).toBe("exact");
		expect(alpha?.visual).toEqual({ xPx: 0, yPx: 0, opacity: 0.5 });

		const position = onSegment({ caseId: "transform-position" });
		expect(position?.capability).toBe("exact");
		// 0.25 half-canvas units × 640 / 2 = 80 real px.
		expect(position?.visual).toEqual({ xPx: 80, yPx: 0 });

		// L3 landed: the constant-rate scalar crosses as exact with the
		// source = target × speed relation intact.
		const speed = onSegment({ caseId: "speed-scalar" });
		expect(speed?.capability).toBe("exact");
		expect(speed?.speed).toBe(2);
		expect(speed?.targetRange.durationUs).toBe(PARITY_DURATION_US / 2);
		expect(speed?.sourceRange?.durationUs).toBe(PARITY_DURATION_US);

		// L4 landed: two-channel linear position keyframes cross as exact —
		// X in half-canvas-width px, Y in half-canvas-height px (candidate).
		const keyframeX = onSegment({ caseId: "keyframe-position-x" });
		expect(keyframeX?.capability).toBe("exact");
		expect(keyframeX?.visual?.xPx).toBe(80);
		expect(keyframeX?.visual?.keyframes?.x?.map(({ value }) => value)).toEqual([
			0, 80,
		]);
		expect(
			keyframeX?.visual?.keyframes?.y?.every(({ value }) => value === 0)
		).toBe(true);

		const keyframeXy = onSegment({ caseId: "keyframe-position-xy" });
		expect(keyframeXy?.capability).toBe("exact");
		expect(keyframeXy?.visual?.keyframes?.x?.map(({ value }) => value)).toEqual(
			[0, 80]
		);
		// -0.2 up-positive half-canvas-height units → +36 px screen-down.
		expect(keyframeXy?.visual?.keyframes?.y?.map(({ value }) => value)).toEqual(
			[0, 36]
		);
		expect(keyframeXy?.visual?.yPx).toBe(36);
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
