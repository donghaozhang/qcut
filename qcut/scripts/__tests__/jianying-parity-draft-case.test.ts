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
const ASSET_PATH_B = "/private/parity-plate-b.mp4";

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
		assetPathB: ASSET_PATH_B,
	});
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createSource({ content }),
	});
}

describe("jianying parity draft cases (L1)", () => {
	it("every off twin normalizes to exact default video segments", () => {
		for (const parityCase of PARITY_CASES) {
			const result = normalizeCase({ caseId: parityCase.id, variant: "off" });
			const track = result.document.timelines[0]?.tracks[0];
			expect(track?.segments, parityCase.id).toHaveLength(
				parityCase.adjacentSegments ? 2 : 1
			);
			for (const segment of track?.segments ?? []) {
				expect(segment, parityCase.id).toMatchObject({
					capability: "exact",
					kind: "video",
				});
				expect(segment.targetRange.durationUs, parityCase.id).toBe(
					PARITY_DURATION_US
				);
			}
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
					assetPathB: ASSET_PATH_B,
				})
			);
			const second = JSON.stringify(
				buildParityDraftContent({
					caseId: parityCase.id,
					variant: "on",
					assetPath: ASSET_PATH,
					assetPathB: ASSET_PATH_B,
				})
			);
			expect(first, parityCase.id).toBe(second);
		}
	});

	it("keeps each on/off diff confined to the case's declared mutation", () => {
		for (const parityCase of PARITY_CASES) {
			const expectedPrefixes = EXPECTED_DIFF_PREFIXES[parityCase.id];
			expect(expectedPrefixes, parityCase.id).toBeDefined();
			const paths = diffPaths({
				left: neutralInnerDraft({ caseId: parityCase.id, variant: "on" }),
				right: neutralInnerDraft({ caseId: parityCase.id, variant: "off" }),
			});
			// The variants must differ (the feature really mutates the draft)…
			expect(paths.length, parityCase.id).toBeGreaterThan(0);
			// …and only along the declared rendering dimension — anything else
			// would break the parity receipt's single-variable isolation claim.
			for (const path of paths) {
				expect(
					expectedPrefixes?.some((prefix) => path.startsWith(prefix)),
					`${parityCase.id}: unexpected diff at ${path}`
				).toBe(true);
			}
		}
	});
});

/**
 * Allowed inner-draft diff path prefixes per case. Everything outside these
 * prefixes must be byte-identical between the on and off twins.
 */
const EXPECTED_DIFF_PREFIXES: Record<string, string[]> = {
	"transform-rotation": ["/tracks/0/segments/0/clip/rotation"],
	"transform-scale": [
		"/tracks/0/segments/0/clip/scale",
		"/tracks/0/segments/0/uniform_scale",
	],
	"transform-alpha": ["/tracks/0/segments/0/clip/alpha"],
	"transform-position": ["/tracks/0/segments/0/clip/transform"],
	"speed-scalar": [
		"/duration",
		"/materials/speeds/0/speed",
		"/tracks/0/segments/0/speed",
		"/tracks/0/segments/0/target_timerange/duration",
	],
	"keyframe-position-x": [
		"/tracks/0/segments/0/clip/transform",
		"/tracks/0/segments/0/common_keyframes",
	],
	"keyframe-position-xy": [
		"/tracks/0/segments/0/clip/transform",
		"/tracks/0/segments/0/common_keyframes",
	],
	"transition-move-left": [
		"/materials/transitions",
		"/tracks/0/segments/0/extra_material_refs",
	],
};

/**
 * Builds a variant's inner draft with the variant-encoding metadata (draft
 * id/name) neutralized, so any remaining diff is a real rendering mutation.
 */
function neutralInnerDraft({
	caseId,
	variant,
}: {
	caseId: string;
	variant: "on" | "off";
}): Record<string, unknown> {
	const content = buildParityDraftContent({
		caseId,
		variant,
		assetPath: ASSET_PATH,
		assetPathB: ASSET_PATH_B,
	});
	const materials = content.materials as {
		drafts: Array<{ draft: Record<string, unknown> }>;
	};
	const inner = { ...materials.drafts[0].draft };
	inner.id = "neutral";
	inner.name = "neutral";
	return inner;
}

/** Collects JSON-pointer-style paths where the two values differ. */
function diffPaths({
	left,
	right,
	path = "",
}: {
	left: unknown;
	right: unknown;
	path?: string;
}): string[] {
	if (Object.is(left, right)) return [];
	const bothObjects =
		typeof left === "object" &&
		typeof right === "object" &&
		left !== null &&
		right !== null &&
		Array.isArray(left) === Array.isArray(right);
	if (!bothObjects) return [path || "/"];
	const keys = new Set([
		...Object.keys(left as Record<string, unknown>),
		...Object.keys(right as Record<string, unknown>),
	]);
	const paths: string[] = [];
	for (const key of keys) {
		paths.push(
			...diffPaths({
				left: (left as Record<string, unknown>)[key],
				right: (right as Record<string, unknown>)[key],
				path: `${path}/${key}`,
			})
		);
	}
	return paths;
}
