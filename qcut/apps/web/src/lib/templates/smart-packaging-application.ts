import {
	buildSmartPackagingPlan,
	normalizeTrackOrder,
	timelinePatchFromSmartPackagingPlan,
	type BeatDetectionResult,
	type SmartPackagingBeat,
	type SmartPackagingCaption,
	type SmartPackagingOptions,
	type SmartPackagingPlan,
	type SmartPackagingShot,
	type SmartPackagingTimelinePatch,
	type SmartPackagingTimelinePatchOperation,
} from "@qcut/editor-core";
import { getTimelineElementDuration } from "@/lib/timeline";
import { TEXT_TEMPLATES } from "@/lib/text/text-template-registry";
import { generateUUID } from "@/lib/utils";
import { useBeatDetectionStore } from "@/stores/beat-detection-store";
import { collectTimelineBeats } from "@/lib/audio/timeline-beats";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useMediaStore } from "@/stores/media/media-store";
import { createTrack } from "@/stores/timeline/utils";
import {
	getVideoMediaIds,
	resolveVideoTransitionPair,
} from "@/lib/transitions/video-transition-eligibility";
import {
	clampClipTransitionDuration,
	getTransitionMaxDuration,
	type ClipTransition,
	type CaptionElement,
	type MediaElement,
	type StickerElement,
	type TextElement,
	type TimelineElement,
	type TimelineTrack,
	type TrackType,
} from "@/types/timeline";
import {
	ensureSmartPackagingAssets,
	type SmartPackagingAssetIds,
} from "./smart-packaging-assets";

export interface SmartPackagingSources {
	captions: SmartPackagingCaption[];
	beats: SmartPackagingBeat[];
	shots: SmartPackagingShot[];
}

export interface SmartPackagingAppliedCounts {
	captions: number;
	text: number;
	stickers: number;
	soundEffects: number;
	zooms: number;
	transitions: number;
}

export interface SmartPackagingTimelineResult {
	tracks: TimelineTrack[];
	patch: SmartPackagingTimelinePatch;
	appliedCounts: SmartPackagingAppliedCounts;
	createdTrackIds: string[];
}

export interface SmartPackagingEditorResult
	extends SmartPackagingTimelineResult {
	plan: SmartPackagingPlan;
}

interface SmartPackagingCanvasSize {
	width: number;
	height: number;
}

const EMPTY_APPLIED_COUNTS: SmartPackagingAppliedCounts = {
	captions: 0,
	text: 0,
	stickers: 0,
	soundEffects: 0,
	zooms: 0,
	transitions: 0,
};

const DEFAULT_CANVAS_SIZE: SmartPackagingCanvasSize = {
	width: 1920,
	height: 1080,
};

const TEXT_COLLISION_GAP = 16;
const FALLBACK_TEXT_SIZE = { width: 640, height: 180 };

function effectiveEndTime({
	element,
	fps,
}: {
	element: TimelineElement;
	fps: number;
}): number {
	return element.startTime + getTimelineElementDuration({ element, fps });
}

function rangesOverlap({
	leftStart,
	leftEnd,
	rightStart,
	rightEnd,
}: {
	leftStart: number;
	leftEnd: number;
	rightStart: number;
	rightEnd: number;
}): boolean {
	return leftStart < rightEnd - 0.0001 && rightStart < leftEnd - 0.0001;
}

function canPlaceOnTrack({
	track,
	element,
	fps,
}: {
	track: TimelineTrack;
	element: TimelineElement;
	fps: number;
}): boolean {
	const elementEnd = effectiveEndTime({ element, fps });
	return track.elements.every(
		(candidate) =>
			!rangesOverlap({
				leftStart: candidate.startTime,
				leftEnd: effectiveEndTime({ element: candidate, fps }),
				rightStart: element.startTime,
				rightEnd: elementEnd,
			})
	);
}

function placeOnGeneratedLane({
	lanes,
	trackType,
	trackName,
	element,
	fps,
}: {
	lanes: TimelineTrack[];
	trackType: TrackType;
	trackName: string;
	element: TimelineElement;
	fps: number;
}): void {
	let target = lanes.find((lane) =>
		canPlaceOnTrack({ track: lane, element, fps })
	);
	if (!target) {
		target = {
			...createTrack(trackType),
			name: `${trackName} ${lanes.length + 1}`,
		};
		lanes.push(target);
	}
	target.elements.push(element);
	target.elements.sort((left, right) => left.startTime - right.startTime);
}

function createSmartTextElement({
	action,
	canvasSize,
	occupiedTextElements,
}: {
	action: Extract<
		SmartPackagingTimelinePatchOperation,
		{ kind: "add-text-overlay" }
	>;
	canvasSize: SmartPackagingCanvasSize;
	occupiedTextElements: readonly TextElement[];
}): TextElement {
	const template =
		TEXT_TEMPLATES.find(
			(candidate) => candidate.id === action.textTemplateId
		) ?? TEXT_TEMPLATES[0];
	const characterCount = Array.from(action.text).length;
	const usesCompactLayout = characterCount > 24;
	const templateWidth = template.width ?? FALLBACK_TEXT_SIZE.width;
	const fittedWidth = usesCompactLayout
		? Math.min(
				canvasSize.width * 0.72,
				Math.max(templateWidth, canvasSize.width * 0.58)
			)
		: Math.min(templateWidth, canvasSize.width * 0.72);
	const element: TextElement = {
		...template,
		id: generateUUID(),
		name: `Smart · ${template.name}`,
		content: action.text,
		fontSize: usesCompactLayout
			? Math.min(template.fontSize, 56)
			: template.fontSize,
		curve: usesCompactLayout ? 0 : template.curve,
		width: fittedWidth,
		startTime: action.startTime,
		duration: action.duration,
		trimStart: 0,
		trimEnd: 0,
	};
	return {
		...element,
		y: selectSmartTextY({ element, canvasSize, occupiedTextElements }),
	};
}

function textPlacementCandidates({
	canvasHeight,
	elementHeight,
}: {
	canvasHeight: number;
	elementHeight: number;
}): number[] {
	const safeInset = canvasHeight * 0.08;
	const maximumOffset = Math.max(
		0,
		canvasHeight / 2 - elementHeight / 2 - safeInset
	);
	const thirdOffset = Math.min(maximumOffset, canvasHeight * 0.28);
	const edgeOffset = Math.min(maximumOffset, canvasHeight * 0.4);
	return [...new Set([-thirdOffset, thirdOffset, -edgeOffset, edgeOffset, 0])];
}

function textCollisionArea({
	left,
	right,
}: {
	left: TextElement;
	right: TextElement;
}): number {
	if (
		!rangesOverlap({
			leftStart: left.startTime,
			leftEnd: left.startTime + left.duration,
			rightStart: right.startTime,
			rightEnd: right.startTime + right.duration,
		})
	) {
		return 0;
	}

	const leftHalfWidth =
		(left.width ?? FALLBACK_TEXT_SIZE.width) / 2 + TEXT_COLLISION_GAP;
	const rightHalfWidth =
		(right.width ?? FALLBACK_TEXT_SIZE.width) / 2 + TEXT_COLLISION_GAP;
	const horizontalOverlap = Math.max(
		0,
		Math.min(left.x + leftHalfWidth, right.x + rightHalfWidth) -
			Math.max(left.x - leftHalfWidth, right.x - rightHalfWidth)
	);
	const leftHalfHeight =
		(left.height ?? FALLBACK_TEXT_SIZE.height) / 2 + TEXT_COLLISION_GAP;
	const rightHalfHeight =
		(right.height ?? FALLBACK_TEXT_SIZE.height) / 2 + TEXT_COLLISION_GAP;
	const verticalOverlap = Math.max(
		0,
		Math.min(left.y + leftHalfHeight, right.y + rightHalfHeight) -
			Math.max(left.y - leftHalfHeight, right.y - rightHalfHeight)
	);
	return horizontalOverlap * verticalOverlap;
}

function selectSmartTextY({
	element,
	canvasSize,
	occupiedTextElements,
}: {
	element: TextElement;
	canvasSize: SmartPackagingCanvasSize;
	occupiedTextElements: readonly TextElement[];
}): number {
	const candidates = textPlacementCandidates({
		canvasHeight: canvasSize.height,
		elementHeight: element.height ?? FALLBACK_TEXT_SIZE.height,
	});
	let bestCandidate = candidates[0] ?? 0;
	let bestCollisionArea = Number.POSITIVE_INFINITY;

	for (const candidate of candidates) {
		const positionedElement = { ...element, y: candidate };
		const collisionArea = occupiedTextElements.reduce(
			(total, occupied) =>
				total + textCollisionArea({ left: positionedElement, right: occupied }),
			0
		);
		if (collisionArea === 0) return candidate;
		if (collisionArea < bestCollisionArea) {
			bestCandidate = candidate;
			bestCollisionArea = collisionArea;
		}
	}

	return bestCandidate;
}

function createSmartStickerElement({
	action,
	assetIds,
	index,
}: {
	action: Extract<
		SmartPackagingTimelinePatchOperation,
		{ kind: "add-sticker" }
	>;
	assetIds: SmartPackagingAssetIds;
	index: number;
}): StickerElement {
	const id = generateUUID();
	const leftSide = index % 2 === 0;
	return {
		id,
		type: "sticker",
		name: `Smart ${action.asset.assetId}`,
		stickerId: `smart-${id}`,
		mediaId: assetIds.stickerMediaId,
		startTime: action.startTime,
		duration: action.duration,
		trimStart: 0,
		trimEnd: 0,
		x: action.x ?? (leftSide ? 18 : 82),
		y: action.y ?? (index % 3 === 2 ? 74 : 23),
		width: action.width ?? 22,
		height: action.height ?? 22,
		rotation: leftSide ? -8 : 8,
		opacity: 1,
		maintainAspectRatio: true,
	};
}

function createSmartSoundElement({
	action,
	assetIds,
}: {
	action: Extract<
		SmartPackagingTimelinePatchOperation,
		{ kind: "add-sound-effect" }
	>;
	assetIds: SmartPackagingAssetIds;
}): MediaElement {
	return {
		id: generateUUID(),
		type: "media",
		mediaId: assetIds.soundMediaId,
		name: `Smart ${action.asset.assetId}`,
		startTime: action.startTime,
		duration: action.duration,
		trimStart: 0,
		trimEnd: 0,
		volume: action.volume,
	};
}

function createSmartCaptionElement({
	action,
}: {
	action: Extract<
		SmartPackagingTimelinePatchOperation,
		{ kind: "add-caption" }
	>;
}): CaptionElement {
	return {
		id: generateUUID(),
		type: "captions",
		name: "Smart Caption",
		text: action.text,
		language: action.language,
		confidence: action.confidence,
		source: "transcription",
		startTime: action.startTime,
		duration: action.duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

function applyZoomOperations({
	tracks,
	operations,
	fps,
}: {
	tracks: TimelineTrack[];
	operations: readonly Extract<
		SmartPackagingTimelinePatchOperation,
		{ kind: "update-media-zoom" }
	>[];
	fps: number;
}): { tracks: TimelineTrack[]; appliedCount: number } {
	const operationsByElement = new Map(
		operations.map((operation) => [operation.elementId, operation])
	);
	let appliedCount = 0;
	const nextTracks = tracks.map((track) => ({
		...track,
		elements: track.elements.map((element) => {
			const operation = operationsByElement.get(element.id);
			if (
				!operation ||
				track.id !== operation.trackId ||
				element.type !== "media"
			) {
				return element;
			}
			const lastFrame = Math.max(
				1,
				Math.round(getTimelineElementDuration({ element, fps }) * fps)
			);
			appliedCount++;
			return {
				...element,
				keyframes: {
					...element.keyframes,
					scaleX: [
						{
							id: generateUUID(),
							frame: 0,
							value: operation.fromScale,
							easing: "easeInOut" as const,
						},
						{
							id: generateUUID(),
							frame: lastFrame,
							value: operation.toScale,
							easing: "easeInOut" as const,
						},
					],
					scaleY: [
						{
							id: generateUUID(),
							frame: 0,
							value: operation.fromScale,
							easing: "easeInOut" as const,
						},
						{
							id: generateUUID(),
							frame: lastFrame,
							value: operation.toScale,
							easing: "easeInOut" as const,
						},
					],
				},
			};
		}),
	}));
	return { tracks: nextTracks, appliedCount };
}

function transitionFromOperation({
	operation,
	id,
	duration,
}: {
	operation: Extract<
		SmartPackagingTimelinePatchOperation,
		{ kind: "upsert-transition" }
	>;
	id: string;
	duration: number;
}): ClipTransition {
	const isWhipPan = operation.presetId === "whip-pan-right";
	return {
		id,
		fromElementId: operation.fromElementId,
		toElementId: operation.toElementId,
		presetId: operation.presetId,
		type: isWhipPan ? "whip-pan" : "dissolve",
		duration,
		direction: isWhipPan ? "right" : undefined,
		easing: "easeInOut",
	};
}

function applyTransitionOperations({
	tracks,
	operations,
	fps,
	videoMediaIds,
}: {
	tracks: TimelineTrack[];
	operations: readonly Extract<
		SmartPackagingTimelinePatchOperation,
		{ kind: "upsert-transition" }
	>[];
	fps: number;
	videoMediaIds: ReadonlySet<string>;
}): { tracks: TimelineTrack[]; appliedCount: number } {
	let appliedCount = 0;
	const operationsByTrack = new Map<string, typeof operations>();
	for (const operation of operations) {
		const trackOperations = operationsByTrack.get(operation.trackId) ?? [];
		operationsByTrack.set(operation.trackId, [...trackOperations, operation]);
	}

	const nextTracks = tracks.map((track) => {
		const trackOperations = operationsByTrack.get(track.id);
		if (!trackOperations || track.type !== "media") return track;
		let transitions = [...(track.transitions ?? [])];
		for (const operation of trackOperations) {
			if (
				!resolveVideoTransitionPair({
					track,
					fromElementId: operation.fromElementId,
					toElementId: operation.toElementId,
					videoMediaIds,
				})
			) {
				continue;
			}
			const existing = transitions.find(
				(candidate) =>
					candidate.fromElementId === operation.fromElementId &&
					candidate.toElementId === operation.toElementId
			);
			const transitionId = existing?.id ?? generateUUID();
			const withoutExisting = transitions.filter(
				(candidate) => candidate.id !== transitionId
			);
			const maxDuration = getTransitionMaxDuration({
				track: { ...track, transitions: withoutExisting },
				fromElementId: operation.fromElementId,
				toElementId: operation.toElementId,
				transitions: withoutExisting,
				getElementDuration: ({ element }) =>
					getTimelineElementDuration({ element, fps }),
			});
			const duration = clampClipTransitionDuration({
				duration: operation.duration,
				maxDuration,
			});
			if (duration === null) continue;
			transitions = [
				...withoutExisting,
				transitionFromOperation({ operation, id: transitionId, duration }),
			];
			appliedCount++;
		}
		return { ...track, transitions };
	});
	return { tracks: nextTracks, appliedCount };
}

export function collectSmartPackagingSources({
	tracks,
	beatCache,
	fps = 30,
	videoMediaIds,
}: {
	tracks: readonly TimelineTrack[];
	beatCache: ReadonlyMap<string, BeatDetectionResult>;
	fps?: number;
	videoMediaIds: ReadonlySet<string>;
}): SmartPackagingSources {
	const captions: SmartPackagingSources["captions"] = [];
	const beats: SmartPackagingSources["beats"] = [];
	const shots: SmartPackagingSources["shots"] = [];

	for (const track of tracks) {
		for (const element of track.elements) {
			const duration = getTimelineElementDuration({ element, fps });
			if (element.type === "captions") {
				captions.push({
					id: element.id,
					text: element.text,
					startTime: element.startTime,
					duration,
				});
			}
			if (track.type === "media" && element.type === "media") {
				shots.push({
					id: element.id,
					trackId: track.id,
					elementId: element.id,
					startTime: element.startTime,
					endTime: element.startTime + duration,
					transitionEligible: videoMediaIds.has(element.mediaId),
				});
			}
		}
	}
	for (const beat of collectTimelineBeats({ beatCache, fps, tracks })) {
		beats.push({
			timestamp: beat.timestamp,
			strength: beat.strength,
			downbeat: beat.isDownbeat,
		});
	}

	return {
		captions: captions.sort((left, right) => left.startTime - right.startTime),
		beats: beats.sort((left, right) => left.timestamp - right.timestamp),
		shots: shots.sort((left, right) => left.startTime - right.startTime),
	};
}

export function previewSmartPackagingPlan({
	tracks,
	beatCache,
	options,
	fps = 30,
	videoMediaIds,
}: {
	tracks: readonly TimelineTrack[];
	beatCache: ReadonlyMap<string, BeatDetectionResult>;
	options?: Partial<SmartPackagingOptions>;
	fps?: number;
	videoMediaIds: ReadonlySet<string>;
}): SmartPackagingPlan {
	const sources = collectSmartPackagingSources({
		tracks,
		beatCache,
		fps,
		videoMediaIds,
	});
	return buildSmartPackagingPlan({ ...sources, options });
}

export function buildSmartPackagedTimeline({
	tracks,
	plan,
	assetIds,
	fps = 30,
	canvasSize = DEFAULT_CANVAS_SIZE,
	videoMediaIds,
	snapshotId = "local-smart-packaging-snapshot",
	sourceFingerprint = "local-smart-packaging",
	patchId = generateUUID(),
	createdAt = new Date().toISOString(),
}: {
	tracks: readonly TimelineTrack[];
	plan: SmartPackagingPlan;
	assetIds: SmartPackagingAssetIds;
	fps?: number;
	canvasSize?: SmartPackagingCanvasSize;
	videoMediaIds: ReadonlySet<string>;
	snapshotId?: string;
	sourceFingerprint?: string;
	patchId?: string;
	createdAt?: string;
}): SmartPackagingTimelineResult {
	const patch = timelinePatchFromSmartPackagingPlan({
		plan,
		patchId,
		snapshotId,
		sourceFingerprint,
		createdAt,
	});
	return buildSmartPackagedTimelineFromPatch({
		tracks,
		patch,
		assetIds,
		fps,
		canvasSize,
		videoMediaIds,
	});
}

export function buildSmartPackagedTimelineFromPatch({
	tracks,
	patch,
	assetIds,
	fps = 30,
	canvasSize = DEFAULT_CANVAS_SIZE,
	videoMediaIds,
}: {
	tracks: readonly TimelineTrack[];
	patch: SmartPackagingTimelinePatch;
	assetIds: SmartPackagingAssetIds;
	fps?: number;
	canvasSize?: SmartPackagingCanvasSize;
	videoMediaIds: ReadonlySet<string>;
}): SmartPackagingTimelineResult {
	const appliedCounts = { ...EMPTY_APPLIED_COUNTS };
	const captionLanes: TimelineTrack[] = [];
	const textLanes: TimelineTrack[] = [];
	const stickerLanes: TimelineTrack[] = [];
	const soundLanes: TimelineTrack[] = [];
	const occupiedTextElements = tracks.flatMap((track) =>
		track.elements.filter(
			(element): element is TextElement =>
				element.type === "text" && !element.hidden
		)
	);
	const zoomOperations = patch.operations.filter(
		(
			operation
		): operation is Extract<
			SmartPackagingTimelinePatchOperation,
			{ kind: "update-media-zoom" }
		> => operation.kind === "update-media-zoom"
	);
	const transitionOperations = patch.operations.filter(
		(
			operation
		): operation is Extract<
			SmartPackagingTimelinePatchOperation,
			{ kind: "upsert-transition" }
		> => operation.kind === "upsert-transition"
	);

	for (const action of patch.operations) {
		if (action.kind === "add-caption") {
			placeOnGeneratedLane({
				lanes: captionLanes,
				trackType: "captions",
				trackName: "Smart Captions",
				element: createSmartCaptionElement({ action }),
				fps,
			});
			appliedCounts.captions++;
		}
		if (action.kind === "add-text-overlay") {
			const element = createSmartTextElement({
				action,
				canvasSize,
				occupiedTextElements,
			});
			placeOnGeneratedLane({
				lanes: textLanes,
				trackType: "text",
				trackName: "Smart Text",
				element,
				fps,
			});
			occupiedTextElements.push(element);
			appliedCounts.text++;
		}
		if (action.kind === "add-sticker") {
			placeOnGeneratedLane({
				lanes: stickerLanes,
				trackType: "sticker",
				trackName: "Smart Stickers",
				element: createSmartStickerElement({
					action,
					assetIds,
					index: appliedCounts.stickers,
				}),
				fps,
			});
			appliedCounts.stickers++;
		}
		if (action.kind === "add-sound-effect") {
			placeOnGeneratedLane({
				lanes: soundLanes,
				trackType: "audio",
				trackName: "Smart SFX",
				element: createSmartSoundElement({ action, assetIds }),
				fps,
			});
			appliedCounts.soundEffects++;
		}
	}

	const zoomed = applyZoomOperations({
		tracks: tracks.map((track) => ({
			...track,
			elements: [...track.elements],
			transitions: track.transitions ? [...track.transitions] : undefined,
		})),
		operations: zoomOperations,
		fps,
	});
	appliedCounts.zooms = zoomed.appliedCount;
	const transitioned = applyTransitionOperations({
		tracks: zoomed.tracks,
		operations: transitionOperations,
		fps,
		videoMediaIds,
	});
	appliedCounts.transitions = transitioned.appliedCount;

	const createdTracks = [
		...captionLanes,
		...textLanes,
		...stickerLanes,
		...soundLanes,
	];
	const orderedTracks = normalizeTrackOrder({
		tracks: [
			...captionLanes,
			...textLanes,
			...stickerLanes,
			...transitioned.tracks,
			...soundLanes,
		].map((track, order) => ({ ...track, order })),
	});
	return {
		tracks: orderedTracks,
		patch,
		appliedCounts,
		createdTrackIds: createdTracks.map((track) => track.id),
	};
}

export async function applySmartPackagingToEditor({
	options,
}: {
	options?: Partial<SmartPackagingOptions>;
}): Promise<SmartPackagingEditorResult> {
	const activeProject = useProjectStore.getState().activeProject;
	if (!activeProject)
		throw new Error("Open a project before applying Smart Pack");
	const fps = activeProject.fps ?? 30;
	const timeline = useTimelineStore.getState();
	const videoMediaIds = getVideoMediaIds({
		mediaItems: useMediaStore.getState().mediaItems,
	});
	const plan = previewSmartPackagingPlan({
		tracks: timeline.tracks,
		beatCache: useBeatDetectionStore.getState().cache,
		options,
		fps,
		videoMediaIds,
	});
	if (plan.actions.length === 0) {
		throw new Error("No captions, beats, or shots are available to package");
	}

	const assetIds = await ensureSmartPackagingAssets({
		projectId: activeProject.id,
	});
	const result = buildSmartPackagedTimeline({
		tracks: useTimelineStore.getState().tracks,
		plan,
		assetIds,
		fps,
		canvasSize: activeProject.canvasSize,
		videoMediaIds,
	});
	const latestTimeline = useTimelineStore.getState();
	latestTimeline.pushHistory();
	latestTimeline.restoreTracks(result.tracks);
	await latestTimeline.saveImmediate();
	return { ...result, plan };
}
