/**
 * DraftInteropDocumentV1 → QCut import timeline plan (JYI-005).
 *
 * The plan is pure data in QCut vocabulary (seconds, media/audio tracks) and
 * mutates nothing — the renderer storage transaction (JYI-010) executes it.
 * Phase 1 maps only the core media subset (video/image/audio segments with
 * exact capability); every other node is listed in `skipped` with its
 * capability so inspect output can show precisely what would be lost.
 *
 * @module @qcut/editor-core/jianying-draft/import/qcut-mapping
 */

import type { InteropCapability } from "../../draft-interop/capability.js";
import type {
	DraftInteropDocumentV1,
	InteropResource,
	InteropSegment,
	InteropTrack,
} from "../../draft-interop/document.js";

const MICROSECONDS_PER_SECOND = 1_000_000;

export type QCutImportPlanTrackType = "media" | "audio";

export interface QCutImportPlanElement {
	/** Deterministic: reuses the semantic segment id. */
	id: string;
	type: "media";
	name: string;
	/** Timeline position in seconds. */
	startTime: number;
	/** Intrinsic media duration in seconds. */
	duration: number;
	trimStart: number;
	trimEnd: number;
	/** Interop resource the media element plays. */
	resourceId: string;
	speed?: number;
	sourceSegmentId: string;
}

export interface QCutImportPlanTrack {
	id: string;
	type: QCutImportPlanTrackType;
	name: string;
	order: number;
	isMain?: boolean;
	elements: QCutImportPlanElement[];
	sourceTrackId: string;
}

export interface QCutImportSkippedNode {
	nodeId: string;
	nodeType: "track" | "segment";
	capability: InteropCapability;
	reason: string;
}

export interface QCutImportTimelinePlanV1 {
	schemaVersion: 1;
	project: {
		name: string;
		width: number;
		height: number;
		fps: number;
		durationSeconds?: number;
	};
	tracks: QCutImportPlanTrack[];
	/** Interop resource ids the plan actually references. */
	resourceIds: string[];
	skipped: QCutImportSkippedNode[];
}

const IMPORTABLE_SEGMENT_KINDS = new Set(["video", "image", "audio"]);

function usToSeconds(us: number): number {
	return us / MICROSECONDS_PER_SECOND;
}

function mapSegment({
	segment,
	resourcesById,
	skipped,
}: {
	segment: InteropSegment;
	resourcesById: Map<string, InteropResource>;
	skipped: QCutImportSkippedNode[];
}): QCutImportPlanElement | null {
	if (!IMPORTABLE_SEGMENT_KINDS.has(segment.kind)) {
		skipped.push({
			nodeId: segment.id,
			nodeType: "segment",
			capability: segment.capability,
			reason: `segment kind "${segment.kind}" has no Phase 1 mapper`,
		});
		return null;
	}
	if (segment.capability !== "exact") {
		skipped.push({
			nodeId: segment.id,
			nodeType: "segment",
			capability: segment.capability,
			reason: `capability "${segment.capability}" is below the import bar`,
		});
		return null;
	}
	const resource =
		segment.resourceId === undefined
			? undefined
			: resourcesById.get(segment.resourceId);
	if (resource === undefined) {
		skipped.push({
			nodeId: segment.id,
			nodeType: "segment",
			capability: "blocked",
			reason: "segment has no resolvable media resource",
		});
		return null;
	}

	const visibleSeconds = usToSeconds(segment.targetRange.durationUs);
	const trimStart = usToSeconds(segment.sourceRange?.startUs ?? 0);
	const sourceSeconds =
		segment.sourceRange === undefined
			? visibleSeconds
			: usToSeconds(segment.sourceRange.durationUs);
	const intrinsicSeconds =
		resource.durationUs === undefined
			? trimStart + sourceSeconds
			: usToSeconds(resource.durationUs);
	const trimEnd = Math.max(0, intrinsicSeconds - trimStart - sourceSeconds);
	return {
		id: segment.id,
		type: "media",
		name: resource.name ?? segment.id,
		startTime: usToSeconds(segment.targetRange.startUs),
		duration: intrinsicSeconds,
		trimStart,
		trimEnd,
		resourceId: resource.id,
		...(segment.speed === undefined || segment.speed === 1
			? {}
			: { speed: segment.speed }),
		sourceSegmentId: segment.id,
	};
}

function mapTrack({
	track,
	resourcesById,
	skipped,
}: {
	track: InteropTrack;
	resourcesById: Map<string, InteropResource>;
	skipped: QCutImportSkippedNode[];
}): QCutImportPlanTrack | null {
	const type: QCutImportPlanTrackType | null =
		track.kind === "video" ? "media" : track.kind === "audio" ? "audio" : null;
	if (type === null) {
		skipped.push({
			nodeId: track.id,
			nodeType: "track",
			capability: track.capability,
			reason: `track kind "${track.kind}" has no Phase 1 mapper`,
		});
		// Its segments are individually skipped too, so counts stay honest.
		for (const segment of track.segments) {
			skipped.push({
				nodeId: segment.id,
				nodeType: "segment",
				capability: segment.capability,
				reason: `parent track kind "${track.kind}" has no Phase 1 mapper`,
			});
		}
		return null;
	}
	const elements: QCutImportPlanElement[] = [];
	for (const segment of track.segments) {
		const element = mapSegment({ segment, resourcesById, skipped });
		if (element !== null) {
			elements.push(element);
		}
	}
	if (elements.length === 0) {
		skipped.push({
			nodeId: track.id,
			nodeType: "track",
			capability: track.capability,
			reason: "no importable segments on this track",
		});
		return null;
	}
	return {
		id: track.id,
		type,
		name: type === "media" ? "Video" : "Audio",
		order: track.order,
		...(track.isMain === true ? { isMain: true } : {}),
		elements,
		sourceTrackId: track.id,
	};
}

/**
 * Maps the semantic document's root timeline to a QCut import plan.
 * Deterministic and side-effect free.
 */
export function mapInteropDocumentToQCutPlan({
	document,
}: {
	document: DraftInteropDocumentV1;
}): QCutImportTimelinePlanV1 {
	const root = document.timelines.find((timeline) => timeline.isRoot);
	const resourcesById = new Map(
		document.resources.map((resource) => [resource.id, resource])
	);
	const skipped: QCutImportSkippedNode[] = [];
	const tracks: QCutImportPlanTrack[] = [];
	for (const track of root?.tracks ?? []) {
		const mapped = mapTrack({ track, resourcesById, skipped });
		if (mapped !== null) {
			tracks.push(mapped);
		}
	}

	const resourceIds = [
		...new Set(
			tracks.flatMap((track) =>
				track.elements.map((element) => element.resourceId)
			)
		),
	];
	return {
		schemaVersion: 1,
		project: {
			name: document.project.name,
			width: document.project.width,
			height: document.project.height,
			fps: document.project.fps,
			...(document.project.durationUs === undefined
				? {}
				: {
						durationSeconds: usToSeconds(document.project.durationUs),
					}),
		},
		tracks,
		resourceIds,
		skipped,
	};
}
