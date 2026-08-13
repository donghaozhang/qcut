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
	InteropTransition,
} from "../../draft-interop/document.js";

const MICROSECONDS_PER_SECOND = 1_000_000;

export type QCutImportPlanTrackType = "media" | "audio" | "text";

export interface QCutImportPlanMediaElement {
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

export interface QCutImportPlanTextElement {
	id: string;
	type: "text";
	name: string;
	startTime: number;
	duration: number;
	trimStart: 0;
	trimEnd: 0;
	content: string;
	fontSize: number;
	fontFamily: string;
	color: string;
	backgroundColor: string;
	textAlign: "left" | "center" | "right";
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	textDecoration: "none" | "underline";
	x: number;
	y: number;
	rotation: number;
	opacity: number;
	letterSpacing?: number;
	width?: number;
	strokeColor?: string;
	strokeWidth?: number;
	strokeOpacity?: number;
	backgroundOpacity?: number;
	backgroundRadius?: number;
	backgroundPadding?: number;
	shadowColor?: string;
	shadowOpacity?: number;
	shadowOffsetX?: number;
	shadowOffsetY?: number;
	shadowBlur?: number;
	sourceSegmentId: string;
}

export type QCutImportPlanElement =
	| QCutImportPlanMediaElement
	| QCutImportPlanTextElement;

export interface QCutImportPlanTransition {
	id: string;
	fromElementId: string;
	toElementId: string;
	presetId: "dissolve";
	type: "dissolve";
	duration: number;
	easing: "easeInOut";
}

export interface QCutImportPlanTrack {
	id: string;
	type: QCutImportPlanTrackType;
	name: string;
	order: number;
	isMain?: boolean;
	elements: QCutImportPlanElement[];
	transitions?: QCutImportPlanTransition[];
	sourceTrackId: string;
}

export interface QCutImportSkippedNode {
	nodeId: string;
	nodeType: "track" | "segment" | "transition";
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

function mapMediaSegment({
	segment,
	resourcesById,
	skipped,
}: {
	segment: InteropSegment;
	resourcesById: Map<string, InteropResource>;
	skipped: QCutImportSkippedNode[];
}): QCutImportPlanMediaElement | null {
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

function mapTextSegment({
	segment,
	skipped,
}: {
	segment: InteropSegment;
	skipped: QCutImportSkippedNode[];
}): QCutImportPlanTextElement | null {
	if (
		segment.kind !== "text" ||
		segment.text === undefined ||
		(segment.capability !== "exact" && segment.capability !== "downgrade")
	) {
		skipped.push({
			nodeId: segment.id,
			nodeType: "segment",
			capability: segment.capability,
			reason: "text segment is outside the accepted static import subset",
		});
		return null;
	}
	const { text } = segment;
	return {
		id: segment.id,
		type: "text",
		name: text.content || segment.id,
		startTime: usToSeconds(segment.targetRange.startUs),
		duration: usToSeconds(segment.targetRange.durationUs),
		trimStart: 0,
		trimEnd: 0,
		content: text.content,
		fontSize: text.fontSizePx,
		fontFamily: text.fontFamily,
		color: text.color,
		backgroundColor: text.background?.color ?? "transparent",
		textAlign: text.textAlign,
		fontWeight: text.fontWeight,
		fontStyle: text.fontStyle,
		textDecoration: text.textDecoration,
		x: text.xPx,
		y: text.yPx,
		rotation: text.rotationDegrees,
		opacity: text.opacity,
		...(text.letterSpacingPx === undefined
			? {}
			: { letterSpacing: text.letterSpacingPx }),
		...(text.widthPx === undefined ? {} : { width: text.widthPx }),
		...(text.stroke === undefined
			? {}
			: {
					strokeColor: text.stroke.color,
					strokeWidth: text.stroke.widthPx,
					strokeOpacity: text.stroke.opacity,
				}),
		...(text.background === undefined
			? {}
			: {
					backgroundOpacity: text.background.opacity,
					backgroundRadius: text.background.radiusPx,
					backgroundPadding: text.background.paddingPx,
				}),
		...(text.shadow === undefined
			? {}
			: {
					shadowColor: text.shadow.color,
					shadowOpacity: text.shadow.opacity,
					shadowOffsetX: text.shadow.offsetXPx,
					shadowOffsetY: text.shadow.offsetYPx,
					shadowBlur: text.shadow.blurPx,
				}),
		sourceSegmentId: segment.id,
	};
}

function mapTransition({
	transition,
	importedElementIds,
	skipped,
}: {
	transition: InteropTransition;
	importedElementIds: ReadonlySet<string>;
	skipped: QCutImportSkippedNode[];
}): QCutImportPlanTransition | null {
	if (transition.capability !== "exact" || transition.type !== "dissolve") {
		skipped.push({
			nodeId: transition.id,
			nodeType: "transition",
			capability: transition.capability,
			reason: "transition is not an exact native dissolve",
		});
		return null;
	}
	if (
		!importedElementIds.has(transition.fromSegmentId) ||
		!importedElementIds.has(transition.toSegmentId)
	) {
		skipped.push({
			nodeId: transition.id,
			nodeType: "transition",
			capability: "blocked",
			reason: "transition endpoint is not imported on this track",
		});
		return null;
	}
	return {
		id: transition.id,
		fromElementId: transition.fromSegmentId,
		toElementId: transition.toSegmentId,
		presetId: "dissolve",
		type: "dissolve",
		duration: usToSeconds(transition.durationUs),
		easing: "easeInOut",
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
		track.kind === "video"
			? "media"
			: track.kind === "audio"
				? "audio"
				: track.kind === "text"
					? "text"
					: null;
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
		const element =
			type === "text"
				? mapTextSegment({ segment, skipped })
				: mapMediaSegment({ segment, resourcesById, skipped });
		if (element !== null) {
			elements.push(element);
		}
	}
	const isEmptyMainMediaTrack =
		elements.length === 0 &&
		type === "media" &&
		track.isMain === true &&
		track.segments.length === 0;
	if (elements.length === 0 && !isEmptyMainMediaTrack) {
		skipped.push({
			nodeId: track.id,
			nodeType: "track",
			capability: track.capability,
			reason: "no importable segments on this track",
		});
		return null;
	}
	const importedElementIds = new Set(elements.map((element) => element.id));
	const transitions =
		type === "media"
			? (track.transitions ?? [])
					.map((transition) =>
						mapTransition({ transition, importedElementIds, skipped })
					)
					.filter(
						(transition): transition is QCutImportPlanTransition =>
							transition !== null
					)
			: [];
	if (type !== "media") {
		for (const transition of track.transitions ?? []) {
			skipped.push({
				nodeId: transition.id,
				nodeType: "transition",
				capability: "blocked",
				reason: "visual transitions require a media track",
			});
		}
	}
	return {
		id: track.id,
		type,
		name: type === "media" ? "Video" : type === "audio" ? "Audio" : "Text",
		order: track.order,
		...(track.isMain === true ? { isMain: true } : {}),
		elements,
		...(transitions.length === 0 ? {} : { transitions }),
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
				track.elements.flatMap((element) =>
					element.type === "media" ? [element.resourceId] : []
				)
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
