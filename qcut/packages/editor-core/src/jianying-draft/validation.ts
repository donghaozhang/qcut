import type {
	JianyingDraftContent,
	JianyingDraftIssue,
	JianyingDraftSegment,
} from "./types.js";

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
	materialIds,
	segment,
	speedIds,
}: {
	materialIds: Set<string>;
	segment: JianyingDraftSegment;
	speedIds: Set<string>;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	if (!materialIds.has(segment.material_id)) {
		issues.push({
			code: "MISSING_MATERIAL_REFERENCE",
			severity: "error",
			message: `Segment ${segment.id} references missing material ${segment.material_id}.`,
		});
	}
	for (const referenceId of segment.extra_material_refs) {
		if (!speedIds.has(referenceId)) {
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

export function validateJianyingDraftContent({
	content,
}: {
	content: JianyingDraftContent;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	const materialIds = new Set([
		...content.materials.videos.map(({ id }) => id),
		...content.materials.audios.map(({ id }) => id),
	]);
	const speedIds = new Set(content.materials.speeds.map(({ id }) => id));
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
		...content.materials.speeds.map(({ id }) => ({
			id,
			label: "speed material",
		})),
	];
	let expectedDuration = 0;

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
			issues.push(...validateSegment({ materialIds, segment, speedIds }));
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
