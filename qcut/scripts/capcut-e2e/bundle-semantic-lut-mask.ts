import {
	getMaterialRefs,
	getMaterials,
	getRangeEvidence,
	getSegments,
	getTracks,
	type JsonRecord,
	requireBoolean,
	requireExactValue,
	requireNumber,
	requireRecord,
	requireSingle,
	requireString,
	type TimelineRangeEvidence,
} from "./bundle-semantic-json.js";

const CLIP_DURATION_US = 3_000_000;
const INVERT_LUT_BODY_LINES = [
	"LUT_3D_SIZE 2",
	"DOMAIN_MIN 0 0 0",
	"DOMAIN_MAX 1 1 1",
	"1 1 1",
	"0 1 1",
	"1 0 1",
	"0 0 1",
	"1 1 0",
	"0 1 0",
	"1 0 0",
	"0 0 0",
] as const;

export interface LutMaskSemanticEvidence {
	adjustRange: {
		durationMicroseconds: typeof CLIP_DURATION_US;
		targetStartMicroseconds: typeof CLIP_DURATION_US;
	};
	caseId: "lut-mask";
	lut: {
		cubeSize: 2;
		fullInvertValueCount: 24;
		type: "lut";
	};
	mask: {
		feather: 0;
		height: 0.65;
		invert: false;
		name: "Circle";
		resourceType: "circle";
		width: 0.65;
	};
	sourceRanges: readonly [TimelineRangeEvidence, TimelineRangeEvidence];
}

function validateInvertLutText({ lutText }: { lutText: string }): void {
	const lines = lutText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (!lines[0]?.startsWith("TITLE ")) {
		throw new Error("Generated LUT is missing its TITLE line.");
	}
	requireExactValue({
		actual: lines.slice(1),
		expected: INVERT_LUT_BODY_LINES,
		label: "Generated 2x2 invert LUT body",
	});
}

export function verifyLutMaskSemantics({
	content,
	lutText,
}: {
	content: JsonRecord;
	lutText: string;
}): LutMaskSemanticEvidence {
	validateInvertLutText({ lutText });
	const videoMaterial = requireSingle({
		label: "LUT/mask video material",
		values: getMaterials({ content, key: "videos" }),
	});
	const effect = requireSingle({
		label: "LUT effect material",
		values: getMaterials({ content, key: "effects" }),
	});
	requireExactValue({
		actual: effect.type,
		expected: "lut",
		label: "LUT effect type",
	});
	requireExactValue({
		actual: effect.value,
		expected: 1,
		label: "LUT effect intensity",
	});
	const effectId = requireString({ label: "LUT effect ID", value: effect.id });

	const mask = requireSingle({
		label: "Mask material",
		values: getMaterials({ content, key: "common_mask" }),
	});
	requireExactValue({
		actual: {
			name: mask.name,
			resourceType: mask.resource_type,
			type: mask.type,
		},
		expected: { name: "Circle", resourceType: "circle", type: "mask" },
		label: "Native mask identity",
	});
	const maskConfig = requireRecord({
		label: "Native mask config",
		value: mask.config,
	});
	const observedMask = {
		feather: requireNumber({
			label: "Mask feather",
			value: maskConfig.feather,
		}),
		height: requireNumber({ label: "Mask height", value: maskConfig.height }),
		invert: requireBoolean({ label: "Mask invert", value: maskConfig.invert }),
		name: "Circle",
		resourceType: "circle",
		width: requireNumber({ label: "Mask width", value: maskConfig.width }),
	};
	const maskEvidence = {
		feather: 0,
		height: 0.65,
		invert: false,
		name: "Circle",
		resourceType: "circle",
		width: 0.65,
	} as const;
	requireExactValue({
		actual: observedMask,
		expected: maskEvidence,
		label: "Native mask geometry",
	});

	const videoTrack = requireSingle({
		label: "LUT/mask video track",
		values: getTracks({ content, type: "video" }),
	});
	const videoSegments = getSegments({
		label: "LUT/mask video track",
		track: videoTrack,
	});
	if (videoSegments.length !== 2) {
		throw new Error("LUT/mask case must contain two video segments.");
	}
	for (const segment of videoSegments) {
		requireExactValue({
			actual: segment.material_id,
			expected: videoMaterial.id,
			label: "LUT/mask source material reference",
		});
	}
	const ranges = videoSegments.map((segment) =>
		getRangeEvidence({ segment })
	) as [TimelineRangeEvidence, TimelineRangeEvidence];
	requireExactValue({
		actual: ranges,
		expected: [
			{
				durationMicroseconds: CLIP_DURATION_US,
				sourceStartMicroseconds: 0,
				targetStartMicroseconds: 0,
			},
			{
				durationMicroseconds: CLIP_DURATION_US,
				sourceStartMicroseconds: 0,
				targetStartMicroseconds: CLIP_DURATION_US,
			},
		],
		label: "LUT/mask repeated source ranges",
	});
	const maskId = requireString({ label: "Mask material ID", value: mask.id });
	if (
		!getMaterialRefs({ segment: videoSegments[1] as JsonRecord }).includes(
			maskId
		)
	) {
		throw new Error(
			"Treated LUT/mask segment must reference the mask material."
		);
	}

	const adjustTrack = requireSingle({
		label: "LUT adjust track",
		values: getTracks({ content, type: "adjust" }),
	});
	const adjustSegment = requireSingle({
		label: "LUT adjust segment",
		values: getSegments({ label: "LUT adjust track", track: adjustTrack }),
	});
	requireExactValue({
		actual: adjustSegment.target_timerange,
		expected: { start: CLIP_DURATION_US, duration: CLIP_DURATION_US },
		label: "LUT adjust range",
	});
	if (!getMaterialRefs({ segment: adjustSegment }).includes(effectId)) {
		throw new Error(
			"LUT adjust segment must reference the generated LUT effect."
		);
	}

	return {
		adjustRange: {
			durationMicroseconds: CLIP_DURATION_US,
			targetStartMicroseconds: CLIP_DURATION_US,
		},
		caseId: "lut-mask",
		lut: { cubeSize: 2, fullInvertValueCount: 24, type: "lut" },
		mask: maskEvidence,
		sourceRanges: ranges,
	};
}
