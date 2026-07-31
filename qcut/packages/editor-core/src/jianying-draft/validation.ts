import type {
	JianyingDraftContent,
	JianyingDraftIssue,
	JianyingDraftSegment,
	JianyingDraftTrack,
	JianyingTransitionMaterial,
} from "./types.js";
import { isVerifiedJianyingTransitionMaterial } from "./transition-validation.js";

function isValidTimeRange({
	timeRange,
}: {
	timeRange: { duration: number; start: number };
}): boolean {
	return (
		Number.isSafeInteger(timeRange.start) &&
		timeRange.start >= 0 &&
		Number.isSafeInteger(timeRange.duration) &&
		timeRange.duration > 0
	);
}

function collectDuplicateIdIssues({
	ids,
}: {
	ids: Array<{ id: string; label: string }>;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	const seenIds = new Set<string>();

	for (const { id, label } of ids) {
		if (seenIds.has(id)) {
			issues.push({
				code: "DUPLICATE_DRAFT_ID",
				severity: "error",
				message: `Duplicate ${label} id: ${id}`,
			});
			continue;
		}
		seenIds.add(id);
	}

	return issues;
}

function validateSegment({
	companionIds,
	materialIds,
	materialKinds,
	segment,
	track,
}: {
	companionIds: Set<string>;
	materialIds: Set<string>;
	materialKinds: Map<string, JianyingDraftTrack["type"]>;
	segment: JianyingDraftSegment;
	track: JianyingDraftTrack;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	if (!materialIds.has(segment.material_id)) {
		issues.push({
			code: "MISSING_MATERIAL_REFERENCE",
			severity: "error",
			message: `Segment ${segment.id} references missing material ${segment.material_id}.`,
		});
	}
	const materialKind = materialKinds.get(segment.material_id);
	if (materialKind !== undefined && materialKind !== track.type) {
		issues.push({
			code: "TRACK_MATERIAL_TYPE_MISMATCH",
			severity: "error",
			message: `Segment ${segment.id} uses a ${materialKind} material on a ${track.type} track.`,
			trackId: track.id,
		});
	}
	for (const referenceId of segment.extra_material_refs) {
		if (!companionIds.has(referenceId)) {
			issues.push({
				code: "MISSING_EXTRA_MATERIAL_REFERENCE",
				severity: "error",
				message: `Segment ${segment.id} references missing companion ${referenceId}.`,
			});
		}
	}
	if (
		!isValidTimeRange({ timeRange: segment.target_timerange }) ||
		!isValidTimeRange({ timeRange: segment.source_timerange })
	) {
		issues.push({
			code: "INVALID_DRAFT_TIME_RANGE",
			severity: "error",
			message: `Segment ${segment.id} has an invalid microsecond time range.`,
		});
	}
	return issues;
}

function validateTransitionMaterial({
	material,
}: {
	material: JianyingTransitionMaterial;
}): JianyingDraftIssue[] {
	if (isVerifiedJianyingTransitionMaterial({ material })) return [];
	return [
		{
			code: "UNVERIFIED_TRANSITION_MATERIAL",
			severity: "error",
			message: `Transition material ${material.id} is not in the verified native subset.`,
		},
	];
}

function validateTrackTransitionPlacement({
	materialsById,
	segments,
	track,
}: {
	materialsById: Map<string, JianyingTransitionMaterial>;
	segments: JianyingDraftSegment[];
	track: JianyingDraftTrack;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	const transitionForSegment = ({
		segment,
	}: {
		segment: JianyingDraftSegment;
	}) =>
		segment.extra_material_refs
			.map((referenceId) => materialsById.get(referenceId))
			.find((material) => material !== undefined);
	for (let index = 0; index < segments.length; index++) {
		const segment = segments[index];
		const transitionRefs = segment.extra_material_refs.filter((referenceId) =>
			materialsById.has(referenceId)
		);
		if (transitionRefs.length > 1) {
			issues.push({
				code: "INVALID_TRANSITION_PLACEMENT",
				severity: "error",
				message: `Segment ${segment.id} references more than one transition.`,
				trackId: track.id,
			});
			continue;
		}
		const transitionId = transitionRefs[0];
		if (!transitionId) continue;

		const nextSegment = segments[index + 1];
		const segmentEnd =
			segment.target_timerange.start + segment.target_timerange.duration;
		const material = materialsById.get(transitionId);
		const maximumDuration = nextSegment
			? 2 *
				Math.min(
					segment.target_timerange.duration,
					nextSegment.target_timerange.duration
				)
			: 0;
		if (
			track.type !== "video" ||
			!nextSegment ||
			nextSegment.target_timerange.start !== segmentEnd ||
			!material ||
			material.duration > maximumDuration
		) {
			issues.push({
				code: "INVALID_TRANSITION_PLACEMENT",
				severity: "error",
				message: `Transition ${transitionId} must reference a valid adjacent seam from its first segment.`,
				trackId: track.id,
			});
		}

		const previousSegment = segments[index - 1];
		const incomingTransition = previousSegment
			? transitionForSegment({ segment: previousSegment })
			: undefined;
		if (
			material &&
			incomingTransition &&
			material.duration + incomingTransition.duration >
				2 * segment.target_timerange.duration
		) {
			issues.push({
				code: "INVALID_TRANSITION_PLACEMENT",
				severity: "error",
				message: `Segment ${segment.id} is too short for its adjacent transitions.`,
				trackId: track.id,
			});
		}
	}
	return issues;
}

export function validateJianyingDraftContent({
	content,
}: {
	content: JianyingDraftContent;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	const materialIds = new Set([
		...content.materials.videos.map(({ id }) => id),
		...content.materials.audios.map(({ id }) => id),
		...content.materials.texts.map(({ id }) => id),
	]);
	const materialKinds = new Map<string, JianyingDraftTrack["type"]>([
		...content.materials.videos.map(({ id }) => [id, "video"] as const),
		...content.materials.audios.map(({ id }) => [id, "audio"] as const),
		...content.materials.texts.map(({ id }) => [id, "text"] as const),
	]);
	const speedIds = new Set(content.materials.speeds.map(({ id }) => id));
	const transitionMaterialsById = new Map(
		content.materials.transitions.map((material) => [material.id, material])
	);
	const transitionIds = new Set(transitionMaterialsById.keys());
	const companionIds = new Set([...speedIds, ...transitionIds]);
	const transitionReferenceCounts = new Map<string, number>();
	const allIds: Array<{ id: string; label: string }> = [
		{ id: content.id, label: "draft" },
		...content.materials.videos.map(({ id }) => ({
			id,
			label: "video material",
		})),
		...content.materials.audios.map(({ id }) => ({
			id,
			label: "audio material",
		})),
		...content.materials.texts.map(({ id }) => ({
			id,
			label: "text material",
		})),
		...content.materials.speeds.map(({ id }) => ({
			id,
			label: "speed material",
		})),
		...content.materials.transitions.map(({ id }) => ({
			id,
			label: "transition material",
		})),
	];
	let expectedDuration = 0;
	for (const material of content.materials.transitions) {
		issues.push(...validateTransitionMaterial({ material }));
	}

	for (let trackIndex = 0; trackIndex < content.tracks.length; trackIndex++) {
		const track = content.tracks[trackIndex];
		allIds.push({ id: track.id, label: "track" });
		const sortedSegments = [...track.segments].sort(
			(left, right) =>
				left.target_timerange.start - right.target_timerange.start
		);
		let previousEnd = 0;

		for (const segment of track.segments) {
			allIds.push({ id: segment.id, label: "segment" });
			for (const referenceId of segment.extra_material_refs) {
				if (!transitionIds.has(referenceId)) continue;
				transitionReferenceCounts.set(
					referenceId,
					(transitionReferenceCounts.get(referenceId) ?? 0) + 1
				);
			}
			issues.push(
				...validateSegment({
					companionIds,
					materialIds,
					materialKinds,
					segment,
					track,
				})
			);
			if (segment.render_index !== trackIndex) {
				issues.push({
					code: "INVALID_RENDER_INDEX",
					severity: "error",
					message: `Segment ${segment.id} render_index must equal its track index.`,
				});
			}
			expectedDuration = Math.max(
				expectedDuration,
				segment.target_timerange.start + segment.target_timerange.duration
			);
		}

		for (const segment of sortedSegments) {
			if (segment.target_timerange.start < previousEnd) {
				issues.push({
					code: "OVERLAPPING_TRACK_SEGMENTS",
					severity: "error",
					message: `Track ${track.id} contains overlapping segments.`,
					trackId: track.id,
				});
				break;
			}
			previousEnd =
				segment.target_timerange.start + segment.target_timerange.duration;
		}
		issues.push(
			...validateTrackTransitionPlacement({
				materialsById: transitionMaterialsById,
				segments: sortedSegments,
				track,
			})
		);
	}

	for (const transitionId of transitionIds) {
		const referenceCount = transitionReferenceCounts.get(transitionId) ?? 0;
		if (referenceCount === 1) continue;
		issues.push({
			code: "INVALID_TRANSITION_REFERENCE_COUNT",
			severity: "error",
			message: `Transition ${transitionId} must be referenced exactly once, found ${referenceCount}.`,
		});
	}
	if (content.duration !== expectedDuration) {
		issues.push({
			code: "INVALID_DRAFT_DURATION",
			severity: "error",
			message: `Draft duration ${content.duration} does not match ${expectedDuration}.`,
		});
	}
	issues.push(...collectDuplicateIdIssues({ ids: allIds }));
	return issues;
}
