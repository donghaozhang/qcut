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

export interface QCutImportPlanMediaKeyframe {
	id: string;
	frame: number;
	value: number;
	easing: "linear";
}

/** A fitted filter recipe applied to a media element (L6). */
export interface QCutImportPlanMediaFilter {
	presetId: string;
	presetVersion: number;
	/** QCut 0-100 intensity scale. */
	intensity: number;
}

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
	x?: number;
	y?: number;
	/** Degrees, QCut screen-clockwise convention (dialect sign already applied). */
	rotation?: number;
	scaleX?: number;
	scaleY?: number;
	opacity?: number;
	keyframes?: Partial<Record<"x" | "y", QCutImportPlanMediaKeyframe[]>>;
	filter?: QCutImportPlanMediaFilter;
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
	presetId: string;
	type: string;
	duration: number;
	easing: string;
	direction?: string;
	tuning?: { intensity?: number };
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

/**
 * A downgrade segment admitted into the plan (L0). The commit gate (JYI-001)
 * requires these warnings to be explicitly accepted before execution, so the
 * plan lists every admission with its declared approximation and evidence.
 */
export interface QCutImportPlanDowngrade {
	nodeId: string;
	nodeType: "segment" | "transition";
	approximation: string;
	fidelityEvidence: string;
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
	/** Present only when downgrade segments were admitted. */
	downgrades?: QCutImportPlanDowngrade[];
}

const IMPORTABLE_SEGMENT_KINDS = new Set(["video", "image", "audio"]);

function usToSeconds(us: number): number {
	return us / MICROSECONDS_PER_SECOND;
}

function mapMediaSegment({
	fps,
	segment,
	resourcesById,
	skipped,
	downgrades,
}: {
	fps: number;
	segment: InteropSegment;
	resourcesById: Map<string, InteropResource>;
	skipped: QCutImportSkippedNode[];
	downgrades: QCutImportPlanDowngrade[];
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
	// Admission (L0): exact crosses as-is; downgrade crosses only with an
	// explicit approximation declaration; opaque and blocked never cross.
	const downgradeDeclaration =
		segment.capability === "downgrade" ? segment.downgrade : undefined;
	if (segment.capability !== "exact" && downgradeDeclaration === undefined) {
		skipped.push({
			nodeId: segment.id,
			nodeType: "segment",
			capability: segment.capability,
			reason:
				segment.capability === "downgrade"
					? "downgrade segment carries no approximation declaration"
					: `capability "${segment.capability}" is below the import bar`,
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
	const visualKeyframes = segment.visual?.keyframes;
	// Compute frames in the integer domain: usToSeconds(t) * fps can land on
	// a near-integer (e.g. 4_100_000µs at 30fps → 122.99999999999999) and
	// falsely reject frame-aligned keyframes the beta4 mapper accepted.
	for (const keyframes of Object.values(visualKeyframes ?? {})) {
		if (
			keyframes?.some(
				({ timeOffsetUs }) =>
					!Number.isSafeInteger((timeOffsetUs * fps) / MICROSECONDS_PER_SECOND)
			)
		) {
			skipped.push({
				nodeId: segment.id,
				nodeType: "segment",
				capability: "blocked",
				reason: "visual keyframe time does not align with the QCut frame grid",
			});
			return null;
		}
	}
	const toPlanKeyframes = ({ property }: { property: "x" | "y" }) =>
		visualKeyframes?.[property]?.map((keyframe) => ({
			id: keyframe.id,
			frame: (keyframe.timeOffsetUs * fps) / MICROSECONDS_PER_SECOND,
			value: keyframe.value,
			easing: keyframe.easing,
		}));
	const xKeyframes = toPlanKeyframes({ property: "x" });
	const yKeyframes = toPlanKeyframes({ property: "y" });
	// Record the admission only for a segment that actually made the plan —
	// later guards above return null without touching `downgrades`.
	if (downgradeDeclaration !== undefined) {
		downgrades.push({
			nodeId: segment.id,
			nodeType: "segment",
			approximation: downgradeDeclaration.approximation,
			fidelityEvidence: downgradeDeclaration.fidelityEvidence,
		});
	}
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
		...(segment.visual === undefined
			? {}
			: { x: segment.visual.xPx, y: segment.visual.yPx }),
		...(segment.visual?.rotationDegrees === undefined
			? {}
			: { rotation: segment.visual.rotationDegrees }),
		...(segment.visual?.scaleX === undefined
			? {}
			: { scaleX: segment.visual.scaleX }),
		...(segment.visual?.scaleY === undefined
			? {}
			: { scaleY: segment.visual.scaleY }),
		...(segment.visual?.opacity === undefined
			? {}
			: { opacity: segment.visual.opacity }),
		...(visualKeyframes === undefined
			? {}
			: {
					keyframes: {
						...(xKeyframes === undefined ? {} : { x: xKeyframes }),
						...(yKeyframes === undefined ? {} : { y: yKeyframes }),
					},
				}),
		...(segment.filterPreset === undefined
			? {}
			: { filter: { ...segment.filterPreset } }),
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
	downgrades,
}: {
	transition: InteropTransition;
	importedElementIds: ReadonlySet<string>;
	skipped: QCutImportSkippedNode[];
	downgrades: QCutImportPlanDowngrade[];
}): QCutImportPlanTransition | null {
	// Admission (L5): the exact native dissolve crosses as-is; a catalogued
	// preset mapping crosses as a declared downgrade; everything else stays
	// skipped.
	const isExactDissolve =
		transition.capability === "exact" && transition.type === "dissolve";
	const presetDowngrade =
		transition.capability === "downgrade" &&
		transition.preset !== undefined &&
		transition.downgrade !== undefined
			? { preset: transition.preset, declaration: transition.downgrade }
			: undefined;
	if (!isExactDissolve && presetDowngrade === undefined) {
		skipped.push({
			nodeId: transition.id,
			nodeType: "transition",
			capability: transition.capability,
			reason:
				transition.capability === "downgrade"
					? "transition downgrade carries no preset mapping"
					: "transition is not an exact native dissolve",
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
	if (presetDowngrade !== undefined) {
		downgrades.push({
			nodeId: transition.id,
			nodeType: "transition",
			approximation: presetDowngrade.declaration.approximation,
			fidelityEvidence: presetDowngrade.declaration.fidelityEvidence,
		});
		const { preset } = presetDowngrade;
		return {
			id: transition.id,
			fromElementId: transition.fromSegmentId,
			toElementId: transition.toSegmentId,
			presetId: preset.presetId,
			type: preset.clipType,
			duration: usToSeconds(transition.durationUs),
			easing: preset.easing,
			...(preset.direction === undefined
				? {}
				: { direction: preset.direction }),
			...(preset.intensity === undefined
				? {}
				: { tuning: { intensity: preset.intensity } }),
		};
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
	fps,
	track,
	resourcesById,
	skipped,
	downgrades,
}: {
	fps: number;
	track: InteropTrack;
	resourcesById: Map<string, InteropResource>;
	skipped: QCutImportSkippedNode[];
	downgrades: QCutImportPlanDowngrade[];
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
				: mapMediaSegment({ fps, segment, resourcesById, skipped, downgrades });
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
						mapTransition({
							transition,
							importedElementIds,
							skipped,
							downgrades,
						})
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
	const downgrades: QCutImportPlanDowngrade[] = [];
	const tracks: QCutImportPlanTrack[] = [];
	for (const track of root?.tracks ?? []) {
		const mapped = mapTrack({
			fps: document.project.fps,
			track,
			resourcesById,
			skipped,
			downgrades,
		});
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
		...(downgrades.length === 0 ? {} : { downgrades }),
	};
}
