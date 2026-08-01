import {
	getMaterialRefs,
	getMaterials,
	getRangeEvidence,
	getSegments,
	getTracks,
	type JsonRecord,
	requireExactValue,
	requireSingle,
	requireString,
	type TimelineRangeEvidence,
} from "./bundle-semantic-json.js";

const CLIP_DURATION_US = 3_000_000;
const DISSOLVE_DURATION_US = 466_666;

export interface DissolveSemanticEvidence {
	caseId: "dissolve";
	sourceRanges: readonly [TimelineRangeEvidence, TimelineRangeEvidence];
	transition: {
		durationMicroseconds: typeof DISSOLVE_DURATION_US;
		name: "Dissolve";
		type: "transition";
	};
}

export function verifyDissolveSemantics({
	content,
}: {
	content: JsonRecord;
}): DissolveSemanticEvidence {
	const videoMaterial = requireSingle({
		label: "Dissolve video material",
		values: getMaterials({ content, key: "videos" }),
	});
	const transition = requireSingle({
		label: "Dissolve material",
		values: getMaterials({ content, key: "transitions" }),
	});
	requireExactValue({
		actual: {
			duration: transition.duration,
			name: transition.name,
			type: transition.type,
		},
		expected: {
			duration: DISSOLVE_DURATION_US,
			name: "Dissolve",
			type: "transition",
		},
		label: "Native dissolve material",
	});
	const videoTrack = requireSingle({
		label: "Dissolve video track",
		values: getTracks({ content, type: "video" }),
	});
	const segments = getSegments({
		label: "Dissolve video track",
		track: videoTrack,
	});
	if (segments.length !== 2) {
		throw new Error("Dissolve case must contain two video segments.");
	}
	for (const segment of segments) {
		requireExactValue({
			actual: segment.material_id,
			expected: videoMaterial.id,
			label: "Dissolve source material reference",
		});
	}
	const ranges = segments.map((segment) => getRangeEvidence({ segment })) as [
		TimelineRangeEvidence,
		TimelineRangeEvidence,
	];
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
				sourceStartMicroseconds: CLIP_DURATION_US,
				targetStartMicroseconds: CLIP_DURATION_US,
			},
		],
		label: "Dissolve source/target ranges",
	});
	const transitionId = requireString({
		label: "Dissolve material ID",
		value: transition.id,
	});
	if (
		!getMaterialRefs({ segment: segments[0] as JsonRecord }).includes(
			transitionId
		)
	) {
		throw new Error(
			"The first dissolve segment must reference the native transition material."
		);
	}
	return {
		caseId: "dissolve",
		sourceRanges: ranges,
		transition: {
			durationMicroseconds: DISSOLVE_DURATION_US,
			name: "Dissolve",
			type: "transition",
		},
	};
}
